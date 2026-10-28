"""Share the full-chain landing order scan, preserving each pickup scope's aggregates."""
import copy
import json
import re
from pathlib import Path

import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]


def update(config):
    query = copy.deepcopy(config['queries']['orders.summary'])
    tree = sqlglot.parse_one(query['request']['sql'], dialect='postgres')
    filtered = next(cte for cte in tree.args['with'].expressions if cte.alias == 'filtered')
    filtered.this.select(exp.alias_(exp.column('pickup_type', table='r'), 'pickup_type'), copy=False)
    tree.select(exp.alias_(exp.column('pickup_type', table='r'), 'pickup_type'), copy=False)
    tree.group_by(exp.column('pickup_type', table='r'), copy=False)
    query['request']['sql'] = re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))
    query['title'] = '全链看板订单履约按提货类型汇总'
    query['grain'] = ['pickup_type']
    query['resultColumns'].append('pickup_type')
    config['queries']['overview.orders-by-pickup'] = query
    config['overviewOrderGroups'] = {
        'queryId': 'overview.orders-by-pickup',
        'views': {'factory-overview': '工厂', 'branch-overview': '分仓'},
    }


if __name__ == '__main__':
    path = ROOT / 'business/inventory-qll/sql.config.json'
    config = json.loads(path.read_text())
    update(config)
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
