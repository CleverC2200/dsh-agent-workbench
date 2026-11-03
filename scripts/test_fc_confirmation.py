"""Run the shipped confirmation SQL on positive, zero, unknown and manual fixtures."""
import json,re,sqlite3,unittest
from pathlib import Path
import sqlglot
from sqlglot import exp
CONFIG=json.loads((Path(__file__).resolve().parents[1]/'business/inventory-fc/sql.config.json').read_text())
QUERY=CONFIG['queries']['snapshot-default.replenishment-confirmation.detail.atomic']
class Confirmation(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row;self.addCleanup(self.db.close)
  self.db.create_function('CONCAT',-1,lambda *v:''.join(str(x) for x in v if x is not None))
  tree=sqlglot.parse_one(QUERY['request']['sql'])
  columns=sorted({c.name for c in tree.find_all(exp.Column) if c.table=='m'})
  self.db.execute('CREATE TABLE agents_inv_branch_sku_day ('+', '.join(columns)+')')
  for warehouse,sku,qty in [('A020','POS',10),('A020','ZERO',0),('A020','UNKNOWN',None),('A100','OTHER',20)]:
   self.db.execute('INSERT INTO agents_inv_branch_sku_day (inv_batch_id,inv_variant_id,warehouseid,sku,warehouse_name,recommended_qty) VALUES (?,?,?,?,?,?)',('batch','BRANCH_DEFAULT',warehouse,sku,'长沙' if warehouse=='A020' else '另一仓',qty))
 def read(self,**overrides):
  values={**{spec['name']:QUERY['request']['parameters'].get(key) for key,spec in QUERY['parameterSpec'].items()},'summary_batch_id':'batch','warehouse_code_mode':'equal','warehouse_code':'A020','sku_mode':'all','sku':None,'category_mode':'all','category':None,'search_pattern':None,'warehouse_search_pattern':None,'needed_only':True,'positive_actual_keys':[''],'positive_plan_keys':[''],'zero_plan_keys':[''],'page_size':200,'offset':0,**overrides}
  def literal(v):
   if isinstance(v,list):return ','.join(literal(x) for x in v)
   if v is None:return 'NULL'
   if isinstance(v,bool):return str(v).upper()
   if isinstance(v,(int,float)):return str(v)
   return "'"+str(v).replace("'","''")+"'"
  sql=re.sub(r':(gea_p\d+)\b',lambda m:literal(values[QUERY['parameterSpec'][m[1]]['name']]),QUERY['request']['sql'])
  return [dict(r) for r in self.db.execute(sql)]
 def test_excludes_zero_unknown_and_other_warehouse_before_count_and_paging(self):
  rows=self.read();self.assertEqual([(r['sku'],r['page_scope_total']) for r in rows],[('POS',1)])
 def test_empty_scope_has_count_without_detail_row(self):
  row=self.read(sku_mode='equal',sku='ZERO')[0];self.assertEqual(row['page_scope_total'],0);self.assertIsNone(row['page_row_present'])
 def test_manual_quantity_and_plan_keep_zero_or_unknown_source(self):
  for field in ['positive_actual_keys','positive_plan_keys']:
   rows=self.read(**{field:['4:A020ZERO','4:A020UNKNOWN']});self.assertEqual([r['sku'] for r in rows],['POS','UNKNOWN','ZERO']);self.assertTrue(all(r['page_scope_total']==3 for r in rows))
 def test_trial_zero_excludes_old_suggestion_but_explicit_edit_keeps_audit(self):
  row=self.read(zero_plan_keys=['4:A020POS'])[0];self.assertEqual(row['page_scope_total'],0)
  row=self.read(zero_plan_keys=['4:A020POS'],positive_actual_keys=['4:A020POS'])[0];self.assertEqual(row['sku'],'POS')
 def test_pagination_and_fuzzy_warehouse_keep_exact_scope(self):
  row=self.read(positive_actual_keys=['4:A020ZERO'],warehouse_search_pattern='%长沙%',page_size=1,offset=1)[0];self.assertEqual((row['sku'],row['page_scope_total']),('ZERO',2))
if __name__=='__main__':unittest.main()
