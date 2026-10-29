"""Derive the read-only suggestion list from the page's existing calculation SQL."""
import copy
import json
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'business/inventory-fc/sql.config.json'
config = json.loads(path.read_text())
prefix = 'replenishment-suggestions'
for suffix in ['detail', 'count', 'detail.atomic']:
    query = copy.deepcopy(config['queries']['replenishment.' + suffix])
    sql = query['request']['sql']
    if suffix == 'count':
        assert sql.endswith('FROM filtered AS r')
        sql += ' WHERE r.recommended_qty > 0'
    elif suffix == 'detail':
        marker = ' ORDER BY r.warehouse_code, r.sku LIMIT :gea_p8 OFFSET :gea_p9'
        assert sql.endswith(marker)
        sql = sql[:-len(marker)] + ' WHERE r.recommended_qty > 0 ORDER BY r.recommended_qty DESC, r.warehouse_code, r.sku LIMIT :gea_p8 OFFSET :gea_p9'
        query['pagination'] = {'countQuery': prefix + '.count', 'atomicQuery': prefix + '.detail.atomic'}
    else:
        marker = 'FROM filtered AS r ORDER BY r.warehouse_code, r.sku LIMIT :gea_p8 OFFSET :gea_p9'
        assert sql.count(marker) == 1
        sql = sql.replace(marker, 'FROM filtered AS r WHERE r.recommended_qty > 0 ORDER BY r.recommended_qty DESC, r.warehouse_code, r.sku LIMIT :gea_p8 OFFSET :gea_p9')
        marker = 'scope_count AS (SELECT COUNT(*) AS page_scope_total FROM filtered AS r)'
        assert sql.count(marker) == 1
        sql = sql.replace(marker, 'scope_count AS (SELECT COUNT(*) AS page_scope_total FROM filtered AS r WHERE r.recommended_qty > 0)')
        marker = 'ORDER BY p.warehouse_code, p.sku LIMIT :gea_p8'
        assert sql.endswith(marker)
        sql = sql[:-len(marker)] + 'ORDER BY p.recommended_qty DESC, p.warehouse_code, p.sku LIMIT :gea_p8'
    query['request']['sql'] = sql
    query['title'] = '分仓建议补货清单（沿页面测算，只列正建议量）'
    query['notes'] = '沿原补货计算，仅在SQL分页和计数前限定正建议量并降序；零建议不扫描到对话，空页保留全范围计数。'
    config['queries'][prefix + '.' + suffix] = query

view = copy.deepcopy(next(view for view in config['sourceViews']['views'] if view['id'] == 'replenishment'))
view.update(id='replenishment-suggestions', queryId=prefix + '.detail', title='建议补货清单')
view.pop('summaryId', None)
config['sourceViews']['views'] = [v for v in config['sourceViews']['views'] if v['id'] != view['id']] + [view]
path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
