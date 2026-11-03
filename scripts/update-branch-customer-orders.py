"""Separate downstream customer metrics from upstream replenishment; retain three summary tables."""
from pathlib import Path
import copy,json,re
import sqlglot
from sqlglot import exp
from sqlglot.optimizer.eliminate_ctes import eliminate_ctes
ROOT=Path(__file__).resolve().parents[1]
WITH='with_' if 'with_' in exp.Select.arg_types else 'with'
def parse(s):return sqlglot.parse_one(s,read='postgres')
def render(t):
 t=t.copy()
 for s in list(t.find_all(exp.Substring)):
  s.replace(exp.Anonymous(this='SUBSTRING',expressions=[s.this.copy(),s.args['start'].copy(),s.args['length'].copy()]))
 return re.sub(r'%\((gea_p\d+)\)s',r':\1',t.sql(dialect='postgres')).replace(' AS DOUBLE PRECISION)', ' AS DOUBLE)')
def select_cte(tree,name):
 c=next(c for c in tree.find_all(exp.CTE) if c.alias==name)
 result=parse('SELECT '+', '.join('r.'+n+' AS '+n for n in c.this.named_selects)+' FROM '+name+' AS r')
 result.set(WITH,tree.args[WITH].copy())
 return eliminate_ctes(result)
def replace_cte(tree,name,replacement):
 found=False
 for c in list(tree.find_all(exp.CTE)):
  if c.alias==name:c.set('this',replacement.copy());found=True
 assert found,name
 return eliminate_ctes(tree)
def persist_query(q,tree):
 sql=render(tree);used=set(re.findall(r':(gea_p\d+)',sql));missing=set(q['parameterSpec'])-used
 if missing:
  cols=[("CASE WHEN '' IN (:"+k+") THEN 1 ELSE 0 END" if q['parameterSpec'][k]['type']=='array' else ':'+k)+' AS bind_'+k for k in sorted(missing)]
  wit=tree.args.get(WITH)
  if wit is None:wit=exp.With(expressions=[]);tree.set(WITH,wit)
  wit.expressions.append(exp.CTE(this=parse('SELECT '+', '.join(cols)),alias=exp.TableAlias(this=exp.to_identifier('customer_parameter_contract'))))
 q['request']['sql']=render(tree)
CURRENT_MAP={'base':'belong_base','warehouse_code':'warehouseid','demand':'shortage_demand','allocated':'current_allocated','remaining':'current_remaining','available':'current_pool_allocated_qty','shortage':'current_shortage','invalid':'current_invalid'}
LINES_MAP={'base':'belong_base','warehouse_code':'warehouseid','warehouse_name':'location_name','requested_at':'order_date',**{k:'current_'+k for k in ['ordered','demand','allocated','shipped','remaining','shortage']}}
PERIOD_MAP={'base':'belong_base','warehouse_code':'warehouseid',**{k:'period_'+k for k in ['is_ontime','ordered','demand','shortage','shipped','shipped_order_quantity','source_rows','invalid','source_occupied']}}
def snapshot(variant,columns,mapping):
 return parse('SELECT '+', '.join('m.'+mapping.get(n,n)+' AS '+n for n in columns)+" FROM agents_inv_order_summary_day AS m WHERE m.inv_batch_id=:gea_p90001 AND m.inv_variant_id='"+variant+"'")
def snapshot_query(config,key,source_name,variant,mapping,kind='current',window=None):
 q=copy.deepcopy(config['queries'][key]);q.pop('summaryRoute',None)
 q['parameterSpec']['gea_p90001']={'name':'summary_batch_id','type':'string','nullable':False,'required':True}
 q['request']['parameters']['gea_p90001']='UNPUBLISHED_BATCH'
 tree=parse(q['request']['sql'])
 for node in list(tree.find_all(exp.CTE)):
  if node.alias==source_name:node.set('this',snapshot(variant,node.this.named_selects,mapping))
 persist_query(q,eliminate_ctes(tree))
 if q.get('pagination'):
  for k in ['countQuery','atomicQuery']:
   if k in q['pagination']:q['pagination'][k]='snapshot.'+q['pagination'][k]
 config['queries']['snapshot.'+key]=q
 route={'queryId':'snapshot.'+key,'kind':kind}
 if window:
  route['materializedWindow']=window
  route['materializedInputs']={s['name']:q['request']['parameters'][k] for k,s in q['parameterSpec'].items() if s['name'] in ['date_basis','exp_flag','positive_orders_only']}
 config['queries'][key]['summaryRoute']=route

