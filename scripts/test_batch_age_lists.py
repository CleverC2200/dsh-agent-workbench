"""Execute the delivered aggregates on batch, FIFO and pagination boundaries."""
import datetime,json,math,pathlib,re,sqlite3,unittest
import sqlglot
ROOT=pathlib.Path(__file__).resolve().parents[1]
class BatchAgeLists(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row;self.addCleanup(self.db.close)
  self.db.create_function('CONCAT',-1,lambda *p:''.join(str(x) for x in p if x is not None));self.db.create_function('SUBSTRING',3,lambda s,a,b:None if s is None else s[a-1:a-1+b]);self.db.create_function('FLOOR',1,lambda x:None if x is None else math.floor(x))
  self.db.execute('CREATE TABLE agents_scm_inventory_sku_data_d (warehouse_classify TEXT,warehouseid TEXT,material_code TEXT,month_date TEXT,warehouse_name TEXT,belong_base TEXT,material_name TEXT,live_qty NUMERIC,available_qty NUMERIC,pack_unit_qty NUMERIC,freeze_qty NUMERIC,prod_date TEXT)')
  self.db.execute('CREATE TABLE agents_scm_material_in_out_summary_d (warehouseid TEXT,material_code TEXT,product_categ_name TEXT,material_group_name TEXT)')
  self.db.execute('CREATE TABLE agents_scm_cust_deliv_daily_di (warehouse TEXT,material_code TEXT,act_ship_date TEXT,act_dl_qty NUMERIC)')
  self.day=datetime.date(2026,10,22)
 def batch(self,age,qty,sku='S',warehouse='W',base='郑州',kind='20'):
  prod=(self.day-datetime.timedelta(days=age)).isoformat() if age is not None else None
  self.db.execute('INSERT INTO agents_scm_inventory_sku_data_d VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',(kind,warehouse,sku,'20261022',warehouse,base,sku,qty,qty,0,0,prod))
 def sales(self,qty,sku='S',warehouse='W',day='20261022'):
  self.db.execute('INSERT INTO agents_scm_cust_deliv_daily_di VALUES (?,?,?,?)',(warehouse,sku,day,qty))
 def read(self,agent='aqkc',query_id='batch-age.atomic',**overrides):
  q=json.loads((ROOT/f'business/inventory-{agent}/sql.config.json').read_text())['queries'][query_id]
  vals=q['request']['parameters'].copy();names={v['name']:k for k,v in q['parameterSpec'].items()}
  vals.update({names[k]:v for k,v in overrides.items()})
  tree=sqlglot.parse_one(q['request']['sql'],read='postgres')
  for cast in list(tree.find_all(sqlglot.exp.Cast)):
   if cast.args['to'].this==sqlglot.exp.DataType.Type.DATE:cast.replace(cast.this.copy())
  sql=tree.sql(dialect='sqlite')
  for k,v in list(vals.items()):
   if isinstance(v,list):
    keys=[k+'_'+str(i) for i in range(len(v))];sql=re.sub(':'+k+r'\b',', '.join(':'+x for x in keys),sql);vals.pop(k);vals.update(zip(keys,v))
  return [dict(r) for r in self.db.execute(sql,vals)]
 def test_disjoint_age_bands_and_weighted_mean_ignore_unknown_and_nonpositive_batches(self):
  ages=[0,30,31,40,41,53,60,61,89,90,91]
  for a in ages:self.batch(a,10)
  self.batch(None,7);self.batch(-1,8);self.batch(100,-4)
  r=self.read()[0]
  self.assertEqual((r['age0_30'],r['age31_40'],r['age41_60'],r['age60_plus']),(20,20,30,40));self.assertEqual(r['age_weight_qty'],110);self.assertEqual(r['unknown_age_qty'],15);self.assertEqual(r['total_qty'],121);self.assertAlmostEqual(r['average_age'],sum(ages)/len(ages));self.assertEqual(r['max_age'],91)
 def test_landing_age_groups_match_full_batch_statistics_without_shipment_projection(self):
  self.batch(20,10);self.batch(80,30);self.batch(None,7);self.sales(400)
  full=self.read()[0];card=self.read(query_id='page.health-groups')[0]
  self.assertEqual(card['max_age'],full['max_age']);self.assertAlmostEqual(card['average_age'],full['average_age']);self.assertEqual(card['row_count'],full['row_count'])
 def test_malformed_production_date_keeps_inventory_without_poisoning_valid_ages(self):
  self.batch(20,10);self.batch(30,7,sku='BAD')
  self.db.execute("UPDATE agents_scm_inventory_sku_data_d SET prod_date='20xx-01-01' WHERE material_code='BAD'")
  r=self.read()[0];self.assertEqual(r['total_qty'],17);self.assertEqual(r['unknown_age_qty'],7);self.assertEqual(r['age_weight_qty'],10);self.assertEqual(r['max_age'],20)
 def test_nonexistent_calendar_dates_do_not_enter_the_weighted_age(self):
  self.batch(20,10);self.batch(30,7,sku='BAD')
  self.db.execute("UPDATE agents_scm_inventory_sku_data_d SET prod_date='2026-02-30' WHERE material_code='BAD'")
  r=self.read()[0];self.assertEqual(r['unknown_age_qty'],7);self.assertEqual(r['age_weight_qty'],10);self.assertEqual(r['average_age'],20)
 def test_fifo_consumes_old_stock_first_and_excludes_existing_sixty_plus(self):
  self.batch(90,10);self.batch(55,20);self.sales(60)
  self.batch(55,30,warehouse='OTHER');self.sales(3000,sku='UNRELATED')
  # Each warehouse/SKU owns its own consumption, current old stock is excluded.
  r=self.read()[0];self.assertEqual(r['future7'],46);self.assertEqual(r['future14'],32);self.assertEqual(r['daily_movement'],2)
 def test_return_and_out_of_window_shipments_do_not_inflate_daily_movement(self):
  self.batch(55,20);self.sales(30);self.sales(-300);self.sales(300,day='20260922');self.sales(300,day='20261023')
  r=self.read()[0];self.assertEqual(r['daily_movement'],1);self.assertEqual(r['future7'],13)
 def test_company_expiry_preserves_pool_thresholds_and_excludes_other_warehouses(self):
  self.batch(61,11,sku='B',kind='01');self.batch(89,13,sku='C');self.batch(90,17,sku='D');self.batch(300,19,sku='E',kind='04')
  r=self.read(agent='qll')[0];self.assertEqual(r['risk_current'],28);self.assertEqual(r['total_qty'],41)
 def test_dimension_join_is_unique_and_atomic_page_count_remains_full_scope(self):
  for i in range(13):self.batch(40,10,sku=f'S{i:02d}')
  self.db.executemany('INSERT INTO agents_scm_material_in_out_summary_d VALUES (?,?,?,?)',[('W','S00','水饺','G')]*3)
  first=self.read(group_level='detail',page_size=10);second=self.read(group_level='detail',page_size=10,offset=10)
  self.assertEqual(len(first),10);self.assertEqual(len(second),3);self.assertEqual(first[0]['page_scope_total'],13);self.assertEqual(sum(r['total_qty'] for r in first+second),130)
  self.assertEqual(len(self.read(category='水饺')),1)
  empty=self.read(bases_enabled=True,bases=['华东']);self.assertEqual(empty[0]['page_scope_total'],0);self.assertIsNone(empty[0]['page_row_present'])
if __name__=='__main__':unittest.main()
