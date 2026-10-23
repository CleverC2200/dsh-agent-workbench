"""Prune unused intermediate fields from landing reads; preserve every returned field."""
import json
import re
from pathlib import Path

import sqlglot
from sqlglot import exp
from sqlglot.optimizer.eliminate_ctes import eliminate_ctes
from sqlglot.optimizer.pushdown_projections import pushdown_projections

ROOT = Path(__file__).resolve().parents[1]
QUERIES = {
    'aqkc': ['page.health-groups', 'page.workbench-support-by-base', 'current-shortage.locations'],
    'fc': ['health.cards', 'orders.summary', 'current-shortage.summary', 'replenishment.summary',
           'replenishment.detail.atomic'],
    'qll': ['health.cards', 'branch-health.cards', 'current-shortage.summary'],
    'apsplan': ['overview.orders-month', 'overview.production', 'page.budget-performance',
                'overview.demand-accuracy', 'overview.sales-accuracy', 'overview.delivery-daily',
                'overview.orders-month-products', 'overview.forecast', 'overview.plans-source',
                'current-shortage.locations'],
}

for agent, ids in QUERIES.items():
    path = ROOT / f'business/inventory-{agent}/sql.config.json'
    config = json.loads(path.read_text())
    for query_id in ids:
        if query_id not in config['queries']:
            continue
        query = config['queries'][query_id]
        original = sqlglot.parse_one(query['request']['sql'], read='postgres')
        tree = eliminate_ctes(pushdown_projections(original.copy()))
        ctes = {cte.alias_or_name: cte for cte in tree.ctes}
        if ('inventory_batch_ages' in ctes and 'inventory_batch_ordinals' not in ctes
                and any(e.alias == 'age_days' for e in ctes['inventory_batch_ages'].this.expressions)):
            dates = ctes['inventory_batch_dates']
            ages = ctes['inventory_batch_ages']
            age = next(e.this for e in ages.this.expressions if e.alias == 'age_days')
            difference = age.args['ifs'][0].args['true']
            assert isinstance(difference, exp.Sub)
            snapshot, production = difference.this.copy(), difference.expression.copy()
            # Keep the same guarded date parsing and calendar arithmetic. Compute
            # each civil-day ordinal once before validation and subtraction.
            columns = [exp.alias_(exp.column(e.alias_or_name, 'd'), e.alias_or_name) for e in dates.this.expressions]
            ordinals = exp.select(*columns, exp.alias_(snapshot.copy(), 'snapshot_ordinal'), exp.alias_(production.copy(), 'production_ordinal')).from_('inventory_batch_dates AS d')
            cte = exp.CTE(this=ordinals, alias=exp.TableAlias(this=exp.to_identifier('inventory_batch_ordinals')))
            age.replace(age.transform(lambda node: exp.column('snapshot_ordinal', 'd') if node == snapshot else exp.column('production_ordinal', 'd') if node == production else node))
            ages.this.args['from_'].this.set('this', exp.to_identifier('inventory_batch_ordinals'))
            at = tree.args['with_'].expressions.index(ages)
            tree.args['with_'].expressions.insert(at, cte)
            tree = eliminate_ctes(pushdown_projections(tree))
        assert tree.named_selects == original.named_selects
        for select in tree.find_all(exp.Select):
            for i, expression in enumerate(list(select.expressions)):
                if not isinstance(expression, exp.Alias):
                    select.expressions[i] = exp.alias_(expression.copy(), expression.alias_or_name or f'constant_{i}')
        for substring in list(tree.find_all(exp.Substring)):
            substring.replace(exp.Anonymous(this='SUBSTRING', expressions=[substring.this.copy(), substring.args['start'].copy(), substring.args['length'].copy()]))
        sql = re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))
        names = set(re.findall(r':(gea_p\d+)', sql))
        query['parameterSpec'] = {k: v for k, v in query['parameterSpec'].items() if k in names}
        query['request']['parameters'] = {k: v for k, v in query['request']['parameters'].items() if k in names}
        assert set(query['parameterSpec']) == names
        query['request']['sql'] = sql
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
