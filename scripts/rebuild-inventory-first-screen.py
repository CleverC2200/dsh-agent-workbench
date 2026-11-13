"""Rebuild governed first-screen bundles after member contracts change."""
from pathlib import Path
import argparse,json,re,copy,sqlglot
from sqlglot import exp
from sqlglot.optimizer.scope import traverse_scope,Scope
repo=Path(__file__).resolve().parents[1]
pages=[]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--agents',nargs='+',choices=['fc','qll','aqkc'],default=['fc','qll','aqkc'])
agents=parser.parse_args().agents
for agent in agents:
 cfg=json.loads((repo/f'business/inventory-{agent}/sql.config.json').read_text())
 calls=[]
 for member in cfg['dailySummary']['bundle']['members']:
  key=member['queryId']
  if key=='snapshot.branch-supply.summary':continue
  query=cfg['queries'][key]
  values={spec['name']:query['request']['parameters'][name] for name,spec in query['parameterSpec'].items()}
  values.update(member['values'])
  if key=='snapshot.overview.orders-by-pickup':values.update(pickup_type_mode='all',pickup_type=None)
  calls.append({'queryId':key,'values':values})
 if agent=='fc' and not any(c['queryId']=='snapshot.orders.summary' for c in calls):
  q=cfg['queries']['snapshot.orders.summary'];values={s['name']:q['request']['parameters'][k] for k,s in q['parameterSpec'].items()}
  values.update(pickup_type_mode='equal',pickup_type='分仓',warehouse_code=None)
  calls.append({'queryId':'snapshot.orders.summary','values':values})
 pages.append({'agent':agent,'calls':calls})
def flatten_member(sql,index):
 tree=sqlglot.parse_one(sql,read='postgres')
 nodes=list(tree.find_all(exp.CTE));rename={id(c.this):'b'+str(index)+'_c'+str(k) for k,c in enumerate(nodes)}
 for scope in traverse_scope(tree):
  for table in scope.tables:
   source=scope.sources.get(table.alias_or_name)
   if isinstance(source,Scope) and id(source.expression) in rename:
    if not table.args.get('alias'):table.set('alias',exp.TableAlias(this=exp.to_identifier(table.name)))
    table.set('this',exp.to_identifier(rename[id(source.expression)]))
 for c in nodes:c.set('alias',exp.TableAlias(this=exp.to_identifier(rename[id(c.this)])))
 for node in list(tree.walk()):
  if node.args.get('with_') is not None:node.set('with_',None)
 definitions={c.alias:c for c in nodes};ordered=[];done=set()
 def add(name):
  if name in done:return
  for t in definitions[name].this.find_all(exp.Table):
   if t.name in definitions and t.name!=name:add(t.name)
  done.add(name);ordered.append(definitions[name].sql())
 for name in definitions:add(name)
 return ordered,tree.sql()
def template(name,value,query,agent):
 refs={'summary_batch_id':'batchId','stock_date':'stockDate','stat_date':'stockDate','as_of':'businessDate','start':'businessMonth','end_exclusive':'nextDay','order_start':'businessMonth','order_end_exclusive':'nextDay','shipment_start':'shipmentStart','shipment_month_start':'businessMonth','rolling_start':'rollingStart','shipment_end_exclusive':'nextDay','next_month':'nextMonth','days_in_month':'daysInMonth','days_remaining_in_month':'daysRemaining','next_days_in_month':'nextDaysInMonth','batch_rolling_start':'stockRollingStart','batch_end_exclusive':'stockNextDay','business_plan_months':'businessPlanMonths','stock_month':'stockMonth'}
 if name=='month':refs[name]='targetMonth' if 'inventory_version' in {x['name'] for x in query['parameterSpec'].values()} else 'businessMonth'
 if name=='inventory_version' and agent=='aqkc':refs[name]='defaultInventoryVersion'
 if name in refs:
  spec=next(s for s in query['parameterSpec'].values() if s['name']==name)
  return {'snapshotValue':refs[name],**({'format':spec['format']} if spec.get('format') else {})}
 return value
