"""D101: fill NULL daily demand from the same unique month's published plan fields."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1]
days="CASE WHEN SUBSTRING(t.year_month,6,2)='02' THEN CASE WHEN MOD(CAST(SUBSTRING(t.year_month,1,4) AS INT),400)=0 OR (MOD(CAST(SUBSTRING(t.year_month,1,4) AS INT),4)=0 AND MOD(CAST(SUBSTRING(t.year_month,1,4) AS INT),100)<>0) THEN 29 ELSE 28 END WHEN SUBSTRING(t.year_month,6,2) IN ('04','06','09','11') THEN 30 ELSE 31 END"
plan="CASE WHEN t.inventory_version='月初' THEN t.main_sales_plan_v1 WHEN t.inventory_version='纠偏' THEN t.main_sales_plan_adj WHEN t.inventory_version='滚动' THEN t.roll_sales_plan ELSE NULL END"
transfer="CASE WHEN t.inventory_version='月初' THEN t.transfer_out_plan_v1 WHEN t.inventory_version='纠偏' THEN t.transfer_out_plan_adj WHEN t.inventory_version='滚动' THEN t.transfer_out_plan_roll ELSE NULL END"
computed=f"CASE WHEN MAX({plan})>=0 AND MAX({transfer})>=0 THEN (MAX({plan})+MAX({transfer})*0.5)/CAST(MAX({days}) AS DECIMAL(20,6)) ELSE NULL END"
old=re.compile(r'CASE\s+WHEN\s+COUNT\(\*\)\s*=\s*1\s+THEN\s+MAX\(t\.avg_daily_planned_demand\)\s+ELSE\s+NULL\s+END\s+AS\s+avg_daily_planned_demand', re.I)
new=f'CASE WHEN COUNT(*) = 1 THEN COALESCE(MAX(t.avg_daily_planned_demand), {computed}) ELSE NULL END AS avg_daily_planned_demand'
for agent in ['aqkc','fc','qll']:
 path=root/f'business/inventory-{agent}/sql.config.json';c=json.loads(path.read_text())
 for q in c['queries'].values():
  sql=q['request']['sql']
  if old.search(sql) and 'agents_scm_goods_inventory_turnover_data_m AS t' in sql:
   q['request']['sql']=re.sub(r'c\.avg_daily_planned_demand IS NULL OR c\.avg_daily_planned_demand\s*<=\s*0', 'c.avg_daily_planned_demand IS NULL', old.sub(new,sql))
   q['notes']=str(q.get('notes',''))+' D101：唯一基地/月/版本/SKU日均为空时，按同版本销售计划+调拨出库计划×0.5除该计划月自然天数补齐；缺任一要素或重复则保留未知；有效0保留。'
 path.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
