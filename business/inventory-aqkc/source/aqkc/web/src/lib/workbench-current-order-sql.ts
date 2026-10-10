import type { WorkbenchSqlQuery } from './workbench-sql-types';

// Keep the shortage's usable inventory in the same base-warehouse scope as
// the inventory and age cards. This source has both base_name and warehouseid.
const branchWarehouses = `branch_warehouses AS (
  SELECT DISTINCT warehouseid AS warehouseid
  FROM agents_scm_branch_inventory_snapshot
  WHERE snapshot_date = (SELECT MAX(snapshot_date) AS snapshot_date FROM agents_scm_branch_inventory_snapshot)
    AND warehouse_classify = '20' AND warehouseid IS NOT NULL
)`;

/** Aggregate both sources before joining so inventory lots cannot multiply orders. */
const currentOrderCtes = `WITH ${branchWarehouses}, bases(pickup_point, base) AS (
  VALUES ('01','郑州'), ('02','华东'), ('03','西南'), ('37','遂平'), ('04','华南')
), pending_snapshot AS (
  SELECT MAX(source_snapshot_time) AS snapshot FROM agents_scm_branch_pending_order
), inventory_snapshot AS (
  SELECT MAX(snapshot_time) AS snapshot FROM agents_scm_inventory_age
), active_orders AS (
  SELECT b.base, NULLIF(BTRIM(p.material_code), '') AS material,
    p.order_qty, p.allocated_qty,
    BTRIM(p.bizflowstatus) <> 'OCP已下发' AS preparing
  FROM agents_scm_branch_pending_order p
  JOIN bases b ON b.pickup_point = BTRIM(p.pickup_point)
  WHERE p.source_snapshot_time = (SELECT snapshot FROM pending_snapshot)
    AND NULLIF(BTRIM(p.bizflowstatus), '') IS NOT NULL
    AND (BTRIM(p.bizflowstatus) <> 'OCP已下发'
      OR p.order_stage = 'PREPARED_UNSHIPPED')
), orders_by_base AS (
  SELECT base, SUM(CASE WHEN preparing THEN order_qty ELSE allocated_qty END) AS quantity, SUM(allocated_qty) AS allocated,
    SUM(CASE WHEN preparing THEN order_qty ELSE 0 END) AS preparing_quantity,
    COUNT(*) FILTER (WHERE preparing AND order_qty IS NULL) AS preparing_missing,
    COUNT(*) FILTER (WHERE (preparing AND order_qty IS NULL) OR (NOT preparing AND allocated_qty IS NULL)) AS missing,
    COUNT(*) FILTER (WHERE allocated_qty IS NULL) AS allocated_missing
  FROM active_orders GROUP BY base
), preparing_by_sku AS (
  SELECT base, material, SUM(CASE WHEN preparing THEN order_qty ELSE allocated_qty END) AS quantity, SUM(allocated_qty) AS allocated,
    SUM(CASE WHEN preparing THEN order_qty ELSE 0 END) AS preparing_quantity,
    COUNT(*) FILTER (WHERE preparing AND order_qty IS NULL) AS preparing_missing,
    COUNT(*) FILTER (WHERE order_qty IS NULL OR allocated_qty IS NULL OR material IS NULL) AS missing
  FROM active_orders WHERE preparing GROUP BY base, material
), normalized_inventory AS (
  SELECT age.base_name AS base, NULLIF(BTRIM(age.material_code), '') AS material, age.qtylive AS qtylive
  FROM agents_scm_inventory_age age
  LEFT JOIN branch_warehouses branch
    ON CAST(branch.warehouseid AS TEXT) = CAST(age.warehouseid AS TEXT)
  WHERE age.snapshot_time = (SELECT snapshot FROM inventory_snapshot)
    AND branch.warehouseid IS NULL
), inventory_by_sku AS (
  SELECT base, material,
    SUM(qtylive) AS available,
    COUNT(*) FILTER (WHERE qtylive IS NULL) AS missing
  FROM normalized_inventory
  GROUP BY base, material
), inventory_bases AS (
  SELECT DISTINCT base FROM inventory_by_sku
), shortage_by_base AS (
  SELECT p.base,
    SUM(GREATEST(0, -(COALESCE(i.available, 0) - (p.quantity - p.allocated)))) AS shortage,
    SUM(CASE WHEN p.missing > 0 OR i.missing > 0 OR ib.base IS NULL THEN 1 ELSE 0 END) AS missing
  FROM preparing_by_sku p
  LEFT JOIN inventory_by_sku i ON i.base = p.base AND i.material = p.material
  LEFT JOIN inventory_bases ib ON ib.base = p.base
  GROUP BY p.base
)`;

