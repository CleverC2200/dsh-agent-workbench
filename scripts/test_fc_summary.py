"""Exercise persisted summary filters and null handling without live credentials."""
import json
import re
import sqlite3
import unittest
from pathlib import Path
import sqlglot
from sqlglot import exp

CONFIG = json.loads((Path(__file__).resolve().parents[1] / 'business/inventory-fc/sql.config.json').read_text())
QUERY = CONFIG['queries']['snapshot-default.replenishment.summary']

class Summary(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.addCleanup(self.db.close)
        self.db.row_factory = sqlite3.Row
        self.db.create_function('CONCAT', -1, lambda *v: ''.join(str(x) for x in v if x is not None))
        tree = sqlglot.parse_one(QUERY['request']['sql'])
        columns = sorted({c.name for c in tree.find_all(exp.Column) if c.table == 'm'})
        for table in ['agents_inv_branch_sku_day', 'agents_inv_order_summary_day']:
            self.db.execute('CREATE TABLE '+table+' ('+', '.join(columns)+')')
        for warehouse, sku, qty, stock, available, daily in [
            ('A110','yes',10,100,60,10), ('A110','zero',0,40,40,0),
            ('A110','unknown',None,20,-1,20), ('A120','other',999,999,999,99),
        ]:
            self.db.execute('INSERT INTO agents_inv_branch_sku_day (inv_batch_id,inv_variant_id,warehouseid,sku,warehouse_name,recommended_qty,inventory_qty,available_qty,rolling_ship_daily,calculation_order_remaining) VALUES (?,?,?,?,?,?,?,?,?,?)',
                            ('batch','BRANCH_DEFAULT',warehouse,sku,'沈阳分仓',qty,stock,available,daily,5))

    def read(self, **overrides):
        values = {**{s['name']: QUERY['request']['parameters'].get(k) for k,s in QUERY['parameterSpec'].items()},
                  'summary_batch_id':'batch','warehouse_code_mode':'equal','warehouse_code':'A110',
                  'sku_mode':'all','category_mode':'all','search_pattern':None,'warehouse_search_pattern':None,
                  'needed_only':False,'business_only':False,'positive_actual_keys':[''],
                  'positive_plan_keys':[''],'zero_plan_keys':[''],'business_plan_keys':[''], **overrides}
        def literal(v):
            if isinstance(v,list): return ','.join(literal(x) for x in v)
            if v is None: return 'NULL'
            if isinstance(v,bool): return str(v).upper()
            if isinstance(v,(int,float)): return str(v)
            return "'"+str(v).replace("'","''")+"'"
        sql = re.sub(r':(gea_p\d+)\b', lambda m:literal(values[QUERY['parameterSpec'][m[1]]['name']]), QUERY['request']['sql'])
        return dict(self.db.execute(sql).fetchone())

    def test_same_branch_pool_and_unknowns(self):
        r = self.read()
        self.assertEqual((r['row_count'],r['inventory_qty'],r['recommended_qty']), (3,160,10))
        self.assertEqual(r['historical_turnover_days'],6)
        self.assertEqual(r['missing_calculation_count'],1)
        self.assertEqual(r['order_adjusted_available_qty'],90)

    def test_need_filter_and_manual_edits(self):
        self.assertEqual(self.read(needed_only=True)['row_count'],1)
        self.assertEqual(self.read(needed_only=True,positive_actual_keys=['4:A110unknown'])['row_count'],2)
        self.assertEqual(self.read(needed_only=True,zero_plan_keys=['4:A110yes'])['row_count'],0)

    def test_empty_scope_does_not_become_zero_inventory(self):
        r=self.read(warehouse_code='missing')
        self.assertEqual(r['row_count'],0)
        self.assertIsNone(r['inventory_qty'])

if __name__ == '__main__': unittest.main()
