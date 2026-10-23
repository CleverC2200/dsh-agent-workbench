"""Keep branch quantities separate from base and unrelated warehouse classes."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'business/inventory-fc/sql.config.json'
config = json.loads(path.read_text())
for query_id, query in config['queries'].items():
    sql = query['request']['sql']
    if query_id.startswith(('health.', 'batch-age.', 'replenishment.', 'replenishment-suggestions.')) or query_id in ['source.health-date', 'source.branch-stock-date', 'calendar.health_dates', 'calendar.health_dates.count']:
        # These exact adapters are shared by the displayed stock, risk and
        # replenishment queries. Current-order CTEs retain their own pool rules.
        sql = sql.replace('FROM agents_scm_inventory_sku_data_d AS b\nWHERE TRUE AND ', "FROM agents_scm_inventory_sku_data_d AS b\nWHERE b.warehouse_classify = '20' AND ")
        sql = sql.replace('FROM agents_scm_inventory_sku_data_d AS b\n)', "FROM agents_scm_inventory_sku_data_d AS b\nWHERE b.warehouse_classify = '20'\n)")
    if query_id.startswith('base_resources.'):
        sql = sql.replace('FROM agents_scm_inventory_sku_data_d AS b WHERE b.month_date', "FROM agents_scm_inventory_sku_data_d AS b WHERE b.warehouse_classify IN ('01', '02') AND b.month_date")
    query['request']['sql'] = sql
for view in config['sourceViews']['views']:
    view['description'] = view.get('description', '').replace('不按仓库分类编码过滤；基地按所属基地名称、分仓按仓库编码取值。', '分仓库存仅取20类仓库，按分仓编码取值；所属基地名称用于分组与筛选。')
path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
