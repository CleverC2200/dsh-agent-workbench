"""Regression for GEA rejecting SUBSTRING FROM/FOR in FC replenishment queries."""
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]


def parse(sql):
    return sqlglot.parse_one(sql, read='postgres')


class GovernedFcRendering(unittest.TestCase):
    def test_regeneration_preserves_queries_and_positional_substrings(self):
        config = json.loads((ROOT / 'business/inventory-fc/sql.config.json').read_text())
        targets = {key: query for key, query in config['queries'].items()
                   if key.startswith(('replenishment', 'transfer_plan'))}
        before = {key: parse(query['request']['sql']) for key, query in targets.items()}
        # Reproduce SQLGlot's canonical output, including queries already migrated.
        for key, tree in before.items():
            config['queries'][key]['request']['sql'] = re.sub(
                r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))
        self.assertIn(' FROM ', config['queries']['replenishment.detail.atomic']['request']['sql'])
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'scripts').mkdir()
            target = root / 'business/inventory-fc/sql.config.json'
            target.parent.mkdir(parents=True)
            target.write_text(json.dumps(config, ensure_ascii=False))
            script = root / 'scripts/align-fc-workflow.py'
            for name in ('align-fc-workflow.py', 'scope-fc-cycle-rules.py'):
                shutil.copyfile(ROOT / 'scripts' / name, root / 'scripts' / name)
            subprocess.run([sys.executable, str(script)], check=True, capture_output=True)
            result = json.loads(target.read_text())
            for key, tree in before.items():
                sql = result['queries'][key]['request']['sql']
                self.assertEqual(tree, parse(sql), key)
                self.assertEqual(config['queries'][key]['parameterSpec'], result['queries'][key]['parameterSpec'], key)
                self.assertEqual(config['queries'][key]['request']['parameters'], result['queries'][key]['request']['parameters'], key)
                for substring in parse(sql).find_all(exp.Substring):
                    canonical = substring.sql(dialect='postgres')
                    self.assertNotIn(canonical, sql, key)
            first = target.read_bytes()
            subprocess.run([sys.executable, str(script)], check=True, capture_output=True)
            self.assertEqual(first, target.read_bytes())


if __name__ == '__main__':
    unittest.main()
