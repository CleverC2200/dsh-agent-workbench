"""Keep category workbench turnover, channel validity and prefetched SQL on the same definitions.

Run after regenerating source/snapshot SQL. Existing schemas, filters and public aliases stay intact.
"""
import json
import re
import copy
from pathlib import Path
import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'business/inventory-qll/sql.config.json'

def expression(sql):
    return sqlglot.parse_one('SELECT ' + sql, read='postgres').expressions[0]

def patch(sql):
    tree = sqlglot.parse_one(sql, read='postgres')
    changed = False
    base_sources = set()
    for cte in tree.find_all(exp.CTE):
        select = cte.this
        if not isinstance(select, exp.Select):
            continue
        fields = {e.alias_or_name: e for e in select.expressions}
        if not {'organization','inventory','daily','sku'} <= fields.keys():
            continue
        source = fields['organization'].this
        if isinstance(source, exp.Column) and source.table == 'r' and source.name == 'base':
            base_sources.add(cte.alias)
            if fields['daily'].this.sql() != 'r.daily_demand':
                fields['daily'].replace(expression('r.daily_demand AS daily'))
                changed = True
            if 'target_daily' not in fields:
                select.select('r.daily_demand AS target_daily', append=True, copy=False)
                changed = True
        elif isinstance(source, exp.Column) and source.table == 'r' and source.name == 'warehouseid':
            for name, value in {
                'turnover_qty': 'CASE WHEN r.daily_movement > 0 AND r.available_qty >= 0 THEN r.available_qty ELSE NULL END',
                'daily': 'CASE WHEN r.daily_movement > 0 AND r.available_qty >= 0 THEN r.daily_movement ELSE NULL END',
            }.items():
                replacement = expression(value + ' AS ' + name)
                if fields[name] != replacement:
                    fields[name].replace(replacement)
                    changed = True
        elif isinstance(source, exp.Column) and source.table == 'r' and source.name == 'province':
            replacements = {
                'inventory': 'CASE WHEN r.inventory >= 0 THEN r.inventory ELSE NULL END',
                'target': 'CASE WHEN r.inventory >= 0 AND r.analysis_target_inventory >= 0 THEN r.analysis_target_inventory ELSE NULL END',
                'gap': 'CASE WHEN r.inventory >= 0 AND r.analysis_target_inventory >= 0 THEN r.inventory - r.analysis_target_inventory ELSE NULL END',
                'risk': "CASE WHEN r.inventory IS NULL OR r.inventory < 0 THEN '待核实' WHEN r.inventory < r.analysis_target_inventory THEN '库存偏低' WHEN r.inventory > r.analysis_target_inventory THEN '库存偏高' WHEN r.analysis_target_inventory IS NULL THEN '无目标' ELSE '正常' END",
            }
            for name, value in replacements.items():
                replacement = expression(value + ' AS ' + name)
                if fields[name] != replacement:
                    fields[name].replace(replacement)
                    changed = True
    for select in tree.find_all(exp.Select):
        source = (select.args.get('from_') or select.args.get('from'))
        if source and isinstance(source.this, exp.Table) and source.this.name in base_sources:
            for value in select.expressions:
                if value.alias_or_name in ['target_turnover_qty','target_daily']:
                    alias = source.this.alias_or_name
                    field = 'target' if value.alias_or_name == 'target_turnover_qty' else 'daily'
                    replacement = expression(f'SUM(CASE WHEN {alias}.inventory >= 0 AND {alias}.target >= 0 AND {alias}.daily >= 0 THEN {alias}.{field} ELSE NULL END) AS {value.alias_or_name}')
                    if value != replacement:
                        value.replace(replacement)
                        changed = True
        fields = {e.alias_or_name: e for e in select.expressions}
        where = select.args.get('where')
        if (where and 'daily_movement' in fields and
                any(l.is_string and l.this == 'BRANCH_TREE' for l in where.find_all(exp.Literal))):
            # The same daily batch has exactly one DEFAULT row per warehouse/SKU.
            # LEFT JOIN retains stock/age rows even when movement is unknown.
            if not any(t.alias_or_name == 'movement' for t in select.find_all(exp.Table)):
                select.join("agents_inv_branch_sku_day AS movement", join_type='LEFT',
                            on="movement.inv_batch_id = m.inv_batch_id AND movement.inv_variant_id = 'BRANCH_DEFAULT' AND movement.warehouseid = m.warehouseid AND movement.sku = m.sku", copy=False)
                fields['daily_movement'].replace(expression('CAST(movement.rolling_ship_daily AS DECIMAL(38, 7)) AS daily_movement'))
                changed = True
    return tree.sql() if changed else sql

