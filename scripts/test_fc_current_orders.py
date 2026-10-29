"""Execute branch-owned open-order queries, including prepared and partially shipped orders."""
import json
from pathlib import Path
import sqlite3
import unittest
import sqlglot
ROOT = Path(__file__).resolve().parents[1]

class BranchCurrentOrders(unittest.TestCase):
 def setUp(self):
  self.config=json.loads((ROOT/'business/inventory-fc/sql.config.json').read_text())
  self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row;self.addCleanup(self.db.close)
  self.db.execute('CREATE TABLE agents_scm_inventory_sku_data_d(month_date TEXT,warehouseid TEXT,warehouse_name TEXT,belong_base TEXT,material_code TEXT,material_name TEXT,prod_date TEXT,sap_warehouseid TEXT,plant TEXT,quality_batch TEXT,is_good_prod TEXT,warehouse_classify TEXT,available_qty REAL)')
  self.db.execute('CREATE TABLE agents_scm_material_in_out_summary_d(warehouseid TEXT,pickup_point TEXT)')
  self.db.execute('CREATE TABLE agents_scm_execute_detail_d(cust_order_no TEXT,executeorderno TEXT,cust_code TEXT,cust_name TEXT,material_code TEXT,material_name TEXT,pickup_point TEXT,requireddeliverytime TEXT,header_addtime TEXT,order_qty_convert REAL,bizunitconvertrate REAL,qtyshipped REAL,qtyordered REAL,qtyallocated REAL,delivery_qty REAL,bizflowstatus TEXT,detailstatus INTEGER,order_close_time TEXT,wms_close_time TEXT,canceltime TEXT)')
  for warehouse,point,kind in [('W1','P1','20'),('W2','P2','20'),('BASE','PB','01')]:
   self.db.execute('INSERT INTO agents_scm_inventory_sku_data_d(month_date,warehouseid,warehouse_name,belong_base,warehouse_classify) VALUES(?,?,?,?,?)',('20261028',warehouse,warehouse,'B',kind))
   self.db.execute('INSERT INTO agents_scm_material_in_out_summary_d VALUES(?,?)',(warehouse,point))
 def add(self,order,**changes):
  row=dict(cust_order_no=order,executeorderno='E'+order,cust_code='C1',cust_name='客户一',material_code='SKU1',material_name='商品',pickup_point='P1',requireddeliverytime='2026-10-29',header_addtime='2024-01-01',order_qty_convert=100,qtyordered=100,qtyallocated=50,delivery_qty=0,bizflowstatus='等待组波',detailstatus=10,order_close_time=None,wms_close_time=None,canceltime=None)
  row.update(changes);row.setdefault('bizunitconvertrate',1);row.setdefault('qtyshipped',row['delivery_qty']);self.db.execute('INSERT INTO agents_scm_execute_detail_d('+','.join(row)+') VALUES('+','.join('?' for _ in row)+')',list(row.values()))
 def read(self,key='branch-current-orders.page',**values):
  q=self.config['queries'][key];p=q['request']['parameters'].copy()
  for name,value in values.items():p[next(k for k,v in q['parameterSpec'].items() if v['name']==name)]=value
  sql=sqlglot.parse_one(q['request']['sql'],read='postgres').sql(dialect='sqlite')
  return [dict(r) for r in self.db.execute(sql,p)]
 def test_unprepared_prepared_and_partial_orders_belong_to_the_selected_branch(self):
  self.add('OPEN');self.add('PREPARED',bizflowstatus='OCP已下发',qtyallocated=100)
  self.add('PART',material_code='S1',qtyordered=50,order_qty_convert=50,delivery_qty=50)
  self.add('PART',material_code='S2',qtyordered=60,order_qty_convert=60,delivery_qty=10)
  self.add('SHIPPED',delivery_qty=100);self.add('OTHER',pickup_point='P2');self.add('FACTORY',pickup_point='PB')
  rows=self.read(warehouse_code='W1');self.assertEqual({r['order_no'] for r in rows},{'OPEN','PREPARED','PART'})
  prepared=next(r for r in rows if r['order_no']=='PREPARED');self.assertEqual(prepared['remaining'],0);self.assertEqual(prepared['satisfaction'],1)
  partial=next(r for r in rows if r['order_no']=='PART');self.assertEqual(partial['ordered'],110);self.assertEqual(partial['shipped'],60);self.assertEqual(partial['sku_count'],2)
  lines=self.read('branch-current-orders.lines',warehouse_code='W1',order_no='PART',customer_code='C1');self.assertEqual({r['sku'] for r in lines},{'S1','S2'})
  self.assertEqual(self.read(warehouse_code='W2')[0]['order_no'],'OTHER')
 def test_cancelled_closed_void_and_fully_shipped_orders_are_excluded(self):
  for order,values in [('VOID',{'detailstatus':20}),('CANCEL',{'canceltime':'2026-10-28'}),('CLOSE',{'order_close_time':'2026-10-28'}),('WMS',{'wms_close_time':'2026-10-28'}),('SHIPPED',{'delivery_qty':110})]:self.add(order,**values)
  row=self.read()[0];self.assertEqual(row['page_scope_total'],0);self.assertIsNone(row['page_row_present'])
 def test_missing_quantities_stay_unknown_and_allocated_orders_without_stock_remain_visible(self):
  self.add('UNKNOWN',qtyallocated=None,delivery_qty=None);self.add('ZERO',qtyallocated=100,order_qty_convert=2.94)
  rows=self.read(warehouse_code='W1');unknown=next(r for r in rows if r['order_no']=='UNKNOWN');self.assertIsNone(unknown['remaining']);self.assertIsNone(unknown['shipped']);self.assertIsNone(unknown['satisfaction'])
  zero=next(r for r in rows if r['order_no']=='ZERO');self.assertEqual(zero['ordered'],100);self.assertEqual(zero['remaining'],0)
  filtered=self.read(warehouse_code='W1',shortage_only=True);self.assertEqual(filtered[0]['page_scope_total'],0)
 def test_customer_search_scope_pagination_and_order_detail_do_not_cross_orders(self):
  self.add('AA');self.add('BB',cust_code='C2',cust_name='客户二');self.add('AA',pickup_point='P2',cust_code='C1')
  self.assertEqual(self.read(warehouse_code='W1',customer_code='C2')[0]['order_no'],'BB')
  self.assertEqual(self.read(warehouse_code='W1',search_pattern='%客户一%')[0]['order_no'],'AA')
  rows=self.read(warehouse_code='W1',page_size=1,offset=1);self.assertEqual(rows[0]['page_scope_total'],2);self.assertEqual(rows[0]['order_no'],'BB')
  lines=self.read('branch-current-orders.lines',warehouse_code='W1',order_no='AA',customer_code='C1');self.assertEqual(len(lines),1);self.assertEqual(lines[0]['warehouse_code'],'W1')

if __name__=='__main__':unittest.main()
