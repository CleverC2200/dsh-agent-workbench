"""D120: net same-warehouse/SKU/production-date entries before deriving batch ages."""
import json
import re
from pathlib import Path

import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]
FROM_KEY = 'from_' if 'from_' in exp.Select.arg_types else 'from'
QUANTITIES = {'live_qty', 'available_qty', 'pack_unit_qty', 'freeze_qty'}
KEYS = {'warehouse_classify', 'warehouseid', 'material_code', 'month_date', 'prod_date', 'belong_base'}


def net_batches(sql):
    tree = sqlglot.parse_one(sql, read='postgres')
    changed = False
    for cte in tree.find_all(exp.CTE):
        if cte.alias != 'inventory_batch_dates':
            continue
        select = cte.this
        source = select.args.get(FROM_KEY)
        if source is None or not isinstance(source.this, exp.Table) or source.this.name != 'agents_scm_inventory_sku_data_d':
            continue
        table = source.this
        alias = table.alias_or_name
        columns = {c.name for c in select.find_all(exp.Column) if c.table == alias}
        if 'live_qty' not in columns:
            continue
        keys = columns.intersection(KEYS)
        # Required by the date derivation and physical inventory grain, even for
        # a query whose display projection omits a dimension.
        keys.update({'warehouseid', 'material_code', 'month_date', 'prod_date'})
        columns.update(keys)
        projections = []
        for name in sorted(columns):
            field = f'{alias}.{name}'
            if name in keys:
                value = field
            elif name in QUANTITIES:
                value = f'SUM({field})'
            else:
                value = f"CASE WHEN COUNT(DISTINCT {field})=1 THEN MAX({field}) ELSE NULL END"
            projections.append(f'{value} AS {name}')
        balanced = sqlglot.parse_one('SELECT ' + ','.join(projections) + ' FROM agents_scm_inventory_sku_data_d AS ' + alias + ' GROUP BY ' + ','.join(f'{alias}.{name}' for name in sorted(keys)), read='postgres')
        if select.args.get('where'):
            balanced.set('where', select.args['where'].copy())
        source.set('this', exp.Subquery(this=balanced, alias=exp.TableAlias(this=exp.to_identifier(alias))))
        changed = True
    if not changed:
        return sql
    for substring in list(tree.find_all(exp.Substring)):
        substring.replace(exp.Anonymous(this='SUBSTRING', expressions=[substring.this.copy(), substring.args['start'].copy(), substring.args['length'].copy()]))
    return re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))


if __name__ == '__main__':
    for agent in ['aqkc', 'fc', 'qll']:
        path = ROOT / f'business/inventory-{agent}/sql.config.json'
        config = json.loads(path.read_text())
        count = 0
        for query in config['queries'].values():
            before = query['request']['sql']
            after = net_batches(before)
            if after != before:
                query['request']['sql'] = after
                query['notes'] = str(query.get('notes', '')) + ' D120：同仓库/SKU/生产日期/快照先按有符号数量汇总，再对净正批次计算货龄、分段及风险；不跨SKU、仓库或生产日期冲抵。'
                count += 1
        if count:
            path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
        print(agent, count)
