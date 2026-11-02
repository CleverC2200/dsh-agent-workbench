import json,re,sqlite3,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class Movement(unittest.TestCase):
 def setUp(self):
  c=json.loads((ROOT/'business/inventory-fc/sql.config.json').read_text())
  self.sql=c['queries']['warehouse-outbound.summary']['request']['sql']
  self.sql=re.sub(r'CAST\((:gea_p\d+) AS DATE\)',r'\1',self.sql)
  self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row
  self.db.executescript('''CREATE TABLE agents_scm_inventory_sku_data_d(month_date TEXT,warehouse_classify TEXT,warehouseid TEXT);
  CREATE TABLE agents_scm_execute_detail_d(warehouseid TEXT,executeorderno TEXT,executeorderlineno TEXT,material_code TEXT,delivery_qty REAL,wms_close_time TEXT,load_time TEXT);
  CREATE TABLE agents_scm_material_in_out_summary_d(warehouseid TEXT,warehouse_classify TEXT,transactiontime TEXT,in_qty REAL);
  INSERT INTO agents_scm_inventory_sku_data_d VALUES('20261030','20','Y204'),('20261030','20','A020'),('20261030','02','N436'),('20261030','01','BASE');
  INSERT INTO agents_scm_execute_detail_d VALUES('Y204','O1','1','SKU',9,'2026-10-20','2026-10-30'),('A020','O2','1','SKU',20,'2026-10-20','2026-10-30'),('N436','O3','1','SKU',30,'2026-10-20','2026-10-30'),('BASE','O4','1','SKU',400,'2026-10-20','2026-10-30');
  INSERT INTO agents_scm_material_in_out_summary_d VALUES('Y204','20','2026-10-01',10),('Y204','20','2026-10-30',5),('Y204','20','2026-09-30',1000),('Y204','20','2026-10-31',2000),('A020','20','2026-10-10',20),('N436','02','2026-10-10',30),('BASE','01','2026-10-10',400);
  ''')
 def read(self,warehouse):
  return dict(self.db.execute(self.sql,{'gea_p1':'2026-10-01','gea_p2':'2026-10-31','gea_p3':'2026-10-30','gea_p4':warehouse}).fetchone())
 def test_selected_month_and_warehouse(self):
  r=self.read('Y204');self.assertEqual(r['incoming_qty'],15);self.assertEqual(r['outgoing_qty'],9);self.assertEqual(r['incoming_source_rows'],2)
 def test_all_branches_include_n436_but_not_bases(self):
  r=self.read(None);self.assertEqual(r['incoming_qty'],65);self.assertEqual(r['outgoing_qty'],59)
 def test_unknown_incoming_cannot_hide_valid_wms_outgoing(self):
  self.db.execute("INSERT INTO agents_scm_material_in_out_summary_d VALUES('Y204','20','2026-10-20',NULL)")
  r=self.read('Y204');self.assertIsNone(r['incoming_qty']);self.assertEqual(r['outgoing_qty'],9);self.assertEqual(r['incoming_missing_quantity_count'],1)
 def test_missing_outgoing_cannot_hide_valid_incoming(self):
  self.db.execute("UPDATE agents_scm_execute_detail_d SET delivery_qty=NULL WHERE warehouseid='Y204'")
  r=self.read('Y204');self.assertIsNone(r['outgoing_qty']);self.assertEqual(r['incoming_qty'],15)
 def test_no_outgoing_still_retains_incoming_and_adjustments(self):
  self.db.execute("DELETE FROM agents_scm_execute_detail_d WHERE warehouseid='Y204'")
  self.db.execute("INSERT INTO agents_scm_material_in_out_summary_d VALUES('Y204','20','2026-10-20',-2)")
  r=self.read('Y204');self.assertIsNone(r['outgoing_qty']);self.assertEqual(r['incoming_qty'],13);self.assertGreater(r['row_count'],0)
if __name__=='__main__':unittest.main()
