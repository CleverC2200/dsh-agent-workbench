"""Current transfer cards and replenishment use the confirmed monthly piece quantities."""
import unittest
import test_agent_sql as fixtures


class CurrentTransferStatus(unittest.TestCase):
    def setUp(self):
        self.f = fixtures.FcReplenishmentCoverageTests()
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        self.f.db.execute('UPDATE agents_scm_warehouse_transfer_plan_data_d SET transfer_onway_qty=20,transfer_prepare_qty=20')

    def sku(self):
        return next(r for r in self.f.read('replenishment.detail') if r['sku'] == 'S1')

    def test_current_month_reported_quantities_are_pieces_without_conversion(self):
        self.f.db.execute("UPDATE agents_scm_warehouse_transfer_plan_data_d SET transfer_onway_qty=3207,transfer_prepare_qty=12")
        r = self.sku()
        self.assertEqual((r['in_transit'], r['preparing'], r['open_transfer_reported_qty']), (3207, 12, 3219))

    def test_historical_open_execution_orders_do_not_override_current_reported_values(self):
        self.f.insert('agents_scm_inventory_sku_data_d', month_date='20261019', warehouseid='BASE', warehouse_classify='01', belong_base='基地1', material_code='S1', live_qty=0, available_qty=0)
        self.f.insert('agents_scm_execute_detail_d', executeorderno='OLD-2022', executeorderlineno='1', receive_wh='WH1', warehouseid='BASE', material_code='S1', header_addtime='2022-04-01', qtyordered=11265, qtyallocated=11265, qtyshipped=11265, qtysigned=0, bizunitconvertrate=1, packingunitmain='CS', detailstatus=10, order_type='ZUB', prapare_order_status='运输中')
        self.assertEqual(self.sku()['in_transit'], 20)

    def test_same_values_on_duplicate_rows_are_counted_once(self):
        self.f.db.execute('INSERT INTO agents_scm_warehouse_transfer_plan_data_d SELECT * FROM agents_scm_warehouse_transfer_plan_data_d')
        self.assertEqual((self.sku()['in_transit'], self.sku()['preparing']), (20, 20))

    def test_invalid_quantity_is_ignored_without_losing_other_valid_fields(self):
        self.f.db.execute("UPDATE agents_scm_warehouse_transfer_plan_data_d SET transfer_onway_qty=-1")
        self.assertIsNone(self.sku()['in_transit'])
        self.assertEqual(self.sku()['preparing'], 20)

    def test_conflicting_quantity_does_not_poison_the_other_metric(self):
        self.f.insert('agents_scm_warehouse_transfer_plan_data_d', warehouseid='WH1', material_code='S1', stat_month='202610', transfer_onway_qty=40, transfer_prepare_qty=20)
        self.assertIsNone(self.sku()['in_transit'])
        self.assertEqual(self.sku()['preparing'], 20)

    def test_other_month_and_warehouse_do_not_add_to_current_values(self):
        self.f.insert('agents_scm_warehouse_transfer_plan_data_d', warehouseid='WH1', material_code='S1', stat_month='202609', transfer_onway_qty=900, transfer_prepare_qty=800)
        self.f.insert('agents_scm_warehouse_transfer_plan_data_d', warehouseid='OTHER', material_code='S1', stat_month='202610', transfer_onway_qty=700, transfer_prepare_qty=600)
        self.assertEqual((self.sku()['in_transit'], self.sku()['preparing']), (20, 20))

    def test_missing_reported_quantity_is_unknown_and_zero_is_preserved(self):
        self.f.db.execute("UPDATE agents_scm_warehouse_transfer_plan_data_d SET transfer_onway_qty=NULL,transfer_prepare_qty=0")
        self.assertIsNone(self.sku()['in_transit'])
        self.assertEqual(self.sku()['preparing'], 0)

    def test_replenishment_deducts_reported_transfers_once(self):
        self.f.db.execute("UPDATE agents_scm_warehouse_transfer_plan_data_d SET transfer_onway_qty=5,transfer_prepare_qty=2")
        r = self.sku()
        self.assertEqual(r['open_transfer_reported_qty'], 7)
        self.assertEqual(r['recommended_qty'], 68)


if __name__ == '__main__':
    unittest.main()
