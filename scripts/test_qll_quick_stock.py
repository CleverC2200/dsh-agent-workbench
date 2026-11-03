"""Optimized company card pools equal their standalone inventory contracts."""
import unittest
from test_batch_age_lists import BatchAgeLists

class QllQuickStock(BatchAgeLists):
 def test_quick_pools_preserve_signed_quantities_and_independent_dates(self):
  self.batch(10,100,warehouse='B1');self.batch(30,-4,warehouse='B1')
  self.batch(None,7,warehouse='B2',kind='02')
  self.batch(10,200,warehouse='FC',kind='20')
  self.batch(10,20,warehouse='N436',kind='02')
  self.batch(10,900,warehouse='IGNORED',kind='04')
  self.db.execute("UPDATE agents_scm_inventory_sku_data_d SET month_date='20261021' WHERE warehouse_classify='20'")
  self.db.execute("UPDATE agents_scm_inventory_sku_data_d SET month_date='20261023' WHERE warehouse_classify='04'")
  rows=self.read(agent='qll',query_id='overview.quick-stock',as_of='2026-10-22')
  self.assertEqual(len(rows),2)
  for label,query,day in [('基地','health.inventory','2026-10-22'),('分仓','branch-health.inventory','2026-10-21')]:
   row=next(r for r in rows if r['location_type']==label)
   canonical=self.read(agent='qll',query_id=query,stat_date=day)[0]
   self.assertEqual(row['snapshot_date'],day)
   for field in ['row_count','total_qty','available_qty','pack_unit_qty','freeze_qty']:
    self.assertEqual(row[field],canonical[field],field)
 def test_quick_no_snapshot_is_empty_not_zero(self):
  self.assertEqual(self.read(agent='qll',query_id='overview.quick-stock',as_of='2026-10-22'),[])

if __name__=='__main__':unittest.main()
