"""Keep base detail warning/filter and batch age statistics in the same SQL scope."""
import json
import re
from pathlib import Path

import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'business/inventory-aqkc/sql.config.json'


def parse(sql):
    return sqlglot.parse_one(sql, read='postgres')


def render(tree):
    for substring in list(tree.find_all(exp.Substring)):
        substring.replace(exp.Anonymous(this='SUBSTRING', expressions=[
            substring.this.copy(), substring.args['start'].copy(), substring.args['length'].copy()]))
    return re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))


def add(select, expression):
    value = parse(expression)
    if value.alias not in select.named_selects:
        select.select(value, append=True, copy=False)


def age_statistics(tree):
    for cte in tree.find_all(exp.CTE):
        if cte.alias == 'base_batch_stock':
            add(cte.this, 'SUM(CASE WHEN a.age_days IS NOT NULL AND a.live_qty > 0 THEN a.live_qty * a.age_days ELSE 0 END) AS age_weighted_sum')
            add(cte.this, 'SUM(CASE WHEN a.age_days IS NOT NULL AND a.live_qty > 0 THEN a.live_qty ELSE 0 END) AS age_qty')
    sources = {'base_batch_stock': 'b', 'stock_source': 's', 'aligned': 'a',
               'business_rows': 'r', 'filtered': 'r', 'stock_rows': 's', 'sku_rows': 'r'}
    for select in tree.find_all(exp.Select):
        owner = select.find_ancestor(exp.CTE)
        if owner and owner.alias == 'inventory_keys':
            continue
        if not {'inventory', 'current_stock'}.intersection(select.named_selects):
            continue
        source = select.args.get('from_')
        if not source or not isinstance(source.this, exp.Table):
            continue
        table = source.this.name
        # aligned starts with inventory_keys and joins stock_source.
        if table == 'inventory_keys':
            alias = 's'
        elif table in sources:
            alias = sources[table]
        else:
            continue
        if 'total' in select.named_selects:
            continue
        for field in ['age_weighted_sum', 'age_qty']:
            add(select, f'{alias}.{field} AS {field}')


