"""Add original DSH list filters before pagination; submission keeps its own scope."""
import json,re
from pathlib import Path
path=Path(__file__).resolve().parents[1]/'business/inventory-fc/sql.config.json'
c=json.loads(path.read_text())
q=c['queries']['replenishment.detail']
original=q['request']['sql']
if original.startswith('/* fc-list-interactions:'):
    original=original.split('WITH list_source AS (',1)[1].split('), list_filtered AS (',1)[0]
source=re.sub(r' ORDER BY r\.warehouse_code, r\.sku LIMIT :gea_p8 OFFSET :gea_p9\s*$','',original)
assert source!=q['request']['sql']
fields=q['resultColumns']
project=lambda a: ', '.join(f'{a}.{f} AS {f}' for f in fields)
modes="(:gea_p7 IS NOT NULL OR :gea_p4100 = 'all' OR (:gea_p4100 = 'business' AND (r.inventory_qty > 0 OR r.preparing > 0 OR r.rolling_ship_daily > 0 OR r.period_current_out > 0 OR r.period_current_transfer > 0 OR r.period_next_out > 0 OR r.period_next_transfer > 0)) OR (:gea_p4100 = 'urgent' AND r.current_order_shortage > 0) OR (:gea_p4100 = 'recommended' AND r.recommended_qty > 0))"
common=f'/* fc-list-interactions:v1 */\nWITH list_source AS ({source}), list_filtered AS (SELECT {project("r")} FROM list_source AS r WHERE {modes})'
view=next(v for v in c['sourceViews']['views'] if v['id']=='replenishment')
sorts=list(dict.fromkeys(col.get('valueField',col['field']) for col in view['columns'] if col.get('valueField',col['field']) in fields and col['field'] not in ['missing_actualQty','missing_reason']))
def order(a):
    terms=[]
    for f in sorts:
        terms.extend([f"CASE WHEN :gea_p4101 = '{f}' AND {a}.{f} IS NULL THEN 1 ELSE 0 END ASC",f"CASE WHEN :gea_p4101 = '{f}' AND :gea_p4102 = 'asc' THEN {a}.{f} ELSE NULL END ASC",f"CASE WHEN :gea_p4101 = '{f}' AND :gea_p4102 = 'desc' THEN {a}.{f} ELSE NULL END DESC"])
    return ', '.join(terms+[f'{a}.warehouse_code',f'{a}.sku'])
specs={'gea_p4100':{'name':'list_mode','type':'string','nullable':False,'enum':['all','business','urgent','recommended']},'gea_p4101':{'name':'sort_field','type':'string','nullable':False,'enum':['key',*sorts]},'gea_p4102':{'name':'sort_direction','type':'string','nullable':False,'enum':['asc','desc']}}
for id in ['replenishment.detail','replenishment.count','replenishment.detail.atomic']:
    dest=c['queries'][id]
    dest['parameterSpec']=json.loads(json.dumps(q['parameterSpec']))
    dest['request']['parameters']=dict(q['request']['parameters'])
    dest['parameterSpec'].update(specs)
    dest['request']['parameters'].update({'gea_p4100':'all','gea_p4101':'key','gea_p4102':'asc'})
    if id.endswith('.count'):
        for k in ['gea_p8','gea_p9','gea_p4101','gea_p4102']:
            dest['parameterSpec'].pop(k);dest['request']['parameters'].pop(k)
        dest['request']['sql']=common+' SELECT COUNT(*) AS total FROM list_filtered AS r'
    elif id.endswith('.atomic'):
        dest['request']['sql']=common+f', list_count AS (SELECT COUNT(*) AS total FROM list_filtered AS r), list_page AS (SELECT {project("r")},1 AS page_row_present FROM list_filtered AS r ORDER BY {order("r")} LIMIT :gea_p8 OFFSET :gea_p9) SELECT {project("p")}, p.page_row_present AS page_row_present, n.total AS page_scope_total FROM list_count AS n LEFT JOIN list_page AS p ON TRUE ORDER BY {order("p")} LIMIT :gea_p8'
    else:
        dest['request']['sql']=common+f' SELECT {project("r")} FROM list_filtered AS r ORDER BY {order("r")} LIMIT :gea_p8 OFFSET :gea_p9'
