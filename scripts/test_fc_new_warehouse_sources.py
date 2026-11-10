"""Execute FC quantities against independent old/new source fixtures."""
import importlib.util,json,sqlite3,unittest
from pathlib import Path
import sqlglot
from sqlglot import exp
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('migration',ROOT/'scripts/update-fc-warehouse-sources.py');migration=importlib.util.module_from_spec(spec);spec.loader.exec_module(migration)
spec=importlib.util.spec_from_file_location('customer',ROOT/'scripts/update-branch-customer-orders.py');customer=importlib.util.module_from_spec(spec);spec.loader.exec_module(customer)
class WarehouseSources(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row;self.addCleanup(self.db.close)
  self.db.create_function('CONCAT',-1,lambda *xs:''.join(str(x or '') for x in xs))
  self.tree=sqlglot.parse_one((ROOT/'business/inventory-fc/customer-orders-source.sql').read_text())
  schema={}
  for query in self.tree.find_all(exp.Select):
   tables={t.alias_or_name:t.name for t in query.find_all(exp.Table) if t.name.startswith('agents_')}
   for col in query.find_all(exp.Column):
    if col.table in tables:schema.setdefault(tables[col.table],set()).add(col.name)
  numeric={'available_qty','live_qty','pack_unit_qty','freeze_qty','warehouse_transfer_qty','transfer_onway_qty','transfer_prepare_qty','adjust_order_qty','pack_unitqty','delivery_qty','bizunitconvertrate','detailstatus','executeorderlineno'}
  for table,cols in schema.items():
   self.db.execute('CREATE TABLE '+table+' ('+', '.join(c+(' REAL' if c in numeric or c.startswith('qty') else ' TEXT') for c in sorted(cols))+')')
  self.stock('BR1','SKU')
 def add(self,table,**values):
  self.db.execute('INSERT INTO '+table+' ('+','.join(values)+') VALUES ('+','.join('?' for _ in values)+')',list(values.values()))
 def stock(self,warehouse,sku):
  self.add('agents_scm_inventory_sku_data_d',warehouseid=warehouse,warehouse_name='分仓',warehouse_classify='20',month_date='20261110',material_code=sku,available_qty=999)
  self.add(migration.TOTAL,warehouseid=warehouse,material_code=sku,material_name='商品',live_qty=40,available_qty=10,pack_unit_qty=30,freeze_qty=0,warehouse_transfer_qty=25,transfer_prepare_qty=20,transfer_onway_qty=5)
 def order(self,key,**override):
  values=dict(executeorderno=key,executeorderlineno=1,organizationid='ORG',ownerid='OWNER',warehouseid='BR1',material_code='SKU',cust_order_no=key,cust_code='CUSTOMER',header_addtime='2026-11-10',detailstatus=10,order_type='ZO11',qtyordered=200,qtyallocated=50,qtyshipped=0,bizunitconvertrate=10,adjust_order_qty=20,pack_unitqty=5,delivery_qty=0)
  self.add(migration.EXEC,**(values|override))
 def read(self,cte='customer_current'):
  return [dict(r) for r in self.db.execute(customer.render(customer.select_cte(self.tree,cte)))]
 def test_piece_fields_are_not_converted_twice_and_old_stock_is_not_used(self):
  self.order('O1');self.order('O2');row=self.read()[0]
  self.assertEqual((row['demand'],row['allocated'],row['remaining'],row['available'],row['shortage']),(40,10,30,10,20))
  self.assertEqual(sum(r['shortage'] for r in self.read('customer_current_lines')),20)
 def test_invalid_cancelled_and_transfer_rows_do_not_hide_good_orders(self):
  self.order('GOOD');self.order('BAD',adjust_order_qty=None);self.order('CANCELLED',dmscanceltime='2026-11-10');self.order('TRANSFER',order_type='ZUB')
  self.assertEqual(self.read()[0]['demand'],20)
 def test_complete_execution_identity_preserves_separate_organizations(self):
  self.order('SAME',cust_order_no='FIRST');self.order('SAME',organizationid='OTHER',cust_order_no='SECOND')
  self.assertEqual(self.read()[0]['demand'],40)
 def test_duplicate_source_keys_never_multiply_stock(self):
  self.add(migration.TOTAL,warehouseid='BR1',material_code='SKU',live_qty=999,available_qty=999)
  self.stock('BR2','GOOD')
  rows=[dict(r) for r in self.db.execute(migration.unique_total())]
  self.assertIsNone(next(r for r in rows if r['material_code']=='SKU')['live_qty'])
  self.assertEqual(next(r for r in rows if r['material_code']=='GOOD')['live_qty'],40)
 def test_branch_exclusions_are_retained(self):
  for wh in ['N436','Y204']:
   self.stock(wh,'SKU');self.order(wh,warehouseid=wh)
  self.order('GOOD');self.assertEqual(sum(r['demand'] or 0 for r in self.read()),20)
 def test_stock_quantity_is_not_multiplied_by_lot_rows(self):
  self.add('agents_scm_inventory_sku_data_d',warehouseid='BR1',warehouse_name='分仓',warehouse_classify='20',month_date='20261110',material_code='SKU',available_qty=1000)
  self.order('GOOD');self.assertEqual(self.read()[0]['available'],10)
 def test_latest_total_zero_is_not_replaced_with_old_positive_stock(self):
  self.db.execute('UPDATE '+migration.TOTAL+' SET available_qty=0')
  self.order('GOOD');row=self.read()[0]
  self.assertEqual((row['available'],row['remaining'],row['shortage']),(0,15,15))
 def test_missing_latest_total_quantity_does_not_fall_back_to_old_stock(self):
  self.db.execute('UPDATE '+migration.TOTAL+' SET available_qty=NULL')
  self.order('GOOD');row=self.read()[0]
  self.assertIsNone(row['available']);self.assertIsNone(row['shortage'])
  self.assertEqual(row['invalid'],1)
 def test_prepared_orders_use_upstream_adjusted_demand(self):
  self.order('PREPARED',prapare_order_status='备单完成',adjust_order_qty=5)
  row=self.read()[0];self.assertEqual((row['demand'],row['allocated'],row['remaining']),(5,5,0))
if __name__=='__main__':unittest.main()
