"""Publish the two stock pools before starting expensive independent analyses."""
import json,copy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
for agent in ['qll','fc']:
 p=ROOT/f'business/inventory-{agent}/sql.config.json';c=json.loads(p.read_text())
 base="MAX(CASE WHEN b.warehouse_classify IN ('01','02') THEN b.month_date ELSE NULL END)" if agent=='qll' else 'CAST(NULL AS VARCHAR(8))'
 scope="b.warehouse_classify IN ('01','02','20')" if agent=='qll' else "b.warehouse_classify='20'"
 sql=f"""WITH latest AS (
 SELECT {base} AS base_day,
 MAX(CASE WHEN b.warehouse_classify='20' AND NULLIF(TRIM(b.warehouseid),'') IS NOT NULL THEN b.month_date ELSE NULL END) AS branch_day
 FROM agents_scm_inventory_sku_data_d AS b
 WHERE {scope} AND b.month_date<=REPLACE(CAST(:gea_p1 AS VARCHAR(10)),'-','')
 AND LENGTH(b.month_date)=8 AND SUBSTRING(b.month_date,5,2) BETWEEN '01' AND '12' AND SUBSTRING(b.month_date,7,2) BETWEEN '01' AND '31'
), pools AS (
 SELECT CASE WHEN b.warehouse_classify='20' THEN '分仓' ELSE '基地' END AS location_type,
 b.month_date AS day_key, b.warehouseid AS warehouseid,b.material_code AS material_code,
 SUM(COALESCE(b.live_qty,0)) AS total_qty,SUM(COALESCE(b.available_qty,0)) AS available_qty,
 SUM(COALESCE(b.pack_unit_qty,0)) AS pack_unit_qty,SUM(COALESCE(b.freeze_qty,0)) AS freeze_qty
 FROM agents_scm_inventory_sku_data_d AS b CROSS JOIN latest AS l
 WHERE {scope} AND ((b.warehouse_classify='20' AND b.month_date=l.branch_day) OR (b.warehouse_classify IN ('01','02') AND b.month_date=l.base_day))
 GROUP BY CASE WHEN b.warehouse_classify='20' THEN '分仓' ELSE '基地' END,b.month_date,b.warehouseid,b.material_code
) SELECT p.location_type AS location_type,CONCAT(SUBSTRING(p.day_key,1,4),'-',SUBSTRING(p.day_key,5,2),'-',SUBSTRING(p.day_key,7,2)) AS snapshot_date,
 COUNT(*) AS row_count,SUM(p.total_qty) AS total_qty,SUM(p.available_qty) AS available_qty,SUM(p.pack_unit_qty) AS pack_unit_qty,SUM(p.freeze_qty) AS freeze_qty
 FROM pools AS p GROUP BY p.location_type,p.day_key ORDER BY p.location_type"""
 c['queries']['overview.quick-stock']={'title':'首页库存快读','priority':20,'parameterSpec':{'gea_p1':{'name':'as_of','type':'string','format':'YYYY-MM-DD','nullable':False}},'request':{'sql':sql,'parameters':{'gea_p1':'2026-10-23'},'includeTotal':False},'resultColumns':['location_type','snapshot_date','row_count','total_qty','available_qty','pack_unit_qty','freeze_qty']}
 if agent=='qll':c['overviewQuickStock']='overview.quick-stock'
 else:c.pop('overviewQuickStock',None)
 p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
