/* inventory-branch-exclusions:N436,Y204 */
-- Current reported transfer quantities are pieces; historical execution orders are not this metric.
WITH transfer_stock_date AS (
 SELECT REPLACE(CAST(:gea_p2200 AS VARCHAR(10)), '-', '') AS month_date
), transfer_receivers AS (
 SELECT i.warehouseid AS warehouse_code,
 CASE WHEN COUNT(DISTINCT NULLIF(TRIM(i.warehouse_name), '')) = 1 THEN MAX(NULLIF(TRIM(i.warehouse_name), '')) ELSE NULL END AS warehouse_name
 FROM agents_scm_inventory_sku_data_d AS i
 INNER JOIN transfer_stock_date AS d ON i.month_date = d.month_date
 WHERE i.warehouse_classify = '20' AND i.warehouseid NOT IN ('N436', 'Y204')
 GROUP BY i.warehouseid
), transfer_reported AS (
 SELECT p.warehouseid AS warehouse_code, p.material_code AS sku,
 w.warehouse_name AS warehouse_name, p.material_name AS material_name,
 p.transfer_prepare_qty AS preparing, p.transfer_onway_qty AS in_transit
 FROM agents_scm_warehouse_transfer_plan_data_d AS p
 INNER JOIN transfer_receivers AS w ON p.warehouseid = w.warehouse_code
 WHERE p.stat_month = REPLACE(SUBSTRING(CAST(:gea_p2300 AS VARCHAR(10)), 1, 7), '-', '')
 AND NULLIF(TRIM(p.material_code), '') IS NOT NULL
), transfer_source_presence AS (
 SELECT COUNT(*) AS source_rows FROM transfer_reported AS t
), transfer_current_skus AS (
 SELECT t.warehouse_code AS warehouse_code, t.sku AS sku,
 MAX(t.warehouse_name) AS warehouse_name, MAX(t.material_name) AS material_name,
 CASE WHEN COUNT(DISTINCT CASE WHEN t.preparing >= 0 THEN t.preparing ELSE NULL END) = 1
 THEN MAX(CASE WHEN t.preparing >= 0 THEN t.preparing ELSE NULL END) ELSE NULL END AS preparing,
 CASE WHEN COUNT(DISTINCT CASE WHEN t.in_transit >= 0 THEN t.in_transit ELSE NULL END) = 1
 THEN MAX(CASE WHEN t.in_transit >= 0 THEN t.in_transit ELSE NULL END) ELSE NULL END AS in_transit
 FROM transfer_reported AS t
 GROUP BY t.warehouse_code, t.sku
)
SELECT t.warehouse_code AS warehouse_code, t.sku AS sku,
 t.warehouse_name AS warehouse_name, t.material_name AS material_name,
 t.preparing AS preparing, t.in_transit AS in_transit
FROM transfer_current_skus AS t
