import json
import sqlite3
import unittest
from pathlib import Path
import sqlglot
from sqlglot import exp

CONFIG = json.loads((Path(__file__).resolve().parents[1] / 'business/inventory-fc/sql.config.json').read_text())

class ValidRecordAggregation(unittest.TestCase):
    def test_actual_queries_keep_valid_zero_and_match_ratio_population(self):
        tested = set()
        for name, query in CONFIG['queries'].items():
            tree = sqlglot.parse_one(query['request']['sql'])
            for select in tree.find_all(exp.Select):
                fields = {item.alias: item for item in select.expressions if isinstance(item, exp.Alias)}
                if not all(k in fields for k in ['forecast_turnover_days', 'recommended_qty', 'missing_calculation_count']):
                    continue
                if not fields['forecast_turnover_days'].find(exp.Sum):
                    continue
                tested.add(name)
                sql = 'SELECT ' + ', '.join(fields[k].sql() for k in ['forecast_turnover_days', 'recommended_qty', 'missing_calculation_count']) + ' FROM inputs AS r'
                with sqlite3.connect(':memory:') as db:
                    db.execute('CREATE TABLE inputs (inventory_qty REAL, daily_plan REAL, recommended_qty REAL)')
                    db.executemany('INSERT INTO inputs VALUES (?,?,?)', [(100,10,5),(20,0,0),(900,None,None),(None,500,-3),(-20,4,None)])
                    self.assertEqual(db.execute(sql).fetchone(), (12,5,3), name)
                    db.execute('DELETE FROM inputs')
                    db.execute('INSERT INTO inputs VALUES (20,0,0)')
                    self.assertEqual(db.execute(sql).fetchone(), (None,0,0), name)
                    db.execute('DELETE FROM inputs')
                    db.execute('INSERT INTO inputs VALUES (NULL,NULL,NULL)')
                    self.assertEqual(db.execute(sql).fetchone(), (None,None,1), name)
        self.assertTrue({'replenishment.overview','snapshot-default.replenishment.overview','summary.first-screen','summary.bootstrap'} <= tested)

if __name__ == '__main__':
    unittest.main()
