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


def adapter(predicate='', branch_risks=False):
    # Civil-day ordinals use only gateway-approved arithmetic/functions and agree
    # across PostgreSQL and Doris; subtracting Doris DATEs subtracts YYYYMMDD.
    snapshot = ordinal('d.snapshot_year', 'd.snapshot_month', 'd.snapshot_day')
    production = ordinal('d.production_year', 'd.production_month', 'd.production_day')
    sql = f"""inventory_batch_dates AS (
SELECT b.warehouseid AS warehouseid, b.material_code AS material_code,
 b.month_date AS month_date,
 b.warehouse_name AS warehouse_name, b.belong_base AS belong_base, b.material_name AS material_name,
 b.live_qty AS live_qty, b.available_qty AS available_qty,
 b.pack_unit_qty AS pack_unit_qty, b.freeze_qty AS freeze_qty,
 CAST(SUBSTRING(b.month_date, 1, 4) AS INTEGER) AS snapshot_year,
 CAST(SUBSTRING(b.month_date, 5, 2) AS INTEGER) AS snapshot_month,
 CAST(SUBSTRING(b.month_date, 7, 2) AS INTEGER) AS snapshot_day,
 CAST(SUBSTRING(NULLIF(b.prod_date, ''), 1, 4) AS INTEGER) AS production_year,
 CAST(SUBSTRING(NULLIF(b.prod_date, ''), 6, 2) AS INTEGER) AS production_month,
 CAST(SUBSTRING(NULLIF(b.prod_date, ''), 9, 2) AS INTEGER) AS production_day
FROM {SOURCE} AS b
WHERE TRUE{predicate}
), inventory_batch_ages AS (
SELECT d.warehouseid AS warehouseid, d.material_code AS material_code,
 d.month_date AS month_date,
 d.warehouse_name AS warehouse_name, d.belong_base AS belong_base, d.material_name AS material_name,
 d.live_qty AS live_qty, d.available_qty AS available_qty,
 d.pack_unit_qty AS pack_unit_qty, d.freeze_qty AS freeze_qty,
 CASE WHEN d.live_qty > 0 AND d.production_year > 0
 AND d.production_month BETWEEN 1 AND 12 AND d.production_day BETWEEN 1 AND 31
 AND {snapshot} >= {production} THEN {snapshot} - {production} ELSE NULL END AS age_days
FROM inventory_batch_dates AS d
), inventory_batch_totals AS (
SELECT CAST(CONCAT(SUBSTRING(a.month_date, 1, 4), '-', SUBSTRING(a.month_date, 5, 2), '-', SUBSTRING(a.month_date, 7, 2)) AS DATE) AS stat_date,
 a.warehouseid AS warehouseid, a.material_code AS material_code,
 CASE WHEN COUNT(DISTINCT NULLIF(TRIM(a.warehouse_name), '')) = 1 THEN MAX(NULLIF(TRIM(a.warehouse_name), '')) ELSE NULL END AS warehouse_name,
 CASE WHEN COUNT(DISTINCT NULLIF(TRIM(a.belong_base), '')) = 1 THEN MAX(NULLIF(TRIM(a.belong_base), '')) ELSE NULL END AS belong_base,
 CASE WHEN COUNT(DISTINCT NULLIF(TRIM(a.material_name), '')) = 1 THEN MAX(NULLIF(TRIM(a.material_name), '')) ELSE NULL END AS material_name,
 SUM(COALESCE(a.live_qty, 0)) AS total_qty,
 SUM(COALESCE(a.available_qty, 0)) AS available_qty,
 SUM(COALESCE(a.pack_unit_qty, 0)) AS pack_unit_qty,
 SUM(COALESCE(a.freeze_qty, 0)) AS freeze_qty,
 MAX(a.age_days) AS age_days
FROM inventory_batch_ages AS a
GROUP BY a.month_date, a.warehouseid, a.material_code
), inventory_batch_names AS (
SELECT n.warehouseid AS warehouseid, n.material_code AS material_code,
 CASE WHEN COUNT(DISTINCT NULLIF(n.product_categ_name, '')) = 1 THEN MAX(NULLIF(n.product_categ_name, '')) ELSE NULL END AS product_categ_name,
 CASE WHEN COUNT(DISTINCT NULLIF(n.material_group_name, '')) = 1 THEN MAX(NULLIF(n.material_group_name, '')) ELSE NULL END AS material_group_name
FROM agents_scm_material_in_out_summary_d AS n GROUP BY n.warehouseid, n.material_code
), inventory_batch_source AS (
SELECT a.stat_date AS stat_date, a.warehouseid AS warehouseid,
 a.material_code AS material_code, a.warehouseid AS warehouse_type,
 COALESCE(a.warehouse_name, a.warehouseid) AS warehouse_name, a.material_name AS material_name,
 n.product_categ_name AS product_categ_name,
 n.material_group_name AS material_group_name, a.belong_base AS belong_base,
 a.total_qty AS total_qty, a.available_qty AS available_qty,
 a.pack_unit_qty AS pack_unit_qty, a.freeze_qty AS freeze_qty, a.age_days AS age_days,
 CAST(NULL AS INTEGER) AS is_overaged, CAST(NULL AS DECIMAL(18, 3)) AS overaged_qty,
 CAST(NULL AS INTEGER) AS is_low_stock, CAST(NULL AS INTEGER) AS is_high_stock,
 CAST(NULL AS DECIMAL(18, 3)) AS safe_stock_qty, CAST(NULL AS DECIMAL(18, 3)) AS target_stock_qty,
 CAST(NULL AS DECIMAL(18, 3)) AS current_stock,
 CAST(NULL AS VARCHAR(255)) AS source_updated_at, CAST(NULL AS VARCHAR(255)) AS update_time
FROM inventory_batch_totals AS a
LEFT JOIN inventory_batch_names AS n ON n.warehouseid = a.warehouseid AND n.material_code = a.material_code
)"""

    if branch_risks:
        # Original branch rules: >=60 days is big-date stock; >=90 is stagnant.
        # Sum positive batch quantities before grouping; SKU maximum age is not a quantity classifier.
        sql = sql.replace('MAX(a.age_days) AS age_days', "MAX(a.age_days) AS age_days,\n SUM(CASE WHEN a.age_days >= 60 THEN a.live_qty ELSE 0 END) AS overaged_qty,\n SUM(CASE WHEN a.age_days >= 90 THEN a.live_qty ELSE 0 END) AS stagnant_qty")
        sql = sql.replace('CAST(NULL AS INTEGER) AS is_overaged, CAST(NULL AS DECIMAL(18, 3)) AS overaged_qty', 'CASE WHEN a.overaged_qty > 0 THEN 1 ELSE 0 END AS is_overaged, a.overaged_qty AS overaged_qty, a.stagnant_qty AS stagnant_qty')
    return sql


