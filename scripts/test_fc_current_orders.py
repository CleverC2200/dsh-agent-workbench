"""Delivered pages use downstream customer orders, independently of incoming ASN."""
import json,unittest
from pathlib import Path
import test_branch_customer_orders as customer
ROOT=Path(__file__).resolve().parents[1]
class BranchCurrentOrders(unittest.TestCase):
 def setUp(self):
  self.fixture=customer.CustomerOrders();self.fixture.setUp();self.addCleanup(self.fixture.doCleanups)
  self.db=self.fixture.db;self.config=json.loads((ROOT/'business/inventory-fc/sql.config.json').read_text())
  self.db.execute("UPDATE agents_scm_inventory_sku_data_d SET available_qty=60 WHERE warehouseid='BR1'")
  self.fixture.add('agents_scm_inventory_sku_data_d',month_date='20261102',warehouseid='BR2',warehouse_name='分仓乙',belong_base='基地甲',material_code='SKU',available_qty=10,prod_date='20261001',warehouse_classify='20')
  self.fixture.order('O1',qtyordered=700,qtyallocated=200,bizunitconvertrate=10)
  self.fixture.order('O2',warehouseid='BR2',qtyordered=600,qtyallocated=100,bizunitconvertrate=10)
  self.fixture.order('O3',qtyordered=500,qtyallocated=300,bizunitconvertrate=10,prapare_order_status='备单完成')
 def read(self,key='branch-current-orders.page',**values):
  q=self.config['queries'][key];params=q['request']['parameters'].copy();values={'warehouse_code':'BR1',**values}
  for k,spec in q['parameterSpec'].items():
   if spec['name'] in values:params[k]=values[spec['name']]
  return [dict(r) for r in self.db.execute(q['request']['sql'],params)]
 def test_prepared_and_unprepared_customer_orders_belong_to_shipping_branch(self):
  rows=self.read();self.assertEqual({r['order_no'] for r in rows},{'O1','O3'});self.assertEqual(sum(r['demand'] for r in rows),100)
  self.assertEqual(sum(r['shortage'] for r in rows),0);self.assertEqual(self.read(warehouse_code='BR2')[0]['shortage'],40)
 def test_closed_cancelled_and_transfer_orders_are_excluded(self):
  self.db.execute("UPDATE agents_scm_execute_detail_d SET order_close_time='2026-11-02' WHERE cust_order_no='O1'")
  self.db.execute("UPDATE agents_scm_execute_detail_d SET dmscanceltime='2026-11-02' WHERE cust_order_no='O3'")
  self.fixture.order('TRANSFER',order_type='ZUB');self.assertEqual(self.read()[0]['page_scope_total'],0)
  self.assertIsNone(self.read()[0]['page_row_present'])
 def test_invalid_customer_line_does_not_erase_other_orders(self):
  self.db.execute("UPDATE agents_scm_execute_detail_d SET bizunitconvertrate=NULL WHERE cust_order_no='O1'")
  row=self.read()[0];self.assertEqual(row['order_no'],'O3');self.assertEqual(row['demand'],30)
 def test_paging_search_and_expanded_lines_preserve_customer_pool(self):
  first=self.read(page_size=1);second=self.read(page_size=1,offset=1)
  self.assertEqual(first[0]['page_scope_total'],2);self.assertNotEqual(first[0]['order_no'],second[0]['order_no'])
  rows=self.read(search_pattern='%O1%');self.assertEqual(rows[0]['page_scope_total'],1)
  line=self.read('branch-current-orders.lines',order_no='O1',customer_code='C1')[0]
  self.assertEqual((line['demand'],line['allocated'],line['shortage']),(70,20,0))
 def load_snapshot(self):
  rows=self.fixture.read('customer_current_lines')
  mapped=[{customer.mod.LINES_MAP.get(k,k):v for k,v in r.items()} for r in rows]
  cols=list(mapped[0]);numeric={'current_'+k for k in ['ordered','demand','allocated','shipped','remaining','shortage']}
  self.db.execute('CREATE TABLE agents_inv_order_summary_day (inv_batch_id TEXT, inv_variant_id TEXT, '+', '.join(c+(' REAL' if c in numeric else ' TEXT') for c in cols)+')')
  for row in mapped:self.fixture.add('agents_inv_order_summary_day',inv_batch_id='UNPUBLISHED_BATCH',inv_variant_id='BRANCH_CUSTOMER_LINES',**row)
 def test_small_shortages_are_included_in_raw_and_snapshot_filters(self):
  self.db.execute("UPDATE agents_scm_inventory_sku_data_d SET available_qty=49 WHERE warehouseid='BR1'")
  self.load_snapshot()
  for key in ['branch-current-orders.page','snapshot.branch-current-orders.page']:
   with self.subTest(key=key):
    rows=self.read(key,shortage_only=True)
    self.assertEqual(rows[0]['page_scope_total'],1)
    self.assertEqual((rows[0]['order_no'],rows[0]['shortage']),('O1',1))
 def test_warehouse_name_and_code_filters_apply_to_raw_and_snapshot(self):
  self.load_snapshot()
  for key in ['branch-current-orders.page','snapshot.branch-current-orders.page']:
   for term in ['%乙%','%br2%']:
    with self.subTest(key=key,term=term):
     rows=self.read(key,warehouse_code=None,warehouse_search_pattern=term)
     self.assertEqual(rows[0]['page_scope_total'],1)
     self.assertEqual(rows[0]['warehouse_code'],'BR2')
   self.assertEqual(self.read(key,warehouse_code=None,warehouse_search_pattern='%不存在%')[0]['page_scope_total'],0)
 def test_unknown_line_shortage_does_not_erase_valid_line_in_same_order(self):
  self.db.execute("UPDATE agents_scm_inventory_sku_data_d SET available_qty=49 WHERE warehouseid='BR1'")
  for qty in [1,2]:
   self.fixture.add('agents_scm_inventory_sku_data_d',month_date='20261102',warehouseid='BR1',warehouse_name='分仓甲',belong_base='基地甲',material_code='BAD',available_qty=qty,prod_date='20261001',warehouse_classify='20')
  self.fixture.order('O1-BAD',cust_order_no='O1',material_code='BAD')
  self.load_snapshot()
  for key in ['branch-current-orders.page','snapshot.branch-current-orders.page']:
   with self.subTest(key=key):
    row=self.read(key,shortage_only=True)[0]
    self.assertEqual((row['order_no'],row['shortage'],row['sku_count']),('O1',1,2))
if __name__=='__main__':unittest.main()
