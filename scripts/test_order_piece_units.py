"""Counterexamples for EA/件 mixing in shipped card, detail and shortage queries."""
import unittest
from test_base_current_orders import BaseCurrentOrders
from test_fc_current_orders import BranchCurrentOrders
from test_fc_card_scope import BranchCardScope


class PieceUnits(unittest.TestCase):
 def base_fixture(self):
  fixture=BaseCurrentOrders();fixture.setUp();self.addCleanup(fixture.doCleanups);return fixture
 def branch_fixture(self):
  fixture=BranchCurrentOrders();fixture.setUp();self.addCleanup(fixture.doCleanups);return fixture
 def test_base_converts_each_line_before_order_sku_clipping_and_stock_deduction(self):
  f=self.base_fixture()
  f.add('ONE',qtyordered=1600,qtyallocated=800,bizunitconvertrate=16)
  f.add('TWO',qtyordered=600,qtyallocated=300,bizunitconvertrate=12)
  f.db.execute("UPDATE agents_scm_inventory_sku_data_d SET available_qty=60 WHERE warehouseid='W1'")
  r=f.base();self.assertEqual((r['demand'],r['allocated'],r['remaining'],r['shortage']),(150,75,75,15))
  for qid in ['current-shortage.summary','current-shortage.categories','current-shortage.skus']:
   rows=f.read(qid,**({'skus':['SKU1']} if qid.endswith('skus') else {}))
   self.assertEqual(sum(r['demand'] for r in rows),150)
 def test_base_completed_order_compares_ea_with_ea_not_pack_count(self):
  f=self.base_fixture()
  f.add('DONE',qtyordered=1600,qtyallocated=1600,qtyshipped=1600,delivery_qty=100,bizunitconvertrate=16)
  f.add('OPEN',qtyordered=160,qtyallocated=80,bizunitconvertrate=16)
  r=f.base();self.assertEqual((r['demand'],r['allocated']),(10,5))
 def test_business_rate_handles_ea_order_units_and_fractional_pieces(self):
  f=self.base_fixture();f.add('EA',qtyordered=114,qtyallocated=20,bizunitconvertrate=20)
  r=f.base();self.assertAlmostEqual(r['demand'],5.7);self.assertEqual(r['allocated'],1)
 def test_unknown_or_invalid_conversion_never_becomes_raw_ea_or_zero(self):
  for rate in [None,0,-1]:
   with self.subTest(rate=rate):
    f=self.base_fixture();f.add('BAD',qtyordered=1600,qtyallocated=800,bizunitconvertrate=rate)
    f.add('GOOD',pickup_point='PS',qtyordered=120,qtyallocated=60,bizunitconvertrate=12)
    r=f.base();self.assertIsNone(r['demand']);self.assertIsNone(r['shortage'])
    good=next(r for r in f.read() if r['base']=='遂平');self.assertEqual((good['demand'],good['allocated']),(10,5))
 def test_branch_customer_list_and_expanded_lines_convert_business_units(self):
  f=self.branch_fixture()
  f.db.execute('UPDATE agents_scm_execute_detail_d SET qtyallocated=qtyallocated*16,qtyordered=qtyordered*16,bizunitconvertrate=bizunitconvertrate*16')
  row=next(r for r in f.read() if r['order_no']=='O1')
  self.assertEqual((row['ordered'],row['demand'],row['allocated']),(70,70,20))
  line=f.read('branch-current-orders.lines',warehouse_code='BR1',order_no='O1',customer_code='C1')[0]
  self.assertEqual((line['demand'],line['allocated']),(70,20))
 def test_customer_demand_drives_replenishment_after_piece_conversion(self):
  f=BranchCardScope();f.setUp();self.addCleanup(f.doCleanups)
  f.add('DEALER',qtyordered=1600,qtyallocated=800,bizunitconvertrate=16)
  row=next(r for r in f.f.read('replenishment.detail') if r['sku']=='S1')
  # The confirmed reported fields are pieces; warehouse_transfer_qty is not used.
  self.assertEqual((row['current_order_demand'],row['calculation_order_remaining'],row['recommended_qty']),(100,50,125))
  self.assertEqual(row['in_transit'],0)
  f.f.insert('agents_scm_inventory_sku_data_d',month_date='20261019',warehouseid='BASE',warehouse_classify='01',belong_base='基地1',material_code='S1',live_qty=0,available_qty=0)
  f.f.insert('agents_scm_execute_detail_hourly_d',executeorderno='INBOUND',executeorderlineno='1',warehouseid='BASE',receive_wh='WH1',material_code='S1',order_type='ZUB',header_addtime='2026-10-01',load_time='2026-10-20 10:00:00',qtyordered=640,qtyallocated=640,qtyshipped=0,qtysigned=0,bizunitconvertrate=16,packingunitconvertrate=16,packingunitmain='CS',detailstatus=10,orderstatus=60,prapare_order_status='已派未到')
  row=next(r for r in f.f.read('replenishment.detail') if r['sku']=='S1')
  self.assertEqual(row['in_transit'],0)
  f.f.db.execute("UPDATE agents_scm_warehouse_transfer_plan_data_d SET transfer_onway_qty=40 WHERE warehouseid='WH1' AND material_code='S1' AND stat_month='202610'")
  row=next(r for r in f.f.read('replenishment.detail') if r['sku']=='S1')
  self.assertEqual(row['in_transit'],40)
  self.assertEqual((row['current_order_demand'],row['calculation_order_remaining'],row['recommended_qty']),(100,50,85))

if __name__=='__main__':unittest.main()
