"""Complete original FC columns using the reviewed current-order model and period plans."""
from pathlib import Path
import json,re,copy
ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'business/inventory-fc/sql.config.json';config=json.loads(path.read_text())
source=(ROOT/'business/inventory-fc/current-shortage-source.sql').read_text().strip()
canonical_ctes,canonical_select=source.rsplit('\nSELECT',1)
canonical_ctes=canonical_ctes.removeprefix('WITH ')
# Keep the same source/status/allocation/three-stage formula as the current-order card.
current_ctes=canonical_ctes+', fc_current_orders AS (SELECT'+canonical_select+'''), fc_order_presence AS (
SELECT COUNT(*) AS source_order_count FROM (SELECT 1 AS present FROM agents_scm_execute_detail_d AS probe_order LIMIT 1) AS order_probe
)'''
month_key='gea_p2700'
def period_cte():
 fields=[]
 for scope,column in [('current','warehouse_month_out_plan'),('next','warehouse_future30_qty')]:
  condition=f"p.stat_month=SUBSTRING(REPLACE(CAST(:{month_key} AS VARCHAR(10)),'-',''),1,6)"
  count=f'COUNT(CASE WHEN {condition} THEN 1 ELSE NULL END)'
  fields.append(f'CASE WHEN {count}=1 THEN MAX(CASE WHEN {condition} THEN p.{column} ELSE NULL END) ELSE NULL END AS {scope}_out')
  fields.append(f'CAST(NULL AS DECIMAL(20,6)) AS {scope}_transfer')
  fields.append(f"CASE WHEN {count}=1 THEN '分仓同步表' ELSE NULL END AS {scope}_source")
  fields.append(f'{count} AS {scope}_count')
 return '''fc_period_plans AS (SELECT p.warehouse_code AS warehouse_code,p.material_code AS sku,
 '''+',\n '.join(fields)+'''
 FROM agents_scm_warehouse_transfer_plan_data_d AS p GROUP BY p.warehouse_code,p.material_code
)'''
def add_period_params(q):
 for key,name,example in [(month_key,'month','2026-10-01')]:
  q['parameterSpec'][key]={'name':name,'type':'string','format':'YYYY-MM-01','nullable':False,'required':True,'example':example};q['request']['parameters'][key]=example
 # Some existing replenishment queries already expose month. Reuse that slot.
 existing=next((k for k,s in q['parameterSpec'].items() if s['name']=='month' and k!=month_key),None)
 if existing:
  q['parameterSpec'].pop(month_key);q['request']['parameters'].pop(month_key)
  return existing
 return month_key
for id in ['replenishment.detail','replenishment.detail.atomic','transfer_plan.detail','transfer_plan.detail.atomic']:
 q=config['queries'][id]
 if 'fc_period_plans AS (' in q['request']['sql']:continue
 actual_month=add_period_params(q)
 s=q['request']['sql'];is_repl=id.startswith('replenishment.');alias='p' if id.endswith('.atomic') else 'r'
 prefix=(current_ctes+', ' if is_repl else '')+period_cte().replace(':'+month_key,':'+actual_month)
 s='WITH '+prefix+', '+s.removeprefix('WITH ')
 final_from=s.rfind(' FROM scope_count AS n') if id=='replenishment.detail.atomic' else s.rfind(' FROM filtered AS r')
 if id=='transfer_plan.detail.atomic':
  # Existing atomic transfer page is wrapped in a derived page; enrich its inner detail once.
  inner_marker=' FROM filtered AS r LEFT JOIN branch_stock AS hs'
  final_from=s.index(inner_marker)
  alias='r'
 cols={
  'period_current_out':'pp.current_out',
  'period_current_transfer':'CAST(NULL AS DECIMAL(20,6))',
  'period_next_out':'pp.next_out',
  'period_next_transfer':'CAST(NULL AS DECIMAL(20,6))',
  'period_current_source':'pp.current_source',
  'period_next_source':'pp.next_source',
  'period_plan_status':"CASE WHEN pp.current_count>1 THEN '同月计划冲突' WHEN pp.current_count=1 AND pp.current_out>=0 THEN '出货计划已同步；月调拨计划待接入' WHEN pp.current_count=1 THEN '出货计划数量缺失或无效' ELSE '所选月份无出货计划' END",
 }
 if is_repl:
  for out,field in [('current_order_demand','demand_qty'),('current_order_allocated','allocated_qty'),('current_order_remaining','remaining_qty'),('current_order_shortage','shortage_qty')]:
   cols[out]=f'CASE WHEN op.source_order_count=0 OR co.invalid_sku<>0 THEN NULL ELSE COALESCE(co.{field},0) END'
  cols['expected_month_end_qty']='CAST(NULL AS DECIMAL(20,6))'
 # Add fields to the selected page without changing its scope, ordering or count.
 s=s[:final_from]+', '+', '.join(expr+' AS '+name for name,expr in cols.items())+s[final_from:]
 if id=='replenishment.detail.atomic':
  needle=' FROM scope_count AS n LEFT JOIN page_rows AS p ON 1 = 1'
 else:needle=' FROM filtered AS r'
 join=f' LEFT JOIN fc_period_plans AS pp ON pp.warehouse_code={alias}.warehouse_code AND pp.sku={alias}.sku'
 if is_repl:
  join+=f" LEFT JOIN fc_current_orders AS co ON co.location_type='分仓' AND co.warehouseid={alias}.warehouse_code AND co.material_code={alias}.sku CROSS JOIN fc_order_presence AS op"
 at=s.rfind(needle)
 s=s[:at+len(needle)]+join+s[at+len(needle):]
 if id=='transfer_plan.detail.atomic':
  # Atomic envelope's outer projection must carry every enriched detail field.
  at=s.index(' FROM ')
  # The first FROM belongs to a CTE, so locate the outer page projection explicitly.
  marker='SELECT p.warehouse_code AS warehouse_code'
  start=s.rfind(marker)
  outer_from=s.index(' FROM ',start)
  s=s[:outer_from]+', '+', '.join('p.'+name+' AS '+name for name in cols)+s[outer_from:]
 q['request']['sql']=s;q['resultColumns']+=list(cols)
 q['notes']=str(q.get('notes',''))+' 原业务列按计划月份匹配；stat_month匹配自然月；次月出货取warehouse_future30_qty；月调拨计划尚无来源，依赖它的月末测算保持NULL；同月多版本冲突保持未知。补货量仍沿用原有效计划/历史动销规则。当前备单中量=11种未备单完成状态的订单需求，当前缺货复用三层模型，库存占用不替代订单自身占用。'
