"""Regenerate batch-age read contracts. Format generated JSON with the repository formatter."""
from pathlib import Path
import importlib.util,json,copy
W=Path(__file__).resolve().parents[1]
loader=importlib.util.spec_from_file_location('batch',W/'scripts/update-inventory-batch-source.py');batch=importlib.util.module_from_spec(loader);loader.loader.exec_module(batch)
prefix=batch.adapter(" AND b.month_date = REPLACE(CAST(:gea_p1 AS VARCHAR(10)), '-', '') AND (:gea_p2 = FALSE OR b.belong_base IN (:gea_p3)) AND (:gea_p4 IS NULL OR b.warehouseid = :gea_p4) AND (:gea_p5 IS NULL OR b.material_code = :gea_p5)").split('), inventory_batch_totals AS (')[0]+')'
prefix=prefix.replace('b.warehouseid AS warehouseid,','b.warehouse_classify AS warehouse_classify, b.warehouseid AS warehouseid,',1).replace('d.warehouseid AS warehouseid,','d.warehouse_classify AS warehouse_classify, d.warehouseid AS warehouseid,',1)
# Validate actual month lengths before civil-day arithmetic; Feb 30 is not a batch age.
y='d.production_year'
leap=f"({y}-4*FLOOR({y}/4.0)=0 AND ({y}-100*FLOOR({y}/100.0)<>0 OR {y}-400*FLOOR({y}/400.0)=0))"
max_day=f"CASE WHEN d.production_month=2 THEN CASE WHEN {leap} THEN 29 ELSE 28 END WHEN d.production_month IN (4,6,9,11) THEN 30 ELSE 31 END"
prefix=prefix.replace('d.production_day BETWEEN 1 AND 31',f'd.production_day >= 1 AND d.production_day <= {max_day}')
bands={'age0_30':'a.age_days BETWEEN 0 AND 30','age31_40':'a.age_days BETWEEN 31 AND 40','age41_60':'a.age_days BETWEEN 41 AND 60','age60_plus':'a.age_days > 60','age31_60':'a.age_days > 30 AND a.age_days <= 60','age61_90':'a.age_days > 60 AND a.age_days <= 90','age90_plus':'a.age_days > 90','age60_89':'a.age_days >= 60 AND a.age_days < 90','age90_119':'a.age_days >= 90 AND a.age_days < 120','overaged_qty':'a.age_days >= 60','stagnant_qty':'a.age_days >= 90','future7_candidates':'a.age_days >= 53','future14_candidates':'a.age_days >= 46','risk_current':"(a.warehouse_classify IN ('01','02') AND a.age_days > 60) OR (a.warehouse_classify = '20' AND a.age_days >= 90)",'risk7_candidates':"(a.warehouse_classify IN ('01','02') AND a.age_days > 53) OR (a.warehouse_classify = '20' AND a.age_days >= 83)",'risk14_candidates':"(a.warehouse_classify IN ('01','02') AND a.age_days > 46) OR (a.warehouse_classify = '20' AND a.age_days >= 76)"}
qtys=',\n '.join(f'SUM(CASE WHEN {cond} THEN a.live_qty ELSE 0 END) AS {key}' for key,cond in bands.items())
cte=prefix+f''', batch_skus AS (
 SELECT a.month_date AS month_date, a.warehouseid AS warehouseid, a.material_code AS material_code,
 CASE WHEN COUNT(DISTINCT NULLIF(TRIM(a.belong_base),''))=1 THEN MAX(NULLIF(TRIM(a.belong_base),'')) ELSE NULL END AS belong_base,
 CASE WHEN COUNT(DISTINCT NULLIF(TRIM(a.warehouse_name),''))=1 THEN MAX(NULLIF(TRIM(a.warehouse_name),'')) ELSE NULL END AS warehouse_name,
 CASE WHEN COUNT(DISTINCT NULLIF(TRIM(a.material_name),''))=1 THEN MAX(NULLIF(TRIM(a.material_name),'')) ELSE NULL END AS material_name,
 SUM(COALESCE(a.live_qty,0)) AS total_qty, SUM(COALESCE(a.available_qty,0)) AS available_qty, SUM(COALESCE(a.pack_unit_qty,0)) AS pack_unit_qty, SUM(COALESCE(a.freeze_qty,0)) AS freeze_qty,
 SUM(CASE WHEN a.age_days IS NOT NULL THEN a.live_qty ELSE 0 END) AS age_weight_qty,
 SUM(CASE WHEN a.age_days IS NOT NULL THEN a.live_qty*a.age_days ELSE 0 END) AS weighted_age,
 SUM(CASE WHEN a.live_qty>0 AND a.age_days IS NULL THEN a.live_qty ELSE 0 END) AS unknown_age_qty,
 MAX(a.age_days) AS max_age,
 {qtys}
 FROM inventory_batch_ages AS a GROUP BY a.month_date,a.warehouseid,a.material_code
), batch_names AS (
 SELECT n.warehouseid AS warehouseid,n.material_code AS material_code,
 CASE WHEN COUNT(DISTINCT NULLIF(TRIM(n.product_categ_name),''))=1 THEN MAX(NULLIF(TRIM(n.product_categ_name),'')) ELSE NULL END AS category,
 CASE WHEN COUNT(DISTINCT NULLIF(TRIM(n.material_group_name),''))=1 THEN MAX(NULLIF(TRIM(n.material_group_name),'')) ELSE NULL END AS material_group
 FROM agents_scm_material_in_out_summary_d AS n
 INNER JOIN batch_skus AS b ON b.warehouseid=n.warehouseid AND b.material_code=n.material_code
 GROUP BY n.warehouseid,n.material_code
), batch_sales AS (
 SELECT s.warehouse AS warehouseid,s.material_code AS material_code,
 SUM(CASE WHEN s.act_dl_qty>0 THEN s.act_dl_qty ELSE 0 END)/30.0 AS daily_movement
 FROM agents_scm_cust_deliv_daily_di AS s
 WHERE s.act_ship_date>=:gea_p6 AND s.act_ship_date<:gea_p7
 AND (:gea_p4 IS NULL OR s.warehouse=:gea_p4) AND (:gea_p5 IS NULL OR s.material_code=:gea_p5)
 GROUP BY s.warehouse,s.material_code
), batch_facts AS (
 SELECT b.warehouseid AS warehouseid,b.belong_base AS belong_base,b.warehouse_name AS warehouse_name,
 b.material_code AS material_code,b.material_name AS material_name,
 COALESCE(n.category,'未分类') AS product_categ_name,n.material_group AS material_group_name,
 b.available_qty AS available_qty,b.pack_unit_qty AS pack_unit_qty,b.freeze_qty AS freeze_qty,b.total_qty AS total_qty,b.age_weight_qty AS age_weight_qty,b.weighted_age AS weighted_age,
 b.unknown_age_qty AS unknown_age_qty,b.max_age AS max_age,
 {', '.join('b.'+k+' AS '+k for k in bands if not k.endswith('candidates'))},
 COALESCE(s.daily_movement,0) AS daily_movement,
 GREATEST(b.future7_candidates-7*COALESCE(s.daily_movement,0),0)-GREATEST(b.age60_plus-7*COALESCE(s.daily_movement,0),0) AS future7,
 GREATEST(b.future14_candidates-14*COALESCE(s.daily_movement,0),0)-GREATEST(b.age60_plus-14*COALESCE(s.daily_movement,0),0) AS future14,
 GREATEST(b.risk7_candidates-7*COALESCE(s.daily_movement,0),0) AS projected_risk7,
 GREATEST(b.risk14_candidates-14*COALESCE(s.daily_movement,0),0) AS projected_risk14
 FROM batch_skus AS b LEFT JOIN batch_names AS n ON b.warehouseid=n.warehouseid AND b.material_code=n.material_code
 LEFT JOIN batch_sales AS s ON b.warehouseid=s.warehouseid AND b.material_code=s.material_code
 WHERE (:gea_p8 IS NULL OR COALESCE(n.category,'未分类')=:gea_p8)
 AND (:gea_p12 IS NULL OR b.material_code LIKE :gea_p12 OR b.material_name LIKE :gea_p12)
), batch_groups AS (
 SELECT CASE WHEN :gea_p9='base' THEN b.belong_base WHEN :gea_p9='category' THEN b.product_categ_name ELSE b.material_code END AS level,
 CASE WHEN :gea_p9='detail' THEN b.warehouseid ELSE NULL END AS warehouseid,
 CASE WHEN :gea_p9 IN ('sku','detail') THEN b.material_code ELSE NULL END AS material_code,
 CASE WHEN COUNT(DISTINCT b.belong_base)=1 THEN MAX(b.belong_base) ELSE NULL END AS belong_base,
 CASE WHEN COUNT(DISTINCT b.warehouse_name)=1 THEN MAX(b.warehouse_name) ELSE NULL END AS warehouse_name,
 CASE WHEN COUNT(DISTINCT b.material_name)=1 THEN MAX(b.material_name) ELSE NULL END AS material_name,
 CASE WHEN COUNT(DISTINCT b.product_categ_name)=1 THEN MAX(b.product_categ_name) ELSE NULL END AS product_categ_name,
 CASE WHEN COUNT(DISTINCT b.material_group_name)=1 THEN MAX(b.material_group_name) ELSE NULL END AS material_group_name,
 COUNT(*) AS row_count,COUNT(CASE WHEN b.age_weight_qty>0 THEN 1 ELSE NULL END) AS age_valid_count, COUNT(DISTINCT CASE WHEN b.overaged_qty>0 THEN b.material_code ELSE NULL END) AS is_overaged_sku_count, CAST(NULL AS INTEGER) AS is_low_stock_sku_count,CAST(NULL AS INTEGER) AS is_high_stock_sku_count,CAST(NULL AS INTEGER) AS conflicting_stock_flag_skus,CAST(NULL AS VARCHAR(255)) AS source_updated_at,COUNT(DISTINCT b.material_code) AS sku_count,
 SUM(b.available_qty) AS available_qty,SUM(b.pack_unit_qty) AS pack_unit_qty,SUM(b.freeze_qty) AS freeze_qty,CAST(:gea_p1 AS DATE) AS stat_date,MAX(b.max_age) AS age_days,SUM(b.total_qty) AS total_qty, SUM(b.age_weight_qty) AS age_weight_qty,SUM(b.weighted_age) AS weighted_age,
 SUM(b.unknown_age_qty) AS unknown_age_qty,MAX(b.max_age) AS max_age,
 CASE WHEN SUM(b.age_weight_qty)>0 THEN SUM(b.weighted_age)*1.0/SUM(b.age_weight_qty) ELSE NULL END AS average_age,
 {', '.join('SUM(b.'+k+') AS '+k for k in list(bands) if not k.endswith('candidates'))},
 SUM(b.daily_movement) AS daily_movement,SUM(b.future7) AS future7,SUM(b.future14) AS future14,
 SUM(b.projected_risk7) AS projected_risk7,SUM(b.projected_risk14) AS projected_risk14,
 CASE WHEN SUM(b.daily_movement)>0 THEN SUM(b.total_qty)*1.0/SUM(b.daily_movement) ELSE NULL END AS historical_turnover,
 CASE WHEN SUM(b.age_weight_qty)=0 THEN NULL WHEN SUM(b.stagnant_qty)>0 THEN '滞库' WHEN SUM(b.overaged_qty)>0 THEN '预警' ELSE '正常' END AS warning
 FROM batch_facts AS b
 GROUP BY CASE WHEN :gea_p9='base' THEN b.belong_base WHEN :gea_p9='category' THEN b.product_categ_name ELSE b.material_code END,
 CASE WHEN :gea_p9='detail' THEN b.warehouseid ELSE NULL END,
 CASE WHEN :gea_p9 IN ('sku','detail') THEN b.material_code ELSE NULL END
)'''
import re
cte=re.sub(r'GREATEST\((b\.\w+-\d+\*COALESCE\(s.daily_movement,0\)),0\)', lambda m: '(CASE WHEN '+m[1]+' > 0 THEN '+m[1]+' ELSE 0 END)', cte)
cols=['row_count','age_valid_count','is_overaged_sku_count','is_low_stock_sku_count','is_high_stock_sku_count','conflicting_stock_flag_skus','source_updated_at','available_qty','pack_unit_qty','freeze_qty','stat_date','age_days','level','warehouseid','material_code','belong_base','warehouse_name','material_name','product_categ_name','material_group_name','sku_count','total_qty','age_weight_qty','weighted_age','unknown_age_qty','max_age','average_age']+[k for k in bands if not k.endswith('candidates')]+['daily_movement','future7','future14','projected_risk7','projected_risk14','historical_turnover','warning']
params=[('stat_date','string','2026-10-22',False,'YYYY-MM-DD'),('bases_enabled','boolean',False,False,None),('bases','array',['郑州'],False,None),('warehouse_code','string',None,True,None),('material_code','string',None,True,None),('batch_rolling_start','string','20260923',False,'YYYYMMDD'),('batch_end_exclusive','string','20261023',False,'YYYYMMDD'),('category','string',None,True,None),('group_level','string','base',False,None),('page_size','integer',200,False,None),('offset','integer',0,False,None),('search_pattern','string',None,True,None),('sort_field','string','key',False,None),('sort_direction','string','asc',False,None)]
spec={f'gea_p{i}':dict(name=n,type=t,example=v,required=True,nullable=null,**({'format':fmt} if fmt else {})) for i,(n,t,v,null,fmt) in enumerate(params,1)}
spec['gea_p9']['enum']=['base','category','sku','detail'];spec['gea_p10'].update(minimum=1,maximum=200);spec['gea_p11']['minimum']=0
spec['gea_p13']['enum']=['key','total_qty','age60_plus','average_age','daily_movement'];spec['gea_p14']['enum']=['asc','desc']
order=', '.join(f"CASE WHEN :gea_p13='{f}' AND :gea_p14='{d}' THEN g.{f} ELSE NULL END {d.upper()}" for f in ['total_qty','age60_plus','average_age','daily_movement'] for d in ['asc','desc'])+', g.level,g.warehouseid,g.material_code'
requestparams={k:v['example'] for k,v in spec.items()}
notes='批次生产日期计算货龄；正库存有效批次数量加权，未知货龄单列，不用最大值冒充平均值。FIFO在仓库/SKU内扣近30日正向发货日均×窗口，按SKU截零后汇总。基地未来7/14日为新增跨60天风险，排除当前60+。全链未来7/14日为基地>60/分仓>=90的期末风险量。不以其他SKU库存或销量抵消。'
for agent in ['aqkc','fc','qll']:
 path=W/f'business/inventory-{agent}/sql.config.json';c=json.loads(path.read_text())
 for key,sql,sp,rc in [('batch-age.groups',cte+' SELECT '+', '.join('g.'+k+' AS '+k for k in cols)+' FROM batch_groups AS g ORDER BY '+order+' LIMIT :gea_p10 OFFSET :gea_p11',spec,cols),('batch-age.count',cte+' SELECT COUNT(*) AS total FROM batch_groups AS g',{k:v for k,v in spec.items() if k not in ['gea_p10','gea_p11','gea_p13','gea_p14']},['total']),('batch-age.atomic',cte+', batch_page AS (SELECT '+', '.join('g.'+k+' AS '+k for k in cols)+', 1 AS page_row_present FROM batch_groups AS g ORDER BY '+order+' LIMIT :gea_p10 OFFSET :gea_p11), batch_count AS (SELECT COUNT(*) AS page_scope_total FROM batch_groups AS g) SELECT '+', '.join('p.'+k+' AS '+k for k in cols)+', p.page_row_present AS page_row_present,c.page_scope_total AS page_scope_total FROM batch_count AS c LEFT JOIN batch_page AS p ON 1=1 ORDER BY '+order.replace('g.', 'p.'),spec,cols+['page_row_present','page_scope_total'])]:
  c['queries'][key]={'title':'批次货龄结构','grain':'snapshot + warehouse/SKU FIFO -> selected group','notes':notes,'request':{'sql':'WITH '+sql,'parameters':{k:requestparams[k] for k in sp},'includeTotal':False},'parameterSpec':sp,'resultColumns':rc}
 c['queries']['batch-age.groups']['pagination']={'mode':'sql_limit_offset','countQuery':'batch-age.count','atomicQuery':'batch-age.atomic'}
 if agent == 'fc':
  for query_id in ['batch-age.groups', 'batch-age.count', 'batch-age.atomic']:
   query = c['queries'][query_id]
   query['request']['sql'] = query['request']['sql'].replace('FROM batch_groups AS g', 'FROM batch_groups AS g WHERE (:gea_p15 IS NULL OR g.warning = :gea_p15)')
   query['parameterSpec'] = {**query['parameterSpec'], 'gea_p15': {'name': 'risk', 'type': 'string', 'required': True, 'nullable': True, 'enum': ['预警', '滞库', '正常']}}
   query['request']['parameters']['gea_p15'] = None
 mappings={'fc':{'inventory':{'missing_age_5':('average_age','decimal2'),'missing_age_6':('age0_30','quantity-share'),'missing_age_7':('age31_60','quantity-share'),'missing_age_8':('age61_90','quantity-share'),'missing_age_9':('age90_plus','quantity-share'),'missing_age_10':('warning',None),'missing_age_11':('daily_movement','decimal2'),'missing_age_12':('historical_turnover','decimal2')}},'qll':{'aging':{'warehouse_type':('warehouseid',None),'missing_expired':('risk_current','decimal2'),'missing_age60_89':('age60_89','decimal2'),'missing_future7':('projected_risk7','decimal2'),'missing_future14':('projected_risk14','decimal2')}},'aqkc':{'age-structure':{'missing_warning':('warning',None),'max_age':('average_age','decimal2'),'missing_age0_30':('age0_30','quantity-share'),'missing_age31_40':('age31_40','quantity-share'),'missing_age41_60':('age41_60','quantity-share'),'missing_age60':('age60_plus','quantity-share'),'missing_future7':('future7','decimal2'),'missing_future14':('future14','decimal2'),'missing_movement':('daily_movement','decimal2')}}}
 for view in c['sourceViews']['views']:
  if view['id'] not in mappings[agent]:continue
  view.update(queryId='batch-age.groups',description=notes,overrides={'group_level':'base' if agent=='aqkc' else 'detail'})
  view.pop('summaryId',None);view['metrics']=[];view['gapIds']=[]
  if agent == 'fc':
   view.pop('pageReadSize', None)
   view['maxPageSize'] = 50
   view['filters'] = [f for f in view['filters'] if f['name'] != 'risk'] + [{'name': 'risk', 'label': '风险快捷查询', 'options': [{'label': label, 'value': label if label != '全部' else ''} for label in ['预警', '滞库', '正常', '全部']]}]
  for col in view['columns']:
   if col['field'] in mappings[agent][view['id']]:
    f,fmt=mappings[agent][view['id']][col['field']];col.update(valueField=f);col.pop('unavailable',None);col.pop('reason',None)
    if fmt:col['format']=fmt
   if agent=='aqkc' and col['field']=='max_age':col['label']='平均货龄（天）'
 path.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
print('Added three batch-age contracts, original column mappings')
