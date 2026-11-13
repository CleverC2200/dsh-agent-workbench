"""Aggregate valid FC metric records; keep unknown/invalid SKU inputs out of both ratio terms."""
import json
from pathlib import Path
import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'business/inventory-fc/sql.config.json'
config = json.loads(path.read_text())
additive = {'recommended_qty', 'remaining_outbound_qty', 'target_inventory_qty',
            'calculation_daily', 'target_gap_qty', 'available_qty', 'order_adjusted_available_qty'}
for query in config['queries'].values():
    tree = sqlglot.parse_one(query['request']['sql'])
    changed = False
    for select in tree.find_all(exp.Select):
        if not {'missing_calculation_count', 'recommended_qty'}.issubset(select.named_selects):
            continue
        for item in list(select.expressions):
            if not isinstance(item, exp.Alias):
                continue
            name = item.alias
            value = None
            if name in additive and isinstance(item.this, exp.Case):
                sums = list(item.find_all(exp.Sum))
                if len(sums) == 1 and isinstance(sums[0].this, exp.Column) and sums[0].this.name == name:
                    column = sums[0].this.sql()

                    valid = f'{column} IS NOT NULL' if name == 'order_adjusted_available_qty' else f'{column} >= 0'
                    value = f'SUM(CASE WHEN {valid} THEN {column} END)'
            if name in {'missing_calculation_count', 'calculated_sku_count'} and item.find(exp.Count):
                count = 'COUNT(CASE WHEN r.recommended_qty >= 0 THEN 1 END)'
                value = 'COUNT(*) - ' + count if name == 'missing_calculation_count' else count
            if name == 'forecast_turnover_days' and item.find(exp.Sum) and any(c.name == 'daily_plan' for c in item.find_all(exp.Column)):
                valid = 'r.daily_plan >= 0 AND r.inventory_qty >= 0'
                value = f'SUM(CASE WHEN {valid} THEN r.inventory_qty END) / NULLIF(SUM(CASE WHEN {valid} THEN r.daily_plan END), 0)'
            if name == 'historical_turnover_days' and item.find(exp.Sum) and any(c.name == 'rolling_ship_daily' for c in item.find_all(exp.Column)):
                valid = 'r.rolling_ship_daily > 0 AND r.available_qty >= 0'
                value = f'SUM(CASE WHEN {valid} THEN r.available_qty END) / NULLIF(SUM(CASE WHEN {valid} THEN r.rolling_ship_daily END), 0)'
            if value:
                item.replace(sqlglot.parse_one('SELECT ' + value + ' AS ' + name).expressions[0])
                changed = True
    if changed:
        query['request']['sql'] = tree.sql()
path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