# Base resources use raw stock availability, not the removed field in the old daily target view.
base='''WITH fc_base_stock AS (
 SELECT NULLIF(TRIM(b.belong_base),'') AS base,COUNT(DISTINCT b.material_code) AS row_count,
 SUM(COALESCE(b.available_qty,0)) AS known_available,COUNT(b.available_qty) AS known_available_count
 FROM agents_scm_inventory_sku_data_d AS b
 WHERE b.month_date=REPLACE(CAST(:gea_p1 AS VARCHAR(10)),'-','')
 AND NULLIF(TRIM(b.belong_base),'') IS NOT NULL AND (:gea_p2=FALSE OR b.belong_base IN (:gea_p3))
 AND (:gea_p4 IS NULL OR b.material_code=:gea_p4)
 GROUP BY NULLIF(TRIM(b.belong_base),'')
)'''
bs={'gea_p1':{'name':'stat_date','type':'string','format':'YYYY-MM-DD','nullable':False},'gea_p2':{'name':'bases_enabled','type':'boolean','nullable':False},'gea_p3':{'name':'bases','type':'array','nullable':False},'gea_p4':{'name':'sku','type':'string','nullable':True},'gea_p5':{'name':'page_size','type':'integer','minimum':1,'maximum':100,'nullable':False},'gea_p6':{'name':'offset','type':'integer','minimum':0,'nullable':False}}
bp={'gea_p1':'2026-10-22','gea_p2':False,'gea_p3':['郑州'],'gea_p4':None,'gea_p5':10,'gea_p6':0}
bcols=['base','row_count','known_available','known_available_count']
projection=', '.join('b.'+k+' AS '+k for k in bcols)
for id in ['base_resources.detail','base_resources.count','base_resources.detail.atomic']:
 q=config['queries'][id];count=id.endswith('.count');atomic=id.endswith('.atomic')
 sql=base+(' SELECT COUNT(*) AS total FROM fc_base_stock AS b' if count else ' SELECT '+projection+' FROM fc_base_stock AS b ORDER BY b.base LIMIT :gea_p5 OFFSET :gea_p6')
 if atomic:sql=base+', fc_base_count AS (SELECT COUNT(*) AS page_scope_total FROM fc_base_stock AS b), fc_base_page AS (SELECT '+projection+', 1 AS page_row_present FROM fc_base_stock AS b ORDER BY b.base LIMIT :gea_p5 OFFSET :gea_p6) SELECT '+', '.join('p.'+k+' AS '+k for k in bcols)+', p.page_row_present AS page_row_present,n.page_scope_total AS page_scope_total FROM fc_base_count AS n LEFT JOIN fc_base_page AS p ON TRUE ORDER BY p.base'
 specs={k:v for k,v in bs.items() if not count or k not in ['gea_p5','gea_p6']}
 q.update(parameterSpec=specs,request={'sql':sql,'parameters':{k:bp[k] for k in specs},'includeTotal':False},resultColumns=['total'] if count else bcols+(['page_row_present','page_scope_total'] if atomic else []))
