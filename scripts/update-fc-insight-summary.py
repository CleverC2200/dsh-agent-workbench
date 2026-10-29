"""Project branch dashboard evidence from the existing whole-scope replenishment read."""
import importlib.util
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('fc_scope',ROOT/'scripts/update-fc-card-scope.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)

def update(config):
    q=config['queries']['replenishment.summary']
    tree=base.parse(q['request']['sql'])
    ctes={c.alias:c.this for c in tree.ctes}
    additions={
        'measured': 'CASE WHEN r.available_qty < 0 THEN NULL ELSE r.available_qty-r.fc_remaining_orders END AS order_adjusted_available_qty',
        'filtered': 'r.order_adjusted_available_qty AS order_adjusted_available_qty',
    }
    for name,sql in additions.items():
        if 'order_adjusted_available_qty' not in ctes[name].named_selects:
            ctes[name].select(base.parse(sql),append=True,copy=False)
    expressions=[
        'CASE WHEN COUNT(r.order_adjusted_available_qty)=COUNT(*) THEN SUM(r.order_adjusted_available_qty) ELSE NULL END AS order_adjusted_available_qty',
        'SUM(r.order_adjusted_available_qty) AS known_order_adjusted_available_qty',
        'COUNT(*)-COUNT(r.order_adjusted_available_qty) AS missing_order_adjusted_count',
        'SUM(r.target_inventory_qty) AS known_target_inventory_qty',
        'COUNT(*)-COUNT(r.target_inventory_qty) AS missing_target_count',
        'SUM(CASE WHEN r.order_adjusted_available_qty IS NOT NULL AND r.target_inventory_qty IS NOT NULL THEN r.order_adjusted_available_qty-r.target_inventory_qty ELSE NULL END) AS known_inventory_deviation_qty',
        'SUM(CASE WHEN r.order_adjusted_available_qty IS NOT NULL THEN r.target_inventory_qty ELSE NULL END) AS comparable_target_inventory_qty',
        'SUM(CASE WHEN r.order_adjusted_available_qty IS NOT NULL AND r.target_inventory_qty IS NOT NULL THEN 1 ELSE 0 END) AS comparable_sku_count',
        'SUM(CASE WHEN r.order_adjusted_available_qty < 0 THEN 1 ELSE 0 END) AS known_shortage_sku_count',
    ]
    for sql in expressions:
        expression=base.parse(sql)
        if expression.alias not in tree.named_selects:tree.select(expression,append=True,copy=False)
    q['request']['sql']=base.render(tree)
    q['resultColumns']=tree.named_selects
    return config

if __name__=='__main__':
    path=ROOT/'business/inventory-fc/sql.config.json'
    path.write_text(json.dumps(update(json.loads(path.read_text())),ensure_ascii=False,indent=2)+'\n')
