"""Connect original full-chain columns to published inventory and batch facts."""
from pathlib import Path
import json,copy,re
import sqlglot
from sqlglot import exp
root=Path(__file__).resolve().parents[1];path=root/'business/inventory-qll/sql.config.json';c=json.loads(path.read_text());fc=json.loads((root/'business/inventory-fc/sql.config.json').read_text())
# Keep the branch source in this plugin on the same audited contract as FC.
for key,q in fc['queries'].items():
 if key.startswith('replenishment.') or key.startswith('transfer_plan.'):c['queries'][key]=copy.deepcopy(q)
v=next(v for v in c['sourceViews']['views'] if v['id']=='branch-replenishment');original=next(v for v in fc['sourceViews']['views'] if v['id']=='replenishment');v.update({k:copy.deepcopy(original[k]) for k in ['queryId','columns','filters','description']})
q=c['queries']['inventory.groups'];t=sqlglot.parse_one(q['request']['sql'],read='postgres')
if not any(x.alias=='chain_age' for x in t.ctes):
 ctes=t.args['with'].expressions
 keys="chain_age_keys AS (SELECT r.base AS base,r.sku AS sku,CASE WHEN COUNT(DISTINCT r.category)=1 THEN MAX(r.category) ELSE NULL END AS category FROM filtered AS r GROUP BY r.base,r.sku)"
 aggregate="""chain_age AS (SELECT a.belong_base AS base,CASE WHEN :gea_p24='base' THEN NULL ELSE k.category END AS category,
 SUM(CASE WHEN a.age_days>=0 THEN a.live_qty*a.age_days ELSE 0 END)/NULLIF(SUM(CASE WHEN a.age_days>=0 THEN a.live_qty ELSE 0 END),0) AS average_age,
 SUM(CASE WHEN a.age_days>60 THEN a.live_qty ELSE 0 END) AS batch_over60
 FROM inventory_batch_ages AS a INNER JOIN comparison_health_date AS d ON a.month_date=REPLACE(CAST(d.day AS VARCHAR(10)),'-','') INNER JOIN chain_age_keys AS k ON k.base=a.belong_base AND k.sku=a.material_code
 GROUP BY a.belong_base,CASE WHEN :gea_p24='base' THEN NULL ELSE k.category END)"""
 for sql in [keys,aggregate]:ctes.append(sqlglot.parse_one('WITH '+sql+' SELECT 1 AS ok',read='postgres').ctes[0])
 t.join('chain_age AS ca',on="ca.base=r.base AND (:gea_p24='base' OR ca.category=r.category)",join_type='LEFT',copy=False,dialect='postgres')
 daily='SUM(CASE WHEN r.inventory>=0 AND r.daily_demand>=0 THEN r.daily_demand ELSE 0 END)';inventory='SUM(CASE WHEN r.inventory>=0 AND r.daily_demand>=0 THEN r.inventory ELSE 0 END)'
 expressions={'average_age':'MAX(ca.average_age)','batch_over60':'MAX(ca.batch_over60)','business_status':"CASE WHEN COUNT(r.target)<>COUNT(*) OR COUNT(r.inventory)<>COUNT(*) THEN '待核对目标' WHEN SUM(r.inventory-r.target)<0 THEN '低库存' WHEN MAX(ca.batch_over60)>0 THEN '大日期' WHEN SUM(r.inventory-r.target)>0 THEN '高库存' ELSE '正常' END",'estimated_month_end_turnover':f'CASE WHEN {daily}>0 THEN CASE WHEN {inventory}-{daily}*:gea_p2800>0 THEN ({inventory}-{daily}*:gea_p2800)/{daily} ELSE 0 END ELSE NULL END'}
 for name,sql in expressions.items():t.select(sql+' AS '+name,append=True,copy=False,dialect='postgres')
 q['request']['sql']=t.sql();q['resultColumns']+=list(expressions)
 q['parameterSpec']['gea_p2800']={'name':'days_remaining_in_month','type':'integer','minimum':0,'maximum':30,'nullable':False,'required':True};q['request']['parameters']['gea_p2800']=9
 # Atomic count and page share the expensive scoped source CTEs.
 page=t.copy();page.set('with',None);page.select('1 AS page_row_present',append=True,copy=False)
 count=t.copy();count.set('with',None)
 for k in ['order','limit','offset']:count.set(k,None)
 prefix=t.args['with'].sql()
 atomic=prefix+', chain_page AS ('+page.sql()+'), chain_count AS (SELECT COUNT(*) AS page_scope_total FROM ('+count.sql()+') AS n) SELECT '+', '.join('p.'+name+' AS '+name for name in q['resultColumns'])+',p.page_row_present AS page_row_present,n.page_scope_total AS page_scope_total FROM chain_count AS n LEFT JOIN chain_page AS p ON TRUE ORDER BY p.base,p.category,p.item,p.series,p.sku'
 c['queries']['inventory.groups.atomic'].update(request={'sql':atomic,'parameters':copy.deepcopy(q['request']['parameters']),'includeTotal':False},parameterSpec=copy.deepcopy(q['parameterSpec']),resultColumns=q['resultColumns']+['page_row_present','page_scope_total'])
for v in c['sourceViews']['views']:
 if v['id'] in ['category','organization']:
  for col in v['columns']:
   if col['field']=='known_over60':col['valueField']='batch_over60'
   if col['field']=='missing_judgment':col.update(valueField='business_status');col.pop('unavailable',None)
   if col['field']=='missing_month_end_turnover':col.update(valueField='estimated_month_end_turnover',format='decimal2',reason='按当前同范围库存和计划日均推算至月末，未计新增入库；缺需求或零分母不计算。');col.pop('unavailable',None)
  if not any(x['field']=='average_age' for x in v['columns']):v['columns'].append({'field':'average_age','label':'平均货龄（天）','format':'decimal2'})
# Separate branch table contract avoids changing the card's existing health summary.
if not any(v['id']=='branch-structure' for v in c['sourceViews']['views']):
 source=copy.deepcopy(next(v for v in c['sourceViews']['views'] if v['id']=='aging'));source.update(id='branch-structure',title='分仓',queryId='batch-age.groups',summaryId=None,defaultColumns=[],overrides={'group_level':'detail'})
 source['columns']=[{'field':k,'label':label,**({'format':fmt} if fmt else {})} for k,label,fmt in [('warehouse_name','分仓',None),('material_code','SKU',None),('material_name','产品',None),('total_qty','库存','decimal2'),('average_age','平均货龄','decimal2'),('historical_turnover','回顾周转','decimal2'),('overaged_qty','大日期库存','decimal2'),('warning','经营状态',None),('stat_date','数据日期',None)]];c['sourceViews']['views'].append(source)
for key in ['inventory.groups','inventory.groups.atomic']:
 y='d.production_year'
 leap=f"({y}-4*FLOOR({y}/4.0)=0 AND ({y}-100*FLOOR({y}/100.0)<>0 OR {y}-400*FLOOR({y}/400.0)=0))"
 valid_day=f"d.production_day >= 1 AND d.production_day <= CASE WHEN d.production_month=2 THEN CASE WHEN {leap} THEN 29 ELSE 28 END WHEN d.production_month IN (4,6,9,11) THEN 30 ELSE 31 END"
 c['queries'][key]['request']['sql']=c['queries'][key]['request']['sql'].replace('d.production_day BETWEEN 1 AND 31',valid_day)
 c['queries'][key]['request']['sql']=re.sub(r'%\((gea_p\d+)\)s',r':\1',c['queries'][key]['request']['sql'])
path.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