for page in pages:
 agent=page['agent'];path=repo/f'business/inventory-{agent}/sql.config.json';cfg=json.loads(path.read_text())
 if agent=='aqkc' and 'default_inventory_version' not in cfg['queries']['summary.snapshot']['resultColumns']:
  q=cfg['queries']['summary.snapshot'];tree=sqlglot.parse_one(q['request']['sql'],read='postgres')
  tree.select('b.effective_version AS default_inventory_version',append=True,copy=False);q['request']['sql']=tree.sql();q['resultColumns'].append('default_inventory_version')
 members=[];ctes=[];params={};specs={};projections=[];sort_columns={};sort_terms=[]
 for call in page['calls']:
  qid=call['queryId']
  if qid=='summary.snapshot' or 'dealer' in qid:continue
  if not qid.startswith('snapshot'):qid=cfg['queries'][qid]['summaryRoute']['queryId']
  q=cfg['queries'][qid];i=len(members);prefix='r'+str(i)+'_';binding={};values={**call['values'],'summary_batch_id':None}
  sql=q['request']['sql']
  if qid=='snapshot-default.replenishment.detail.atomic':

   required={'warehouse_code_mode':'all','sku_mode':'all','category_mode':'all','search_pattern':None,'warehouse_search_pattern':None,'needed_only':False,'business_only':False}
   assert all(values.get(k)==v for k,v in required.items()),values
   member_tree=sqlglot.parse_one(sql,read='postgres')
   for cte in member_tree.find_all(exp.CTE):
    if cte.alias=='list_source' and agent != 'fc':
     cte.this.set('where',None);cte.this.set('joins',None);cte.this.set('with_',None)
   sql=member_tree.sql()
  for old,sp in q['parameterSpec'].items():
   new='gea_p'+str(100000+len(params));binding[new]=sp['name'];specs[new]={**sp,'name':'b'+str(i)+'_'+sp['name']};params[new]=q['request']['parameters'][old]
   sql=re.sub(':'+old+r'\b',':'+new,sql)
  ordered_tree=sqlglot.parse_one(sql,read='postgres')
  originals={x.alias_or_name:x.this if isinstance(x,exp.Alias) else x for x in ordered_tree.expressions}
  own_sort=[]
  for j,term in enumerate(ordered_tree.args.get('order',exp.Order(expressions=[])).expressions):
   column='bundle_sort_'+str(i)+'_'+str(j);expression=term.this.copy()
   expression=expression.transform(lambda leaf: originals[leaf.name].copy() if isinstance(leaf,exp.Column) and not leaf.table and leaf.name in originals else leaf)
   ordered_tree.select(expression.as_(column),append=True,copy=False);own_sort.append(column)
   sort_terms.append('u.'+column+(' DESC' if term.args.get('desc') else ' ASC')+(' NULLS FIRST' if term.args.get('nulls_first') else ' NULLS LAST'))
  sort_columns[i]=own_sort
  cols=q['resultColumns'];flat,sql=flatten_member(ordered_tree.sql(),i);ctes.extend(flat);ctes.append('q'+str(i)+' AS ('+sql+')');ctes.append('n'+str(i)+' AS (SELECT COUNT(*) AS n FROM q'+str(i)+')')
  colsout={c:prefix+c for c in cols};projections+=list(colsout.values());members.append({'queryId':qid,'columns':colsout,'values':{s['name']:template(s['name'],values.get(s['name'],q['request']['parameters'][k]),q,agent) for k,s in q['parameterSpec'].items()},'bindings':binding,'part':str(i)})
 hidden=[c for columns in sort_columns.values() for c in columns]
 parts=[]
 scalar_ids={'snapshot.orders.summary','snapshot.source.health-date','snapshot.source.branch-stock-date','snapshot.branch-supply.summary','snapshot.base_shipments.summary','snapshot.health.cards','snapshot.branch-health.cards','snapshot.branch-turnover.cards','snapshot-default.replenishment.overview'}
 scalar=[(i,m) for i,m in enumerate(members) if m['queryId'] in scalar_ids]
 if scalar:
  owned={v:'s'+str(i)+'.'+k for i,m in scalar for k,v in m['columns'].items()}
  projection=[owned.get(c,'NULL')+' AS '+c for c in projections]+['NULL AS '+c for c in hidden]
  parts.append("SELECT 'scalar' AS bundle_part,1 AS bundle_total,1 AS bundle_present,"+', '.join(projection)+' FROM '+' CROSS JOIN '.join('q'+str(i)+' AS s'+str(i) for i,m in scalar))
  for i,m in scalar:m['part']='scalar'
 for i,m in enumerate(members):
  if m['part']=='scalar':continue
  own={v:k for k,v in m['columns'].items()};colsql=[('p.'+own[c] if c in own else 'NULL')+' AS '+c for c in projections]+[('p.'+c if c in sort_columns[i] else 'NULL')+' AS '+c for c in hidden]
  parts.append("SELECT '"+str(i)+"' AS bundle_part,n.n AS bundle_total,p.bundle_present AS bundle_present,"+', '.join(colsql)+' FROM n'+str(i)+' AS n LEFT JOIN (SELECT '+', '.join(c+' AS '+c for c in list(m['columns'])+sort_columns[i])+', 1 AS bundle_present FROM q'+str(i)+') AS p ON TRUE')
 nonscalar=[i for i,m in enumerate(members) if m['part']!='scalar']
 cardinality=('1' if scalar else '0')+''.join(' + CASE WHEN n'+str(i)+'.n=0 THEN 1 ELSE n'+str(i)+'.n END' for i in nonscalar)
 ctes.append('bundle_cardinality AS (SELECT '+cardinality+' AS total'+(' FROM '+' CROSS JOIN '.join('n'+str(i) for i in nonscalar) if nonscalar else '')+')')
 params['gea_p199999']=0;specs['gea_p199999']={'name':'bundle_offset','type':'integer','minimum':0,'maximum':100000}
 sql='WITH '+', '.join(ctes)+' SELECT '+', '.join(('CAST(u.'+c+' AS VARCHAR(32))' if c.endswith(('source_updated_at','source_date')) else 'u.'+c)+' AS '+c for c in ['bundle_part','bundle_total','bundle_present']+projections)+', t.total AS bundle_scope_total FROM ('+' UNION ALL '.join(parts)+') AS u CROSS JOIN bundle_cardinality AS t ORDER BY '+', '.join(['u.bundle_part NULLS LAST']+sort_terms+['u.'+c+' NULLS LAST' for c in projections])+' LIMIT 200 OFFSET :gea_p199999'
 qid='summary.first-screen';cfg['queries'][qid]={'title':'每日汇总首屏合并读取','request':{'sql':sql,'parameters':params,'includeTotal':False},'parameterSpec':specs,'resultColumns':['bundle_part','bundle_total','bundle_present']+projections+['bundle_scope_total'],'priority':90}
 cfg['dailySummary']['bundle']={'queryId':qid,'members':members,'maxRows':200,'maxTotalRows':100000}
 path.write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n');print(agent,'members',len(members),'columns',len(projections)+3,'params',len(params),'bytes',len(sql))
