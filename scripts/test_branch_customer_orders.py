"""Business invariants for downstream customer demand and shared warehouse stock."""
import sqlite3,unittest
from pathlib import Path
import sqlglot
from sqlglot import exp
import importlib.util
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('customer',ROOT/'scripts/update-branch-customer-orders.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class CustomerOrders(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row;self.addCleanup(self.db.close)
  self.db.create_function('CONCAT',-1,lambda *xs:''.join(str(x or '') for x in xs))
  self.source=mod.parse((ROOT/'business/inventory-fc/customer-orders-source.sql').read_text())
  schema={}
  for select in self.source.find_all(exp.Select):
   tables={t.alias_or_name:t.name for t in select.find_all(exp.Table) if t.name.startswith('agents_')}
   for column in select.find_all(exp.Column):
    if column.table in tables:schema.setdefault(tables[column.table],set()).add(column.name)
  # Legacy scenario tests mutate their backing rows. Project the newly published
  # sources dynamically; test_fc_new_warehouse_sources uses independent real tables.
  execution_fields = schema.pop('agents_dwd_scm_execute_detail_mi')
  schema.pop('agents_scm_warehouse_total_data_d')
  schema['agents_scm_execute_detail_d'].update(execution_fields - {'organizationid','ownerid','adjust_order_qty','pack_unitqty','delivery_qty'})
  schema['agents_scm_execute_detail_d'].update({'load_time','bdwctime','cust_name','material_name'})
  for table,cols in schema.items():
   self.db.execute('CREATE TABLE '+table+' ('+', '.join(c+(' REAL' if c.startswith('qty') or c in ['available_qty','live_qty','pack_unit_qty','freeze_qty','warehouse_transfer_qty','transfer_prepare_qty','transfer_onway_qty','adjust_order_qty','pack_unitqty','delivery_qty','bizunitconvertrate','executeorderlineno','detailstatus'] else ' TEXT') for c in sorted(cols))+')')
  self.add('agents_scm_inventory_sku_data_d',month_date='20261102',warehouseid='BR1',warehouse_name='分仓甲',belong_base='基地甲',material_code='SKU',available_qty=10,prod_date='20261001',warehouse_classify='20')
  self.db.execute("""CREATE VIEW agents_scm_warehouse_total_data_d AS
   WITH batches AS (
    SELECT warehouseid, material_code, MAX(warehouse_name) AS warehouse_name,
     CASE WHEN COUNT(available_qty)=COUNT(*) AND
      (COUNT(*)=1 OR (MIN(available_qty)=0 AND MAX(available_qty)=0))
      THEN SUM(available_qty) END AS available_qty
    FROM agents_scm_inventory_sku_data_d
    WHERE month_date=(SELECT MAX(month_date) FROM agents_scm_inventory_sku_data_d)
    GROUP BY warehouseid,material_code,prod_date,sap_warehouseid,plant,quality_batch,is_good_prod,warehouse_classify
   ) SELECT warehouseid, material_code, MAX(warehouse_name) AS warehouse_name,
    NULL AS material_name, SUM(available_qty) AS available_qty,
    SUM(available_qty) AS live_qty, 0 AS pack_unit_qty, 0 AS freeze_qty,
    NULL AS warehouse_transfer_qty, NULL AS transfer_prepare_qty, NULL AS transfer_onway_qty
   FROM batches GROUP BY warehouseid,material_code""")
  raw_fields = sorted(execution_fields - {'organizationid','ownerid','adjust_order_qty','pack_unitqty','delivery_qty'})
  self.db.execute("CREATE VIEW agents_dwd_scm_execute_detail_mi AS SELECT " +
   ','.join('e.'+c+' AS '+c for c in raw_fields) +
   ", 'ORG' AS organizationid, 'OWNER' AS ownerid, " +
   "CASE WHEN NULLIF(e.bdwctime,'') IS NOT NULL OR e.prapare_order_status IN ('备单完成','备单完毕') THEN e.qtyallocated/e.bizunitconvertrate ELSE e.qtyordered/e.bizunitconvertrate END AS adjust_order_qty," +
   "e.qtyallocated/e.bizunitconvertrate AS pack_unitqty,e.qtyshipped/e.bizunitconvertrate AS delivery_qty FROM agents_scm_execute_detail_d e")
  self.add('agents_scm_material_in_out_summary_d',material_code='SKU',product_categ_name='汤圆',material_group_name='A')
 def add(self,table,**values):
  self.db.execute('INSERT INTO '+table+' ('+', '.join(values)+') VALUES ('+', '.join('?' for _ in values)+')',list(values.values()))
 def order(self,key,**overrides):
  row=dict(executeorderno=key,executeorderlineno=1,load_time='2026-11-03',warehouseid='BR1',cust_order_no=key,cust_code='C1',cust_name='经销商',material_code='SKU',material_name='汤圆',header_addtime='2026-11-01',qtyordered=40,qtyallocated=10,qtyshipped=0,bizunitconvertrate=2,detailstatus=10,order_type='ZO11')
  row.update(overrides)
  self.add('agents_scm_execute_detail_d',**row)
 def read(self,name='customer_current'):
  return [dict(r) for r in self.db.execute(mod.render(mod.select_cte(self.source,name)))]
 def test_downstream_stock_is_deducted_once_across_orders(self):
  self.order('O1');self.order('O2');rows=self.read();self.assertEqual(len(rows),1)
  self.assertEqual((rows[0]['demand'],rows[0]['allocated'],rows[0]['remaining'],rows[0]['shortage']),(40,10,30,20))
  lines=self.read('customer_current_lines');self.assertEqual(sum(r['shortage'] for r in lines),20)
  self.assertEqual(sorted(r['shortage'] for r in lines),[5,15])
 def test_invalid_row_does_not_erase_good_order(self):
  self.order('GOOD');self.order('BAD',bizunitconvertrate=None)
  self.assertEqual((self.read()[0]['demand'],self.read()[0]['shortage']),(20,5))
 def test_transfer_orders_are_not_customer_orders(self):
  self.order('GOOD');self.order('TRANSFER',order_type='ZUB',qtyordered=20000)
  self.assertEqual(self.read()[0]['demand'],20)
 def test_closed_and_cancelled_orders_do_not_count(self):
  self.order('GOOD');self.order('CLOSED',order_close_time='2026-11-02');self.order('CANCELLED',dmscanceltime='2026-11-02')
  self.assertEqual(self.read()[0]['demand'],20)
 def test_identical_load_duplicates_count_once_and_conflicts_are_excluded(self):
  self.order('GOOD');self.order('GOOD');self.order('CONFLICT');self.order('CONFLICT',qtyordered=60)
  self.assertEqual(self.read()[0]['demand'],20)
 def test_prepared_customer_demand_preserves_base_rule(self):
  self.order('PREPARED',prapare_order_status='备单完成')
  row=self.read()[0];self.assertEqual((row['demand'],row['allocated'],row['remaining'],row['shortage']),(5,5,0,0))
if __name__=='__main__':unittest.main()
