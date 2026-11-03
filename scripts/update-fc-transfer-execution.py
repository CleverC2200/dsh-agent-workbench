"""Use one current transfer source across replenishment and plan reads; no UI entry is added."""
from pathlib import Path
import json
import sqlglot
from sqlglot import exp

ROOT=Path(__file__).resolve().parents[1]
canonical=sqlglot.parse_one((ROOT/'business/inventory-fc/transfer-current-source.sql').read_text(),read='postgres')
ctes=canonical.args['with_'].expressions
changed={}
for agent in ['fc','qll']:
 path=ROOT/f'business/inventory-{agent}/sql.config.json'
 config=json.loads(path.read_text());ids=[]
 for qid,q in config['queries'].items():
  if qid.startswith(('snapshot.','summary.')) or 's.transfer_onway_qty' not in q['request']['sql']:continue
  tree=sqlglot.parse_one(q['request']['sql'],read='postgres')
  rows=[c for c in tree.find_all(exp.CTE) if c.alias in ['combined','business_rows'] and 's.transfer_onway_qty' in c.this.sql()]
  if not rows:continue
  if 'gea_p2200' not in q['parameterSpec']:
   q['parameterSpec']['gea_p2200']={'name':'stat_date','type':'string','format':'YYYY-MM-DD','required':True,'nullable':False,'example':'2026-10-15'}
   q['request']['parameters']['gea_p2200']='2026-10-15'
  assert q['parameterSpec']['gea_p2200']['name']=='stat_date',qid
  outer=tree.args.get('with_')
  assert outer is not None,qid
  assert not any(c.alias=='transfer_current_skus' for c in outer.expressions),qid
  outer.set('expressions',[x.copy() for x in ctes]+outer.expressions)
  def present():return 'CASE WHEN tp.source_rows>0 THEN 1 ELSE 0 END'
  for c in rows:
   select=c.this
   key_alias='k' if c.alias=='combined' else 's'
   key_sku='material_code'
   select.join('transfer_current_skus AS tf',on=f'tf.warehouse_code={key_alias}.warehouse_code AND tf.sku={key_alias}.{key_sku}',join_type='LEFT',copy=False)
   select.join('transfer_source_presence AS tp',join_type='CROSS',copy=False)
   def metric(name):
    value='COALESCE(tf.preparing,0)+COALESCE(tf.in_transit,0)' if name=='open_transfer_reported_qty' else 'COALESCE(tf.'+name+',0)'
    return f'CASE WHEN tp.source_rows>0 THEN {value} ELSE NULL END'
   for column in list(select.expressions):
    if column.alias in ['preparing','in_transit','open_transfer_reported_qty']:
     column.set('this',sqlglot.parse_one(metric(column.alias),read='postgres'))
    elif column.alias in ['preparing_present','in_transit_present']:
     column.set('this',sqlglot.parse_one(present(),read='postgres'))
    elif column.alias in ['warehouse_name','material_name']:
     column.set('this',sqlglot.parse_one('COALESCE('+column.this.sql()+', tf.'+column.alias+')',read='postgres'))
  # Keep transfer-only SKUs in the same replenishment warehouse scope.
  for c in list(tree.find_all(exp.CTE)):
   if c.alias=='source_keys' and 'source_records' in c.this.sql():
    addition=sqlglot.parse_one('SELECT t.warehouse_code AS warehouse_code,t.sku AS material_code FROM transfer_current_skus AS t',read='postgres')
    c.set('this',exp.Union(this=c.this,expression=addition,distinct=False))
  # These monthly accumulated transfer fields no longer contribute to current facts.
  for c in tree.find_all(exp.CTE):
   if c.alias=='source_records':
    c.this.set('expressions',[x for x in c.this.expressions if x.alias not in ['warehouse_transfer_qty','transfer_onway_qty','transfer_prepare_qty']])
  q['request']['sql']=tree.sql()
  q['notes']=q.get('notes','')+' 当前调拨取日/小时执行单最新有效状态，按分仓收货仓聚合；已派未到按已备数量计未收到量，终态和冲突行不参与。月计划累计调拨字段不再作为当前备单/在途。'
  ids.append(qid)
 path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n');changed[agent]=ids
print(json.dumps(changed,ensure_ascii=False))

# A current transfer without a monthly plan still belongs in the existing plan/status list.
for agent in ['fc','qll']:
 path=ROOT/f'business/inventory-{agent}/sql.config.json';config=json.loads(path.read_text());ids=[]
 for qid,q in config['queries'].items():
  if qid.startswith(('snapshot.','summary.')) or 'transfer_current_skus' not in q['request']['sql']:continue
  tree=sqlglot.parse_one(q['request']['sql'],read='postgres');dirty=False
  for c in list(tree.find_all(exp.CTE)):
   if c.alias!='business_rows' or not isinstance(c.this,exp.Select):continue
   select=c.this;source=select.args.get('from_')
   if source is None or not isinstance(source.this,exp.Table) or source.this.name!='source_records':continue
   keys=sqlglot.parse_one('SELECT s.warehouse_code AS warehouse_code,s.material_code AS material_code FROM source_records AS s UNION ALL SELECT t.warehouse_code AS warehouse_code,t.sku AS material_code FROM transfer_current_skus AS t LEFT JOIN source_records AS s ON s.warehouse_code=t.warehouse_code AND s.material_code=t.sku WHERE s.material_code IS NULL',read='postgres')
   scope=c.parent;assert isinstance(scope,exp.With)
   definitions=list(scope.expressions);definitions.insert(definitions.index(c),exp.CTE(this=keys,alias=exp.TableAlias(this=exp.to_identifier('plan_current_keys'))));scope.set('expressions',definitions)
   select.set('from_',exp.From(this=exp.Table(this=exp.to_identifier('plan_current_keys'),alias=exp.TableAlias(this=exp.to_identifier('k')))))
   plan_join=sqlglot.parse_one('SELECT s.material_code AS material_code FROM plan_current_keys AS k LEFT JOIN source_records AS s ON s.warehouse_code=k.warehouse_code AND s.material_code=k.material_code',read='postgres').args['joins'][0]
   joins=select.args.get('joins',[])
   for join in joins:
    if join.this.alias_or_name=='tf':join.set('on',sqlglot.parse_one('tf.warehouse_code=k.warehouse_code AND tf.sku=k.material_code',read='postgres'))
   select.set('joins',[plan_join,*joins])
   for x in select.expressions:
    if x.alias=='warehouse_code':x.set('this',exp.column('warehouse_code','k'))
    elif x.alias=='sku':x.set('this',exp.column('material_code','k'))
    elif x.alias=='source_rows':x.set('this',sqlglot.parse_one('COALESCE(s.source_rows,0)',read='postgres'))
   dirty=True
  if dirty:q['request']['sql']=tree.sql();ids.append(qid)
 path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n');print(agent,'plan/status transfer-only keys',ids)
