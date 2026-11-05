"""Add an atomic, cross-base SKU ranking without changing shortage definitions."""
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'business/inventory-aqkc/sql.config.json'


def update(config):
    for prefix in ['', 'snapshot.']:
        detail = config['queries'][prefix + 'current-shortage.detail']
        source, separator, _ = detail['request']['sql'].partition(', scope_count AS')
        if not separator:
            raise ValueError('Current shortage detail scope changed; review before regeneration')
        query = copy.deepcopy(detail)
        query.pop('summaryRoute', None)
        query['title'] = '当前订单缺货SKU排行（跨基地汇总）'
        query['request']['sql'] = source + '''
, sku_totals AS (
 SELECT f.sku AS sku,
 CASE WHEN COUNT(DISTINCT NULLIF(TRIM(f.material_name), '')) = 1
 THEN MAX(NULLIF(TRIM(f.material_name), '')) END AS material_name,
 SUM(f.demand) AS demand, SUM(f.allocated) AS allocated,
 SUM(f.remaining) AS remaining, SUM(f.available) AS available,
 SUM(f.shortage) AS shortage, SUM(f.invalid) AS invalid
 FROM filtered AS f WHERE NULLIF(TRIM(f.sku), '') IS NOT NULL
 GROUP BY f.sku
), ranking_scope AS (
 SELECT MIN(f.snapshot_date) AS snapshot_date, MAX(f.location_type) AS location_type,
 SUM(f.invalid) AS scope_invalid, SUM(f.shortage) AS scope_shortage,
 COUNT(DISTINCT f.snapshot_date) AS snapshot_count,
 COUNT(DISTINCT CASE WHEN f.shortage > 0 THEN f.sku END) AS page_scope_total
 FROM filtered AS f
), ranking_page AS (
 SELECT s.sku AS sku, s.material_name AS material_name, s.demand AS demand,
 s.allocated AS allocated, s.remaining AS remaining, s.available AS available,
 s.shortage AS shortage, s.invalid AS invalid, 1 AS page_row_present
 FROM sku_totals AS s WHERE s.shortage > 0
 ORDER BY s.shortage DESC, s.sku ASC LIMIT :gea_p4 OFFSET :gea_p5
)
SELECT t.snapshot_date AS snapshot_date, t.location_type AS location_type,
 p.sku AS sku, p.material_name AS material_name, p.demand AS demand,
 p.allocated AS allocated, p.remaining AS remaining, p.available AS available,
 p.shortage AS shortage, p.invalid AS invalid,
 t.scope_invalid AS scope_invalid, t.scope_shortage AS scope_shortage,
 t.snapshot_count AS snapshot_count, t.page_scope_total AS page_scope_total,
 p.page_row_present AS page_row_present
FROM ranking_scope AS t LEFT JOIN ranking_page AS p ON TRUE
ORDER BY p.shortage DESC, p.sku ASC'''
        query['resultColumns'] = [
            'snapshot_date', 'location_type', 'sku', 'material_name', 'demand',
            'allocated', 'remaining', 'available', 'shortage', 'invalid',
            'scope_invalid', 'scope_shortage', 'snapshot_count',
            'page_scope_total', 'page_row_present',
        ]
        query['notes'] = (
            detail['notes'] + ' 先在用户已授权范围内按商品编码跨基地加总，再按净缺口件数降序、商品编码升序分页。'
            '缺货SKU数只统计正缺口的不同商品，不使用基地SKU总行数；总量和排名在同条查询同批数据内读取。'
        )
        if not prefix:
            query['summaryRoute'] = {'queryId': 'snapshot.current-shortage.sku-ranking', 'kind': 'current', 'required': True}
        config['queries'][prefix + 'current-shortage.sku-ranking'] = query


if __name__ == '__main__':
    value = json.loads(CONFIG.read_text())
    update(value)
    CONFIG.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
