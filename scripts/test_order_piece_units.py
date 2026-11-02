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
 def test_branch_list_and_expanded_lines_use_asn_pieces_and_convert_base_occupancy(self):
  f=self.branch_fixture()
  f.db.execute('UPDATE agents_scm_execute_detail_hourly_d SET qtyallocated=qtyallocated*16,qtyordered=qtyordered*16,bizunitconvertrate=bizunitconvertrate*16')
  row=next(r for r in f.read() if r['order_no']=='O1')
  self.assertEqual((row['ordered'],row['demand'],row['allocated']),(70,70,20))
  line=f.read('branch-current-orders.lines',warehouse_code='BR1',order_no='O1',customer_code='基地甲')[0]
  self.assertEqual((line['demand'],line['allocated']),(70,20))
 def test_customer_orders_cannot_inflate_branch_incoming_supply_or_replenishment(self):
  f=BranchCardScope();f.setUp();self.addCleanup(f.doCleanups)
  f.add('DEALER',qtyordered=1600,qtyallocated=800,bizunitconvertrate=16)
  row=next(r for r in f.f.read('replenishment.detail') if r['sku']=='S1')
  self.assertEqual((row['current_order_demand'],row['calculation_order_remaining'],row['recommended_qty']),(0,0,35))

if __name__=='__main__':unittest.main()
