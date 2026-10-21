"""No network or credentials: exercise the direct executor's read-only boundary."""
import unittest
import sqlite3
import re
import sqlglot
from unittest.mock import patch
from agent_sql import ContractError, bind, inspect, validate_parameters, Executor, direct_preview_document, config_for


class StockObservationRollupTests(unittest.TestCase):
    """An empty matched cohort must not erase sibling cohorts; missing matched values still fail closed."""

    def test_configured_rollups_keep_empty_cohorts_separate_from_missing_values(self):
        config = config_for('apsplan')
        names = [f'covered_{scope}_{measure}' for scope in ['support', 'shippable'] for measure in ['quantity', 'demand']]
        checked = set()
        for query_id, query in config['queries'].items():
            if 'COUNT(g.covered_shippable_quantity)' in query['request']['sql']:
                self.fail('old NULL-poisoning rollup remains in ' + query_id)
            tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
            for select in tree.find_all(sqlglot.exp.Select):
                projections = [e for e in select.expressions if e.alias in names and any(c.table == 'g' for c in e.find_all(sqlglot.exp.Column))]
                if len(projections) != 4:
                    continue
                checked.add(query_id)
                sql = 'SELECT ' + ', '.join(e.sql(dialect='sqlite') for e in projections) + ' FROM fixture AS g'
                with sqlite3.connect(':memory:') as db:
                    db.execute('CREATE TABLE fixture (' + ', '.join(f'covered_{scope}_{field} REAL' for scope in ['support', 'shippable'] for field in ['count', 'quantity', 'demand']) + ')')
                    for scenario, rows, expected in [
                        ('empty sibling', [(3, 30, 3), (0, None, None), (2, 20, 2)], (50, 5, 50, 5)),
                        ('zero stock', [(3, 0, 3), (0, None, None)], (0, 3, 0, 3)),
                        ('no matched records', [(0, None, None)], (0, 0, 0, 0)),
                        ('missing matched quantity', [(3, None, 3), (0, None, None)], (None, 3, None, 3)),
                        ('missing cohort count', [(None, 30, 3)], (None, None, None, None)),
                    ]:
                        with self.subTest(query=query_id, scenario=scenario):
                            db.execute('DELETE FROM fixture')
                            db.executemany('INSERT INTO fixture VALUES (?,?,?,?,?,?)', [row + row for row in rows])
                            self.assertEqual(db.execute(sql).fetchone(), expected)
        self.assertEqual(len(checked), 13)


