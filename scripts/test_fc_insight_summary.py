"""Exercise the shipped whole-scope evidence SQL, not a separate insight formula."""
import unittest
from test_fc_card_scope import BranchCardScope

class InsightSummary(BranchCardScope):
 def test_order_adjusted_evidence_retains_unknown_target_coverage(self):
  self.add('INSIGHT')
  row=self.f.read('replenishment.summary')[0]
  self.assertEqual(row['known_inventory_deviation_qty'],-75)
  self.assertEqual(row['comparable_sku_count'],1)
  self.assertEqual(row['missing_target_count'],1)
  self.assertEqual(row['known_shortage_sku_count'],0)
  self.assertEqual(row['comparable_target_inventory_qty'],100)

if __name__=='__main__':unittest.main()
