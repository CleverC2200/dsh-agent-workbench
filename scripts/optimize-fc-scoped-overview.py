"""Keep scoped branch cards on compact, early-filtered summary queries."""
import importlib.util
import json
from pathlib import Path
from sqlglot import exp

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('fc_scope',ROOT/'scripts/update-fc-card-scope.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)

def update(config):
    for key in ['health.cards','health.inventory']:
        q=config['queries'][key];tree=base.parse(q['request']['sql'])
        predicate=base.parse("(:gea_p2 IS NULL OR :gea_p2 = '' OR b.warehouseid = :gea_p2)")
        for table in list(tree.find_all(exp.Table)):
            if table.name!='agents_scm_inventory_sku_data_d':continue
            select=table.find_ancestor(exp.Select)
            where=select.args.get('where')
            old=base.parse("(:gea_p2 = '' OR b.warehouseid = :gea_p2)")
            if where:
                for node in list(where.walk()):
                    if node==old:node.replace(predicate.copy())
            if not where or not any(node==predicate for node in where.walk()):
                select.where(predicate.copy(),append=True,copy=False)
        q['request']['sql']=base.render(tree)
        q['parameterSpec']['gea_p2']={'name':'warehouse_code','type':'string','nullable':True,'maxLength':100}
        q['request']['parameters']['gea_p2']=None
    for key in ['batch-age.groups','batch-age.atomic','batch-age.count']:
        q=config['queries'][key];tree=base.parse(q['request']['sql'])
        for table in list(tree.find_all(exp.Table)):
            if table.name not in ['agents_scm_inventory_sku_data_d','agents_scm_cust_deliv_daily_di']:continue
            field='warehouseid' if table.name=='agents_scm_inventory_sku_data_d' else 'warehouse'
            predicate=base.parse(f"(:gea_p4 IS NULL OR {table.alias_or_name}.{field} = :gea_p4)")
            select=table.find_ancestor(exp.Select)
            where=select.args.get('where')
            if not where or not any(node==predicate for node in where.walk()):
                select.where(predicate.copy(),append=True,copy=False)
        q['request']['sql']=base.render(tree)
    for view in config['sourceViews']['views']:
        if view['id']=='branch-stock':view['overviewFilterNames']=['warehouse_code']
    # The combined global quick read serialized all same-snapshot calculations.
    # Share the small snapshot-date request, then run stock/age/replenishment independently.
    config.pop('overviewQuickStock',None)
    return config

if __name__=='__main__':
    path=ROOT/'business/inventory-fc/sql.config.json'
    path.write_text(json.dumps(update(json.loads(path.read_text())),ensure_ascii=False,indent=2)+'\n')
