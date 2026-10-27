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
 def batch(self,age,qty,sku='S',warehouse='W',base='郑州',kind='01'):
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
  self.batch(61,11,sku='B',kind='01');self.batch(89,13,sku='C',kind='20');self.batch(90,17,sku='D',kind='20');self.batch(300,19,sku='E',kind='04')
  r=self.read(agent='qll')[0];self.assertEqual(r['risk_current'],28);self.assertEqual(r['total_qty'],41)
 def test_dimension_join_is_unique_and_atomic_page_count_remains_full_scope(self):
  for i in range(13):self.batch(40,10,sku=f'S{i:02d}')
  self.db.executemany('INSERT INTO agents_scm_material_in_out_summary_d VALUES (?,?,?,?)',[('W','S00','水饺','G')]*3)
  first=self.read(group_level='detail',page_size=10);second=self.read(group_level='detail',page_size=10,offset=10)
  self.assertEqual(len(first),10);self.assertEqual(len(second),3);self.assertEqual(first[0]['page_scope_total'],13);self.assertEqual(sum(r['total_qty'] for r in first+second),130)
  self.assertEqual(len(self.read(category='水饺')),1)
  empty=self.read(bases_enabled=True,bases=['华东']);self.assertEqual(empty[0]['page_scope_total'],0);self.assertIsNone(empty[0]['page_row_present'])
 def test_cards_weight_each_batch_before_sku_grouping_and_preserve_max_in_details(self):
  for kind in ['01','20']:
   self.batch(10,999,kind=kind);self.batch(1033,1,kind=kind);self.batch(None,500,kind=kind)
   self.batch(-1,20,kind=kind);self.batch(30,-10,kind=kind)
  for agent,query in [('aqkc','health.cards'),('fc','health.cards'),('qll','branch-health.cards')]:
   with self.subTest(agent=agent):
    card=self.read(agent=agent,query_id=query,stat_date='2026-10-22')[0]
    self.assertAlmostEqual(card['average_age'],11.023)
    self.assertEqual(card['age_weight_qty'],1000)
    self.assertEqual(card['weighted_age_sum'],11023)
    self.assertEqual(card['unknown_age_qty'],520)
    self.assertEqual(card['max_age'],1033)
  detail=self.read(agent='fc')[0]
  self.assertAlmostEqual(detail['average_age'],11.023)
  self.assertEqual(detail['max_age'],1033)
 def test_all_card_paths_reject_invalid_dates_without_losing_inventory(self):
  self.batch(0,10,kind='01');self.batch(10,10,kind='20')
  for kind in ['01','20']:
   self.batch(10,7,sku='BAD',kind=kind)
  self.db.execute("UPDATE agents_scm_inventory_sku_data_d SET prod_date='2026-02-30' WHERE material_code='BAD'")
  for agent,query,weight,mean in [('aqkc','page.health-groups',10,0),('qll','health.cards',10,0),('fc','health.cards',10,10)]:
   r=self.read(agent=agent,query_id=query,stat_date='2026-10-22')[0]
   self.assertEqual(r['age_weight_qty'],weight)
   self.assertEqual(r['average_age'],mean)
   self.assertGreater(r['unknown_age_qty'],0)
 def test_base_card_and_detail_exclude_branch_and_other_inventory_pools(self):
  self.batch(10,100);self.batch(30,100,kind='02',warehouse='W2')
  self.batch(100,1000,kind='20',warehouse='FC');self.batch(300,1000,kind='04',warehouse='OTHER')
  for query in ['page.health-groups','health.cards','batch-age.groups','batch-age.atomic']:
   r=self.read(query_id=query,stat_date='2026-10-22')[0]
   self.assertEqual(r['average_age'],20);self.assertEqual(r['age_weight_qty'],200);self.assertEqual(r['max_age'],30)
 def test_group_card_exposes_additive_weights_not_mean_of_base_means(self):
  self.batch(10,90,base='郑州');self.batch(100,10,base='遂平',warehouse='SP')
  groups=self.read(query_id='page.health-groups')
  self.assertEqual(sum(r['weighted_age_sum'] for r in groups)/sum(r['age_weight_qty'] for r in groups),19)
 def test_empty_pool_has_zero_additive_weights_but_no_average(self):
  r=self.read(agent='qll',query_id='health.cards',stat_date='2026-10-22')[0]
  self.assertEqual(r['age_weight_qty'],0);self.assertEqual(r['weighted_age_sum'],0)
  self.assertIsNone(r['average_age']);self.assertIsNone(r['max_age'])
 def test_cards_with_only_unknown_or_nonpositive_batches_keep_age_unknown(self):
  self.batch(None,20,kind='20');self.batch(10,0,kind='20');self.batch(50,-10,kind='20')
  r=self.read(agent='fc',query_id='health.cards',stat_date='2026-10-22')[0]
  self.assertIsNone(r['average_age']);self.assertIsNone(r['max_age']);self.assertEqual(r['unknown_age_qty'],20)
 def test_puyang_negative_adjustment_reconciles_age_bands_to_net_inventory(self):
  self.batch(2,4277,base='濮阳');self.batch(290,5697,base='濮阳');self.batch(290,-5697,base='濮阳')
  for query in ['batch-age.groups','batch-age.atomic']:
   r=self.read(query_id=query)[0]
   self.assertEqual(r['total_qty'],4277);self.assertEqual(r['negative_qty'],-5697)
   self.assertEqual(sum(r[k] for k in ['age0_30','age31_40','age41_60','age60_plus','unknown_age_qty','negative_qty']),r['total_qty'])
   self.assertAlmostEqual(r['average_age'],(2*4277+290*5697)/9974,places=5)
 def test_stock_calendar_uses_same_batch_snapshot_and_base_pool_as_age_calendar(self):
  self.batch(10,100);self.batch(10,900,kind='20')
  self.db.execute("UPDATE agents_scm_inventory_sku_data_d SET month_date='20261023' WHERE warehouse_classify='20'")
  stock=self.read(query_id='source.stock-date',month='2026-10-01',as_of='2026-10-27')
  age=self.read(query_id='source.health-date',as_of='2026-10-27')
  self.assertEqual(stock,age);self.assertEqual(stock,[{'day':'2026-10-22'}])
 def test_base_stock_queries_keep_batch_only_bases_and_sum_batches_without_daily_fanout(self):
  self.batch(10,30);self.batch(60,70,warehouse='W2',kind='02')
  self.batch(20,900,warehouse='FC',kind='20');self.batch(20,800,warehouse='OTHER',kind='03')
  self.batch(10,4277,base='濮阳',warehouse='PY',sku='P')
  self.batch(10,-242,sku='NEG')
  config=json.loads((ROOT/'business/inventory-aqkc/sql.config.json').read_text())
  # Exercise each delivered physical stock CTE, including those used by SKU drills.
  names=[name for name,q in config['queries'].items() if 'base_batch_stock AS' in q['request']['sql']]
  for name in names:
   with self.subTest(query=name):
    q=config['queries'][name];tree=sqlglot.parse_one(q['request']['sql'],read='postgres')
    source=next(c for c in tree.find_all(sqlglot.exp.CTE) if c.alias=='stock_source')
    ctes=[c.copy() for c in source.parent.expressions if c.alias.startswith(('inventory_batch_','base_batch_','base_daily_')) or c.alias=='stock_source']
    attrs=next((c for c in ctes if c.alias=='base_daily_attributes'),None)
    self.db.execute('DROP TABLE IF EXISTS agents_scm_stock_detail_d')
    columns={'the_date','belong_base','material_code'}
    if attrs:columns.update(c.name for c in attrs.find_all(sqlglot.exp.Column) if c.table=='t')
    self.db.execute('CREATE TABLE agents_scm_stock_detail_d ('+','.join(c+' TEXT' for c in sorted(columns))+')')
    # A stale daily record must never supply or multiply physical inventory.
    for _ in range(2):
     self.db.execute("INSERT INTO agents_scm_stock_detail_d (the_date,belong_base,material_code) VALUES ('2026-10-21','郑州','S')")
    query=sqlglot.parse_one('SELECT s.belong_base AS base,s.material_code AS sku,s.current_stock AS inventory FROM stock_source AS s',read='postgres')
    query.set(source.parent.arg_key,sqlglot.exp.With(expressions=ctes))
    for cast in list(query.find_all(sqlglot.exp.Cast)):
     if cast.args['to'].this==sqlglot.exp.DataType.Type.DATE:cast.replace(cast.this.copy())
    parameters={key:('2026-10-22' if spec['name']=='stock_date' else q['request']['parameters'][key]) for key,spec in q['parameterSpec'].items()}
    rows=[dict(r) for r in self.db.execute(query.sql(dialect='sqlite'),{k:v for k,v in parameters.items() if not isinstance(v,list)})]
    actual={(r['base'],r['sku']):r['inventory'] for r in rows}
    self.assertEqual(actual,{('郑州','S'):100,('郑州','NEG'):-242,('濮阳','P'):4277})
if __name__=='__main__':unittest.main()
