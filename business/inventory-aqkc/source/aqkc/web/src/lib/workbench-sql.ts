import { currentOrdersQuery, currentOrderSkuQuery } from './workbench-current-order-sql';
import type { WorkbenchSqlQuery } from './workbench-sql-types';

const LATEST_SAFETY_STOCK = `
WITH latest_safety_stock AS (
  SELECT *
  FROM agents_scm_safety_stock
  WHERE inventory_snapshot_time = (
    SELECT MAX(inventory_snapshot_time)
    FROM agents_scm_safety_stock
  )
)`;

// warehouse_classify='20' is the published branch-warehouse classification.
// Match physical warehouse IDs before assigning age stock to a production base:
// OCP can label a branch lot with the supplying base_name.
export const BRANCH_WAREHOUSES = `branch_warehouses AS (
  SELECT DISTINCT warehouseid AS warehouseid
  FROM agents_scm_branch_inventory_snapshot
  WHERE snapshot_date = (SELECT MAX(snapshot_date) AS snapshot_date FROM agents_scm_branch_inventory_snapshot)
    AND warehouse_classify = '20'
    AND warehouseid IS NOT NULL
)`;

const LATEST_INVENTORY_AGE = `
WITH ${BRANCH_WAREHOUSES}, latest_inventory_age AS (
  SELECT age.base_name AS base_name, age.product_categ_name AS product_categ_name,
    age.material_code AS material_code, age.material_name AS material_name,
    age.qty AS qty, age.productage AS productage
  FROM agents_scm_inventory_age age
  LEFT JOIN branch_warehouses branch
    ON CAST(branch.warehouseid AS TEXT) = CAST(age.warehouseid AS TEXT)
  WHERE age.snapshot_time = (
    SELECT MAX(snapshot_time) AS snapshot_time FROM agents_scm_inventory_age
  ) AND branch.warehouseid IS NULL
)`;

