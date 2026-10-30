"""D116: monthly inbound uses published v3 transactiontime, never production date."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1];path=root/'business/inventory-fc/sql.config.json';c=json.loads(path.read_text())
raw='TRIM(m.transactiontime)'
digits=' AND '.join(f"SUBSTRING({raw},{i},1) BETWEEN '0' AND '9'" for i in [1,2,3,4,6,7,9,10])
shape=f"LENGTH({raw})=10 AND SUBSTRING({raw},5,1)='-' AND SUBSTRING({raw},8,1)='-' AND {digits}"
maxday="CASE WHEN d.month_number=2 THEN CASE WHEN MOD(d.year_number,400)=0 OR (MOD(d.year_number,4)=0 AND MOD(d.year_number,100)<>0) THEN 29 ELSE 28 END WHEN d.month_number IN (4,6,9,11) THEN 30 ELSE 31 END"
ctes=f'''WITH inbound_dates AS (
 SELECT m.warehouseid AS warehouse_code,m.material_code AS sku,{raw} AS source_date,m.in_qty AS inbound_qty,
 CASE WHEN {shape} THEN CAST(SUBSTRING({raw},1,4) AS INTEGER) ELSE NULL END AS year_number,
 CASE WHEN {shape} THEN CAST(SUBSTRING({raw},6,2) AS INTEGER) ELSE NULL END AS month_number,
 CASE WHEN {shape} THEN CAST(SUBSTRING({raw},9,2) AS INTEGER) ELSE NULL END AS day_number
 FROM agents_scm_material_in_out_summary_d AS m
 WHERE (:gea_p3 IS NULL AND m.warehouse_classify=:gea_p4) OR m.warehouseid=:gea_p3
), inbound_checked AS (
 SELECT d.warehouse_code AS warehouse_code,d.sku AS sku,d.inbound_qty AS inbound_qty,
 CASE WHEN d.year_number BETWEEN 1 AND 9999 AND d.month_number BETWEEN 1 AND 12 AND d.day_number BETWEEN 1 AND {maxday} THEN d.source_date ELSE NULL END AS business_date
 FROM inbound_dates AS d
), inbound_period AS (
 SELECT d.warehouse_code AS warehouse_code,d.sku AS sku,d.inbound_qty AS inbound_qty,d.business_date AS business_date,
 CASE WHEN d.business_date>=:gea_p1 AND d.business_date<:gea_p2 THEN 1 ELSE 0 END AS in_month
 FROM inbound_checked AS d
 WHERE d.business_date IS NULL OR (d.business_date>=:gea_p1 AND d.business_date<:gea_p2)
)'''
summary='''SELECT COUNT(*) AS row_count,
 COUNT(CASE WHEN r.in_month=1 THEN 1 ELSE NULL END) AS month_row_count,
 COUNT(CASE WHEN r.business_date IS NULL THEN 1 ELSE NULL END) AS invalid_date_count,
 COUNT(CASE WHEN r.in_month=1 AND r.inbound_qty IS NULL THEN 1 ELSE NULL END) AS missing_qty_count,
 COUNT(CASE WHEN r.in_month=1 AND r.inbound_qty<0 THEN 1 ELSE NULL END) AS negative_qty_count,
 CASE WHEN COUNT(CASE WHEN r.business_date IS NULL OR (r.in_month=1 AND r.inbound_qty IS NULL) THEN 1 ELSE NULL END)>0 THEN NULL ELSE COALESCE(SUM(CASE WHEN r.in_month=1 THEN r.inbound_qty ELSE NULL END),0) END AS inbound_qty,
 COALESCE(SUM(CASE WHEN r.in_month=1 THEN r.inbound_qty ELSE NULL END),0) AS known_inbound_qty,
 MAX(CASE WHEN r.in_month=1 THEN r.business_date ELSE NULL END) AS last_business_date
 FROM inbound_period AS r'''
detail='''SELECT r.warehouse_code AS warehouse_code,r.sku AS sku,r.business_date AS business_date,
 CASE WHEN COUNT(r.inbound_qty)=COUNT(*) THEN SUM(r.inbound_qty) ELSE NULL END AS inbound_qty,COUNT(*) AS source_rows,
 COUNT(*)-COUNT(r.inbound_qty) AS missing_qty_count
 FROM inbound_period AS r WHERE r.in_month=1
 GROUP BY r.warehouse_code,r.sku,r.business_date ORDER BY r.warehouse_code,r.sku,r.business_date LIMIT :gea_p5 OFFSET :gea_p6'''
count='SELECT COUNT(*) AS total FROM (SELECT r.warehouse_code AS warehouse_code,r.sku AS sku,r.business_date AS business_date FROM inbound_period AS r WHERE r.in_month=1 GROUP BY r.warehouse_code,r.sku,r.business_date) AS total_groups'
params={'gea_p1':('start','string','2026-10-01'),'gea_p2':('end_exclusive','string','2026-10-31'),'gea_p3':('warehouse_code','string',None),'gea_p4':('branch_type','string','20'),'gea_p5':('page_size','integer',10),'gea_p6':('offset','integer',0)}
for key,sql,cols in [('inbound.summary',summary,['row_count','month_row_count','invalid_date_count','missing_qty_count','negative_qty_count','inbound_qty','known_inbound_qty','last_business_date']),('inbound.detail',detail,['warehouse_code','sku','business_date','inbound_qty','source_rows','missing_qty_count']),('inbound.count',count,['total'])]:
 full=ctes+' '+sql;used=set(re.findall(r'gea_p\d+',full));spec={k:{'name':n,'type':t,'nullable':v is None,'required':True}for k,(n,t,v) in params.items() if k in used}
 for k in ['gea_p1','gea_p2']:spec[k]['format']='YYYY-MM-DD'
 if 'gea_p5' in spec:spec['gea_p5'].update(minimum=1,maximum=200)
 if 'gea_p6' in spec:spec['gea_p6']['minimum']=0
 q={'title':'分仓本月入库','plugins':['fc'],'grain':'仓库×SKU×入库业务日期，源汇总记录按数量加和','notes':'D116：已发布目录v3的transactiontime，已核实源值YYYY-MM-DD；月初至所选日期次日，按warehouseid精确匹配，全部分仓取warehouse_classify=20。生产日期不参与月份筛选。数量保持in_qty源尺度，不做未经声明的换算，不对数量DISTINCT去重；无日期或缺数量时完整合计未知并返回已知合计及计数；负值作为源冲减保留并标明数量。','parameterSpec':spec,'request':{'sql':full,'parameters':{k:params[k][2] for k in spec},'includeTotal':False},'resultColumns':cols}
 if key=='inbound.detail':q['pagination']={'mode':'sql_limit_offset','countQuery':'inbound.count'}
 c['queries'][key]=q
c['sourceViews']['views']=[v for v in c['sourceViews']['views'] if v['id']!='inbound']+[{'id':'inbound','title':'本月入库','queryId':'inbound.detail','summaryId':'inbound.summary','timeMode':'period','preserveEmptySummary':True,'description':'按入库业务日期统计月初至所选日期，数量沿用入库来源尺度。无效日期或缺数量单独报告。','filters':[{'name':'warehouse_code','label':'分仓编码'}],'columns':[{'field':f,'label':l}for f,l in [('warehouse_code','分仓编码'),('sku','SKU'),('business_date','入库业务日期'),('inbound_qty','入库量（源单位）')]],'defaultColumns':['warehouse_code','sku','business_date','inbound_qty'],'metrics':[{'field':'inbound_qty','label':'本月入库量'}]}]
path.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
