"""Regenerate governed SQL adapters for the published batch inventory schema."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'agents_scm_inventory_sku_data_d'


def ordinal(year, month, day):
    adjusted_year = f'({year} - CASE WHEN {month} <= 2 THEN 1 ELSE 0 END)'
    adjusted_month = f'({month} + CASE WHEN {month} > 2 THEN -3 ELSE 9 END)'
    return f'(365 * {adjusted_year} + FLOOR({adjusted_year} / 4.0) - FLOOR({adjusted_year} / 100.0) + FLOOR({adjusted_year} / 400.0) + FLOOR((153 * {adjusted_month} + 2) / 5.0) + {day})'


def adapter(predicate=''):
    # Civil-day ordinals use only gateway-approved arithmetic/functions and agree
    # across PostgreSQL and Doris; subtracting Doris DATEs subtracts YYYYMMDD.
    snapshot = ordinal('d.snapshot_year', 'd.snapshot_month', 'd.snapshot_day')
    production = ordinal('d.production_year', 'd.production_month', 'd.production_day')
    return f"""inventory_batch_dates AS (
SELECT b.warehouseid AS warehouseid, b.material_code AS material_code,
 b.warehouse_classify AS warehouse_classify, b.month_date AS month_date,
 b.live_qty AS live_qty, b.available_qty AS available_qty,
 b.pack_unit_qty AS pack_unit_qty, b.freeze_qty AS freeze_qty,
 CAST(SUBSTRING(b.month_date, 1, 4) AS INTEGER) AS snapshot_year,
 CAST(SUBSTRING(b.month_date, 5, 2) AS INTEGER) AS snapshot_month,
 CAST(SUBSTRING(b.month_date, 7, 2) AS INTEGER) AS snapshot_day,
 CAST(SUBSTRING(NULLIF(b.prod_date, ''), 1, 4) AS INTEGER) AS production_year,
 CAST(SUBSTRING(NULLIF(b.prod_date, ''), 6, 2) AS INTEGER) AS production_month,
 CAST(SUBSTRING(NULLIF(b.prod_date, ''), 9, 2) AS INTEGER) AS production_day
FROM {SOURCE} AS b
WHERE b.warehouse_classify IN ('01', '02', '20'){predicate}
), inventory_batch_ages AS (
SELECT d.warehouseid AS warehouseid, d.material_code AS material_code,
 d.warehouse_classify AS warehouse_classify, d.month_date AS month_date,
 d.live_qty AS live_qty, d.available_qty AS available_qty,
 d.pack_unit_qty AS pack_unit_qty, d.freeze_qty AS freeze_qty,
 CASE WHEN d.live_qty > 0 AND d.production_year > 0
 AND d.production_month BETWEEN 1 AND 12 AND d.production_day BETWEEN 1 AND 31
 AND {snapshot} >= {production} THEN {snapshot} - {production} ELSE NULL END AS age_days
FROM inventory_batch_dates AS d
), inventory_batch_totals AS (
SELECT CAST(CONCAT(SUBSTRING(a.month_date, 1, 4), '-', SUBSTRING(a.month_date, 5, 2), '-', SUBSTRING(a.month_date, 7, 2)) AS DATE) AS stat_date,
 a.warehouseid AS warehouseid, a.material_code AS material_code,
 CASE WHEN a.warehouse_classify IN ('01', '02') THEN '基地仓' ELSE '分仓' END AS warehouse_type,
 SUM(COALESCE(a.live_qty, 0)) AS total_qty,
 SUM(COALESCE(a.available_qty, 0)) AS available_qty,
 SUM(COALESCE(a.pack_unit_qty, 0)) AS pack_unit_qty,
 SUM(COALESCE(a.freeze_qty, 0)) AS freeze_qty,
 MAX(a.age_days) AS age_days
FROM inventory_batch_ages AS a
GROUP BY a.month_date, a.warehouseid, a.material_code,
 CASE WHEN a.warehouse_classify IN ('01', '02') THEN '基地仓' ELSE '分仓' END
), inventory_batch_names AS (
SELECT n.warehouseid AS warehouseid, n.material_code AS material_code,
 CASE WHEN COUNT(DISTINCT NULLIF(n.warehouse_name, '')) = 1 THEN MAX(NULLIF(n.warehouse_name, '')) ELSE NULL END AS warehouse_name,
 CASE WHEN COUNT(DISTINCT NULLIF(n.product_categ_name, '')) = 1 THEN MAX(NULLIF(n.product_categ_name, '')) ELSE NULL END AS product_categ_name,
 CASE WHEN COUNT(DISTINCT NULLIF(n.material_group_name, '')) = 1 THEN MAX(NULLIF(n.material_group_name, '')) ELSE NULL END AS material_group_name
FROM agents_scm_material_in_out_summary_d AS n GROUP BY n.warehouseid, n.material_code
), inventory_warehouse_bases AS (
SELECT s.warehouse AS warehouseid,
 CASE WHEN COUNT(DISTINCT NULLIF(s.belong_base, '')) = 1 THEN MAX(NULLIF(s.belong_base, '')) ELSE NULL END AS belong_base
FROM agents_scm_cust_deliv_daily_di AS s GROUP BY s.warehouse
), inventory_batch_source AS (
SELECT a.stat_date AS stat_date, a.warehouseid AS warehouseid,
 a.material_code AS material_code, a.warehouse_type AS warehouse_type,
 COALESCE(n.warehouse_name, a.warehouseid) AS warehouse_name, n.product_categ_name AS product_categ_name,
 n.material_group_name AS material_group_name, w.belong_base AS belong_base,
 a.total_qty AS total_qty, a.available_qty AS available_qty,
 a.pack_unit_qty AS pack_unit_qty, a.freeze_qty AS freeze_qty, a.age_days AS age_days,
 CAST(NULL AS INTEGER) AS is_overaged, CAST(NULL AS DECIMAL(18, 3)) AS overaged_qty,
 CAST(NULL AS INTEGER) AS is_low_stock, CAST(NULL AS INTEGER) AS is_high_stock,
 CAST(NULL AS DECIMAL(18, 3)) AS safe_stock_qty, CAST(NULL AS DECIMAL(18, 3)) AS target_stock_qty,
 CAST(NULL AS DECIMAL(18, 3)) AS current_stock,
 CAST(NULL AS VARCHAR(255)) AS source_updated_at, CAST(NULL AS VARCHAR(255)) AS update_time
FROM inventory_batch_totals AS a
LEFT JOIN inventory_batch_names AS n ON n.warehouseid = a.warehouseid AND n.material_code = a.material_code
LEFT JOIN inventory_warehouse_bases AS w ON w.warehouseid = a.warehouseid
)"""


def migrate(sql):
    if SOURCE not in sql or 'inventory_batch_source AS' in sql:
        return sql
    # Push snapshot equality into the physical scan, retaining named parameters.
    dates = re.findall(r'\b(?:t|h)\.stat_date\s*=\s*CAST\(:(gea_p\d+) AS DATE\)', sql, re.I)
    predicate = ''
    if dates and len(set(dates)) == 1:
        p = dates[0]
        predicate = f" AND b.month_date = REPLACE(CAST(:{p} AS VARCHAR(10)), '-', '')"
    fields = set(re.findall(r'\bt\.([a-z_]+)', sql))
    if fields <= {'stat_date', 'warehouse_type'}:
        prefix = f"""inventory_batch_source AS (
SELECT CAST(CONCAT(SUBSTRING(b.month_date, 1, 4), '-', SUBSTRING(b.month_date, 5, 2), '-', SUBSTRING(b.month_date, 7, 2)) AS DATE) AS stat_date,
 CASE WHEN b.warehouse_classify IN ('01', '02') THEN '基地仓' ELSE '分仓' END AS warehouse_type
FROM {SOURCE} AS b WHERE b.warehouse_classify IN ('01', '02', '20')
)"""
    else:
        prefix = adapter(predicate)
    sql = re.sub(r'\b' + SOURCE + r'\b', 'inventory_batch_source', sql)
    if sql.startswith('WITH '):
        return 'WITH ' + prefix + ', ' + sql[5:]
    return 'WITH ' + prefix + ' ' + sql


def main():
    for path in sorted((ROOT / 'business').glob('*/sql.config.json')):
        config = json.loads(path.read_text())
        changed = []
        for name, query in config.get('queries', {}).items():
            old = query.get('request', {}).get('sql', '')
            new = migrate(old)
            if new != old:
                query['request']['sql'] = new
                note = '批次现库存按仓库/SKU求和；01/02基地仓、20分仓，其它分类排除；正库存且生产日期有效的批次计算最大货龄。源已移除超龄阈值标志、安全/目标库存及更新时间，保持未知。'
                notes = query.get('notes', [])
                query['notes'] = [*notes, note] if isinstance(notes, list) else str(notes) + ' ' + note
                changed.append(name)
        if changed:
            path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
            print(path.parent.name, len(changed))


if __name__ == '__main__':
    main()