def migrate(sql, branch_risks=False):
    if SOURCE not in sql:
        return sql
    if 'inventory_batch_dates AS (' in sql:
        # Refresh the adapter in already migrated configs without replacing
        # newer downstream queries with an older frozen SQL configuration.
        end = sql.index('\n)', sql.index('), inventory_batch_source AS (')) + 2
        prefix, rest = sql[:end], sql[end:]
        predicate = re.search(r" AND b\.month_date = REPLACE\(CAST\(:gea_p\d+ AS VARCHAR\(10\)\), '-', ''\)", prefix)
        return 'WITH ' + adapter(predicate.group(0) if predicate else '', branch_risks) + rest
    if 'inventory_batch_source AS' in sql:
        # Calendar adapters expose only snapshot date and the legacy grouping
        # alias; that alias now contains the source warehouse code, not a type.
        sql = sql.replace("CASE WHEN b.warehouse_classify IN ('01', '02') THEN '基地仓' ELSE '分仓' END AS warehouse_type", 'b.warehouseid AS warehouse_type')
        sql = sql.replace("NULLIF(TRIM(b.warehouse_name), '') AS warehouse_type", 'b.warehouseid AS warehouse_type')
        return sql.replace(" WHERE b.warehouse_classify IN ('01', '02', '20')", '')
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
 b.warehouseid AS warehouse_type
