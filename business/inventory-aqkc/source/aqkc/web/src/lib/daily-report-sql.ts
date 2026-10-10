import { BRANCH_WAREHOUSES, workbenchSql } from './workbench-sql';
import { currentOrderSkuQuery } from './workbench-current-order-sql';
import type { WorkbenchSqlQuery } from './workbench-sql-types';

// All queries are server-owned. GEA applies the session's row permissions to
// each source before aggregation. No browser-provided scope or SQL is accepted.
export const dailyReportSql = {
  stock: workbenchSql.safetyStockRows,
  age: {
    name: 'daily-report-age-skus',
    maxRows: 25_000,
    sql: `WITH ${BRANCH_WAREHOUSES}, latest_age AS (
  SELECT age.base_name AS base_name, age.material_code AS material_code,
    age.material_name AS material_name, age.product_categ_name AS product_categ_name,
    age.snapshot_time AS snapshot_time, age.qty AS qty, age.productage AS productage
  FROM agents_scm_inventory_age age
  LEFT JOIN branch_warehouses branch
    ON CAST(branch.warehouseid AS TEXT) = CAST(age.warehouseid AS TEXT)
  WHERE age.snapshot_time = (SELECT MAX(snapshot_time) AS snapshot_time FROM agents_scm_inventory_age)
    AND age.base_name IN ('华东','华南','西南','遂平','郑州')
    AND branch.warehouseid IS NULL
)
SELECT base_name AS base, material_code AS material,
  MAX(material_name) AS material_name, MAX(product_categ_name) AS category,
  CAST(MAX(snapshot_time) AS TEXT) AS snapshot,
  SUM(qty) AS inventory,
  SUM(CASE WHEN productage >= 0 AND productage <= 30 THEN qty ELSE 0 END) AS age_0,
  SUM(CASE WHEN productage > 30 AND productage <= 40 THEN qty ELSE 0 END) AS age_30,
  SUM(CASE WHEN productage > 40 AND productage <= 60 THEN qty ELSE 0 END) AS age_40,
  SUM(CASE WHEN productage > 60 THEN qty ELSE 0 END) AS age_60,
  SUM(CASE WHEN productage >= 0 AND productage + 7 > 60 THEN qty ELSE 0 END) AS natural_7,
  SUM(CASE WHEN productage >= 0 AND productage + 14 > 60 THEN qty ELSE 0 END) AS natural_14,
  SUM(CASE WHEN productage IS NULL OR productage < 0 THEN qty ELSE 0 END) AS age_unknown,
  SUM(CASE WHEN productage >= 0 THEN qty * productage ELSE 0 END) AS weighted_age,
  COUNT(*) FILTER (WHERE qty IS NULL OR qty < 0) AS invalid_quantity
FROM latest_age GROUP BY base_name, material_code
ORDER BY base_name, material_code`,
  },
  pending: {
    name: 'daily-report-current-orders',
    maxRows: 25_000,
    sql: `SELECT r.*,
  CAST((SELECT MAX(source_snapshot_time) FROM agents_scm_branch_pending_order) AS TEXT) AS "report.order_snapshot",
  CAST((SELECT MAX(snapshot_time) FROM agents_scm_inventory_age) AS TEXT) AS "report.inventory_snapshot"
FROM (${currentOrderSkuQuery.sql.replace('p.missing > 0 OR i.missing > 0 OR ib.base IS NULL THEN NULL', 'p.missing > 0 OR i.missing > 0 OR i.material IS NULL OR ib.base IS NULL OR p.quantity < 0 OR p.allocated < 0 OR i.available < 0 THEN NULL')}) r
ORDER BY "workbench.domain", "workbench.base", "workbench.material_code"`,
  },
  fulfillment: {
    name: 'daily-report-fulfillment',
    maxRows: 25_000,
    sql: `WITH latest_orders AS (
  SELECT * FROM agents_scm_order_fulfillment
  WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM agents_scm_order_fulfillment)
    AND (order_qty_origin > 0 OR need_qty_origin > 0)
    AND belong_base IN ('华东','华南','西南','遂平','郑州')
    AND fromorderno_month >= DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')
    AND fromorderno_month < DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai') + INTERVAL '1 month'
    AND pick_point_type2 = '工厂' AND product_categ_name <> '饺鲜说'
)
SELECT belong_base AS base, new_material_code AS material,
  CAST(MAX(snapshot_time) AS TEXT) AS snapshot,
  SUM(need_qty_origin) AS need, SUM(outqty) AS shortage,
  COUNT(*) FILTER (WHERE need_qty_origin IS NULL OR outqty IS NULL OR need_qty_origin < 0 OR outqty < 0) AS invalid_quantity
FROM latest_orders GROUP BY belong_base, new_material_code
ORDER BY belong_base, new_material_code`,
  },
} satisfies Record<string, WorkbenchSqlQuery>;
