"""Add additive batch-age measures without changing inventory pools or expiry rules."""
import json
import re
from pathlib import Path

import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]


def project(select, expressions):
    names = {sqlglot.parse_one(item, read='postgres').alias for item in expressions}
    select.set('expressions', [e for e in select.expressions if e.alias not in names]
               + [sqlglot.parse_one(item, read='postgres') for item in expressions])


def render(tree):
    # Keep gateway-compatible named parameters and SUBSTRING call syntax.
    for node in list(tree.find_all(exp.Substring)):
        node.replace(exp.Anonymous(this='SUBSTRING', expressions=[
            node.this.copy(), node.args['start'].copy(), node.args['length'].copy()]))
    return re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))


def update(config):
    if config['agentId'] == 'inventory-aqkc':
        # Base age cards and drilldowns must describe the same base pool as QLL.
        for key in ['source.health-date', 'health.cards', 'page.health-groups', 'batch-age.groups', 'batch-age.atomic']:
            query = config['queries'][key]
            tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
            for table in tree.find_all(exp.Table):
                if table.name != 'agents_scm_inventory_sku_data_d':
                    continue
                select = table.find_ancestor(exp.Select)
                predicate = sqlglot.parse_one(f"{table.alias_or_name}.warehouse_classify IN ('01', '02')", read='postgres')
                where = select.args.get('where')
                if not where or not any(node == predicate for node in where.walk()):
                    select.where(predicate, append=True, copy=False)
            query['request']['sql'] = render(tree)
    detail = sqlglot.parse_one(config['queries']['batch-age.groups']['request']['sql'], read='postgres')
    age_cte = next(c for c in detail.find_all(exp.CTE) if c.alias == 'inventory_batch_ages')
    valid_age = next(e for e in age_cte.this.expressions if e.alias == 'age_days')
    for key in ['health.cards', 'branch-health.cards', 'page.health-groups']:
        if key not in config['queries']:
            continue
        query = config['queries'][key]
        tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
        ctes = {c.alias: c.this for c in tree.find_all(exp.CTE)}
        ages = ctes['inventory_batch_ages']
        age = valid_age.copy()
        if 'inventory_batch_ordinals' in ctes:
            difference = age.this.args['ifs'][0].args['true']
            snapshot, production = difference.this.copy(), difference.expression.copy()
            age = age.transform(lambda node: exp.column('snapshot_ordinal', 'd') if node == snapshot
                                else exp.column('production_ordinal', 'd') if node == production else node)
        ages.set('expressions', [age if e.alias == 'age_days' else e for e in ages.expressions])
        group = key == 'page.health-groups'
        totals = ctes['batch_skus' if group else 'inventory_batch_totals']
        project(totals, [
            'SUM(CASE WHEN a.age_days IS NOT NULL THEN a.live_qty * a.age_days ELSE 0 END) AS weighted_age_sum',
            'SUM(CASE WHEN a.age_days IS NOT NULL THEN a.live_qty ELSE 0 END) AS age_weight_qty',
            'SUM(CASE WHEN a.live_qty > 0 AND a.age_days IS NULL THEN a.live_qty ELSE 0 END) AS unknown_age_qty',
        ])
        alias = 'b' if group else 'r'
        project(tree, [
            f'COALESCE(SUM({alias}.weighted_age_sum), 0) AS weighted_age_sum',
            f'COALESCE(SUM({alias}.age_weight_qty), 0) AS age_weight_qty',
            f'COALESCE(SUM({alias}.unknown_age_qty), 0) AS unknown_age_qty',
            f'SUM({alias}.weighted_age_sum) * 1.0 / NULLIF(SUM({alias}.age_weight_qty), 0) AS average_age',
        ])
        query['request']['sql'] = render(tree)
        query['resultColumns'] = [e.alias for e in tree.expressions]
    for view in config['sourceViews']['views']:
        if view.get('queryId') != 'batch-age.groups':
            continue
        for col in view['columns']:
            if col['field'] == 'max_age' and col.get('valueField') == 'average_age':
                col['field'] = 'average_age'
        for field, label in [('average_age', '平均货龄（天）'), ('max_age', '最大货龄（天）')]:
            if not any(c['field'] == field for c in view['columns']):
                view['columns'].append({'field': field, 'valueField': field, 'label': label, 'format': 'decimal2'})


if __name__ == '__main__':
    for agent in ['aqkc', 'fc', 'qll']:
        path = ROOT / f'business/inventory-{agent}/sql.config.json'
        config = json.loads(path.read_text())
        update(config)
        path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
