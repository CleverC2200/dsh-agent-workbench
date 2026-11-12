"""Reuse latest stock quantities and omit unused product joins from FC order cards."""
import copy
import importlib.util
import json
from pathlib import Path
import re
import sqlglot
from sqlglot import exp

ROOT = Path(__file__).resolve().parents[1]

def build(config):
    snapshot = config['queries']['source.branch-stock-date']
    inventory = config['queries']['health.inventory']
    latest = sqlglot.parse_one(snapshot['request']['sql'], read='postgres').ctes[0]
    quantities = sqlglot.parse_one(inventory['request']['sql'], read='postgres')
    for eq in quantities.find_all(exp.EQ):
        if eq.left.sql() == 'b.month_date':
            eq.set('expression', sqlglot.parse_one('(SELECT l.day_key AS day_key FROM latest AS l)', read='postgres'))
    stock_ctes = quantities.ctes
    quantities.set('with_', None)
    tree = sqlglot.parse_one('''SELECT CASE WHEN l.day_key IS NULL THEN NULL ELSE
      CONCAT(SUBSTRING(l.day_key,1,4),'-',SUBSTRING(l.day_key,5,2),'-',SUBSTRING(l.day_key,7,2)) END AS day,
      i.row_count AS row_count,i.total_qty AS total_qty,i.available_qty AS available_qty,
      i.pack_unit_qty AS pack_unit_qty,i.freeze_qty AS freeze_qty
      FROM latest AS l CROSS JOIN inventory_summary AS i''', read='postgres')
    tree.set('with_', exp.With(expressions=[latest, *stock_ctes, exp.CTE(this=quantities, alias=exp.TableAlias(this=exp.to_identifier('inventory_summary')))]))
    for sub in list(tree.find_all(exp.Substring)):
        sub.replace(exp.Anonymous(this='SUBSTRING', expressions=[sub.this.copy(), sub.args['start'].copy(), sub.args['length'].copy()]))
    snapshot['request']['sql'] = re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))
    snapshot['parameterSpec']['gea_p2'] = copy.deepcopy(inventory['parameterSpec']['gea_p2'])
    snapshot['request']['parameters']['gea_p2'] = None
    snapshot['resultColumns'] = ['day', *inventory['resultColumns']]

    snapshot['snapshotRequiredColumns'] = ['day']
    snapshot['title'] = '最新库存快照日期与当前范围库存汇总'
    snapshot['notes'] = '日期保持全范围最新快照；库存按所选分仓过滤。日期读取仅要求 day 返回权限，库存卡片独立校验数量返回权限。'
    next(v for v in config['sourceViews']['views'] if v['id'] == 'branch-stock')['inventorySummaryFromSnapshot'] = True

    spec = importlib.util.spec_from_file_location('compact_fc_overview', ROOT / 'scripts/compact-fc-overview.py')
    compact = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(compact)
    compact.FIXED = {'base': None, 'sku': None, 'category': None}
    fake = {'queries': {'replenishment.summary': copy.deepcopy(config['queries']['current-shortage.summary'])}, 'sourceViews': {'views': [{'id': 'replenishment'}]}}
    order = copy.deepcopy(config['queries']['current-shortage.summary'])
    orders = sqlglot.parse_one(order['request']['sql'], read='postgres')
    counts = sqlglot.parse_one("""WITH overview_shortage_skus AS (
      SELECT l.warehouse_code AS warehouse_code,l.sku AS sku,
      CASE WHEN SUM(l.invalid)=0 THEN SUM(l.shortage) END AS shortage_qty
      FROM upstream_current AS l GROUP BY l.warehouse_code,l.sku
    ), overview_stock_scope AS (
      SELECT b.warehouseid AS warehouse_code FROM agents_scm_inventory_sku_data_d AS b
      CROSS JOIN upstream_snapshot AS s
      WHERE b.month_date=s.month_date AND NULLIF(TRIM(b.warehouseid),'') IS NOT NULL
      AND (b.warehouse_classify='20' AND b.warehouseid NOT IN ('N436','Y204')) GROUP BY b.warehouseid
    ), overview_shortage_count AS (
      SELECT COUNT(*) AS shortage_sku_count FROM overview_shortage_skus AS c
      INNER JOIN overview_stock_scope AS w ON c.warehouse_code=w.warehouse_code
      WHERE c.shortage_qty>0 AND c.sku IS NOT NULL
      AND (:gea_p2 IS NULL OR c.warehouse_code=:gea_p2)
    ) SELECT 1 AS placeholder""", read='postgres')
    orders.args['with_'].set('expressions', orders.ctes + counts.ctes)
    orders.join('overview_shortage_count AS c', join_type='CROSS', copy=False)
    orders.select('MAX(c.shortage_sku_count) AS replenishment_shortage_sku_count', append=True, copy=False)
    for sub in list(orders.find_all(exp.Substring)):
        sub.replace(exp.Anonymous(this='SUBSTRING', expressions=[sub.this.copy(), sub.args['start'].copy(), sub.args['length'].copy()]))
    order['request']['sql'] = re.sub(r'%\((gea_p\d+)\)s', r':\1', orders.sql(dialect='postgres'))
    order['resultColumns'].append('replenishment_shortage_sku_count')
    fake['queries']['replenishment.summary'] = order
    compact.compact(fake)
    order = fake['queries']['replenishment.overview']
    order['title'] = '当前分仓订单卡片汇总'
    order['notes'] = '仅用于全部或指定分仓卡片；沿用 ASN、占用、FIFO 及未知值规则，不关联卡片未使用的商品属性。明细筛选仍使用原查询。'
    config['queries']['current-shortage.overview'] = order

    compact.FIXED = {}
    candidate = copy.deepcopy(config['queries']['replenishment.overview'])
    tree = sqlglot.parse_one(candidate['request']['sql'], read='postgres')
    tree.set('expressions', [e for e in tree.expressions if e.alias != 'known_shortage_sku_count'])
    for sub in list(tree.find_all(exp.Substring)):
        sub.replace(exp.Anonymous(this='SUBSTRING', expressions=[sub.this.copy(), sub.args['start'].copy(), sub.args['length'].copy()]))
    candidate['request']['sql'] = re.sub(r'%\((gea_p\d+)\)s', r':\1', tree.sql(dialect='postgres'))
    candidate['resultColumns'] = [c for c in candidate['resultColumns'] if c != 'known_shortage_sku_count']
    fake = {'queries': {'replenishment.summary': candidate}, 'sourceViews': {'views': [{'id': 'replenishment'}]}}
    compact.compact(fake)
    config['queries']['replenishment.overview'] = fake['queries']['replenishment.overview']
    config['queries']['replenishment.overview']['orderCountFromOverview'] = True
    config['queries']['branch-supply.summary']['priority'] = 35

    for name in ['source.branch-stock-date', 'branch-supply.summary',
                 'current-shortage.overview', 'replenishment.detail.atomic',
                 'replenishment.overview', 'health.cards']:
        config['queries'][name]['maxConcurrency'] = 2

if __name__ == '__main__':
    path = ROOT / 'business/inventory-fc/sql.config.json'
    config = json.loads(path.read_text())
    build(config)
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
