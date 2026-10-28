"""Keep branch-only replenishment and current unprepared EA quantities aligned."""
from pathlib import Path
import json
import re
import sqlglot
from sqlglot import exp

ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/'business/inventory-fc/sql.config.json'

def parse(s):return sqlglot.parse_one(s,read='postgres')
def render(tree):
 for x in list(tree.find_all(exp.Substring)):
  x.replace(exp.Anonymous(this='SUBSTRING',expressions=[x.this.copy(),x.args['start'].copy(),x.args['length'].copy()]))
 return re.sub(r'%\((gea_p\d+)\)s',r':\1',tree.sql(dialect='postgres'))

def update(config):
 source=parse((ROOT/'business/inventory-fc/current-shortage-source.sql').read_text())
 current={x.alias:x for x in source.ctes}
 order_ctes=['current_order_lines','current_open_orders','current_open_lines']
 for key,q in config['queries'].items():
  if not key.startswith(('replenishment.','replenishment-suggestions.')):continue
  tree=parse(q['request']['sql'])
  for scope in list(tree.find_all(exp.With)):
   names={x.alias for x in scope.expressions}
   if 'eligible_order_sku' not in names:continue
   updated=[]
   for cte in scope.expressions:
    if cte.alias in order_ctes:continue
    if cte.alias=='eligible_order_sku':updated.extend(current[n].copy() for n in order_ctes)
    updated.append(current[cte.alias].copy() if cte.alias in current else cte)
   scope.set('expressions',updated)
  for scope in tree.find_all(exp.With):
   keys=next((x for x in scope.expressions if x.alias=='scope_keys'),None)
   if keys is None:continue
   if not any(x.alias=='fc_branch_scope' for x in scope.expressions):
    branch=exp.CTE(this=parse('''SELECT b.warehouseid AS warehouse_code
     FROM agents_scm_inventory_sku_data_d AS b
     WHERE b.warehouse_classify='20'
     AND b.month_date=REPLACE(CAST(:gea_p2200 AS VARCHAR(10)),'-','')
     AND NULLIF(TRIM(b.warehouseid),'') IS NOT NULL GROUP BY b.warehouseid'''),alias=exp.TableAlias(this=exp.to_identifier('fc_branch_scope')))
    scope.set('expressions',[branch]+list(scope.expressions))
   if not any(t.name=='fc_branch_scope' for t in keys.this.find_all(exp.Table)):
    keys.this.join('fc_branch_scope AS bs',on='bs.warehouse_code=k.warehouse_code',copy=False)
  if key=='replenishment.summary':
   names=set(tree.named_selects)
   for value in ['SUM(r.recommended_qty) AS known_recommended_qty','COUNT(r.recommended_qty) AS calculated_sku_count']:
    e=parse(value)
    if e.alias not in names:tree.select(e,append=True,copy=False)
   q['resultColumns']=tree.named_selects
  q['request']['sql']=render(tree)
  q['notes']='仅取所选库存快照中20类分仓编码，计划/库存/订单均按该编码范围；有效未备单且未发货完成订单取qtyordered/qtyallocated件，排除作废、取消和关闭；已知建议与缺失计算行分别统计，未知不当0。'
 return config

if __name__=='__main__':
 PATH.write_text(json.dumps(update(json.loads(PATH.read_text())),ensure_ascii=False,indent=2)+'\n')
