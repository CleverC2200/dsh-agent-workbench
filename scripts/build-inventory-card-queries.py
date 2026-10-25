"""Derive lean landing-card reads from the same reviewed batch adapters."""
import json,copy,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
for agent in ['aqkc','fc','qll','apsplan']:
 path=ROOT/f'business/inventory-{agent}/sql.config.json';c=json.loads(path.read_text())
 for prefix in ['health','branch-health']:
  key=prefix+'.summary'
  if key not in c['queries']:continue
  source=c['queries'][key]
  sql=source['request']['sql'].split('), inventory_batch_names AS (')[0]+')'
  branch=' AS stagnant_qty' in sql
  fields={'row_count':'COUNT(*)','total_qty':'SUM(r.total_qty)','available_qty':'SUM(r.available_qty)','pack_unit_qty':'SUM(r.pack_unit_qty)','freeze_qty':'SUM(r.freeze_qty)','max_age':'MAX(r.age_days)','base_max_age':'MAX(r.age_days)','age_valid_count':'SUM(CASE WHEN r.age_days>=0 AND r.total_qty>=0 THEN 1 ELSE 0 END)','overaged_qty':'SUM(r.overaged_qty)' if branch else 'CAST(NULL AS DECIMAL(18, 3))','stagnant_qty':'SUM(r.stagnant_qty)' if branch else 'CAST(NULL AS DECIMAL(18, 3))'}
  q={'title':'首页库存及货龄汇总','parameterSpec':{'gea_p1':copy.deepcopy(source['parameterSpec']['gea_p1'])},'request':{'sql':sql+' SELECT '+', '.join(expr+' AS '+name for name,expr in fields.items())+' FROM inventory_batch_totals AS r','parameters':{'gea_p1':source['request']['parameters']['gea_p1']},'includeTotal':False},'resultColumns':list(fields)}
  c['queries'][prefix+'.cards']=q
  scope=re.search(r"b\.warehouse_classify (?:IN \('[0-9]+'(?:, '[0-9]+')*\)|= '20')",sql)
  predicate=(scope.group(0)+' AND ') if scope else ''
  measures=['total_qty','available_qty','pack_unit_qty','freeze_qty']
  source_fields={'total_qty':'live_qty','available_qty':'available_qty','pack_unit_qty':'pack_unit_qty','freeze_qty':'freeze_qty'}
  inventory_sql="WITH quantities AS (SELECT b.warehouseid AS warehouseid, b.material_code AS material_code, "+', '.join('SUM(COALESCE(b.'+source_fields[k]+', 0)) AS '+k for k in measures)+" FROM agents_scm_inventory_sku_data_d AS b WHERE "+predicate+"b.month_date = REPLACE(CAST(:gea_p1 AS VARCHAR(10)), '-', '') GROUP BY b.warehouseid,b.material_code) SELECT COUNT(*) AS row_count, "+', '.join('SUM(q.'+k+') AS '+k for k in measures)+' FROM quantities AS q'
  inv=copy.deepcopy(q);inv['request']['sql']=inventory_sql;inv['resultColumns']=['row_count']+measures;inv['priority']=10
  c['queries'][prefix+'.inventory']=inv

 for view in c['sourceViews']['views']:
  if view['id'] in ['health','branch-stock']:
   prefix='branch-health' if view['summaryId'].startswith('branch-health.') else 'health'
   view['overviewSummaryId']=prefix+'.cards'
   view['inventorySummaryId']=prefix+'.inventory'
 # Base landing rows use only observed ages, not movement/FIFO/risk projection.
 if agent=='aqkc':
  source=c['queries']['batch-age.groups'];sql=source['request']['sql'].split('), batch_names AS (')[0]+')'
  fields={'level':'b.belong_base','average_age':'CASE WHEN SUM(b.age_weight_qty)>0 THEN SUM(b.weighted_age)/SUM(b.age_weight_qty) ELSE NULL END','max_age':'MAX(b.max_age)','row_count':'COUNT(*)','age_valid_count':'SUM(CASE WHEN b.age_weight_qty>0 THEN 1 ELSE 0 END)'}
  names=set(re.findall(r':(gea_p\d+)',sql));params={k:v for k,v in source['parameterSpec'].items() if k in names}
  c['queries']['page.health-groups']={'title':'基地首页货龄汇总','parameterSpec':params,'request':{'sql':sql+' SELECT '+', '.join(expr+' AS '+name for name,expr in fields.items())+' FROM batch_skus AS b GROUP BY b.belong_base ORDER BY b.belong_base','parameters':{k:source['request']['parameters'][k] for k in params},'includeTotal':False},'resultColumns':list(fields)}
 for query_id in ['source.health-date','source.branch-stock-date']:
  if query_id in c['queries']:c['queries'][query_id]['priority']=10
 path.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
