"""Bind invariant bundle inputs once to reduce gateway parsing cost."""
import json,re,copy
from pathlib import Path
import sqlglot
from sqlglot import exp
from sqlglot.optimizer.simplify import simplify
from sqlglot.optimizer.eliminate_ctes import eliminate_ctes
from sqlglot.optimizer.pushdown_projections import pushdown_projections
from sqlglot.optimizer.merge_subqueries import merge_subqueries
repo=Path(__file__).resolve().parents[1]
for agent in ['fc','qll']:
 cfg=json.loads((repo/f'business/inventory-{agent}/sql.config.json').read_text());bundle=cfg['dailySummary']['bundle'];q=cfg['queries'][bundle['queryId']];sql=q['request']['sql'];fixed={}
 for member in bundle['members']:
  for param,name in member['bindings'].items():
   value=member['values'][name]
   if not isinstance(value,dict) and not (agent=='fc' and name in {'warehouse_code','warehouse_code_mode'}):fixed[param]=value
 def literal(v):
  if isinstance(v,list):return ', '.join(literal(x) for x in v)
  return exp.convert(v).sql()
 sql=re.sub(r':(gea_p\d+)\b',lambda m:literal(fixed[m[1]]) if m[1] in fixed else m[0],sql)
 tree=sqlglot.parse_one(sql);tree=eliminate_ctes(simplify(tree));aliases={column:f'v{i}' for i,column in enumerate(q['resultColumns']) if column.startswith('r')}
 for node in tree.walk():
  if isinstance(node,exp.Column) and node.name in aliases:node.set('this',exp.to_identifier(aliases[node.name]))
  if isinstance(node,exp.Alias) and node.alias in aliases:node.set('alias',exp.to_identifier(aliases[node.alias]))
 q['resultColumns']=[aliases.get(c,c) for c in q['resultColumns']]
 for member in bundle['members']:member['columns']={k:aliases.get(v,v) for k,v in member['columns'].items()}
 sql=tree.sql();used=set(re.findall(r':(gea_p\d+)\b',sql))
 q['request']['sql']=sql;q['parameterSpec']={k:v for k,v in q['parameterSpec'].items() if k in used};q['request']['parameters']={k:v for k,v in q['request']['parameters'].items() if k in used}
 for member in bundle['members']:member['bindings']={k:v for k,v in member['bindings'].items() if k in used}
 (repo/f'business/inventory-{agent}/sql.config.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n');print(agent,len(sql),len(used))

import runpy
runpy.run_path(str(repo/"scripts/optimize-daily-bundles.py"))
