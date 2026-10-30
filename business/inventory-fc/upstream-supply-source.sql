WITH supply_scoped AS (
 SELECT e.receive_wh AS warehouse_code, e.executeorderno AS order_no, e.executeorderlineno AS line_no, e.material_code AS sku, e.material_name AS material_name, e.warehouseid AS base_warehouse, e.belong_base AS base, e.order_type AS order_type, e.header_addtime AS created_at, e.load_time AS source_updated_at, e.qtyordered AS ordered_ea, e.qtyshipped AS shipped_ea, e.qtysigned AS signed_ea, e.qtyallocated AS allocated_ea, e.packingunitconvertrate AS conversion_rate, e.packingunitmain AS quantity_unit, e.prapare_order_status AS order_status, e.detailstatus AS detail_status, e.orderstatus AS header_status, e.canceltime AS cancel_time, e.bizflowstatus AS flow_status
 FROM agents_scm_execute_detail_hourly_d AS e
 WHERE e.order_type IN (:gea_p7)
 AND NULLIF(TRIM(e.receive_wh),'') IS NOT NULL AND TRIM(e.receive_wh)<>'*'
 AND e.header_addtime<CAST(:gea_p2 AS DATE)
 AND (:gea_p6='current' OR e.header_addtime>=CAST(:gea_p1 AS DATE))
 AND (:gea_p3 IS NULL OR e.receive_wh=:gea_p3)
 AND (:gea_p4 IS NULL OR e.material_code=:gea_p4)
), supply_latest AS (
 SELECT s.warehouse_code AS warehouse_code, s.order_no AS order_no, s.line_no AS line_no, s.sku AS sku, MAX(s.source_updated_at) AS latest_update
 FROM supply_scoped AS s GROUP BY s.warehouse_code, s.order_no, s.line_no, s.sku
), supply_records AS (
 SELECT DISTINCT s.warehouse_code AS warehouse_code, s.order_no AS order_no, s.line_no AS line_no, s.sku AS sku, s.material_name AS material_name, s.base_warehouse AS base_warehouse, s.base AS base, s.order_type AS order_type, s.created_at AS created_at, s.source_updated_at AS source_updated_at, s.ordered_ea AS ordered_ea, s.shipped_ea AS shipped_ea, s.signed_ea AS signed_ea, s.allocated_ea AS allocated_ea, s.conversion_rate AS conversion_rate, s.quantity_unit AS quantity_unit, s.order_status AS order_status, s.detail_status AS detail_status, s.header_status AS header_status, s.cancel_time AS cancel_time, s.flow_status AS flow_status
 FROM supply_scoped AS s INNER JOIN supply_latest AS k ON (s.warehouse_code=k.warehouse_code OR (s.warehouse_code IS NULL AND k.warehouse_code IS NULL)) AND (s.order_no=k.order_no OR (s.order_no IS NULL AND k.order_no IS NULL)) AND (s.line_no=k.line_no OR (s.line_no IS NULL AND k.line_no IS NULL)) AND (s.sku=k.sku OR (s.sku IS NULL AND k.sku IS NULL))
 AND (s.source_updated_at=k.latest_update OR (s.source_updated_at IS NULL AND k.latest_update IS NULL))
), supply_lines AS (
 SELECT s.warehouse_code AS warehouse_code, s.order_no AS order_no, s.line_no AS line_no, s.sku AS sku, CASE WHEN COUNT(*)=1 THEN MAX(s.material_name) ELSE NULL END AS material_name, CASE WHEN COUNT(*)=1 THEN MAX(s.base_warehouse) ELSE NULL END AS base_warehouse, CASE WHEN COUNT(*)=1 THEN MAX(s.base) ELSE NULL END AS base, CASE WHEN COUNT(*)=1 THEN MAX(s.order_type) ELSE NULL END AS order_type, CASE WHEN COUNT(*)=1 THEN MAX(s.created_at) ELSE NULL END AS created_at, CASE WHEN COUNT(*)=1 THEN MAX(s.ordered_ea) ELSE NULL END AS ordered_ea, CASE WHEN COUNT(*)=1 THEN MAX(s.shipped_ea) ELSE NULL END AS shipped_ea, CASE WHEN COUNT(*)=1 THEN MAX(s.signed_ea) ELSE NULL END AS signed_ea, CASE WHEN COUNT(*)=1 THEN MAX(s.allocated_ea) ELSE NULL END AS allocated_ea, CASE WHEN COUNT(*)=1 THEN MAX(s.conversion_rate) ELSE NULL END AS conversion_rate, CASE WHEN COUNT(*)=1 THEN MAX(s.quantity_unit) ELSE NULL END AS quantity_unit, CASE WHEN COUNT(*)=1 THEN MAX(s.order_status) ELSE NULL END AS order_status, CASE WHEN COUNT(*)=1 THEN MAX(s.detail_status) ELSE NULL END AS detail_status, CASE WHEN COUNT(*)=1 THEN MAX(s.header_status) ELSE NULL END AS header_status, CASE WHEN COUNT(*)=1 THEN MAX(s.cancel_time) ELSE NULL END AS cancel_time, CASE WHEN COUNT(*)=1 THEN MAX(s.flow_status) ELSE NULL END AS flow_status, MAX(s.source_updated_at) AS source_updated_at,
 COUNT(*) AS source_versions
 FROM supply_records AS s GROUP BY s.warehouse_code, s.order_no, s.line_no, s.sku
), supply_quantities AS (
 SELECT s.warehouse_code AS warehouse_code, s.order_no AS order_no, s.line_no AS line_no, s.sku AS sku, s.material_name AS material_name, s.base_warehouse AS base_warehouse, s.base AS base, s.order_type AS order_type, s.created_at AS created_at, s.order_status AS order_status, s.source_updated_at AS source_updated_at, s.source_versions AS source_versions,
 CASE WHEN s.source_versions=1 AND s.quantity_unit='CS' AND s.conversion_rate>0 AND s.ordered_ea>=0 AND NULLIF(TRIM(s.order_no),'') IS NOT NULL AND s.line_no IS NOT NULL AND NULLIF(TRIM(s.sku),'') IS NOT NULL THEN s.ordered_ea/CAST(s.conversion_rate AS DECIMAL(20,6)) ELSE NULL END AS demand, CASE WHEN s.source_versions=1 AND s.quantity_unit='CS' AND s.conversion_rate>0 AND s.shipped_ea>=0 AND NULLIF(TRIM(s.order_no),'') IS NOT NULL AND s.line_no IS NOT NULL AND NULLIF(TRIM(s.sku),'') IS NOT NULL THEN s.shipped_ea/CAST(s.conversion_rate AS DECIMAL(20,6)) ELSE NULL END AS shipped, CASE WHEN s.source_versions=1 AND s.quantity_unit='CS' AND s.conversion_rate>0 AND s.signed_ea>=0 AND NULLIF(TRIM(s.order_no),'') IS NOT NULL AND s.line_no IS NOT NULL AND NULLIF(TRIM(s.sku),'') IS NOT NULL THEN s.signed_ea/CAST(s.conversion_rate AS DECIMAL(20,6)) ELSE NULL END AS received, CASE WHEN s.source_versions=1 AND s.quantity_unit='CS' AND s.conversion_rate>0 AND s.allocated_ea>=0 AND NULLIF(TRIM(s.order_no),'') IS NOT NULL AND s.line_no IS NOT NULL AND NULLIF(TRIM(s.sku),'') IS NOT NULL THEN s.allocated_ea/CAST(s.conversion_rate AS DECIMAL(20,6)) ELSE NULL END AS allocated
 FROM supply_lines AS s
 WHERE s.source_versions>1 OR (s.detail_status=10
 AND (s.header_status IS NULL OR s.header_status<>90)
 AND (s.cancel_time IS NULL OR NULLIF(TRIM(s.cancel_time),'') IS NULL)
 AND (s.flow_status IS NULL OR s.flow_status<>'作废'))
), supply_measured AS (
 SELECT s.warehouse_code AS warehouse_code, s.order_no AS order_no, s.line_no AS line_no, s.sku AS sku, s.material_name AS material_name, s.base_warehouse AS base_warehouse, s.base AS base, s.order_type AS order_type, s.created_at AS created_at, s.order_status AS order_status, s.source_updated_at AS source_updated_at, s.source_versions AS source_versions, s.demand AS demand, s.shipped AS shipped, s.received AS received, s.allocated AS allocated,
 CASE WHEN s.demand IS NULL OR s.shipped IS NULL THEN NULL WHEN s.demand>s.shipped THEN s.demand-s.shipped ELSE 0 END AS pending,
 CASE WHEN s.shipped IS NULL OR s.received IS NULL THEN NULL WHEN s.shipped>s.received THEN s.shipped-s.received ELSE 0 END AS in_transit,
 CASE WHEN s.demand IS NULL OR s.shipped IS NULL THEN NULL WHEN s.shipped>s.demand THEN s.demand ELSE s.shipped END AS fulfilled,
 CASE WHEN s.shipped IS NULL OR s.demand IS NULL THEN NULL WHEN s.shipped>0 THEN s.demand ELSE 0 END AS shipped_order_quantity
 FROM supply_quantities AS s
), supply_filtered AS (
 SELECT s.warehouse_code AS warehouse_code, s.order_no AS order_no, s.line_no AS line_no, s.sku AS sku, s.material_name AS material_name, s.base_warehouse AS base_warehouse, s.base AS base, s.order_type AS order_type, s.created_at AS created_at, s.order_status AS order_status, s.source_updated_at AS source_updated_at, s.source_versions AS source_versions, s.demand AS demand, s.shipped AS shipped, s.received AS received, s.allocated AS allocated, s.pending AS pending, s.in_transit AS in_transit, s.fulfilled AS fulfilled, s.shipped_order_quantity AS shipped_order_quantity
 FROM supply_measured AS s
 WHERE (:gea_p6='month' OR s.pending>0 OR s.in_transit>0 OR s.pending IS NULL OR s.in_transit IS NULL)
 AND (:gea_p5 IS NULL OR LOWER(s.order_no) LIKE LOWER(:gea_p5) OR LOWER(s.sku) LIKE LOWER(:gea_p5) OR LOWER(s.material_name) LIKE LOWER(:gea_p5))
)
