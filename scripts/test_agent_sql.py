"""No network or credentials: exercise the direct executor's read-only boundary."""
import unittest
import sqlglot
from unittest.mock import patch
from agent_sql import ContractError, bind, inspect, validate_parameters, Executor, direct_preview_document, config_for


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