export const currentOrdersQuery: WorkbenchSqlQuery = {
  name: 'workbench-current-orders',
  maxRows: 5,
  sql: `${currentOrderCtes}
SELECT b.base AS "workbench.base",
  CASE WHEN ps.snapshot IS NULL OR o.missing > 0 THEN NULL ELSE COALESCE(o.quantity, 0) END AS "workbench.order_quantity",
  CASE WHEN ps.snapshot IS NULL OR o.preparing_missing > 0 THEN NULL ELSE COALESCE(o.preparing_quantity, 0) END AS "workbench.preparing_quantity",
  CASE WHEN ps.snapshot IS NULL OR o.allocated_missing > 0 THEN NULL ELSE COALESCE(o.allocated, 0) END AS "workbench.allocated_quantity",
  CASE WHEN ps.snapshot IS NULL OR s.missing > 0 THEN NULL ELSE COALESCE(s.shortage, 0) END AS "workbench.shortage_quantity",
  CAST(ps.snapshot AS TEXT) AS "workbench.order_snapshot",
  CAST(ins.snapshot AS TEXT) AS "workbench.inventory_snapshot"
FROM bases b
CROSS JOIN pending_snapshot ps CROSS JOIN inventory_snapshot ins
LEFT JOIN orders_by_base o ON o.base = b.base
LEFT JOIN shortage_by_base s ON s.base = b.base
ORDER BY b.base`,
};

/** Base markers distinguish a healthy snapshot with no SKU orders from a failed source. */
export const currentOrderSkuQuery: WorkbenchSqlQuery = {
  name: 'workbench-current-order-skus',
  maxRows: 25_000,
  sql: `${currentOrderCtes}, orders_by_sku AS (
  SELECT base, material, SUM(CASE WHEN preparing THEN order_qty ELSE allocated_qty END) AS quantity, SUM(allocated_qty) AS allocated,
    SUM(CASE WHEN preparing THEN order_qty ELSE 0 END) AS preparing_quantity,
    COUNT(*) FILTER (WHERE preparing AND order_qty IS NULL) AS preparing_missing,
    COUNT(*) FILTER (WHERE (preparing AND order_qty IS NULL) OR (NOT preparing AND allocated_qty IS NULL)) AS missing,
    COUNT(*) FILTER (WHERE allocated_qty IS NULL) AS allocated_missing
  FROM active_orders GROUP BY base, material
)
SELECT 'pending_base' AS "workbench.domain", b.base AS "workbench.base",
  CAST(NULL AS TEXT) AS "workbench.material_code",
  CASE WHEN ps.snapshot IS NULL THEN NULL ELSE 0 END AS "workbench.order_quantity",
  CASE WHEN ps.snapshot IS NULL THEN NULL ELSE 0 END AS "workbench.allocated_quantity",
  CASE WHEN ps.snapshot IS NULL THEN NULL ELSE 0 END AS "workbench.shortage_quantity"
FROM bases b CROSS JOIN pending_snapshot ps
UNION ALL
SELECT 'pending_sku', o.base, o.material,
  CASE WHEN o.missing > 0 THEN NULL ELSE o.quantity END,
  CASE WHEN o.allocated_missing > 0 THEN NULL ELSE o.allocated END,
  CASE WHEN p.base IS NULL THEN 0
    WHEN p.missing > 0 OR i.missing > 0 OR ib.base IS NULL THEN NULL
    ELSE GREATEST(0, COALESCE(p.quantity - p.allocated, 0) - COALESCE(i.available, 0)) END
FROM orders_by_sku o
LEFT JOIN preparing_by_sku p ON p.base = o.base AND p.material IS NOT DISTINCT FROM o.material
LEFT JOIN inventory_by_sku i ON i.base = o.base AND i.material = o.material
LEFT JOIN inventory_bases ib ON ib.base = o.base
ORDER BY "workbench.domain", "workbench.base", "workbench.material_code" NULLS FIRST`,
};
