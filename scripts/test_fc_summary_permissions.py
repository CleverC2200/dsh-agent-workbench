"""Exercise the actual snapshot selector with warehouse-scoped row permissions."""
import json
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[1]


class BranchSummaryPermissions(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.create_function('CONCAT', -1, lambda *values: ''.join(str(v) for v in values))
        self.addCleanup(self.db.close)
        columns = 'inv_batch_id TEXT, inv_variant_id TEXT, inv_rule_version TEXT, inv_business_date TEXT, stock_date TEXT, stat_month TEXT, warehouseid TEXT'
        for table in ['base_sku', 'branch_sku', 'order_summary']:
            self.db.execute(f'CREATE TABLE backing_{table} ({columns})')
            self.db.execute(f"CREATE VIEW agents_inv_{table}_day AS SELECT inv_batch_id,inv_variant_id,inv_rule_version,inv_business_date,stock_date,stat_month,warehouseid FROM backing_{table} WHERE warehouseid='A110'")
            self.add(table, '202611031200', '__READY__', None)

    def add(self, table, batch, variant, warehouse):
        self.db.execute(f'INSERT INTO backing_{table} VALUES(?,?,?,?,?,?,?)',
                        (batch, variant, 'inventory-daily-v5-20261103', '2026-11-03', '2026-11-02', '202611', warehouse))

    def read(self):
        query = json.loads((ROOT / 'business/inventory-fc/sql.config.json').read_text())['queries']['summary.snapshot']
        return [dict(row) for row in self.db.execute(query['request']['sql'])]

    def test_authorized_branch_completion_does_not_require_base_permissions(self):
        self.add('branch_sku', '202611031200', '__BRANCH_READY__', 'A110')
        rows = self.read()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['batch_id'], '202611031200')
        self.assertEqual(rows[0]['stock_date'], '2026-11-02')
        self.assertEqual(rows[0]['target_month'], '2026-11-01')

    def test_unfinished_and_unauthorized_batches_cannot_replace_ready_scope(self):
        self.add('branch_sku', '202611031200', '__BRANCH_READY__', 'A110')
        self.add('branch_sku', '202611031300', 'BRANCH_DEFAULT', 'A110')
        self.add('branch_sku', '202611031400', '__BRANCH_READY__', 'A020')
        self.assertEqual(self.read()[0]['batch_id'], '202611031200')

    def test_no_visible_completion_never_treats_business_rows_as_ready(self):
        self.add('branch_sku', '202611031300', 'BRANCH_DEFAULT', 'A110')
        self.assertEqual(self.read(), [])


class BaseSummaryPermissions(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.addCleanup(self.db.close)
        self.db.execute('CREATE TABLE backing (inv_batch_id,inv_variant_id,inv_rule_version,inv_business_date,stock_date,month,effective_version,belong_base)')
        self.db.execute("CREATE VIEW agents_inv_base_sku_day AS SELECT inv_batch_id,inv_variant_id,inv_rule_version,inv_business_date,stock_date,month,effective_version,belong_base FROM backing WHERE belong_base='郑州'")
        self.query = json.loads((ROOT/'business/inventory-aqkc/sql.config.json').read_text())['queries']['summary.snapshot']['request']['sql']

    def add(self, batch, variant, base, version='月初'):
        self.db.execute('INSERT INTO backing VALUES (?,?,?,?,?,?,?,?)', (batch,variant,'inventory-daily-v5-20261103','2026-11-03','2026-11-02','2026-11-01',version,base))

    def read(self):
        return [dict(row) for row in self.db.execute(self.query)]

    def test_base_metadata_uses_own_permissions_without_branch_or_orders(self):
        self.add('old','__READY__',None)
        self.add('complete','__BASE_READY__','郑州')
        self.add('newer','BASE_STOCK:月初','郑州')
        self.add('unauthorized','__BASE_READY__','华东')
        self.assertEqual(self.read(),[{'batch_id':'complete','business_date':'2026-11-03','stock_date':'2026-11-02','target_month':'2026-11-01','default_inventory_version':'月初'}])

    def test_data_rows_or_missing_version_do_not_complete_a_base_batch(self):
        self.add('unfinished','BASE_STOCK:月初','郑州')
        self.assertEqual(self.read(),[])
        self.add('unversioned','__BASE_READY__','郑州',None)
        self.assertEqual(self.read(),[])

class ChainSummaryPermissions(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row
        self.db.create_function('CONCAT',-1,lambda *v: ''.join(str(x) for x in v));self.addCleanup(self.db.close)
        self.db.execute('CREATE TABLE base (inv_batch_id,inv_variant_id,inv_rule_version,inv_business_date,stock_date,month,belong_base)')
        self.db.execute('CREATE TABLE branch (inv_batch_id,inv_variant_id,inv_rule_version,inv_business_date,stock_date,stat_month,warehouseid)')
        self.db.execute("CREATE VIEW agents_inv_base_sku_day AS SELECT inv_batch_id,inv_variant_id,inv_rule_version,inv_business_date,stock_date,month,belong_base FROM base WHERE belong_base='郑州'")
        self.db.execute("CREATE VIEW agents_inv_branch_sku_day AS SELECT inv_batch_id,inv_variant_id,inv_rule_version,inv_business_date,stock_date,stat_month,warehouseid FROM branch WHERE warehouseid='A110'")
        self.query=json.loads((ROOT/'business/inventory-qll/sql.config.json').read_text())['queries']['summary.snapshot']['request']['sql']

    def test_either_visible_completed_scope_can_identify_the_same_batch(self):
        self.db.execute("INSERT INTO branch VALUES ('complete','__BRANCH_READY__','inventory-daily-v5-20261103','2026-11-03','2026-11-02','202611','A110')")
        row=dict(self.db.execute(self.query).fetchone());self.assertEqual(row['batch_id'],'complete')
        self.db.execute("INSERT INTO base VALUES ('complete','__BASE_READY__','inventory-daily-v5-20261103','2026-11-03','2026-11-02','2026-11-01','郑州')")
        self.assertEqual([dict(r) for r in self.db.execute(self.query)],[row])
        self.db.execute("DELETE FROM branch")
        self.assertEqual([dict(r) for r in self.db.execute(self.query)],[row])

    def test_visible_metadata_disagreement_is_not_treated_as_complete(self):
        self.db.execute("INSERT INTO branch VALUES ('complete','__BRANCH_READY__','inventory-daily-v5-20261103','2026-11-03','2026-11-02','202611','A110')")
        self.db.execute("INSERT INTO base VALUES ('complete','__BASE_READY__','inventory-daily-v5-20261103','2026-11-03','2026-11-01','2026-11-01','郑州')")
        self.assertEqual(list(self.db.execute(self.query)),[])

if __name__ == '__main__':
    unittest.main()