# Keep a single explicit page+count statement for the visible list.
atomic=c['queries']['replenishment.detail.atomic']
if ' AS page_scope_has_material_group' not in atomic['request']['sql']:
    atomic['request']['sql']=atomic['request']['sql'].replace(
      'list_count AS (SELECT COUNT(*) AS total FROM list_filtered AS r)',
      "list_count AS (SELECT COUNT(*) AS total, MAX(CASE WHEN TRIM(COALESCE(r.material_group, '')) NOT IN ('', '未提供', '未分类', '待核实', '—', '-') THEN 1 ELSE 0 END) AS has_material_group FROM list_filtered AS r)")
    atomic['request']['sql']=atomic['request']['sql'].replace('n.total AS page_scope_total FROM list_count', 'n.total AS page_scope_total, n.has_material_group AS page_scope_has_material_group FROM list_count')
    if 'page_scope_has_material_group' not in atomic['resultColumns']:atomic['resultColumns'].append('page_scope_has_material_group')
for v in c['sourceViews']['views']:
    if v['id']=='base-resources':v['requiresSku']=True
    if v['id'] in ['replenishment','plan','inventory']:
        if not any(f['name']=='search' for f in v['filters']):v['filters'].append({'name':'search','label':'SKU／产品名称'})
    if v['id']=='replenishment':
        v['defaultFilters']={'list_mode':'business','sort_field':'recommended_qty','sort_direction':'desc'}
        if not any(f['name']=='list_mode' for f in v['filters']):v['filters'].append({'name':'list_mode','label':'补货筛选','options':[{'label':'有业务','value':'business'},{'label':'紧急 SKU','value':'urgent'},{'label':'低于建议','value':'recommended'},{'label':'全部','value':'all'}]})
        v['sortFields']={col['field']:col.get('valueField',col['field']) for col in v['columns'] if col.get('valueField',col['field']) in sorts and col['field'] not in ['missing_actualQty','missing_reason']}
        for name in ['sort_field','sort_direction']:
            if not any(f['name']==name for f in v['filters']):v['filters'].append({'name':name,'label':name,'hidden':True})
    if v['id']=='inventory':
        v['sortFields']={'total_qty':'total_qty','missing_age_5':'average_age','missing_age_9':'age60_plus','missing_age_11':'daily_movement'}
        for name in ['sort_field','sort_direction']:
            if not any(f['name']==name for f in v['filters']):v['filters'].append({'name':name,'label':name,'hidden':True})
        if not any(f['name']=='age_filter' for f in v['filters']):v['filters'].append({'name':'age_filter','label':'货龄筛选','multiple':True,'options':[{'label':'60–90天','value':'60-90'},{'label':'90天以上','value':'90+'}]})
for id in ['batch-age.groups','batch-age.count','batch-age.atomic']:
    dest=c['queries'][id]
    if 'gea_p4103' in dest['parameterSpec']:continue
    dest['parameterSpec']['gea_p4103']={'name':'age_filter','type':'string','nullable':False,'enum':['','60-90','90+','60-90,90+']}
    dest['request']['parameters']['gea_p4103']=''
    sql=dest['request']['sql']
    needle="(:gea_p15 IS NULL OR g.warning = :gea_p15)"
    assert needle in sql,id
    sql=sql.replace(needle,needle+" AND (:gea_p4103 = '' OR (:gea_p4103 = '60-90' AND g.age60_89 > 0) OR (:gea_p4103 = '90+' AND g.age90_plus > 0) OR (:gea_p4103 = '60-90,90+' AND (g.age60_89 > 0 OR g.age90_plus > 0)))")
    dest['request']['sql']=sql