def main():
 paths={a:ROOT/f'business/inventory-{a}/sql.config.json' for a in ['fc','qll']}
 configs={a:json.loads(p.read_text()) for a,p in paths.items()}
 fc,qll=configs['fc'],configs['qll']
 source=parse((ROOT/'business/inventory-fc/customer-orders-source.sql').read_text())
 current=select_cte(source,'customer_current');lines=select_cte(source,'customer_current_lines')
 for key,q in list(fc['queries'].items()):
  if not key.startswith('current-shortage.'):continue
  if key=='current-shortage.overview':continue
  t=replace_cte(parse(q['request']['sql']),'current_source',current)
  q['notes']='分仓向经销商供货的当前未完成订单；有效执行行按件计量，异常行不参与正常行汇总；分仓SKU库存只扣一次。ASN不参与此指标。'
  persist_query(q,t)
  snapshot_query(fc,key,'current_source','BRANCH_CUSTOMER_CURRENT',CURRENT_MAP)
 # The card summary and SKU-location count share exactly the same current customer source.
 q=copy.deepcopy(fc['queries']['current-shortage.summary']);q.pop('summaryRoute',None)
 t=parse(q['request']['sql']);filtered=next(c for c in t.find_all(exp.CTE) if c.alias=='filtered')
 count=parse('SELECT COUNT(*) AS n FROM filtered AS f WHERE f.shortage>0 AND f.sku IS NOT NULL')
 t.args[WITH].expressions.append(exp.CTE(this=count,alias=exp.TableAlias(this=exp.to_identifier('customer_shortage_count'))))
 t.join('customer_shortage_count AS cs',join_type='CROSS',copy=False)
 t.select('MAX(cs.n) AS replenishment_shortage_sku_count',append=True,copy=False)
 q['resultColumns'].append('replenishment_shortage_sku_count');persist_query(q,t)
 fc['queries']['current-shortage.overview']=q;snapshot_query(fc,'current-shortage.overview','current_source','BRANCH_CUSTOMER_CURRENT',CURRENT_MAP)
 for key in ['branch-current-orders.page','branch-current-orders.lines']:
  q=fc['queries'][key];t=replace_cte(parse(q['request']['sql']),'open_lines',lines)
  # Warehouse filtering previously lived inside the removed ASN source.
  c=next(c for c in t.find_all(exp.CTE) if c.alias=='open_lines')
  c.this.where(':gea_p1 IS NULL OR r.warehouse_code=:gea_p1',copy=False)
  q['notes']='分仓下游经销商订单；按有效执行行归属实际发货仓。缺口按仓库SKU共享库存分配一次，不使用ASN。'
  persist_query(q,t);snapshot_query(fc,key,'open_lines','BRANCH_CUSTOMER_LINES',LINES_MAP)
  # Keep warehouse selection outside the cached source, including per-order detail calls.
  sq=fc['queries']['snapshot.'+key];st=parse(sq['request']['sql']);c=next(c for c in st.find_all(exp.CTE) if c.alias=='open_lines')
  c.this.where(':gea_p1 IS NULL OR m.warehouseid=:gea_p1',copy=False);persist_query(sq,st)
 # Full-chain retains the untouched base customer cohort and swaps only branch source.
 for key,q in list(qll['queries'].items()):
  if not key.startswith('current-shortage.'):continue
  t=replace_cte(parse(q['request']['sql']),'branch_current_source',current)
  q['notes']='基地保持原有效客户订单口径；分仓为下游经销商订单。分仓SKU共享库存只扣一次；ASN只用于补货调拨。'
  persist_query(q,t)
  sq=qll['queries']['snapshot.'+key];st=replace_cte(parse(sq['request']['sql']),'branch_current_source',snapshot('BRANCH_CUSTOMER_CURRENT',current.named_selects,CURRENT_MAP));persist_query(sq,st)
 # Replenishment consumes downstream customer demand, while upstream transfer quantities stay separate.
 repl_names={'location_type':'location_type','warehouseid':'warehouse_code','material_code':'sku','demand_qty':'demand','allocated_qty':'allocated','remaining_qty':'remaining','shortage_qty':'shortage','invalid_sku':'invalid'}
 for cfg in configs.values():
  for key,q in list(cfg['queries'].items()):
   if key.startswith('summary.') or key.startswith('upstream-'):continue
   t=parse(q['request']['sql']);changed=False;cached=key.startswith('snapshot')
   for node in list(t.find_all(exp.CTE)):
    if node.alias=='fc_current_orders':
     body=snapshot('BRANCH_CUSTOMER_CURRENT',current.named_selects,CURRENT_MAP) if cached else current.copy()
     replacement=parse('SELECT '+', '.join('c.'+repl_names[n]+' AS '+n for n in node.this.named_selects)+' FROM ('+render(body)+') AS c')
     node.set('this',replacement);changed=True
    elif node.alias=='fc_order_keys':
     body=snapshot('BRANCH_CUSTOMER_CURRENT',current.named_selects,CURRENT_MAP) if cached else current.copy()
     replacement=parse('SELECT c.warehouse_code AS warehouse_code,c.sku AS material_code FROM ('+render(body)+') AS c WHERE c.sku IS NOT NULL GROUP BY c.warehouse_code,c.sku')
     # Canonical key contracts use either sku or material_code.
     replacement.set('expressions',[parse('SELECT c.'+repl_names.get(n,n)+' AS '+n).expressions[0] for n in node.this.named_selects])
     replacement.group_by(*['c.'+repl_names.get(n,n) for n in node.this.named_selects],append=False,copy=False)
     node.set('this',replacement);changed=True
    elif node.alias=='fc_order_presence':
     if cached:
      replacement=parse("SELECT COUNT(m.shortage_demand) AS source_order_count FROM agents_inv_order_summary_day AS m WHERE m.inv_batch_id=:gea_p90001 AND m.inv_variant_id='BRANCH_CUSTOMER_CURRENT'")
     else:replacement=parse('SELECT COUNT(*) AS source_order_count FROM (SELECT 1 AS present FROM agents_scm_execute_detail_d AS e LIMIT 1) AS p')
     if node.this.named_selects==['_']:replacement.expressions[0].set('alias',exp.to_identifier('_'))
     node.set('this',replacement);changed=True
   for net in list(t.find_all(exp.CTE)):
    if net.alias!='fc_net_input':continue
    remaining=next((e for e in net.this.expressions if e.alias_or_name=='fc_remaining_orders'),None)
    if remaining is None:continue
    # Older upstream calculations intentionally used zero here; customer demand must reduce stock.
    if isinstance(remaining.this,exp.Case):remaining.this.set('default',parse('SELECT COALESCE(dc.remaining,0) AS v').expressions[0].this)
    if not any(table.alias_or_name=='dc' for table in net.this.find_all(exp.Table)) and not any(sub.alias=='dc' for sub in net.this.find_all(exp.Subquery)):
     body=snapshot('BRANCH_CUSTOMER_CURRENT',current.named_selects,CURRENT_MAP) if cached else current.copy()
     net.this.join(exp.Subquery(this=body,alias=exp.TableAlias(this=exp.to_identifier('dc'))),on='dc.warehouse_code=r.warehouse_code AND dc.sku=r.sku',join_type='LEFT',copy=False)
    scope=net.parent
    combined=next((c for c in scope.expressions if c.alias=='combined'),None)
    if combined is not None:
     source_alias='m' if cached else 'k'
     source_column='sku' if cached else 'material_code'
     if not cached and any(t.name=='scope_keys' and t.alias=='k' for t in combined.this.find_all(exp.Table)):
      combined.this.set('expressions',[e for e in combined.this.expressions if e.alias_or_name!='sku'])
     if 'sku' not in combined.this.named_selects:combined.this.select(source_alias+'.'+source_column+' AS sku',append=True,copy=False)
    changed=True
   # Doris DECIMAL(38,0) target arithmetic otherwise truncates fractional inventory.
   for value in t.find_all(exp.Alias):
    if value.alias!='known_inventory_deviation_qty':continue
    for difference in value.find_all(exp.Sub):
     if not isinstance(difference.this,exp.Cast):
      difference.set('this',exp.Cast(this=difference.this.copy(),to=exp.DataType.build('DOUBLE')));changed=True
   if changed:persist_query(q,eliminate_ctes(t))
 # Restore dealer execution facts for FC. Warehouse association is accepted only when unique.
 mapping=parse('''WITH customer_execute_warehouse AS (
 SELECT e.executeorderno AS execute_order,CASE WHEN COUNT(DISTINCT NULLIF(TRIM(e.warehouseid),''))=1 THEN MAX(e.warehouseid) END AS warehouse_code
 FROM agents_scm_execute_detail_d AS e GROUP BY e.executeorderno
), customer_pickup_warehouse AS (
 SELECT t.pickup_point AS pickup_code,CASE WHEN COUNT(DISTINCT e.warehouse_code)=1 THEN MAX(e.warehouse_code) END AS warehouse_code
 FROM agents_order_execute_isontime_mi AS t INNER JOIN customer_execute_warehouse AS e ON t.executeorderno=e.execute_order
 WHERE t.pick_point_type2='分仓' GROUP BY t.pickup_point
) SELECT m.pickup_code AS pickup_code,m.warehouse_code AS warehouse_code FROM customer_pickup_warehouse AS m''')
 for key,original in list(qll['queries'].items()):
  if not key.startswith('orders.'):continue
  q=copy.deepcopy(original);q.pop('summaryRoute',None);q['plugins']=['fc']
  t=parse(q['request']['sql'])
  for c in list(t.find_all(exp.CTE)):
   if c.alias=='business_rows':
    # Local WITH keeps atomic detail/count scopes independent.
    c.this.join(exp.Subquery(this=mapping.copy(),alias=exp.TableAlias(this=exp.to_identifier('cw'))),on='cw.pickup_code=d.pickup_code',join_type='LEFT',copy=False)
    c.this.select('cw.warehouse_code AS warehouse_code',append=True,copy=False)
    c.this.where("d.pickup_type='分仓'",copy=False)
   if c.alias=='filtered':c.this.where(':gea_p91 IS NULL OR r.warehouse_code=:gea_p91',copy=False)
  q['parameterSpec']['gea_p91']={'name':'warehouse_code','type':'string','nullable':True,'required':True};q['request']['parameters']['gea_p91']=None
  q['notes']='分仓下游客户订单执行事实；已发货订单池满足率沿用基地逐行限额口径。仓库归属仅接受执行事实中唯一的提货点映射。'
  persist_query(q,t);fc['queries'][key]=q
  snapshot_query(fc,key,'business_rows','BRANCH_CUSTOMER_PERIOD',PERIOD_MAP,window='month')
 # Shipments are capped per order line; an anomalous branch row does not erase valid rows.
 valid="r.invalid=0 AND r.ordered>=0 AND r.shipped>=0"
 capped="CASE WHEN r.shipped>r.ordered THEN r.ordered ELSE r.shipped END"
 base_valid="COUNT(r.shipped)=COUNT(*) AND COUNT(r.ordered)=COUNT(*) AND MIN(r.shipped)>=0 AND MIN(r.ordered)>=0 AND SUM(r.invalid)=0"
 for cfg,key,grouped in [(fc,'orders.summary',False),(qll,'overview.orders-by-pickup',True),(qll,'snapshot.overview.orders-by-pickup',True)]:
  q=cfg['queries'][key];t=parse(q['request']['sql'])
  numerator="SUM(CASE WHEN "+valid+" THEN "+capped+" END)"
  denominator="SUM(CASE WHEN "+valid+" THEN CASE WHEN r.shipped>0 THEN r.ordered ELSE 0 END END)"
  if grouped:
   numerator="CASE WHEN MAX(r.pickup_type)='分仓' THEN "+numerator+" WHEN "+base_valid+" THEN SUM("+capped+") END"
   denominator="CASE WHEN MAX(r.pickup_type)='分仓' THEN "+denominator+" WHEN "+base_valid+" THEN SUM(r.shipped_order_quantity) END"
  t.set('expressions',[x for x in t.expressions if x.alias_or_name not in ['fulfillment_rate','fulfillment_shipped_quantity','fulfillment_order_quantity']])
  for name,value in [('fulfillment_shipped_quantity',numerator),('fulfillment_order_quantity',denominator),('fulfillment_rate','('+numerator+')/NULLIF(('+denominator+'),0)')]:
   t.select(value+' AS '+name,append=True,copy=False)
   if name not in q['resultColumns']:q['resultColumns'].append(name)
  if not grouped:
   for e in t.expressions:
    if e.alias_or_name in ['from_order_count','affected_from_order_count']:
     e.transform(lambda n: parse("SELECT NULLIF(TRIM(r.from_order),'')").expressions[0] if isinstance(n,exp.Column) and n.name=='from_order' else n,copy=False)
   f=next(c for c in t.ctes if c.alias=='filtered')
   if 'sku' not in f.this.named_selects:f.this.select('r.sku AS sku',append=True,copy=False)
   for name,value in [('shortage_sku_count',"CASE WHEN COUNT(*)=0 THEN 0 WHEN SUM(r.invalid)=0 AND COUNT(*)=COUNT(r.shortage) AND MIN(r.shortage)>=0 AND SUM(CASE WHEN r.shortage>0 AND NULLIF(TRIM(r.sku),'') IS NULL THEN 1 ELSE 0 END)=0 THEN COUNT(DISTINCT CASE WHEN r.shortage>0 THEN NULLIF(TRIM(r.sku),'') END) END"),('missing_shortage_sku_identity',"COUNT(CASE WHEN r.shortage>0 AND NULLIF(TRIM(r.sku),'') IS NULL THEN 1 END)")]:
    if name not in t.named_selects:t.select(value+' AS '+name,append=True,copy=False)
    if name not in q['resultColumns']:q['resultColumns'].append(name)
  persist_query(q,t)
 snapshot_query(fc,'orders.summary','business_rows','BRANCH_CUSTOMER_PERIOD',PERIOD_MAP,window='month')
 # Export complete unfiltered materialization sources; ETL never reads its own summary.
 period=select_cte(parse(fc['queries']['orders.detail']['request']['sql']),'business_rows')
 exports={
  'BRANCH_CUSTOMER_CURRENT':(current,CURRENT_MAP,fc['queries']['current-shortage.summary']),
  'BRANCH_CUSTOMER_LINES':(lines,LINES_MAP,fc['queries']['branch-current-orders.page']),
  'BRANCH_CUSTOMER_PERIOD':(period,PERIOD_MAP,fc['queries']['orders.detail'])}
 export=[]
 for variant,(tree,mapping,q) in exports.items():
  export.append({'variant':variant,'table':'agents_inv_order_summary_day','sourceSql':render(tree),'sourceColumns':tree.named_selects,'targetMapping':{mapping.get(n,n):n for n in tree.named_selects},'parameterSpec':q['parameterSpec'],'parameters':q['request']['parameters']})
 (ROOT/'business/inventory-fc/customer-order-materializations.json').write_text(json.dumps(export,ensure_ascii=False,indent=2)+'\n')
 orders=next(v for v in qll['sourceViews']['views'] if v['id']=='orders')
 v=copy.deepcopy(orders);v['overrides']={'pickup_type_mode':'equal','pickup_type':'分仓'};v['filters'].append({'name':'warehouse_code','label':'分仓编码'});v['description']='分仓发往下游经销商的订单；满足率仅计算已发货订单池。'
 fc['sourceViews']['views']=[v if x['id']=='orders' else x for x in fc['sourceViews']['views']]
 fc['overviewViewIds']=[x for x in fc['overviewViewIds'] if x!='branch-supply']
 if 'orders' not in fc['overviewViewIds']:fc['overviewViewIds'].append('orders')
 v=copy.deepcopy(orders);v['id']='branch-overview';v['overrides']={'pickup_type_mode':'equal','pickup_type':'分仓'}
 qll['sourceViews']['views']=[v if x['id']=='branch-overview' else x for x in qll['sourceViews']['views']]
 qll['overviewOrderGroups']['views']['branch-overview']='分仓'
 for key in ['overview.orders-by-pickup','snapshot.overview.orders-by-pickup']:
  qll['queries'][key]['request']['parameters'].update(gea_p8='all',gea_p9=None)
 for a,c in configs.items():
  for view in c['sourceViews']['views']:
   if view['id']!='upstream-orders':
    for col in view.get('columns',[]):
     if col.get('label')=='当前待收货需求':col['label']='客户订单需求'
  c['queries']['summary.snapshot']['request']['sql']=c['queries']['summary.snapshot']['request']['sql'].replace('inventory-daily-v2-20261102','inventory-daily-v3-20261103')
  paths[a].write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
 print('Customer order contracts and three materialization variants generated')
if __name__=='__main__':main()
