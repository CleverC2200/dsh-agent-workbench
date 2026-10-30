"""Select an entire published base/month version before filtering its SKUs."""
import json
from pathlib import Path

import sqlglot
from sqlglot import exp
from importlib import import_module

render = import_module('update-base-detail-metrics').render
ROOT = Path(__file__).resolve().parents[1]
WITH_KEY = 'with_' if 'with_' in exp.Select.arg_types else 'with'


def fix(sql):
    tree = sqlglot.parse_one(sql, read='postgres')
    changed = False
    for source in list(tree.find_all(exp.CTE)):
        if source.alias != 'target_source':
            continue
        if 'year_month' not in source.this.named_selects:
            source.this.select('t.year_month AS year_month', append=True, copy=False)
            changed = True
        siblings = source.parent.expressions
        if any(c.alias == 'target_versions' for c in siblings):
            continue
        targets = next((c for c in siblings if c.alias == 'targets'), None)
        if targets is None:
            raise ValueError('target_source has no targets consumer')
        old_where = source.this.args['where']
        old_version = next(node for node in old_where.find_all(exp.Or)
                           if any(p.name == 'gea_p2' for p in node.find_all(exp.Placeholder)))
        old_version.replace(sqlglot.parse_one("t.inventory_version = :gea_p2 OR (:gea_p2 = '纠偏' AND t.inventory_version = '月初') OR (:gea_p2 = '月初' AND t.inventory_version = '滚动')", read='postgres'))
        versions = sqlglot.parse_one("""WITH target_versions AS (
            SELECT t.year_month AS year_month, t.belong_base AS belong_base,
              MIN(CASE WHEN t.inventory_version = :gea_p2 THEN 0 ELSE 1 END) AS version_rank
            FROM target_source AS t GROUP BY t.year_month, t.belong_base)
            SELECT 1 AS marker""", read='postgres').args[WITH_KEY].expressions[0]
        siblings.insert(siblings.index(source) + 1, versions)
        keys = next((c for c in siblings if c.alias == 'target_keys'), None)
        if keys is not None:
            siblings.remove(keys)
        field_names = {'base': 'belong_base', 'sku': 'material_code',
                       'effective_version': 'inventory_version', 'target_rows': 'source_rows'}
        select_list = ', '.join(f"t.{field_names.get(alias, alias)} AS {alias}" for alias in targets.this.named_selects)
        targets.set('this', sqlglot.parse_one(f"""SELECT {select_list}
            FROM target_source AS t INNER JOIN target_versions AS v
              ON t.year_month = v.year_month AND t.belong_base = v.belong_base
              AND CASE WHEN t.inventory_version = :gea_p2 THEN 0 ELSE 1 END = v.version_rank""", read='postgres'))
        changed = True
    return render(tree) if changed else sql


def separate_stock_month(query):
    names = {spec['name']: key for key, spec in query['parameterSpec'].items()}
    if 'target_versions AS' not in query['request']['sql'] or 'stock_date' not in names:
        return
    tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
    key = names.get('stock_month', 'gea_p90')
    if 'stock_month' not in names:
        if key in query['parameterSpec']:
            raise ValueError('stock month parameter collision')
        query['parameterSpec'][key] = dict(name='stock_month', type='string', example='2026-10-01', required=True, nullable=False, format='YYYY-MM-01')
        query['request']['parameters'][key] = query['request']['parameters'][names['month']]
        tree.where(f"SUBSTRING(:{names['stock_date']},1,7)=SUBSTRING(:{key},1,7)", append=True, copy=False)
    for select in tree.find_all(exp.Select):
        source = select.args.get('from_', select.args.get('from'))
        if source is None or not isinstance(source.this, exp.Table) or source.this.name != 'agents_scm_stock_detail_d':
            continue
        for predicate in select.find_all(exp.EQ):
            if isinstance(predicate.this, exp.Column) and predicate.this.name == 'data_month':
                for parameter in predicate.find_all(exp.Placeholder):
                    if parameter.name == names['month']:
                        parameter.set('this', key)
    query['request']['sql'] = render(tree)


if __name__ == '__main__':
    for agent in ['aqkc', 'fc', 'qll']:
        path = ROOT / f'business/inventory-{agent}/sql.config.json'
        config = json.loads(path.read_text())
        count = 0
        for query in config['queries'].values():
            sql = fix(query['request']['sql'])
            if sql != query['request']['sql']:
                query['request']['sql'] = sql
                query['notes'] = str(query.get('notes', '')) + ' D101/D114：同一基地与月份整体选版，纠偏→月初、月初→滚动；已选版本缺SKU、NULL、0或重复均不借用另一版本字段。'
                count += 1
            separate_stock_month(query)
        path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
        print(agent, count)
