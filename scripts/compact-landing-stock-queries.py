"""Remove unused intermediate projections from the full landing summary, keeping all final statistics."""
from pathlib import Path
import json,re,sqlglot
from sqlglot import exp
from sqlglot.optimizer.pushdown_projections import pushdown_projections
from sqlglot.optimizer.eliminate_ctes import eliminate_ctes
ROOT=Path(__file__).resolve().parents[1]
for agent,id in [('aqkc','page.dashboard-groups'),('apsplan','overview.stock')]:
 p=ROOT/f'business/inventory-{agent}/sql.config.json';c=json.loads(p.read_text());q=c['queries'][id]
 tree=eliminate_ctes(pushdown_projections(sqlglot.parse_one(q['request']['sql'],read='postgres')))
 assert tree.named_selects==q['resultColumns']
 for select in tree.find_all(exp.Select):
  for i,e in enumerate(list(select.expressions)):
   if not isinstance(e,exp.Alias):select.expressions[i]=exp.alias_(e.copy(),e.alias_or_name or 'constant_'+str(i),quoted=False)
 for sub in list(tree.find_all(exp.Substring)):
  sub.replace(exp.Anonymous(this='SUBSTRING',expressions=[sub.this.copy(),sub.args['start'].copy(),sub.args['length'].copy()]))
 sql=re.sub(r'%\((gea_p\d+)\)s',r':\1',tree.sql(dialect='postgres'));names=set(re.findall(r':(gea_p\d+)',sql))
 q['request']['sql']=sql;q['parameterSpec']={k:v for k,v in q['parameterSpec'].items() if k in names};q['request']['parameters']={k:v for k,v in q['request']['parameters'].items() if k in names};assert set(q['parameterSpec'])==names
 p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
