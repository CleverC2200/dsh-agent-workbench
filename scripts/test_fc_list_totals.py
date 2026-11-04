"""Whole-filter quantities must survive paging and ignore only unknown records."""
import json
import sqlite3
import unittest
from pathlib import Path

import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]
QUERIES = {
    'replenishment.detail.atomic': 'inventory_qty',
    'snapshot.replenishment.detail.atomic': 'inventory_qty',
    'snapshot-default.replenishment.detail.atomic': 'inventory_qty',
    'branch-plan.detail.atomic': 'period_current_out',
    'branch-current-orders.page': 'demand',
    'snapshot.branch-current-orders.page': 'demand',
}


class FcListTotals(unittest.TestCase):
    def test_atomic_totals_are_from_the_full_filtered_source(self):
        config = json.loads((ROOT / 'business/inventory-fc/sql.config.json').read_text())
        for query_id, field in QUERIES.items():
            with self.subTest(query=query_id):
                query = config['queries'][query_id]
                summary = query.get('scopeSummaryColumns', {})
                self.assertIn(field, summary, 'visible list has no whole-filter total')
                tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
                source = (tree.args.get('from_') or tree.args['from']).this
                aggregate = next(cte.this.copy() for cte in tree.ctes if cte.alias == source.name)
                self.assertIsNone(aggregate.args.get('limit'))
                input_table = (aggregate.args.get('from_') or aggregate.args['from']).this
                self.assertNotIn(input_table.name, ['page_rows', 'plan_page'])
                columns = sorted({column.name for column in aggregate.find_all(exp.Column)})
                aggregate.from_('fixture AS ' + input_table.alias_or_name, copy=False)
                with sqlite3.connect(':memory:') as db:
                    db.row_factory = sqlite3.Row
                    db.execute('CREATE TABLE fixture (' + ','.join(columns) + ')')
                    for value in range(1, 14):
                        row = {column: 0 for column in columns}
                        row[field] = value
                        db.execute('INSERT INTO fixture VALUES (' + ','.join('?' for _ in columns) + ')', [row[column] for column in columns])
                    sql = aggregate.sql(dialect='sqlite')
                    self.assertEqual(db.execute(sql).fetchone()[summary[field]], 91)
                    db.execute('UPDATE fixture SET ' + field + '=NULL WHERE ' + field + '=13')
                    self.assertEqual(db.execute(sql).fetchone()[summary[field]], 78)
                    db.execute('UPDATE fixture SET ' + field + '=NULL')
                    self.assertIsNone(db.execute(sql).fetchone()[summary[field]])
                    db.execute('DELETE FROM fixture')
                    self.assertEqual(db.execute(sql).fetchone()[summary[field]], 0)

    def test_first_screen_keeps_replenishment_summary_columns(self):
        config = json.loads((ROOT / 'business/inventory-fc/sql.config.json').read_text())
        member = next(row for row in config['dailySummary']['bundle']['members']
                      if row['queryId'] == 'snapshot-default.replenishment.detail.atomic')
        summary = config['queries'][member['queryId']].get('scopeSummaryColumns', {})
        self.assertIn('recommended_qty', summary)
        for alias in summary.values():
            self.assertIn(alias, member['columns'])
            self.assertIn(member['columns'][alias], config['queries']['summary.first-screen']['resultColumns'])
            self.assertIn(member['columns'][alias], config['queries']['summary.bootstrap']['resultColumns'])


if __name__ == '__main__':
    unittest.main()
