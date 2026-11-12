"""Execute column filtering and whole-result totals across actual SQL pages."""
import unittest
import test_batch_age_lists as fixtures
import json
import re
import sqlglot


class AgingTableScope(unittest.TestCase):
    def setUp(self):
        self.f = fixtures.BatchAgeLists()
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)

    def read(self, query_id='batch-age.atomic', **filters):
        return self.f.read(agent='fc', query_id=query_id, stat_date='2026-10-22',
                           group_level='detail', **filters)

    def test_aging_queries_preserve_gateway_named_parameter_contract(self):
        config = json.loads((fixtures.ROOT / 'business/inventory-fc/sql.config.json').read_text())
        for key, query in config['queries'].items():
            if 'batch-age.' not in key:
                continue
            sql = query['request']['sql']
            self.assertNotIn('%(', sql, key)
            self.assertNotIn('DOUBLE PRECISION', sql, key)
            self.assertEqual(set(re.findall(r':(gea_p\d+)\b', sql)), set(query['request']['parameters']), key)

    def test_product_labels_cannot_multiply_inventory_or_change_paging(self):
        self.f.batch(100, 10, sku='TAGGED', kind='20')
        self.f.batch(70, 20, sku='BLANK', kind='20')
        self.f.batch(90, 5, sku='CONFLICT', kind='20')
        self.f.db.executemany('INSERT INTO agents_dim_material_prod_sales_info_d VALUES (?,?)',
                             [('TAGGED', '预下市'), ('TAGGED', '预下市'),
                              ('BLANK', ''), ('BLANK', None),
                              ('CONFLICT', '试销品'), ('CONFLICT', '次新品')])
        rows = self.read()
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]['scope_total_qty'], 35)
        self.assertEqual({r['material_code']: r['product_tag'] for r in rows},
                         {'TAGGED': '预下市', 'BLANK': None, 'CONFLICT': None})
        first = self.read(page_size=1)
        next_page = self.read(page_size=1, offset=1)
        self.assertEqual(first[0]['scope_total_qty'], next_page[0]['scope_total_qty'])
        self.assertEqual(next_page[0]['page_scope_total'], 3)
        groups = self.read(query_id='batch-age.groups')
        self.assertEqual(sum(r['total_qty'] for r in groups), 35)
        self.assertEqual({r['material_code']: r['product_tag'] for r in groups},
                         {'TAGGED': '预下市', 'BLANK': None, 'CONFLICT': None})

    def test_age_filter_scopes_rows_and_totals_to_selected_batches(self):
        self.f.batch(20, 120, sku='MIXED', kind='20')
        self.f.batch(90, 5, sku='MIXED', kind='20')
        self.f.batch(60, 7, sku='ONLY60', kind='20')
        full = self.read()
        self.assertEqual(sum(r['overaged_qty'] for r in full), 12)
        self.assertEqual(sum(r['stagnant_qty'] for r in full), 5)
        older = self.read(age_filter='90+')
        self.assertEqual(older[0]['page_scope_total'], 1)
        self.assertEqual(older[0]['total_qty'], 5)
        self.assertEqual(older[0]['scope_total_qty'], 5)
        self.assertEqual(older[0]['average_age'], 90)
        self.assertEqual(older[0]['scope_average_age'], 90)
        self.assertEqual(older[0]['scope_age90_plus'], 5)
        both = self.read(age_filter='60-90,90+')
        self.assertEqual(both[0]['scope_total_qty'], 12)
        self.assertEqual(both[0]['scope_overaged_qty'], 12)
        self.assertEqual(both[0]['scope_age90_plus'], 5)
        middle = self.read(age_filter='60-90')
        self.assertEqual(middle[0]['scope_total_qty'], 7)
        self.assertEqual(middle[0]['scope_average_age'], 60)
        self.assertEqual(full[0]['scope_total_qty'], 132)

    def test_selected_age_band_never_uses_unfiltered_warehouse_totals(self):
        self.f.batch(20, 120, sku='MIXED', kind='20')
        self.f.batch(90, 5, sku='MIXED', kind='20')
        self.f.db.execute('DROP VIEW agents_scm_warehouse_total_data_d')
        self.f.db.execute("CREATE TABLE agents_scm_warehouse_total_data_d AS SELECT 'W' AS warehouseid,'MIXED' AS material_code,'分仓' AS warehouse_name,'商品' AS material_name,999 AS live_qty,888 AS available_qty,100 AS pack_unit_qty,11 AS freeze_qty,0 AS warehouse_transfer_qty,0 AS transfer_onway_qty,0 AS transfer_prepare_qty")
        self.assertEqual(self.read()[0]['scope_total_qty'], 999)
        for family in ['atomic','groups']:
            row=self.read(query_id='batch-age.'+family,age_filter='90+')[0]
            self.assertEqual(row['total_qty'],5)
            self.assertEqual(row['available_qty'],5)
            self.assertEqual(row['pack_unit_qty'],0)
            self.assertEqual(row['freeze_qty'],0)
            if family=='atomic':self.assertEqual(row['scope_total_qty'],5)

    def test_footer_uses_all_filtered_rows_on_every_page(self):
        for i in range(13):
            self.f.batch(10, i + 1, sku=f'S{i:02}', kind='20')
        first = self.read(page_size=10)
        second = self.read(page_size=10, offset=10)
        self.assertEqual((len(first), len(second)), (10, 3))
        self.assertEqual(first[0]['scope_total_qty'], 91)
        self.assertEqual(second[0]['scope_total_qty'], 91)
        self.assertEqual(second[0]['page_scope_total'], 13)

    def test_header_text_and_numeric_filters_precede_count_paging_and_totals(self):
        self.f.batch(10, 10, sku='MATCH-1', kind='20')
        self.f.batch(70, 30, sku='MATCH-2', kind='20')
        self.f.batch(20, 100, sku='OTHER', kind='20')
        filters = {'column_material_code_contains': '%MATCH%', 'column_total_qty_min': 20}
        rows = self.read(**filters)
        self.assertEqual(rows[0]['material_code'], 'MATCH-2')
        self.assertEqual(rows[0]['scope_total_qty'], 30)
        self.assertEqual(rows[0]['page_scope_total'], 1)
        self.assertEqual(self.read(query_id='batch-age.count', **filters)[0]['total'], 1)

    def test_age_total_is_weighted_not_average_of_sku_averages(self):
        self.f.batch(10, 1, sku='A', kind='20')
        self.f.batch(100, 9, sku='B', kind='20')
        total = self.read(page_size=1)[0]
        self.assertEqual(total['scope_total_qty'], 10)
        self.assertEqual(total['scope_average_age'], 91)
        self.assertEqual(total['scope_max_age'], 100)

    def test_stock_presence_filters_count_rows_and_totals_before_paging(self):
        for i in range(13):
            self.f.batch(10, i + 1, sku=f'POS-{i:02}', kind='20')
        self.f.batch(10, 0, sku='ZERO', kind='20')
        self.f.batch(10, -2, sku='NEGATIVE', kind='20')
        positive = self.read(stock_presence='有库存', page_size=10, offset=10)
        self.assertEqual(len(positive), 3)
        self.assertEqual(positive[0]['page_scope_total'], 13)
        self.assertEqual(positive[0]['scope_total_qty'], 91)
        zero = self.read(stock_presence='无库存')
        self.assertEqual([row['material_code'] for row in zero], ['ZERO'])
        self.assertEqual(zero[0]['scope_total_qty'], 0)
        self.assertEqual(self.read(query_id='batch-age.count', stock_presence='无库存')[0]['total'], 1)
        self.assertEqual(len(self.read(query_id='batch-age.groups', stock_presence='有库存', page_size=20)), 13)
        self.assertEqual(self.read()[0]['page_scope_total'], 15)

    def test_empty_filter_has_zero_quantity_and_no_fake_age(self):
        self.f.batch(20, 10, kind='20')
        row = self.read(column_material_code_contains='%missing%')[0]
        self.assertEqual(row['page_scope_total'], 0)
        self.assertEqual(row['scope_total_qty'], 0)
        self.assertIsNone(row['scope_average_age'])

    def test_summary_table_and_source_paths_use_identical_filters_and_totals(self):
        for age, qty, sku in [(10, 10, 'MATCH-1'), (70, 30, 'MATCH-2'), (20, 100, 'OTHER'), (90, 5, 'OTHER'), (10, 0, 'ZERO')]:
            self.f.batch(age, qty, sku=sku, kind='20')
        self.f.db.executemany('INSERT INTO agents_dim_material_prod_sales_info_d VALUES (?,?)',
                             [('MATCH-2', '即将下市'), ('OTHER', '预下市')])
        query = json.loads((fixtures.ROOT / 'business/inventory-fc/sql.config.json').read_text())['queries']['snapshot.batch-age.atomic']
        tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
        fields = sorted({column.name for column in tree.find_all(sqlglot.exp.Column) if column.table == 'm'})
        self.f.db.execute('CREATE TABLE agents_inv_branch_sku_day (' + ','.join(fields) + ')')
        aliases = {'sku': 'material_code', 'category': 'product_categ_name',
                   'material_group': 'material_group_name', 'inventory_qty': 'total_qty',
                   'occupied_qty': 'pack_unit_qty', 'frozen_qty': 'freeze_qty'}
        variants = {'': 'BRANCH_AGE', '60-90': 'BRANCH_AGE:60-90',
                    '90+': 'BRANCH_AGE:90+', '60-90,90+': 'BRANCH_AGE:60+'}
        for age_filter, variant in variants.items():
            for row in self.read(age_filter=age_filter):
                if not row['page_row_present']:
                    continue
                snapshot = {field: row.get(aliases.get(field, field)) for field in fields}
                snapshot.update(inv_batch_id='fixture', inv_variant_id=variant, stock_date='2026-10-22')
                self.f.db.execute('INSERT INTO agents_inv_branch_sku_day (' + ','.join(fields) + ') VALUES (' + ','.join('?' for _ in fields) + ')', [snapshot[field] for field in fields])
        for age_filter in variants:
            for page_size, offset in [(1, 0), (1, 1), (10, 0)]:
                values = dict(age_filter=age_filter, page_size=page_size, offset=offset)
                raw = self.read(**values)
                snapshot = self.read(query_id='snapshot.batch-age.atomic', summary_batch_id='fixture', **values)
                self.assertEqual(snapshot, raw)
            for family in ['groups', 'count']:
                raw = self.read(query_id='batch-age.' + family, age_filter=age_filter)
                snapshot = self.read(query_id='snapshot.batch-age.' + family, summary_batch_id='fixture', age_filter=age_filter)
                self.assertEqual(snapshot, raw)
        filters = {'column_material_code_contains': '%MATCH%', 'column_total_qty_min': '20'}
        source = self.read(**filters)[0]
        snapshot = self.read(query_id='snapshot.batch-age.atomic', summary_batch_id='fixture', **filters)[0]
        for field in ['material_code', 'page_scope_total', *query['scopeSummaryColumns'].values()]:
            with self.subTest(field=field):
                self.assertEqual(snapshot[field], source[field])
        for mode in ['有库存', '无库存']:
            raw = self.read(stock_presence=mode)
            snapshot = self.read(query_id='snapshot.batch-age.atomic', summary_batch_id='fixture', stock_presence=mode)
            self.assertEqual([r['material_code'] for r in snapshot], [r['material_code'] for r in raw])
            self.assertEqual(snapshot[0]['page_scope_total'], raw[0]['page_scope_total'])
            self.assertEqual(snapshot[0]['scope_total_qty'], raw[0]['scope_total_qty'])
            self.assertEqual(self.read(query_id='snapshot.batch-age.count', summary_batch_id='fixture', stock_presence=mode)[0]['total'], raw[0]['page_scope_total'])
        self.f.db.execute("UPDATE agents_inv_branch_sku_day SET inventory_qty=NULL WHERE sku='ZERO'")
        unknown = self.read(query_id='snapshot.batch-age.atomic', summary_batch_id='fixture', stock_presence='无库存')[0]
        self.assertEqual(unknown['page_scope_total'], 0)


if __name__ == '__main__':
    unittest.main()
