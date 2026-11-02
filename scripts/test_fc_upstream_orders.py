import sqlite3,json,unittest
from pathlib import Path
W=Path(__file__).resolve().parents[1]
class UpstreamOrders(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row
  self.db.executescript('''CREATE TABLE agents_scm_inventory_sku_data_d(month_date TEXT,warehouseid TEXT,warehouse_name TEXT,warehouse_classify TEXT,belong_base TEXT,material_code TEXT,available_qty REAL,prod_date TEXT,sap_warehouseid TEXT,plant TEXT,quality_batch TEXT,is_good_prod TEXT);
CREATE TABLE agents_scm_execute_detail_hourly_d(receive_wh TEXT,warehouseid TEXT,fromorderno TEXT,belong_base TEXT,executeorderno TEXT,executeorderlineno TEXT,material_code TEXT,material_name TEXT,header_addtime TEXT,requireddeliverytime TEXT,wms_close_time TEXT,order_close_time TEXT,prapare_order_status TEXT,load_time TEXT,bizunitconvertrate REAL,qtyordered REAL,qtyallocated REAL,qtyshipped REAL,order_type TEXT,plant_flag TEXT,detailstatus INTEGER,canceltime TEXT,dmscanceltime TEXT);
CREATE TABLE agents_scm_asn_detail_d(warehouseid TEXT,warehouse_name TEXT,warehouse_classify TEXT,source_warehouseid TEXT,asnreference1 TEXT,asnno TEXT,asnlineno TEXT,material_code TEXT,header_addtime TEXT,actualarrivetime TEXT,order_close_time TEXT,asnstatus TEXT,lastreceivingtime TEXT,load_time TEXT,expectedqty REAL,receivedqty REAL,asntype TEXT);
CREATE TABLE agents_scm_material_in_out_summary_d(material_code TEXT,product_categ_name TEXT,material_group_name TEXT);''')
  self.db.create_function('CONCAT',-1,lambda *x:''.join(str(v) for v in x if v is not None))
  self.db.create_function('SUBSTRING',3,lambda s,a,n:s[a-1:a+n-1] if s else None)
  for wh,name,kind,qty in [('BASE','基地仓','01',60),('BR1','分仓一','20',100000),('BR2','分仓二','20',0)]:
   self.db.execute('INSERT INTO agents_scm_inventory_sku_data_d VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',('20261030',wh,name,kind,'基地甲','SKU',qty,'20261001','01','P','Q','Y'))
  self.add('BR1','O1','2026-10-01',70,20)
  self.add('BR2','O2','2026-10-02',60,10)
  self.add('BR1','O3','2026-10-03',50,30,status='备单完毕')
 def add(self,wh,order,date,demand,allocated,**overrides):
  row={'receive_wh':wh,'warehouseid':'BASE','fromorderno':order,'belong_base':'基地甲','executeorderno':order,'executeorderlineno':'1','material_code':'SKU','material_name':'测试商品','header_addtime':date+' 00:00:00','requireddeliverytime':date,'wms_close_time':None,'order_close_time':None,'prapare_order_status':'备单中','load_time':'2026-10-30 13:00:00','bizunitconvertrate':10,'qtyordered':demand*10,'qtyallocated':allocated*10,'qtyshipped':0,'order_type':'ZUB','plant_flag':'工厂','detailstatus':10,'canceltime':None,'dmscanceltime':None}
  if 'status' in overrides:overrides['prapare_order_status']=overrides.pop('status')
  row.update(overrides)
  self.db.execute('INSERT INTO agents_scm_asn_detail_d VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
   (wh,'分仓'+wh,'20',row['warehouseid'],order,'ASN-'+order,row['executeorderlineno'],'SKU',date+' 00:00:00',None,None,'00',None,'2026-10-30',demand,0,'TT'))
  self.db.execute('INSERT INTO agents_scm_execute_detail_hourly_d ('+','.join(row)+') VALUES ('+','.join('?' for _ in row)+')',list(row.values()))
 def rows(self):
  sql=(W/'business/inventory-fc/upstream-orders-source.sql').read_text();sql=sql[:sql.rindex('\nSELECT l.warehouse_code')]+''' SELECT l.warehouse_code AS warehouse_code,l.order_no AS order_no,l.demand AS demand,l.preparing_allocated AS preparing_allocated,l.remaining AS remaining,l.available AS available,l.shortage AS shortage,l.invalid AS invalid FROM upstream_current AS l ORDER BY l.order_no'''
  return {r['order_no']:dict(r) for r in self.db.execute(sql)}
 def test_incoming_direction_and_status(self):
  self.add('BR1','DEALER','2026-10-01',9000,0,order_type='ZO10')
  self.db.execute("DELETE FROM agents_scm_asn_detail_d WHERE asnreference1='DEALER'")
  self.add('BR1','BRANCH_SOURCE','2026-10-01',9000,0,warehouseid='BR2')
  self.add('BR1','SIGNED','2026-10-01',430,0,status='已签收')
  self.db.execute("UPDATE agents_scm_asn_detail_d SET asnstatus='99' WHERE asnreference1='SIGNED'")
  self.add('BR1','CANCELLED','2026-10-01',9000,0,canceltime='2026-10-02')
  self.db.execute("UPDATE agents_scm_asn_detail_d SET asnstatus='90' WHERE asnreference1='CANCELLED'")
  self.assertEqual(set(self.rows()),{'O1','O2','O3'})
 def test_units_stages_and_fifo(self):
  r=self.rows();self.assertEqual(r['O1']['demand'],70);self.assertEqual(r['O1']['shortage'],0)
  self.assertEqual(r['O2']['shortage'],40);self.assertEqual(r['O2']['available'],10)
  self.assertEqual(r['O3']['demand'],50);self.assertEqual(r['O3']['preparing_allocated'],30);self.assertEqual(r['O3']['remaining'],20)
  self.assertEqual(sum(x['available'] for x in r.values()),60)
 def test_selected_branch_retains_other_branches_priority(self):
  c=json.loads((W/'business/inventory-fc/sql.config.json').read_text());q=c['queries']['current-shortage.summary'];params={k:None for k in q['parameterSpec']};params['gea_p2']='BR2'
  r=self.db.execute(q['request']['sql'],params).fetchone();self.assertEqual(r['shortage'],40);self.assertEqual(r['available'],10)
 def test_branch_stock_cannot_satisfy_base_orders(self):
  before=self.rows();self.db.execute("UPDATE agents_scm_inventory_sku_data_d SET available_qty=0 WHERE warehouseid='BR1'");self.assertEqual(before,self.rows())
 def test_fifo_stable_same_timestamp(self):
  self.db.execute("UPDATE agents_scm_execute_detail_hourly_d SET header_addtime='2026-10-01 00:00:00'")
  r=self.rows();self.assertEqual(r['O1']['shortage'],0);self.assertEqual(r['O2']['shortage'],40)
 def test_unknown_quantity_invalidates_shared_pool(self):
  self.db.execute("UPDATE agents_scm_execute_detail_hourly_d SET qtyallocated=NULL WHERE executeorderno='O1'")
  r=self.rows();self.assertTrue(all(x['invalid']==1 and x['shortage'] is None for x in r.values()))
 def test_missing_base_available_is_unknown(self):
  self.db.execute("UPDATE agents_scm_inventory_sku_data_d SET available_qty=NULL WHERE warehouseid='BASE'")
  self.assertTrue(all(x['shortage'] is None for x in self.rows().values()))
 def test_overallocation_and_duplicate_lines(self):
  self.db.execute("UPDATE agents_scm_execute_detail_hourly_d SET qtyallocated=9000 WHERE executeorderno='O1'")
  r=self.rows();self.assertEqual(r['O1']['remaining'],0);self.assertEqual(r['O2']['shortage'],0)
  self.add('BR1','O1','2026-10-01',70,20)
  self.assertTrue(all(x['shortage'] is None for x in self.rows().values()))
 def test_order_sku_netting_precedes_clipping(self):
  self.db.execute("UPDATE agents_scm_execute_detail_hourly_d SET qtyallocated=900 WHERE executeorderno='O1'")
  self.add('BR1','O1','2026-10-01',50,0,executeorderlineno='2')
  r=self.rows();self.assertEqual(r['O1']['remaining'],30);self.assertEqual(r['O2']['shortage'],20)
 def test_invisible_order_source_is_unknown_not_zero(self):
  self.db.execute('DELETE FROM agents_scm_asn_detail_d')
  q=json.loads((W/'business/inventory-fc/sql.config.json').read_text())['queries']['current-shortage.summary']
  row=self.db.execute(q['request']['sql'],{key:None for key in q['parameterSpec']}).fetchone()
  self.assertGreater(row['invalid'],0);self.assertIsNone(row['demand']);self.assertIsNone(row['shortage'])
 def test_absent_authorized_base_stock_scope_is_unknown(self):
  self.db.execute("DELETE FROM agents_scm_inventory_sku_data_d WHERE warehouseid='BASE'")
  self.assertTrue(all(row['shortage'] is None for row in self.rows().values()))
 def test_branch_sender_is_not_a_base_even_with_factory_flag(self):
  self.add('BR2','BRANCH_TO_BRANCH','2026-10-01',9000,0,warehouseid='BR1')
  self.assertNotIn('BRANCH_TO_BRANCH',self.rows())
 def test_multiple_asn_batches_do_not_multiply_execution_allocation(self):
  self.db.execute("UPDATE agents_scm_asn_detail_d SET expectedqty=30 WHERE asnreference1='O1'")
  self.db.execute("INSERT INTO agents_scm_asn_detail_d SELECT warehouseid,warehouse_name,warehouse_classify,source_warehouseid,asnreference1,'SECOND-ASN','2',material_code,header_addtime,actualarrivetime,order_close_time,asnstatus,lastreceivingtime,load_time,40,0,asntype FROM agents_scm_asn_detail_d WHERE asnreference1='O1'")
  row=self.rows()['O1'];self.assertEqual(row['demand'],70);self.assertEqual(row['preparing_allocated'],20);self.assertEqual(row['remaining'],50)
 def test_received_quantity_is_removed_from_current_demand_and_occupation(self):
  self.db.execute("UPDATE agents_scm_asn_detail_d SET receivedqty=10 WHERE asnreference1='O1'")
  row=self.rows()['O1'];self.assertEqual(row['demand'],60);self.assertEqual(row['preparing_allocated'],10);self.assertEqual(row['remaining'],50)
 def test_missing_execution_match_does_not_borrow_a_different_sku(self):
  self.db.execute("UPDATE agents_scm_execute_detail_hourly_d SET material_code='OTHER' WHERE executeorderno='O1'")
  self.assertIsNone(self.rows()['O1']['preparing_allocated'])
 def test_fully_allocated_order_survives_an_unrelated_unknown_shared_pool_input(self):
  self.db.execute("UPDATE agents_scm_execute_detail_hourly_d SET qtyallocated=700 WHERE executeorderno='O1'")
  self.db.execute("UPDATE agents_scm_execute_detail_hourly_d SET qtyallocated=NULL WHERE executeorderno='O2'")
  self.assertEqual(self.rows()['O1']['shortage'],0);self.assertIsNone(self.rows()['O2']['shortage'])
if __name__=='__main__':unittest.main()