def update(config):
    source = (ROOT / 'business/inventory-aqkc/current-orders-source.sql').read_text().strip().rstrip(';')
    pending = parse(f"""WITH detail_shortage_source AS ({source}),
        detail_order_presence AS (SELECT COUNT(*) AS source_order_count FROM agents_scm_execute_detail_d),
        detail_pending AS (
          SELECT d.belong_base AS base, d.material_code AS sku,
            CASE WHEN COUNT(d.demand_qty)=COUNT(*) THEN SUM(d.demand_qty) END AS demand,
            CASE WHEN COUNT(d.allocated_qty)=COUNT(*) THEN SUM(d.allocated_qty) END AS allocated,
            CASE WHEN SUM(d.invalid_sku)=0 THEN SUM(d.shortage_qty) END AS shortage,
            SUM(d.invalid_sku) AS invalid
          FROM detail_shortage_source AS d WHERE d.location_type='基地'
          GROUP BY d.belong_base,d.material_code)
        SELECT 1 AS marker""").args['with_'].expressions
    risk = """CASE WHEN p.source_order_count > 0 AND o.invalid=0 AND o.shortage > 0 THEN '缺货'
        WHEN s.inventory < s.target THEN '库存偏低'
        WHEN s.inventory > s.target THEN '库存偏高'
        WHEN s.target IS NULL THEN '无目标'
        WHEN s.inventory IS NULL THEN '-' ELSE '正常' END"""
    # Add the current-order join inside stock_rows so detail, count and atomic
    # pagination all filter the same classified SKU set.
    for name in ['page.sku-detail', 'page.sku-detail.count', 'page.sku-detail.atomic']:
        query = config['queries'][name]
        tree = parse(query['request']['sql'])
        age_statistics(tree)
        # Existing queries already have the join; refresh their source as well.
        for cte in tree.find_all(exp.CTE):
            if cte.alias == 'detail_shortage_source':
                cte.set('this', parse(source))
            if cte.alias == 'detail_pending':
                cte.set('this', pending[-1].this.copy())
        for cte in list(tree.find_all(exp.CTE)):
            if cte.alias != 'stock_rows' or 'current_shortage' in cte.this.named_selects:
                continue
            original = cte.this.copy()
            fields = [f's.{f} AS {f}' for f in original.named_selects if f != 'risk']
            fields.append(f'{risk} AS risk')
            for field in ['demand', 'allocated', 'shortage']:
                fields.append(f'CASE WHEN p.source_order_count > 0 AND COALESCE(o.invalid,0)=0 THEN COALESCE(o.{field},0) END AS current_{field}')
            wrapped = parse('SELECT '+', '.join(fields)+' FROM ('+render(original)+') AS s LEFT JOIN detail_pending AS o ON o.base=s.base AND o.sku=s.sku CROSS JOIN detail_order_presence AS p')
            wrapped.set('with_', exp.With(expressions=[c.copy() for c in pending]))
            cte.set('this', wrapped)
        for cte in tree.find_all(exp.CTE):
            if cte.alias == 'stock_rows':
                for expression in list(cte.this.expressions):
                    if expression.alias in ['current_demand', 'current_allocated']:
                        field = expression.alias.removeprefix('current_')
                        expression.replace(parse(f'CASE WHEN p.source_order_count > 0 THEN CASE WHEN o.sku IS NULL THEN 0 ELSE o.{field} END END AS current_{field}'))
        # An open-order SKU can have neither stock nor a target. Keep it visible
        # so parent order totals still reconcile with the SKU drill-down.
        for cte in list(tree.find_all(exp.CTE)):
            if cte.alias == 'inventory_keys' and 'detail_pending' not in render(cte.this):
                original = cte.this.copy()
                cte.set('this', parse('SELECT k.base AS base,k.sku AS sku FROM ('+render(original)+') AS k UNION ALL SELECT o.base AS base,o.sku AS sku FROM detail_pending AS o LEFT JOIN ('+render(original)+') AS k ON k.base=o.base AND k.sku=o.sku WHERE k.sku IS NULL AND o.sku IS NOT NULL'))
        for select in tree.find_all(exp.Select):
            source_from = select.args.get('from_')
            if not source_from or not isinstance(source_from.this, exp.Table):
                continue
            table = source_from.this.name
            if table == 'stock_rows':
                # Replace the old inventory-only CASE in the filter, not the
                # unrelated legacy risk_mode predicate inside stock sources.
                where = select.args.get('where')
                if where:
                    for case in list(where.find_all(exp.Case)):
                        if any(c.name == 'target' for c in case.find_all(exp.Column)):
                            case.replace(exp.column('risk', table='s'))
            if table in ['stock_rows', 'sku_rows'] and 'total' not in select.named_selects:
                alias = source_from.this.alias_or_name
                for field in ['current_demand', 'current_allocated', 'current_shortage']:
                    add(select, f'{alias}.{field} AS {field}')
        if name.endswith('.atomic'):
            for field in ['age_weighted_sum', 'age_qty', 'current_demand', 'current_allocated', 'current_shortage']:
                add(tree, f'p.{field} AS {field}')
        query['request']['sql'] = render(tree)
        query['resultColumns'] = tree.named_selects
        spec = query['parameterSpec']['gea_p3001']
        # Older cached callers may still send the former label.
        query['request']['sql'] = query['request']['sql'].replace("'缺失目标'", "'无目标'")
        if 'enum' in spec:
            spec['enum'] = list(dict.fromkeys(['无目标' if v == '缺失目标' else v for v in spec['enum']]))
    for name in ['page.dashboard-groups', 'page.structure-groups']:
        query = config['queries'][name]
        tree = parse(query['request']['sql'])
        # The base total includes all categories; the drill must not silently
        # remove a category with open orders from that same base.
        where = tree.args.get('where')
        if name == 'page.structure-groups' and where:
            for comparison in list(where.find_all(exp.NEQ)):
                if any(value.this == '饺鲜说' for value in comparison.find_all(exp.Literal)):
                    comparison.replace(exp.true())
        age_statistics(tree)
        add(tree, 'SUM(g.age_weighted_sum) AS age_weighted_sum')
        add(tree, 'SUM(g.age_qty) AS age_qty')
        for field, condition in [('low_stock_count', 'g.inventory < g.target'),
                                 ('high_stock_count', 'g.inventory > g.target'),
                                 ('missing_target_count', 'g.target IS NULL')]:
            add(tree, f'SUM(CASE WHEN {condition} THEN 1 ELSE 0 END) AS {field}')
        query['request']['sql'] = render(tree)
        query['resultColumns'] = tree.named_selects
    return config


if __name__ == '__main__':
    PATH.write_text(json.dumps(update(json.loads(PATH.read_text())), ensure_ascii=False, indent=2)+'\n')
