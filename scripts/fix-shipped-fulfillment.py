"""D93/D106: one monthly shipped-order pool; cap actual shipments per line."""
import json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
for agent in ['aqkc','fc','qll']:
 path=root/f'business/inventory-{agent}/sql.config.json';c=json.loads(path.read_text())
 for key,q in c['queries'].items():
  sql=q['request']['sql']
  if 'agents_order_execute_isontime_mi' not in sql:continue
  # Keep the customer-demand detail pool intact; only fulfillment outputs use shipped lines.
  capped="CASE WHEN r.shipped>0 AND r.ordered>=0 THEN CASE WHEN r.shipped>r.ordered THEN r.ordered ELSE r.shipped END WHEN r.shipped=0 THEN 0 ELSE NULL END"
  valid="COUNT(r.shipped)=COUNT(*) AND COUNT(r.ordered)=COUNT(*) AND SUM(CASE WHEN r.source_rows>1 OR r.shipped<0 OR r.ordered<0 THEN 1 ELSE 0 END)=0"
  # Grouped summaries do not always project source_rows; their invalid flag already covers duplicates.
  valid="COUNT(r.shipped)=COUNT(*) AND COUNT(r.ordered)=COUNT(*) AND MIN(r.shipped)>=0 AND MIN(r.ordered)>=0 AND SUM(r.invalid)=0"
  sql=re.sub(r'CASE\s+WHEN\s+SUM\(r\.invalid\)\s*=\s*0\s+AND\s+SUM\(r\.demand\)\s*>\s*0\s+THEN\s+1\s*-\s*SUM\(r\.shortage\)\s*/\s*SUM\(r\.demand\)\s+ELSE\s+NULL\s+END\s+AS\s+fulfillment_rate',f'CASE WHEN {valid} AND SUM(r.shipped_order_quantity)>0 THEN SUM({capped})/SUM(r.shipped_order_quantity) ELSE NULL END AS fulfillment_rate',sql)
  if key.startswith('page.workbench-support') or key.startswith('page.daily-report-fulfillment'):
   sql=sql.replace('SUM(fact.demand) ELSE NULL END AS need','SUM(fact.shipped_order_quantity) ELSE NULL END AS need')
   sql=sql.replace('SUM(fact.shortage) ELSE NULL END AS shortage','SUM(CASE WHEN fact.shipped>0 AND fact.ordered>=0 THEN CASE WHEN fact.ordered>fact.shipped THEN fact.ordered-fact.shipped ELSE 0 END WHEN fact.shipped=0 THEN 0 ELSE NULL END) ELSE NULL END AS shortage')
  if sql!=q['request']['sql']:
   q['request']['sql']=sql;q['notes']=str(q.get('notes',''))+' D93/D106：月度满足率只纳入已发生发货的订单行；分母为同池订单量，分子逐行限额发货量；零分母/异常量/缺数保持未知。不使用全部月度需求的outqty推算已发履约。'
 path.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
