"""Execute the shipped source SQL on isolated fixtures; adapted from the verified three-stage model tests."""
import sqlite3,pathlib,unittest,json
SQL=(pathlib.Path(__file__).resolve().parents[1]/'business/shared/current-shortage-source.sql').read_text()
class SourceFormula(unittest.TestCase):
 def run_case(self,orders,stock,mapping,statement=SQL):
  c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row;None
  c.create_function('CONCAT',-1,lambda *x:''.join(str(a) for a in x));c.create_function('SUBSTRING',3,lambda x,a,b: None if x is None else x[a-1:a-1+b])
  c.execute('CREATE TABLE agents_scm_execute_detail_d (cust_order_no TEXT,material_code TEXT,material_name TEXT,pickup_point TEXT,pickup_point_name TEXT,belong_base TEXT,bizflowstatus TEXT,adjust_order_qty REAL,qtyallocated REAL,qtyordered REAL,bizunitconvertrate REAL)')
  c.execute('CREATE TABLE agents_scm_inventory_sku_data_d (month_date TEXT,warehouseid TEXT,warehouse_name TEXT,belong_base TEXT,material_code TEXT,material_name TEXT,prod_date TEXT,sap_warehouseid TEXT,plant TEXT,quality_batch TEXT,is_good_prod TEXT,warehouse_classify TEXT,available_qty NUMERIC)')
  c.execute('CREATE TABLE agents_scm_material_in_out_summary_d (warehouseid TEXT,pickup_point TEXT,material_code TEXT,product_categ_name TEXT,material_group_name TEXT)')
  for order,sku,point,qty,alloc,*optional in orders:
   state=optional[0] if optional else '等待组波'
   rate=optional[1] if len(optional)>1 else 1
   c.execute('INSERT INTO agents_scm_execute_detail_d VALUES (?,?,?,?,?,?,?,?,?,?,?)',(order,sku,sku,point,point,'B',state,qty,alloc,qty,rate))
  for w,sku,qty,*opt in stock:
   cl=opt[0] if opt else '01';batch=opt[1] if len(opt)>1 else 'a';date=opt[2] if len(opt)>2 else '20261021'
   c.execute('INSERT INTO agents_scm_inventory_sku_data_d VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',(date,w,w,'B',sku,sku,'20260101','sap','plant',batch,'1',cl,qty))
  c.executemany('INSERT INTO agents_scm_material_in_out_summary_d (warehouseid,pickup_point) VALUES (?,?)',mapping)
  return [dict(r) for r in c.execute(statement,{'gea_p1':None,'gea_p2':None,'gea_p3':None,'gea_p6':None})]
 def total(self,rows):return sum(r['shortage_qty'] for r in rows if r['shortage_qty'] is not None)
 def test_order_rows_accumulate_before_clip(self):
  self.assertEqual(self.total(self.run_case([('o','s','p',3,5),('o','s','p',5,0)],[('w','s',1)],[('w','p')])),2)
 def test_order_surplus_never_offsets_another(self):
  self.assertEqual(self.total(self.run_case([('o','s','p',3,5),('o2','s','p',5,0)],[('w','s',1)],[('w','p')])),4)
 def test_inventory_once_and_base_warehouses_pool(self):
  self.assertEqual(self.total(self.run_case([('o','s','p',10,0),('o2','s','p2',10,0)],[('w','s',6),('w2','s',6,'02')],[('w','p'),('w2','p2')])),8)
 def test_sku_surplus_not_offset(self):
  self.assertEqual(self.total(self.run_case([('o','s','p',10,0),('o','s2','p',2,0)],[('w','s',3),('w','s2',100)],[('w','p')])),7)
 def test_branch_pool_separate(self):
  r=self.run_case([('o','s','p',10,0),('o2','s','p2',10,0)],[('w','s',15,'20'),('w2','s',3,'20')],[('w','p'),('w2','p2')])
  self.assertEqual({x['location_code']:x['shortage_qty'] for x in r},{'w':0,'w2':7})
 def test_status_and_creation(self):
  r=self.run_case([('o','s','p',10,0,'创建'),('o2','s','p',100,0,'OCP已下发'),('o3','s','p',100,0,'作废')],[('w','s',3)],[('w','p')]);self.assertEqual(self.total(r),7)
 def test_null_allocation_is_unknown_and_absent_sku_not_fabricated(self):
  r=self.run_case([('o','s','p',10,None)],[('w','other',100)],[('w','p')]);self.assertIsNone(r[0]['shortage_qty']);self.assertEqual(r[0]['invalid_sku'],1)
 def test_unknown_mapping_blocks(self):
  r=self.run_case([('o','s','unknown',10,0)],[('w','s',100)],[('w','p')]);bad=[x for x in r if x['location_type']=='待映射'];self.assertEqual(bad[0]['invalid_sku'],1);self.assertIsNone(bad[0]['shortage_qty'])
 def test_duplicate_mapping_does_not_expand(self):
  r=self.run_case([('o','s','p',10,0)],[('w','s',3)],[('w','p'),('w','p')]);self.assertEqual(self.total(r),7)
 def test_duplicate_nonzero_batch_blocks(self):
  r=self.run_case([('o','s','p',10,0)],[('w','s',3),('w','s',3)],[('w','p')]);self.assertEqual(r[0]['invalid_sku'],1);self.assertIsNone(r[0]['shortage_qty'])
 def test_latest_inventory_only(self):
  r=self.run_case([('o','s','p',10,0)],[('w','s',3,'01','a','20261021'),('w','s',100,'01','a','20261020')],[('w','p')]);self.assertEqual(self.total(r),7)
 def test_no_orders_yields_zero_location(self):
  r=self.run_case([],[('w','s',3,'20')],[('w','p')]);self.assertEqual(r[0]['shortage_qty'],0);self.assertEqual(r[0]['absent_inventory_sku'],0)
 def test_missing_inventory_snapshot_blocks(self):
  r=self.run_case([('o','s','p',10,0)],[],[('w','p')]);self.assertIsNone(r[0]['shortage_qty']);self.assertEqual(r[0]['invalid_sku'],1)
 def test_full_chain_summary_keeps_known_demand_for_unmapped_points(self):
  config=json.loads((pathlib.Path(__file__).resolve().parents[1]/'business/inventory-qll/sql.config.json').read_text())
  rows=self.run_case([('a','s','p',10,0),('b','s','new',8,0)],[('w','s',3)],[('w','p')],config['queries']['current-shortage.summary']['request']['sql'])
  mapped=next(r for r in rows if r['location_type']=='基地');unknown=next(r for r in rows if r['location_type']=='待映射')
  self.assertEqual(mapped['shortage'],7);self.assertEqual(unknown['demand'],8);self.assertEqual(unknown['remaining'],8);self.assertEqual(unknown['invalid'],1);self.assertIsNone(unknown['shortage'])
 def test_summary_distinguishes_empty_source_from_no_active_orders(self):
  config=json.loads((pathlib.Path(__file__).resolve().parents[1]/'business/inventory-qll/sql.config.json').read_text())
  sql=config['queries']['current-shortage.summary']['request']['sql']
  empty=self.run_case([],[('w','s',3)],[('w','p')],sql)[0]
  inactive=self.run_case([('o','s','p',5,0,'作废')],[('w','s',3)],[('w','p')],sql)[0]
  self.assertEqual(empty['invalid'],1);self.assertIsNone(empty['shortage'])
  self.assertEqual(inactive['invalid'],0);self.assertEqual(inactive['shortage'],0)
 def test_summary_presence_probe_does_not_limit_demand_rows(self):
  config=json.loads((pathlib.Path(__file__).resolve().parents[1]/'business/inventory-qll/sql.config.json').read_text())
  row=self.run_case([('o','s','p',5,0),('o2','s','p',2,0)],[('w','s',3)],[('w','p')],config['queries']['current-shortage.summary']['request']['sql'])[0]
  self.assertEqual(row['demand'],7);self.assertEqual(row['shortage'],4);self.assertEqual(row['invalid'],0)
 def test_piece_conversion_precedes_order_sku_aggregation(self):
  r=self.run_case([('o','s','p',1600,800,'创建',16),('b','s','p',600,300,'创建',12)],[('w','s',60)],[('w','p')])
  self.assertEqual((r[0]['demand_qty'],r[0]['allocated_qty'],r[0]['shortage_qty']),(150,75,15))
 def test_missing_conversion_does_not_silently_reduce_same_sku_total(self):
  r=self.run_case([('o','s','p',1600,800,'创建',16),('b','s','p',600,300,'创建',None)],[('w','s',60)],[('w','p')])
  self.assertIsNone(r[0]['demand_qty']);self.assertIsNone(r[0]['allocated_qty']);self.assertIsNone(r[0]['shortage_qty'])
if __name__=='__main__':unittest.main()
