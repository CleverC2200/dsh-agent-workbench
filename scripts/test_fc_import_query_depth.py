"""Keep import recalculation within the gateway's supported CTE shape."""
import json
from pathlib import Path
import unittest

import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]
QUERIES = (
    'replenishment.detail',
    'replenishment.count',
    'replenishment.detail.atomic',
    'replenishment-confirmation.detail',
    'replenishment-confirmation.detail.atomic',
)


class FcImportQueryShape(unittest.TestCase):
    def test_import_read_queries_share_one_cte_scope(self):
        config = json.loads((ROOT / 'business/inventory-fc/sql.config.json').read_text())
        for query_id in QUERIES:
            with self.subTest(query=query_id):
                tree = sqlglot.parse_one(config['queries'][query_id]['request']['sql'], read='postgres')
                self.assertEqual(len(list(tree.find_all(exp.With))), 1, query_id)
                self.assertEqual(len([c for c in tree.ctes if c.alias == 'customer_current']), 1)


if __name__ == '__main__':
    unittest.main()
