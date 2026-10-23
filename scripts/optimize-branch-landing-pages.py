"""Avoid computing order shortages to count replenishment keys; enrich only visible SKUs."""
import json,re
from pathlib import Path
import sqlglot
from sqlglot import exp
from sqlglot.optimizer.pushdown_projections import pushdown_projections
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'business/inventory-fc/sql.config.json';c=json.loads(p.read_text())
for id,q in c['queries'].items():
 if not id.startswith('replenishment'):continue
 if id.endswith('.atomic'):q['priority']=20
 tree=sqlglot.parse_one(q['request']['sql'],read='postgres')
 if not tree.args.get('with_'):continue
 ctes={e.alias_or_name:e for e in tree.args['with_'].expressions}
 if 'source_keys' not in ctes:continue
 ctes['fc_order_keys']=exp.CTE(this=sqlglot.parse_one('SELECT o.location_type AS location_type,o.warehouseid AS warehouseid,o.material_code AS material_code FROM eligible_order_sku AS o GROUP BY o.location_type,o.warehouseid,o.material_code',read='postgres'),alias=exp.TableAlias(this=exp.to_identifier('fc_order_keys')))
 stock_keys=ctes['inventory_batch_dates'].this.copy()
 stock_keys.set('expressions',[exp.alias_(exp.column('warehouseid','b'),'warehouseid'),exp.alias_(exp.column('material_code','b'),'material_code')]);stock_keys.set('group',exp.Group(expressions=[exp.column('warehouseid','b'),exp.column('material_code','b')]))
 ctes['branch_stock_keys']=exp.CTE(this=stock_keys,alias=exp.TableAlias(this=exp.to_identifier('branch_stock_keys')))
 for table in ctes['source_keys'].this.find_all(exp.Table):
  if table.name in ['fc_current_orders','eligible_order_sku']:table.set('this',exp.to_identifier('fc_order_keys'))
  if table.name=='branch_stock':table.set('this',exp.to_identifier('branch_stock_keys'))
 if id.endswith('.atomic') and 'page_rows' in ctes:
  for name,alias in [('inventory_batch','inventory_rows'),('material_attributes','agents_scm_material_in_out_summary_d'),('fc_current_orders','d')]:
   predicate=f'{alias}.material_code IN (SELECT visible.sku AS sku FROM page_rows AS visible)'
   # Idempotent when rebuilding a locally prepared configuration.
   if not any(t.name=='page_rows' for t in ctes[name].this.find_all(exp.Table)):
    ctes[name].this.where(predicate,copy=False)
 tree.set('with_',None);ordered=[];needed=set();visiting=set()
 def retain(name):
  if name not in ctes or name in needed:return
  assert name not in visiting,('cycle',id,name)
  visiting.add(name)
  for table in ctes[name].this.find_all(exp.Table):retain(table.name)
  visiting.remove(name);needed.add(name);ordered.append(ctes[name])
 for table in tree.find_all(exp.Table):retain(table.name)
 tree.set('with_',exp.With(expressions=ordered))
 tree=pushdown_projections(tree)
 for select in tree.find_all(exp.Select):
  for i,e in enumerate(list(select.expressions)):
   if not isinstance(e,exp.Alias):select.expressions[i]=exp.alias_(e.copy(),'constant_'+str(i),quoted=False)
 for substring in list(tree.find_all(exp.Substring)):
  substring.replace(exp.Anonymous(this='SUBSTRING',expressions=[substring.this.copy(),substring.args['start'].copy(),substring.args['length'].copy()]))
 sql=re.sub(r'%\((gea_p\d+)\)s',r':\1',tree.sql(dialect='postgres'))
 names=set(re.findall(r':(gea_p\d+)',sql));q['parameterSpec']={k:v for k,v in q['parameterSpec'].items() if k in names};q['request']['parameters']={k:v for k,v in q['request']['parameters'].items() if k in names};assert set(q['parameterSpec'])==names
 q['request']['sql']=sql
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
