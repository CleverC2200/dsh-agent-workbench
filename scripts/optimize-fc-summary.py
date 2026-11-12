"""Read default-cycle aggregates from the same persisted rows as confirmation.

Keep the reference aggregate/filter expressions and parameter contract. Custom
cycles and dates continue through the existing branch-period calculation route.
"""
import copy
import json
import re
from pathlib import Path
import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]

def build(config):
    reference = config['queries']['snapshot.replenishment.summary']
    tree = sqlglot.parse_one(reference['request']['sql'])
    detail = sqlglot.parse_one(config['queries']['snapshot-default.replenishment.detail.atomic']['request']['sql'])
    source = next(c.this for c in detail.ctes if c.alias == 'list_source')
    projection = (source.args.get('from_') or source.args['from']).this.this.copy()
    assert isinstance(projection, exp.Select)
    fields = {x.alias_or_name: x for x in projection.expressions}
    measured = exp.select(*[exp.alias_(exp.column(k, 'r'), k) for k in fields]).from_(projection.subquery('r'))
    measured.select('CASE WHEN r.available_qty < 0 THEN NULL ELSE r.available_qty - r.calculation_order_remaining END AS order_adjusted_available_qty',
                    'r.current_order_shortage AS upstream_shortage_qty', append=True, copy=False)
    ctes = []
    for cte in tree.ctes:
        if cte.alias in ['quick_transfer_activity', 'fc_current_orders', 'filtered']:
            ctes.append(cte.copy())
        elif cte.alias == 'measured':
            ctes.append(exp.CTE(this=measured, alias=cte.args['alias'].copy()))
    tree.set('with_', exp.With(expressions=ctes))
    used = {p.name for p in tree.find_all(exp.Placeholder)}
    contract = []
    for key, spec in reference['parameterSpec'].items():
        if key not in used:
            value = f"CASE WHEN '' IN (:{key}) THEN 1 ELSE 0 END" if spec['type'] == 'array' else ':' + key
            contract.append(f'{value} AS bind_{key}')
    if contract:
        tree.args['with_'].append('expressions', exp.CTE(this=sqlglot.parse_one('SELECT '+', '.join(contract)), alias=exp.TableAlias(this=exp.to_identifier('parameter_contract'))))
    fast = copy.deepcopy(reference)
    fast['request']['sql'] = re.sub(r'\bCOUNT\(\*\)', 'COUNT(1)', tree.sql())
    config['queries']['snapshot-default.replenishment.summary'] = fast
    config['queries']['replenishment.summary']['summaryRoute']['defaultQueryId'] = 'snapshot-default.replenishment.summary'
    return config

if __name__ == '__main__':
    for agent in ['fc', 'qll']:
        path = ROOT / f'business/inventory-{agent}/sql.config.json'
        path.write_text(json.dumps(build(json.loads(path.read_text())), ensure_ascii=False, indent=2)+'\n')
