"""Exercise the shipped category normalization and grouping against invalid quantities."""
import json
import sqlite3
import unittest
from pathlib import Path
import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]

class QllCategoryMetrics(unittest.TestCase):
    def read(self, layer, rows):
        config = json.loads((ROOT / 'business/inventory-qll/sql.config.json').read_text())
        query = config['queries']['category-tree.' + layer]
        tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
        normalized = next(c for c in tree.ctes if c.alias == 'normalized')
        columns = sorted({c.name for c in normalized.find_all(exp.Column) if c.table == 'r'})
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.row_factory = sqlite3.Row
        db.execute('CREATE TABLE fixture (' + ','.join('"' + c + '"' for c in columns) + ')')
        db.executemany('INSERT INTO fixture VALUES (' + ','.join('?' for _ in columns) + ')',
                       [[row.get(c) for c in columns] for row in rows])
        tree.args.get('with_', tree.args.get('with')).set('expressions', [
            exp.CTE(this=sqlglot.parse_one('SELECT ' + ','.join('"'+c+'" AS "'+c+'"' for c in columns) + ' FROM fixture'),
                    alias=exp.TableAlias(this=exp.to_identifier('tree_source'))), normalized.copy(),
        ])
        params = {**query['request']['parameters'], 'gea_p9100':'category', 'gea_p9101':None,
                  'gea_p9102':None, 'gea_p9103':None, 'gea_p9104':None,'gea_p9105':11,'gea_p9106':0}
        return [dict(r) for r in db.execute(tree.sql(dialect='sqlite'), params)]

    def test_channel_negative_stock_does_not_cancel_valid_stock_or_targets(self):
        rows = [dict(category='汤圆', inventory=100, sales30=30, analysis_target_inventory=80),
                dict(category='汤圆', inventory=-20, sales30=4, analysis_target_inventory=5),
                dict(category='汤圆', inventory=0, sales30=0, analysis_target_inventory=20),
                dict(category='汤圆', inventory=None, sales30=3, analysis_target_inventory=9)]
        result = self.read('customer', rows)[0]
        self.assertEqual(result['inventory'], 100)
        self.assertEqual(result['missing_inventory'], 2)
        self.assertEqual(result['target'], 100)
        self.assertEqual(result['gap'], 0)
        self.assertEqual(result['turnover_qty'], 100)
        self.assertEqual(result['daily'], 1)

    def test_base_actual_turnover_does_not_use_planned_movement(self):
        result = self.read('base', [dict(base='华南',category='汤圆',sku='SKU', inventory=100,
                          daily_demand=20,rolling_ship_positive=300,target=80,gap=20)])[0]
        self.assertEqual(result['turnover_qty'], 100)
        self.assertEqual(result['daily'], 10)
        self.assertEqual(result['target_daily'], 20)

    def test_snapshot_branch_movement_matches_the_same_batch_warehouse_and_sku(self):
        config = json.loads((ROOT / 'business/inventory-qll/sql.config.json').read_text())
        query = config['queries']['snapshot.category-tree.branch']
        tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
        facts = next(c.this for c in tree.find_all(exp.CTE) if c.alias == 'batch_facts')
        columns = sorted({c.name for c in facts.find_all(exp.Column) if c.table in ('m','movement')})
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.row_factory = sqlite3.Row
        db.execute('CREATE TABLE agents_inv_branch_sku_day (' + ','.join('"'+c+'"' for c in columns) + ')')
        rows = [
            dict(inv_batch_id='batch',inv_variant_id='BRANCH_TREE',warehouseid='A',sku='S',inventory_qty=10,daily_movement=999),
            dict(inv_batch_id='batch',inv_variant_id='BRANCH_TREE',warehouseid='B',sku='S',inventory_qty=20,daily_movement=999),
            dict(inv_batch_id='batch',inv_variant_id='BRANCH_TREE',warehouseid='A',sku='unknown',inventory_qty=5,daily_movement=999),
            dict(inv_batch_id='batch',inv_variant_id='BRANCH_DEFAULT',warehouseid='A',sku='S',rolling_ship_daily=2),
            dict(inv_batch_id='batch',inv_variant_id='BRANCH_DEFAULT',warehouseid='B',sku='S',rolling_ship_daily=3),
            dict(inv_batch_id='other',inv_variant_id='BRANCH_DEFAULT',warehouseid='A',sku='S',rolling_ship_daily=100),
            dict(inv_batch_id='batch',inv_variant_id='BRANCH_DEFAULT',warehouseid='C',sku='S',rolling_ship_daily=100),
        ]
        db.executemany('INSERT INTO agents_inv_branch_sku_day VALUES ('+','.join('?' for _ in columns)+')',
                       [[('2026-11-04' if c=='stock_date' else row.get(c)) for c in columns] for row in rows])
        params={**query['request']['parameters'],next(k for k,v in query['parameterSpec'].items() if v['name']=='summary_batch_id'):'batch'}
        params[next(k for k,v in query['parameterSpec'].items() if v['name']=='stat_date')]='2026-11-04'
        params={k:(v[0] if isinstance(v,list) and v else v) for k,v in params.items()}
        result=[dict(r) for r in db.execute(facts.sql(dialect='sqlite'),params)]
        self.assertEqual(len(result),3)
        indexed={(r['warehouseid'],r['material_code']):r for r in result}
        self.assertEqual(indexed['A','S']['daily_movement'],2)
        self.assertEqual(indexed['B','S']['daily_movement'],3)
        self.assertIsNone(indexed['A','unknown']['daily_movement'])
        self.assertEqual(sum(r['total_qty'] for r in result),35)

if __name__ == '__main__':
    unittest.main()
