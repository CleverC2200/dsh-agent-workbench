WITH latest_inventory AS (
  SELECT
    MAX(agents_scm_inventory_sku_data_d.month_date) AS month_date
  FROM agents_scm_inventory_sku_data_d AS agents_scm_inventory_sku_data_d
  WHERE
    agents_scm_inventory_sku_data_d.warehouse_classify IN ('01', '02', '20')
), warehouse_points AS (
  SELECT
    agents_scm_material_in_out_summary_d.warehouseid AS warehouseid,
    CASE
      WHEN COUNT(DISTINCT NULLIF(TRIM(agents_scm_material_in_out_summary_d.pickup_point), '')) = 1
      THEN MAX(NULLIF(TRIM(agents_scm_material_in_out_summary_d.pickup_point), ''))
    END AS pickup_point
  FROM agents_scm_material_in_out_summary_d AS agents_scm_material_in_out_summary_d
  GROUP BY
    agents_scm_material_in_out_summary_d.warehouseid
), inventory_rows AS (
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
  INNER JOIN latest_inventory AS s
    ON i.month_date = s.month_date
  LEFT JOIN warehouse_points AS w
    ON i.warehouseid = w.warehouseid
  WHERE
    i.warehouse_classify IN ('01', '02', '20')
), point_location_candidates AS (
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
  FROM inventory_rows AS inventory_rows
  WHERE
    NOT inventory_rows.pickup_point IS NULL
    AND NOT NULLIF(TRIM(inventory_rows.location_code), '') IS NULL
  GROUP BY
    inventory_rows.pickup_point,
    inventory_rows.location_type,
    inventory_rows.location_code
), point_locations AS (
  SELECT
    point_location_candidates.pickup_point AS pickup_point,
    MAX(point_location_candidates.location_type) AS location_type,
    MAX(point_location_candidates.location_code) AS location_code,
    MAX(point_location_candidates.location_name) AS location_name,
    MAX(point_location_candidates.belong_base) AS belong_base,
    MAX(point_location_candidates.warehouseid) AS warehouseid
  FROM point_location_candidates AS point_location_candidates
  GROUP BY
    point_location_candidates.pickup_point
  HAVING
    COUNT(*) = 1
    AND MAX(point_location_candidates.name_count) = 1
    AND MAX(point_location_candidates.base_count) = 1
), eligible_order_sku AS (
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
    SUM(COALESCE(o.adjust_order_qty, 0)) AS demand_qty,
    SUM(COALESCE(o.qtyallocated, 0)) AS allocated_qty,
    CASE
      WHEN SUM(COALESCE(o.adjust_order_qty, 0)) - SUM(COALESCE(o.qtyallocated, 0)) > 0
      THEN SUM(COALESCE(o.adjust_order_qty, 0)) - SUM(COALESCE(o.qtyallocated, 0))
      ELSE 0
    END AS remaining_qty,
    COUNT(*) AS source_row_count,
    MAX(
      CASE
        WHEN m.pickup_point IS NULL
        OR NULLIF(TRIM(o.cust_order_no), '') IS NULL
        OR NULLIF(TRIM(o.material_code), '') IS NULL
        THEN 1
        ELSE 0
      END
    ) AS input_invalid
  FROM agents_scm_execute_detail_d AS o
  LEFT JOIN point_locations AS m
    ON o.pickup_point = m.pickup_point
  WHERE
    o.bizflowstatus IN (
      '等待组波',
      '组波中',
      '组波完成',
      '组波失败',
      '提交成功',
      '提交中',
      '提交失败',
      '上传验证',
      '人工释放占用',
      '撤回待改单',
      '创建'
    )
    AND (
      NOT m.pickup_point IS NULL OR NOT NULLIF(TRIM(o.belong_base), '') IS NULL
    )
  GROUP BY
    o.cust_order_no,
    o.material_code,
    CASE WHEN m.pickup_point IS NULL THEN '待映射' ELSE m.location_type END,
    CASE
      WHEN m.pickup_point IS NULL
      THEN CONCAT('unmapped:', COALESCE(o.pickup_point, 'NULL'))
      ELSE m.location_code
    END
), location_sku_demand AS (
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
    SUM(eligible_order_sku.demand_qty) AS demand_qty,
    SUM(eligible_order_sku.allocated_qty) AS allocated_qty,
    SUM(eligible_order_sku.remaining_qty) AS remaining_qty,
    SUM(eligible_order_sku.source_row_count) AS source_row_count,
    COUNT(*) AS order_sku_count,
    MAX(eligible_order_sku.input_invalid) AS input_invalid
  FROM eligible_order_sku AS eligible_order_sku
  GROUP BY
    eligible_order_sku.location_type,
    eligible_order_sku.location_code,
    eligible_order_sku.material_code
), complete_demand AS (
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
  FROM location_sku_demand AS location_sku_demand
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
  FROM inventory_rows AS l
  LEFT JOIN (
    SELECT
      location_sku_demand.location_type AS location_type,
      location_sku_demand.location_code AS location_code
    FROM location_sku_demand AS location_sku_demand
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
), inventory_batch AS (
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
  FROM inventory_rows AS inventory_rows
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
), material_attributes AS (
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
), inventory_sku AS (
  SELECT
    inventory_batch.location_type AS location_type,
    inventory_batch.location_code AS location_code,
    inventory_batch.material_code AS material_code,
    SUM(inventory_batch.available_qty) AS available_qty,
    SUM(inventory_batch.duplicate_batch) AS duplicate_batch
  FROM inventory_batch AS inventory_batch
  GROUP BY
    inventory_batch.location_type,
    inventory_batch.location_code,
    inventory_batch.material_code
)
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
FROM complete_demand AS d
CROSS JOIN latest_inventory AS s
LEFT JOIN inventory_sku AS i
  ON d.location_type = i.location_type
  AND d.location_code = i.location_code
  AND d.material_code = i.material_code
LEFT JOIN material_attributes AS a
  ON d.material_code = a.material_code
