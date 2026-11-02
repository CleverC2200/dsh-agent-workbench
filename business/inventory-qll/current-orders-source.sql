WITH base_latest_inventory AS (
  SELECT
    MAX(agents_scm_inventory_sku_data_d.month_date) AS month_date
  FROM agents_scm_inventory_sku_data_d AS agents_scm_inventory_sku_data_d
  WHERE
    agents_scm_inventory_sku_data_d.warehouse_classify IN ('01', '02', '20')
), base_warehouse_points AS (
  SELECT
    agents_scm_material_in_out_summary_d.warehouseid AS warehouseid,
    CASE
      WHEN COUNT(DISTINCT NULLIF(TRIM(agents_scm_material_in_out_summary_d.pickup_point), '')) = 1
      THEN MAX(NULLIF(TRIM(agents_scm_material_in_out_summary_d.pickup_point), ''))
    END AS pickup_point
  FROM agents_scm_material_in_out_summary_d AS agents_scm_material_in_out_summary_d
  GROUP BY
    agents_scm_material_in_out_summary_d.warehouseid
), base_inventory_rows AS (
  SELECT
    i.month_date AS month_date,
    i.warehouseid AS warehouseid,
    i.warehouse_name AS warehouse_name,
    i.belong_base AS belong_base,
    i.material_code AS material_code,
    i.material_name AS material_name,
    i.prod_date AS prod_date,
    i.sap_warehouseid AS sap_warehouseid,
    i.plant AS plant,
    i.quality_batch AS quality_batch,
    i.is_good_prod AS is_good_prod,
    i.warehouse_classify AS warehouse_classify,
    i.available_qty AS available_qty,
    w.pickup_point AS pickup_point,
    CASE WHEN i.warehouse_classify = '20' THEN '分仓' ELSE '基地' END AS location_type,
    CASE WHEN i.warehouse_classify = '20' THEN i.warehouseid ELSE i.belong_base END AS location_code,
    CASE WHEN i.warehouse_classify = '20' THEN i.warehouse_name ELSE i.belong_base END AS location_name
  FROM agents_scm_inventory_sku_data_d AS i
  INNER JOIN base_latest_inventory AS s
    ON i.month_date = s.month_date
  LEFT JOIN base_warehouse_points AS w
    ON i.warehouseid = w.warehouseid
  WHERE
    i.warehouse_classify IN ('01', '02', '20')
), base_point_location_candidates AS (
  SELECT
    inventory_rows.pickup_point AS pickup_point,
    inventory_rows.location_type AS location_type,
    inventory_rows.location_code AS location_code,
    MAX(inventory_rows.location_name) AS location_name,
    MAX(inventory_rows.belong_base) AS belong_base,
    CASE
      WHEN inventory_rows.location_type = '分仓'
      THEN MAX(inventory_rows.warehouseid)
    END AS warehouseid,
    COUNT(DISTINCT inventory_rows.location_name) AS name_count,
    COUNT(DISTINCT inventory_rows.belong_base) AS base_count
  FROM base_inventory_rows AS inventory_rows
  WHERE
    NOT inventory_rows.pickup_point IS NULL
    AND NOT NULLIF(TRIM(inventory_rows.location_code), '') IS NULL
  GROUP BY
    inventory_rows.pickup_point,
    inventory_rows.location_type,
    inventory_rows.location_code
), base_point_locations AS (
  SELECT
    point_location_candidates.pickup_point AS pickup_point,
    MAX(point_location_candidates.location_type) AS location_type,
    MAX(point_location_candidates.location_code) AS location_code,
    MAX(point_location_candidates.location_name) AS location_name,
    MAX(point_location_candidates.belong_base) AS belong_base,
    MAX(point_location_candidates.warehouseid) AS warehouseid
  FROM base_point_location_candidates AS point_location_candidates
  GROUP BY
    point_location_candidates.pickup_point
  HAVING
    COUNT(*) = 1
    AND MAX(point_location_candidates.name_count) = 1
    AND MAX(point_location_candidates.base_count) = 1
), base_current_order_lines AS (
  SELECT
    o.cust_order_no AS cust_order_no,
    o.cust_code AS cust_code,
    o.material_code AS material_code,
    o.material_name AS material_name,
    o.pickup_point AS pickup_point,
    o.pickup_point_name AS pickup_point_name,
    o.belong_base AS belong_base,
    (
      CASE
        WHEN o.bizunitconvertrate > 0
        THEN CASE
          WHEN NULLIF(TRIM(CAST(o.bdwctime AS TEXT)), '') IS NOT NULL
          OR o.prapare_order_status IN ('备单完成', '备单完毕')
          THEN o.qtyallocated / o.bizunitconvertrate
          ELSE o.qtyordered / o.bizunitconvertrate
        END
      END
    ) AS demand_qty,
    (
      CASE WHEN o.bizunitconvertrate > 0 THEN o.qtyallocated / o.bizunitconvertrate END
    ) AS allocated_qty,
    CASE
      WHEN o.qtyordered IS NULL OR o.qtyshipped IS NULL OR o.qtyshipped < o.qtyordered
      THEN 1
      ELSE 0
    END AS unshipped
  FROM agents_scm_execute_detail_d AS o
  WHERE
    o.detailstatus = 10
    AND o.order_close_time IS NULL
    AND o.wms_close_time IS NULL
    AND NULLIF(TRIM(o.canceltime), '') IS NULL
    AND NULLIF(TRIM(CAST(o.dmscanceltime AS TEXT)), '') IS NULL
    AND (
      o.prapare_order_status IS NULL OR NOT o.prapare_order_status IN ('作废', '已签收')
    )
    AND NULLIF(TRIM(o.cust_order_no), '') IS NOT NULL
), base_current_open_orders AS (
  SELECT
    l.cust_order_no AS cust_order_no,
    l.cust_code AS cust_code,
    l.pickup_point AS pickup_point
  FROM base_current_order_lines AS l
  GROUP BY
    l.cust_order_no,
    l.cust_code,
    l.pickup_point
  HAVING
    MAX(l.unshipped) = 1
), base_current_open_lines AS (
  SELECT
    l.cust_order_no AS cust_order_no,
    l.cust_code AS cust_code,
    l.material_code AS material_code,
    l.material_name AS material_name,
    l.pickup_point AS pickup_point,
    l.pickup_point_name AS pickup_point_name,
    l.belong_base AS belong_base,
    l.demand_qty AS demand_qty,
    l.allocated_qty AS allocated_qty
  FROM base_current_order_lines AS l
  INNER JOIN base_current_open_orders AS o
    ON l.cust_order_no = o.cust_order_no
    AND (
      l.cust_code = o.cust_code OR (
        l.cust_code IS NULL AND o.cust_code IS NULL
      )
    )
    AND (
      l.pickup_point = o.pickup_point
      OR (
        l.pickup_point IS NULL AND o.pickup_point IS NULL
      )
    )
), base_eligible_order_sku AS (
  SELECT
    o.cust_order_no AS cust_order_no,
    o.material_code AS material_code,
    CASE WHEN m.pickup_point IS NULL THEN '待映射' ELSE m.location_type END AS location_type,
    CASE
      WHEN m.pickup_point IS NULL
      THEN CONCAT('unmapped:', COALESCE(o.pickup_point, 'NULL'))
      ELSE m.location_code
    END AS location_code,
    MAX(COALESCE(m.location_name, o.pickup_point_name)) AS location_name,
    MAX(COALESCE(m.belong_base, o.belong_base)) AS belong_base,
    MAX(m.warehouseid) AS warehouseid,
    CASE
      WHEN COUNT(DISTINCT NULLIF(TRIM(o.material_name), '')) = 1
      THEN MAX(NULLIF(TRIM(o.material_name), ''))
    END AS material_name,
    CASE
      WHEN COUNT(o.demand_qty) = COUNT(*) AND MIN(o.demand_qty) >= 0
      THEN SUM(o.demand_qty)
    END AS demand_qty,
    CASE
      WHEN COUNT(o.allocated_qty) = COUNT(*) AND MIN(o.allocated_qty) >= 0
      THEN SUM(o.allocated_qty)
    END AS allocated_qty,
    CASE
      WHEN COUNT(o.demand_qty) <> COUNT(*)
      OR COUNT(o.allocated_qty) <> COUNT(*)
      OR MIN(o.demand_qty) < 0
      OR MIN(o.allocated_qty) < 0
      THEN NULL
      WHEN SUM(o.demand_qty) - SUM(o.allocated_qty) > 0
      THEN SUM(o.demand_qty) - SUM(o.allocated_qty)
      ELSE 0
    END AS remaining_qty,
    COUNT(*) AS source_row_count,
    MAX(
      CASE
        WHEN m.pickup_point IS NULL
        OR NULLIF(TRIM(o.cust_order_no), '') IS NULL
        OR NULLIF(TRIM(o.material_code), '') IS NULL
        OR o.demand_qty IS NULL
        OR o.allocated_qty IS NULL
        OR o.demand_qty < 0
        OR o.allocated_qty < 0
        THEN 1
        ELSE 0
      END
    ) AS input_invalid
  FROM base_current_open_lines AS o
  LEFT JOIN base_point_locations AS m
    ON o.pickup_point = m.pickup_point
  WHERE
    (
      NOT m.pickup_point IS NULL OR NOT NULLIF(TRIM(o.belong_base), '') IS NULL
    )
  GROUP BY
    o.cust_order_no,
    o.cust_code,
    o.material_code,
    CASE WHEN m.pickup_point IS NULL THEN '待映射' ELSE m.location_type END,
    CASE
      WHEN m.pickup_point IS NULL
      THEN CONCAT('unmapped:', COALESCE(o.pickup_point, 'NULL'))
      ELSE m.location_code
    END
), base_location_sku_demand AS (
  SELECT
    eligible_order_sku.location_type AS location_type,
    eligible_order_sku.location_code AS location_code,
    eligible_order_sku.material_code AS material_code,
    MAX(eligible_order_sku.location_name) AS location_name,
    MAX(eligible_order_sku.belong_base) AS belong_base,
    MAX(eligible_order_sku.warehouseid) AS warehouseid,
    CASE
      WHEN COUNT(DISTINCT eligible_order_sku.material_name) = 1
      THEN MAX(eligible_order_sku.material_name)
    END AS material_name,
    CASE
      WHEN COUNT(eligible_order_sku.demand_qty) = COUNT(*)
      THEN SUM(eligible_order_sku.demand_qty)
    END AS demand_qty,
    CASE
      WHEN COUNT(eligible_order_sku.allocated_qty) = COUNT(*)
      THEN SUM(eligible_order_sku.allocated_qty)
    END AS allocated_qty,
    CASE
      WHEN COUNT(eligible_order_sku.remaining_qty) = COUNT(*)
      THEN SUM(eligible_order_sku.remaining_qty)
    END AS remaining_qty,
    SUM(eligible_order_sku.source_row_count) AS source_row_count,
    COUNT(*) AS order_sku_count,
    MAX(eligible_order_sku.input_invalid) AS input_invalid
  FROM base_eligible_order_sku AS eligible_order_sku
  GROUP BY
    eligible_order_sku.location_type,
    eligible_order_sku.location_code,
    eligible_order_sku.material_code
), base_complete_demand AS (
  SELECT
    location_sku_demand.location_type AS location_type,
    location_sku_demand.location_code AS location_code,
    location_sku_demand.material_code AS material_code,
    location_sku_demand.location_name AS location_name,
    location_sku_demand.belong_base AS belong_base,
    location_sku_demand.warehouseid AS warehouseid,
    location_sku_demand.material_name AS material_name,
    location_sku_demand.demand_qty AS demand_qty,
    location_sku_demand.allocated_qty AS allocated_qty,
    location_sku_demand.remaining_qty AS remaining_qty,
    location_sku_demand.source_row_count AS source_row_count,
    location_sku_demand.order_sku_count AS order_sku_count,
    location_sku_demand.input_invalid AS input_invalid
  FROM base_location_sku_demand AS location_sku_demand
  UNION ALL
  SELECT
    l.location_type AS location_type,
    l.location_code AS location_code,
    CAST(NULL AS VARCHAR(255)) AS material_code,
    MAX(l.location_name) AS location_name,
    MAX(l.belong_base) AS belong_base,
    CASE WHEN l.location_type = '分仓' THEN MAX(l.warehouseid) END AS warehouseid,
    CAST(NULL AS VARCHAR(255)) AS material_name,
    0 AS demand_qty,
    0 AS allocated_qty,
    0 AS remaining_qty,
    0 AS source_row_count,
    0 AS order_sku_count,
    0 AS input_invalid
  FROM base_inventory_rows AS l
  LEFT JOIN (
    SELECT
      location_sku_demand.location_type AS location_type,
      location_sku_demand.location_code AS location_code
    FROM base_location_sku_demand AS location_sku_demand
    GROUP BY
      location_sku_demand.location_type,
      location_sku_demand.location_code
  ) AS d
    ON l.location_type = d.location_type AND l.location_code = d.location_code
  WHERE
    d.location_code IS NULL AND NOT NULLIF(TRIM(l.location_code), '') IS NULL
  GROUP BY
    l.location_type,
    l.location_code
), base_inventory_batch AS (
  SELECT
    inventory_rows.location_type AS location_type,
    inventory_rows.location_code AS location_code,
    inventory_rows.material_code AS material_code,
    inventory_rows.warehouseid AS warehouseid,
    inventory_rows.prod_date AS prod_date,
    inventory_rows.sap_warehouseid AS sap_warehouseid,
    inventory_rows.plant AS plant,
    inventory_rows.quality_batch AS quality_batch,
    inventory_rows.is_good_prod AS is_good_prod,
    inventory_rows.warehouse_classify AS warehouse_classify,
    SUM(COALESCE(inventory_rows.available_qty, 0)) AS available_qty,
    CASE
      WHEN COUNT(CASE WHEN COALESCE(inventory_rows.available_qty, 0) <> 0 THEN 1 END) > 1
      THEN 1
      ELSE 0
    END AS duplicate_batch
  FROM base_inventory_rows AS inventory_rows
  GROUP BY
    inventory_rows.location_type,
    inventory_rows.location_code,
    inventory_rows.material_code,
    inventory_rows.warehouseid,
    inventory_rows.prod_date,
    inventory_rows.sap_warehouseid,
    inventory_rows.plant,
    inventory_rows.quality_batch,
    inventory_rows.is_good_prod,
    inventory_rows.warehouse_classify
), base_material_attributes AS (
  SELECT
    agents_scm_material_in_out_summary_d.material_code AS material_code,
    CASE
      WHEN COUNT(
        DISTINCT NULLIF(TRIM(agents_scm_material_in_out_summary_d.product_categ_name), '')
      ) = 1
      THEN MAX(NULLIF(TRIM(agents_scm_material_in_out_summary_d.product_categ_name), ''))
    END AS product_categ_name,
    CASE
      WHEN COUNT(
        DISTINCT NULLIF(TRIM(agents_scm_material_in_out_summary_d.material_group_name), '')
      ) = 1
      THEN MAX(NULLIF(TRIM(agents_scm_material_in_out_summary_d.material_group_name), ''))
    END AS material_group_name
  FROM agents_scm_material_in_out_summary_d AS agents_scm_material_in_out_summary_d
  GROUP BY
    agents_scm_material_in_out_summary_d.material_code
), base_inventory_sku AS (
  SELECT
    inventory_batch.location_type AS location_type,
    inventory_batch.location_code AS location_code,
    inventory_batch.material_code AS material_code,
    SUM(inventory_batch.available_qty) AS available_qty,
    SUM(inventory_batch.duplicate_batch) AS duplicate_batch
  FROM base_inventory_batch AS inventory_batch
  GROUP BY
    inventory_batch.location_type,
    inventory_batch.location_code,
    inventory_batch.material_code
), base_shortage_source AS (
  SELECT
    CAST(CONCAT(
      SUBSTRING(s.month_date, 1, 4),
      '-',
      SUBSTRING(s.month_date, 5, 2),
      '-',
      SUBSTRING(s.month_date, 7, 2)
    ) AS DATE) AS stat_date,
    d.location_type AS location_type,
    d.location_code AS location_code,
    d.location_name AS location_name,
    d.belong_base AS belong_base,
    d.warehouseid AS warehouseid,
    d.material_code AS material_code,
    d.material_name AS material_name,
    a.product_categ_name AS product_categ_name,
    a.material_group_name AS material_group_name,
    d.demand_qty AS demand_qty,
    d.allocated_qty AS allocated_qty,
    d.remaining_qty AS remaining_qty,
    CASE
      WHEN d.input_invalid = 0
      AND COALESCE(i.duplicate_batch, 0) = 0
      AND NOT s.month_date IS NULL
      THEN COALESCE(i.available_qty, 0)
    END AS available_qty,
    CASE
      WHEN d.input_invalid = 0
      AND COALESCE(i.duplicate_batch, 0) = 0
      AND NOT s.month_date IS NULL
      THEN CASE
        WHEN d.remaining_qty - COALESCE(i.available_qty, 0) > 0
        THEN d.remaining_qty - COALESCE(i.available_qty, 0)
        ELSE 0
      END
    END AS shortage_qty,
    d.source_row_count AS source_row_count,
    d.order_sku_count AS order_sku_count,
    CASE
      WHEN d.input_invalid <> 0
      OR COALESCE(i.duplicate_batch, 0) <> 0
      OR s.month_date IS NULL
      THEN 1
      ELSE 0
    END AS invalid_sku,
    CASE
      WHEN d.order_sku_count > 0
      AND i.material_code IS NULL
      AND d.input_invalid = 0
      AND NOT s.month_date IS NULL
      THEN 1
      ELSE 0
    END AS absent_inventory_sku
  FROM base_complete_demand AS d
  CROSS JOIN base_latest_inventory AS s
  LEFT JOIN base_inventory_sku AS i
    ON d.location_type = i.location_type
    AND d.location_code = i.location_code
    AND d.material_code = i.material_code
  LEFT JOIN base_material_attributes AS a
    ON d.material_code = a.material_code
), base_order_presence AS (
  SELECT
    COUNT(*) AS source_order_count
  FROM (
    SELECT
      1 AS present
    FROM agents_scm_execute_detail_d AS probe_order
    LIMIT 1
  ) AS order_probe
), base_filtered AS (
  SELECT
    r.stat_date AS snapshot_date,
    r.location_type AS location_type,
    r.location_code AS location_code,
    r.location_name AS location_name,
    r.belong_base AS base,
    r.warehouseid AS warehouse_code,
    r.material_code AS sku,
    r.material_name AS material_name,
    r.product_categ_name AS category,
    r.material_group_name AS material_group,
    r.demand_qty AS demand,
    r.allocated_qty AS allocated,
    r.remaining_qty AS remaining,
    r.available_qty AS available,
    r.shortage_qty AS shortage,
    CASE WHEN p.source_order_count = 0 THEN 1 ELSE r.invalid_sku END AS invalid
  FROM base_shortage_source AS r
  CROSS JOIN base_order_presence AS p
  WHERE
    (
      NULL IS NULL OR r.belong_base = NULL
    )
    AND (
      NULL IS NULL OR r.warehouseid = NULL
    )
    AND (
      NULL IS NULL OR r.material_code = NULL
    )
    AND (
      NULL IS NULL OR r.product_categ_name = NULL
    )
    AND r.location_type = '基地'
), branch_upstream_snapshot AS (
  SELECT
    MAX(i.month_date) AS month_date
  FROM agents_scm_inventory_sku_data_d AS i
  WHERE
    i.warehouse_classify IN ('01', '02', '20')
), branch_latest_inventory AS (
  SELECT
    s.month_date AS month_date
  FROM branch_upstream_snapshot AS s
), branch_upstream_warehouses AS (
  SELECT
    i.warehouseid AS warehouse_code,
    MAX(i.warehouse_name) AS warehouse_name
  FROM agents_scm_inventory_sku_data_d AS i
  INNER JOIN branch_upstream_snapshot AS s
    ON i.month_date = s.month_date
  WHERE
    (
      i.warehouse_classify = '20' OR i.warehouseid = 'N436'
    )
  GROUP BY
    i.warehouseid
  HAVING
    COUNT(DISTINCT i.warehouse_name) = 1
), branch_upstream_base_batches AS (
  SELECT
    i.belong_base AS base,
    i.material_code AS sku,
    i.warehouseid AS warehouse_code,
    i.prod_date AS prod_date,
    i.sap_warehouseid AS sap_warehouseid,
    i.plant AS plant,
    i.quality_batch AS quality_batch,
    i.is_good_prod AS is_good_prod,
    i.warehouse_classify AS warehouse_classify,
    CASE WHEN COUNT(*) = 1 AND COUNT(i.available_qty) = 1 THEN SUM(i.available_qty) END AS available
  FROM agents_scm_inventory_sku_data_d AS i
  INNER JOIN branch_upstream_snapshot AS s
    ON i.month_date = s.month_date
  WHERE
    i.warehouse_classify IN ('01', '02') AND i.warehouseid <> 'N436'
  GROUP BY
    i.belong_base,
    i.material_code,
    i.warehouseid,
    i.prod_date,
    i.sap_warehouseid,
    i.plant,
    i.quality_batch,
    i.is_good_prod,
    i.warehouse_classify
), branch_upstream_bases AS (
  SELECT
    b.base AS base
  FROM branch_upstream_base_batches AS b
  GROUP BY
    b.base
), branch_upstream_base_stock AS (
  SELECT
    b.base AS base,
    b.sku AS sku,
    CASE
      WHEN COUNT(b.available) = COUNT(*)
      THEN CASE WHEN SUM(b.available) > 0 THEN SUM(b.available) ELSE 0 END
    END AS available
  FROM branch_upstream_base_batches AS b
  GROUP BY
    b.base,
    b.sku
), branch_upstream_base_warehouses AS (
  SELECT
    b.warehouse_code AS warehouse_code,
    CASE WHEN COUNT(DISTINCT b.base) = 1 THEN MAX(b.base) END AS base
  FROM branch_upstream_base_batches AS b
  GROUP BY
    b.warehouse_code
), branch_asn_lines AS (
  SELECT
    a.warehouseid AS warehouse_code,
    a.source_warehouseid AS source_wh,
    a.asnreference1 AS source_order,
    a.asnno AS asn_no,
    a.asnlineno AS line_no,
    a.material_code AS sku,
    MAX(a.warehouse_name) AS warehouse_name,
    MIN(a.header_addtime) AS created_at,
    MIN(a.actualarrivetime) AS requested_at,
    MAX(a.order_close_time) AS asn_closed_at,
    MAX(a.asnstatus) AS asn_status,
    MAX(a.lastreceivingtime) AS received_at,
    MAX(a.load_time) AS source_updated_at,
    COUNT(*) AS physical_rows,
    CASE WHEN COUNT(*) = 1 AND MIN(a.expectedqty) >= 0 THEN MAX(a.expectedqty) END AS expected,
    CASE WHEN COUNT(*) = 1 AND MIN(a.receivedqty) >= 0 THEN MAX(a.receivedqty) END AS received
  FROM agents_scm_asn_detail_d AS a
  WHERE
    (
      a.warehouse_classify = '20' OR a.warehouseid = 'N436'
    )
    AND a.asntype IN ('TT', 'COMPANY_SALE')
    AND a.asnstatus = '00'
    AND a.order_close_time IS NULL
  GROUP BY
    a.warehouseid,
    a.source_warehouseid,
    a.asnreference1,
    a.asnno,
    a.asnlineno,
    a.material_code
), branch_asn_orders AS (
  SELECT
    a.warehouse_code AS warehouse_code,
    a.source_wh AS source_wh,
    a.source_order AS source_order,
    a.sku AS sku,
    MAX(a.warehouse_name) AS warehouse_name,
    MIN(a.created_at) AS created_at,
    MIN(a.requested_at) AS requested_at,
    MAX(a.asn_closed_at) AS asn_closed_at,
    MAX(a.asn_status) AS asn_status,
    MAX(a.received_at) AS received_at,
    MAX(a.source_updated_at) AS source_updated_at,
    MIN(a.asn_no) AS fallback_no,
    CASE WHEN COUNT(a.expected) = COUNT(*) THEN SUM(a.expected) END AS expected,
    CASE WHEN COUNT(a.received) = COUNT(*) THEN SUM(a.received) END AS received,
    MAX(
      CASE
        WHEN a.physical_rows <> 1
        OR a.source_order IS NULL
        OR a.expected IS NULL
        OR a.received IS NULL
        THEN 1
        ELSE 0
      END
    ) AS invalid
  FROM branch_asn_lines AS a
  GROUP BY
    a.warehouse_code,
    a.source_wh,
    a.source_order,
    a.sku
), branch_asn_execution_keys AS (
  SELECT
    a.warehouse_code AS warehouse_code,
    a.source_wh AS source_wh,
    a.source_order AS source_order,
    a.sku AS sku
  FROM branch_asn_orders AS a
  GROUP BY
    a.warehouse_code,
    a.source_wh,
    a.source_order,
    a.sku
), branch_asn_execution_lines AS (
  SELECT
    k.warehouse_code AS warehouse_code,
    k.source_wh AS source_wh,
    k.source_order AS source_order,
    k.sku AS sku,
    e.executeorderno AS execute_order,
    e.executeorderlineno AS line_no,
    MAX(e.material_name) AS material_name,
    MAX(e.prapare_order_status) AS prepare_status,
    MAX(e.wms_close_time) AS shipped_at,
    CASE
      WHEN COUNT(*) = 1 AND MIN(e.qtyallocated) >= 0 AND MIN(e.bizunitconvertrate) > 0
      THEN MAX(e.qtyallocated / e.bizunitconvertrate)
    END AS allocated,
    CASE
      WHEN COUNT(*) = 1 AND MIN(e.qtyshipped) >= 0 AND MIN(e.bizunitconvertrate) > 0
      THEN MAX(e.qtyshipped / e.bizunitconvertrate)
    END AS shipped
  FROM branch_asn_execution_keys AS k
  INNER JOIN agents_scm_execute_detail_hourly_d AS e
    ON e.fromorderno = k.source_order
    AND e.receive_wh = k.warehouse_code
    AND e.warehouseid = k.source_wh
    AND e.material_code = k.sku
  WHERE
    e.order_type = 'ZUB'
    AND e.detailstatus = 10
    AND NULLIF(TRIM(e.canceltime), '') IS NULL
    AND NULLIF(TRIM(e.dmscanceltime), '') IS NULL
  GROUP BY
    k.warehouse_code,
    k.source_wh,
    k.source_order,
    k.sku,
    e.executeorderno,
    e.executeorderlineno
), branch_asn_execution AS (
  SELECT
    e.warehouse_code AS warehouse_code,
    e.source_wh AS source_wh,
    e.source_order AS source_order,
    e.sku AS sku,
    MAX(e.material_name) AS material_name,
    MAX(e.shipped_at) AS shipped_at,
    CASE WHEN COUNT(DISTINCT e.prepare_status) = 1 THEN MAX(e.prepare_status) END AS prepare_status,
    CASE WHEN COUNT(e.allocated) = COUNT(*) THEN SUM(e.allocated) END AS allocated,
    CASE WHEN COUNT(e.shipped) = COUNT(*) THEN SUM(e.shipped) END AS shipped
  FROM branch_asn_execution_lines AS e
  GROUP BY
    e.warehouse_code,
    e.source_wh,
    e.source_order,
    e.sku
), branch_upstream_raw_lines AS (
  SELECT
    a.warehouse_code AS warehouse_code,
    a.warehouse_name AS warehouse_name,
    b.base AS base,
    COALESCE(NULLIF(TRIM(a.source_order), ''), a.fallback_no) AS order_no,
    a.sku AS line_no,
    a.sku AS sku,
    e.material_name AS material_name,
    a.created_at AS created_at,
    a.requested_at AS requested_at,
    e.shipped_at AS completed_at,
    a.asn_closed_at AS closed_at,
    CASE WHEN a.asn_status = '00' THEN '待收货' ELSE '已收货' END AS order_status,
    a.asn_status AS asn_status,
    e.prepare_status AS prepare_status,
    a.expected AS expected_total,
    a.received AS received_total,
    CASE
      WHEN e.allocated IS NOT NULL AND a.expected IS NOT NULL
      THEN CASE WHEN e.allocated > a.expected THEN a.expected ELSE e.allocated END
    END AS allocated_total,
    a.source_updated_at AS source_updated_at,
    CASE WHEN a.invalid = 0 THEN 1 ELSE 2 END AS source_rows,
    CASE
      WHEN a.expected IS NULL OR a.received IS NULL
      THEN NULL
      WHEN a.expected > a.received
      THEN a.expected - a.received
      ELSE 0
    END AS ordered,
    CASE
      WHEN e.allocated IS NULL OR a.expected IS NULL OR a.received IS NULL
      THEN NULL
      WHEN e.allocated <= a.received
      THEN 0
      WHEN e.allocated >= a.expected
      THEN CASE WHEN a.expected > a.received THEN a.expected - a.received ELSE 0 END
      ELSE e.allocated - a.received
    END AS allocated,
    CASE
      WHEN e.shipped IS NULL OR a.expected IS NULL
      THEN NULL
      WHEN e.shipped > a.expected
      THEN a.expected
      ELSE e.shipped
    END AS shipped
  FROM branch_asn_orders AS a
  LEFT JOIN branch_asn_execution AS e
    ON a.warehouse_code = e.warehouse_code
    AND a.source_wh = e.source_wh
    AND a.source_order = e.source_order
    AND a.sku = e.sku
  LEFT JOIN branch_upstream_base_warehouses AS b
    ON a.source_wh = b.warehouse_code
  LEFT JOIN branch_upstream_warehouses AS sender
    ON a.source_wh = sender.warehouse_code
  WHERE
    sender.warehouse_code IS NULL
), branch_upstream_presence AS (
  SELECT
    COUNT(*) AS source_count
  FROM (
    SELECT
      1 AS present
    FROM agents_scm_asn_detail_d AS a
    LIMIT 1
  ) AS p
), branch_upstream_open_lines AS (
  SELECT
    l.warehouse_code AS warehouse_code,
    l.warehouse_name AS warehouse_name,
    l.base AS base,
    l.order_no AS order_no,
    l.line_no AS line_no,
    l.sku AS sku,
    l.material_name AS material_name,
    l.created_at AS created_at,
    l.requested_at AS requested_at,
    l.order_status AS order_status,
    l.source_updated_at AS source_updated_at,
    l.ordered AS ordered,
    l.allocated AS allocated,
    l.shipped AS shipped,
    l.ordered AS demand,
    l.allocated AS preparing_allocated,
    CASE
      WHEN l.ordered IS NULL OR l.allocated IS NULL
      THEN NULL
      WHEN l.ordered > l.allocated
      THEN l.ordered - l.allocated
      ELSE 0
    END AS remaining,
    CASE
      WHEN l.source_rows <> 1
      OR l.created_at IS NULL
      OR l.base IS NULL
      OR l.sku IS NULL
      OR l.ordered IS NULL
      OR l.allocated IS NULL
      THEN 1
      ELSE 0
    END AS invalid
  FROM branch_upstream_raw_lines AS l
  WHERE
    l.asn_status = '00'
    AND l.closed_at IS NULL
    AND (
      l.ordered IS NULL OR l.ordered > 0
    )
), branch_upstream_order_sku AS (
  SELECT
    l.warehouse_code AS warehouse_code,
    MAX(l.warehouse_name) AS warehouse_name,
    l.base AS base,
    l.order_no AS order_no,
    l.sku AS sku,
    MAX(l.material_name) AS material_name,
    MIN(l.created_at) AS created_at,
    MIN(l.requested_at) AS requested_at,
    CASE WHEN COUNT(DISTINCT l.order_status) = 1 THEN MAX(l.order_status) END AS order_status,
    MAX(l.source_updated_at) AS source_updated_at,
    MAX(l.invalid) AS invalid,
    CASE WHEN COUNT(l.ordered) = COUNT(*) THEN SUM(l.ordered) END AS ordered,
    CASE WHEN COUNT(l.demand) = COUNT(*) THEN SUM(l.demand) END AS demand,
    CASE WHEN COUNT(l.demand) = COUNT(*) THEN SUM(l.demand) END AS preparing_demand,
    CASE
      WHEN COUNT(l.allocated) = COUNT(*) AND COUNT(l.ordered) = COUNT(*)
      THEN CASE
        WHEN SUM(l.allocated) > SUM(l.ordered)
        THEN SUM(l.ordered)
        ELSE SUM(l.allocated)
      END
    END AS allocated,
    CASE
      WHEN COUNT(l.preparing_allocated) = COUNT(*) AND COUNT(l.demand) = COUNT(*)
      THEN CASE
        WHEN SUM(l.preparing_allocated) > SUM(l.demand)
        THEN SUM(l.demand)
        ELSE SUM(l.preparing_allocated)
      END
    END AS preparing_allocated,
    CASE WHEN COUNT(l.shipped) = COUNT(*) THEN SUM(l.shipped) END AS shipped,
    CASE
      WHEN COUNT(l.demand) = COUNT(*) AND COUNT(l.preparing_allocated) = COUNT(*)
      THEN CASE
        WHEN SUM(l.demand) > SUM(l.preparing_allocated)
        THEN SUM(l.demand) - SUM(l.preparing_allocated)
        ELSE 0
      END
    END AS remaining
  FROM branch_upstream_open_lines AS l
  GROUP BY
    l.warehouse_code,
    l.base,
    l.order_no,
    l.sku
), branch_upstream_pool_quality AS (
  SELECT
    l.base AS base,
    l.sku AS sku,
    MAX(l.invalid) AS invalid
  FROM branch_upstream_order_sku AS l
  GROUP BY
    l.base,
    l.sku
), branch_upstream_preceding AS (
  SELECT
    l.warehouse_code AS warehouse_code,
    l.base AS base,
    l.order_no AS order_no,
    l.sku AS sku,
    COALESCE(SUM(p.remaining), 0) AS prior_remaining
  FROM branch_upstream_order_sku AS l
  INNER JOIN branch_upstream_pool_quality AS valid_pool
    ON (
      l.base = valid_pool.base OR (
        l.base IS NULL AND valid_pool.base IS NULL
      )
    )
    AND (
      l.sku = valid_pool.sku OR (
        l.sku IS NULL AND valid_pool.sku IS NULL
      )
    )
  LEFT JOIN branch_upstream_order_sku AS p
    ON p.remaining > 0
    AND (
      l.base = p.base OR (
        l.base IS NULL AND p.base IS NULL
      )
    )
    AND (
      l.sku = p.sku OR (
        l.sku IS NULL AND p.sku IS NULL
      )
    )
    AND (
      p.created_at < l.created_at
      OR (
        p.created_at = l.created_at AND p.order_no < l.order_no
      )
      OR (
        p.created_at = l.created_at
        AND p.order_no = l.order_no
        AND p.warehouse_code < l.warehouse_code
      )
    )
  WHERE
    valid_pool.invalid = 0 AND l.remaining > 0
  GROUP BY
    l.warehouse_code,
    l.base,
    l.order_no,
    l.sku
), branch_upstream_allocation AS (
  SELECT
    l.warehouse_code AS warehouse_code,
    l.warehouse_name AS warehouse_name,
    l.base AS base,
    l.order_no AS order_no,
    l.sku AS sku,
    l.material_name AS material_name,
    l.created_at AS created_at,
    l.requested_at AS requested_at,
    l.order_status AS order_status,
    l.source_updated_at AS source_updated_at,
    l.ordered AS ordered,
    l.demand AS demand,
    l.preparing_demand AS preparing_demand,
    l.allocated AS allocated,
    l.preparing_allocated AS preparing_allocated,
    l.shipped AS shipped,
    l.remaining AS remaining,
    CASE
      WHEN l.invalid = 0 AND l.remaining = 0
      THEN 0
      WHEN pr.source_count = 0
      OR q.invalid <> 0
      OR s.month_date IS NULL
      OR bs.base IS NULL
      OR (
        b.sku IS NOT NULL AND b.available IS NULL
      )
      THEN 1
      ELSE 0
    END AS invalid,
    CASE
      WHEN l.invalid = 0 AND l.remaining = 0
      THEN 0
      WHEN pr.source_count > 0
      AND q.invalid = 0
      AND s.month_date IS NOT NULL
      AND bs.base IS NOT NULL
      AND (
        b.sku IS NULL OR b.available IS NOT NULL
      )
      THEN CASE
        WHEN COALESCE(b.available, 0) <= p.prior_remaining
        THEN 0
        WHEN COALESCE(b.available, 0) - p.prior_remaining >= l.remaining
        THEN l.remaining
        ELSE COALESCE(b.available, 0) - p.prior_remaining
      END
    END AS available
  FROM branch_upstream_order_sku AS l
  LEFT JOIN branch_upstream_preceding AS p
    ON l.warehouse_code = p.warehouse_code
    AND (
      l.base = p.base OR (
        l.base IS NULL AND p.base IS NULL
      )
    )
    AND l.order_no = p.order_no
    AND (
      l.sku = p.sku OR (
        l.sku IS NULL AND p.sku IS NULL
      )
    )
  INNER JOIN branch_upstream_pool_quality AS q
    ON (
      l.base = q.base OR (
        l.base IS NULL AND q.base IS NULL
      )
    )
    AND (
      l.sku = q.sku OR (
        l.sku IS NULL AND q.sku IS NULL
      )
    )
  CROSS JOIN branch_upstream_snapshot AS s
  CROSS JOIN branch_upstream_presence AS pr
  LEFT JOIN branch_upstream_base_stock AS b
    ON l.base = b.base AND l.sku = b.sku
  LEFT JOIN branch_upstream_bases AS bs
    ON l.base = bs.base
), branch_upstream_current AS (
  SELECT
    l.warehouse_code AS warehouse_code,
    l.warehouse_name AS warehouse_name,
    l.base AS base,
    l.order_no AS order_no,
    l.sku AS sku,
    l.material_name AS material_name,
    l.created_at AS created_at,
    l.requested_at AS requested_at,
    l.order_status AS order_status,
    l.source_updated_at AS source_updated_at,
    l.ordered AS ordered,
    l.demand AS demand,
    l.preparing_demand AS preparing_demand,
    l.allocated AS allocated,
    l.preparing_allocated AS preparing_allocated,
    l.shipped AS shipped,
    l.remaining AS remaining,
    l.invalid AS invalid,
    l.available AS available,
    CASE
      WHEN l.invalid = 0
      THEN CASE WHEN l.remaining > l.available THEN l.remaining - l.available ELSE 0 END
    END AS shortage
  FROM branch_upstream_allocation AS l
), branch_upstream_materials AS (
  SELECT
    m.material_code AS sku,
    CASE
      WHEN COUNT(DISTINCT NULLIF(TRIM(m.product_categ_name), '')) = 1
      THEN MAX(NULLIF(TRIM(m.product_categ_name), ''))
    END AS category,
    CASE
      WHEN COUNT(DISTINCT NULLIF(TRIM(m.material_group_name), '')) = 1
      THEN MAX(NULLIF(TRIM(m.material_group_name), ''))
    END AS material_group
  FROM agents_scm_material_in_out_summary_d AS m
  GROUP BY
    m.material_code
), branch_current_source AS (
  SELECT
    CAST(CONCAT(
      SUBSTRING(s.month_date, 1, 4),
      '-',
      SUBSTRING(s.month_date, 5, 2),
      '-',
      SUBSTRING(s.month_date, 7, 2)
    ) AS DATE) AS snapshot_date,
    '分仓' AS location_type,
    l.warehouse_code AS location_code,
    l.warehouse_name AS location_name,
    l.base AS base,
    l.warehouse_code AS warehouse_code,
    l.sku AS sku,
    l.material_name AS material_name,
    m.category AS category,
    m.material_group AS material_group,
    l.demand AS demand,
    l.preparing_allocated AS allocated,
    l.remaining AS remaining,
    l.available AS available,
    l.shortage AS shortage,
    l.invalid AS invalid
  FROM branch_upstream_current AS l
  CROSS JOIN branch_upstream_snapshot AS s
  LEFT JOIN branch_upstream_materials AS m
    ON l.sku = m.sku
  UNION ALL
  SELECT
    CAST(CONCAT(
      SUBSTRING(s.month_date, 1, 4),
      '-',
      SUBSTRING(s.month_date, 5, 2),
      '-',
      SUBSTRING(s.month_date, 7, 2)
    ) AS DATE) AS snapshot_date,
    '分仓' AS location_type,
    w.warehouse_code AS location_code,
    w.warehouse_name AS location_name,
    CAST(NULL AS VARCHAR(255)) AS base,
    w.warehouse_code AS warehouse_code,
    CAST(NULL AS VARCHAR(255)) AS sku,
    CAST(NULL AS VARCHAR(255)) AS material_name,
    CAST(NULL AS VARCHAR(255)) AS category,
    CAST(NULL AS VARCHAR(255)) AS material_group,
    CASE WHEN pr.source_count > 0 THEN 0 END AS demand,
    CASE WHEN pr.source_count > 0 THEN 0 END AS allocated,
    CASE WHEN pr.source_count > 0 THEN 0 END AS remaining,
    CASE WHEN pr.source_count > 0 THEN 0 END AS available,
    CASE WHEN pr.source_count > 0 THEN 0 END AS shortage,
    CASE WHEN s.month_date IS NULL OR pr.source_count = 0 THEN 1 ELSE 0 END AS invalid
  FROM branch_upstream_warehouses AS w
  CROSS JOIN branch_upstream_snapshot AS s
  CROSS JOIN branch_upstream_presence AS pr
  LEFT JOIN (
    SELECT
      l.warehouse_code AS warehouse_code
    FROM branch_upstream_current AS l
    GROUP BY
      l.warehouse_code
  ) AS o
    ON w.warehouse_code = o.warehouse_code
  WHERE
    o.warehouse_code IS NULL
), branch_filtered AS (
  SELECT
    r.snapshot_date AS snapshot_date,
    r.location_type AS location_type,
    r.location_code AS location_code,
    r.location_name AS location_name,
    r.base AS base,
    r.warehouse_code AS warehouse_code,
    r.sku AS sku,
    r.material_name AS material_name,
    r.category AS category,
    r.material_group AS material_group,
    r.demand AS demand,
    r.allocated AS allocated,
    r.remaining AS remaining,
    r.available AS available,
    r.shortage AS shortage,
    r.invalid AS invalid
  FROM branch_current_source AS r
  WHERE
    (
      NULL IS NULL OR r.base = NULL
    )
    AND (
      NULL IS NULL OR r.warehouse_code = NULL
    )
    AND (
      NULL IS NULL OR r.sku = NULL
    )
    AND (
      NULL IS NULL OR r.category = NULL
    )
), filtered AS (
  SELECT
    f.snapshot_date AS snapshot_date,
    f.location_type AS location_type,
    f.location_code AS location_code,
    f.location_name AS location_name,
    f.base AS base,
    f.warehouse_code AS warehouse_code,
    f.sku AS sku,
    f.material_name AS material_name,
    f.category AS category,
    f.material_group AS material_group,
    f.demand AS demand,
    f.allocated AS allocated,
    f.remaining AS remaining,
    f.available AS available,
    f.shortage AS shortage,
    f.invalid AS invalid
  FROM base_filtered AS f
  UNION ALL
  SELECT
    f.snapshot_date AS snapshot_date,
    f.location_type AS location_type,
    f.location_code AS location_code,
    f.location_name AS location_name,
    f.base AS base,
    f.warehouse_code AS warehouse_code,
    f.sku AS sku,
    f.material_name AS material_name,
    f.category AS category,
    f.material_group AS material_group,
    f.demand AS demand,
    f.allocated AS allocated,
    f.remaining AS remaining,
    f.available AS available,
    f.shortage AS shortage,
    f.invalid AS invalid
  FROM branch_filtered AS f
)
SELECT
  f.snapshot_date AS stat_date,
  f.location_type AS location_type,
  f.location_code AS location_code,
  f.location_name AS location_name,
  f.base AS belong_base,
  f.warehouse_code AS warehouseid,
  f.sku AS material_code,
  f.material_name AS material_name,
  f.category AS product_categ_name,
  f.material_group AS material_group_name,
  f.demand AS demand_qty,
  f.allocated AS allocated_qty,
  f.remaining AS remaining_qty,
  f.available AS available_qty,
  f.shortage AS shortage_qty,
  f.invalid AS invalid_sku
FROM filtered AS f
