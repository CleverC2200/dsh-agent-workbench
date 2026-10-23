"""Narrow batch metadata joins and compare raw snapshot keys before formatting dates."""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def digits(value):
    return ' AND '.join(f"SUBSTRING({value}, {i}, 1) BETWEEN '0' AND '9'" for i in range(1,9))

def safe_part(match):
    field,start,size=match.groups()
    valid=f"LENGTH({field}) >= 10 AND SUBSTRING({field}, 5, 1) = '-' AND SUBSTRING({field}, 8, 1) = '-'"
    valid+=' AND '+' AND '.join(f"SUBSTRING({field}, {i}, 1) BETWEEN '0' AND '9'" for i in [1,2,3,4,6,7,9,10])
    return f"CASE WHEN {valid} THEN CAST(SUBSTRING({field}, {start}, {size}) AS INTEGER) ELSE NULL END"

for agent in ['aqkc','fc','qll','apsplan']:
    path=ROOT/f'business/inventory-{agent}/sql.config.json';config=json.loads(path.read_text())
    for name,q in config['queries'].items():
        sql=q['request'].get('sql')
        if not sql:continue
        if name in ['source.health-date','source.branch-stock-date']:
            scope=re.search(r"b\.warehouse_classify (?:IN \('[0-9]+'(?:, '[0-9]+')*\)|= '20')",sql)
            conditions=[scope.group(0)] if scope else []
            if any(f"NULLIF(TRIM({alias}.warehouseid), '') IS NOT NULL" in sql for alias in ['t','b']):conditions.append("NULLIF(TRIM(b.warehouseid), '') IS NOT NULL")
            conditions.extend(["b.month_date <= REPLACE(CAST(:gea_p1 AS VARCHAR(10)), '-', '')","LENGTH(b.month_date) = 8",digits('b.month_date'),"SUBSTRING(b.month_date, 5, 2) BETWEEN '01' AND '12'","SUBSTRING(b.month_date, 7, 2) BETWEEN '01' AND '31'"])
            sql="WITH latest AS (SELECT MAX(b.month_date) AS day_key FROM agents_scm_inventory_sku_data_d AS b WHERE "+' AND '.join(conditions)+") SELECT CASE WHEN l.day_key IS NULL THEN NULL ELSE CONCAT(SUBSTRING(l.day_key, 1, 4), '-', SUBSTRING(l.day_key, 5, 2), '-', SUBSTRING(l.day_key, 7, 2)) END AS day FROM latest AS l"
        sql=sql.replace('FROM agents_scm_material_in_out_summary_d AS n INNER JOIN inventory_batch_totals AS scoped_stock ON scoped_stock.warehouseid = n.warehouseid AND scoped_stock.material_code = n.material_code GROUP BY n.warehouseid, n.material_code','FROM agents_scm_material_in_out_summary_d AS n GROUP BY n.warehouseid, n.material_code')
        # Malformed production dates invalidate age only; quantities remain in the same inventory pool.
        sql=re.sub(r"(?<!THEN )CAST\(SUBSTRING\(NULLIF\(([a-z]+\.prod_date), ''\), (\d+), (\d+)\) AS INTEGER\)",safe_part,sql)
        q['request']['sql']=sql
    path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
