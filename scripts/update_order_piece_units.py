"""Refresh embedded order cohorts without regenerating unrelated paging or stock SQL."""
import json
import re
from pathlib import Path
import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'base': ROOT / 'business/inventory-aqkc/current-orders-source.sql',
    'branch': ROOT / 'business/inventory-fc/current-shortage-source.sql',
    'shared': ROOT / 'business/shared/current-shortage-source.sql',
}


def update(config):
    sources = {key: {cte.alias: cte for cte in sqlglot.parse_one(path.read_text(), read='postgres').ctes}
               for key, path in SOURCES.items()}
    for query in config['queries'].values():
        sql = query['request']['sql']
        if 'eligible_order_sku' not in sql:
            continue
        tree = sqlglot.parse_one(sql, read='postgres')
        changed = False
        for scope in tree.find_all(exp.With):
            ctes = {cte.alias: cte for cte in scope.expressions}
            if 'eligible_order_sku' not in ctes:
                continue
            cohort = 'shared'
            if 'current_order_lines' in ctes:
                cohort = 'branch' if any(c.name == 'bizflowstatus' for c in ctes['current_order_lines'].find_all(exp.Column)) else 'base'
            name = 'eligible_order_sku' if cohort == 'shared' else 'current_order_lines'
            fields = {'demand_qty', 'allocated_qty', 'remaining_qty', 'input_invalid'} if cohort == 'shared' else {'demand_qty', 'allocated_qty', 'unshipped'}
            replacements = {e.alias: e for e in sources[cohort][name].this.expressions}
            for expression in list(ctes[name].this.expressions):
                if expression.alias in fields and expression != replacements[expression.alias]:
                    expression.replace(replacements[expression.alias].copy())
                    changed = True
            if cohort == 'shared' and 'location_sku_demand' in ctes:
                replacements = {e.alias: e for e in sources[cohort]['location_sku_demand'].this.expressions}
                for expression in list(ctes['location_sku_demand'].this.expressions):
                    if expression.alias in {'demand_qty', 'allocated_qty', 'remaining_qty'} and expression != replacements[expression.alias]:
                        expression.replace(replacements[expression.alias].copy())
                        changed = True
        if changed:
            for item in list(tree.find_all(exp.Substring)):
                item.replace(exp.Anonymous(this='SUBSTRING', expressions=[item.this.copy(), item.args['start'].copy(), item.args['length'].copy()]))
            query['request']['sql'] = re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))
            query['notes'] = query.get('notes', '').split(' 订单需求、占用逐行')[0].split(' 订单需求、占用按业务')[0] + ' 订单需求、占用按业务单位转换率逐行换算为件；换算缺失或无效保持未知。'
    return config


def write_queries(path, config):
    # Preserve unrelated configuration formatting and any concurrent source edits.
    text = path.read_text()
    original = json.loads(text)['queries']
    for key, query in config['queries'].items():
        if original.get(key) == query:
            continue
        match = re.search(r'"' + re.escape(key) + r'"\s*:\s*', text)
        start = match.end()
        _, size = json.JSONDecoder().raw_decode(text[start:])
        encoded = json.dumps(query, ensure_ascii=False, indent=2).replace('\n', '\n    ')
        text = text[:start] + encoded + text[start + size:]
    path.write_text(text)


if __name__ == '__main__':
    for agent in ['aqkc', 'fc', 'qll', 'apsplan']:
        path = ROOT / f'business/inventory-{agent}/sql.config.json'
        write_queries(path, update(json.loads(path.read_text())))
