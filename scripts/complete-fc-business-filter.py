"""D97: include published current/next-month transfer-plan activity in the business filter."""
import json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
path=root/'business/inventory-fc/sql.config.json';config=json.loads(path.read_text())
for query_id,query in config['queries'].items():
 if not query_id.startswith(('replenishment.','replenishment-suggestions.')):continue
 sql=query['request']['sql']
 if 'quick_transfers.has_business>0' in sql:continue
 already_has_source = 'quick_transfer_plans AS' in sql
 marker='WITH '
 cte="quick_transfer_plans AS (SELECT p.warehouse_code AS warehouse_code, p.material_code AS sku, CASE WHEN COUNT(*)=1 THEN MAX(CASE WHEN p.warehouse_month_transfer_plan>0 THEN 1 ELSE 0 END) ELSE NULL END AS has_business FROM agents_scm_warehouse_transfer_plan_data_d AS p WHERE p.stat_month IN (:gea_p3952) GROUP BY p.warehouse_code,p.material_code,p.stat_month), quick_transfer_activity AS (SELECT q.warehouse_code AS warehouse_code,q.sku AS sku,MAX(q.has_business) AS has_business FROM quick_transfer_plans AS q GROUP BY q.warehouse_code,q.sku), "
 if not already_has_source: sql=sql.replace(marker,marker+cte,1)
 if not already_has_source: sql=sql.replace('FROM measured AS r LEFT JOIN fc_current_orders AS quick_orders ON ', 'FROM measured AS r LEFT JOIN quick_transfer_activity AS quick_transfers ON quick_transfers.warehouse_code=r.warehouse_code AND quick_transfers.sku=r.sku LEFT JOIN fc_current_orders AS quick_orders ON ')
 sql=re.sub(r'r\.warehouse_month_transfer_plan\s*>\s*0\s+OR\s+r\.rolling_ship_daily\s*>\s*0','r.warehouse_month_transfer_plan>0 OR quick_transfers.has_business>0 OR r.rolling_ship_daily>0',sql)
 query['request']['sql']=sql
 query['parameterSpec']['gea_p3952']={'name':'business_plan_months','type':'array','items':'string','minItems':1,'maxItems':2,'required':True,'nullable':False}
 query['request']['parameters']['gea_p3952']=['202610','202611']
 query['notes']=str(query.get('notes',''))+' D97：有业务包含当前及次月已发布调拨计划的正值活动；仅判定是否发生业务，不借此换算或填充计划数量；同仓SKU同月重复保持未知。'
path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
# Activity-only next-month SKUs must enter the scope before filtering and paging.
for query_id,query in config['queries'].items():
 if not query_id.startswith(('replenishment.','replenishment-suggestions.')):continue
 sql=query['request']['sql']
 if 'AS added_activity' in sql:continue
 match=re.search(r'\bscope_keys AS \(',sql)
 if not match:raise ValueError('scope_keys missing: '+query_id)
 start=match.end();depth=1;quoted=False;i=start
 while depth:
  char=sql[i]
  if char=="'":
   if quoted and i+1<len(sql) and sql[i+1]=="'":i+=2;continue
   quoted=not quoted
  elif not quoted:
   if char=='(':depth+=1
   elif char==')':depth-=1
  i+=1
 body=sql[start:i-1]
 addition=' UNION ALL SELECT added_activity.warehouse_code AS warehouse_code,added_activity.sku AS material_code FROM quick_transfer_activity AS added_activity LEFT JOIN ('+body+') AS prior_keys ON prior_keys.warehouse_code=added_activity.warehouse_code AND prior_keys.material_code=added_activity.sku WHERE prior_keys.material_code IS NULL AND added_activity.has_business>0'
 query['request']['sql']=sql[:start]+body+addition+sql[i-1:]
path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
