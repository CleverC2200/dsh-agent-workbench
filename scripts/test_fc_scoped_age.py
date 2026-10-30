"""Selected warehouse cards use only its own batches and preserve unknown age."""
import unittest
from test_batch_age_lists import BatchAgeLists

class ScopedAge(BatchAgeLists):
 def test_selected_branch_does_not_average_or_count_another_branch(self):
  self.batch(10,90,warehouse='A',kind='20');self.batch(100,10,warehouse='A',kind='20')
  self.batch(800,1000,warehouse='B',kind='20')
  card=self.read(agent='fc',query_id='health.cards',stat_date='2026-10-22',warehouse_code='A')[0]
  stock=self.read(agent='fc',query_id='health.inventory',stat_date='2026-10-22',warehouse_code='A')[0]
  self.assertEqual(card['average_age'],19)
  self.assertEqual(card['total_qty'],100)
  self.assertEqual(stock['total_qty'],100)
  all_card=self.read(agent='fc',query_id='health.cards',stat_date='2026-10-22')[0]
  self.assertEqual(all_card['total_qty'],1100)
 def test_invalid_batch_age_keeps_selected_stock_and_valid_age_weights(self):
  self.batch(20,10,warehouse='A',kind='20');self.batch(None,7,warehouse='A',kind='20')
  self.batch(100,999,warehouse='B',kind='20')
  card=self.read(agent='fc',query_id='health.cards',stat_date='2026-10-22',warehouse_code='A')[0]
  self.assertEqual(card['total_qty'],17)
  self.assertEqual(card['average_age'],20)
  self.assertEqual(card['unknown_age_qty'],7)

if __name__=='__main__':unittest.main()