export const workbenchSql = {
  currentOrders: currentOrdersQuery,
  currentOrderSkus: currentOrderSkuQuery,
  scope: {
    name: 'workbench-scope',
    maxRows: 100,
    sql: `${LATEST_SAFETY_STOCK}
SELECT
  target_month AS "safety_stock.target_month",
  inventory_version AS "safety_stock.inventory_version",
  COUNT(*) AS "safety_stock.record_count"
FROM latest_safety_stock
WHERE base_name IN ('华东', '华南', '西南', '遂平', '郑州')
GROUP BY target_month, inventory_version
ORDER BY target_month, inventory_version`,
  },
  safetyStockRows: {
    name: 'workbench-safety-stock-rows',
    // Latest snapshots now include >25k rows across months/versions; keep a finite
    // full-result bound shared by GEA and direct reads instead of truncating them.
    maxRows: 50_000,
    sql: `${LATEST_SAFETY_STOCK}
SELECT
  id AS "safety_stock.id",
  CAST(inventory_snapshot_time AS TEXT) AS "safety_stock.snapshot_time",
  target_month AS "safety_stock.target_month",
  base_name AS "safety_stock.base_name",
  material_code AS "safety_stock.material_code",
  material_name AS "safety_stock.material_name",
  product_categ_name AS "safety_stock.product_categ_name",
  product_label AS "safety_stock.product_label",
  inventory_version AS "safety_stock.inventory_version",
  1 AS "safety_stock.record_count",
  current_inventory AS "safety_stock.current_inventory",
  target_inventory AS "safety_stock.target_inventory",
  management_target_inventory AS "safety_stock.management_target_inventory",
  final_target_inventory AS "safety_stock.final_target_inventory",
  safety_stock AS "safety_stock.safety_stock_amount",
  turnover_inventory AS "safety_stock.turnover_inventory",
  current_inventory - COALESCE(final_target_inventory, 0) AS "safety_stock.inventory_gap_to_final_target",
  avg_daily_planned_demand AS "safety_stock.planned_daily_demand",
  current_turnover_days AS "safety_stock.average_current_turnover_days",
  target_fill_rate AS "safety_stock.average_target_fill_rate",
  avg_30d_sale * 30 AS "safety_stock.last_30d_shipment_quantity",
  SUM(avg_30d_sale * 30) OVER (
    PARTITION BY target_month, inventory_version, base_name
  ) AS "safety_stock.last_30d_shipment_volume"
FROM latest_safety_stock
ORDER BY base_name, material_code, inventory_version, id`,
  },
  supportByBase: (days: number): WorkbenchSqlQuery => ({
    name: 'workbench-support-by-base',
    maxRows: 200,
    sql: `WITH ${BRANCH_WAREHOUSES}, latest_inventory_age AS (
  SELECT age.base_name AS base_name, age.qty AS qty, age.productage AS productage
  FROM agents_scm_inventory_age age
  LEFT JOIN branch_warehouses branch
    ON CAST(branch.warehouseid AS TEXT) = CAST(age.warehouseid AS TEXT)
  WHERE age.snapshot_time = (SELECT MAX(snapshot_time) AS snapshot_time FROM agents_scm_inventory_age)
    AND branch.warehouseid IS NULL
), latest_order_fulfillment AS (
  SELECT *
  FROM agents_scm_order_fulfillment
  WHERE snapshot_date = (
    SELECT MAX(snapshot_date)
    FROM agents_scm_order_fulfillment
  )
  AND (order_qty_origin > 0 OR need_qty_origin > 0)
), age_by_base AS (
  SELECT
    base_name,
    SUM(qty * productage) AS weighted_age_total,
    SUM(qty) AS inventory_quantity,
    SUM(CASE WHEN productage > ${Math.max(0, Math.floor(days))} THEN 1 ELSE 0 END) AS over_age_record_count,
    SUM(CASE WHEN productage > ${Math.max(0, Math.floor(days))} THEN qty ELSE 0 END) AS over_age_inventory
  FROM latest_inventory_age
  GROUP BY base_name
), order_by_base AS (
  SELECT
    belong_base AS base_name,
    SUM(order_qty_origin) AS order_quantity,
    SUM(need_qty_origin) AS need_quantity,
    SUM(outqty) AS shortage_quantity,
    SUM(CASE WHEN qtyshipped > 0 THEN order_qty_origin ELSE 0 END) AS shipped_order_quantity,
    SUM(CASE WHEN qtyshipped > 0 THEN qtyshipped ELSE 0 END) AS shipped_quantity
  FROM latest_order_fulfillment
  WHERE belong_base IN ('华东', '华南', '西南', '遂平', '郑州')
    AND fromorderno_month >= DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')
    AND fromorderno_month < DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai') + INTERVAL '1 month'
    AND pick_point_type2 = '工厂'
    AND product_categ_name <> '饺鲜说'
  GROUP BY belong_base
)
SELECT
  'age' AS "workbench.domain",
  base_name AS "workbench.base",
  weighted_age_total AS "workbench.weighted_age_total",
  inventory_quantity AS "workbench.inventory_quantity",
  over_age_record_count AS "workbench.over_age_record_count",
  over_age_inventory AS "workbench.over_age_inventory",
  CAST(NULL AS NUMERIC) AS "workbench.order_quantity",
  CAST(NULL AS NUMERIC) AS "workbench.need_quantity",
  CAST(NULL AS NUMERIC) AS "workbench.shortage_quantity",
  CAST(NULL AS NUMERIC) AS "workbench.shipped_order_quantity",
  CAST(NULL AS NUMERIC) AS "workbench.shipped_quantity"
FROM age_by_base
UNION ALL
SELECT
  'order' AS "workbench.domain",
  base_name AS "workbench.base",
  CAST(NULL AS NUMERIC) AS "workbench.weighted_age_total",
  CAST(NULL AS NUMERIC) AS "workbench.inventory_quantity",
  CAST(NULL AS NUMERIC) AS "workbench.over_age_record_count",
  CAST(NULL AS NUMERIC) AS "workbench.over_age_inventory",
  COALESCE(order_quantity, 0) AS "workbench.order_quantity",
  need_quantity AS "workbench.need_quantity",
  COALESCE(shortage_quantity, 0) AS "workbench.shortage_quantity",
  shipped_order_quantity AS "workbench.shipped_order_quantity",
  shipped_quantity AS "workbench.shipped_quantity"
FROM order_by_base
ORDER BY "workbench.domain", "workbench.base"`,
  }),
  orderStructure: {
    name: 'workbench-order-structure',
    maxRows: 25_000,
    sql: `WITH latest_order_fulfillment AS (
  SELECT *
  FROM agents_scm_order_fulfillment
  WHERE snapshot_date = (
    SELECT MAX(snapshot_date)
    FROM agents_scm_order_fulfillment
  )
  AND (order_qty_origin > 0 OR need_qty_origin > 0)
)
SELECT
  belong_base AS "workbench.base",
  product_categ_name AS "workbench.category",
  new_material_code AS "workbench.material_code",
  new_material_name AS "workbench.material_name",
  SUM(order_qty_origin) AS "workbench.order_quantity",
  SUM(need_qty_origin) AS "workbench.need_quantity",
  SUM(outqty) AS "workbench.shortage_quantity"
FROM latest_order_fulfillment
WHERE belong_base IN ('华东', '华南', '西南', '遂平', '郑州')
  AND fromorderno_month >= DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')
  AND fromorderno_month < DATE_TRUNC('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai') + INTERVAL '1 month'
  AND pick_point_type2 = '工厂'
  AND product_categ_name <> '饺鲜说'
GROUP BY belong_base, product_categ_name, new_material_code, new_material_name
ORDER BY belong_base, product_categ_name, new_material_code`,
  },
  ageStructure: (overAgeDays: number): WorkbenchSqlQuery => ({
    name: 'workbench-age-structure',
    maxRows: 25_000,
    sql: `${LATEST_INVENTORY_AGE},
latest_safety_stock AS (
  SELECT *
  FROM (
    SELECT
      base_name,
      material_code,
      avg_30d_sale,
      ROW_NUMBER() OVER (
        PARTITION BY base_name, material_code
        ORDER BY target_month DESC,
          CASE
            WHEN inventory_version LIKE '%滚动%' THEN 3
            WHEN inventory_version LIKE '%纠偏%' THEN 2
            WHEN inventory_version LIKE '%月初%' THEN 1
            ELSE 0
          END DESC,
          id DESC
      ) AS version_rank
    FROM agents_scm_safety_stock
    WHERE inventory_snapshot_time = (
      SELECT MAX(inventory_snapshot_time)
      FROM agents_scm_safety_stock
    )
  ) ranked
  WHERE version_rank = 1
)
SELECT
  age.base_name AS "inventory_age.base_name",
  age.product_categ_name AS "inventory_age.product_categ_name",
  age.material_code AS "inventory_age.material_code",
  age.material_name AS "inventory_age.material_name",
  COUNT(*) AS "inventory_age.record_count",
  SUM(age.qty * age.productage) AS "inventory_age.weighted_age_total",
  SUM(age.qty) AS "inventory_age.current_inventory",
  SUM(CASE WHEN age.productage BETWEEN 0 AND 30 THEN age.qty ELSE 0 END) AS "inventory_age.age_0_30",
  SUM(CASE WHEN age.productage BETWEEN 31 AND 40 THEN age.qty ELSE 0 END) AS "inventory_age.age_31_40",
  SUM(CASE WHEN age.productage BETWEEN 41 AND 60 THEN age.qty ELSE 0 END) AS "inventory_age.age_41_60",
  SUM(CASE WHEN age.productage > 60 THEN age.qty ELSE 0 END) AS "inventory_age.age_60_plus",
  SUM(CASE WHEN age.productage <= ${Math.max(0, Math.floor(overAgeDays))} AND age.productage + 7 > ${Math.max(0, Math.floor(overAgeDays))} THEN age.qty ELSE 0 END) AS "inventory_age.future_7_overage",
  SUM(CASE WHEN age.productage <= ${Math.max(0, Math.floor(overAgeDays))} AND age.productage + 14 > ${Math.max(0, Math.floor(overAgeDays))} THEN age.qty ELSE 0 END) AS "inventory_age.future_14_overage",
  MAX(stock.avg_30d_sale) * 30 AS "inventory_age.last_30d_sales"
FROM latest_inventory_age age
LEFT JOIN latest_safety_stock stock
  ON stock.base_name = age.base_name
  AND CAST(stock.material_code AS TEXT) = CAST(age.material_code AS TEXT)
GROUP BY age.base_name, age.product_categ_name, age.material_code, age.material_name
ORDER BY age.base_name, age.product_categ_name, age.material_code`,
  }),
} satisfies Record<string, WorkbenchSqlQuery | ((value: number) => WorkbenchSqlQuery)>;

