"""Execute complete-scope filters, atomic paging and draft quantities on actual configured SQL."""
import unittest
from test_agent_sql import FcReplenishmentCoverageTests

class QuickFilters(unittest.TestCase):
    def setUp(self):
        self.f = FcReplenishmentCoverageTests()
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)

    def test_positive_actual_brings_zero_recommendation_into_complete_scope(self):
        self.f.db.execute("UPDATE agents_scm_inventory_sku_data_d SET available_qty=10000 WHERE material_code='S1'")
        rows = self.f.read('replenishment.detail', needed_only=True)
        self.assertNotIn('S1', [row['sku'] for row in rows])
        rows = self.f.read('replenishment.detail', needed_only=True, positive_actual_keys=['3:WH1S1'])
        self.assertEqual([row['sku'] for row in rows], ['S1'])
        self.assertEqual(self.f.read('replenishment.count', needed_only=True, positive_actual_keys=['3:WH1S1']), [{'total': 1}])
        atomic = self.f.read('replenishment.detail.atomic', needed_only=True, positive_actual_keys=['3:WH1S1'])
        self.assertEqual(atomic[0]['page_scope_total'], 1)
        self.assertEqual(atomic[0]['sku'], 'S1')

    def test_business_only_keeps_stock_and_plan_but_filters_empty_rows(self):
        self.f.insert('agents_scm_inventory_sku_data_d',month_date='20261019',warehouseid='WH1',material_code='EMPTY',warehouse_classify='20',live_qty=0,available_qty=0,pack_unit_qty=0,freeze_qty=0)
        all_rows = self.f.read('replenishment.detail')
        filtered = self.f.read('replenishment.detail', business_only=True)
        self.assertIn('EMPTY', [row['sku'] for row in all_rows])
        self.assertNotIn('EMPTY', [row['sku'] for row in filtered])
        self.assertEqual({row['sku'] for row in filtered}, {'S1','S2'})
        self.assertEqual(self.f.read('replenishment.count', business_only=True), [{'total': 2}])

    def test_manual_plan_zero_and_positive_results_replace_source_suggestions(self):
        self.assertEqual([row['sku'] for row in self.f.read('replenishment.detail', needed_only=True)], ['S1'])
        self.assertEqual(self.f.read('replenishment.count', needed_only=True, zero_plan_keys=['3:WH1S1']), [{'total': 0}])
        self.f.db.execute("UPDATE agents_scm_inventory_sku_data_d SET available_qty=10000 WHERE material_code='S1'")
        self.assertEqual([row['sku'] for row in self.f.read('replenishment.detail', needed_only=True, positive_plan_keys=['3:WH1S1'])], ['S1'])


    def test_next_month_transfer_only_is_business_activity(self):
        self.f.insert('agents_scm_warehouse_transfer_plan_data_d',warehouse_code='WH1',material_code='TRANSFER_ONLY',warehouse_name='分仓1',material_name='仅调拨',warehouse_month_out_plan=0,warehouse_future30_qty=0,warehouse_month_transfer_plan=12,stat_month='202611')
        rows=self.f.read('replenishment.detail',business_only=True)
        self.assertIn('TRANSFER_ONLY',[row['sku'] for row in rows])
        self.assertEqual(self.f.read('replenishment.count',business_only=True),[{'total':3}])

if __name__ == '__main__': unittest.main()
