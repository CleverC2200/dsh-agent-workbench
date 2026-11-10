"""Exercise published plan dimensions at the same customer/SKU conflict boundary as quantities."""
import sqlite3
import unittest
from agent_sql import config_for
import test_agent_sql


class PlanDimensionSqlTests(unittest.TestCase):
    read = test_agent_sql.AccuracyBaseSqlTests.read

    def setUp(self):
        self.config = config_for('apsplan')
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.addCleanup(self.db.close)
        self.db.execute('CREATE TABLE agents_sales_plan_demand_m (stat_month TEXT,cust_code TEXT,material_code TEXT,belong_base TEXT,plannum REAL,allnum REAL,ycplanamount REAL,monthamount REAL,current_month_estimate REAL,next_month_estimate REAL,current_month_adjust REAL,sale_plan REAL,sale_adjust REAL,prod_plan_num REAL,scjp_qty REAL,product_categ_name TEXT,material_group_name TEXT,region_name TEXT,province_region_name TEXT,sales_group_name TEXT)')
        for customer, category, item, region, qty in [('C1','汤圆','芝麻','大区1',3),('C2','饺子','猪肉','大区2',5),('C3',None,None,None,7),('DUP','汤圆','芝麻','大区1',100),('DUP','饺子','猪肉','大区2',100)]:
            row = ('2026-10-01', customer, 'SKU1', '华南', qty-1, qty, 1, 2, qty, qty, qty, qty, qty, qty, qty, category, item, region, '省区' if region else None, '销售组' if region else None)
            self.db.execute('INSERT INTO agents_sales_plan_demand_m VALUES (' + ','.join('?' for _ in row) + ')',row)

    def test_page_summary_product_organization_and_counts_keep_totals_and_unknowns(self):
        for prefix in ['page.', 'overview.', 'drill.product.', 'drill.organization.']:
            for suffix in ['plans-source','plans-source-year']:
                key=prefix+suffix
                with self.subTest(query=key):
                    rows=self.read(key)
                    self.assertEqual(sum(row['planned'] for row in rows),15)
                    self.assertEqual(sum(row['base_sales_plan'] for row in rows),15)
                    self.assertEqual(sum(row['records'] for row in rows),4)
                    self.assertEqual(sum(row['missing_plan'] for row in rows),1)
                    self.assertEqual({row['category'] for row in rows},{'汤圆','饺子',None})
                    if prefix == 'drill.product.':
                        self.assertEqual({row['item'] for row in rows},{'芝麻','猪肉',None})
                    if prefix == 'drill.organization.':
                        self.assertEqual({row['region'] for row in rows},{'大区1','大区2',None})
                    self.assertEqual(self.read(key+'.count'),[{'total':len(rows)}])
                    unknown=next(row for row in rows if row['category'] is None)
                    self.assertEqual(unknown['planned'],7)
                    self.assertEqual(unknown['missing_plan'],1)


if __name__ == '__main__':
    unittest.main()
