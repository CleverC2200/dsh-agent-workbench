"""Replenishment must use actual receiving-branch transfers, not stale plan totals."""
import unittest
import test_agent_sql as fixtures


class TransferExecutionInventory(unittest.TestCase):
    def setUp(self):
        self.f = fixtures.FcReplenishmentCoverageTests()
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)
        for table in ['agents_scm_execute_detail_d', 'agents_scm_execute_detail_hourly_d']:
            existing = {row[1] for row in self.f.db.execute('PRAGMA table_info(' + table + ')')}
            for name, kind in [('qtysigned', 'REAL'), ('header_addtime', 'TEXT'),
                               ('order_close_time', 'TEXT'), ('belong_base', 'TEXT')]:
                if name not in existing:
                    self.f.db.execute('ALTER TABLE ' + table + ' ADD COLUMN ' + name + ' ' + kind)
        self.f.insert('agents_scm_inventory_sku_data_d', month_date='20261019', warehouseid='BASE',
                      warehouse_classify='01', belong_base='基地1', material_code='S1',
                      live_qty=0, available_qty=0)

    def transfer(self, table='agents_scm_execute_detail_hourly_d', **changes):
        row = dict(executeorderno='TRANSFER-1', executeorderlineno='1', warehouseid='BASE',
                   receive_wh='WH1', material_code='S1', material_name='商品1', order_type='ZUB',
                   header_addtime='2026-10-01', load_time='2026-10-20 10:00:00', qtyordered=60,
                   qtyallocated=60, qtyshipped=0, qtysigned=0, bizunitconvertrate=12,
                   packingunitconvertrate=12, packingunitmain='CS', detailstatus=10,
                   orderstatus=60, prapare_order_status='已派未到', belong_base='基地1')
        row.update(changes)
        self.f.insert(table, **row)

    def sku(self, sku='S1'):
        return next(row for row in self.f.read('replenishment.detail') if row['sku'] == sku)

    def test_dispatched_unreceived_uses_allocated_cases_even_before_wms_shipping(self):
        self.transfer()
        self.assertEqual(self.sku()['in_transit'], 5)
        self.assertEqual(self.sku()['preparing'], 0)
        self.assertEqual(self.sku()['open_transfer_reported_qty'], 5)

    def test_wms_outbound_completion_does_not_remove_unreceived_goods(self):
        self.transfer(qtyordered=2000, qtyallocated=2000, qtyshipped=2000, qtysigned=0,
                      bizunitconvertrate=10, packingunitconvertrate=10,
                      prapare_order_status='运输中', orderstatus=100,
                      wms_close_time='2026-10-20 01:20:06')
        row=self.sku()
        self.assertEqual((row['in_transit'],row['preparing']),(200,0))

    def test_wms_outbound_partial_receipt_only_keeps_the_unreceived_balance(self):
        self.transfer(qtyshipped=60, qtysigned=24, prapare_order_status='运输中',
                      orderstatus=100, wms_close_time='2026-10-20')
        self.assertEqual(self.sku()['in_transit'],3)

    def test_stale_plan_totals_do_not_create_transfers_without_execution_orders(self):
        self.assertEqual(self.sku()['in_transit'], 0)
        self.assertEqual(self.sku()['preparing'], 0)

    def test_preparing_and_partially_received_quantities_are_not_counted_twice(self):
        self.transfer(qtysigned=12)
        self.transfer(executeorderno='PREPARE', qtyallocated=24, prapare_order_status='已开未派')
        row = self.sku()
        self.assertEqual((row['in_transit'], row['preparing'], row['open_transfer_reported_qty']), (4, 2, 6))

    def test_latest_hourly_cancellation_supersedes_the_daily_dispatch(self):
        self.transfer('agents_scm_execute_detail_d', load_time='2026-10-20 08:00:00')
        self.transfer(canceltime='2026-10-20 09:00:00')
        self.assertEqual(self.sku()['in_transit'], 0)

    def test_closed_signed_and_non_base_shipments_are_excluded(self):
        for change in [dict(prapare_order_status='已签收'), dict(order_close_time='2026-10-20'),
                       dict(warehouseid='WH1')]:
            self.transfer(executeorderno=str(change), **change)
        self.assertEqual(self.sku()['in_transit'], 0)

    def test_identical_duplicates_do_not_double_count_and_conflicts_only_omit_the_bad_line(self):
        self.transfer()
        self.transfer()
        self.transfer(executeorderno='CONFLICT', qtyallocated=120)
        self.transfer(executeorderno='CONFLICT', qtyallocated=180)
        self.assertEqual(self.sku()['in_transit'], 5)

    def test_transfer_only_sku_is_retained_without_inventory_or_plan_rows(self):
        self.transfer(material_code='TRANSFER-ONLY')
        self.assertEqual(self.sku('TRANSFER-ONLY')['in_transit'], 5)



    def test_null_quantity_is_zero_and_one_negative_line_does_not_poison_others(self):
        self.transfer(qtysigned=None, qtyshipped=None)
        self.transfer(executeorderno='BAD', qtyallocated=-12)
        self.assertEqual(self.sku()['in_transit'],5)

    def test_latest_signed_record_supersedes_daily_dispatch(self):
        self.transfer('agents_scm_execute_detail_d', load_time='2026-10-20 08:00:00')
        self.transfer(prapare_order_status='已签收')
        self.assertEqual(self.sku()['in_transit'],0)

    def test_no_execution_source_is_unknown_instead_of_a_plan_or_zero(self):
        self.f.db.execute('DELETE FROM agents_scm_execute_detail_d')
        self.f.db.execute('DELETE FROM agents_scm_execute_detail_hourly_d')
        self.assertIsNone(self.sku()['in_transit'])
        self.assertIsNone(self.sku()['preparing'])


    def test_actual_incoming_transfer_is_subtracted_from_replenishment_once(self):
        self.transfer()
        self.transfer(executeorderno='PREPARING',qtyallocated=24,prapare_order_status='已开未派')
        row=self.sku()
        self.assertEqual((row['in_transit'],row['preparing']),(5,2))
        self.assertEqual(row['recommended_qty'],68)

    def test_existing_plan_list_keeps_real_transfer_skus_without_monthly_plan(self):
        self.transfer(material_code='WITHOUT-PLAN',prapare_order_status='已开未派')
        rows=self.f.read('transfer_plan.detail',page_size=200)
        row=next(r for r in rows if r['sku']=='WITHOUT-PLAN')
        self.assertEqual((row['warehouse_code'],row['preparing'],row['source_rows']),('WH1',5,0))
        self.assertIsNone(row['month_out_plan'])
        self.assertIsNone(row['daily_plan'])

if __name__ == '__main__':
    unittest.main()
