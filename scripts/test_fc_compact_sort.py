import json,sqlite3,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class CompactSort(unittest.TestCase):
 def test_all_declared_sort_fields_keep_null_last_and_ten_row_pagination(self):
  c=json.loads((ROOT/'business/inventory-fc/sql.config.json').read_text());q=c['queries']['replenishment.detail'];sql=q['request']['sql'];fields=q['resultColumns'];sorts=q['parameterSpec']['gea_p4101']['enum']
  texts={'warehouse_code','warehouse_name','sku','material_name','category','material_group','plan_source','calculation_status','stat_month','last_ship_date','stock_date'}
  db=sqlite3.connect(':memory:');db.execute('CREATE TABLE list_filtered ('+','.join(f+' '+('TEXT' if f in texts else 'REAL') for f in fields)+')')
  for n in range(25):
   row={f:(None if n%6==0 else ['甲','丙','乙'][n%3] if f in texts else [20,0,None,-5,20][n%5]) for f in fields}
   row.update(warehouse_code='W'+str(n//13),sku='S'+str(n).zfill(2));db.execute('INSERT INTO list_filtered VALUES ('+','.join('?' for _ in fields)+')',[row[f] for f in fields])
  start=sql.index(', list_sort_values AS (')+2;stop=sql.rindex(' SELECT r.warehouse_code AS warehouse_code');ctes=sql[start:stop]
  order=sql.rsplit(' ORDER BY ',1)[1]
  for field in sorts:
   for direction in ['asc','desc']:
    if field=='key':expected='r.warehouse_code,r.sku'
    else:expected=f'CASE WHEN r.{field} IS NULL THEN 1 ELSE 0 END ASC,r.{field} {direction},r.warehouse_code,r.sku'
    params={'gea_p4101':field,'gea_p4102':direction,'gea_p8':10,'gea_p9':10}
    a=db.execute('WITH '+ctes+' SELECT r.warehouse_code,r.sku FROM list_sorted AS r ORDER BY '+order,params).fetchall()
    b=db.execute('SELECT r.warehouse_code,r.sku FROM list_filtered AS r ORDER BY '+expected+' LIMIT 10 OFFSET 10').fetchall()
    self.assertEqual(a,b,(field,direction))
if __name__=='__main__':unittest.main()