c['queries']['branch-batches.page']={
 'title':'分仓SKU生产日期批次明细','grain':'warehouse + SKU + snapshot source row',
 'notes':'仅使用已发布库存字段；保留源行，不把生产日期伪造为批次号。库存与可用量单位件；无效生产日期在页面保持未知。',
 'parameterSpec':{
 'gea_p1':{'name':'warehouse_code','type':'string','required':True,'nullable':False},
 'gea_p2':{'name':'sku','type':'string','required':True,'nullable':False},
 'gea_p3':{'name':'stat_date','type':'string','required':True,'nullable':False},
 'gea_p4':{'name':'page_size','type':'integer','required':True,'nullable':False,'minimum':1,'maximum':50},
 'gea_p5':{'name':'offset','type':'integer','required':True,'nullable':False,'minimum':0}},
 'request':{'sql':"WITH batch_rows AS (SELECT TRIM(t.warehouseid) AS warehouse_code, TRIM(t.material_code) AS sku, CAST(t.prod_date AS TEXT) AS production_date, t.live_qty AS quantity, t.available_qty AS available_qty FROM agents_scm_inventory_sku_data_d AS t WHERE TRIM(t.warehouseid)=:gea_p1 AND TRIM(t.material_code)=:gea_p2 AND REPLACE(SUBSTRING(CAST(t.month_date AS TEXT),1,10),'-','')=:gea_p3 AND (TRIM(t.warehouse_classify)='20' OR TRIM(t.warehouseid)='N436')), batch_count AS (SELECT COUNT(*) AS total FROM batch_rows AS r), batch_page AS (SELECT r.warehouse_code AS warehouse_code, r.sku AS sku, r.production_date AS production_date, r.quantity AS quantity, r.available_qty AS available_qty, 1 AS page_row_present FROM batch_rows AS r ORDER BY r.production_date, r.quantity, r.available_qty LIMIT :gea_p4 OFFSET :gea_p5) SELECT p.warehouse_code AS warehouse_code, p.sku AS sku, p.production_date AS production_date, p.quantity AS quantity, p.available_qty AS available_qty, p.page_row_present AS page_row_present, c.total AS page_scope_total FROM batch_count AS c LEFT JOIN batch_page AS p ON TRUE ORDER BY p.production_date, p.quantity, p.available_qty",
 'parameters':{'gea_p1':'A020','gea_p2':'10000034','gea_p3':'20261029','gea_p4':10,'gea_p5':0},'includeTotal':False},
 'resultColumns':['warehouse_code','sku','production_date','quantity','available_qty','page_row_present','page_scope_total']}

