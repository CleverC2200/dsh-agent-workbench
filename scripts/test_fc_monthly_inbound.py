"""Business-date scope, warehouse isolation and incomplete source coverage for D116."""
import json,sqlite3,unittest
from pathlib import Path
CONFIG=json.loads((Path(__file__).resolve().parents[1]/'business/inventory-fc/sql.config.json').read_text())
class MonthlyInbound(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row
  self.db.create_function('MOD',2,lambda a,b:a%b)
  self.db.execute('CREATE TABLE agents_scm_material_in_out_summary_d (warehouseid TEXT, material_code TEXT, warehouse_classify TEXT, transactiontime TEXT, in_qty NUMERIC, prod_date TEXT)')
 def add(self,date,qty,warehouse='A040',kind='20',production='2025-01-01'):
  self.db.execute('INSERT INTO agents_scm_material_in_out_summary_d VALUES (?,?,?,?,?,?)',(warehouse,'SKU1',kind,date,qty,production))
 def read(self,warehouse='A040',start='2026-10-01',end='2026-10-31'):
  q=CONFIG['queries']['inbound.summary']['request'];return dict(self.db.execute(q['sql'],dict(q['parameters'],gea_p1=start,gea_p2=end,gea_p3=warehouse)).fetchone())
 def test_business_date_and_warehouse_scope(self):
  self.add('2026-10-02',1316);self.add('2026-10-08',4260);self.add('2026-10-28',1689)
  self.add('2026-09-30',500,production='2026-10-01');self.add('2026-10-31',100);self.add('2026-10-08',900,warehouse='A020')
  row=self.read();self.assertEqual(row['inbound_qty'],7265);self.assertEqual(row['month_row_count'],3);self.assertEqual(row['last_business_date'],'2026-10-28')
 def test_empty_scope_is_real_zero(self):
  self.assertEqual(self.read()['inbound_qty'],0)
 def test_invalid_date_and_missing_quantity_do_not_become_complete_zero(self):
  self.add('2026-10-02',10);self.add('2026-10-32',20);self.add('2026-10-03',None)
  row=self.read();self.assertIsNone(row['inbound_qty']);self.assertEqual(row['known_inbound_qty'],10);self.assertEqual(row['invalid_date_count'],1);self.assertEqual(row['missing_qty_count'],1)
 def test_leap_day_and_source_reversals(self):
  self.add('2024-02-29',10);self.add('2024-02-28',-2)
  row=self.read(start='2024-02-01',end='2024-03-01');self.assertEqual(row['inbound_qty'],8);self.assertEqual(row['negative_qty_count'],1)
 def test_all_branches_excludes_base_inventory(self):
  self.add('2026-10-02',10);self.add('2026-10-02',20,warehouse='A020');self.add('2026-10-02',999,warehouse='BASE',kind='01')
  self.assertEqual(self.read(warehouse=None)['inbound_qty'],30)
 def test_identical_quantities_are_not_deduplicated(self):
  self.add('2026-10-02',5);self.add('2026-10-02',5);self.assertEqual(self.read()['inbound_qty'],10)
if __name__=='__main__':unittest.main()
