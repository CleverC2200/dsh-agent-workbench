"""Current inventory/demand coverage does not require a target to exist."""
from pathlib import Path
import json
import sqlglot
from sqlglot import exp
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'business/inventory-aqkc/sql.config.json';c=json.loads(p.read_text())
for qid in ['page.dashboard-groups','page.structure-groups','snapshot.page.dashboard-groups','snapshot.page.structure-groups']:
 q=c['queries'][qid];t=sqlglot.parse_one(q['request']['sql'],read='postgres')
 s=next(s for s in t.find_all(exp.Select) if {'turn_count','turn_inventory','turn_demand','turn_target'}.issubset(set(s.named_selects)))
 if 'target_turn_demand' in s.named_selects:continue
 original=next(x.this.copy() for x in s.expressions if x.alias=='turn_demand')
 for x in s.expressions:
  if x.alias in ['turn_count','turn_inventory','turn_demand']:
   old=x.this.sql();new=old.replace('g.inventory >= 0 AND g.target >= 0 AND g.daily_demand >= 0','g.inventory >= 0 AND g.daily_demand >= 0');assert old!=new,(qid,x.alias)
   x.set('this',sqlglot.parse_one(new,read='postgres'))
 s.select(exp.alias_(original,'target_turn_demand'),copy=False)
 s.select("SUM(CASE WHEN g.inventory>=0 AND g.target>=0 AND g.daily_demand>=0 THEN 1 ELSE 0 END) AS target_turn_count",copy=False)
 q['request']['sql']=t.sql();q['resultColumns']+=['target_turn_demand','target_turn_count']
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
