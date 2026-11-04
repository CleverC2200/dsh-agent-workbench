"""The selector uses source mappings, never warehouse-name suffix guesses."""
import json
import sqlite3
import unittest
from pathlib import Path
import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]

class WarehouseScope(unittest.TestCase):
    def test_confirmed_shanghai_exception_uses_current_snapshot_without_other_02_warehouses(self):
        config = json.loads((ROOT / 'business/inventory-fc/sql.config.json').read_text())
        sql = sqlglot.transpile(config['queries']['branch-warehouse.directory']['request']['sql'], read='postgres', write='sqlite')[0]
        db = sqlite3.connect(':memory:'); self.addCleanup(db.close)
        db.execute('CREATE TABLE agents_scm_inventory_sku_data_d (month_date TEXT,warehouse_classify TEXT,warehouseid TEXT,warehouse_name TEXT,belong_base TEXT)')
        db.executemany('INSERT INTO agents_scm_inventory_sku_data_d VALUES (?,?,?,?,?)', [
            ('20261101','20','Y204','上海分仓','郑州'),
            ('20261103','02','Y204','上海分仓','郑州'),
            ('20261103','02','Y302','成都配送中心仓','西南'),
            ('20261103','20','A110','沈阳分仓','郑州'),
            ('20261103','03','N436','郑州DC仓','郑州'),
        ])
        self.assertEqual(list(db.execute(sql, {'gea_p1':'2026-11-04','gea_p2':200,'gea_p3':0})), [
            ('A110','沈阳分仓','郑州'), ('N436','郑州DC仓','郑州'), ('Y204','上海分仓','郑州'),
        ])

    def test_asn_source_uses_receiving_and_source_warehouse_without_name_matching(self):
        import test_fc_upstream_orders as upstream
        f=upstream.UpstreamOrders();f.setUp();self.addCleanup(f.doCleanups)
        f.db.execute("UPDATE agents_scm_inventory_sku_data_d SET warehouse_name='同名仓'")
        f.db.execute("UPDATE agents_scm_asn_detail_d SET warehouse_name='同名仓'")
        rows=f.rows()
        self.assertEqual(rows['O1']['warehouse_code'],'BR1')
        self.assertEqual(rows['O2']['warehouse_code'],'BR2')
        self.assertEqual(rows['O2']['shortage'],40)

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
