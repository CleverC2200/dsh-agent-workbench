"""Exercise shipped branch card SQL against foreign warehouse and mixed-unit fixtures."""
import unittest
import json
from pathlib import Path
from importlib.util import spec_from_file_location,module_from_spec
import test_agent_sql as fixtures

class BranchCardScope(unittest.TestCase):
 def setUp(self):
  self.f=fixtures.FcReplenishmentCoverageTests();self.f.setUp();self.addCleanup(self.f.doCleanups)
  self.f.db.execute("UPDATE agents_scm_execute_detail_d SET qtyordered=1,delivery_qty=1")
  self.f.insert('agents_scm_material_in_out_summary_d',warehouseid='WH1',pickup_point='P1',material_code='S1',product_categ_name='面点')
 def add(self,order,**changes):
  data=dict(cust_order_no=order,cust_code='C',material_code='S1',material_name='商品1',pickup_point='P1',pickup_point_name='分仓1',belong_base='基地1',bizflowstatus='等待组波',adjust_order_qty=10,qtyordered=100,qtyallocated=20,delivery_qty=0,detailstatus=10)
  data.update(changes);self.f.insert('agents_scm_execute_detail_d',**data)
 def test_foreign_base_and_unclassified_plan_warehouses_never_enter_branch_totals(self):
  self.f.insert('agents_scm_inventory_sku_data_d',month_date='20261019',warehouseid='BASE',warehouse_classify='01',material_code='S1',live_qty=100,available_qty=100)
  for w in ['BASE','UNKNOWN']:
   self.f.insert('agents_scm_warehouse_transfer_plan_data_d',warehouse_code=w,material_code='S1',warehouse_name=w,stat_month='202610',warehouse_month_out_plan=310,warehouse_future30_qty=300,warehouse_transfer_qty=1000000,transfer_onway_qty=900000,transfer_prepare_qty=100000)
  row=self.f.read('replenishment.summary')[0]
  self.assertEqual((row['warehouse_count'],row['known_in_transit'],row['known_preparing']),(1,20,20))
  detail=self.f.read('replenishment.detail');self.assertEqual({r['warehouse_code'] for r in detail},{'WH1'})
 def test_unprepared_allocation_uses_only_valid_unshipped_branch_orders_in_ea(self):
  self.add('OPEN')
  for order,values in [('VOID',dict(detailstatus=20)),('CANCEL',dict(canceltime='2026-10-19')),('CLOSED',dict(order_close_time='2026-10-19')),('WMS',dict(wms_close_time='2026-10-19')),('SHIPPED',dict(delivery_qty=100)),('PREPARED',dict(bizflowstatus='OCP已下发',qtyallocated=100))]:self.add(order,**values)
  row=self.f.read('current-shortage.summary')[0]
  self.assertEqual((row['demand'],row['allocated'],row['remaining'],row['shortage']),(100,20,80,55))
  detail=next(r for r in self.f.read('replenishment.detail') if r['sku']=='S1')
  self.assertEqual((detail['current_order_demand'],detail['current_order_allocated'],detail['calculation_order_remaining']),(100,20,80))
  self.assertEqual(detail['recommended_qty'],115)
 def test_unknown_sku_does_not_erase_calculable_replenishment(self):
  row=self.f.read('replenishment.summary')[0]
  self.assertIsNone(row['recommended_qty']);self.assertEqual(row['known_recommended_qty'],35)
  self.assertEqual((row['calculated_sku_count'],row['missing_calculation_count']),(1,1))
 def test_scoped_regeneration_is_idempotent(self):
  root=Path(__file__).resolve().parents[1];spec=spec_from_file_location('cards',root/'scripts/update-fc-card-scope.py');module=module_from_spec(spec);spec.loader.exec_module(module)
  before=json.dumps(self.f.config,sort_keys=True);module.update(self.f.config);self.assertEqual(json.dumps(self.f.config,sort_keys=True),before)

if __name__=='__main__':unittest.main()
