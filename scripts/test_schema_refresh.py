"""Execute schema migration and lean landing queries at their real SQL seams."""
import unittest
import test_agent_sql
from agent_sql import config_for, inspect

class SchemaRefreshTests(unittest.TestCase):
    setUp=test_agent_sql.FcReplenishmentCoverageTests.setUp
    insert=test_agent_sql.FcReplenishmentCoverageTests.insert
    read=test_agent_sql.FcReplenishmentCoverageTests.read
    def test_new_branch_fields_reach_atomic_pages_without_replacing_rolling_sales(self):
        self.db.execute('UPDATE agents_scm_warehouse_transfer_plan_data_d SET last_month_actual_qty=44,current_day_avg_qty=2')
        row=self.read('replenishment.detail.atomic')[0]
        self.assertEqual(row['last_month_actual_qty'],44)
        self.assertEqual(row['current_day_avg_qty'],2)
        self.assertEqual(row['rolling_ship_daily'],1)
        # Missing new fields do not erase known stock or shipment quantities.
        self.db.execute('UPDATE agents_scm_warehouse_transfer_plan_data_d SET last_month_actual_qty=NULL,current_day_avg_qty=NULL')
        row=self.read('replenishment.detail.atomic')[0]
        self.assertIsNone(row['last_month_actual_qty'])
        self.assertEqual(row['available_qty'],25)
        self.assertEqual(row['rolling_ship_daily'],1)

    def test_future_production_uses_confirmed_piece_quantities_and_isolates_bad_days(self):
        self.db.execute('CREATE TABLE agents_prod_schedule_detail_d (order_no TEXT,material_code TEXT,factory_code TEXT,base_finish_day TEXT,order_qty REAL,load_time TEXT,measure_unit TEXT)')
        for i,(unit,qty) in enumerate([('ST',7),('PAK',4),('KG',5)]):
            self.db.execute('INSERT INTO agents_prod_schedule_detail_d VALUES (?,?,?,?,?,?,?)',(str(i),'S1','3001','20261023',qty,'2026-10-23',unit))
        self.db.execute("INSERT INTO agents_prod_schedule_detail_d VALUES ('BAD','S1','3001','20261024',-2,'2026-10-23','ST')")
        row=self.read('base-production.days',bases_enabled=False,bases=[''],sku=None)[0]
        self.assertEqual(row['base'],'郑州')
        self.assertEqual(row['production_day_0'],16)
        self.assertIsNone(row['production_day_1'])
        self.assertEqual(row['production_day_2'],0)
        self.assertIsNone(row['production_total'])

    def test_base_resources_exclude_branch_and_unrelated_inventory(self):
        self.insert('agents_scm_inventory_sku_data_d',month_date='20261019',warehouseid='B',warehouse_classify='01',material_code='S1',belong_base='基地1',live_qty=100,available_qty=75)
        self.insert('agents_scm_inventory_sku_data_d',month_date='20261019',warehouseid='B2',warehouse_classify='02',material_code='S1',belong_base='基地1',live_qty=50,available_qty=35)
        self.insert('agents_scm_inventory_sku_data_d',month_date='20261019',warehouseid='IGNORED',warehouse_classify='03',material_code='S1',belong_base='基地1',live_qty=900,available_qty=900)
        rows=self.read('base_resources.detail',bases_enabled=False,bases=[''])
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['known_available'],110)

    def test_branch_turnover_cards_preserve_scope_and_denominator(self):
        self.config=config_for('qll')
        # Recent movement on an order-only SKU belongs in the denominator;
        # unrelated shipment-only SKUs remain outside the inventory/plan/order union.
        self.insert('agents_scm_inventory_sku_data_d',month_date='20261019',warehouseid='WH2',warehouse_classify='20',material_code='OTHER',belong_base='基地1',live_qty=0,available_qty=0)
        self.insert('agents_scm_material_in_out_summary_d',warehouseid='WH2',pickup_point='P2',material_code='S3')
        self.insert('agents_scm_execute_detail_d',cust_order_no='O3',material_code='S3',pickup_point='P2',belong_base='基地1',bizflowstatus='创建',adjust_order_qty=40,qtyallocated=5)
        for sku,qty in [('S3',30),('SHIP-ONLY',500)]:
            self.insert('agents_scm_cust_deliv_daily_di',warehouse='WH2',material_code=sku,warehouse_classify='20',act_ship_date='20261010',act_dl_qty=qty)
        full=self.read('replenishment.summary')[0]
        lean=self.read('branch-turnover.cards')[0]
        self.assertEqual(lean['row_count'],full['row_count'])
        self.assertAlmostEqual(lean['historical_turnover_days'],full['historical_turnover_days'])
        self.assertEqual(lean['turnover_count'],full['turnover_count'])

