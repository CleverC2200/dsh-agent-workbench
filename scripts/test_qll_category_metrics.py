"""Exercise the shipped category normalization and grouping against invalid quantities."""
import json
import sqlite3
import unittest
from pathlib import Path
import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]

class QllCategoryMetrics(unittest.TestCase):
    def test_raw_branch_organization_keeps_ninety_day_risk_boundary(self):
        config = json.loads((ROOT / 'business/inventory-qll/sql.config.json').read_text())
        tree = sqlglot.parse_one(config['queries']['branch-structure.groups']['request']['sql'], read='postgres')
        risk = next(e for select in tree.find_all(exp.Select) for e in select.expressions
                    if e.alias_or_name == 'risk_current' and isinstance(e.this, exp.Sum)
                    and any(c.table == 'a' for c in e.find_all(exp.Column)))
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.execute('CREATE TABLE fixture (warehouse_classify, age_days, live_qty)')
        db.executemany('INSERT INTO fixture VALUES (?,?,?)', [('20',70,10),('20',95,5)])
        value = db.execute('SELECT ' + risk.sql(dialect='sqlite') + ' FROM fixture AS a').fetchone()[0]
        self.assertEqual(value, 5)

    def test_branch_organization_keeps_physical_stock_but_uses_available_movement_pool(self):
        config = json.loads((ROOT / 'business/inventory-qll/sql.config.json').read_text())
        query = config['queries']['snapshot.branch-structure.groups']
        tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.row_factory = sqlite3.Row
        columns = sorted({c.name for c in tree.find_all(exp.Column) if c.table in ['m', 'movement']})
        db.execute('CREATE TABLE agents_inv_branch_sku_day (' + ','.join('"'+c+'"' for c in columns) + ')')
        rows = []
        for sku, inventory, available, daily in [('a',100,60,10), ('b',40,40,0), ('c',20,-1,20)]:
            common = dict(inv_batch_id='batch', stock_date='2026-11-06', warehouseid='A110',
                          belong_base='郑州', sku=sku, material_name=sku, warehouse_name='沈阳分仓')
            rows += [{**common, 'inv_variant_id':'BRANCH_TREE', 'inventory_qty':inventory,
                      'available_qty':available, 'daily_movement':999},
                     {**common, 'inv_variant_id':'BRANCH_DEFAULT', 'rolling_ship_daily':daily}]
        db.executemany('INSERT INTO agents_inv_branch_sku_day VALUES (' + ','.join('?' for _ in columns) + ')',
                       [[r.get(c) for c in columns] for r in rows])
        params = dict(query['request']['parameters'])
        params.update(gea_p1='2026-11-06', gea_p2=False, gea_p3='郑州', gea_p4=None,
                      gea_p5=None, gea_p8=None, gea_p9='detail', gea_p10=200, gea_p11=0,
                      gea_p12=None, gea_p13='key', gea_p14='asc', gea_p90001='batch')
        result = [dict(r) for r in db.execute(tree.sql(dialect='sqlite'), params)]
        self.assertEqual(sum(r['total_qty'] for r in result), 160)
        self.assertEqual([r['historical_turnover'] for r in result], [6, None, None])

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

    def test_base_turnover_uses_the_same_plan_as_the_base_workbench(self):
        result = self.read('base', [dict(base='华南',category='汤圆',sku='SKU', inventory=100,
                          daily_demand=20,rolling_ship_positive=300,target=80,gap=20)])[0]
        self.assertEqual(result['turnover_qty'], 100)
        self.assertEqual(result['daily'], 20)
        self.assertEqual(result['target_daily'], 20)

    def test_base_target_turnover_only_uses_inventory_and_target_matched_keys(self):
        result = self.read('base', [dict(base='华南', category='汤圆', sku='ok', inventory=100, target=80, daily_demand=20),
            dict(base='华南', category='汤圆', sku='no-stock', inventory=None, target=500, daily_demand=100),
            dict(base='华南', category='汤圆', sku='no-plan', inventory=200, target=50, daily_demand=None)])[0]
        self.assertEqual((result['turnover_qty'], result['daily']), (100, 20))
        self.assertEqual((result['target_turnover_qty'], result['target_daily']), (80, 20))

    def test_branch_turnover_keeps_inventory_display_but_excludes_no_movement_or_negative_availability(self):
        result = self.read('branch', [dict(warehouseid='A', product_categ_name='汤圆', material_code='ok', total_qty=100, available_qty=60, daily_movement=10),
            dict(warehouseid='A', product_categ_name='汤圆', material_code='no-demand', total_qty=50, available_qty=40, daily_movement=0),
            dict(warehouseid='A', product_categ_name='汤圆', material_code='invalid', total_qty=10, available_qty=-5, daily_movement=5)])[0]
        self.assertEqual(result['inventory'], 160)
        self.assertEqual((result['turnover_qty'], result['daily']), (60, 10))

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