class AccuracyBaseSqlTests(unittest.TestCase):
    """Execute configured aggregates on isolated fixtures; never contact a database."""

    def setUp(self):
        self.config = config_for('apsplan')
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.create_function('CONCAT', -1, lambda *values: ''.join(str(value) for value in values if value is not None))
        self.addCleanup(self.db.close)
        self.db.execute('CREATE TABLE agents_order_execute_isontime_mi (new_material_code TEXT, product_categ_name TEXT, pinxiang TEXT, material_group_name TEXT)')
        self.db.execute('CREATE TABLE agents_scm_material_in_out_summary_d (material_code TEXT, product_categ_name TEXT, material_group_name TEXT)')
        self.db.execute('CREATE TABLE agents_scm_demand_sales_f (source_flag TEXT, stat_month TEXT, belong_name TEXT, product_categ_name TEXT, material_group_name TEXT, material_code TEXT, region_code TEXT, province_region_code TEXT, region_name TEXT, province_region_name TEXT, material_name TEXT, plan_qty_initial REAL, plan_qty_adjusted REAL, order_qty_origin REAL, act_dl_qty REAL)')
        for source in ['基地口径', '销售口径']:
            for base, plan, actual in [('华东', 100, 100), ('郑州', 900, 0)]:
                self.insert(source, base, plan, actual)

    def insert(self, source, base, plan, actual):
        self.db.execute('INSERT INTO agents_scm_demand_sales_f VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                        (source, '2026-10-01', base, '水饺', '饺子', 'SKU1', 'R1', 'P1', '大区', '省区', '商品', plan, plan, actual, actual))

    def read(self, query_id, **values):
        query = self.config['queries'][query_id]
        inputs = {spec['name']: query['request']['parameters'][key] for key, spec in query['parameterSpec'].items()}
        inputs.update(values)
        params = validate_parameters(query, inputs, query_id)
        tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
        # Fixture dates are canonical ISO strings. SQLite's DATE cast returns a
        # year integer, unlike the production PostgreSQL/Doris DATE contract.
        for cast in list(tree.find_all(sqlglot.exp.Cast)):
            if cast.args['to'].this == sqlglot.exp.DataType.Type.DATE:
                cast.replace(cast.this.copy())
        sql = tree.sql(dialect='sqlite')
        for key, value in list(params.items()):
            if isinstance(value, list):
                names = [key + '_' + str(i) for i in range(len(value))]
                sql = re.sub(':' + key + r'\b', ', '.join(':' + name for name in names), sql)
                params.pop(key)
                params.update(zip(names, value))
        return [dict(row) for row in self.db.execute(sql, params)]

    def test_summary_and_drill_keep_base_without_changing_company_totals(self):
        for section in ['sales-accuracy', 'demand-accuracy']:
            for prefix in ['page.', 'overview.', 'drill.organization.', 'drill.product.']:
                with self.subTest(section=section, prefix=prefix):
                    rows = self.read(prefix + section)
                    self.assertEqual({row['base'] for row in rows}, {'华东', '郑州'})
                    self.assertEqual(sum(row['initial_plan'] for row in rows), 1000)
                    self.assertEqual(sum(row['initial_deviation'] for row in rows), 900)
                    count = self.read(prefix + section + '.count')
                    self.assertEqual(count, [{'total': 2}])
                    self.assertEqual(len(self.read(prefix + section, base_mode='equal', base='华东')), 1)

    def test_missing_accuracy_inputs_are_zero_before_absolute_deviation(self):
        self.db.execute('DELETE FROM agents_scm_demand_sales_f')
        self.insert('销售口径', '华东', 100, None)
        self.insert('销售口径', '郑州', None, 20)
        for prefix in ['page.', 'overview.', 'drill.organization.', 'drill.product.']:
            rows = self.read(prefix + 'demand-accuracy')
            self.assertEqual(sum(r['initial_plan'] for r in rows), 100)
            self.assertEqual(sum(r['adjusted_plan'] for r in rows), 100)
            self.assertEqual(sum(r['actual'] for r in rows), 20)
            self.assertEqual(sum(r['initial_deviation'] for r in rows), 120)
            self.assertEqual(sum(r['adjusted_deviation'] for r in rows), 120)

    def test_group_rate_is_weighted_and_base_options_match_source(self):
        company = self.read('accuracy.summary')[0]
        self.assertAlmostEqual(company['accuracy_rate'], 0.1)
        rows = self.read('accuracy.groups', group_level='base')
        self.assertEqual({row['base']: row['accuracy_rate'] for row in rows}, {'华东': 1, '郑州': 0})
        self.assertEqual(self.read('accuracy.groups_count', group_level='base'), [{'total': 2}])
        self.assertEqual({row['option_value'] for row in self.read('accuracy.options', option_field='base')}, {'华东', '郑州'})
        self.assertEqual(self.read('accuracy.options_count', option_field='base'), [{'total': 2}])

    def test_equal_and_missing_base_are_separate_and_paging_requeries_ten(self):
        self.insert('销售口径', '  ', 20, 20)
        missing = self.read('accuracy.detail', source_flag='销售口径', base_mode='missing')
        self.assertEqual(len(missing), 1)
        self.assertIsNone(missing[0]['base'])
        self.assertEqual(self.read('accuracy.count', source_flag='销售口径', base_mode='equal', base='华东'), [{'total': 1}])
        for n in range(12):
            self.insert('销售口径', '测试基地' + str(n).zfill(2), 1, 1)
        first = self.read('page.sales-accuracy')
        second = self.read('page.sales-accuracy', offset=10)
        self.assertEqual(len(first), 10)
        self.assertEqual(len(second), 5)
        self.assertTrue({row['base'] for row in first}.isdisjoint(row['base'] for row in second))


class BudgetPerformanceSqlTests(unittest.TestCase):
    read = AccuracyBaseSqlTests.read

    def setUp(self):
        self.config = config_for('apsplan')
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.addCleanup(self.db.close)
        self.db.execute('CREATE TABLE agents_scm_cust_plan_order_analysis_d (month TEXT, create_date TEXT, cust_code TEXT, material_code TEXT, simulation_need_mny REAL)')
        self.db.execute('CREATE TABLE agents_scm_cust_deliv_daily_di (act_ship_date TEXT, cust_code TEXT, material_code TEXT, income_excl_tax_local REAL)')
        self.db.executemany('INSERT INTO agents_scm_cust_plan_order_analysis_d VALUES (?,?,?,?,?)', [('202610', '2026-10-19', ' A ', 'S1', 100), ('202610', '2026-10-20', 'A', 'S1', 200), ('202610', '2026-10-21', 'A', 'S1', 999)])
        self.db.executemany('INSERT INTO agents_scm_cust_deliv_daily_di VALUES (?,?,?,?)', [('20261018', 'A', 'S1', 30), ('20261019', 'A', 'S1', 50), ('20261021', 'A', 'S1', 999)])

    def test_daily_income_does_not_multiply_budget_and_cutoff_excludes_future(self):
        row = self.read('page.budget-performance')[0]
        self.assertEqual((row['matched_budget'], row['matched_income'], row['matched_keys']), (200, 80, 1))
        self.assertEqual((row['budget_date'], row['source_date']), ('2026-10-20', '20261019'))
        self.assertEqual((row['actual'], row['budget']), (80, 200))
        self.assertEqual(self.read('page.budget-performance.count'), [{'total': 1}])
        previous = self.read('page.budget-performance', as_of='2026-10-19', end_exclusive='20261020')[0]
        self.assertEqual(previous['budget'], 100)

    def test_missing_numbers_preserve_known_totals_and_duplicates_remain_diagnosed(self):
        self.db.execute("INSERT INTO agents_scm_cust_plan_order_analysis_d VALUES ('202610','2026-10-20','B','S2',NULL)")
        self.db.execute("INSERT INTO agents_scm_cust_deliv_daily_di VALUES ('20261019','B','S2',NULL)")
        row = self.read('page.budget-performance')[0]
        self.assertEqual((row['actual'], row['budget']), (80, 200))
        self.assertEqual((row['missing_budget_keys'], row['missing_income_records'], row['matched_keys']), (1, 1, 1))
        self.db.execute("INSERT INTO agents_scm_cust_plan_order_analysis_d VALUES ('202610','2026-10-20','A','S1',200)")
        row = self.read('page.budget-performance')[0]
        self.assertEqual(row['matched_keys'], 0)
        self.assertIsNone(row['matched_budget'])

    def test_matching_requires_both_customer_and_sku_and_preserves_returns(self):
        self.db.executemany('INSERT INTO agents_scm_cust_deliv_daily_di VALUES (?,?,?,?)', [('20261019', 'A', 'S1', -5), ('20261019', 'B', 'S1', 300), ('20261019', 'A', 'S2', 400)])
        row = self.read('page.budget-performance')[0]
        self.assertEqual(row['matched_income'], 75)
        self.assertEqual(row['actual'], 775)
        self.assertEqual(row['income_keys'], 3)

    def test_default_ten_month_rows_and_offset_requery(self):
        self.db.execute('DELETE FROM agents_scm_cust_plan_order_analysis_d')
        self.db.execute('DELETE FROM agents_scm_cust_deliv_daily_di')
        for month in range(1,13):
            self.db.execute('INSERT INTO agents_scm_cust_plan_order_analysis_d VALUES (?,?,?,?,?)', (f'2026{month:02d}', f'2026-{month:02d}-01', 'A', 'S1', 100))
        values = dict(start_month='202601', end_month_exclusive='202701', as_of='2026-12-31', start='20260101', end_exclusive='20270101')
        first = self.read('page.budget-performance', **values)
        second = self.read('page.budget-performance', **values, offset=10)
        self.assertEqual((len(first), len(second)), (10,2))
        self.assertTrue({r['month'] for r in first}.isdisjoint(r['month'] for r in second))


class BranchOrderCountTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:'); self.db.row_factory = sqlite3.Row
        self.addCleanup(self.db.close)
        self.db.execute('CREATE TABLE filtered (from_order TEXT, sku TEXT, shortage REAL, ordered REAL, demand REAL, shipped REAL, shipped_order_quantity REAL, invalid INTEGER, source_occupied REAL)')
        query = config_for('fc')['queries']['orders.summary']['request']['sql']
        self.sql = 'SELECT ' + query.rsplit(' SELECT ', 1)[1]

    def insert(self, order, sku, shortage, invalid=0):
        self.db.execute('INSERT INTO filtered VALUES (?,?,?,?,?,?,?,?,?)', (order, sku, shortage, 10, 10, 10, 10, invalid, 10))

    def result(self):
        return dict(self.db.execute(self.sql).fetchone())

    def test_monthly_counts_are_distinct_and_not_detail_row_counts(self):
        self.insert(' A ', 'S1', 1); self.insert('A', 'S1', 2); self.insert('B', 'S2', 0); self.insert('C', 'S3', 3)
        row = self.result()
        self.assertEqual((row['row_count'], row['from_order_count'], row['affected_from_order_count'], row['shortage_sku_count']), (4,3,2,2))

    def test_missing_identity_or_invalid_shortage_never_becomes_zero_skus(self):
        for sku, shortage, invalid in [(' ', 2, 0), ('S1', None, 0), ('S1', -1, 1), ('S1', 20, 1)]:
            self.db.execute('DELETE FROM filtered'); self.insert(None, sku, shortage, invalid)
            row = self.result()
            self.assertIsNone(row['shortage_sku_count']); self.assertEqual(row['missing_order_identity'], 1)

    def test_known_empty_or_no_shortage_preserves_zero(self):
        self.assertEqual(self.result()['shortage_sku_count'], 0)
        self.insert('A', 'S1', 0)
        self.assertEqual(self.result()['shortage_sku_count'], 0)


class DatedFactoryShipmentTests(unittest.TestCase):
    read = AccuracyBaseSqlTests.read

    def setUp(self):
        self.config = config_for('qll')
        self.db = sqlite3.connect(':memory:'); self.db.row_factory = sqlite3.Row
        self.addCleanup(self.db.close)
        self.db.execute('CREATE TABLE agents_scm_cust_deliv_daily_di (belong_base TEXT,material_code TEXT,material_name TEXT,product_categ_name TEXT,act_ship_date TEXT,act_dl_qty REAL,plant_flag TEXT)')
        self.db.executemany('INSERT INTO agents_scm_cust_deliv_daily_di VALUES (?,?,?,?,?,?,?)', [
            ('华东','S1','商品','品类','20261010',100,'工厂'), ('华东','S1','商品','品类','20261011',-5,'工厂'),
            ('华东','S2','商品2','品类','20260925',20,'工厂'), ('华东','S1','商品','品类','20261021',900,'工厂'),
            ('华东','S1','商品','品类','20261010',700,'分仓'), (None,'S3','商品3','品类','20261010',30,'工厂')])

    def test_month_and_rolling_signed_quantities_do_not_double_count_branch_or_future(self):
        for agent in ['aqkc','fc','qll','apsplan']:
            self.config=config_for(agent); row=self.read('base_shipments.summary')[0]
            self.assertEqual((row['month_ship_positive'],row['month_ship_net'],row['month_ship_negative']), (130,125,5))
            self.assertEqual((row['rolling_ship_positive'],row['rolling_ship_net']), (150,145))
            self.assertEqual(row['unknown_base_records'],1)
            self.assertEqual(self.read('base_shipments.count'),[{'total':3}])

    def test_absent_month_null_amount_zero_and_unknown_base_have_distinct_meanings(self):
        rows=self.read('base_shipments.detail'); bysku={x['sku']:x for x in rows}
        self.assertIsNone(bysku['S2']['month_ship_positive'])
        self.db.execute("INSERT INTO agents_scm_cust_deliv_daily_di VALUES ('华东','S1','商品','品类','20261012',NULL,'工厂')")
        self.assertIsNone(self.read('base_shipments.summary')[0]['month_ship_net'])
        self.db.execute("INSERT INTO agents_scm_cust_deliv_daily_di VALUES ('华东','ZERO','零商品','品类','20261012',0,'工厂')")
        self.assertEqual(self.read('base_shipments.detail',sku='ZERO')[0]['month_ship_positive'],0)

    def test_base_scope_is_explicit_and_ten_row_pages_requery_offset(self):
        filtered=self.read('base_shipments.summary',bases_enabled=True,bases=['华东'])[0]
        self.assertEqual((filtered['month_ship_positive'],filtered['unknown_base_records']), (100,0))
        for n in range(12):
            self.db.execute('INSERT INTO agents_scm_cust_deliv_daily_di VALUES (?,?,?,?,?,?,?)', ('华东',f'X{n:02d}','商品','品类','20261010',1,'工厂'))
        first=self.read('base_shipments.detail');second=self.read('base_shipments.detail',offset=10)
        self.assertEqual((len(first),len(second)),(10,5));self.assertTrue({(x['base'],x['sku']) for x in first}.isdisjoint({(x['base'],x['sku']) for x in second}))


class PartialWarehouseHealthTests(unittest.TestCase):
    def test_known_quantities_do_not_replace_incomplete_totals(self):
        for agent in ['aqkc','fc','qll','apsplan']:
            q=config_for(agent)['queries']['health.summary']['request']['sql']
            sql='SELECT '+q.rsplit(' SELECT ',1)[1]
            columns=sorted(set(re.findall(r'r\.([a-z_]+)',sql)))
            db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
            try:
                db.execute('CREATE TABLE filtered ('+', '.join(k+' REAL' for k in columns)+')')
                for available in [20,None]:
                    values={k:0 for k in columns}; values.update(total_qty=50,available_qty=available,pack_unit_qty=0,freeze_qty=0,source_rows=1)
                    db.execute('INSERT INTO filtered VALUES ('+','.join('?' for _ in columns)+')',[values[k] for k in columns])
                row=dict(db.execute(sql).fetchone())
                self.assertIsNone(row['available_qty']);self.assertEqual(row['known_available_qty'],20);self.assertEqual(row['known_available_qty_count'],1)
                self.assertEqual(row['known_pack_unit_qty'],0);self.assertEqual(row['known_pack_unit_qty_count'],2)
            finally:db.close()


class ReadOnlySqlTests(unittest.TestCase):
    def test_direct_catalog_is_shared_by_pages_and_expires_without_caching_results(self):
        executor = Executor('/unused')
        catalog = {'source': {'code'}}
        with patch.object(executor, 'schema', return_value=catalog) as scan:
            first = executor.query_schema(object())
            second = executor.query_schema(object())
            self.assertEqual(first, second)
            self.assertEqual(scan.call_count, 1)
            with patch('agent_sql.time.monotonic', return_value=10**20):
                executor.query_schema(object())
            self.assertEqual(scan.call_count, 2)

    def test_parsed_syntax_reuse_still_checks_schema_and_parameter_shape_on_every_call(self):
        sql = 'SELECT t.code AS cached_code FROM parser_cache_probe AS t WHERE t.code=:gea_p1'
        with patch('agent_sql.sqlglot.parse', wraps=sqlglot.parse) as parse:
            first = inspect(sql, {'gea_p1': 'A'}, {'parser_cache_probe': {'code'}})
            second = inspect(sql, {'gea_p1': 'B'}, {'parser_cache_probe': {'code'}})
            self.assertIsNot(first, second)
            first.expressions[0].set('alias', sqlglot.exp.to_identifier('changed_by_caller'))
            self.assertEqual(inspect(sql, {'gea_p1': 'C'}, {'parser_cache_probe': {'code'}}).named_selects, ['cached_code'])
            with self.assertRaises(ContractError):
                inspect(sql, {'gea_p1': 'B'}, {'parser_cache_probe': {'other'}})
            with self.assertRaises(ContractError):
                inspect(sql, {'gea_p1': ['B']}, {'parser_cache_probe': {'code'}})
            self.assertEqual(parse.call_count, 1)

    def test_target_month_and_inventory_month_are_separate_only_when_explicitly_configured(self):
        query = config_for('aqkc')['queries']['page.base-stock']
        values = {spec['name']: query['request']['parameters'][key] for key, spec in query['parameterSpec'].items()}
        values.update(month='2026-11-01', stock_month='2026-10-01', stock_date='2026-10-14')
        validate_parameters(query, values)
        values['stock_month'] = '2026-11-01'
        with self.assertRaises(ContractError):
            validate_parameters(query, values)

    def test_loopback_preview_changes_only_meta_network_scope(self):
        document = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; connect-src \'none\'"><script>const original="connect-src \'none\'";</script>'
        preview = direct_preview_document(document)
        self.assertIn("default-src 'none'; connect-src 'self'", preview)
        self.assertIn('const original="connect-src \'none\'"', preview)
        self.assertIn("connect-src 'none'", document)

    def test_values_never_become_sql_text(self):
        value = "x'); DROP TABLE t; --"
        sql, parameters = bind('SELECT t.code AS code FROM source AS t WHERE t.code=:gea_p1', {'gea_p1': value})
        self.assertNotIn(value, sql)
        self.assertEqual(parameters['gea_p1'], value)

    def test_collection_is_bound_and_quoted_placeholders_are_not_rewritten(self):
        sql, values = bind("SELECT ':gea_p1' AS literal FROM source AS t WHERE t.code IN (:gea_p1)", {'gea_p1': ['01', '02']})
        self.assertIn("':gea_p1'", sql)
        self.assertIn('%(gea_p1_0)s, %(gea_p1_1)s', sql)
        self.assertEqual(values, {'gea_p1_0': '01', 'gea_p1_1': '02'})

    def test_no_statement_can_write_or_expand_unknown_resources(self):
        for sql in (
            'DELETE FROM source',
            'SELECT t.code AS code FROM source AS t; DELETE FROM source',
            'WITH changed AS (DELETE FROM source RETURNING code) SELECT changed.code AS code FROM changed AS changed',
            'SELECT t.code AS code FROM private.source AS t',
            'SELECT t.secret AS secret FROM source AS t',
            'SELECT dangerous(t.code) AS value FROM source AS t',
            'SELECT t.* FROM source AS t',
        ):
            with self.subTest(sql=sql), self.assertRaises(ContractError):
                inspect(sql, {}, {'source': {'code'}})

    def test_scope_separator_literal_is_not_a_postgres_cast_or_keyword(self):
        inspect("SELECT CONCAT(t.code, '::RECURSIVE USING') AS code FROM source AS t", {}, {'source': {'code'}})
        with self.assertRaises(ContractError):
            inspect('SELECT t.code::text AS code FROM source AS t', {}, {'source': {'code'}})

    def test_only_published_subset_shape_is_allowed(self):
        tree = inspect('SELECT t.code AS code, COUNT(*) AS total FROM source AS t GROUP BY t.code', {}, {'source': {'code'}})
        self.assertEqual(tree.named_selects, ['code', 'total'])

    def test_parameter_contract_rejects_sql_and_invalid_calendar_dates(self):
        query = {'parameterSpec': {'gea_p1': {'name': 'day', 'type': 'string', 'format': 'YYYY-MM-DD', 'nullable': False}}}
        for values in ({'day': '2026-02-30'}, {'day': '2026-10-15', 'sql': 'SELECT 1'}):
            with self.assertRaises(ContractError):
                validate_parameters(query, values)

    def test_unknown_query_fails_before_connecting(self):
        executor = Executor('/path/that/must/not/be/read')
        with self.assertRaises(ContractError) as error:
            executor.execute('dealer', '__unknown__', {})
        self.assertEqual(error.exception.code, 'QUERY_NOT_REGISTERED')


class FcReplenishmentCoverageTests(unittest.TestCase):
    """Execute the shipped config against independent inventory/plan/shipment grains."""
    def setUp(self):
        self.config = config_for('fc')
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        tables = {
            'agents_dim_product_list_mi': 'material_code material_name product_item_name',
            'agents_scm_inventory_sku_data_d': 'warehouseid material_code prod_date sap_warehouseid plant quality_batch is_good_prod live_qty available_qty pack_unit_qty freeze_qty warehouse_classify unrestricted_qty month_date',
            'agents_scm_warehouse_transfer_plan_data_d': 'warehouse_code material_code warehouse_name material_name product_categ_name future30_avg_plan warehouse_month_out_plan warehouse_future30_qty warehouse_transfer_qty transfer_onway_qty transfer_prepare_qty plan_month snapshot_date plan_version plan_source warehouse_month_transfer_plan manual_month_out_plan manual_month_transfer_plan plan_qty_unit manual_out_source_record_id manual_transfer_source_record_id manual_plan_version manual_plan_source manual_tenant_code manual_confirmed_at',
            'agents_scm_cust_deliv_daily_di': 'warehouse material_code material_name material_group_name product_categ_name act_ship_date act_dl_qty warehouse_classify belong_base',
            'agents_scm_material_in_out_summary_d': 'warehouseid material_code material_name material_group_name warehouse_name product_categ_name',
        }
        numeric = set('live_qty unrestricted_qty is_overaged overaged_qty total_qty available_qty pack_unit_qty freeze_qty is_low_stock is_high_stock safe_stock_qty target_stock_qty current_stock age_days future30_avg_plan warehouse_month_out_plan warehouse_future30_qty warehouse_transfer_qty transfer_onway_qty transfer_prepare_qty warehouse_month_transfer_plan manual_month_out_plan manual_month_transfer_plan act_dl_qty'.split())
        for name, columns in tables.items():
            self.db.execute('CREATE TABLE '+name+' ('+', '.join(field+(' REAL' if field in numeric else ' TEXT') for field in columns.split())+')')
        self.addCleanup(self.db.close)
        self.insert('agents_scm_warehouse_transfer_plan_data_d', warehouse_code='WH1', material_code='S1', warehouse_name='分仓1', material_name='商品1', future30_avg_plan=10, warehouse_month_out_plan=310, warehouse_future30_qty=300, warehouse_transfer_qty=40, transfer_onway_qty=20, transfer_prepare_qty=20, plan_month='2026-10-01', snapshot_date='2026-10-19', plan_version='v1', plan_qty_unit='箱')
        for sku, stock, available, kind in [('S1',50,25,'分仓'),('S2',80,60,'分仓'),('BASE',999,999,'基地仓')]:
            self.insert('agents_scm_inventory_sku_data_d',month_date='20261019',warehouseid='WH1',material_code=sku,prod_date='2026-09-30',warehouse_classify='20' if kind=='分仓' else '01',live_qty=stock,available_qty=available,pack_unit_qty=0,freeze_qty=0)
        for sku, amount in [('S1',30),('S2',60)]:
            self.insert('agents_scm_cust_deliv_daily_di',warehouse='WH1',material_code=sku,material_name='商品'+sku,warehouse_classify='20',act_ship_date='20261010',act_dl_qty=amount)

    def insert(self, table, **values):
        self.db.execute('INSERT INTO '+table+' ('+', '.join(values)+') VALUES ('+', '.join('?' for _ in values)+')',list(values.values()))

    def read(self, name, **overrides):
        query = self.config['queries'][name]
        values = {s['name']:query['request']['parameters'][k] for k,s in query['parameterSpec'].items()}
        values.update(stat_date='2026-10-19',as_of='2026-10-20',month='2026-10-01',days_in_month=31,shipment_start='20260921',shipment_month_start='20261001',rolling_start='20260921',shipment_end_exclusive='20261021')
        values.update(overrides)
        values = {s['name']:values[s['name']] for s in query['parameterSpec'].values()}
        params = validate_parameters(query,values,name)
        tree = sqlglot.parse_one(query['request']['sql'],read='postgres')
        for cast in list(tree.find_all(sqlglot.exp.Cast)):
            if cast.args['to'].this == sqlglot.exp.DataType.Type.DATE:
                cast.replace(cast.this.copy())
        sql = tree.sql(dialect='sqlite')
        for key, value in list(params.items()):
            if isinstance(value, list):
                names = [key + '_' + str(i) for i in range(len(value))]
                sql = re.sub(':' + key + r'\b', ', '.join(':' + item for item in names), sql)
                params.pop(key)
                params.update(zip(names, value))
        return [dict(row) for row in self.db.execute(sql,params)]

    def test_batch_stock_sums_every_batch_and_ignores_other_warehouse_classes(self):
        self.insert('agents_scm_inventory_sku_data_d',month_date='20261019',warehouseid='WH1',material_code='S1',prod_date='2026-08-30',warehouse_classify='20',live_qty=10,available_qty=5,pack_unit_qty=5,freeze_qty=0)
        for kind in ['03','04']:
            self.insert('agents_scm_inventory_sku_data_d',month_date='20261019',warehouseid='IGNORED',material_code='IGNORE'+kind,prod_date='2020-01-01',warehouse_classify=kind,live_qty=99999,available_qty=99999)
        rows=self.read('replenishment.detail');by_sku={x['sku']:x for x in rows}
        self.assertEqual(set(by_sku),{'S1','S2'})
        self.assertEqual((by_sku['S1']['inventory_qty'],by_sku['S1']['available_qty']),(60,30))
        self.assertEqual(self.read('health.summary')[0]['max_age'],50)
        self.assertEqual(self.read('health.summary')[0]['duplicate_keys'],0)

    def test_batch_base_classes_and_positive_stock_age_follow_the_calendar(self):
        import datetime
        self.insert('agents_scm_inventory_sku_data_d',month_date='20261019',warehouseid='BASE2',material_code='B2',prod_date='2024-02-29',warehouse_classify='02',live_qty=10,available_qty=10)
        self.insert('agents_scm_inventory_sku_data_d',month_date='20261019',warehouseid='BASE2',material_code='B2',prod_date='2020-01-01',warehouse_classify='02',live_qty=0,available_qty=0)
        self.insert('agents_scm_inventory_sku_data_d',month_date='20261019',warehouseid='BASE2',material_code='FUTURE',prod_date='2026-10-20',warehouse_classify='02',live_qty=1,available_qty=1)
        base=self.read('health.summary',warehouse_type_mode='equal',warehouse_type='基地仓')[0]
        branch=self.read('health.summary',warehouse_type_mode='equal',warehouse_type='分仓')[0]
        self.assertEqual(base['total_qty'],1010)
        self.assertEqual(base['max_age'],(datetime.date(2026,10,19)-datetime.date(2024,2,29)).days)
        self.assertEqual(branch['total_qty'],130)
        # Removed target/threshold fields cannot be recreated from stock quantity.
        self.assertIsNone(base['overaged_qty'])

    def test_stock_only_sku_and_its_names_are_not_lost_to_plan_scope(self):
        self.insert('agents_scm_material_in_out_summary_d',warehouseid='WH1',material_code='S2',material_name='商品S2',material_group_name='物料组')
        rows = self.read('replenishment.detail')
        self.assertEqual([row['sku'] for row in rows],['S1','S2'])
        self.assertEqual(rows[1]['inventory_qty'],80)
        self.assertEqual(rows[1]['plan_present'],0)
        self.assertEqual(rows[1]['rolling_ship_daily'],2)
        self.assertEqual(rows[1]['historical_turnover_days'],30)
        self.assertEqual(self.read('replenishment.count'),[{'total':2}])
        total = self.read('replenishment.summary')[0]
        self.assertEqual((total['row_count'],total['stock_only_count'],total['inventory_qty']),(2,1,130))
        self.assertEqual(total['recommended_qty'],35)
        self.assertEqual(total['plan_calculable_count'],1)

    def test_current_plan_missing_units_does_not_erase_stock_and_shipment_metrics(self):
        self.db.execute('UPDATE agents_scm_warehouse_transfer_plan_data_d SET plan_qty_unit=NULL')
        total = self.read('replenishment.summary')[0]
        self.assertEqual((total['inventory_qty'],total['available_qty'],total['rolling_ship_daily']),(130,85,3))
        self.assertEqual((total['plan_calculable_count'],total['recommended_qty'],total['replenishment_sku_count']),(0,0,0))
        self.assertTrue(all(row['recommended_qty'] == 0 for row in self.read('replenishment.detail')))
        self.assertTrue(all(row['calculation_status'] == '近30日发货测算' for row in self.read('replenishment.detail')))

    def test_stock_only_sku_can_replenish_from_historical_shipments_with_explicit_basis(self):
        self.db.execute("UPDATE agents_scm_inventory_sku_data_d SET available_qty=0,live_qty=0 WHERE material_code='S2'")
        row = next(row for row in self.read('replenishment.detail') if row['sku']=='S2')
        self.assertEqual((row['target_inventory_qty'],row['recommended_qty'],row['urgent']),(20,20,1))
        self.assertEqual(row['calculation_status'],'近30日发货测算')
        total = self.read('replenishment.summary')[0]
        self.assertEqual((total['recommended_qty'],total['replenishment_sku_count']),(55,2))
        self.assertEqual(total['historical_basis_count'],1)

    def test_plan_cutoff_uses_read_date_even_when_inventory_snapshot_is_previous_day(self):
        self.db.execute("UPDATE agents_scm_warehouse_transfer_plan_data_d SET snapshot_date='2026-10-20'")
        row = self.read('replenishment.detail')[0]
        self.assertEqual((row['plan_calculable'],row['recommended_qty']),(1,35))
        self.db.execute("UPDATE agents_scm_warehouse_transfer_plan_data_d SET snapshot_date='2026-10-21'")
        row = self.read('replenishment.detail')[0]
        self.assertEqual(row['plan_calculable'],0)
        self.assertEqual(row['calculation_status'],'近30日发货测算')

    def test_valid_zero_plan_is_not_replaced_by_historical_demand(self):
        self.db.execute('UPDATE agents_scm_warehouse_transfer_plan_data_d SET warehouse_month_out_plan=0')
        row = self.read('replenishment.detail')[0]
        self.assertEqual((row['plan_calculable'],row['target_inventory_qty'],row['recommended_qty']),(1,0,0))
        self.assertEqual(row['calculation_status'],'当前有效计划')

    def test_duplicate_plan_never_multiplies_stock_and_ambiguous_plan_is_not_used(self):
        self.db.execute('INSERT INTO agents_scm_warehouse_transfer_plan_data_d SELECT * FROM agents_scm_warehouse_transfer_plan_data_d')
        total = self.read('replenishment.summary')[0]
        self.assertEqual((total['row_count'],total['inventory_qty'],total['available_qty']),(2,130,85))
        self.assertEqual(total['plan_calculable_count'],0)

    def test_null_shipment_counts_as_zero_without_hiding_the_other_rows(self):
        self.insert('agents_scm_cust_deliv_daily_di',warehouse='WH1',material_code='S1',warehouse_classify='20',act_ship_date='20261010',act_dl_qty=None)
        total = self.read('replenishment.summary')[0]
        self.assertEqual(total['rolling_ship_positive'],90)
        self.assertEqual(total['rolling_ship_daily'],3)

    def test_atomic_pages_keep_total_and_empty_page_without_a_cartesian_duplicate(self):
        first = self.read('replenishment.detail.atomic',page_size=1,offset=0)
        second = self.read('replenishment.detail.atomic',page_size=1,offset=1)
        empty = self.read('replenishment.detail.atomic',page_size=1,offset=2)
        self.assertEqual((first[0]['sku'],second[0]['sku']),('S1','S2'))
        self.assertEqual([row[0]['page_scope_total'] for row in [first,second,empty]],[2,2,2])
        self.assertEqual(empty[0]['page_row_present'],0)
        self.assertEqual(self.read('replenishment.count',sku_mode='equal',sku='S2'),[{'total':1}])

    def test_null_warehouse_plan_is_preserved_and_is_not_an_empty_page_marker(self):
        self.insert('agents_scm_warehouse_transfer_plan_data_d', material_code='UNMAPPED', transfer_prepare_qty=7)
        rows = self.read('replenishment.detail.atomic')
        row = next(row for row in rows if row['sku'] == 'UNMAPPED')
        self.assertIsNone(row['warehouse_code'])
        self.assertEqual(row['page_row_present'],1)
        self.assertEqual(row['plan_present'],1)
        self.assertEqual(self.read('replenishment.summary')[0]['plan_count'],2)

    def test_product_names_fill_blanks_without_multiplying_stock_or_page_totals(self):
        self.db.execute("UPDATE agents_scm_cust_deliv_daily_di SET material_name=NULL WHERE material_code='S2'")
        before = self.read('replenishment.summary')
        for _ in range(2):
            self.insert('agents_dim_product_list_mi',material_code='S2',material_name='清单商品2',product_item_name='清单物料组')
        self.insert('agents_dim_product_list_mi',material_code='S1',material_name='不应替换原名',product_item_name='其他组')
        rows = self.read('replenishment.detail')
        self.assertEqual((rows[0]['material_name'],rows[1]['material_name'],rows[1]['material_group']),('商品1','清单商品2','清单物料组'))
        self.assertEqual(self.read('replenishment.summary'),before)
        self.assertEqual(self.read('replenishment.count'),[{'total':2}])
        atomic = self.read('replenishment.detail.atomic',page_size=1,offset=1)
        self.assertEqual((atomic[0]['material_name'],atomic[0]['page_scope_total']),('清单商品2',2))
        self.assertEqual(self.read('replenishment.count',search_pattern='%清单商品2%'),[{'total':1}])
        self.assertEqual(self.read('replenishment.detail.atomic',search_pattern='%清单商品2%')[0]['page_scope_total'],1)

    def test_conflicting_product_names_and_groups_are_not_chosen_arbitrarily(self):
        self.db.execute("UPDATE agents_scm_cust_deliv_daily_di SET material_name=NULL WHERE material_code='S2'")
        for suffix in ['甲','乙']:
            self.insert('agents_dim_product_list_mi',material_code='S2',material_name='名称'+suffix,product_item_name='组'+suffix)
        row = self.read('replenishment.detail')[1]
        self.assertIsNone(row['material_name'])
        self.assertIsNone(row['material_group'])
        self.assertEqual(self.read('replenishment.summary')[0]['inventory_qty'],130)


class CustomerAnalysisListTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row;self.addCleanup(self.db.close)
        self.fields='cust_code material_code create_date month cust_name material_name simulation_need_mny ship_qty ship_amount unship_qty unship_amount all_qty all_amount budget_rate allnum plannum_rate daily_sales stock_qty in_transit_qty turnover_days target_inventory label_turnover_days avg_stock_age stock_age_turnover_status pre_order_qty'.split()
        text=set('cust_code material_code create_date month cust_name material_name stock_age_turnover_status'.split())
        self.db.execute('CREATE TABLE agents_scm_cust_plan_order_analysis_d ('+','.join(f+(' TEXT' if f in text else ' REAL') for f in self.fields)+')')
        for customer,sku,day,month,stock in [('C1','S1','2026-10-20','202610',5),('C1','S2','2026-10-20','202610',0),('C2','S1','2026-10-20','202610',8),('C1','S1','2026-10-19','202610',99),('C1','S1','2026-09-30','202609',77)]:
            self.db.execute('INSERT INTO agents_scm_cust_plan_order_analysis_d(cust_code,material_code,create_date,month,stock_qty,target_inventory,avg_stock_age) VALUES(?,?,?,?,?,?,?)',(customer,sku,day,month,stock,10,4))

    def read(self,agent,name,**overrides):
        q=config_for(agent)['queries'][name];v={s['name']:q['request']['parameters'][k] for k,s in q['parameterSpec'].items()};v.update(overrides);p=validate_parameters(q,v,name);t=sqlglot.parse_one(q['request']['sql'],read='postgres')
        return [dict(row) for row in self.db.execute(t.sql(dialect='sqlite'),p)]

    def test_month_and_cutoff_select_the_source_day_independently(self):
        for a in ['dealer','qll','apsplan']:
            self.assertEqual(self.read(a,'source.customer-analysis-date',month='202610',as_of='2026-10-19'),[{'day':'2026-10-19'}])
            self.assertEqual(self.read(a,'source.customer-analysis-date',month='202609',as_of='2026-10-20'),[{'day':'2026-09-30'}])

    def test_exact_customer_scope_preserves_zero_and_does_not_add_other_days(self):
        for a in ['dealer','qll','apsplan']:
            rows=self.read(a,'customer_analysis.detail',customer='C1');self.assertEqual([x['stock_qty'] for x in rows],[5,0]);self.assertEqual(self.read(a,'customer_analysis.count',customer='C1'),[{'total':2}])

    def test_duplicate_source_key_does_not_double_stock_or_choose_an_arbitrary_target(self):
        self.db.execute("INSERT INTO agents_scm_cust_plan_order_analysis_d(cust_code,material_code,create_date,month,stock_qty,target_inventory) VALUES('C1','S1','2026-10-20','202610',7,20)")
        row=self.read('dealer','customer_analysis.detail',customer='C1')[0];self.assertEqual(row['source_rows'],2);self.assertIsNone(row['stock_qty']);self.assertIsNone(row['target_inventory'])

    def test_atomic_pages_requery_and_keep_total_on_empty_page(self):
        for a in ['dealer','qll','apsplan']:
            first=self.read(a,'customer_analysis.detail.atomic',customer='C1',page_size=1,offset=0);second=self.read(a,'customer_analysis.detail.atomic',customer='C1',page_size=1,offset=1);empty=self.read(a,'customer_analysis.detail.atomic',customer='C1',page_size=1,offset=2)
            self.assertEqual((first[0]['material_code'],second[0]['material_code']),('S1','S2'));self.assertEqual(empty[0]['page_scope_total'],2);self.assertEqual(empty[0]['page_row_present'],0)


class DealerMatchedAnalysisTests(unittest.TestCase):
    def setUp(self):
        CustomerAnalysisListTests.setUp(self)
        self.db.execute('CREATE TABLE agents_scm_cust_jxc_ai_daliy_d (stat_date TEXT,cust_code TEXT,material_code TEXT,cust_name TEXT,material_name TEXT,product_range_name TEXT,tag TEXT,material_size TEXT,measure_unit TEXT,upload_date_last TEXT,load_time TEXT,region_name TEXT,province_region_name TEXT,stock_qty REAL,pack_unitqty REAL,normal_stock_qty REAL,stock_amt REAL,sales_qty_7days REAL,sales_qty_30days REAL,sales_qty_7days_avg REAL,sales_qty_30days_avg REAL,sales_amt_30days REAL,cif_price REAL,big_final_qty REAL)')
        self.db.execute('CREATE TABLE agents_dim_material_prod_sales_info_d(material_code TEXT,prod_big_cls TEXT,prod_series TEXT,spec TEXT)')
        self.db.execute('CREATE TABLE agents_dim_product_list_mi(material_code TEXT,material_name TEXT,product_item_name TEXT)')
        for sku,qty in [('S1',5),('S2',20),('S3',0)]:self.db.execute('INSERT INTO agents_scm_cust_jxc_ai_daliy_d(stat_date,cust_code,material_code,stock_qty) VALUES(?,?,?,?)',('2026-10-20','C1',sku,qty))

    def read(self,agent,name,**overrides):
        q=config_for(agent)['queries'][name];v={s['name']:q['request']['parameters'][k] for k,s in q['parameterSpec'].items()};v.update(stat_date='2026-10-20');v.update(overrides);params=validate_parameters(q,v,name);t=sqlglot.parse_one(q['request']['sql'],read='postgres')
        for cast in list(t.find_all(sqlglot.exp.Cast)):
            if cast.args['to'].this==sqlglot.exp.DataType.Type.DATE:cast.replace(cast.this.copy())
        return [dict(row) for row in self.db.execute(t.sql(dialect='sqlite'),params)]

    def test_only_same_day_same_key_same_inventory_gets_analysis_reference(self):
        for a in ['dealer','qll']:
            rows=self.read(a,'dealer.stock.detail');self.assertEqual(len(rows),3)
            self.assertEqual((rows[0]['inventory'],rows[0]['analysis_target_inventory'],rows[0]['analysis_avg_stock_age']),(5,10,4))
            self.assertIsNone(rows[1]['analysis_target_inventory']);self.assertIsNone(rows[2]['analysis_target_inventory']);self.assertEqual(rows[2]['inventory'],0)

    def test_duplicate_analysis_and_other_day_never_supply_arbitrary_reference(self):
        self.db.execute("INSERT INTO agents_scm_cust_plan_order_analysis_d(cust_code,material_code,create_date,month,stock_qty,target_inventory) VALUES('C1','S1','2026-10-20','202610',5,999)")
        for a in ['dealer','qll']:
            rows=self.read(a,'dealer.stock.detail.atomic');self.assertEqual(len(rows),3);self.assertIsNone(rows[0]['analysis_target_inventory']);self.assertEqual(rows[0]['page_scope_total'],3)

    def test_duplicate_product_reference_fills_name_without_changing_inventory(self):
        for _ in range(2):
            self.db.execute("INSERT INTO agents_dim_product_list_mi VALUES('S1','清单商品1','清单组')")
        for agent in ['dealer','qll']:
            rows=self.read(agent,'dealer.stock.detail.atomic')
            self.assertEqual(len(rows),3)
            self.assertEqual((rows[0]['material_name'],rows[0]['inventory'],rows[0]['page_scope_total']),('清单商品1',5,3))
            self.assertEqual(sum(row['inventory'] for row in rows),25)


if __name__ == '__main__':
    unittest.main()
