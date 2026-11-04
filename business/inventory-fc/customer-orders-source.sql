/* inventory-warehouse-exceptions:N436,Y204 */
WITH customer_stock_date AS (
 SELECT MAX(i.month_date) AS month_date FROM agents_scm_inventory_sku_data_d AS i
 WHERE i.warehouse_classify IN ('01','02','20')
), customer_stock AS (
 SELECT i.warehouseid AS warehouseid, i.warehouse_name AS warehouse_name, i.belong_base AS belong_base,
 i.material_code AS sku, i.available_qty AS available_qty, i.prod_date AS prod_date,
 i.sap_warehouseid AS sap_warehouseid, i.plant AS plant, i.quality_batch AS quality_batch,
 i.is_good_prod AS is_good_prod, i.warehouse_classify AS warehouse_classify
 FROM agents_scm_inventory_sku_data_d AS i INNER JOIN customer_stock_date AS s ON i.month_date=s.month_date
 WHERE (i.warehouse_classify='20' OR i.warehouseid IN ('N436', 'Y204')) OR i.warehouseid='N436'
), customer_warehouses AS (
 SELECT i.warehouseid AS warehouse_code, MAX(i.warehouse_name) AS warehouse_name,
 CASE WHEN COUNT(DISTINCT i.belong_base)=1 THEN MAX(i.belong_base) END AS base
 FROM customer_stock AS i GROUP BY i.warehouseid
), customer_execution_latest AS (
 SELECT e.executeorderno AS executeorderno, e.executeorderlineno AS executeorderlineno, MAX(e.load_time) AS load_time
 FROM agents_scm_execute_detail_d AS e INNER JOIN customer_warehouses AS w ON e.warehouseid=w.warehouse_code
 WHERE NULLIF(TRIM(e.executeorderno),'') IS NOT NULL AND e.executeorderlineno IS NOT NULL
 GROUP BY e.executeorderno,e.executeorderlineno
), customer_execution AS (
 SELECT DISTINCT e.executeorderno AS executeorderno,e.executeorderlineno AS executeorderlineno,
 e.warehouseid AS warehouseid,e.cust_order_no AS cust_order_no,e.cust_code AS cust_code,e.cust_name AS cust_name,
 e.material_code AS material_code,e.material_name AS material_name,e.header_addtime AS header_addtime,
 e.requireddeliverytime AS requireddeliverytime,e.qtyordered AS qtyordered,e.qtyallocated AS qtyallocated,
 e.qtyshipped AS qtyshipped,e.bizunitconvertrate AS bizunitconvertrate,e.bdwctime AS bdwctime,
 e.prapare_order_status AS prapare_order_status,e.bizflowstatus AS bizflowstatus,
 e.detailstatus AS detailstatus,e.order_close_time AS order_close_time,e.wms_close_time AS wms_close_time,
 e.canceltime AS canceltime,e.dmscanceltime AS dmscanceltime,e.order_type AS order_type
 FROM agents_scm_execute_detail_d AS e INNER JOIN customer_execution_latest AS k
 ON e.executeorderno=k.executeorderno AND e.executeorderlineno=k.executeorderlineno
 AND (e.load_time=k.load_time OR (e.load_time IS NULL AND k.load_time IS NULL))
), customer_execution_keys AS (
 SELECT e.executeorderno AS executeorderno,e.executeorderlineno AS executeorderlineno,COUNT(*) AS versions
 FROM customer_execution AS e GROUP BY e.executeorderno,e.executeorderlineno
), customer_valid_lines AS (
 SELECT w.warehouse_code AS warehouse_code,w.warehouse_name AS warehouse_name,w.base AS base,
 e.cust_order_no AS order_no,e.cust_code AS customer_code,e.cust_name AS customer_name,
 e.material_code AS sku,e.material_name AS material_name,e.header_addtime AS created_at,
 e.requireddeliverytime AS requested_at,e.bizflowstatus AS order_status,
 e.qtyordered/e.bizunitconvertrate AS ordered,
 CASE WHEN NULLIF(TRIM(CAST(e.bdwctime AS TEXT)),'') IS NOT NULL OR e.prapare_order_status IN ('备单完成','备单完毕')
 THEN e.qtyallocated/e.bizunitconvertrate ELSE e.qtyordered/e.bizunitconvertrate END AS demand,
 e.qtyallocated/e.bizunitconvertrate AS allocated,e.qtyshipped/e.bizunitconvertrate AS shipped,
 CASE WHEN e.qtyshipped<e.qtyordered THEN 1 ELSE 0 END AS unshipped
 FROM customer_execution AS e INNER JOIN customer_execution_keys AS k
 ON e.executeorderno=k.executeorderno AND e.executeorderlineno=k.executeorderlineno
 INNER JOIN customer_warehouses AS w ON e.warehouseid=w.warehouse_code
 WHERE k.versions=1 AND e.detailstatus=10 AND e.order_close_time IS NULL AND e.wms_close_time IS NULL
 AND NULLIF(TRIM(e.canceltime),'') IS NULL AND NULLIF(TRIM(CAST(e.dmscanceltime AS TEXT)),'') IS NULL
 AND (e.prapare_order_status IS NULL OR e.prapare_order_status NOT IN ('作废','已签收'))
 AND NULLIF(TRIM(e.cust_order_no),'') IS NOT NULL AND NULLIF(TRIM(e.material_code),'') IS NOT NULL
 AND e.bizunitconvertrate>0 AND e.qtyordered>=0 AND e.qtyallocated>=0 AND e.qtyshipped>=0
 AND (e.order_type IS NULL OR e.order_type NOT IN ('ZUB','ZO14','TT','TT1','TT2','STO'))
), customer_open_orders AS (
 SELECT l.warehouse_code AS warehouse_code,l.order_no AS order_no,l.customer_code AS customer_code
 FROM customer_valid_lines AS l GROUP BY l.warehouse_code,l.order_no,l.customer_code HAVING MAX(l.unshipped)=1
), customer_open_lines AS (
 SELECT l.warehouse_code AS warehouse_code,l.warehouse_name AS warehouse_name,l.base AS base,l.order_no AS order_no,
 l.customer_code AS customer_code,CASE WHEN COUNT(DISTINCT l.customer_name)=1 THEN MAX(l.customer_name) END AS customer_name,l.sku AS sku,CASE WHEN COUNT(DISTINCT l.material_name)=1 THEN MAX(l.material_name) END AS material_name,
 MIN(l.created_at) AS created_at,MIN(l.requested_at) AS requested_at,
 CASE WHEN COUNT(DISTINCT l.order_status)=1 THEN MAX(l.order_status) END AS order_status,
 SUM(l.ordered) AS ordered,SUM(l.demand) AS demand,SUM(l.allocated) AS allocated,SUM(l.shipped) AS shipped,
 CASE WHEN SUM(l.demand)>SUM(l.allocated) THEN SUM(l.demand)-SUM(l.allocated) ELSE 0 END AS remaining
 FROM customer_valid_lines AS l INNER JOIN customer_open_orders AS o
 ON l.warehouse_code=o.warehouse_code AND l.order_no=o.order_no
 AND (l.customer_code=o.customer_code OR (l.customer_code IS NULL AND o.customer_code IS NULL))
 GROUP BY l.warehouse_code,l.warehouse_name,l.base,l.order_no,l.customer_code,l.sku
), customer_sku_demand AS (
 SELECT l.warehouse_code AS warehouse_code,l.sku AS sku,MAX(l.material_name) AS material_name,
 SUM(l.demand) AS demand,SUM(l.allocated) AS allocated,SUM(l.remaining) AS remaining
 FROM customer_open_lines AS l GROUP BY l.warehouse_code,l.sku
), customer_stock_batches AS (
 SELECT i.warehouseid AS warehouse_code,i.sku AS sku,
 CASE WHEN COUNT(i.available_qty)=COUNT(*) AND (COUNT(*)=1 OR (MIN(i.available_qty)=0 AND MAX(i.available_qty)=0))
 THEN SUM(i.available_qty) END AS available
 FROM customer_stock AS i GROUP BY i.warehouseid,i.sku,i.prod_date,i.sap_warehouseid,i.plant,i.quality_batch,i.is_good_prod,i.warehouse_classify
), customer_sku_stock AS (
 SELECT b.warehouse_code AS warehouse_code,b.sku AS sku,
 CASE WHEN COUNT(b.available)>0 THEN SUM(b.available) END AS available
 FROM customer_stock_batches AS b GROUP BY b.warehouse_code,b.sku
), customer_prior AS (
 SELECT l.warehouse_code AS warehouse_code,l.order_no AS order_no,l.customer_code AS customer_code,l.sku AS sku,
 COALESCE(SUM(p.remaining),0) AS prior_remaining
 FROM customer_open_lines AS l LEFT JOIN customer_open_lines AS p
 ON l.warehouse_code=p.warehouse_code AND l.sku=p.sku AND p.remaining>0
 AND (COALESCE(CAST(p.created_at AS TEXT),'')<COALESCE(CAST(l.created_at AS TEXT),'')
 OR (COALESCE(CAST(p.created_at AS TEXT),'')=COALESCE(CAST(l.created_at AS TEXT),'') AND p.order_no<l.order_no)
 OR (COALESCE(CAST(p.created_at AS TEXT),'')=COALESCE(CAST(l.created_at AS TEXT),'') AND p.order_no=l.order_no AND COALESCE(p.customer_code,'')<COALESCE(l.customer_code,'')))
 WHERE l.remaining>0 GROUP BY l.warehouse_code,l.order_no,l.customer_code,l.sku
), customer_current_lines AS (
 SELECT l.warehouse_code AS warehouse_code,l.warehouse_name AS warehouse_name,l.base AS base,l.order_no AS order_no,
 l.customer_code AS customer_code,l.customer_name AS customer_name,l.sku AS sku,l.material_name AS material_name,
 l.created_at AS created_at,l.requested_at AS requested_at,l.order_status AS order_status,
 l.ordered AS ordered,l.demand AS demand,l.allocated AS allocated,l.shipped AS shipped,l.remaining AS remaining,
 CASE WHEN l.remaining=0 THEN 0 WHEN i.sku IS NULL OR i.available IS NOT NULL THEN
 CASE WHEN COALESCE(i.available,0)<=COALESCE(p.prior_remaining,0) THEN l.remaining
 WHEN i.available>=COALESCE(p.prior_remaining,0)+l.remaining THEN 0
 ELSE l.remaining-i.available+COALESCE(p.prior_remaining,0) END END AS shortage
 FROM customer_open_lines AS l LEFT JOIN customer_prior AS p
 ON l.warehouse_code=p.warehouse_code AND l.order_no=p.order_no AND l.sku=p.sku
 AND (l.customer_code=p.customer_code OR (l.customer_code IS NULL AND p.customer_code IS NULL))
 LEFT JOIN customer_sku_stock AS i ON l.warehouse_code=i.warehouse_code AND l.sku=i.sku
), customer_materials AS (
 SELECT m.material_code AS sku,
 CASE WHEN COUNT(DISTINCT m.product_categ_name)=1 THEN MAX(m.product_categ_name) END AS category,
 CASE WHEN COUNT(DISTINCT m.material_group_name)=1 THEN MAX(m.material_group_name) END AS material_group
 FROM agents_scm_material_in_out_summary_d AS m GROUP BY m.material_code
), customer_source_presence AS (
 SELECT COUNT(*) AS source_count FROM (SELECT 1 AS present FROM agents_scm_execute_detail_d AS e LIMIT 1) AS p
), customer_current AS (
 SELECT CAST(CONCAT(SUBSTRING(s.month_date,1,4),'-',SUBSTRING(s.month_date,5,2),'-',SUBSTRING(s.month_date,7,2)) AS DATE) AS snapshot_date,
 '分仓' AS location_type,w.warehouse_code AS location_code,w.warehouse_name AS location_name,w.base AS base,w.warehouse_code AS warehouse_code,
 d.sku AS sku,d.material_name AS material_name,m.category AS category,m.material_group AS material_group,
 CASE WHEN p.source_count>0 THEN COALESCE(d.demand,0) END AS demand,
 CASE WHEN p.source_count>0 THEN COALESCE(d.allocated,0) END AS allocated,
 CASE WHEN p.source_count>0 THEN COALESCE(d.remaining,0) END AS remaining,
 CASE WHEN p.source_count>0 AND (i.sku IS NULL OR i.available IS NOT NULL)
 THEN CASE WHEN COALESCE(i.available,0)>0 THEN i.available ELSE 0 END END AS available,
 CASE WHEN p.source_count>0 AND (i.sku IS NULL OR i.available IS NOT NULL)
 THEN CASE WHEN COALESCE(d.remaining,0)>CASE WHEN i.available>0 THEN i.available ELSE 0 END THEN COALESCE(d.remaining,0)-CASE WHEN i.available>0 THEN i.available ELSE 0 END ELSE 0 END END AS shortage,
 CASE WHEN p.source_count=0 OR s.month_date IS NULL OR (i.sku IS NOT NULL AND i.available IS NULL) THEN 1 ELSE 0 END AS invalid
 FROM customer_warehouses AS w CROSS JOIN customer_stock_date AS s CROSS JOIN customer_source_presence AS p
 LEFT JOIN customer_sku_demand AS d ON w.warehouse_code=d.warehouse_code
 LEFT JOIN customer_sku_stock AS i ON d.warehouse_code=i.warehouse_code AND d.sku=i.sku
 LEFT JOIN customer_materials AS m ON d.sku=m.sku
)
SELECT c.snapshot_date AS snapshot_date,c.location_type AS location_type,c.location_code AS location_code,c.location_name AS location_name,
 c.base AS base,c.warehouse_code AS warehouse_code,c.sku AS sku,c.material_name AS material_name,c.category AS category,c.material_group AS material_group,
 c.demand AS demand,c.allocated AS allocated,c.remaining AS remaining,c.available AS available,c.shortage AS shortage,c.invalid AS invalid
FROM customer_current AS c
