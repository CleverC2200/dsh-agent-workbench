"""Keep full-chain base and branch queries on their own physical inventory pools."""
from pathlib import Path
import copy,json
ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'business/inventory-qll/sql.config.json'
config=json.loads(path.read_text())
branch=json.loads((ROOT/'business/inventory-fc/sql.config.json').read_text())
for name,query in list(config['queries'].items()):
    if name.startswith('health.') or name=='source.health-date':
        sql=query['request']['sql']
        sql=sql.replace('FROM agents_scm_inventory_sku_data_d AS b\nWHERE TRUE', "FROM agents_scm_inventory_sku_data_d AS b\nWHERE b.warehouse_classify IN ('01', '02')")
        sql=sql.replace('FROM agents_scm_inventory_sku_data_d AS b\n)', "FROM agents_scm_inventory_sku_data_d AS b\nWHERE b.warehouse_classify IN ('01', '02')\n)")
        query['request']['sql']=sql
    if name.startswith('batch-age.'):
        query['request']['sql']=query['request']['sql'].replace('FROM agents_scm_inventory_sku_data_d AS b\nWHERE TRUE', "FROM agents_scm_inventory_sku_data_d AS b\nWHERE b.warehouse_classify IN ('01', '02', '20')")
for name,query in branch['queries'].items():
    if name.startswith('health.'):
        cloned=copy.deepcopy(query)
        if 'pagination' in cloned:
            for k,v in cloned['pagination'].items():
                if isinstance(v,str) and v.startswith('health.'):
                    cloned['pagination'][k]=v.replace('health.','branch-health.',1)
        config['queries'][name.replace('health.','branch-health.',1)]=cloned
    if name=='source.branch-stock-date' or name.startswith(('replenishment.','replenishment-suggestions.')):
        config['queries'][name]=copy.deepcopy(query)
for view in config['sourceViews']['views']:
    if view['id']=='branch-stock':
        view['queryId']='branch-health.detail'
        view['summaryId']='branch-health.summary'
path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
