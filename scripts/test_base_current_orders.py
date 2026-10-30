"""Execute the shipped base-order cohort and three-stage deficits with piece fixtures."""
import json
from pathlib import Path
import sqlite3
import unittest
import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]

class BaseCurrentOrders(unittest.TestCase):
 def setUp(self):
  self.config=json.loads((ROOT/'business/inventory-aqkc/sql.config.json').read_text())
  self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row;self.addCleanup(self.db.close)
  self.db.create_function('CONCAT',-1,lambda *x:''.join('' if a is None else str(a) for a in x))
  self.db.execute('CREATE TABLE agents_scm_inventory_sku_data_d(month_date TEXT,warehouseid TEXT,warehouse_name TEXT,belong_base TEXT,material_code TEXT,material_name TEXT,prod_date TEXT,sap_warehouseid TEXT,plant TEXT,quality_batch TEXT,is_good_prod TEXT,warehouse_classify TEXT,available_qty REAL)')
  self.db.execute('CREATE TABLE agents_scm_material_in_out_summary_d(warehouseid TEXT,pickup_point TEXT,material_code TEXT,product_categ_name TEXT,material_group_name TEXT)')
  self.db.execute('CREATE TABLE agents_scm_execute_detail_d(cust_order_no TEXT,cust_code TEXT,material_code TEXT,material_name TEXT,pickup_point TEXT,pickup_point_name TEXT,belong_base TEXT,bizunitconvertrate REAL,qtyshipped REAL,qtyordered REAL,adjust_order_qty REAL,qtyallocated REAL,delivery_qty REAL,bizflowstatus TEXT,detailstatus INTEGER,order_close_time TEXT,wms_close_time TEXT,canceltime TEXT, dmscanceltime TEXT, bdwctime TEXT, prapare_order_status TEXT)')
  for w,p,kind,base in [('W1','P1','01','郑州'),('W2','P2','02','郑州'),('F','PF','20','郑州'),('S','PS','01','遂平')]:
   self.stock(w,'SKU1',0,kind,base)
   self.db.execute('INSERT INTO agents_scm_material_in_out_summary_d VALUES(?,?,?,?,?)',(w,p,'SKU1','面点','馒头'))
 def stock(self,w,sku,qty,kind='01',base='郑州'):
  self.db.execute('INSERT INTO agents_scm_inventory_sku_data_d VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',('20261028',w,w,base,sku,sku,'20261001','SAP','PLANT',sku,'1',kind,qty))
 def add(self,order,**changes):
  row=dict(cust_order_no=order,cust_code='C',material_code='SKU1',material_name='商品',pickup_point='P1',pickup_point_name='基地',belong_base='郑州',qtyordered=100,adjust_order_qty=10,qtyallocated=20,delivery_qty=0,bizflowstatus='等待组波',detailstatus=10,order_close_time=None,wms_close_time=None,canceltime=None)
  row.update(changes);row.setdefault('bizunitconvertrate',1);row.setdefault('qtyshipped',row['delivery_qty']);self.db.execute('INSERT INTO agents_scm_execute_detail_d('+','.join(row)+') VALUES('+','.join('?' for _ in row)+')',list(row.values()))
 def read(self,key='current-shortage.locations',**values):
  q=self.config['queries'][key];p=q['request']['parameters'].copy()
  for name,value in values.items():p[next(k for k,v in q['parameterSpec'].items() if v['name']==name)]=value
  p={k:(v[0] if isinstance(v,list) else v) for k,v in p.items()}
  sql=sqlglot.parse_one(q['request']['sql'],read='postgres').sql(dialect='sqlite')
  return [dict(r) for r in self.db.execute(sql,p)]
 def base(self,**values):return next(r for r in self.read(**values) if r['base']=='郑州')
 def test_same_piece_cohort_includes_prepared_and_partial_orders_excludes_finished_cancelled_closed(self):
  self.add('OPEN');self.add('PREPARED',bizflowstatus='OCP已下发',qtyallocated=100,prapare_order_status='备单完成')
  self.add('PART',material_code='S2',qtyordered=30,qtyallocated=30,delivery_qty=30)
  self.add('PART',material_code='S3',qtyordered=40,qtyallocated=20,delivery_qty=10)
  for order,values in [('VOID',dict(detailstatus=20)),('CANCEL',dict(canceltime='2026-10-28')),('CLOSED',dict(order_close_time='2026-10-28')),('WMS',dict(wms_close_time='2026-10-28')),('DONE',dict(delivery_qty=100)),('BRANCH',dict(pickup_point='PF'))]:self.add(order,**values)
  row=self.base();self.assertEqual((row['demand'],row['allocated'],row['remaining'],row['shortage']),(270,170,100,100))
  # All base/category/SKU query shapes must use the same order source and units.
  for key in ['current-shortage.summary','current-shortage.categories','current-shortage.skus']:
   rows=self.read(key,**({'skus':['SKU1']} if key.endswith('skus') else {}))
   self.assertEqual(sum(r['demand'] for r in rows),200 if key.endswith('skus') else 270,key)
 def test_open_order_with_unknown_shipped_quantity_keeps_known_demand(self):
  self.add('OPEN',qtyordered=100,qtyshipped=None)
  self.assertEqual(self.base()['demand'],100)
 def test_prepared_uses_allocation_and_source_stages_not_expected_quantity(self):
  self.add('PREPARED',qtyordered=100,qtyallocated=65,prapare_order_status='备单完毕')
  self.add('DMS_CANCELLED',qtyordered=999,dmscanceltime='2026-10-30')
  row=self.base();self.assertEqual((row['demand'],row['allocated'],row['remaining']),(65,65,0))
 def test_order_sku_clip_then_base_sku_inventory_deduction_once_no_cross_sku_offset(self):
  self.add('A',qtyordered=3,qtyallocated=5);self.add('A',qtyordered=5,qtyallocated=0)
  self.add('B',pickup_point='P2',qtyordered=10,qtyallocated=0)
  self.db.execute("UPDATE agents_scm_inventory_sku_data_d SET available_qty=6 WHERE warehouseid IN ('W1','W2')")
  self.stock('W1','OTHER',100)
  self.add('C',material_code='OTHER',qtyordered=2,qtyallocated=0)
  row=self.base();self.assertEqual(row['remaining'],15);self.assertEqual(row['shortage'],1)
 def test_orders_without_stock_targets_remain_visible_and_categories_reconcile(self):
  self.add('A',material_code='ABSENT',qtyordered=12,qtyallocated=3)
  row=self.base();self.assertEqual(row['shortage'],9)
  categories=self.read('current-shortage.categories');self.assertEqual(sum(r['demand'] for r in categories),row['demand']);self.assertEqual(sum(r['allocated'] for r in categories),row['allocated']);self.assertEqual(sum(r['shortage'] for r in categories),row['shortage'])
  for key in ['page.sku-detail','page.sku-detail.count','page.sku-detail.atomic']:
   tree=sqlglot.parse_one(self.config['queries'][key]['request']['sql'],read='postgres')
   for cte in tree.find_all(exp.CTE):
    if cte.alias=='inventory_keys':
     # Execute the exact key union with independent stock/target/order inputs.
     self.db.executescript('DROP TABLE IF EXISTS targets;DROP TABLE IF EXISTS stock_source;DROP TABLE IF EXISTS detail_pending;CREATE TABLE targets(base TEXT,sku TEXT);CREATE TABLE stock_source(belong_base TEXT,material_code TEXT);CREATE TABLE detail_pending(base TEXT,sku TEXT);INSERT INTO detail_pending VALUES("郑州","ABSENT");')
     keys=list(self.db.execute(cte.this.sql(dialect='sqlite')));self.assertEqual([tuple(x) for x in keys],[('郑州','ABSENT')])
 def test_unknown_quantity_is_local_and_not_coerced_to_zero(self):
  self.add('BAD',qtyallocated=None)
  self.add('GOOD',pickup_point='PS',belong_base='遂平',qtyordered=40,qtyallocated=10)
  rows=self.read();bad=next(r for r in rows if r['base']=='郑州');good=next(r for r in rows if r['base']=='遂平')
  self.assertIsNone(bad['allocated']);self.assertIsNone(bad['shortage']);self.assertGreater(bad['invalid'],0)
  self.assertEqual((good['demand'],good['allocated'],good['shortage']),(40,10,30))
 def test_sku_page_and_count_refresh_the_embedded_source_and_are_idempotent(self):
  from importlib.util import spec_from_file_location,module_from_spec
  spec=spec_from_file_location('base_detail',ROOT/'scripts/update-base-detail-metrics.py');module=module_from_spec(spec);spec.loader.exec_module(module)
  before={key:sqlglot.parse_one(q['request']['sql'],read='postgres') for key,q in self.config['queries'].items()};module.update(self.config)
  for key,q in self.config['queries'].items():self.assertEqual(sqlglot.parse_one(q['request']['sql'],read='postgres'),before[key],key)
  rendered=json.dumps(self.config,ensure_ascii=False,sort_keys=True);module.update(self.config)
  self.assertEqual(json.dumps(self.config,ensure_ascii=False,sort_keys=True),rendered)
  for key in ['page.sku-detail','page.sku-detail.count','page.sku-detail.atomic']:
   tree=sqlglot.parse_one(self.config['queries'][key]['request']['sql'],read='postgres')
   for cte in tree.find_all(exp.CTE):
    if cte.alias=='detail_shortage_source':
     self.assertIn('current_open_orders',cte.this.sql());self.assertNotIn('adjust_order_qty',cte.this.sql());self.assertNotIn('bizflowstatus',cte.this.sql())
 def test_sku_metrics_keep_known_orders_when_only_inventory_is_invalid(self):
  self.add('A');self.stock('W1','SKU1',2);self.stock('W1','SKU1',3)
  for key in ['page.sku-detail','page.sku-detail.count','page.sku-detail.atomic']:
   tree=sqlglot.parse_one(self.config['queries'][key]['request']['sql'],read='postgres')
   for cte in tree.find_all(exp.CTE):
    if cte.alias=='stock_rows':
     select=sqlglot.parse_one("SELECT d.base AS base,d.sku AS sku,d.demand AS demand,d.allocated AS allocated,d.shortage AS shortage FROM detail_pending AS d WHERE d.base='郑州' AND d.sku='SKU1'",read='postgres')
     with_key='with_' if 'with_' in exp.Select.arg_types else 'with'
     select.set(with_key,cte.this.args[with_key].copy())
     row=dict(self.db.execute(select.sql(dialect='sqlite')).fetchone())
     self.assertEqual((row['demand'],row['allocated']),(100,20));self.assertIsNone(row['shortage'])
 def test_category_rollup_has_no_hidden_category_exclusion(self):
  tree=sqlglot.parse_one(self.config['queries']['page.structure-groups']['request']['sql'],read='postgres')
  self.assertNotIn('饺鲜说',tree.args['where'].sql())

if __name__=='__main__':unittest.main()
