"""Keep repeated target facts once only when each aggregate input fully agrees."""
import json
import re
from pathlib import Path

import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]


def factor_aggregates(select):
    """Evaluate each aggregate once; outer agreement checks reference its alias."""
    group = select.args.get('group')
    if group is None:
        return select
    aggregates = {}
    for projection in select.expressions:
        for aggregate in projection.find_all(exp.AggFunc):
            aggregates.setdefault(aggregate.sql(), aggregate.copy())
    aliases = {key: f'target_metric_{i}' for i, key in enumerate(aggregates)}
    keys = {column.sql(): column.name for column in group.expressions}
    inner = select.copy()
    inner.set('expressions', [exp.alias_(column.copy(), column.name)
        for column in group.expressions] + [exp.alias_(value, aliases[key])
        for key, value in aggregates.items()])

    def reference(node):
        if isinstance(node, exp.AggFunc):
            return exp.column(aliases[node.sql()], 'target_values')
        if isinstance(node, exp.Column) and node.sql() in keys:
            return exp.column(keys[node.sql()], 'target_values')
        return node

    return exp.select(*[projection.transform(reference)
        for projection in select.expressions]).from_(inner.subquery('target_values'))


def normalize(sql):
    tree = sqlglot.parse_one(sql, read='postgres')
    changed = False
    for source in list(tree.find_all(exp.CTE)):
        if source.alias != 'target_source':
            continue
        guards = []
        for case in source.find_all(exp.Case):
            branches = case.args.get('ifs', [])
            if len(branches) != 1:
                continue
            condition = branches[0].this
            if (isinstance(condition, exp.EQ) and isinstance(condition.this, exp.Count)
                    and isinstance(condition.this.this, exp.Star)
                    and condition.expression == exp.Literal.number(1)):
                guards.append(case)
        if not guards:
            continue
        target_fields = sorted({node.name for node in source.find_all(exp.Column)
            if node.table == 't' and node.name in {
                'target_inventory', 'management_target_inventory', 'final_target_inventory'}})
        for case in guards:
            case.replace(case.args['ifs'][0].args['true'].copy())
        daily_fallbacks = [node for node in source.find_all(exp.Coalesce)
            if isinstance(node.this, exp.Max) and isinstance(node.this.this, exp.Column)
            and node.this.this.name == 'avg_daily_planned_demand']
        for maximum in list(source.find_all(exp.Max)):
            value = maximum.this.sql(dialect='postgres')
            agreement = sqlglot.parse_one(
                f'SELECT CASE WHEN COUNT({value}) = COUNT(*) '
                f'AND COUNT(DISTINCT {value}) = 1 THEN MAX({value}) ELSE NULL END AS agreed',
                read='postgres').expressions[0].this
            maximum.replace(agreement)
        # A conflicting published daily value must not masquerade as a missing
        # value and select a plan-based fallback.
        for fallback in daily_fallbacks:
            permitted = sqlglot.parse_one('SELECT COUNT(t.avg_daily_planned_demand) = 0 '
                'OR (COUNT(t.avg_daily_planned_demand) = COUNT(*) '
                'AND COUNT(DISTINCT t.avg_daily_planned_demand) = 1)',
                read='postgres').expressions[0]
            fallback.replace(exp.Case(ifs=[exp.If(this=permitted,
                true=fallback.copy())], default=exp.Null()))
        # The three target priorities form one decision: conflicts cannot fall
        # through to a different priority after aggregation turns them NULL.
        if target_fields:
            valid = ' AND '.join(f'(COUNT(t.{name}) = 0 OR '
                f'(COUNT(t.{name}) = COUNT(*) AND COUNT(DISTINCT t.{name}) = 1))'
                for name in target_fields)
            condition = sqlglot.parse_one('SELECT ' + valid, read='postgres').expressions[0]
            for projection in source.this.expressions:
                if projection.alias_or_name in target_fields:
                    projection.set('this', exp.Case(ifs=[exp.If(this=condition.copy(),
                        true=projection.this.copy())], default=exp.Null()))
        source.set('this', factor_aggregates(source.this))
        changed = True
    if not changed:
        return sql
    for substring in list(tree.find_all(exp.Substring)):
        substring.replace(exp.Anonymous(this='SUBSTRING', expressions=[substring.this.copy(),
            substring.args['start'].copy(), substring.args['length'].copy()]))
    return re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))


if __name__ == '__main__':
    for agent in ['aqkc', 'fc', 'qll']:
        path = ROOT / f'business/inventory-{agent}/sql.config.json'
        config = json.loads(path.read_text())
        count = 0
        for query in config['queries'].values():
            before = query['request']['sql']
            after = normalize(before)
            if before != after:
                query['request']['sql'] = after
                query['notes'] = str(query.get('notes', '')) + ' 同月/版本/基地/SKU的重复目标逐字段核一致性；全非空且唯一值才取一次，冲突或空值混合保留未知，不累加重复目标。'
                count += 1
        if count:
            path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
        print(agent, count)
