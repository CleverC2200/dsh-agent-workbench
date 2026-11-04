"""Keep confirmed branch exceptions visible and exclude them from the base stock pool."""
import json
from pathlib import Path
from inventory_warehouse_scope import warehouse_exceptions

ROOT = Path(__file__).resolve().parents[1]
for agent in ['fc', 'aqkc']:
    path = ROOT / f'business/inventory-{agent}/sql.config.json'
    config = json.loads(path.read_text())
    changed = []
    for query_id, query in config['queries'].items():
        original = query['request']['sql']
        query['request']['sql'] = warehouse_exceptions(original)
        if query['request']['sql'] != original:
            changed.append(query_id)
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    for source in path.parent.glob('*.sql'):
        original = source.read_text()
        updated = warehouse_exceptions(original)
        if updated != original:
            source.write_text(updated)
    print('Updated warehouse scope queries:', agent, len(changed))
