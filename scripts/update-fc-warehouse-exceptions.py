"""Apply confirmed N436/Y204 branch exclusions to source and snapshot SQL."""
import json
import re
from pathlib import Path
from inventory_warehouse_scope import warehouse_scope, branch_read_scope, MARKER
from optimize_base_scoped_queries import optimize as normalize_base_scope, SCOPED_QUERY_IDS

ROOT = Path(__file__).resolve().parents[1]
for agent in ['fc', 'aqkc']:
    path = ROOT / f'business/inventory-{agent}/sql.config.json'
    config = json.loads(path.read_text())
    changed = []
    for query_id, query in config['queries'].items():
        original = query['request']['sql']
        sql = warehouse_scope(original)
        if agent == 'fc':
            sql = branch_read_scope(sql)
        elif query_id in SCOPED_QUERY_IDS:
            sql = normalize_base_scope({**query, 'request': {**query['request'], 'sql': sql}})
        query['request']['sql'] = sql
        if sql != original:
            changed.append(query_id)
    for template in config['templates'].values():
        if len(template['segments']) == 1 and re.match(r'^\s*(?:/\*.*?\*/\s*)*(?:WITH|SELECT)\b', template['segments'][0], re.I | re.S):
            sql = warehouse_scope(template['segments'][0])
            template['segments'][0] = branch_read_scope(sql) if agent == 'fc' else sql
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    for source in path.parent.glob('*.sql'):
        original = source.read_text()
        updated = warehouse_scope(original)
        if updated.startswith(MARKER + '\nWITH '):
            updated = 'WITH ' + MARKER + '\n' + updated[len(MARKER + '\nWITH '):]
        if updated != original:
            source.write_text(updated)
    materializations = path.parent / 'customer-order-materializations.json'
    if agent == 'fc' and materializations.exists():
        exports = json.loads(materializations.read_text())
        for item in exports:
            item['sourceSql'] = branch_read_scope(warehouse_scope(item['sourceSql']))
        materializations.write_text(json.dumps(exports, ensure_ascii=False, indent=2) + '\n')
    print('Updated warehouse scope queries:', agent, len(changed))
