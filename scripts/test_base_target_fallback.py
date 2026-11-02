"""Execute the shipped target expressions; NULL fallback never replaces a real zero."""
import json
import sqlite3
import unittest
from pathlib import Path
import sqlglot

ROOT = Path(__file__).resolve().parents[1]
class TargetFallback(unittest.TestCase):
    def test_nullable_target_fallback_in_every_affected_query(self):
        checked = 0
        for agent in ['aqkc','fc','qll']:
            config = json.loads((ROOT/f'business/inventory-{agent}/sql.config.json').read_text())
            for key, query in config['queries'].items():
                tree = sqlglot.parse_one(query['request']['sql'],read='postgres')
                for alias in tree.find_all(sqlglot.exp.Alias):
                    if alias.alias != 'target' or not isinstance(alias.this,(sqlglot.exp.Coalesce,sqlglot.exp.Case)) or 't.avg_daily_planned_demand * 9' not in alias.this.sql():continue
                    checked += 1
                    with self.subTest(agent=agent,query=key), sqlite3.connect(':memory:') as db:
                        db.execute('CREATE TABLE t(sku TEXT,product_categ_name TEXT,product_tag TEXT,material_name TEXT,avg_daily_planned_demand REAL,turnover_inventory REAL,final_target_inventory REAL,target_rows INTEGER)')
                        expression=alias.this.sql(dialect='sqlite')
                        for target,daily,count,expected in [(None,10,1,90),(0,10,1,0),(45,10,1,45),(None,0,1,0),(None,None,1,None),(None,-1,1,None),(None,None,2,None)]:
                            db.execute('DELETE FROM t')
                            db.execute("INSERT INTO t VALUES ('S1','水饺','','产品',?,?,?,?)",(daily,None,target,count))
                            self.assertEqual(db.execute('SELECT '+expression+' FROM t').fetchone()[0],expected)
                        db.execute("UPDATE t SET final_target_inventory=0,product_categ_name='粽子',avg_daily_planned_demand=10,turnover_inventory=120")
                        self.assertEqual(db.execute('SELECT '+expression+' FROM t').fetchone()[0],0)
        self.assertGreater(checked,10)

if __name__=='__main__':unittest.main()
