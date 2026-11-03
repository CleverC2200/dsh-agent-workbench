"""Specialize initial-load SQL to its exact configured defaults, then read batch and rows together.

Member matching still checks every input before consuming these rows. Physical output columns
remain separate, so RETURN permission filtering retains its normal dependency checks.
"""
import json, re, copy
from pathlib import Path
import sqlglot
from sqlglot import exp
from sqlglot.optimizer.simplify import simplify
from sqlglot.optimizer.eliminate_ctes import eliminate_ctes
repo = Path(__file__).resolve().parents[1]
for agent in ['fc', 'qll', 'aqkc']:
 cfg=json.loads((repo/f'business/inventory-{agent}/sql.config.json').read_text());bundle=cfg['dailySummary']['bundle'];q=cfg['queries'][bundle['queryId']];sql=q['request']['sql'];fixed={}
 for member in bundle['members']:
  for param,name in member['bindings'].items():
   value=member['values'][name]
   if not isinstance(value,dict):fixed[param]=value
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
 bootstrap=copy.deepcopy(q)
 selected=sqlglot.parse_one(cfg['queries']['summary.snapshot']['request']['sql'])
 bootstrap_tree=sqlglot.parse_one(sql)
 source_columns={'summary_batch_id':'batch_id','stat_date':'stock_date','stock_date':'stock_date','month':'target_month','as_of':'business_date','inventory_version':'default_inventory_version'}
 for param,spec in q['parameterSpec'].items():
  if spec['name']=='bundle_offset':
   replacement='0'
  else:
   name=next(name for member in bundle['members'] for key,name in member['bindings'].items() if key==param)
   if name=='stock_month':
    replacement="(SELECT CONCAT(SUBSTRING(CAST(s.stock_date AS VARCHAR), 1, 7), '-01') AS stock_month FROM selected_daily_batch AS s)"
   elif name not in source_columns:raise ValueError('Uncovered bootstrap input: '+name)
   else:replacement='(SELECT s.'+source_columns[name]+' AS '+source_columns[name]+' FROM selected_daily_batch AS s)'
  sql=re.sub(':'+param+r'\b',replacement,sql)
 bootstrap_tree=sqlglot.parse_one(sql)
 bootstrap_tree.args.get('with_', bootstrap_tree.args.get('with')).set('expressions',[exp.CTE(this=selected,alias=exp.TableAlias(this=exp.to_identifier('selected_daily_batch'))),*bootstrap_tree.ctes])
 bootstrap_tree.join('selected_daily_batch AS selected_batch',join_type='CROSS',copy=False)
 for column in cfg['queries']['summary.snapshot']['resultColumns']:
  bootstrap_tree.select('selected_batch.'+column+' AS '+column,copy=False)
 bootstrap['request']={'sql':bootstrap_tree.sql(),'parameters':{},'includeTotal':False}
 bootstrap['parameterSpec']={}
 bootstrap['resultColumns']=q['resultColumns']+cfg['queries']['summary.snapshot']['resultColumns']
 bootstrap['title']='每日汇总批次与首屏一次读取'
 cfg['queries']['summary.bootstrap']=bootstrap
 bundle['bootstrapQueryId']='summary.bootstrap'
 (repo/f'business/inventory-{agent}/sql.config.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n');print(agent,len(sql),len(used))
