"""Flatten repeated order CTEs so GEA can parse the import recalculation reads."""
import json
from pathlib import Path
import re

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


def flatten(tree):
    definitions = {}
    ctes = []

    def visit(node):
        scope = node.args.get('with')
        if scope:
            if scope.args.get('recursive'):
                raise ValueError('Recursive CTEs cannot be flattened')
            node.set('with', None)
            for cte in scope.expressions:
                visit(cte.this)
                signature = cte.this.sql(dialect='postgres')
                if cte.alias in definitions:
                    if definitions[cte.alias] != signature:
                        raise ValueError('Different CTE definitions share a name: ' + cte.alias)
                else:
                    definitions[cte.alias] = signature
                    ctes.append(cte)
        for child in list(node.iter_expressions()):
            visit(child)

    visit(tree)
    tree.set('with', exp.With(expressions=ctes))
    # GEA accepts positional SUBSTRING, not the FROM/FOR attributes emitted by SQLGlot.
    for node in list(tree.find_all(exp.Substring)):
        args = [node.this.copy()]
        args.extend(node.args[name].copy() for name in ('start', 'length')
                    if node.args.get(name) is not None)
        node.replace(exp.Anonymous(this='SUBSTRING', expressions=args))
    return re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))


def main():
    path = ROOT / 'business/inventory-fc/sql.config.json'
    source = path.read_text()
    config = json.loads(source)
    for query_id in QUERIES:
        query = config['queries'][query_id]
        sql = flatten(sqlglot.parse_one(query['request']['sql'], read='postgres'))
        query_start = re.search(re.escape(json.dumps(query_id)) + r'\s*:\s*\{', source).end()
        value_start = re.search(r'"sql"\s*:\s*', source[query_start:]).end() + query_start
        _, length = json.JSONDecoder().raw_decode(source[value_start:])
        source = source[:value_start] + json.dumps(sql, ensure_ascii=False) + source[value_start + length:]
    path.write_text(source)


if __name__ == '__main__':
    main()
