"""Full-chain branch order values must match ASN while base values stay unchanged."""
import importlib.util
import json
from pathlib import Path
import unittest

import sqlglot
from sqlglot import exp
import test_fc_upstream_orders
import test_base_current_orders

ROOT = Path(__file__).resolve().parents[1]


class FullChainBranchOrders(unittest.TestCase):
    def setUp(self):
        self.branch = test_fc_upstream_orders.UpstreamOrders()
        self.branch.setUp()
        self.db = self.branch.db
        self.addCleanup(self.db.close)
        base = test_base_current_orders.BaseCurrentOrders()
        base.setUp()
        self.addCleanup(base.doCleanups)
        self.db.execute(base.db.execute("SELECT sql FROM sqlite_master WHERE name='agents_scm_execute_detail_d'").fetchone()[0])
        for table, columns in {
            'agents_scm_inventory_sku_data_d': ['material_name'],
            'agents_scm_material_in_out_summary_d': ['warehouseid', 'pickup_point'],
        }.items():
            for column in columns:
                self.db.execute(f'ALTER TABLE {table} ADD COLUMN {column} TEXT')
        self.db.execute("INSERT INTO agents_scm_material_in_out_summary_d VALUES ('SKU','面点','馒头','BASE','PBASE')")
        base.db = self.db
        base.add('BASE-OPEN', pickup_point='PBASE', belong_base='基地甲', material_code='SKU', qtyordered=120, qtyallocated=20)
        # Dealer orders at the branch cannot contribute to incoming ASN orders.
        base.add('DEALER', pickup_point='PBR1', belong_base='基地甲', material_code='SKU', qtyordered=99999)
        self.db.execute("INSERT INTO agents_scm_material_in_out_summary_d VALUES ('SKU','面点','馒头','BR1','PBR1')")
        self.configs = {a: json.loads((ROOT / f'business/inventory-{a}/sql.config.json').read_text()) for a in ['qll', 'fc', 'aqkc']}

    def read(self, agent, kind='summary', **values):
        q = self.configs[agent]['queries']['current-shortage.' + kind]
        params = q['request']['parameters'].copy()
        for name, value in values.items():
            params[next(k for k, v in q['parameterSpec'].items() if v['name'] == name)] = value
        params = {k: v[0] if isinstance(v, list) else v for k, v in params.items()}
        sql = sqlglot.parse_one(q['request']['sql'], read='postgres').sql(dialect='sqlite')
        return [dict(r) for r in self.db.execute(sql, params)]

    def test_base_and_branch_match_their_canonical_sources(self):
        for kind in ['summary', 'locations', 'categories', 'skus']:
            values = {'skus': ['SKU']} if kind == 'skus' else {}
            combined = self.read('qll', kind, **values)
            for agent, location_type in [('fc', '分仓'), ('aqkc', '基地')]:
                actual = [r for r in combined if r['location_type'] == location_type]
                expected = self.read(agent, kind, **values)
                fields = self.configs['qll']['queries']['current-shortage.' + kind]['resultColumns']
                self.assertEqual(actual, [{k: r[k] for k in fields} for r in expected], kind)

    def test_selected_branch_preserves_global_fifo_allocation(self):
        row = self.read('qll', warehouse_code='BR2')[0]
        self.assertEqual((row['location_type'], row['demand'], row['allocated'], row['available'], row['shortage']), ('分仓', 60, 10, 10, 40))

    def test_missing_allocation_does_not_erase_base_cohort(self):
        self.db.execute("UPDATE agents_scm_execute_detail_hourly_d SET qtyallocated=NULL WHERE executeorderno='O1'")
        rows = self.read('qll')
        branch = next(r for r in rows if r['location_type'] == '分仓')
        self.assertIsNone(branch['shortage'])
        self.assertGreater(branch['invalid'], 0)
        self.assertEqual([r for r in rows if r['location_type'] == '基地'], self.read('aqkc'))

    def test_detail_pages_reconcile_with_counts(self):
        rows = self.read('qll', 'detail', page_size=200)
        actual = []
        for offset in range(len(rows)):
            page = self.read('qll', 'detail', page_size=1, offset=offset)
            self.assertEqual(page[0]['page_scope_total'], len(rows))
            self.assertEqual(page[0]['page_row_present'], 1)
            actual.append(page[0])
        self.assertEqual(actual, rows)
        empty = self.read('qll', 'detail', page_size=1, offset=len(rows))[0]
        self.assertIsNone(empty['page_row_present'])

    def test_branch_views_do_not_use_dealer_orders(self):
        config = self.configs['qll']
        view = next(v for v in config['sourceViews']['views'] if v['id'] == 'branch-overview')
        self.assertEqual(view['summaryId'], 'branch-supply.summary')
        self.assertNotIn('branch-overview', config['overviewOrderGroups']['views'])
        for key, q in config['queries'].items():
            if key.startswith(('replenishment.', 'replenishment-suggestions.', 'branch-supply.', 'branch-health.', 'branch-turnover.')):
                tables = {t.name for t in sqlglot.parse_one(q['request']['sql'], read='postgres').find_all(exp.Table)}
                self.assertFalse(tables & {'agents_order_execute_isontime_mi', 'agents_scm_shortage_trace_f'}, key)
                if key.startswith('replenishment.'):
                    self.assertIn('agents_scm_asn_detail_d', tables, key)

    def test_generation_is_idempotent(self):
        spec = importlib.util.spec_from_file_location('qll_branch', ROOT / 'scripts/update-qll-branch-orders.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        config = self.configs['qll']
        before = json.dumps(config, sort_keys=True, ensure_ascii=False)
        module.build(config, self.configs['aqkc'], self.configs['fc'])
        self.assertEqual(before, json.dumps(config, sort_keys=True, ensure_ascii=False))


if __name__ == '__main__':
    unittest.main()
