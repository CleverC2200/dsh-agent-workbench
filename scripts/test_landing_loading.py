"""Landing projections preserve the full stock grain, category fallback and unknowns."""
import unittest,sqlite3,re,json
from pathlib import Path
import sqlglot
from sqlglot import exp
from agent_sql import config_for,validate_parameters

class LandingInventoryTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row;self.addCleanup(self.db.close)
  self.db.create_function('CONCAT',-1,lambda *v:''.join(str(x) for x in v if x is not None))
  configs=[config_for(a) for a in ['aqkc','apsplan']]
  trees=[sqlglot.parse_one(c['queries'][q]['request']['sql'],read='postgres') for c,q in zip(configs,['page.dashboard-groups','overview.stock'])]
  from sqlglot.optimizer.scope import traverse_scope
  fields={}
  for tree in trees:
   for scope in traverse_scope(tree):
    for col in scope.columns:
     source=scope.sources.get(col.table)
     if isinstance(source,exp.Table) and source.name.startswith('agents_'):fields.setdefault(source.name,set()).add(col.name)
  for table,columns in fields.items():self.db.execute('CREATE TABLE '+table+' ('+','.join(c+' '+('REAL' if any(k in c for k in ['stock','qty','demand','inventory','produce_plan','avg_']) and c not in ['inventory_version'] else 'TEXT') for c in columns)+')')
 def insert(self,table,**values):
  self.db.execute('INSERT INTO '+table+' ('+','.join(values)+') VALUES ('+','.join('?' for _ in values)+')',list(values.values()))
 def read(self,agent,id):
  q=config_for(agent)['queries'][id];values={s['name']:q['request']['parameters'][k] for k,s in q['parameterSpec'].items()};values.update({k:v for k,v in dict(month='2026-10-01',stock_month='2026-10-01',stock_date='2026-10-22',inventory_version='滚动',exclude_category='饺鲜说',page_size=200,offset=0).items() if k in values});params=validate_parameters(q,values,id)
  tree=sqlglot.parse_one(q['request']['sql'],read='postgres')
  for cast in list(tree.find_all(exp.Cast)):
   if cast.args['to'].this==exp.DataType.Type.DATE:cast.replace(cast.this.copy())
  sql=tree.sql(dialect='sqlite')
  for key,value in list(params.items()):
   if isinstance(value,list):
    names=[key+'_'+str(i) for i in range(len(value))];sql=re.sub(':'+key+r'\b',','.join(':'+n for n in names),sql);params.pop(key);params.update(zip(names,value))
  return [dict(r) for r in self.db.execute(sql,params)]
 def test_inventory_only_projection_matches_full_summary_with_bad_and_target_only_skus(self):
  for sku,qty,category in [('A',100,'汤圆'),('B',30,None),('C',80,None),('D',7,'汤圆')]:
   self.insert('agents_scm_stock_detail_d',data_month='2026-10-01',the_date='2026-10-22',belong_base='郑州',material_code=sku,current_stock=qty)
   self.insert('agents_scm_inventory_sku_data_d',month_date='20261022',warehouse_classify='01',belong_base='郑州',material_code=sku,live_qty=None if sku=='D' else qty)
   if category:self.insert('agents_scm_goods_inventory_turnover_data_m',year_month='2026-10-01',inventory_version='滚动',belong_base='郑州',material_code=sku,product_categ_name=category)
  # APS rejects duplicate daily stock; base stock keeps its independent batch unknown.
  self.insert('agents_scm_stock_detail_d',data_month='2026-10-01',the_date='2026-10-22',belong_base='郑州',material_code='D',current_stock=9)
  self.insert('agents_order_execute_isontime_mi',new_material_code='B',product_categ_name='饺鲜说')
  self.insert('agents_scm_material_in_out_summary_d',material_code='C',product_categ_name='馄饨')
  self.insert('agents_scm_goods_inventory_turnover_data_m',year_month='2026-10-01',inventory_version='滚动',belong_base='郑州',material_code='TARGET-ONLY',product_categ_name='汤圆')
  for agent,full,quick in [('aqkc','page.dashboard-groups','page.inventory-groups'),('apsplan','overview.stock','overview.inventory')]:
   with self.subTest(agent=agent):
    before={(r['base'],r['category']):r for r in self.read(agent,full)};after={(r['base'],r['category']):r for r in self.read(agent,quick)}
    self.assertEqual(set(before),set(after))
    for key,row in after.items():self.assertEqual(row['inventory'],before[key]['inventory'])
    self.assertEqual(sum(r['inventory'] or 0 for r in after.values()),180)
    self.assertNotIn(('郑州','饺鲜说'),after)
