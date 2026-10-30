"""Keep the user-confirmed N436 branch visible without changing source classifications."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'business/inventory-fc/sql.config.json'
config = json.loads(path.read_text())
changed = []
for query_id, query in config['queries'].items():
    sql = query['request']['sql']
    if '/* fc-warehouse-exceptions:N436 */' in sql:
        continue
    original = sql
    # Delivery facts name their physical warehouse column `warehouse`.
    shipping_aliases = set(re.findall(r'FROM agents_scm_cust_deliv_daily_di AS (\w+)', sql))
    def branch(match):
        alias = match.group(1)
        column = 'warehouse' if alias in shipping_aliases else 'warehouseid'
        return f"({match.group(0)} OR {alias}.{column} = 'N436')"
    sql = re.sub(r"\b(\w+)\.warehouse_classify\s*=\s*'20'", branch, sql)
    # The shared order/age pool must choose exactly one location kind.
    sql = re.sub(r"\b(\w+)\.warehouse_classify\s+IN\s*\('01',\s*'02'\)",
                 lambda m: f"({m.group(0)} AND {m.group(1)}.warehouseid <> 'N436')", sql)
    if sql != original:
        query['request']['sql'] = '/* fc-warehouse-exceptions:N436 */\n' + sql
        changed.append(query_id)
path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
print('Updated FC warehouse scope queries:', len(changed))
