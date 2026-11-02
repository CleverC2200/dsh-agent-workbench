"""Execute shipped target CTEs: a base/month selects one complete version."""
import json
import sqlite3
import unittest
from pathlib import Path

import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]
WITH_KEY = 'with_' if 'with_' in exp.Select.arg_types else 'with'


class TargetVersions(unittest.TestCase):
    def test_whole_base_version_and_same_version_daily_fallback(self):
        checked = 0
        for agent in ['aqkc', 'fc', 'qll']:
            config = json.loads((ROOT / f'business/inventory-{agent}/sql.config.json').read_text())
            for query_id, query in config['queries'].items():
                tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
                for source in list(tree.find_all(exp.CTE)):
                    if source.alias != 'target_source':
                        continue
                    siblings = source.parent.expressions
                    targets = next(c for c in siblings if c.alias == 'targets')
                    if 'final_target_inventory' not in targets.this.named_selects:
                        continue
                    checked += 1
                    ctes = [c.copy() for c in siblings if c.alias in (
                        'target_source', 'target_versions', 'target_keys', 'targets')]
                    priority = ['t.' + name for name in [
                        'final_target_inventory', 'management_target_inventory', 'target_inventory']
                        if name in targets.this.named_selects]
                    target = ('COALESCE(' + ','.join(priority) + ')') if len(priority) > 1 else priority[0]
                    statement = sqlglot.parse_one('SELECT t.base AS base, t.sku AS sku, ' + target + ' AS target, t.avg_daily_planned_demand AS daily FROM targets AS t')
                    statement.set(WITH_KEY, exp.With(expressions=ctes))
                    columns = {c.name for c in source.find_all(exp.Column) if c.table == 't'}
                    columns.update(['main_sales_plan_v1', 'main_sales_plan_adj', 'roll_sales_plan',
                                    'transfer_out_plan_v1', 'transfer_out_plan_adj', 'transfer_out_plan_roll',
                                    'target_inventory', 'management_target_inventory'])
                    with self.subTest(agent=agent, query=query_id), sqlite3.connect(':memory:') as db:
                        db.execute('CREATE TABLE agents_scm_goods_inventory_turnover_data_m (' + ','.join(sorted(columns)) + ')')

                        def insert(base, sku, version, target, daily=None, **extra):
                            row = dict(year_month='2026-11-01', inventory_version=version, belong_base=base,
                                       material_code=sku, final_target_inventory=target, avg_daily_planned_demand=daily, **extra)
                            db.execute('INSERT INTO agents_scm_goods_inventory_turnover_data_m (' + ','.join(row) + ') VALUES (' + ','.join('?' for _ in row) + ')', tuple(row.values()))

                        insert('A', 'one', '纠偏', None)
                        insert('A', 'one', '月初', 100, 12)
                        insert('A', 'two', '月初', 200, 20)
                        insert('B', 'one', '月初', 50, main_sales_plan_v1=300, transfer_out_plan_v1=60)
                        insert('C', 'one', '纠偏', 0, 0)
                        insert('C', 'one', '月初', 500, 40)
                        insert('D', 'one', '纠偏', 99, 10)
                        insert('D', 'one', '纠偏', 99, 10)
                        insert('D', 'one', '月初', 500, 40)
                        insert('E', 'one', '滚动', 80, roll_sales_plan=600, transfer_out_plan_roll=0)
                        insert('F', 'one', '纠偏', 77, 10)
                        insert('F', 'one', '纠偏', 88, 10)
                        insert('G', 'one', '纠偏', 77, 10)
                        insert('G', 'one', '纠偏', None)
                        insert('H', 'one', '纠偏', 0, 0)
                        insert('H', 'one', '纠偏', 0, 0)
                        insert('I', 'one', '纠偏', 99, 10, main_sales_plan_adj=330, transfer_out_plan_adj=0)
                        insert('I', 'one', '纠偏', 99, 20, main_sales_plan_adj=330, transfer_out_plan_adj=0)
                        insert('J', 'one', '纠偏', 99, main_sales_plan_adj=300, transfer_out_plan_adj=0)
                        insert('J', 'one', '纠偏', 99, main_sales_plan_adj=300, transfer_out_plan_adj=0)
                        insert('K', 'one', '纠偏', 99, 10, main_sales_plan_adj=330, transfer_out_plan_adj=0)
                        insert('K', 'one', '纠偏', 99, main_sales_plan_adj=330, transfer_out_plan_adj=0)
                        insert('L', 'one', '纠偏', 77, 10, target_inventory=10)
                        insert('L', 'one', '纠偏', 88, 10, target_inventory=10)
                        params = dict(query['request']['parameters'])
                        for key, spec in query['parameterSpec'].items():
                            if spec['name'] == 'month': params[key] = '2026-11-01'
                            if spec['name'] == 'inventory_version': params[key] = '纠偏'
                            if spec['name'] == 'bases_enabled': params[key] = False
                            if spec['name'] == 'bases': params[key] = ''
                        sql = statement.sql(dialect='sqlite')
                        self.assertEqual(sorted(db.execute(sql, params).fetchall()), [
                            ('A', 'one', None, None), ('B', 'one', 50, 11),
                            ('C', 'one', 0, 0), ('D', 'one', 99, 10),
                            ('F', 'one', None, 10), ('G', 'one', None, None),
                            ('H', 'one', 0, 0), ('I', 'one', 99, None),
                            ('J', 'one', 99, 10), ('K', 'one', 99, None),
                            ('L', 'one', None, 10)])
                        params[next(k for k, s in query['parameterSpec'].items() if s['name'] == 'inventory_version')] = '月初'
                        self.assertEqual(sorted(db.execute(sql, params).fetchall()), [
                            ('A', 'one', 100, 12), ('A', 'two', 200, 20),
                            ('B', 'one', 50, 11), ('C', 'one', 500, 40),
                            ('D', 'one', 500, 40), ('E', 'one', 80, 20)])
        self.assertGreater(checked, 25)


if __name__ == '__main__':
    unittest.main()
