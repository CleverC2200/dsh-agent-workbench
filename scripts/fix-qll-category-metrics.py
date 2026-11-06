"""Keep category actual turnover, channel validity and prefetched SQL on the same definitions.

Run after regenerating source/snapshot SQL. Existing schemas, filters and public aliases stay intact.
"""
import json
import re
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
            if fields['daily'].this.sql() == 'r.daily_demand':
                fields['daily'].replace(expression('r.rolling_ship_positive / 30.0 AS daily'))
                changed = True
            if 'target_daily' not in fields:
                select.select('r.daily_demand AS target_daily', append=True, copy=False)
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
                    for column in value.find_all(exp.Column):
                        if column.name == 'daily':
                            column.set('this', exp.to_identifier('target_daily'))
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
    for query_id in ['category-tree.base','snapshot.category-tree.base','category-tree.customer',
                     'snapshot.category-tree.branch','summary.first-screen','summary.bootstrap']:
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
    return config

if __name__ == '__main__':
    config = json.loads(PATH.read_text())
    update(config)
    PATH.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
