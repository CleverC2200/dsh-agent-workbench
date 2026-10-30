"""Filter the complete authorized replenishment scope before counts and paging."""
import json
import copy
import re
import sqlglot
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'business/inventory-fc/sql.config.json'
config = json.loads(path.read_text())
detail = config['queries']['replenishment.detail']
canonical = sqlglot.parse_one(detail['request']['sql'], read='postgres')
canonical_ctes = {cte.alias_or_name: cte for cte in canonical.find_all(sqlglot.exp.CTE)}
for query_id, query in config['queries'].items():
    if not query_id.startswith(('replenishment.', 'replenishment-suggestions.')):
        continue
    sql = query['request']['sql']
    if ' AS quick_orders ON ' in sql:
        continue
    tree = sqlglot.parse_one(sql, read='postgres')
    # Count/summary optimizers prune unused intermediate columns. Restore the
    # existing detail projections needed by the new full-scope business filter.
    by_name = {cte.alias_or_name: cte for cte in tree.find_all(sqlglot.exp.CTE)}
    for name, cte in by_name.items():
        source = canonical_ctes.get(name)
        if source is None or not isinstance(cte.this, sqlglot.exp.Select):
            continue
        present = {expression.alias_or_name for expression in cte.this.expressions}
        for expression in source.this.expressions:
            if expression.alias_or_name not in present:
                cte.this.append('expressions', expression.copy())
    for substring in list(tree.find_all(sqlglot.exp.Substring)):
        substring.replace(sqlglot.exp.Anonymous(this='SUBSTRING', expressions=[substring.this.copy(), substring.args['start'].copy(), substring.args['length'].copy()]))
    sql = re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))
    for key, spec in detail['parameterSpec'].items():
        if ':' + key in sql and key not in query['parameterSpec']:
            query['parameterSpec'][key] = copy.deepcopy(spec)
            query['request']['parameters'][key] = copy.deepcopy(detail['request']['parameters'][key])
    marker = 'FROM measured AS r WHERE '
    if sql.count(marker) != 1:
        raise ValueError('Missing filter boundary: ' + query_id)
    key = "CONCAT(CAST(LENGTH(r.warehouse_code) AS VARCHAR), ':', r.warehouse_code, r.sku)"
    condition = f'''(:gea_p3900=FALSE OR (r.recommended_qty>0 AND {key} NOT IN (:gea_p3904)) OR {key} IN (:gea_p3902) OR {key} IN (:gea_p3903)) AND
(:gea_p3901=FALSE OR r.inventory_qty>0 OR quick_orders.demand_qty>0 OR quick_orders.shortage_qty>0
 OR r.month_out_plan>0 OR r.future30_qty>0 OR r.warehouse_month_transfer_plan>0 OR r.rolling_ship_daily>0 OR {key} IN (:gea_p3905)) AND '''
    sql = sql.replace(marker, "FROM measured AS r LEFT JOIN fc_current_orders AS quick_orders ON quick_orders.location_type='分仓' AND quick_orders.warehouseid=r.warehouse_code AND quick_orders.material_code=r.sku WHERE " + condition)
    query['request']['sql'] = sql
    for param, name, kind, default in [
        ('gea_p3900', 'needed_only', 'boolean', False),
        ('gea_p3901', 'business_only', 'boolean', False),
        ('gea_p3902', 'positive_actual_keys', 'array', ['']),
        ('gea_p3903', 'positive_plan_keys', 'array', ['']),
        ('gea_p3904', 'zero_plan_keys', 'array', ['']),
        ('gea_p3905', 'business_plan_keys', 'array', ['']),
    ]:
        query['parameterSpec'][param] = {'name': name, 'type': kind, 'nullable': False, 'required': True}
        query['request']['parameters'][param] = default
path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