c['queries']['branch-transfers.page']={
 'title':'分仓SKU调拨订单明细','grain':'published snapshot + warehouse + SKU + transfer order',
 'notes':'沿原DSH已声明的发布批次和调拨明细资源，受当前branch-inventory委托约束；不能读取时保持独立错误，不把汇总数量摊到订单。',
 'parameterSpec':{
 'gea_p1':{'name':'warehouse_code','type':'string','required':True,'nullable':False},
 'gea_p2':{'name':'sku','type':'string','required':True,'nullable':False},
 'gea_p4':{'name':'page_size','type':'integer','required':True,'nullable':False,'minimum':1,'maximum':50},
 'gea_p5':{'name':'offset','type':'integer','required':True,'nullable':False,'minimum':0}},
 'request':{'sql':"WITH latest AS (SELECT MAX(p.snapshot_time) AS snapshot_time FROM agent_branch_detail_publication AS p), transfers AS (SELECT t.executeorderno AS order_no, t.order_status AS order_status, CASE WHEN COUNT(t.demand_qty)=COUNT(*) THEN SUM(t.demand_qty) ELSE NULL END AS demand_qty, CASE WHEN COUNT(t.allocated_qty)=COUNT(*) THEN SUM(t.allocated_qty) ELSE NULL END AS allocated_qty, CASE WHEN COUNT(t.shipped_qty)=COUNT(*) THEN SUM(t.shipped_qty) ELSE NULL END AS shipped_qty, CASE WHEN COUNT(t.pending_qty)=COUNT(*) THEN SUM(t.pending_qty) ELSE NULL END AS pending_qty, CASE WHEN COUNT(t.in_transit_qty)=COUNT(*) THEN SUM(t.in_transit_qty) ELSE NULL END AS in_transit_qty, CAST(t.snapshot_time AS TEXT) AS source_snapshot FROM agents_scm_branch_transfer_detail AS t INNER JOIN latest AS p ON t.snapshot_time=p.snapshot_time WHERE t.pickup_point=:gea_p1 AND t.material_code=:gea_p2 AND (t.pending_qty>0 OR t.in_transit_qty>0 OR t.pending_qty IS NULL OR t.in_transit_qty IS NULL) GROUP BY t.executeorderno, t.order_status, t.snapshot_time), totals AS (SELECT COUNT(*) AS total, CASE WHEN COUNT(t.pending_qty)=COUNT(*) AND COUNT(t.in_transit_qty)=COUNT(*) THEN SUM(t.pending_qty)+SUM(t.in_transit_qty) ELSE NULL END AS detail_qty FROM transfers AS t), page_rows AS (SELECT t.order_no AS order_no, t.order_status AS order_status, t.demand_qty AS demand_qty, t.allocated_qty AS allocated_qty, t.shipped_qty AS shipped_qty, t.pending_qty AS pending_qty, t.in_transit_qty AS in_transit_qty, t.source_snapshot AS source_snapshot, 1 AS page_row_present FROM transfers AS t ORDER BY t.order_no, t.order_status LIMIT :gea_p4 OFFSET :gea_p5) SELECT p.order_no AS order_no, p.order_status AS order_status, p.demand_qty AS demand_qty, p.allocated_qty AS allocated_qty, p.shipped_qty AS shipped_qty, p.pending_qty AS pending_qty, p.in_transit_qty AS in_transit_qty, p.source_snapshot AS source_snapshot, p.page_row_present AS page_row_present, n.total AS page_scope_total, n.detail_qty AS detail_qty FROM totals AS n LEFT JOIN page_rows AS p ON TRUE ORDER BY p.order_no, p.order_status",
 'parameters':{'gea_p1':'A020','gea_p2':'10000034','gea_p4':10,'gea_p5':0},'includeTotal':False},
 'resultColumns':['order_no','order_status','demand_qty','allocated_qty','shipped_qty','pending_qty','in_transit_qty','source_snapshot','page_row_present','page_scope_total','detail_qty']}

# FC uses the original non-overlapping [0,30), [30,60), [60,90), [90,+) buckets.
for query in c['queries'].values():
    sql=query['request']['sql']
    for old,new in [
      ('a.age_days BETWEEN 0 AND 30 THEN a.live_qty ELSE 0 END) AS age0_30','a.age_days >= 0 AND a.age_days < 30 THEN a.live_qty ELSE 0 END) AS age0_30'),
      ('a.age_days > 30 AND a.age_days <= 60 THEN a.live_qty ELSE 0 END) AS age31_60','a.age_days >= 30 AND a.age_days < 60 THEN a.live_qty ELSE 0 END) AS age31_60'),
      ('a.age_days > 60 AND a.age_days <= 90 THEN a.live_qty ELSE 0 END) AS age61_90','a.age_days >= 60 AND a.age_days < 90 THEN a.live_qty ELSE 0 END) AS age61_90'),
      ('a.age_days > 90 THEN a.live_qty ELSE 0 END) AS age90_plus','a.age_days >= 90 THEN a.live_qty ELSE 0 END) AS age90_plus')]:sql=sql.replace(old,new)
    query['request']['sql']=sql

path.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
