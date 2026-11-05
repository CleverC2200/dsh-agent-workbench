import json
import sqlite3
import unittest
from pathlib import Path


class BaseShortageRankingTests(unittest.TestCase):
    def test_merges_bases_before_ranking_and_counts_only_positive_skus(self):
        config = json.loads((Path(__file__).resolve().parents[1] / 'business/inventory-aqkc/sql.config.json').read_text())
        sql = config['queries']['snapshot.current-shortage.sku-ranking']['request']['sql']
        # Exercise the shipped aggregation and page SQL against independent input rows.
        sql = 'WITH filtered AS (SELECT * FROM facts)' + sql[sql.index('\n, sku_totals AS'):]
        with sqlite3.connect(':memory:') as db:
            db.execute('CREATE TABLE facts(snapshot_date TEXT,location_type TEXT,sku TEXT,material_name TEXT,demand REAL,allocated REAL,remaining REAL,available REAL,shortage REAL,invalid INTEGER)')
            db.executemany('INSERT INTO facts VALUES (?,?,?,?,?,?,?,?,?,?)', [
                ('2026-11-04', '基地', 'A', '甲', 12, 0, 12, 0, 12, 0),
                ('2026-11-04', '基地', 'A', '甲', 9, 0, 9, 0, 9, 0),
                ('2026-11-04', '基地', 'B', '乙', 20, 0, 20, 0, 20, 0),
                ('2026-11-04', '基地', 'C', '丙', 5, 0, 5, 5, 0, 0),
            ])
            db.row_factory = sqlite3.Row
            rows = [dict(row) for row in db.execute(sql, {'gea_p4': 10, 'gea_p5': 0})]
            self.assertEqual([row['sku'] for row in rows], ['A', 'B'])
            self.assertEqual([row['shortage'] for row in rows], [21, 20])
            self.assertTrue(all(row['page_scope_total'] == 2 for row in rows))
            self.assertTrue(all(row['scope_shortage'] == 41 for row in rows))
            second = [dict(row) for row in db.execute(sql, {'gea_p4': 1, 'gea_p5': 1})]
            self.assertEqual(second[0]['sku'], 'B')
            self.assertEqual(second[0]['page_scope_total'], 2)
            self.assertEqual(second[0]['scope_shortage'], 41)
            db.execute('UPDATE facts SET invalid=1 WHERE sku="C"')
            self.assertEqual(db.execute(sql, {'gea_p4': 10, 'gea_p5': 0}).fetchone()['scope_invalid'], 1)


if __name__ == '__main__':
    unittest.main()
