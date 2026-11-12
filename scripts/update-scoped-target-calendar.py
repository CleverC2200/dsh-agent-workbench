"""Retain authorized history and use visible batch defaults when global calendar rows are hidden."""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
pattern=re.compile(r"SELECT m\.month AS month, m\.effective_version AS inventory_version, m\.version_source_rows AS source_rows FROM agents_inv_base_sku_day AS m WHERE (?P<conditions>.*?m\.inv_variant_id\s*=\s*'TARGET_CALENDAR')")
for agent in ['aqkc','fc','qll']:
    path=ROOT/f'business/inventory-{agent}/sql.config.json';config=json.loads(path.read_text());changed=[]
    for query_id,query in config['queries'].items():
        sql=query['request']['sql']
        if 'authorized_target_calendar' in sql:continue
        matches=list(pattern.finditer(sql))
        for match in reversed(matches):
            end=match.end();conditions=match['conditions']
            if "(m.inv_variant_id" in conditions:
                assert sql[end]==')',(agent,query_id)
                conditions+=')';end+=1
            original=sql[match.start():end]
            defaults=conditions.replace("'TARGET_CALENDAR'","'__BASE_READY__'")
            fallback="SELECT m.month AS month, m.effective_version AS inventory_version, CAST(0 AS BIGINT) AS source_rows FROM agents_inv_base_sku_day AS m WHERE "+defaults+" AND m.month IS NOT NULL AND NULLIF(TRIM(m.effective_version), '') IS NOT NULL"
            projection="SELECT authorized_target_calendar.month AS month, authorized_target_calendar.inventory_version AS inventory_version, MAX(authorized_target_calendar.source_rows) AS source_rows FROM ("+original+" UNION ALL "+fallback+") AS authorized_target_calendar GROUP BY authorized_target_calendar.month, authorized_target_calendar.inventory_version"
            sql=sql[:match.start()]+projection+sql[end:]
        if matches:
            query['request']['sql']=sql;changed.append(query_id)
    path.write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
    print(agent,changed)
