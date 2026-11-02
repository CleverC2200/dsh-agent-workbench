"""Execute the installed FC supply queries against upstream/downstream fixtures."""
import json
import re
import sqlite3
import unittest
from pathlib import Path


class UpstreamOrders(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((Path(__file__).resolve().parents[1] / 'business/inventory-fc/sql.config.json').read_text())
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.addCleanup(self.db.close)
        self.db.execute('''CREATE TABLE agents_scm_execute_detail_hourly_d (
          receive_wh TEXT, executeorderno TEXT, executeorderlineno INTEGER,
          material_code TEXT, material_name TEXT, warehouseid TEXT, belong_base TEXT,
          order_type TEXT, header_addtime TEXT, load_time TEXT,
          qtyordered REAL, qtyshipped REAL, qtysigned REAL, qtyallocated REAL,
          packingunitconvertrate REAL, packingunitmain TEXT,
          detailstatus INTEGER, orderstatus INTEGER, canceltime TEXT,
          bizflowstatus TEXT, prapare_order_status TEXT
        )''')

    def insert(self, **changes):
        row = dict(receive_wh='A230', executeorderno='SUPPLY-1', executeorderlineno=1,
                   material_code='SKU1', material_name='商品', warehouseid='N411', belong_base='郑州',
                   order_type='ZUB', header_addtime='2026-10-20 10:00:00', load_time='2026-10-30 10:00:00',
                   qtyordered=240, qtyshipped=180, qtysigned=120, qtyallocated=180,
                   packingunitconvertrate=12, packingunitmain='CS', detailstatus=10,
                   orderstatus=20, canceltime=None, bizflowstatus='提交成功', prapare_order_status='已备单')
        row.update(changes)
        self.db.execute('INSERT INTO agents_scm_execute_detail_hourly_d (' + ','.join(row) + ') VALUES (' + ','.join('?' for _ in row) + ')', list(row.values()))

    def read(self, query_id='branch-supply.summary', **changes):
        query = self.config['queries'][query_id]
        values = dict(query['request']['parameters'])
        for key, spec in query['parameterSpec'].items():
            if spec['name'] in changes:
                values[key] = changes[spec['name']]
        sql = query['request']['sql']
        sql = re.sub(r'CAST\((:gea_p\d+) AS DATE\)', r'\1', sql, flags=re.I)
        for key, value in list(values.items()):
            if isinstance(value, list):
                names = [key + '_' + str(i) for i in range(len(value))]
                sql = re.sub(':' + key + r'\b', ','.join(':' + name for name in names), sql)
                values.pop(key)
                values.update(zip(names, value))
        return [dict(row) for row in self.db.execute(sql, values)]

    def test_receiving_branch_is_used_instead_of_customer_pickup_or_sending_warehouse(self):
        self.insert()
        self.insert(executeorderno='CUSTOMER-1', warehouseid='A230', receive_wh=None, order_type='ZO11')
        self.insert(executeorderno='OTHER-BRANCH', warehouseid='A230', receive_wh='A020')
        value = self.read(warehouse_code='A230')[0]
        self.assertEqual(value['row_count'], 1)
        self.assertEqual(value['demand'], 20)
        self.assertEqual(value['shipped'], 15)
        self.assertEqual(value['pending'], 5)
        self.assertEqual(value['in_transit'], 5)
        self.assertEqual(value['fulfillment_rate'], 0.75)

    def test_cancelled_invalid_and_future_lines_are_excluded(self):
        for change in [dict(detailstatus=20), dict(orderstatus=90), dict(canceltime='2026-10-29'),
                       dict(bizflowstatus='作废'), dict(header_addtime='2026-11-01')]:
            self.insert(executeorderno=str(change), **change)
        self.assertEqual(self.read(warehouse_code='A230')[0]['row_count'], 0)

    def test_latest_cancellation_does_not_resurrect_an_older_valid_line(self):
        self.insert(load_time='2026-10-29 10:00:00')
        self.insert(orderstatus=90)
        self.assertEqual(self.read(warehouse_code='A230')[0]['row_count'], 0)

    def test_missing_quantity_is_unknown_and_never_zero_filled(self):
        self.insert(qtyshipped=None)
        value = self.read(warehouse_code='A230')[0]
        self.assertIsNone(value['shipped'])
        self.assertIsNone(value['fulfillment_rate'])
        self.assertEqual(value['missing_shipped'], 1)

    def test_latest_line_version_is_used_and_identical_duplicates_do_not_double_count(self):
        self.insert(load_time='2026-10-29 10:00:00', qtyshipped=0)
        self.insert()
        self.insert()
        value = self.read(warehouse_code='A230')[0]
        self.assertEqual(value['row_count'], 1)
        self.assertEqual(value['shipped'], 15)

    def test_conflicting_latest_versions_are_not_added_together(self):
        self.insert()
        self.insert(qtyshipped=120)
        value = self.read(warehouse_code='A230')[0]
        self.assertEqual(value['row_count'], 1)
        self.assertIsNone(value['shipped'])
        self.assertIsNone(value['fulfillment_rate'])

    def test_current_pool_retains_older_unfinished_orders_and_excludes_completed_lines(self):
        self.insert(header_addtime='2026-09-01')
        self.insert(executeorderno='DONE', qtyshipped=240, qtysigned=240)
        value = self.read(period_mode='current', warehouse_code='A230')[0]
        self.assertEqual(value['row_count'], 1)
        self.assertEqual(value['demand'], 20)

    def test_empty_authorized_result_is_zero_quantity_with_no_percentage(self):
        value = self.read(warehouse_code='A230')[0]
        self.assertEqual(value['demand'], 0)
        self.assertEqual(value['pending'], 0)
        self.assertIsNone(value['fulfillment_rate'])

    def test_detail_pagination_and_total_share_the_same_receiving_branch_pool(self):
        for n in range(12):
            self.insert(executeorderno=f'SUPPLY-{n:02}')
        self.insert(executeorderno='WRONG', receive_wh='A020')
        rows = self.read('branch-supply.detail.atomic', warehouse_code='A230', offset=10)
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row['page_scope_total'] == 12 for row in rows))
        self.assertTrue(all(row['warehouse_code'] == 'A230' for row in rows))


if __name__ == '__main__':
    unittest.main()
