"""Scope stored cycle rules to their warehouse, using the existing published warehouse column."""
import json,re
from pathlib import Path
import sqlglot
from sqlglot import exp
p=Path(__file__).resolve().parents[1]/'business/inventory-fc/sql.config.json'
c=json.loads(p.read_text())
for q in c['queries'].values():
 if 'fc_net_input AS (' not in q['request']['sql'] or 'gea_p2802' in q['parameterSpec']:continue
 t=sqlglot.parse_one(q['request']['sql'],read='postgres')
 node=next(x for x in t.ctes if x.alias=='fc_net_input').this
 if not any(e.alias=='fc_cycle' for e in node.expressions):continue
 for e in node.expressions:
  if e.alias=='fc_cycle':
   old=e.this.sql(dialect='postgres')
   new=f"CASE WHEN :gea_p2802<>'' AND r.warehouse_code<>:gea_p2802 THEN {c['replenishmentPolicy']['defaultCycleDays']} ELSE {old} END AS fc_cycle"
   e.replace(sqlglot.parse_one('SELECT '+new,read='postgres').expressions[0])
 for node in list(t.find_all(exp.Substring)):
  args=[node.this.copy()]
  for name in ('start','length'):
   if node.args.get(name) is not None:args.append(node.args[name].copy())
  node.replace(exp.Anonymous(this='SUBSTRING',expressions=args))
 q['request']['sql']=re.sub(r'%\((gea_p\d+)\)s',r':\1',t.sql(dialect='postgres'))
 q['parameterSpec']['gea_p2802']={'name':'fc_cycle_warehouse','type':'string','nullable':False,'required':True}
 q['request']['parameters']['gea_p2802']=''
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
