"""User-confirmed D96: derive a nine-day target only for NULL; preserve real zero."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
TARGET = re.compile(r"CASE WHEN t\.sku IS NULL THEN NULL WHEN t\.product_categ_name = '粽子'.*?ELSE t\.final_target_inventory END AS target", re.S)
for agent in ['aqkc', 'fc', 'qll']:
    path = ROOT / f'business/inventory-{agent}/sql.config.json'
    config = json.loads(path.read_text())
    changed = []
    for query_id, query in config['queries'].items():
        sql = query['request']['sql']
        # The existing unique-version aggregation already makes daily demand NULL
        # on duplicate source rows. Preserve optimized CTEs and their projections.
        sql, count = TARGET.subn(lambda match: 'CASE WHEN t.final_target_inventory = 0 THEN 0 ELSE COALESCE(' + match.group(0).removesuffix(' AS target') + ', CASE WHEN t.avg_daily_planned_demand >= 0 THEN t.avg_daily_planned_demand * 9 ELSE NULL END) END AS target', sql)
        if not count:
            continue
        sql = re.sub(r'c\.final_target_inventory IS NULL OR c\.final_target_inventory <= 0', 'c.final_target_inventory IS NULL', sql)
        query['request']['sql'] = sql
        query['notes'] = str(query.get('notes', '')) + ' D96业务确认：既有唯一版本聚合后的目标为空且同范围日均需求非负时，按日均需求×9派生展示目标；真实0不替换，日均需求缺失或重复版本保持未知；不回写上游。'
        changed.append(query_id)
    if agent == 'aqkc':
        config['resultAliases']['safety_stock.effective_target_inventory'] = 'target'
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2)+'\n')
    print(agent, len(changed), 'queries updated')
