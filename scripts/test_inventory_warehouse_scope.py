"""Warehouse exceptions preserve source SQL and resolve aliases within their own scope."""
import sqlite3
import unittest
from inventory_warehouse_scope import warehouse_exceptions


class WarehouseExceptions(unittest.TestCase):
    def test_base_and_branch_stock_are_disjoint(self):
        with sqlite3.connect(':memory:') as db:
            db.execute('CREATE TABLE stock (warehouseid TEXT, warehouse_classify TEXT)')
            db.executemany('INSERT INTO stock VALUES (?,?)', [('Y204','02'), ('Y302','02'), ('A110','20'), ('N436','02')])
            for condition, expected in [
                ("s.warehouse_classify = '20'", [('A110',), ('N436',), ('Y204',)]),
                ("s.warehouse_classify IN ('01', '02')", [('Y302',)]),
            ]:
                sql = f'SELECT s.warehouseid AS warehouseid FROM stock AS s WHERE {condition} ORDER BY s.warehouseid'
                self.assertEqual(db.execute(warehouse_exceptions(sql)).fetchall(), expected)

    def test_delivery_and_stock_aliases_do_not_share_a_field_guess(self):
        sql = "WITH stock AS (SELECT t.warehouseid AS id FROM agents_scm_inventory_sku_data_d AS t WHERE t.warehouse_classify = '20'), deliveries AS (SELECT t.warehouse AS id FROM agents_scm_cust_deliv_daily_di AS t WHERE t.warehouse_classify = '20') SELECT s.id AS id FROM stock AS s"
        changed = warehouse_exceptions(sql)
        self.assertIn("t.warehouse_classify = '20' OR t.warehouseid IN ('N436', 'Y204')", changed)
        self.assertIn("t.warehouse_classify = '20' OR t.warehouse IN ('N436', 'Y204')", changed)
        self.assertEqual(warehouse_exceptions(changed), changed)

    def test_doris_dates_and_variables_keep_their_original_bytes(self):
        sql = "INSERT INTO target (day, month, warehouseid) SELECT CAST(@inv_day AS STRING), DATE_FORMAT(@inv_day, '%Y-%m-01'), t.warehouseid FROM stock AS t WHERE TRIM(t.warehouse_classify)='20'"
        changed = warehouse_exceptions(sql, 'doris')
        self.assertIn("CAST(@inv_day AS STRING), DATE_FORMAT(@inv_day, '%Y-%m-01')", changed)
        self.assertIn("TRIM(t.warehouse_classify)='20' OR t.warehouseid IN ('N436', 'Y204')", changed)


if __name__ == '__main__':
    unittest.main()
