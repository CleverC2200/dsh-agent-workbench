"""Branch stock and upstream supply stay independent; customer metrics use dealer orders."""
import importlib.util
import json
from pathlib import Path
import unittest
import sqlglot
from sqlglot import exp
import test_agent_sql

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN = {'agents_order_execute_isontime_mi', 'agents_scm_shortage_trace_f'}


class BranchOrderSources(unittest.TestCase):
    def setUp(self):
        self.fixture = test_agent_sql.FcReplenishmentCoverageTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.config = self.fixture.config

    def test_only_customer_order_queries_depend_on_dealer_facts(self):
        for key, query in self.config['queries'].items():
            if key.startswith(('orders.', 'snapshot.orders.')):
                continue
            for table in FORBIDDEN:
                self.assertNotIn(table,query['request']['sql'],key)
        for key, query in self.config['queries'].items():
            for field, ref in query.get('pagination', {}).items():
                if field in {'countQuery', 'atomicQuery'}:
                    self.assertTrue(ref in self.config['queries'], key)

    def test_inventory_detail_and_paging_work_without_any_dealer_order_table(self):
        f = self.fixture
        f.db.execute('DROP TABLE agents_order_execute_isontime_mi')
        f.insert('agents_dim_product_list_mi', material_code='S1', material_name='主数据商品')
        f.insert('agents_scm_material_in_out_summary_d', warehouseid='WH1', material_code='S2', material_name='库存流水商品')
        rows = f.read('health.detail', warehouse_code_mode='equal', warehouse_code='WH1')
        self.assertEqual(sum(r['total_qty'] for r in rows), 130)
        self.assertEqual({r['material_name'] for r in rows}, {'主数据商品', '库存流水商品'})
        page = f.read('health.detail.atomic', warehouse_code_mode='equal', warehouse_code='WH1', page_size=1)
        self.assertEqual(len(page), 1)
        self.assertEqual(page[0]['page_scope_total'], 2)

    def test_conflicting_movement_names_use_master_without_duplicating_stock(self):
        f = self.fixture
        f.db.execute('DROP TABLE agents_order_execute_isontime_mi')
        for name in ['旧名称1', '旧名称2']:
            f.insert('agents_scm_material_in_out_summary_d', warehouseid='WH1', material_code='S1', material_name=name)
        f.insert('agents_dim_product_list_mi', material_code='S1', material_name='商品主数据')
        row = next(r for r in f.read('health.detail') if r['material_code'] == 'S1')
        self.assertEqual(row['material_name'], '商品主数据')
        self.assertEqual(row['total_qty'], 50)

    def test_customer_orders_and_shortage_exclude_upstream_asn(self):
        for name in ['orders.detail', 'current-shortage.summary', 'current-shortage.overview',
                     'branch-current-orders.page', 'branch-current-orders.lines']:
            sql = self.config['queries'][name]['request']['sql']
            tables = {t.name for t in sqlglot.parse_one(sql, read='postgres').find_all(exp.Table)}
            self.assertNotIn('agents_scm_asn_detail_d', tables, name)
            self.assertIn('agents_scm_execute_detail_d', tables, name)
            if name=='orders.detail':self.assertIn('agents_order_execute_isontime_mi',tables)
            else:self.assertNotIn('agents_order_execute_isontime_mi',tables)

    def test_cleanup_is_idempotent_and_retains_active_view_queries(self):
        spec = importlib.util.spec_from_file_location('clean', ROOT / 'scripts/clean-fc-order-sources.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        original = json.dumps(self.config, sort_keys=True)
        module.clean(self.config)
        self.assertEqual(json.dumps(self.config, sort_keys=True), original)
        for view in self.config['sourceViews']['views']:
            for field in ['queryId', 'summaryId', 'snapshotQuery', 'overviewSummaryId']:
                if view.get(field):
                    self.assertTrue(view[field] in self.config['queries'], view[field])


if __name__ == '__main__':
    unittest.main()
