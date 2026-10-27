"""Exercise the shipped warning and weighted-age expressions with conflicting SKU facts."""
import sqlite3
import unittest
from agent_sql import config_for
import sqlglot
from sqlglot import exp


class BaseDetailMetrics(unittest.TestCase):
    def setUp(self):
        self.config = config_for('aqkc')
        self.db = sqlite3.connect(':memory:')
        self.addCleanup(self.db.close)

    def tree(self, name):
        return sqlglot.parse_one(self.config['queries'][name]['request']['sql'], read='postgres')

    def test_shortage_precedes_inventory_and_missing_target_in_every_page_path(self):
        self.db.execute('CREATE TABLE stock(inventory REAL,target REAL)')
        self.db.execute('CREATE TABLE pending(shortage REAL,invalid INTEGER)')
        self.db.execute('CREATE TABLE presence(source_order_count INTEGER)')
        for name in ['page.sku-detail', 'page.sku-detail.count', 'page.sku-detail.atomic']:
            tree = self.tree(name)
            scopes = [c for c in tree.find_all(exp.CTE) if c.alias == 'stock_rows']
            for scope in scopes:
                risk = next(e for e in scope.this.expressions if e.alias == 'risk')
                sql = 'SELECT ' + risk.sql(dialect='sqlite') + ' FROM stock s CROSS JOIN pending o CROSS JOIN presence p'
                for inventory, target, shortage, invalid, expected in [
                    (100, 10, 20, 0, '缺货'), (1, 10, 20, 0, '缺货'),
                    (100, None, 20, 0, '缺货'), (1, 10, 0, 0, '库存偏低'),
                    (100, 10, 0, 0, '库存偏高'), (100, None, 0, 0, '无目标'),
                    (10, 10, 0, 0, '正常'), (None, 10, 0, 0, '-'),
                    (100, 10, None, 1, '库存偏高'),
                ]:
                    for table in ['stock', 'pending', 'presence']:
                        self.db.execute('DELETE FROM ' + table)
                    self.db.execute('INSERT INTO stock VALUES (?,?)', (inventory, target))
                    self.db.execute('INSERT INTO pending VALUES (?,?)', (shortage, invalid))
                    self.db.execute('INSERT INTO presence VALUES (1)')
                    self.assertEqual(self.db.execute(sql).fetchone()[0], expected, (name, expected))
            for select in tree.find_all(exp.Select):
                where = select.args.get('where')
                if where and 'gea_p3001' in where.sql():
                    self.assertIn('s.risk', where.sql())
                    self.assertNotIn('s.target', where.sql())

    def test_child_risk_counts_do_not_cancel_and_age_excludes_invalid_or_nonpositive_batches(self):
        self.db.execute('CREATE TABLE inventory_batch_ages (belong_base TEXT, material_code TEXT, material_name TEXT, live_qty REAL, available_qty REAL, pack_unit_qty REAL, age_days REAL)')
        self.db.executemany('INSERT INTO inventory_batch_ages VALUES (?,?,?,?,?,?,?)', [
            ('郑州','S','商品',10,10,0,20), ('郑州','S','商品',30,30,0,80),
            ('郑州','S','商品',100,100,0,None), ('郑州','S','商品',-50,0,0,900),
            ('郑州','S','商品',0,0,0,1000),
        ])
        self.db.execute('CREATE TABLE fixture(inventory REAL,target REAL,age_weighted_sum REAL,age_qty REAL)')
        self.db.executemany('INSERT INTO fixture VALUES (?,?,?,?)', [(10,20,200,10),(30,20,2400,30),(100,None,0,0)])
        for name in ['page.dashboard-groups', 'page.structure-groups']:
            tree = self.tree(name)
            batch = next(c.this for c in tree.find_all(exp.CTE) if c.alias == 'base_batch_stock')
            row = self.db.execute(batch.sql(dialect='sqlite')).fetchone()
            fields = dict(zip(batch.named_selects, row))
            self.assertEqual(fields['age_weighted_sum']/fields['age_qty'],65)
            wanted = ['low_stock_count','high_stock_count','missing_target_count','age_weighted_sum','age_qty']
            stats = [e for e in tree.expressions if e.alias in wanted]
            row = self.db.execute('SELECT '+', '.join(e.sql(dialect='sqlite') for e in stats)+' FROM fixture g').fetchone()
            result = dict(zip([e.alias for e in stats], row))
            self.assertEqual([result[k] for k in wanted[:3]], [1,1,1])
            self.assertEqual(result['age_weighted_sum']/result['age_qty'],65)

    def test_stock_age_columns_do_not_leak_into_union_keys_or_historical_order_scopes(self):
        for name in ['page.dashboard-groups','page.structure-groups','page.sku-detail','page.sku-detail.count','page.sku-detail.atomic']:
            tree=self.tree(name)
            for union in tree.find_all(exp.Union):
                self.assertEqual(len(union.left.named_selects),len(union.right.named_selects),name)
            for cte in tree.find_all(exp.CTE):
                if cte.alias in ['inventory_keys','order_rows']:
                    self.assertNotIn('age_weighted_sum',cte.this.named_selects,name)


if __name__ == '__main__':
    unittest.main()