/** Retry an omitted base through the same governed resource and consumer. */
export function safetyStockRowsForBase(base: string): WorkbenchSqlQuery {
  return {
    name: 'workbench-safety-stock-base-retry',
    maxRows: 10_000,
    parameters: { gea_p1: base },
    sql: `WITH latest_snapshot AS (
  SELECT MAX(inventory_snapshot_time) AS snapshot_time
  FROM agents_scm_safety_stock
)
SELECT
  stock.id AS "safety_stock.id",
  CAST(stock.inventory_snapshot_time AS TEXT) AS "safety_stock.snapshot_time",
  stock.target_month AS "safety_stock.target_month",
  stock.base_name AS "safety_stock.base_name",
  stock.material_code AS "safety_stock.material_code",
  stock.material_name AS "safety_stock.material_name",
  stock.product_categ_name AS "safety_stock.product_categ_name",
  stock.product_label AS "safety_stock.product_label",
  stock.inventory_version AS "safety_stock.inventory_version",
  1 AS "safety_stock.record_count",
  stock.current_inventory AS "safety_stock.current_inventory",
  stock.target_inventory AS "safety_stock.target_inventory",
  stock.management_target_inventory AS "safety_stock.management_target_inventory",
  stock.final_target_inventory AS "safety_stock.final_target_inventory",
  stock.safety_stock AS "safety_stock.safety_stock_amount",
  stock.turnover_inventory AS "safety_stock.turnover_inventory",
  stock.current_inventory - COALESCE(stock.final_target_inventory, 0) AS "safety_stock.inventory_gap_to_final_target",
  stock.avg_daily_planned_demand AS "safety_stock.planned_daily_demand",
  stock.current_turnover_days AS "safety_stock.average_current_turnover_days",
  stock.target_fill_rate AS "safety_stock.average_target_fill_rate",
  stock.avg_30d_sale * 30 AS "safety_stock.last_30d_shipment_quantity"
FROM agents_scm_safety_stock AS stock
INNER JOIN latest_snapshot AS latest ON stock.inventory_snapshot_time = latest.snapshot_time
WHERE stock.base_name = :gea_p1
ORDER BY stock.material_code, stock.inventory_version, stock.id`,
  };
}

export type WorkbenchSqlName = keyof typeof workbenchSql;
