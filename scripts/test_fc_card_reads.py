"""Compare optimized card quantities with the independently retained canonical queries."""
import json
import unittest
from pathlib import Path
import test_fc_upstream_orders

ROOT = Path(__file__).resolve().parents[1]

class CardReads(unittest.TestCase):
    def setUp(self):
        fixture = test_fc_upstream_orders.UpstreamOrders()
        fixture.setUp()
        self.db = fixture.db
        self.addCleanup(self.db.close)
        self.config = json.loads((ROOT / 'business/inventory-fc/sql.config.json').read_text())
        for field in ['live_qty', 'pack_unit_qty', 'freeze_qty']:
            self.db.execute(f'ALTER TABLE agents_scm_inventory_sku_data_d ADD {field} REAL')
        self.db.execute('UPDATE agents_scm_inventory_sku_data_d SET live_qty=available_qty+5,pack_unit_qty=3,freeze_qty=2')

    def read(self, query_id, **values):
        query = self.config['queries'][query_id]
        params = {key: values.get(spec['name'], query['request']['parameters'][key]) for key, spec in query['parameterSpec'].items()}
        return [dict(row) for row in self.db.execute(query['request']['sql'], params)]

    def assert_orders_equal(self):
        for warehouse in [None, 'BR1', 'BR2', 'missing']:
            actual = self.read('current-shortage.overview', warehouse_code=warehouse)
            for row in actual:
                row.pop('replenishment_shortage_sku_count')
            self.assertEqual(self.read('current-shortage.summary', warehouse_code=warehouse), actual)

    def test_shared_count_counts_sku_locations_not_order_lines(self):
        for warehouse, expected in [(None, 2), ('BR1', 1), ('BR2', 1), ('missing', 0)]:
            rows = self.read('current-shortage.overview', warehouse_code=warehouse)
            self.assertEqual(sum(row['replenishment_shortage_sku_count'] for row in rows), expected)

    def test_orders_keep_fifo_for_all_and_selected_warehouses(self):
        self.assert_orders_equal()

    def test_orders_keep_unknown_allocations(self):
        self.db.execute("UPDATE agents_scm_execute_detail_hourly_d SET qtyallocated=NULL WHERE fromorderno='O1'")
        self.assert_orders_equal()

    def test_orders_do_not_depend_on_unused_product_labels(self):
        self.db.executemany('INSERT INTO agents_scm_material_in_out_summary_d VALUES (?,?,?)', [('SKU','汤圆','A'), ('SKU','水饺','B')])
        self.assert_orders_equal()

    def test_snapshot_and_inventory_match_existing_aggregate_at_identical_date(self):
        for warehouse in [None, 'BR1', 'BR2', 'missing']:
            row = self.read('source.branch-stock-date', as_of='2026-11-02', warehouse_code=warehouse)[0]
            self.assertEqual(row.pop('day'), '2026-10-30')
            expected = self.read('health.inventory', stat_date='2026-10-30', warehouse_code=warehouse)[0]
            self.assertEqual(row, expected)

    def test_latest_date_is_not_changed_by_selected_warehouse(self):
        self.db.execute("UPDATE agents_scm_inventory_sku_data_d SET month_date='20261029' WHERE warehouseid='BR1'")
        row = self.read('source.branch-stock-date', as_of='2026-11-02', warehouse_code='BR1')[0]
        self.assertEqual(row['day'], '2026-10-30')
        self.assertEqual(row['row_count'], 0)
        self.assertIsNone(row['total_qty'])

    def test_no_snapshot_is_not_zero_inventory(self):
        row = self.read('source.branch-stock-date', as_of='2026-10-01')[0]
        self.assertIsNone(row['day'])
        self.assertIsNone(row['total_qty'])

if __name__ == '__main__':
    unittest.main()
