"""Keep stock dictionaries independent while retaining downstream customer order facts."""
import json
from pathlib import Path
import re
import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]
DEALER_TABLES = {'agents_order_execute_isontime_mi', 'agents_scm_shortage_trace_f'}

def clean(config):
    removed, changed = [], []
    for name in list(config['queries']):
        if name.startswith(('shortage.', 'tracking.', 'product_map.')):
            removed.append(name)
            del config['queries'][name]
            continue
        if name.startswith(('orders.', 'snapshot.orders.')):
            continue
        query = config['queries'][name]
        if not any(table in query['request']['sql'] for table in DEALER_TABLES):
            continue
        tree = sqlglot.parse_one(query['request']['sql'], read='postgres')
        for cte in list(tree.find_all(exp.CTE)):
            if cte.alias in {'order_material_dictionary', 'order_sku_names'}:
                cte.parent.set('expressions', [e for e in cte.parent.expressions if e is not cte])
            elif cte.alias == 'material_dictionary':
                cte.set('this', sqlglot.parse_one('''SELECT m.sku AS sku,
                  m.category AS category, CAST(NULL AS TEXT) AS item,
                  m.material_group AS material_group
                  FROM movement_material_dictionary AS m''', read='postgres'))
        for select in tree.find_all(exp.Select):
            for join in list(select.args.get('joins') or []):
                if isinstance(join.this, exp.Table) and join.this.name == 'order_sku_names':
                    select.set('joins', [j for j in select.args['joins'] if j is not join])

                    for expression in select.expressions:
                        if expression.alias == 'material_name':
                            expression.set('this', sqlglot.parse_one('''COALESCE(
                              CASE WHEN f.name_count = 1 THEN f.material_name END,
                              pm.material_name)''', read='postgres'))
        for sub in list(tree.find_all(exp.Substring)):
            sub.replace(exp.Anonymous(this='SUBSTRING', expressions=[sub.this.copy(), sub.args['start'].copy(), sub.args['length'].copy()]))
        query['request']['sql'] = re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))
        assert not any(table in query['request']['sql'] for table in DEALER_TABLES), name
        changed.append(name)
    config['fieldGaps'] = [g for g in config.get('fieldGaps', []) if g.get('id') != 'common.pickup-key']
    return {'removed': removed, 'changed': changed}

if __name__ == '__main__':
    path = ROOT / 'business/inventory-fc/sql.config.json'
    config = json.loads(path.read_text())
    print(json.dumps(clean(config), ensure_ascii=False))
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
