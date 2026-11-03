"""Compare real configured SQL against the original summary on isolated fixtures."""
import unittest
from test_agent_sql import FcReplenishmentCoverageTests

class CompactOverview(unittest.TestCase):
    def setUp(self):
        self.f = FcReplenishmentCoverageTests()
        self.f.setUp()
        self.addCleanup(self.f.doCleanups)

    def assert_same(self, **values):
        expected = self.f.read('replenishment.summary', **values)
        for row in expected:
            # This count is supplied by the independently authorized order read.
            row.pop('known_shortage_sku_count')
        self.assertEqual(expected, self.f.read('replenishment.overview', **values))

    def test_empty_missing_and_scoped_quantities_match(self):
        self.assert_same()
        self.assert_same(warehouse_code_mode='equal', warehouse_code='WH1')
        self.assert_same(warehouse_code_mode='equal', warehouse_code='MISSING')
        self.f.db.execute('UPDATE agents_scm_inventory_sku_data_d SET available_qty=NULL')
        self.assert_same()

    def test_metadata_duplicates_cannot_multiply_the_compact_summary(self):
        for _ in range(3):
            self.f.insert('agents_scm_material_in_out_summary_d', warehouseid='WH1', material_code='S1',
                          material_name='商品', material_group_name='组', product_categ_name='类')
            self.f.insert('agents_dim_product_list_mi', material_code='S1', material_name='商品', product_item_name='组')
        self.assert_same(cycle_days=14)

if __name__ == '__main__':
    unittest.main()
