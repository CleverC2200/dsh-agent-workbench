"""Read future production separately so missing publication cannot block base stock."""
from pathlib import Path
import json,re,datetime
ROOT=Path(__file__).resolve().parents[1];p=ROOT/'business/inventory-fc/sql.config.json';c=json.loads(p.read_text());aps=json.loads((ROOT/'business/inventory-apsplan/sql.config.json').read_text())
# Reuse the already-reviewed MES production-base mapping; warehouse ownership
# is not the production factory of transferred inventory.
case=re.search(r"CASE t.factory_code WHEN .*? ELSE NULL END",aps['queries']['page.production']['request']['sql'])[0].replace('t.factory_code','p.factory_code')
sql='''WITH plant_bases AS (
 SELECT b.plant AS plant,CASE WHEN COUNT(DISTINCT NULLIF(TRIM(b.belong_base),''))=1 THEN MAX(NULLIF(TRIM(b.belong_base),'')) ELSE NULL END AS base
 FROM agents_scm_inventory_sku_data_d AS b WHERE b.warehouse_classify IN ('01','02') AND b.plant IS NOT NULL GROUP BY b.plant
), production_orders AS (
 SELECT p.order_no AS order_no,p.material_code AS material_code,p.factory_code AS factory_code,p.base_finish_day AS day,
 COALESCE('''+case+''',m.base) AS base,
 CASE WHEN COUNT(*)=1 THEN MAX(p.order_qty) ELSE NULL END AS quantity,COUNT(*) AS source_rows
 FROM agents_prod_schedule_detail_d AS p LEFT JOIN plant_bases AS m ON m.plant=p.factory_code
 WHERE p.base_finish_day IN ('''+','.join(':gea_p'+str(700+i) for i in range(7))+''')
 AND (:gea_p2=FALSE OR COALESCE('''+case+''',m.base) IN (:gea_p3)) AND (:gea_p4 IS NULL OR p.material_code=:gea_p4)
 GROUP BY p.order_no,p.material_code,p.factory_code,p.base_finish_day,COALESCE('''+case+''',m.base)
) SELECT p.base AS base,'''
fields=[]
for i in range(7):
 fields.append(f'CASE WHEN SUM(CASE WHEN p.day=:gea_p{700+i} AND (p.quantity IS NULL OR p.quantity<0 OR p.source_rows<>1) THEN 1 ELSE 0 END)=0 THEN SUM(CASE WHEN p.day=:gea_p{700+i} THEN p.quantity ELSE 0 END) ELSE NULL END AS production_day_{i}')
fields.append('CASE WHEN SUM(CASE WHEN p.quantity IS NULL OR p.quantity<0 OR p.source_rows<>1 THEN 1 ELSE 0 END)=0 THEN SUM(p.quantity) ELSE NULL END AS production_total')
sql+=', '.join(fields)+' FROM production_orders AS p WHERE p.base IS NOT NULL GROUP BY p.base ORDER BY p.base'
spec={k:c['queries']['base_resources.detail']['parameterSpec'][k] for k in ['gea_p2','gea_p3','gea_p4']};params={k:c['queries']['base_resources.detail']['request']['parameters'][k] for k in spec}
for i in range(7):
 key='gea_p'+str(700+i);spec[key]={'name':f'production_day_{i}','type':'string','format':'YYYYMMDD','nullable':False};params[key]=(datetime.date(2026,10,23)+datetime.timedelta(days=i)).strftime('%Y%m%d')
cols=['base']+[f'production_day_{i}' for i in range(7)]+['production_total']
c['queries']['base-production.days']={'title':'基地未来七日排程','notes':'用户确认排程数量已统一为件，沿用1件=1箱，不按单位标签重复换算。使用基本完成日期，逐生产订单SKU校验；负数、重复和缺数保留未知，不拿历史MES实绩代替。','parameterSpec':spec,'request':{'sql':sql,'parameters':params,'includeTotal':False},'resultColumns':cols}
for v in c['sourceViews']['views']:
 if v['id']=='base-resources':
  v['productionQueryId']='base-production.days'
  for col in v['columns']:
   if col['field'].startswith('missing_production_'):
    suffix=col['field'].removeprefix('missing_production_');col.update(valueField='production_'+('total' if suffix=='total' else 'day_'+suffix),format='decimal2');col.pop('unavailable',None);col['reason']='所选日起未来七日生产排程，数量统一为件（1件=1箱）；有映射的基地按基本完成日期汇总，异常数量保持未知。'
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
