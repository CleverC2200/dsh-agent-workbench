"""D120: opposite entries for the same warehouse/SKU/production date net before aging."""
import unittest
import test_batch_age_lists as fixtures


class NetBatchBalances(unittest.TestCase):
    setUp = fixtures.BatchAgeLists.setUp
    batch = fixtures.BatchAgeLists.batch
    sales = fixtures.BatchAgeLists.sales
    read = fixtures.BatchAgeLists.read

    def test_reversed_old_batches_do_not_age_current_stock(self):
        self.batch(294, 5697, sku='REVERSED')
        self.batch(294, -5697, sku='REVERSED')
        self.batch(7, 3015, sku='LIVE')
        for query in ['batch-age.groups', 'page.health-groups', 'health.cards']:
            with self.subTest(query=query):
                row = self.read(query_id=query, stat_date='2026-10-22')[0]
                self.assertEqual(row['age_weight_qty'], 3015)
                self.assertAlmostEqual(row['average_age'], 7)
                self.assertEqual(row['max_age'], 7)
                if 'age0_30' in row:
                    self.assertEqual(row['total_qty'], 3015)
                    self.assertEqual(row['age0_30'], 3015)
                    self.assertEqual(row['age60_plus'], 0)

    def test_partial_same_batch_reversal_retains_only_its_net_weight(self):
        self.batch(90, 100, sku='S')
        self.batch(90, -80, sku='S')
        self.batch(10, 80, sku='S')
        row = self.read(query_id='batch-age.groups')[0]
        self.assertEqual(row['total_qty'], 100)
        self.assertEqual(row['age_weight_qty'], 100)
        self.assertEqual(row['age60_plus'], 20)
        self.assertEqual(row['age0_30'], 80)
        self.assertAlmostEqual(row['average_age'], 26)

    def test_shared_base_branch_and_chain_paths_use_net_batch_weights(self):
        for kind in ['01', '20']:
            self.batch(294, 100, sku='OLD', kind=kind, warehouse=kind)
            self.batch(294, -100, sku='OLD', kind=kind, warehouse=kind)
            self.batch(7, 30, sku='NEW', kind=kind, warehouse=kind)
        for agent, query, quantity in [
            ('aqkc', 'batch-age.atomic', 30),
            ('fc', 'batch-age.atomic', 30),
            ('qll', 'batch-age.atomic', 60),
            ('fc', 'health.cards', 30),
            ('qll', 'health.cards', 30),
            ('qll', 'branch-health.cards', 30),
        ]:
            with self.subTest(agent=agent, query=query):
                row = self.read(agent=agent, query_id=query, stat_date='2026-10-22')[0]
                self.assertEqual(row['age_weight_qty'], quantity)
                self.assertEqual(row['average_age'], 7)
                self.assertEqual(row['max_age'], 7)

    def test_reversal_does_not_cancel_other_skus_warehouses_or_production_dates(self):
        self.batch(90, 100, sku='A')
        self.batch(90, -100, sku='B')
        self.batch(90, -100, sku='A', warehouse='OTHER')
        self.batch(10, -100, sku='A')
        row = self.read(query_id='batch-age.groups', warehouse_code='W', material_code='A')[0]
        self.assertEqual(row['age60_plus'], 100)
        self.assertEqual(row['age_weight_qty'], 100)
        self.assertEqual(row['average_age'], 90)


if __name__ == '__main__':
    unittest.main()
