/* inventory-warehouse-exceptions:N436,Y204 */
-- Current base-to-branch transfers; latest daily/hourly state before eligibility.
-- Quantities keep the existing case conversion; sent-but-unreceived uses dispatch state.
WITH transfer_stock_date AS (
 SELECT REPLACE(CAST(:gea_p2200 AS VARCHAR(10)), '-', '') AS month_date
), transfer_receivers AS (
 SELECT i.warehouseid AS warehouse_code,CASE WHEN COUNT(DISTINCT NULLIF(TRIM(i.warehouse_name),''))=1 THEN MAX(NULLIF(TRIM(i.warehouse_name),'')) ELSE NULL END AS warehouse_name
 FROM agents_scm_inventory_sku_data_d AS i INNER JOIN transfer_stock_date AS d ON i.month_date=d.month_date
 WHERE (i.warehouse_classify='20' OR i.warehouseid IN ('N436', 'Y204')) OR i.warehouseid='N436' GROUP BY i.warehouseid
), transfer_origins AS (
 SELECT i.warehouseid AS warehouse_code,CASE WHEN COUNT(DISTINCT NULLIF(TRIM(i.belong_base),''))=1 THEN MAX(NULLIF(TRIM(i.belong_base),'')) ELSE NULL END AS base
 FROM agents_scm_inventory_sku_data_d AS i INNER JOIN transfer_stock_date AS d ON i.month_date=d.month_date
 WHERE (i.warehouse_classify IN ('01','02') AND i.warehouseid NOT IN ('N436', 'Y204')) GROUP BY i.warehouseid
), transfer_union AS (
 SELECT e.executeorderno AS order_no,e.executeorderlineno AS line_no,e.receive_wh AS warehouse_code,
 e.warehouseid AS source_warehouse,e.material_code AS sku,e.material_name AS material_name,
 e.order_type AS order_type,e.header_addtime AS created_at,e.load_time AS source_updated_at,
 COALESCE(e.qtyordered,0) AS ordered_ea,COALESCE(e.qtyallocated,0) AS allocated_ea,COALESCE(e.qtyshipped,0) AS shipped_ea,COALESCE(e.qtysigned,0) AS received_ea,
 e.bizunitconvertrate AS conversion_rate,e.packingunitmain AS quantity_unit,
 e.detailstatus AS detail_status,e.orderstatus AS header_status,e.prapare_order_status AS order_status,
 e.canceltime AS cancelled_at,e.dmscanceltime AS dms_cancelled_at,e.order_close_time AS closed_at,
 e.wms_close_time AS wms_closed_at,e.bizflowstatus AS flow_status,1 AS source_priority
 FROM agents_scm_execute_detail_d AS e
 UNION ALL
 SELECT e.executeorderno AS order_no,e.executeorderlineno AS line_no,e.receive_wh AS warehouse_code,
 e.warehouseid AS source_warehouse,e.material_code AS sku,e.material_name AS material_name,
 e.order_type AS order_type,e.header_addtime AS created_at,e.load_time AS source_updated_at,
 COALESCE(e.qtyordered,0) AS ordered_ea,COALESCE(e.qtyallocated,0) AS allocated_ea,COALESCE(e.qtyshipped,0) AS shipped_ea,COALESCE(e.qtysigned,0) AS received_ea,
 e.bizunitconvertrate AS conversion_rate,e.packingunitmain AS quantity_unit,
 e.detailstatus AS detail_status,e.orderstatus AS header_status,e.prapare_order_status AS order_status,
 e.canceltime AS cancelled_at,e.dmscanceltime AS dms_cancelled_at,e.order_close_time AS closed_at,
 e.wms_close_time AS wms_closed_at,e.bizflowstatus AS flow_status,2 AS source_priority
 FROM agents_scm_execute_detail_hourly_d AS e
), transfer_source_presence AS (
 SELECT COUNT(*) AS source_rows FROM transfer_union AS t
), transfer_latest AS (
 SELECT e.order_no AS order_no,e.line_no AS line_no,MAX(e.source_updated_at) AS latest_update
 FROM transfer_union AS e WHERE NULLIF(TRIM(e.order_no),'') IS NOT NULL AND e.line_no IS NOT NULL
 GROUP BY e.order_no,e.line_no
), transfer_priority AS (
 SELECT e.order_no AS order_no,e.line_no AS line_no,MAX(e.source_priority) AS source_priority
 FROM transfer_union AS e INNER JOIN transfer_latest AS k ON e.order_no=k.order_no AND e.line_no=k.line_no
 AND (e.source_updated_at=k.latest_update OR (e.source_updated_at IS NULL AND k.latest_update IS NULL))
 GROUP BY e.order_no,e.line_no
), transfer_records AS (
 SELECT DISTINCT e.order_no AS order_no,e.line_no AS line_no,e.warehouse_code AS warehouse_code,
 e.source_warehouse AS source_warehouse,e.sku AS sku,e.material_name AS material_name,
 e.order_type AS order_type,e.created_at AS created_at,e.source_updated_at AS source_updated_at,
 e.ordered_ea AS ordered_ea,e.allocated_ea AS allocated_ea,e.shipped_ea AS shipped_ea,e.received_ea AS received_ea,
 e.conversion_rate AS conversion_rate,e.quantity_unit AS quantity_unit,e.detail_status AS detail_status,
 e.header_status AS header_status,e.order_status AS order_status,e.cancelled_at AS cancelled_at,
 e.dms_cancelled_at AS dms_cancelled_at,e.closed_at AS closed_at,e.wms_closed_at AS wms_closed_at,
 e.flow_status AS flow_status
 FROM transfer_union AS e INNER JOIN transfer_latest AS k ON e.order_no=k.order_no AND e.line_no=k.line_no
 AND (e.source_updated_at=k.latest_update OR (e.source_updated_at IS NULL AND k.latest_update IS NULL))
 INNER JOIN transfer_priority AS p ON e.order_no=p.order_no AND e.line_no=p.line_no AND e.source_priority=p.source_priority
), transfer_versions AS (
 SELECT e.order_no AS order_no,e.line_no AS line_no,COUNT(*) AS source_versions
 FROM transfer_records AS e GROUP BY e.order_no,e.line_no
), transfer_valid AS (
 SELECT e.warehouse_code AS warehouse_code,w.warehouse_name AS warehouse_name,e.source_warehouse AS source_warehouse,
 o.base AS base,e.order_no AS order_no,e.line_no AS line_no,e.sku AS sku,e.material_name AS material_name,
 e.order_type AS order_type,e.order_status AS order_status,e.created_at AS created_at,
 e.source_updated_at AS source_updated_at,e.ordered_ea/e.conversion_rate AS demand,
 e.allocated_ea/e.conversion_rate AS allocated,e.shipped_ea/e.conversion_rate AS shipped,
 e.received_ea/e.conversion_rate AS received,
 CASE WHEN e.order_status='已派未到' AND e.allocated_ea>e.shipped_ea
 THEN e.allocated_ea/e.conversion_rate ELSE e.shipped_ea/e.conversion_rate END AS dispatched
 FROM transfer_records AS e INNER JOIN transfer_versions AS v ON e.order_no=v.order_no AND e.line_no=v.line_no
 INNER JOIN transfer_receivers AS w ON e.warehouse_code=w.warehouse_code
 INNER JOIN transfer_origins AS o ON e.source_warehouse=o.warehouse_code
 WHERE v.source_versions=1 AND e.order_type IN ('TT1','TT2','STO','ZUB','TT')
 AND e.detail_status=10 AND (e.header_status IS NULL OR e.header_status<>90)
 AND (e.closed_at IS NULL OR e.order_status IN ('运输中','已派未到'))
 AND NULLIF(TRIM(e.cancelled_at),'') IS NULL AND NULLIF(TRIM(e.dms_cancelled_at),'') IS NULL
 AND (e.order_status IS NULL OR e.order_status NOT IN ('作废','已签收'))
 AND (e.flow_status IS NULL OR e.flow_status<>'作废') AND NULLIF(TRIM(e.sku),'') IS NOT NULL
 AND e.quantity_unit='CS' AND e.conversion_rate>0
 AND e.ordered_ea>=0 AND e.allocated_ea>=0 AND e.shipped_ea>=0 AND e.received_ea>=0
), transfer_current_lines AS (
 SELECT e.warehouse_code AS warehouse_code,e.warehouse_name AS warehouse_name,e.source_warehouse AS source_warehouse,
 e.base AS base,e.order_no AS order_no,e.line_no AS line_no,e.sku AS sku,e.material_name AS material_name,
 e.order_type AS order_type,e.order_status AS order_status,e.created_at AS created_at,
 e.source_updated_at AS source_updated_at,e.demand AS demand,e.allocated AS allocated,e.shipped AS shipped,
 e.received AS received,e.dispatched AS dispatched,
 CASE WHEN e.allocated>e.dispatched THEN e.allocated-e.dispatched ELSE 0 END AS preparing,
 CASE WHEN e.dispatched>e.received THEN e.dispatched-e.received ELSE 0 END AS in_transit
 FROM transfer_valid AS e
), transfer_current_skus AS (
 SELECT t.warehouse_code AS warehouse_code,t.sku AS sku,MAX(t.warehouse_name) AS warehouse_name,
 MAX(t.material_name) AS material_name,SUM(t.preparing) AS preparing,SUM(t.in_transit) AS in_transit
 FROM transfer_current_lines AS t GROUP BY t.warehouse_code,t.sku
)
SELECT t.warehouse_code AS warehouse_code,t.warehouse_name AS warehouse_name,t.source_warehouse AS source_warehouse,
t.base AS base,t.order_no AS order_no,t.line_no AS line_no,t.sku AS sku,t.material_name AS material_name,
t.order_type AS order_type,t.order_status AS order_status,t.created_at AS created_at,t.source_updated_at AS source_updated_at,
t.demand AS demand,t.allocated AS allocated,t.shipped AS shipped,t.received AS received,t.dispatched AS dispatched,
t.preparing AS preparing,t.in_transit AS in_transit
FROM transfer_current_lines AS t
