"""Current turnover must not require a target; target turnover keeps its own matched cohort."""
import json,sqlite3,unittest
from pathlib import Path
import sqlglot
from sqlglot import exp
ROOT=Path(__file__).resolve().parents[1]

class BaseTurnoverIndependence(unittest.TestCase):
 def test_current_turnover_keeps_valid_stock_and_demand_when_target_missing(self):
  config=json.loads((ROOT/'business/inventory-aqkc/sql.config.json').read_text())
  for qid in ['page.dashboard-groups','page.structure-groups','snapshot.page.dashboard-groups','snapshot.page.structure-groups']:
   tree=sqlglot.parse_one(config['queries'][qid]['request']['sql'],read='postgres')
   select=next(s for s in tree.find_all(exp.Select) if {'turn_count','turn_inventory','turn_demand','turn_target'}.issubset(set(s.named_selects)))
   expressions=[x for x in select.expressions if x.alias in ['turn_count','turn_inventory','turn_demand','turn_target','target_turn_demand']]
   with sqlite3.connect(':memory:') as db:
    db.execute('CREATE TABLE fixture(inventory REAL,target REAL,daily_demand REAL)')
    db.executemany('INSERT INTO fixture VALUES(?,?,?)',[(100,None,20),(50,20,5),(-1,10,5),(50,20,None)])
    row=db.execute('SELECT '+', '.join(x.sql(dialect='sqlite') for x in expressions)+' FROM fixture AS g').fetchone();r=dict(zip([x.alias for x in expressions],row))
    with self.subTest(query=qid):
     self.assertEqual(r['turn_count'],2);self.assertEqual(r['turn_inventory']/r['turn_demand'],6)
     self.assertEqual(r['turn_target']/r['target_turn_demand'],4)

if __name__=='__main__':unittest.main()
