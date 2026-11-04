"""Behavioral checks for the latest confirmed warehouse ownership rule."""
import sqlite3
import unittest
from inventory_warehouse_scope import warehouse_scope, branch_read_scope

class WarehouseScope(unittest.TestCase):
    def test_base_keeps_source_classes_and_branch_excludes_both_even_if_twenty(self):
        with sqlite3.connect(':memory:') as db:
            db.execute('CREATE TABLE stock (warehouseid TEXT, warehouse_classify TEXT)')
            db.executemany('INSERT INTO stock VALUES (?,?)', [('Y204','02'),('N436','02'),('Y204','20'),('N436','20'),('A020','20'),('BASE','01')])
            queries=[
                ("s.warehouse_classify='20' OR s.warehouseid='N436'", [('A020',)]),
                ("s.warehouse_classify IN ('01','02') AND s.warehouseid <> 'N436'", [('BASE',),('N436',),('Y204',)]),
                ("s.warehouse_classify IN ('01','02','20')", [('A020',),('BASE',),('N436',),('Y204',)]),
            ]
            for condition, expected in queries:
                sql=f'SELECT s.warehouseid AS warehouseid FROM stock AS s WHERE {condition} ORDER BY s.warehouseid'
                changed=warehouse_scope(sql)
                self.assertEqual(db.execute(changed).fetchall(),expected)
                self.assertEqual(warehouse_scope(changed),changed)

    def test_summary_reads_cannot_reintroduce_old_excluded_rows(self):
        with sqlite3.connect(':memory:') as db:
            db.execute('CREATE TABLE agents_inv_branch_sku_day(warehouseid TEXT, inventory_qty REAL)')
            db.executemany('INSERT INTO agents_inv_branch_sku_day VALUES (?,?)',[('Y204',20),('N436',30),('A020',40)])
            sql='SELECT SUM(m.inventory_qty) AS quantity FROM agents_inv_branch_sku_day AS m'
            changed=branch_read_scope(sql)
            self.assertEqual(db.execute(changed).fetchone(),(40,))
            self.assertEqual(branch_read_scope(changed),changed)

    def test_delivery_alias_is_local_and_doris_dates_remain_unchanged(self):
        sql="INSERT INTO target (day, month, warehouseid) SELECT CAST(@day AS STRING), DATE_FORMAT(@day, '%Y-%m-01'), t.warehouseid FROM stock AS t WHERE TRIM(t.warehouse_classify)='20'"
        changed=warehouse_scope(sql,'doris')
        self.assertIn("CAST(@day AS STRING), DATE_FORMAT(@day, '%Y-%m-01')",changed)
        self.assertIn("t.warehouseid NOT IN ('N436', 'Y204')",changed)
        delivery=warehouse_scope("SELECT t.warehouse AS id FROM agents_scm_cust_deliv_daily_di AS t WHERE t.warehouse_classify='20'")
        self.assertIn("t.warehouse NOT IN ('N436', 'Y204')",delivery)

if __name__=='__main__':unittest.main()
