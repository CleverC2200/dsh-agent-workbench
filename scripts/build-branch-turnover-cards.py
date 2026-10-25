"""Keep the landing turnover's original inventory/plan/open-order key set, without unrelated facts."""
from pathlib import Path
import json,re,copy,sqlglot
from sqlglot import exp
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'business/inventory-qll/sql.config.json';c=json.loads(p.read_text());source=c['queries']['replenishment.summary'];tree=sqlglot.parse_one(source['request']['sql'],read='postgres')
ctes={x.alias_or_name:x for x in tree.args['with_'].expressions}
# fc_current_orders has exactly the eligible location/SKU keys. Its allocation,
# stock gap and classification projections do not determine this key union.
required=set()
def retain(name):
 if name in required or name not in ctes:return
 required.add(name)
 for t in ctes[name].this.find_all(exp.Table):retain(t.name)
retain('eligible_order_sku')
kept=[v.sql(dialect='postgres') for k,v in ctes.items() if k in required]
sql='WITH '+', '.join(kept)+''', card_stock AS (
 SELECT b.warehouseid AS warehouse_code,b.material_code AS material_code,SUM(COALESCE(b.available_qty,0)) AS available_qty
 FROM agents_scm_inventory_sku_data_d AS b
 WHERE b.warehouse_classify='20' AND b.month_date=REPLACE(CAST(:gea_p2200 AS VARCHAR(10)),'-','')
 GROUP BY b.warehouseid,b.material_code
), card_key_rows AS (
 SELECT p.warehouse_code AS warehouse_code,p.material_code AS material_code FROM agents_scm_warehouse_transfer_plan_data_d AS p
 UNION ALL SELECT s.warehouse_code AS warehouse_code,s.material_code AS material_code FROM card_stock AS s WHERE NULLIF(TRIM(s.warehouse_code),'') IS NOT NULL
 UNION ALL SELECT d.warehouseid AS warehouse_code,d.material_code AS material_code FROM eligible_order_sku AS d WHERE d.location_type='分仓' AND d.warehouseid IS NOT NULL AND d.material_code IS NOT NULL
), card_keys AS (
 SELECT k.warehouse_code AS warehouse_code,k.material_code AS material_code FROM card_key_rows AS k GROUP BY k.warehouse_code,k.material_code
), card_shipments AS (
 SELECT s.warehouse AS warehouse_code,s.material_code AS material_code,
 SUM(CASE WHEN s.act_ship_date>=:gea_p2003 AND s.act_dl_qty>0 THEN s.act_dl_qty ELSE 0 END)/30.0 AS daily
 FROM agents_scm_cust_deliv_daily_di AS s
 WHERE s.warehouse_classify='20' AND s.act_ship_date>=:gea_p2000 AND s.act_ship_date<:gea_p2001
 GROUP BY s.warehouse,s.material_code
) SELECT COUNT(*) AS row_count,
 SUM(CASE WHEN s.daily>0 THEN COALESCE(i.available_qty,0) ELSE 0 END)/NULLIF(SUM(CASE WHEN s.daily>0 THEN s.daily ELSE 0 END),0) AS historical_turnover_days,
 SUM(CASE WHEN s.daily>0 THEN 1 ELSE 0 END) AS turnover_count
 FROM card_keys AS k LEFT JOIN card_stock AS i ON i.warehouse_code=k.warehouse_code AND i.material_code=k.material_code
 LEFT JOIN card_shipments AS s ON s.warehouse_code=k.warehouse_code AND s.material_code=k.material_code'''
names=set(re.findall(r':(gea_p\d+)',sql));spec={k:v for k,v in source['parameterSpec'].items() if k in names};assert names==set(spec)
c['queries']['branch-turnover.cards']={'title':'分仓周转首页汇总','notes':'保持补货汇总的计划/库存/未备单订单键并集；仅正向近30日日均大于零的键进入库存与日均分母。','parameterSpec':spec,'request':{'sql':sql,'parameters':{k:source['request']['parameters'][k] for k in spec},'includeTotal':False},'resultColumns':['row_count','historical_turnover_days','turnover_count']}
for v in c['sourceViews']['views']:
 if v['id']=='branch-replenishment':v['overviewSummaryId']='branch-turnover.cards'
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
