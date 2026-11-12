"""Return whole-filter totals in the existing page/count statement."""
import json
import re
from pathlib import Path

import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'business/inventory-fc/sql.config.json'
config = json.loads(path.read_text())
replenishment = [
    'inventory_qty', 'available_qty', 'occupied_qty', 'frozen_qty',
    'target_inventory_qty', 'recommended_qty', 'rolling_ship_daily',
    'open_transfer_reported_qty', 'in_transit', 'preparing', 'daily_plan',
    'last_month_actual_qty', 'current_day_avg_qty', 'month_out_plan', 'future30_qty',
    'warehouse_month_transfer_plan', 'month_ship_positive', 'month_ship_net',
    'rolling_ship_positive', 'planned_daily_shipment', 'remaining_outbound_qty',
    'period_current_out', 'period_current_transfer', 'period_next_out',
    'period_next_transfer', 'current_order_demand', 'current_order_allocated',
    'current_order_remaining', 'current_order_shortage', 'expected_month_end_qty',
    'period_remaining_out', 'period_current_daily', 'period_next_daily',
    'calculation_daily', 'target_gap_qty',
]
groups = {
    **{query: replenishment for query in [
        'replenishment.detail.atomic', 'snapshot.replenishment.detail.atomic',
        'snapshot-default.replenishment.detail.atomic',
    ]},
    'branch-plan.detail.atomic': [
        'period_current_out', 'period_current_transfer', 'period_next_out',
        'period_next_transfer', 'last_month_actual_qty', 'current_day_avg_qty',
    ],
    **{query: ['sku_count', 'ordered', 'demand', 'allocated', 'shipped', 'remaining', 'shortage']
       for query in ['branch-current-orders.page', 'snapshot.branch-current-orders.page']},
}
for query_id, fields in groups.items():
    query = config['queries'][query_id]
    fields = [field for field in fields if field in query['resultColumns']]
    tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
    source = (tree.args.get('from_') or tree.args['from']).this
    aggregate = next(cte.this for cte in tree.ctes if cte.alias == source.name)
    alias = (aggregate.args.get('from_') or aggregate.args['from']).this.alias_or_name
    summaries = {field: 'scope_' + field for field in fields}
    changed = False
    for field, output in summaries.items():
        if output not in aggregate.named_selects:
            changed = True
            aggregate.select(
                f'CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM({alias}.{field}) END AS {output}',
                append=True, copy=False,
            )
        if output not in tree.named_selects:
            changed = True
            tree.select(f'{source.alias_or_name}.{output} AS {output}', append=True, copy=False)
        if output not in query['resultColumns']:
            query['resultColumns'].append(output)
    query['scopeSummaryColumns'] = summaries
    sql = tree.sql() if changed else query['request']['sql']
    if query_id in [
        'replenishment.detail.atomic', 'snapshot.replenishment.detail.atomic',
        'snapshot-default.replenishment.detail.atomic',
    ]:

        sql = re.sub(r'\bCOUNT\s*\(\s*\*\s*\)', 'COUNT(1)', sql, flags=re.I)
    query['request']['sql'] = sql
for query_id in ['summary.first-screen', 'summary.bootstrap']:
    query = config['queries'][query_id]
    query['request']['sql'] = re.sub(
        r'\bCOUNT\s*\(\s*\*\s*\)', 'COUNT(1)', query['request']['sql'], flags=re.I,
    )
path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
