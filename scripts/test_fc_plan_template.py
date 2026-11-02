"""The lightweight template preserves source plans, duplicate ambiguity and selected scope."""
import json
import sqlite3
import unittest
from pathlib import Path
import sqlglot

ROOT = Path(__file__).resolve().parents[1]

class PlanTemplate(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((ROOT / 'business/inventory-fc/sql.config.json').read_text())
        self.query = self.config['queries']['transfer_plan.template.atomic']
        self.db = sqlite3.connect(':memory:')
        self.addCleanup(self.db.close)
        self.db.row_factory = sqlite3.Row
        self.db.execute('CREATE TABLE agents_scm_warehouse_transfer_plan_data_d (warehouse_code TEXT, material_code TEXT, warehouse_name TEXT, material_name TEXT, product_categ_name TEXT, warehouse_month_out_plan REAL, warehouse_future30_qty REAL, stat_month TEXT)')
        self.db.executemany('INSERT INTO agents_scm_warehouse_transfer_plan_data_d VALUES (?,?,?,?,?,?,?,?)', [
            ('A','1','仓A','商品1','点心',310,600,'202610'),
            ('A','2','仓A','商品2','点心',0,0,'202610'),
            ('A','3','仓A','商品3','点心',None,None,'202610'),
            ('B','1','仓B','商品1','点心',10,20,'202610'),
            ('B','1','仓B','商品1','点心',10,20,'202610'),
            ('A','4','仓A','下月商品','点心',999,999,'202611'),
        ])

    def read(self, **overrides):
        if not any(r[1]=='warehouse_month_transfer_plan' for r in self.db.execute("PRAGMA table_info(agents_scm_warehouse_transfer_plan_data_d)")):
            self.db.execute("ALTER TABLE agents_scm_warehouse_transfer_plan_data_d ADD COLUMN warehouse_month_transfer_plan REAL")
        params = {**self.query['request']['parameters'], 'gea_p8':200, **overrides}
        sql = sqlglot.transpile(self.query['request']['sql'], read='postgres', write='sqlite')[0]
        return [dict(r) for r in self.db.execute(sql,params)]

    def test_plans_and_unknowns_are_not_replaced_by_stock_or_zero(self):
        rows = self.read()
        self.assertEqual(len(rows),4)
        self.assertTrue(all(r['page_scope_total']==4 for r in rows))
        self.assertEqual((rows[0]['month_out_plan'],rows[0]['period_next_out']),(310,600))
        self.assertEqual(rows[1]['month_out_plan'],0)
        self.assertIsNone(rows[2]['month_out_plan'])
        self.assertEqual(rows[3]['source_rows'],2)
        self.assertIsNone(rows[3]['month_out_plan'])
        self.assertIsNone(rows[3]['stat_month'])
        self.assertTrue(all(r['warehouse_month_transfer_plan'] is None for r in rows))

    def test_branch_sku_and_empty_filter_keep_count_and_page_consistent(self):
        rows=self.read(gea_p1='equal',gea_p2='A',gea_p3='equal',gea_p4='2')
        self.assertEqual([(r['warehouse_code'],r['sku'],r['page_scope_total']) for r in rows],[('A','2',1)])
        empty=self.read(gea_p1='equal',gea_p2='missing')
        self.assertEqual(len(empty),1)
        self.assertEqual(empty[0]['page_scope_total'],0)
        self.assertIsNone(empty[0]['page_row_present'])
        self.assertEqual([r['sku'] for r in self.read(gea_p8=2,gea_p9=2)],['3','1'])

if __name__ == '__main__':
    unittest.main()