for v in config['sourceViews']['views']:
 mappings={}
 if v['id']=='replenishment':mappings={'missing_preparingQty':'current_order_demand','missing_shortageQty':'current_order_shortage','missing_expectedMonthEndInventoryQty':'expected_month_end_qty'}
 if v['id']=='plan':mappings={'missing_current_out':'period_current_out','missing_current_transfer':'period_current_transfer','missing_current_source':'period_current_source','missing_next_out':'period_next_out','missing_next_transfer':'period_next_transfer','missing_next_source':'period_next_source','missing_plan_status':'period_plan_status'}
 if v['id']=='base-resources':
  v.update(timeMode='health',snapshotQuery='source.health-date',overrides={},filters=[f for f in v['filters'] if f['name'] in ['base','sku']])
 for c in v['columns']:
  if c['field'] in mappings:
   c.update(valueField=mappings[c['field']]);c.pop('unavailable',None);c.pop('reason',None)
   if not c['field'].endswith('_source') and c['field']!='missing_plan_status':c['format']='decimal2'
   if c['field']=='missing_preparingQty':c['reason']='当前11种未备单完成状态的订单需求量；不含下发WMS订单，不等同于库存备单占用。'
   if c['field']=='missing_shortageQty':c['reason']='订单还需满足量逐单截零，分仓SKU合计后减一次可用库存再截零；与当前订单卡片同口径。'
   if c['field']=='missing_expectedMonthEndInventoryQty':c['reason']='月调拨计划尚无真实来源，月末库存保持未知；不以调拨中量替代月计划。'
   if c['field'].startswith('missing_current_') or c['field'].startswith('missing_next_'):c['reason']='按stat_month匹配出货计划；真实0保持0，缺失和同月重复保持未知；月调拨计划尚无真实来源。'
path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
print('Completed FC current-order columns, period plan display, base availability')
# Current demand with no stock/plan key must still be visible in replenishment.
config=json.loads(path.read_text())
for key,q in config['queries'].items():
 if not key.startswith('replenishment.') or 'source_keys AS (' not in q['request']['sql']:continue
 s=q['request']['sql']
 if 'fc_current_orders AS (' not in s:s='WITH '+current_ctes+', '+s.removeprefix('WITH ')
 a=s.index('source_keys AS (')+len('source_keys AS (');b=s.index('), scope_keys AS (',a)
 body=s[a:b]
 if 'FROM fc_current_orders AS' not in body:
  body+=' UNION ALL SELECT co.warehouseid AS warehouse_code,co.material_code AS material_code FROM fc_current_orders AS co WHERE co.location_type=\'分仓\' AND co.material_code IS NOT NULL AND co.warehouseid IS NOT NULL '
  s=s[:a]+body+s[b:]
 q['request']['sql']=s
path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
# Derived period columns reuse the exact-month aggregates, without reclassifying undated plans.
config=json.loads(path.read_text())
for id in ['replenishment.detail','replenishment.detail.atomic']:
 q=config['queries'][id];s=q['request']['sql'];alias='p' if id.endswith('.atomic') else 'r'
 if ' AS period_next_daily' in s:continue
 q['parameterSpec']['gea_p2702']={'name':'next_days_in_month','type':'integer','minimum':28,'maximum':31,'nullable':False,'required':True};q['request']['parameters']['gea_p2702']=30
 cols={'period_remaining_out':f'CASE WHEN pp.current_count<>1 OR pp.current_out IS NULL THEN NULL WHEN pp.current_out-{alias}.month_ship_positive>0 THEN pp.current_out-{alias}.month_ship_positive ELSE 0 END','period_current_daily':'CASE WHEN pp.current_count>1 THEN NULL ELSE pp.current_out/CAST(:gea_p2301 AS DECIMAL(20,6)) END','period_next_daily':'CASE WHEN pp.next_count>1 THEN NULL ELSE pp.next_out/CAST(:gea_p2702 AS DECIMAL(20,6)) END'}
 marker=' FROM scope_count AS n' if id.endswith('.atomic') else ' FROM filtered AS r'
 at=s.rfind(marker);s=s[:at]+', '+', '.join(v+' AS '+k for k,v in cols.items())+s[at:];q['request']['sql']=s;q['resultColumns']+=list(cols)
for view in config['sourceViews']['views']:
 if view['id']=='replenishment':
  mapping={'remaining_outbound_qty':'period_remaining_out','planned_daily_shipment':'period_current_daily','missing_nextOutboundQty':'period_next_out','missing_nextDailyOutboundQty':'period_next_daily','missing_nextTransferQty':'period_next_transfer'}
  for col in view['columns']:
   if col['field'] in mapping:col.update(valueField=mapping[col['field']],format='decimal2',reason='按stat_month读取当月及次月出货计划，数量单位件；缺失或同月重复保持未知，月调拨计划暂无真实来源。');col.pop('unavailable',None)
for id in ['base_resources.detail','base_resources.count','base_resources.detail.atomic']:
 config['queries'][id]['request']['sql']=config['queries'][id]['request']['sql'].replace('COUNT(b.available_qty) AS known_available_count','COUNT(DISTINCT CASE WHEN b.available_qty IS NOT NULL THEN b.material_code ELSE NULL END) AS known_available_count')
path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')

# Preserve FC net-demand semantics when regenerating the base list queries.
import runpy
runpy.run_path(str(Path(__file__).with_name("align-fc-workflow.py")))