def update(config):
    for query in config['queries'].values():
        query['request']['sql'] = query['request']['sql'].replace('BASE_CHAIN_SUMMARY:', 'BASE_STOCK:').replace('BASE_METRICS:qll:', 'BASE_STOCK:')
        if 'chain_age AS' in query['request']['sql']:
            tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
            for cte in tree.find_all(exp.CTE):
                if cte.alias == 'chain_age':
                    for literal in cte.find_all(exp.Literal):
                        if literal.is_string and literal.this == 'CHAIN_COMPARISON':
                            literal.set('this', 'BASE_AGE')
            query['request']['sql'] = tree.sql()
    for query_id in ['category-tree.base','snapshot.category-tree.base','category-tree.customer',
                     'category-tree.branch','snapshot.category-tree.branch','summary.first-screen','summary.bootstrap']:
        query = config['queries'][query_id]
        sql = patch(query['request']['sql'])
        if query_id in ['summary.first-screen','summary.bootstrap']:
            sql = re.sub(r'\bCOUNT\s*\(\s*\*\s*\)', 'COUNT(1)', sql, flags=re.I)
        query['request']['sql'] = sql
    config['queries']['category-tree.branch']['summaryRoute']['kind'] = 'age-movement'
    for member in config['dailySummary']['bundle']['members']:
        if member['queryId'] == 'snapshot.category-tree.branch':
            member['values']['batch_rolling_start'] = {'snapshotValue':'rollingStart','format':'YYYYMMDD'}
            member['values']['batch_end_exclusive'] = {'snapshotValue':'nextDay','format':'YYYYMMDD'}
    branch_organization(config)
    return config

def branch_organization(config):
    # Organization drill rows must retain the branch workbench stock/movement pool.
    for prefix, suffix in [(p, s) for p in ['', 'snapshot.'] for s in ['groups', 'atomic']]:
        query = copy.deepcopy(config['queries'][prefix + 'batch-age.' + suffix])
        tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
        if prefix:
            facts = next(c for c in tree.ctes if c.alias == 'batch_facts')
            facts.set('this', facts.this.expression.copy())
            select = facts.this
            select.join('agents_inv_branch_sku_day AS movement', join_type='LEFT',
                        on="movement.inv_batch_id = m.inv_batch_id AND movement.inv_variant_id = 'BRANCH_DEFAULT' AND movement.warehouseid = m.warehouseid AND movement.sku = m.sku", copy=False)
            for field in select.expressions:
                if field.alias_or_name == 'daily_movement':
                    field.replace(expression('CAST(movement.rolling_ship_daily AS DECIMAL(38, 7)) AS daily_movement'))
        else:
            for node in list(tree.find_all(exp.In)):
                if isinstance(node.this, exp.Column) and node.this.name == 'warehouse_classify':
                    node.replace(exp.EQ(this=node.this.copy(), expression=exp.Literal.string('20')))
            for select in tree.find_all(exp.Select):
                source = select.args.get('from_') or select.args.get('from')
                if source and isinstance(source.this, exp.Table) and source.this.name == 'agents_scm_inventory_sku_data_d':
                    select.where("b.warehouseid NOT IN ('Y204', 'N436')", append=True, copy=False)
        groups = next(c.this for c in tree.ctes if c.alias == 'batch_groups')
        for field in groups.expressions:
            if field.alias_or_name == 'historical_turnover':
                field.replace(expression('SUM(CASE WHEN b.daily_movement > 0 AND b.available_qty >= 0 THEN b.available_qty ELSE NULL END) * 1.0 / NULLIF(SUM(CASE WHEN b.daily_movement > 0 AND b.available_qty >= 0 THEN b.daily_movement ELSE NULL END), 0) AS historical_turnover'))
        query['request']['sql'] = tree.sql()
        query['title'] = '分仓组织库存与回顾周转'
        if not prefix:
            query['summaryRoute']['queryId'] = 'snapshot.branch-structure.' + suffix
        if suffix == 'groups':
            query['pagination']['atomicQuery'] = 'branch-structure.atomic'
        config['queries'][prefix + 'branch-structure.' + suffix] = query
    next(v for v in config['sourceViews']['views'] if v['id'] == 'branch-structure')['queryId'] = 'branch-structure.groups'

if __name__ == '__main__':
    config = json.loads(PATH.read_text())
    update(config)
    PATH.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