class ForecastCustomerSchemaTests(unittest.TestCase):
    def test_shipped_forecast_reads_use_new_physical_customer_column(self):
        queries=config_for('apsplan')['queries'];checked=0
        for key,q in queries.items():
            if 'agents_sales_forecast_detail_mi' not in q['request']['sql']:continue
            from sqlglot import parse_one, exp
            from sqlglot.optimizer.scope import traverse_scope
            tree=parse_one(q['request']['sql'],read='postgres')
            for scope in traverse_scope(tree):
                for col in scope.columns:
                    t=scope.sources.get(col.table)
                    if isinstance(t,exp.Table) and t.name=='agents_sales_forecast_detail_mi':
                        self.assertNotEqual(col.name,'dealer_code',key)
            checked+=1
        self.assertEqual(checked,24)

class BasePlanSourceFieldTests(unittest.TestCase):
    def test_base_plan_fields_keep_customer_and_month_grain_without_replacing_customer_plan(self):
        import sqlite3,sqlglot
        db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row;self.addCleanup(db.close)
        db.execute('CREATE TABLE agents_sales_plan_demand_m (stat_month TEXT,cust_code TEXT,material_code TEXT,belong_base TEXT,plannum REAL,allnum REAL,ycplanamount REAL,monthamount REAL,current_month_estimate REAL,next_month_estimate REAL,current_month_adjust REAL,sale_plan REAL,sale_adjust REAL,prod_plan_num REAL,scjp_qty REAL)')
        db.execute("INSERT INTO agents_sales_plan_demand_m VALUES ('2026-10-01','C1','S1','基地1',2,3,4,5,6,7,8,10,9,14,12)")
        db.execute("INSERT INTO agents_sales_plan_demand_m VALUES ('2026-10-01','C2','S1','基地1',2,3,4,5,6,7,8,0,0,0,0)")
        db.execute("INSERT INTO agents_sales_plan_demand_m VALUES ('2026-09-01','C1','S1','基地1',200,300,4,5,6,7,8,1000,900,1400,1200)")
        for qid in ['page.plans-source','overview.plans-source']:
            q=config_for('apsplan')['queries'][qid]
            values={k:v for k,v in q['request']['parameters'].items()};values.update(gea_p1='2026-10-01',gea_p2='2026-11-01')
            tree=sqlglot.parse_one(q['request']['sql'],read='postgres')
            for cast in list(tree.find_all(sqlglot.exp.Cast)):
                if cast.args['to'].this==sqlglot.exp.DataType.Type.DATE:cast.replace(cast.this.copy())
            # The disabled base IN predicate still binds a scalar fixture, without changing SQL logic.
            for k,v in list(values.items()):
                if isinstance(v,list):values[k]=v[0]
            row=dict(db.execute(tree.sql(dialect='sqlite'),values).fetchone())
            self.assertEqual(row['planned'],6)
            self.assertEqual(row['base_sales_plan'],10)
            self.assertEqual(row['base_sales_adjusted_plan'],9)
            self.assertEqual(row['base_production_plan'],14)
            self.assertEqual(row['base_production_adjusted_plan'],12)
    # All generated SQL is additionally audited against the observed schema.
