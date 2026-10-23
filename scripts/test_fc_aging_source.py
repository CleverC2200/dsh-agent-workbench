"""Execute the delivered branch ageing summary on batch boundary fixtures."""
import datetime,json,math,pathlib,sqlite3,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class BranchAgingSource(unittest.TestCase):
 def test_batch_quantities_use_sixty_and_ninety_day_boundaries(self):
  config=json.loads((ROOT/'business/inventory-fc/sql.config.json').read_text())
  query=config['queries']['health.summary']
  c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row
  c.create_function('CONCAT',-1,lambda *parts:''.join(str(x) for x in parts))
  c.create_function('SUBSTRING',3,lambda s,a,b:None if s is None else s[a-1:a-1+b])
  c.create_function('FLOOR',1,math.floor)
  c.execute('CREATE TABLE agents_scm_inventory_sku_data_d (warehouseid TEXT,material_code TEXT,month_date TEXT,warehouse_name TEXT,belong_base TEXT,material_name TEXT,live_qty NUMERIC,available_qty NUMERIC,pack_unit_qty NUMERIC,freeze_qty NUMERIC,prod_date TEXT,warehouse_classify TEXT)')
  c.execute('CREATE TABLE agents_scm_material_in_out_summary_d (warehouseid TEXT,material_code TEXT,product_categ_name TEXT,material_group_name TEXT)')
  day=datetime.date(2026,10,22)
  for age,qty in [(59,10),(60,20),(89,30),(90,40),(150,-5),(None,7),(-1,4)]:
   production=(day-datetime.timedelta(days=age)).isoformat() if age is not None else None
   c.execute('INSERT INTO agents_scm_inventory_sku_data_d VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',('W','S','20261022','分仓','基地','商品',qty,qty,0,0,production,'20'))
  parameters={key:(value[0] if value else '') if isinstance(value,list) else value for key,value in query['request']['parameters'].items()};parameters['gea_p1']=day.isoformat()
  row=dict(c.execute(query['request']['sql'],parameters).fetchone())
  self.assertEqual(row['total_qty'],106)
  self.assertEqual(row['overaged_qty'],90)
  self.assertEqual(row['stagnant_qty'],40)
  self.assertEqual(row['max_age'],90)
if __name__=='__main__':unittest.main()
