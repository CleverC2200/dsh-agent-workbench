"""Adapt published customer keys and expose new plan-source fields at their original grain."""
from pathlib import Path
import json,re
import sqlglot
ROOT=Path(__file__).resolve().parents[1]
for agent in ['aqkc','fc','qll','apsplan']:
 path=ROOT/f'business/inventory-{agent}/sql.config.json';c=json.loads(path.read_text())
 for key,q in c['queries'].items():
  sql=q['request']['sql']
  if 'agents_sales_forecast_detail_mi' in sql:
   sql=sql.replace('t.dealer_code','t.cust_code')
  # Preserve the physical base inventory pool even when a branch shares the base name.
  if key.startswith('base_resources.') and 'fc_base_stock AS' in sql:
   sql=sql.replace("WHERE b.month_date=", "WHERE b.warehouse_classify IN ('01','02') AND b.month_date=") if "b.warehouse_classify IN ('01','02')" not in sql else sql
  if 't.future30_avg_plan' in sql:
   pattern=r'(CASE WHEN COUNT\(\*\)\s*=\s*1 THEN MAX\(t.future30_avg_plan\) ELSE NULL END AS future30_avg_plan)(?!,\s*CASE WHEN COUNT\(\*\)\s*=\s*1 THEN MAX\(t.last_month_actual_qty\))'
   sql=re.sub(pattern,lambda m:m[0]+', '+', '.join(f'CASE WHEN COUNT(*) = 1 THEN MAX(t.{f}) ELSE NULL END AS {f}' for f in ['last_month_actual_qty','current_day_avg_qty']),sql)
   for anchor in ['s.future30_avg_plan AS daily_plan','COALESCE(s.future30_avg_plan, 0) AS daily_plan','r.daily_plan AS daily_plan','p.daily_plan AS daily_plan']:
    alias='s' if anchor.startswith('COALESCE') else anchor[0]
    sql=re.sub(re.escape(anchor)+r'(?!,\s*'+alias+r'\.last_month_actual_qty)',lambda m:m[0]+', '+', '.join(f'{alias}.{f} AS {f}' for f in ['last_month_actual_qty','current_day_avg_qty']),sql)
  if 'agents_sales_plan_demand_m' in sql and 't.sale_plan' not in sql:
   fields={'sale_plan':'base_sales_plan','sale_adjust':'base_sales_adjusted_plan','prod_plan_num':'base_production_plan','scjp_qty':'base_production_adjusted_plan'}
   anchor='CASE WHEN COUNT(*) = 1 THEN MAX(t.current_month_adjust) ELSE NULL END AS current_month_adjust'
   if anchor in sql:
    sql=sql.replace(anchor,anchor+', '+', '.join(f'CASE WHEN COUNT(*) = 1 THEN MAX(t.{f}) ELSE NULL END AS {out}' for f,out in fields.items()))
    for alias in ['s','r']:
     anchor=f'{alias}.current_month_adjust AS current_month_adjust'
     sql=sql.replace(anchor,anchor+', '+', '.join(f'{alias}.{out} AS {out}' for out in fields.values()))
    if 'FROM (' in sql and 'SUM(fact.current_month_adjust)' in sql:
     anchor='COALESCE(SUM(fact.current_month_adjust), 0) AS demand_adjusted_plan'
     sql=sql.replace(anchor,anchor+', '+', '.join(f'SUM(fact.{out}) AS {out}' for out in fields.values()))
  if 'base_sales_plan' in sql:
   pattern=r'(COALESCE\(SUM\(([a-z]+)\.demand_adjusted_plan\), 0\) AS demand_adjusted_plan)(?!, SUM\([a-z]+\.base_sales_plan\))'
   sql=re.sub(pattern,lambda m:m[1]+', '+', '.join(f'SUM({m[2]}.{f}) AS {f}' for f in ['base_sales_plan','base_sales_adjusted_plan','base_production_plan','base_production_adjusted_plan']),sql)
  q['request']['sql']=sql
  # The public return shape follows the actual top-level projection; counts do not gain fields.
  if 'last_month_actual_qty AS last_month_actual_qty' in sql or 'base_sales_plan' in sql:
   aliases=sqlglot.parse_one(sql,read='postgres').named_selects
   q['resultColumns']=aliases
 for v in c.get('sourceViews',{}).get('views',[]):
  if v.get('queryId') in ['replenishment.detail','replenishment-suggestions.detail','transfer_plan.detail']:
   for f,label in [('last_month_actual_qty','上月实际出库量'),('current_day_avg_qty','本月日均出库量')]:
    if f not in c['queries'][v['queryId']]['resultColumns']:continue
    if not any(x.get('field')==f for x in v['columns']):
     v['columns'].append({'field':f,'label':label,'format':'decimal2','reason':'源分仓编码×SKU字段；与近30日日均分别列示，不替换历史测算分母。'})
 path.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
