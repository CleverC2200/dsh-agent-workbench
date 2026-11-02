"""Reuse independent canonical inventory pools without a cross-pool OR scan."""
import copy
import json
import re
from pathlib import Path
import sqlglot
from sqlglot import exp
from sqlglot.optimizer.eliminate_ctes import eliminate_ctes
from sqlglot.optimizer.pushdown_projections import pushdown_projections

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'business/inventory-qll/sql.config.json'


def optimize(config):
    config = copy.deepcopy(config)
    queries = config['queries']
    ctes = []
    selections = []
    for prefix, source, inventory, label in [
        ('base', 'source.health-date', 'health.inventory', '基地'),
        ('branch', 'source.branch-stock-date', 'branch-health.inventory', '分仓'),
    ]:
        tree = sqlglot.parse_one(queries[source]['request']['sql'], dialect='postgres')
        latest = next(cte.this for cte in tree.find_all(exp.CTE) if cte.alias == 'latest')
        ctes.append(f'{prefix}_latest AS ({latest.sql()})')
        sql = queries[inventory]['request']['sql']
        date = "REPLACE(CAST(:gea_p1 AS VARCHAR(10)), '-', '')"
        if date not in sql:
            raise ValueError('CANONICAL_INVENTORY_DATE_CHANGED')
        sql = sql.replace(date, f'(SELECT l.day_key AS day_key FROM {prefix}_latest AS l)')
        sql = sql.replace(':gea_p2', 'NULL')
        ctes.append(f'{prefix}_quantities AS ({sql})')
        selections.append(f"""SELECT '{label}' AS location_type,
CONCAT(SUBSTRING(l.day_key,1,4),'-',SUBSTRING(l.day_key,5,2),'-',SUBSTRING(l.day_key,7,2)) AS snapshot_date,
q.row_count AS row_count, q.total_qty AS total_qty, q.available_qty AS available_qty,
q.pack_unit_qty AS pack_unit_qty, q.freeze_qty AS freeze_qty
FROM {prefix}_quantities AS q CROSS JOIN {prefix}_latest AS l WHERE l.day_key IS NOT NULL""")
    queries['overview.quick-stock']['request']['sql'] = 'WITH ' + ',\n'.join(ctes) + '\n' + ' UNION ALL '.join(selections)
    for query_id in ['overview.quick-stock', 'health.cards', 'branch-health.cards',
                     'branch-turnover.cards', 'base_shipments.summary', 'overview.orders-by-pickup']:
        queries[query_id]['priority'] = 30
    # Full-chain cards need movement, not recommendation calculations or plan targets.
    turnover = queries['branch-turnover.cards']
    tree = sqlglot.parse_one(turnover['request']['sql'], read='postgres')
    columns = ['row_count', 'rolling_ship_daily', 'historical_turnover_days', 'turnover_count']
    tree.set('expressions', [e for e in tree.expressions if e.alias_or_name in columns])
    tree = eliminate_ctes(pushdown_projections(tree))
    for substring in list(tree.find_all(exp.Substring)):
        substring.replace(exp.Anonymous(this='SUBSTRING', expressions=[substring.this.copy(), substring.args['start'].copy(), substring.args['length'].copy()]))
    sql = re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))
    names = set(re.findall(r':(gea_p\d+)', sql))
    turnover['request']['sql'] = sql
    turnover['parameterSpec'] = {k: v for k, v in turnover['parameterSpec'].items() if k in names}
    turnover['request']['parameters'] = {k: v for k, v in turnover['request']['parameters'].items() if k in names}
    turnover['resultColumns'] = tree.named_selects
    # The rendered cards use batch inventory; this target-stock summary is unused.
    config['overviewViewIds'] = [view for view in config['overviewViewIds'] if view != 'base']
    return config


if __name__ == '__main__':
    PATH.write_text(json.dumps(optimize(json.loads(PATH.read_text())), ensure_ascii=False, indent=2) + '\n')
