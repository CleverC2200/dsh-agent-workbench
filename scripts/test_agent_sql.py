"""No network or credentials: exercise the direct executor's read-only boundary."""
import unittest
import sqlite3
import re
import sqlglot
from unittest.mock import patch
from agent_sql import ContractError, bind, inspect, validate_parameters, Executor, direct_preview_document, config_for


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


if __name__ == '__main__':
    unittest.main()
