"""Build lazy category drill queries from the existing governed source contracts."""
import copy
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'business/inventory-qll/sql.config.json'
config = json.loads(path.read_text())
base = json.loads((root / 'business/inventory-aqkc/sql.config.json').read_text())

sources = {
    'base': (base['queries']['page.sku-detail'], {
        'organization': 'r.base', 'organization_name': 'r.base', 'category': 'r.category',
        'sku': 'r.sku', 'material_name': 'r.material_name', 'inventory': 'r.inventory',
        'target': 'r.target', 'gap': 'r.gap', 'turnover_qty': 'r.inventory',
        'daily': 'r.daily_demand', 'age_qty': 'r.age_qty', 'age_sum': 'r.age_weighted_sum',
        'overaged': 'r.over60', 'source_date': 'r.stock_date',
        'risk': "CASE WHEN r.current_shortage > 0 THEN '缺货' WHEN r.inventory < r.target THEN '库存偏低' WHEN r.inventory > r.target THEN '库存偏高' WHEN r.target IS NULL THEN '无目标' WHEN r.inventory IS NULL THEN '待核实' ELSE '正常' END",
    }),
    'branch': (config['queries']['batch-age.groups'], {
        'organization': 'r.warehouseid', 'organization_name': 'r.warehouse_name',
        'category': 'r.product_categ_name', 'sku': 'r.material_code',
        'material_name': 'r.material_name', 'inventory': 'r.total_qty',
        'target': 'NULL', 'gap': 'NULL', 'turnover_qty': 'r.total_qty',
        'daily': 'r.daily_movement', 'age_qty': 'r.age_weight_qty', 'age_sum': 'r.weighted_age',
        'overaged': 'r.overaged_qty', 'source_date': 'r.stat_date', 'risk': 'r.warning',
    }),
    'customer': (config['queries']['dealer.stock.detail'], {
        'organization': 'r.province', 'organization_name': 'r.province',
        'category': 'r.category', 'sku': 'r.sku', 'material_name': 'r.material_name',
        'inventory': 'r.inventory', 'target': 'r.analysis_target_inventory',
        'gap': 'r.inventory - r.analysis_target_inventory', 'turnover_qty': 'r.inventory',
        'daily': 'r.sales30 / 30.0',
        'age_qty': 'CASE WHEN r.inventory > 0 AND r.analysis_avg_stock_age >= 0 THEN r.inventory ELSE NULL END',
        'age_sum': 'CASE WHEN r.inventory > 0 AND r.analysis_avg_stock_age >= 0 THEN r.inventory * r.analysis_avg_stock_age ELSE NULL END',
        'overaged': 'NULL', 'source_date': 'r.stat_date',
        'risk': "CASE WHEN r.inventory < r.analysis_target_inventory THEN '库存偏低' WHEN r.inventory > r.analysis_target_inventory THEN '库存偏高' WHEN r.analysis_target_inventory IS NULL THEN '无目标' WHEN r.inventory IS NULL THEN '待核实' ELSE '正常' END",
    }),
}
for layer, (source, fields) in sources.items():
    query = copy.deepcopy(source)
    sql = source['request']['sql'].rsplit(' ORDER BY ', 1)[0]
    if layer == 'customer':
        start = sql.rindex(') SELECT ')
        sql = sql[:start] + sql[start:].replace('r.category AS category', "COALESCE(NULLIF(TRIM(r.category), ''), ma.category) AS category", 1)
    if layer == 'branch':
        sql = sql.replace("b.warehouse_classify IN ('01', '02', '20')", "b.warehouse_classify = '20'")
        sql = sql.replace(':gea_p9', "'detail'")
    # Retain only parameters actually consumed by the source; paging is applied after grouping.
    query['parameterSpec'] = {k: v for k, v in query['parameterSpec'].items() if re.search(r':' + k + r'\b', sql)}
    query['request']['parameters'] = {k: v for k, v in query['request']['parameters'].items() if k in query['parameterSpec']}
    extra = [
        ('level', 'string', 'category', ['category', 'organization', 'sku']),
        ('parent_category', 'string', None, None),
        ('parent_organization', 'string', None, None),
        ('tree_search', 'string', None, None),
        ('tree_risk', 'string', None, None),
        ('page_size', 'integer', 11, None),
        ('offset', 'integer', 0, None),
    ]
    for i, (name, typ, default, enum) in enumerate(extra, 9100):
        spec = {'name': name, 'type': typ, 'required': True, 'nullable': default is None}
        if enum: spec['enum'] = enum
        if typ == 'integer': spec.update(minimum=0 if name == 'offset' else 1, **({'maximum': 101} if name == 'page_size' else {}))
        query['parameterSpec'][f'gea_p{i}'] = spec
        query['request']['parameters'][f'gea_p{i}'] = default
    normalized = ', '.join(("CAST(NULL AS DECIMAL(24, 6))" if v == 'NULL' else v) + ' AS ' + k for k, v in fields.items())
    key = "CASE WHEN :gea_p9100 = 'category' THEN COALESCE(NULLIF(TRIM(n.category), ''), '未分类') WHEN :gea_p9100 = 'organization' THEN COALESCE(NULLIF(TRIM(n.organization), ''), '未归属') ELSE n.sku END"
    name = "CASE WHEN :gea_p9100 = 'category' THEN COALESCE(NULLIF(TRIM(n.category), ''), '未分类') WHEN :gea_p9100 = 'organization' THEN COALESCE(NULLIF(TRIM(n.organization_name), ''), NULLIF(TRIM(n.organization), ''), '未归属') ELSE COALESCE(n.material_name, n.sku) END"
    risk = "CASE n.risk WHEN '缺货' THEN 1 WHEN '库存偏低' THEN 2 WHEN '库存偏高' THEN 3 WHEN '滞库' THEN 4 WHEN '预警' THEN 5 WHEN '无目标' THEN 6 WHEN '正常' THEN 8 ELSE 7 END"
    # Exact parent identity is applied before SKU risk/search. Summaries never inherit leaf filters.
    query['request']['sql'] = f"""WITH tree_source AS ({sql}), normalized AS (SELECT {normalized} FROM tree_source AS r)
SELECT {key} AS node_key, MAX({name}) AS node_name,
SUM(n.inventory) AS inventory, COUNT(*) - COUNT(n.inventory) AS missing_inventory,
SUM(n.target) AS target, COUNT(*) - COUNT(n.target) AS missing_target,
SUM(n.gap) AS gap,
SUM(CASE WHEN n.turnover_qty >= 0 AND n.daily >= 0 THEN n.turnover_qty ELSE NULL END) AS turnover_qty,
SUM(CASE WHEN n.turnover_qty >= 0 AND n.daily >= 0 THEN n.daily ELSE NULL END) AS daily,
SUM(CASE WHEN n.target >= 0 AND n.daily >= 0 THEN n.target ELSE NULL END) AS target_turnover_qty,
SUM(CASE WHEN n.target >= 0 AND n.daily >= 0 THEN n.daily ELSE NULL END) AS target_daily,
SUM(n.age_qty) AS age_qty, SUM(n.age_sum) AS age_sum,
SUM(n.overaged) AS overaged, MIN({risk}) AS risk_rank,
MIN(n.source_date) AS source_date, MAX(n.source_date) AS latest_date
FROM normalized AS n
WHERE (:gea_p9101 IS NULL OR COALESCE(NULLIF(TRIM(n.category), ''), '未分类') = :gea_p9101)
AND (:gea_p9102 IS NULL OR COALESCE(NULLIF(TRIM(n.organization), ''), '未归属') = :gea_p9102)
AND (:gea_p9100 <> 'sku' OR :gea_p9103 IS NULL OR n.sku LIKE :gea_p9103 OR n.material_name LIKE :gea_p9103)
GROUP BY {key}
HAVING (:gea_p9100 <> 'sku' OR :gea_p9104 IS NULL OR MIN({risk}) = CAST(:gea_p9104 AS INTEGER))
ORDER BY node_key LIMIT :gea_p9105 OFFSET :gea_p9106"""
    query['plugins'] = ['qll']
    query['title'] = f'全链品类结构按需下钻：{layer}'
    query['notes'] = '沿用已发布来源与既有计算；品类、组织及SKU分层读取。SKU风险在聚合后筛选；均龄保留数量权重，未知值不补零。渠道按省区归属，库存独立于公司库存。'
    query['resultColumns'] = ['node_key', 'node_name', 'inventory', 'missing_inventory', 'target', 'missing_target', 'gap', 'turnover_qty', 'daily', 'target_turnover_qty', 'target_daily', 'age_qty', 'age_sum', 'overaged', 'risk_rank', 'source_date', 'latest_date']
    query.pop('pagination', None)
    config['queries'][f'category-tree.{layer}'] = query
path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
