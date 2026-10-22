import json,sqlglot
from test_batch_age_lists import BatchAgeLists,ROOT

class QllStructureAgeTests(BatchAgeLists):
 def structure(self,level='base'):
  self.db.execute('CREATE TABLE filtered (base TEXT,sku TEXT,category TEXT)')
  self.db.executemany('INSERT INTO filtered VALUES (?,?,?)',[('郑州','S','汤圆')]*2)
  self.db.execute('CREATE TABLE comparison_health_date (day TEXT)');self.db.execute("INSERT INTO comparison_health_date VALUES ('2026-10-22')")
  q=json.loads((ROOT/'business/inventory-qll/sql.config.json').read_text())['queries']['inventory.groups']
  t=sqlglot.parse_one(q['request']['sql'],read='postgres');ctes=[x.sql(dialect='sqlite') for x in t.ctes if x.alias in ['inventory_batch_dates','inventory_batch_ages','chain_age_keys','chain_age']]
  return [dict(x) for x in self.db.execute('WITH '+','.join(ctes)+' SELECT base,category,average_age,batch_over60 FROM chain_age',{'gea_p24':level})]
 def test_average_uses_positive_matching_batches_once_and_keeps_max_distinct(self):
  self.batch(10,10);self.batch(90,30);self.batch(200,100,sku='OTHER');self.batch(None,20);self.batch(150,-3);self.batch(-1,10)
  r=self.structure()[0];self.assertEqual(r['average_age'],70);self.assertEqual(r['batch_over60'],30)
 def test_same_sku_category_mapping_and_missing_age_keep_source_coverage(self):
  self.batch(None,20);r=self.structure('category')[0];self.assertEqual(r['category'],'汤圆');self.assertIsNone(r['average_age']);self.assertEqual(r['batch_over60'],0)

 def test_invalid_calendar_day_does_not_create_a_weighted_age(self):
  self.batch(20,10);self.db.execute("UPDATE agents_scm_inventory_sku_data_d SET prod_date='2026-02-30'")
  r=self.structure()[0];self.assertIsNone(r['average_age']);self.assertEqual(r['batch_over60'],0)
