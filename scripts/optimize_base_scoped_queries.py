"""Keep base filters at source reads and calculate nested batch ordinals once."""
import json
import re
from pathlib import Path

import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]
WITH_KEY = 'with_' if 'with_' in exp.Select.arg_types else 'with'
FROM_KEY = 'from_' if 'from_' in exp.Select.arg_types else 'from'


def optimize(query):
    original = sqlglot.parse_one(query['request']['sql'], read='postgres')
    tree = original.copy()
    parameters = {spec['name']: key for key, spec in query['parameterSpec'].items()}
    enabled, bases = parameters['bases_enabled'], parameters['bases']
    for select in list(tree.find_all(exp.Select)):
        scope = select.args.get(WITH_KEY)
        if not scope:
            continue
        ctes = {cte.alias_or_name: cte for cte in scope.expressions}
        for name in ['target_source', 'inventory_batch_dates', 'base_daily_attributes']:
            cte = ctes.get(name)
            if cte is None:
                continue
            source = cte.this.args[FROM_KEY].this
            if not isinstance(source, exp.Table) or not source.name.startswith('agents_'):
                continue
            alias = source.alias_or_name
            predicate = sqlglot.parse_one(
                f'(:{enabled} = FALSE OR {alias}.belong_base IN (:{bases}))', read='postgres'
            )
            if not any(node == predicate for node in cte.this.find_all(exp.Paren)):
                cte.this.where(predicate, append=True, copy=False)
        if 'inventory_batch_ages' not in ctes or 'inventory_batch_ordinals' in ctes:
            continue
        dates, ages = ctes['inventory_batch_dates'], ctes['inventory_batch_ages']
        expression = next((e for e in ages.this.expressions if e.alias == 'age_days'), None)
        if expression is None:
            continue
        age = expression.this
        difference = age.args['ifs'][0].args['true']
        assert isinstance(difference, exp.Sub)
        snapshot, production = difference.this.copy(), difference.expression.copy()
        columns = [exp.alias_(exp.column(e.alias_or_name, 'd'), e.alias_or_name) for e in dates.this.expressions]
        ordinals = exp.select(*columns, exp.alias_(snapshot.copy(), 'snapshot_ordinal'), exp.alias_(production.copy(), 'production_ordinal')).from_('inventory_batch_dates AS d')
        ordinal_cte = exp.CTE(this=ordinals, alias=exp.TableAlias(this=exp.to_identifier('inventory_batch_ordinals')))
        age.replace(age.transform(lambda node: exp.column('snapshot_ordinal', 'd') if node == snapshot else exp.column('production_ordinal', 'd') if node == production else node))
        ages.this.args[FROM_KEY].this.set('this', exp.to_identifier('inventory_batch_ordinals'))
        scope.expressions.insert(scope.expressions.index(ages), ordinal_cte)
    assert tree.named_selects == original.named_selects == query['resultColumns']
    for substring in list(tree.find_all(exp.Substring)):
        substring.replace(exp.Anonymous(this='SUBSTRING', expressions=[substring.this.copy(), substring.args['start'].copy(), substring.args['length'].copy()]))
    sql = re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))
    assert set(re.findall(r':(gea_p\d+)', sql)) == set(query['parameterSpec'])
    return sql


def main():
    path = ROOT / 'business/inventory-aqkc/sql.config.json'
    config = json.loads(path.read_text())
    for query_id in ['page.inventory-groups', 'page.dashboard-groups', 'page.structure-groups', 'page.sku-detail', 'page.sku-detail.count', 'page.sku-detail.atomic']:
        query = config['queries'][query_id]
        query['request']['sql'] = optimize(query)
        assert optimize(query) == query['request']['sql']
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
