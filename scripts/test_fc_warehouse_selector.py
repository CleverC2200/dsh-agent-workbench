"""The selector uses source mappings, never warehouse-name suffix guesses."""
import json
import sqlite3
import unittest
from pathlib import Path
import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]

class WarehouseScope(unittest.TestCase):
    def test_fulfillment_mapping_resolves_names_without_duplicate_order_rows(self):
        config = json.loads((ROOT / 'business/inventory-fc/sql.config.json').read_text())
        tree = sqlglot.parse_one(config['queries']['orders.summary']['request']['sql'], read='postgres')
        mapping = next(x for x in tree.find_all(exp.Subquery) if x.alias == 'selected_warehouse').this
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.execute('CREATE TABLE agents_scm_material_in_out_summary_d (warehouseid TEXT,pickup_point TEXT)')
        db.execute('CREATE TABLE agents_scm_execute_detail_d (pickup_point TEXT,pickup_point_name TEXT)')
        db.executemany('INSERT INTO agents_scm_material_in_out_summary_d VALUES (?,?)', [('A170','57'),('A170','57'),('N417','34'),('A','bad'),('B','bad')])
        db.executemany('INSERT INTO agents_scm_execute_detail_d VALUES (?,?)', [('57','成都分仓提货点'),('57','成都分仓提货点'),('34','郑州配送中心提货点'),('bad','歧义提货点')])
        sql = mapping.sql(dialect='sqlite')
        self.assertEqual(dict(db.execute(sql, {'gea_p91':'A170'})), {'成都分仓提货点':'A170','郑州配送中心提货点':'N417'})
        self.assertEqual(list(db.execute(sql, {'gea_p91':None})), [])
        # Two pickup codes with one ambiguous name must not leak another warehouse.
        db.execute("UPDATE agents_scm_execute_detail_d SET pickup_point_name='成都分仓提货点' WHERE pickup_point='34'")
        self.assertEqual(list(db.execute(sql, {'gea_p91':'A170'})), [])

    def test_directory_is_branch_only_and_uses_selected_snapshot(self):
        config = json.loads((ROOT / 'business/inventory-fc/sql.config.json').read_text())
        query = config['queries']['branch-warehouse.directory']['request']['sql']
        sql = sqlglot.transpile(query, read='postgres', write='sqlite')[0]
        db = sqlite3.connect(':memory:'); self.addCleanup(db.close)
        db.execute('CREATE TABLE agents_scm_inventory_sku_data_d (month_date TEXT,warehouse_classify TEXT,warehouseid TEXT,warehouse_name TEXT,belong_base TEXT)')
        db.executemany('INSERT INTO agents_scm_inventory_sku_data_d VALUES (?,?,?,?,?)', [('20261026','20','OLD','旧仓','西南'),('20261027','20','A170','成都分仓','西南'),('20261027','20','A170','成都分仓','西南'),('20261027','02','Y302','成都配送中心仓','西南'),('20261028','20','FUTURE','未来仓','西南')])
        self.assertEqual(list(db.execute(sql, {'gea_p1':'2026-10-27','gea_p2':200,'gea_p3':0})), [('A170','成都分仓','西南')])

if __name__ == '__main__':
    unittest.main()
