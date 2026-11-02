WITH upstream_snapshot AS (
 SELECT MAX(i.month_date) AS month_date FROM agents_scm_inventory_sku_data_d AS i
 WHERE i.warehouse_classify IN ('01','02','20')
), latest_inventory AS (SELECT s.month_date AS month_date FROM upstream_snapshot AS s),
upstream_warehouses AS (
 SELECT i.warehouseid AS warehouse_code, MAX(i.warehouse_name) AS warehouse_name
 FROM agents_scm_inventory_sku_data_d AS i INNER JOIN upstream_snapshot AS s ON i.month_date=s.month_date
 WHERE (i.warehouse_classify='20' OR i.warehouseid='N436')
 GROUP BY i.warehouseid HAVING COUNT(DISTINCT i.warehouse_name)=1
), upstream_base_batches AS (
 SELECT i.belong_base AS base,i.material_code AS sku,i.warehouseid AS warehouse_code,
 i.prod_date AS prod_date,i.sap_warehouseid AS sap_warehouseid,i.plant AS plant,
 i.quality_batch AS quality_batch,i.is_good_prod AS is_good_prod,i.warehouse_classify AS warehouse_classify,
 CASE WHEN COUNT(*)=1 AND COUNT(i.available_qty)=1 THEN SUM(i.available_qty) END AS available
 FROM agents_scm_inventory_sku_data_d AS i INNER JOIN upstream_snapshot AS s ON i.month_date=s.month_date
 WHERE i.warehouse_classify IN ('01','02') AND i.warehouseid<>'N436'
 GROUP BY i.belong_base,i.material_code,i.warehouseid,i.prod_date,i.sap_warehouseid,i.plant,i.quality_batch,i.is_good_prod,i.warehouse_classify
) , upstream_bases AS (
 SELECT b.base AS base FROM upstream_base_batches AS b GROUP BY b.base
), upstream_base_stock AS (
 SELECT b.base AS base,b.sku AS sku,
 CASE WHEN COUNT(b.available)=COUNT(*) THEN CASE WHEN SUM(b.available)>0 THEN SUM(b.available) ELSE 0 END END AS available
 FROM upstream_base_batches AS b GROUP BY b.base,b.sku
), upstream_base_warehouses AS (
 SELECT b.warehouse_code AS warehouse_code,CASE WHEN COUNT(DISTINCT b.base)=1 THEN MAX(b.base) END AS base
 FROM upstream_base_batches AS b GROUP BY b.warehouse_code
), asn_lines AS (
 SELECT a.warehouseid AS warehouse_code,a.source_warehouseid AS source_wh,a.asnreference1 AS source_order,
 a.asnno AS asn_no,a.asnlineno AS line_no,a.material_code AS sku,
 MAX(a.warehouse_name) AS warehouse_name,MIN(a.header_addtime) AS created_at,
 MIN(a.actualarrivetime) AS requested_at,MAX(a.order_close_time) AS asn_closed_at,MAX(a.asnstatus) AS asn_status,
 MAX(a.lastreceivingtime) AS received_at,MAX(a.load_time) AS source_updated_at,COUNT(*) AS physical_rows,
 CASE WHEN COUNT(*)=1 AND MIN(a.expectedqty)>=0 THEN MAX(a.expectedqty) END AS expected,
 CASE WHEN COUNT(*)=1 AND MIN(a.receivedqty)>=0 THEN MAX(a.receivedqty) END AS received
 FROM agents_scm_asn_detail_d AS a
 WHERE (a.warehouse_classify='20' OR a.warehouseid='N436') AND a.asntype IN ('TT','COMPANY_SALE')
 AND a.asnstatus = '00' AND a.order_close_time IS NULL
 GROUP BY a.warehouseid,a.source_warehouseid,a.asnreference1,a.asnno,a.asnlineno,a.material_code
), asn_orders AS (
 SELECT a.warehouse_code AS warehouse_code,a.source_wh AS source_wh,a.source_order AS source_order,a.sku AS sku,
 MAX(a.warehouse_name) AS warehouse_name,MIN(a.created_at) AS created_at,MIN(a.requested_at) AS requested_at,
 MAX(a.asn_closed_at) AS asn_closed_at,MAX(a.asn_status) AS asn_status,MAX(a.received_at) AS received_at,
 MAX(a.source_updated_at) AS source_updated_at,MIN(a.asn_no) AS fallback_no,
 CASE WHEN COUNT(a.expected)=COUNT(*) THEN SUM(a.expected) END AS expected,
 CASE WHEN COUNT(a.received)=COUNT(*) THEN SUM(a.received) END AS received,
 MAX(CASE WHEN a.physical_rows<>1 OR a.source_order IS NULL OR a.expected IS NULL OR a.received IS NULL THEN 1 ELSE 0 END) AS invalid
 FROM asn_lines AS a GROUP BY a.warehouse_code,a.source_wh,a.source_order,a.sku
), asn_execution_keys AS (
 SELECT a.warehouse_code AS warehouse_code,a.source_wh AS source_wh,a.source_order AS source_order,a.sku AS sku
 FROM asn_orders AS a GROUP BY a.warehouse_code,a.source_wh,a.source_order,a.sku
), asn_execution_lines AS (
 SELECT k.warehouse_code AS warehouse_code,k.source_wh AS source_wh,k.source_order AS source_order,k.sku AS sku,
 e.executeorderno AS execute_order,e.executeorderlineno AS line_no,MAX(e.material_name) AS material_name,
 MAX(e.prapare_order_status) AS prepare_status,MAX(e.wms_close_time) AS shipped_at,
 CASE WHEN COUNT(*)=1 AND MIN(e.qtyallocated)>=0 AND MIN(e.bizunitconvertrate)>0 THEN MAX(e.qtyallocated/e.bizunitconvertrate) END AS allocated,
 CASE WHEN COUNT(*)=1 AND MIN(e.qtyshipped)>=0 AND MIN(e.bizunitconvertrate)>0 THEN MAX(e.qtyshipped/e.bizunitconvertrate) END AS shipped
 FROM asn_execution_keys AS k INNER JOIN agents_scm_execute_detail_hourly_d AS e
 ON e.fromorderno=k.source_order AND e.receive_wh=k.warehouse_code AND e.warehouseid=k.source_wh AND e.material_code=k.sku
 WHERE e.order_type='ZUB' AND e.detailstatus=10 AND NULLIF(TRIM(e.canceltime),'') IS NULL AND NULLIF(TRIM(e.dmscanceltime),'') IS NULL
 GROUP BY k.warehouse_code,k.source_wh,k.source_order,k.sku,e.executeorderno,e.executeorderlineno
), asn_execution AS (
 SELECT e.warehouse_code AS warehouse_code,e.source_wh AS source_wh,e.source_order AS source_order,e.sku AS sku,
 MAX(e.material_name) AS material_name,MAX(e.shipped_at) AS shipped_at,
 CASE WHEN COUNT(DISTINCT e.prepare_status)=1 THEN MAX(e.prepare_status) END AS prepare_status,
 CASE WHEN COUNT(e.allocated)=COUNT(*) THEN SUM(e.allocated) END AS allocated,
 CASE WHEN COUNT(e.shipped)=COUNT(*) THEN SUM(e.shipped) END AS shipped
 FROM asn_execution_lines AS e GROUP BY e.warehouse_code,e.source_wh,e.source_order,e.sku
), upstream_raw_lines AS (
 SELECT a.warehouse_code AS warehouse_code,a.warehouse_name AS warehouse_name,b.base AS base,
 COALESCE(NULLIF(TRIM(a.source_order),''),a.fallback_no) AS order_no,a.sku AS line_no,a.sku AS sku,
 e.material_name AS material_name,a.created_at AS created_at,a.requested_at AS requested_at,
 e.shipped_at AS completed_at,a.asn_closed_at AS closed_at,
 CASE WHEN a.asn_status='00' THEN '待收货' ELSE '已收货' END AS order_status,
 a.asn_status AS asn_status,e.prepare_status AS prepare_status,a.expected AS expected_total,a.received AS received_total,
 CASE WHEN e.allocated IS NOT NULL AND a.expected IS NOT NULL THEN CASE WHEN e.allocated>a.expected THEN a.expected ELSE e.allocated END END AS allocated_total,
 a.source_updated_at AS source_updated_at,CASE WHEN a.invalid=0 THEN 1 ELSE 2 END AS source_rows,
 CASE WHEN a.expected IS NULL OR a.received IS NULL THEN NULL WHEN a.expected>a.received THEN a.expected-a.received ELSE 0 END AS ordered,
 CASE WHEN e.allocated IS NULL OR a.expected IS NULL OR a.received IS NULL THEN NULL
 WHEN e.allocated<=a.received THEN 0 WHEN e.allocated>=a.expected THEN CASE WHEN a.expected>a.received THEN a.expected-a.received ELSE 0 END ELSE e.allocated-a.received END AS allocated,
 CASE WHEN e.shipped IS NULL OR a.expected IS NULL THEN NULL WHEN e.shipped>a.expected THEN a.expected ELSE e.shipped END AS shipped
 FROM asn_orders AS a LEFT JOIN asn_execution AS e
 ON a.warehouse_code=e.warehouse_code AND a.source_wh=e.source_wh AND a.source_order=e.source_order AND a.sku=e.sku
 LEFT JOIN upstream_base_warehouses AS b ON a.source_wh=b.warehouse_code
 LEFT JOIN upstream_warehouses AS sender ON a.source_wh=sender.warehouse_code
 WHERE sender.warehouse_code IS NULL
), upstream_presence AS (
 SELECT COUNT(*) AS source_count FROM (SELECT 1 AS present FROM agents_scm_asn_detail_d AS a LIMIT 1) AS p
), upstream_open_lines AS (
 SELECT l.warehouse_code AS warehouse_code,l.warehouse_name AS warehouse_name,l.base AS base,
 l.order_no AS order_no,l.line_no AS line_no,l.sku AS sku,l.material_name AS material_name,
 l.created_at AS created_at,l.requested_at AS requested_at,l.order_status AS order_status,
 l.source_updated_at AS source_updated_at,l.ordered AS ordered,l.allocated AS allocated,l.shipped AS shipped,
 l.ordered AS demand,l.allocated AS preparing_allocated,
 CASE WHEN l.ordered IS NULL OR l.allocated IS NULL THEN NULL WHEN l.ordered>l.allocated THEN l.ordered-l.allocated ELSE 0 END AS remaining,
 CASE WHEN l.source_rows<>1 OR l.created_at IS NULL OR l.base IS NULL OR l.sku IS NULL OR l.ordered IS NULL OR l.allocated IS NULL THEN 1 ELSE 0 END AS invalid
 FROM upstream_raw_lines AS l WHERE l.asn_status='00' AND l.closed_at IS NULL AND (l.ordered IS NULL OR l.ordered>0)
), upstream_order_sku AS (
 SELECT l.warehouse_code AS warehouse_code,MAX(l.warehouse_name) AS warehouse_name,l.base AS base,l.order_no AS order_no,l.sku AS sku,
 MAX(l.material_name) AS material_name,MIN(l.created_at) AS created_at,MIN(l.requested_at) AS requested_at,
 CASE WHEN COUNT(DISTINCT l.order_status)=1 THEN MAX(l.order_status) END AS order_status,
 MAX(l.source_updated_at) AS source_updated_at,MAX(l.invalid) AS invalid,
 CASE WHEN COUNT(l.ordered)=COUNT(*) THEN SUM(l.ordered) END AS ordered,
 CASE WHEN COUNT(l.demand)=COUNT(*) THEN SUM(l.demand) END AS demand,
 CASE WHEN COUNT(l.demand)=COUNT(*) THEN SUM(l.demand) END AS preparing_demand,
 CASE WHEN COUNT(l.allocated)=COUNT(*) AND COUNT(l.ordered)=COUNT(*) THEN CASE WHEN SUM(l.allocated)>SUM(l.ordered) THEN SUM(l.ordered) ELSE SUM(l.allocated) END END AS allocated,
 CASE WHEN COUNT(l.preparing_allocated)=COUNT(*) AND COUNT(l.demand)=COUNT(*) THEN CASE WHEN SUM(l.preparing_allocated)>SUM(l.demand) THEN SUM(l.demand) ELSE SUM(l.preparing_allocated) END END AS preparing_allocated,
 CASE WHEN COUNT(l.shipped)=COUNT(*) THEN SUM(l.shipped) END AS shipped,
 CASE WHEN COUNT(l.demand)=COUNT(*) AND COUNT(l.preparing_allocated)=COUNT(*) THEN CASE WHEN SUM(l.demand)>SUM(l.preparing_allocated) THEN SUM(l.demand)-SUM(l.preparing_allocated) ELSE 0 END END AS remaining
 FROM upstream_open_lines AS l GROUP BY l.warehouse_code,l.base,l.order_no,l.sku
), upstream_pool_quality AS (
 SELECT l.base AS base,l.sku AS sku,MAX(l.invalid) AS invalid FROM upstream_order_sku AS l GROUP BY l.base,l.sku
), upstream_preceding AS (
 SELECT l.warehouse_code AS warehouse_code,l.base AS base,l.order_no AS order_no,l.sku AS sku,
 COALESCE(SUM(p.remaining),0) AS prior_remaining
 FROM upstream_order_sku AS l INNER JOIN upstream_pool_quality AS valid_pool ON (l.base=valid_pool.base OR (l.base IS NULL AND valid_pool.base IS NULL)) AND (l.sku=valid_pool.sku OR (l.sku IS NULL AND valid_pool.sku IS NULL)) LEFT JOIN upstream_order_sku AS p ON p.remaining>0 AND (l.base=p.base OR (l.base IS NULL AND p.base IS NULL)) AND (l.sku=p.sku OR (l.sku IS NULL AND p.sku IS NULL))
 AND (p.created_at<l.created_at OR (p.created_at=l.created_at AND p.order_no<l.order_no)
 OR (p.created_at=l.created_at AND p.order_no=l.order_no AND p.warehouse_code<l.warehouse_code))
 WHERE valid_pool.invalid=0 AND l.remaining>0 GROUP BY l.warehouse_code,l.base,l.order_no,l.sku
), upstream_allocation AS (
 SELECT l.warehouse_code AS warehouse_code,l.warehouse_name AS warehouse_name,l.base AS base,l.order_no AS order_no,l.sku AS sku,
 l.material_name AS material_name,l.created_at AS created_at,l.requested_at AS requested_at,l.order_status AS order_status,
 l.source_updated_at AS source_updated_at,l.ordered AS ordered,l.demand AS demand,l.preparing_demand AS preparing_demand,l.allocated AS allocated,
 l.preparing_allocated AS preparing_allocated,l.shipped AS shipped,l.remaining AS remaining,
 CASE WHEN l.invalid=0 AND l.remaining=0 THEN 0 WHEN pr.source_count=0 OR q.invalid<>0 OR s.month_date IS NULL OR bs.base IS NULL OR (b.sku IS NOT NULL AND b.available IS NULL) THEN 1 ELSE 0 END AS invalid,
 CASE WHEN l.invalid=0 AND l.remaining=0 THEN 0 WHEN pr.source_count>0 AND q.invalid=0 AND s.month_date IS NOT NULL AND bs.base IS NOT NULL AND (b.sku IS NULL OR b.available IS NOT NULL) THEN
 CASE WHEN COALESCE(b.available,0)<=p.prior_remaining THEN 0
 WHEN COALESCE(b.available,0)-p.prior_remaining>=l.remaining THEN l.remaining
 ELSE COALESCE(b.available,0)-p.prior_remaining END END AS available
 FROM upstream_order_sku AS l LEFT JOIN upstream_preceding AS p
 ON l.warehouse_code=p.warehouse_code AND (l.base=p.base OR (l.base IS NULL AND p.base IS NULL)) AND l.order_no=p.order_no AND (l.sku=p.sku OR (l.sku IS NULL AND p.sku IS NULL))
 INNER JOIN upstream_pool_quality AS q ON (l.base=q.base OR (l.base IS NULL AND q.base IS NULL)) AND (l.sku=q.sku OR (l.sku IS NULL AND q.sku IS NULL))
 CROSS JOIN upstream_snapshot AS s CROSS JOIN upstream_presence AS pr LEFT JOIN upstream_base_stock AS b ON l.base=b.base AND l.sku=b.sku LEFT JOIN upstream_bases AS bs ON l.base=bs.base
), upstream_current AS (
 SELECT l.warehouse_code AS warehouse_code,l.warehouse_name AS warehouse_name,l.base AS base,l.order_no AS order_no,l.sku AS sku,
 l.material_name AS material_name,l.created_at AS created_at,l.requested_at AS requested_at,l.order_status AS order_status,
 l.source_updated_at AS source_updated_at,l.ordered AS ordered,l.demand AS demand,l.preparing_demand AS preparing_demand,l.allocated AS allocated,
 l.preparing_allocated AS preparing_allocated,l.shipped AS shipped,l.remaining AS remaining,l.invalid AS invalid,l.available AS available,
 CASE WHEN l.invalid=0 THEN CASE WHEN l.remaining>l.available THEN l.remaining-l.available ELSE 0 END END AS shortage
 FROM upstream_allocation AS l
)
SELECT l.warehouse_code AS warehouse_code,l.order_no AS order_no,l.sku AS sku,l.demand AS demand,l.shortage AS shortage FROM upstream_current AS l
