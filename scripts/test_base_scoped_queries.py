"""Scoped base landing queries retain parameters, boundaries, and batch-age semantics."""
import unittest
import re
import sqlglot
from sqlglot import exp
from agent_sql import config_for
from optimize_base_scoped_queries import optimize, FROM_KEY


class BaseScopedQueries(unittest.TestCase):
    def test_source_scopes_are_early_and_generation_is_idempotent(self):
        config = config_for('aqkc')
        for query_id in ['page.inventory-groups', 'page.dashboard-groups', 'page.structure-groups', 'page.sku-detail', 'page.sku-detail.count', 'page.sku-detail.atomic']:
            with self.subTest(query=query_id):
                query = config['queries'][query_id]
                self.assertEqual(optimize(query), query['request']['sql'])
                self.assertEqual(set(re.findall(r':(gea_p\d+)', query['request']['sql'])), set(query['parameterSpec']))
                tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
                self.assertEqual(tree.named_selects, query['resultColumns'])
                for name in ['target_source', 'inventory_batch_dates']:
                    source = next(cte.this for cte in tree.find_all(exp.CTE) if cte.alias_or_name == name)
                    self.assertTrue(any(node.name == 'belong_base' for node in source.args['where'].find_all(exp.Column)))
                # The shared global snapshot date stays independent of a selected base.
                for cte in tree.find_all(exp.CTE):
                    if cte.alias_or_name == 'base_daily_date':
                        self.assertNotIn(' IN ', cte.this.args['where'].sql())
                for node in tree.walk():
                    self.assertNotIsInstance(node, exp.Window)
                ages = next(cte.this for cte in tree.find_all(exp.CTE) if cte.alias_or_name == 'inventory_batch_ages')
                if query_id == 'page.dashboard-groups':
                    self.assertEqual(ages.args[FROM_KEY].this.name, 'inventory_batch_ordinals')
                    self.assertEqual(sum(cte.alias_or_name == 'inventory_batch_ordinals' for cte in tree.find_all(exp.CTE)), 1)


if __name__ == '__main__':
    unittest.main()