FROM {SOURCE} AS b
)"""
    else:
        prefix = adapter(predicate, branch_risks)
    sql = re.sub(r'\b' + SOURCE + r'\b', 'inventory_batch_source', sql)
    if sql.startswith('WITH '):
        return 'WITH ' + prefix + ', ' + sql[5:]
    return 'WITH ' + prefix + ' ' + sql


def attribution_columns(sql, query_id):
    if 'inventory_batch_dates AS (' not in sql:
        return sql

    def project(cte, column):
        nonlocal sql
        pattern = r'(\b' + cte + r' AS \(SELECT )(.*?)( FROM )'
        def add(match):
            if re.search(r'\bAS ' + column.rsplit(' AS ', 1)[1] + r'\b', match[2]):
                return match[0]
            return match[1] + match[2] + ', ' + column + match[3]
        sql = re.sub(pattern, add, sql)

    unique_name = "CASE WHEN COUNT(DISTINCT NULLIF(TRIM(t.material_name), '')) = 1 THEN MAX(NULLIF(TRIM(t.material_name), '')) ELSE NULL END AS material_name"
    if query_id.startswith('health.detail'):
        project('business_rows', unique_name)
        project('filtered', 'r.material_name AS material_name')
        sql = sql.replace('n.material_name AS material_name', 'COALESCE(r.material_name, n.material_name) AS material_name')
    if query_id.startswith('replenishment.'):
        project('branch_stock', unique_name)
        sql = sql.replace('COALESCE(s.warehouse_name, h.warehouse_name)', 'COALESCE(h.warehouse_name, s.warehouse_name)')
        sql = sql.replace("COALESCE(NULLIF(TRIM(s.material_name), ''), sh.material_name, n.material_name)", "COALESCE(NULLIF(TRIM(h.material_name), ''), NULLIF(TRIM(s.material_name), ''), sh.material_name, n.material_name)")
    if query_id.startswith('page.branch'):
        project('branch_skus', "CASE WHEN COUNT(DISTINCT NULLIF(TRIM(t.belong_base), '')) = 1 THEN MAX(NULLIF(TRIM(t.belong_base), '')) ELSE NULL END AS belong_base")
        sql = sql.replace('CAST(NULL AS TEXT) AS base', 's.belong_base AS base')
        sql = sql.replace('GROUP BY s.warehouse, s.warehouse_name, s.product_categ_name)', 'GROUP BY s.warehouse, s.warehouse_name, s.product_categ_name, s.belong_base)')
    return sql


def source_dimensions(query):
    sql = query['request']['sql']
    if 'inventory_batch_source AS' not in sql:
        return
    # Warehouses join by source ID and bases by source name. Classification
    # codes do not select disjoint base/warehouse inventory populations.
    sql = re.sub(r"\b([a-z]+)\.warehouse_type\s*=\s*'分仓'", r"NULLIF(TRIM(\1.warehouseid), '') IS NOT NULL", sql)
    sql = re.sub(r"NULLIF\(TRIM\(([a-z]+)\.warehouse_name\), ''\) IS NOT NULL", r"NULLIF(TRIM(\1.warehouseid), '') IS NOT NULL", sql)
    sql = re.sub(r"\b([a-z]+)\.warehouse_type\s*=\s*'基地仓'", r"NULLIF(TRIM(\1.belong_base), '') IS NOT NULL", sql)
    # Date-only adapters need the corresponding dimension when used to choose
    # a base/warehouse snapshot.
    if 'inventory_batch_dates AS (' not in sql:
        if 'b.warehouseid AS warehouseid' not in sql:
            sql = sql.replace('b.warehouseid AS warehouse_type', 'b.warehouseid AS warehouse_type, b.warehouseid AS warehouseid')
        if 'b.belong_base AS belong_base' not in sql:
            sql = sql.replace('b.warehouseid AS warehouse_type', 'b.warehouseid AS warehouse_type, b.belong_base AS belong_base')
    if any(s['name'] in ('warehouse_type_mode', 'warehouse_name_mode') for s in query['parameterSpec'].values()):
        sql = re.sub(r'\br\.(?:warehouse_type|warehouse_name)(?=\s*(?:=\s*:gea_p5|IS NULL))', 'r.warehouseid', sql)
    for spec in query['parameterSpec'].values():
        if spec['name'] in ('warehouse_type_mode', 'warehouse_name_mode'):
            spec['name'] = 'warehouse_code_mode'
        elif spec['name'] in ('warehouse_type', 'warehouse_name'):
            spec['name'] = 'warehouse_code'
        if spec['name'] == 'warehouse_code' and spec.get('example') in ('基地仓', '分仓'):
            spec['example'] = 'A020'
    query['request']['sql'] = sql


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--agent', choices=[p.name for p in (ROOT / 'business').iterdir() if (p / 'sql.config.json').exists()])
    selected = parser.parse_args().agent
    for path in sorted((ROOT / 'business').glob('*/sql.config.json')):
        if selected and path.parent.name != selected:
            continue
        config = json.loads(path.read_text())
        before = json.dumps(config, ensure_ascii=False)
        changed = []
        for name, query in config.get('queries', {}).items():
            if name.startswith('current-shortage.'):
                continue  # This source owns raw batch identities for the three-stage calculation.
            old = query.get('request', {}).get('sql', '')
            branch_risks = path.parent.name == 'inventory-fc'
            new = attribution_columns(migrate(old, branch_risks), name)
            if branch_risks and name == 'health.summary':
                if 't.stagnant_qty' not in new:
                    new = new.replace('MAX(t.source_updated_at) AS source_updated_at FROM inventory_batch_source', 'MAX(t.source_updated_at) AS source_updated_at, MAX(t.stagnant_qty) AS stagnant_qty FROM inventory_batch_source')
                    new = new.replace('r.overaged_qty AS overaged_qty,', 'r.overaged_qty AS overaged_qty, r.stagnant_qty AS stagnant_qty,')
                    end = new.rfind(' FROM filtered AS r')
                    new = new[:end] + ', SUM(COALESCE(r.stagnant_qty, 0)) AS stagnant_qty' + new[end:]
                if 'stagnant_qty' not in query['resultColumns']:
                    query['resultColumns'].append('stagnant_qty')
            notes = query.get('notes', [])
            new_notes = notes
            if 'inventory_batch_dates AS (' in new:
                note = '批次现库存按仓库/SKU求和；不按 warehouse_classify 过滤或归类；分仓用 warehouseid 编码关联和筛选、warehouse_name 展示名称；基地用 belong_base 名称关联和筛选；商品名称取 material_name；基地与分仓为同一事实集的维度，不重复相加；正库存且生产日期有效的批次计算最大货龄。源已移除超龄阈值标志、安全/目标库存及更新时间，保持未知。'
                if branch_risks:
                    note = note.replace('源已移除超龄阈值标志、安全/目标库存及更新时间，保持未知。', '按原分仓规则逐批次汇总60天及以上超龄库存、90天及以上滞库库存；非正库存或无有效货龄的批次数量不计入风险量。安全/目标库存及更新时间仍保持未知。')
                if isinstance(notes, list):
                    new_notes = [x for x in notes if not x.startswith('批次现库存按仓库/SKU求和；')] + [note]
                else:
                    new_notes = str(notes).split(' 批次现库存按仓库/SKU求和；', 1)[0] + ' ' + note
                    if name.startswith('health.detail'):
                        new_notes = new_notes.replace('名称优先取当前订单中的唯一非空SKU名称，订单无名称时才补出入库来源唯一名称，订单名称冲突不回退。', '名称优先取库存快照商品名，源缺值时沿用原唯一SKU字典补充。')
            if new != old or new_notes != notes:
                query['request']['sql'] = new
                query['notes'] = new_notes
                changed.append(name)
            source_dimensions(query)
        for view in config.get('sourceViews', {}).get('views', []):
            if not (view.get('queryId') or '').startswith('health.'):
                continue
            overrides = view.get('overrides', {})
            overrides.pop('warehouse_type_mode', None)
            overrides.pop('warehouse_type', None)
            if view.get('inheritProductionBaseFilter') is False:
                view['inheritProductionBaseFilter'] = True
            view['filters'] = [f for f in view.get('filters', []) if f['name'] != 'warehouse_name']
            if not any(f['name'] == 'warehouse_code' for f in view['filters']):
                view['filters'].append({'name': 'warehouse_code', 'label': '分仓编码'})
            for col in view.get('columns', []):
                if col['field'] == 'warehouse_type':
                    col['label'] = '分仓编码'
                if col['field'] == 'warehouse_name':
                    col['label'] = '分仓名称'
            view['defaultColumns'] = [x for x in view.get('defaultColumns', []) if x != 'warehouse_type']
            view['description'] = view.get('description', '').replace('01/02为基地仓、20为分仓，忽略其它分类。', '不按仓库分类编码过滤；基地按所属基地名称、分仓按仓库编码取值。').replace('基地按所属基地、分仓按仓库名称取值。', '基地按所属基地名称、分仓按仓库编码取值。')
        if before != json.dumps(config, ensure_ascii=False):
            path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
            print(path.parent.name, len(changed))


if __name__ == '__main__':
    main()
