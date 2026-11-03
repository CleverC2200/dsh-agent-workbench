"""Use published summary columns directly for default-cycle confirmation reads.

The normal/default summary query remains the reference for casts, fields and filters.
Custom cycles retain the existing calculation route. No raw business logic is replaced.
"""
import copy,json
from pathlib import Path
import sqlglot
from sqlglot import exp
from sqlglot.optimizer.simplify import simplify
repo=Path(__file__).resolve().parents[1]
p=repo/'business/inventory-fc/sql.config.json';cfg=json.loads(p.read_text())
original=cfg['queries']['snapshot-default.replenishment.detail.atomic']
tree=sqlglot.parse_one(original['request']['sql'])
source=next(x.this for x in tree.ctes if x.alias=='list_source')
# This derived table is the existing persisted projection including its exact numeric casts.
projection=source.args['from'].this.this.copy()
assert isinstance(projection,exp.Select)
assert {x.name for x in projection.find_all(exp.Table)}=={'agents_inv_branch_sku_day'}
filtered=source.copy();filtered.set('with',None);filtered.set('joins',[])
# Quick activity/order joins were used only by the optional business-only filter.
filtered=sqlglot.parse_one(filtered.sql().replace(':gea_p3901 = FALSE', 'TRUE'))
filtered=simplify(filtered)
assert not any(c.table in {'quick_orders','quick_transfers'} for c in filtered.find_all(exp.Column))
filtered.set('expressions',[exp.alias_(exp.column(x.alias,'r'),x.alias) for x in projection.expressions])
# Fuzzy warehouse-name matching uses the same full summary grain, not a restricted SKU subset.
measured=next(x.copy() for x in source.ctes if x.alias=='measured')
measured.this.set('expressions',[x for x in measured.this.expressions if x.alias in ['warehouse_code','warehouse_name']])
count=next(x.this.copy() for x in tree.ctes if x.alias=='scope_count')
count=count.transform(lambda n:exp.Table(this=exp.to_identifier('filtered'),alias=n.args.get('alias')) if isinstance(n,exp.Table) and n.name in ['list_sorted','list_filtered'] else n)
columns=[c for c in original['resultColumns'] if c not in ['page_scope_total','page_row_present','page_scope_has_material_group']]
page=exp.select(*[exp.alias_(exp.column(c,'f'),c) for c in columns],exp.alias_(exp.Literal.number(1),'page_row_present')).from_('filtered AS f').order_by('f.warehouse_code','f.sku').limit(exp.Placeholder(this='gea_p8')).offset(exp.Placeholder(this='gea_p9'))
sql=f"""WITH {measured.sql()}, filtered AS ({filtered.sql()}),
scope_count AS ({count.sql()}),
page_rows AS ({page.sql()})
SELECT {', '.join('p.'+c+' AS '+c for c in columns)}, s.page_scope_total AS page_scope_total,
p.page_row_present AS page_row_present, s.page_scope_has_material_group AS page_scope_has_material_group
FROM scope_count AS s LEFT JOIN page_rows AS p ON TRUE
ORDER BY p.warehouse_code, p.sku LIMIT :gea_p8"""
fast=copy.deepcopy(original);fast['request']['sql']=sqlglot.parse_one(sql).sql()
import re
used=set(re.findall(r':(gea_p\d+)\b',sql))
# Preserve the route's exact parameter contract, even for values unused by this fast path.
contract=[]
for key,spec in fast['parameterSpec'].items():
 if key in used:continue
 value="CASE WHEN '' IN (:{} ) THEN 1 ELSE 0 END".format(key) if spec['type']=='array' else ':'+key
 contract.append(value+' AS bind_'+key)
fast['request']['sql']='WITH confirmation_parameter_contract AS (SELECT '+', '.join(contract)+'), '+fast['request']['sql'][5:]
fastid='snapshot-default.replenishment-confirmation.detail.atomic'
cfg['queries'][fastid]=fast
for suffix in ['detail','detail.atomic']:
 key='replenishment-confirmation.'+suffix
 q=copy.deepcopy(cfg['queries']['replenishment.'+suffix])
 if suffix=='detail':q['pagination']['atomicQuery']='replenishment-confirmation.detail.atomic'
 else:
  q['summaryRoute']['defaultQueryId']=fastid
  q['summaryRoute']['materializedInputs']={'business_only':False,'list_mode':'all','sort_field':'key','sort_direction':'asc'}
 cfg['queries'][key]=q
view=copy.deepcopy(next(v for v in cfg['sourceViews']['views'] if v['id']=='replenishment'))
view.update(id='replenishment-confirmation',queryId='replenishment-confirmation.detail',title='补货确认读取')
view['defaultFilters'].update(list_mode='all',sort_field='key',sort_direction='asc')
cfg['sourceViews']['views']=[v for v in cfg['sourceViews']['views'] if v['id']!=view['id']]+[view]
p.write_text(json.dumps(cfg,ensure_ascii=False,indent=2)+'\n');print('confirmation SQL bytes',len(sql))
