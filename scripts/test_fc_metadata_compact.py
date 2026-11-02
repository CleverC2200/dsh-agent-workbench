"""Metadata joins must neither multiply quantities nor transfer another warehouse's labels."""
import unittest
import test_agent_sql


class MetadataScope(unittest.TestCase):
    def setUp(self):
        self.f = test_agent_sql.FcReplenishmentCoverageTests()
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)

    def test_duplicate_history_does_not_multiply_inventory_or_cross_warehouse_labels(self):
        for _ in range(3):
            self.f.insert('agents_scm_material_in_out_summary_d', warehouseid='WH1', material_code='S2', product_categ_name='汤圆', material_group_name='组A')
        self.f.insert('agents_scm_material_in_out_summary_d', warehouseid='WH2', material_code='S2', product_categ_name='面点', material_group_name='组B')
        rows = self.f.read('replenishment.detail.atomic', warehouse_code_mode='equal', warehouse_code='WH1')
        row = next(r for r in rows if r['sku'] == 'S2')
        self.assertEqual(row['inventory_qty'], 80)
        self.assertEqual(row['category'], '汤圆')
        self.assertEqual(row['material_group'], '组A')
        self.assertEqual(row['page_scope_total'], 2)

    def test_ambiguous_category_stays_unknown_and_nonstock_metadata_does_not_become_stock(self):
        for category in ['汤圆', '面点']:
            self.f.insert('agents_scm_material_in_out_summary_d', warehouseid='WH1', material_code='S2', product_categ_name=category)
        self.f.insert('agents_scm_warehouse_transfer_plan_data_d', warehouse_code='WH1', material_code='S3', stat_month='202610')
        self.f.insert('agents_scm_material_in_out_summary_d', warehouseid='WH1', material_code='S3', product_categ_name='汤圆')
        rows = self.f.read('replenishment.detail.atomic', warehouse_code_mode='equal', warehouse_code='WH1')
        for sku in ['S2', 'S3']:
            self.assertIsNone(next(r for r in rows if r['sku'] == sku)['category'])


if __name__ == '__main__':
    unittest.main()
