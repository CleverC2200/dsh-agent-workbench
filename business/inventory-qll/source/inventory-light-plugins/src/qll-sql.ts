// Fixed company queries selected from registered original15 096e2ccf43a2d766853163754d7469ccb8879fb1.
const BASE_SQL = `WITH "latest_snapshot" AS (
  SELECT
    MAX("agents_scm_safety_stock"."inventory_snapshot_time") AS "value"
  FROM "agents_scm_safety_stock" AS "agents_scm_safety_stock"
  WHERE
    "agents_scm_safety_stock"."inventory_snapshot_time" < CAST($1 AS DATE) + INTERVAL '1 DAY'
    AND (
      "agents_scm_safety_stock"."target_month" = CAST($2 AS DATE)
      OR (CAST($7 AS BOOLEAN) AND EXTRACT(DAY FROM CAST($1 AS DATE)) >= 21
        AND "agents_scm_safety_stock"."target_month" = CAST(CAST($2 AS DATE) + INTERVAL '1 MONTH' AS DATE))
    )
), "chosen_month" AS (
  SELECT
    CASE
      WHEN CAST($7 AS BOOLEAN)
      AND EXTRACT(DAY FROM CAST($1 AS DATE)) >= 21
      AND EXISTS(
        SELECT
          1 AS "value_0"
        FROM "agents_scm_safety_stock" AS "agents_scm_safety_stock"
        CROSS JOIN "latest_snapshot" AS "latest_snapshot"
        WHERE
          "agents_scm_safety_stock"."inventory_snapshot_time" = "latest_snapshot"."value"
          AND "agents_scm_safety_stock"."target_month" = CAST((
            CAST($2 AS DATE) + INTERVAL '1 MONTH'
          ) AS DATE)
      )
      THEN CAST((
        CAST($2 AS DATE) + INTERVAL '1 MONTH'
      ) AS DATE)
      ELSE CAST($2 AS DATE)
    END AS "value"
), "versioned" AS (
  SELECT
    "s"."id" AS "id",
    "s"."base_name" AS "base_name",
    "s"."inventory_snapshot_time" AS "inventory_snapshot_time",
    "s"."material_code" AS "material_code",
    "s"."material_name" AS "material_name",
    "s"."product_categ_name" AS "product_categ_name",
    "s"."product_label" AS "product_label",
    "s"."current_inventory" AS "current_inventory",
    "s"."turnover_inventory" AS "turnover_inventory",
    "s"."avg_daily_planned_demand" AS "avg_daily_planned_demand",
    "s"."final_target_inventory" AS "final_target_inventory",
    "s"."avg_30d_sale" AS "avg_30d_sale",
    "s"."final_target_turnover_days" AS "final_target_turnover_days",
    CASE
      WHEN "s"."inventory_version" LIKE '%纠偏%'
      THEN 1
      WHEN "s"."inventory_version" LIKE '%月初%'
      THEN 2
      WHEN "s"."inventory_version" LIKE '%滚动%'
      THEN 3
      ELSE 4
    END AS "priority"
  FROM "agents_scm_safety_stock" AS "s"
  CROSS JOIN "latest_snapshot" AS "latest_snapshot"
  CROSS JOIN "chosen_month" AS "chosen_month"
  WHERE
    "s"."inventory_snapshot_time" = "latest_snapshot"."value"
    AND "s"."target_month" = "chosen_month"."value"
    AND "s"."base_name" IN ('华东', '华南', '西南', '遂平', '郑州')
), "selected" AS (
  SELECT
    MIN("versioned"."priority") AS "priority"
  FROM "versioned" AS "versioned"
  WHERE
    "versioned"."priority" < 4
), "ranked_ids" AS (
  SELECT
    MAX("versioned"."id") AS "id"
  FROM "versioned" AS "versioned"
  GROUP BY
    "versioned"."base_name",
    "versioned"."material_code",
    "versioned"."priority"
), "ranked" AS (
  SELECT
    "v"."id" AS "id",
    "v"."base_name" AS "base_name",
    "v"."inventory_snapshot_time" AS "inventory_snapshot_time",
    "v"."material_code" AS "material_code",
    "v"."material_name" AS "material_name",
    "v"."product_categ_name" AS "product_categ_name",
    "v"."product_label" AS "product_label",
    "v"."current_inventory" AS "current_inventory",
    "v"."turnover_inventory" AS "turnover_inventory",
    "v"."avg_daily_planned_demand" AS "avg_daily_planned_demand",
    "v"."final_target_inventory" AS "final_target_inventory",
    "v"."avg_30d_sale" AS "avg_30d_sale",
    "v"."final_target_turnover_days" AS "final_target_turnover_days",
    "v"."priority" AS "priority"
  FROM "versioned" AS "v"
  INNER JOIN "ranked_ids" AS "k"
    ON "v"."id" = "k"."id"
), "month_start_values" AS (
  SELECT
    "ranked"."base_name" AS "base_name",
    "ranked"."material_code" AS "material_code",
    MAX("ranked"."final_target_inventory") FILTER(WHERE
      "ranked"."priority" = 2 AND "ranked"."material_code" IS NOT NULL) AS "month_start_target",
    MAX("ranked"."avg_daily_planned_demand") FILTER(WHERE
      "ranked"."priority" = 2 AND "ranked"."material_code" IS NOT NULL) AS "month_start_daily",
    MAX("ranked"."turnover_inventory") FILTER(WHERE
      "ranked"."priority" = 2 AND "ranked"."material_code" IS NOT NULL) AS "month_start_turnover"
  FROM "ranked" AS "ranked"
  GROUP BY
    "ranked"."base_name",
    "ranked"."material_code"
), "with_month_start" AS (
  SELECT
    "r"."id" AS "id",
    "r"."base_name" AS "base_name",
    "r"."inventory_snapshot_time" AS "inventory_snapshot_time",
    "r"."material_code" AS "material_code",
    "r"."material_name" AS "material_name",
    "r"."product_categ_name" AS "product_categ_name",
    "r"."product_label" AS "product_label",
    "r"."current_inventory" AS "current_inventory",
    "r"."turnover_inventory" AS "turnover_inventory",
    "r"."avg_daily_planned_demand" AS "avg_daily_planned_demand",
    "r"."final_target_inventory" AS "final_target_inventory",
    "r"."avg_30d_sale" AS "avg_30d_sale",
    "r"."final_target_turnover_days" AS "final_target_turnover_days",
    "r"."priority" AS "priority",
    "m"."month_start_target" AS "month_start_target",
    "m"."month_start_daily" AS "month_start_daily",
    "m"."month_start_turnover" AS "month_start_turnover"
  FROM "ranked" AS "r"
  LEFT JOIN "month_start_values" AS "m"
    ON COALESCE("r"."base_name", '') = COALESCE("m"."base_name", '')
    AND (
      "r"."base_name" IS NULL
    ) = (
      "m"."base_name" IS NULL
    )
    AND COALESCE(CAST("r"."material_code" AS TEXT), '') = COALESCE(CAST("m"."material_code" AS TEXT), '')
    AND (
      "r"."material_code" IS NULL
    ) = (
      "m"."material_code" IS NULL
    )
), "resolved_ids" AS (
  SELECT
    COALESCE(
      MAX("r"."id") FILTER(WHERE
        "r"."priority" = "s"."priority"),
      MAX("r"."id") FILTER(WHERE
        "s"."priority" = 1 AND "r"."priority" = 2)
    ) AS "id"
  FROM "with_month_start" AS "r"
  CROSS JOIN "selected" AS "s"
  GROUP BY
    "r"."base_name",
    "r"."material_code"
), "resolved" AS (
  SELECT
    "r"."base_name" AS "base_name",
    "r"."inventory_snapshot_time" AS "inventory_snapshot_time",
    "r"."material_code" AS "material_code",
    "r"."material_name" AS "material_name",
    "r"."product_categ_name" AS "product_categ_name",
    "r"."product_label" AS "product_label",
    "r"."current_inventory" AS "current_inventory",
    "r"."avg_30d_sale" AS "avg_30d_sale",
    "r"."final_target_turnover_days" AS "final_target_turnover_days",
    CASE
      WHEN "r"."priority" = 1
      AND COALESCE("r"."final_target_inventory", 0) <= 0
      AND "r"."month_start_target" > 0
      THEN "r"."month_start_target"
      ELSE "r"."final_target_inventory"
    END AS "resolved_target",
    CASE
      WHEN "r"."priority" = 1
      AND COALESCE("r"."avg_daily_planned_demand", 0) <= 0
      AND "r"."month_start_daily" > 0
      THEN "r"."month_start_daily"
      ELSE "r"."avg_daily_planned_demand"
    END AS "resolved_daily",
    CASE
      WHEN "r"."priority" = 1
      AND COALESCE("r"."turnover_inventory", 0) <= 0
      AND "r"."month_start_turnover" > 0
      THEN "r"."month_start_turnover"
      ELSE "r"."turnover_inventory"
    END AS "resolved_turnover"
  FROM "with_month_start" AS "r"
  INNER JOIN "resolved_ids" AS "k"
    ON "r"."id" = "k"."id"
)
SELECT
  CAST("resolved"."inventory_snapshot_time" AS DATE) AS "snapshot_date",
  "resolved"."base_name" AS "base_name",
  COALESCE("resolved"."product_categ_name", '未分类') AS "category",
  CAST("resolved"."material_code" AS TEXT) AS "sku",
  "resolved"."current_inventory" AS "current_qty",
  CASE
    WHEN "resolved"."product_categ_name" = '粽子'
    OR "resolved"."product_label" LIKE '%粽子%'
    OR "resolved"."material_name" LIKE '%粽子%'
    THEN CASE
      WHEN "resolved"."resolved_daily" > 0
      THEN "resolved"."resolved_turnover"
      WHEN "resolved"."resolved_daily" = 0
      THEN 0
    END
    ELSE "resolved"."resolved_target"
  END AS "target_qty",
  "resolved"."resolved_daily" AS "planned_daily_qty",
  30 * "resolved"."avg_30d_sale" AS "external_demand_30d",
  "resolved"."final_target_turnover_days" AS "source_target_turnover_days",
  CAST(NULL AS DECIMAL) AS "transfer_out_30d"
FROM "resolved" AS "resolved"
WHERE
  (
    :scope_3 OR "resolved"."base_name" IN (:list_3)
  )
  AND (
    CAST($4 AS TEXT) IS NULL OR "resolved"."base_name" = $4
  )
  AND (
    CAST($5 AS TEXT) IS NULL OR "resolved"."product_categ_name" = $5
  )
  AND (
    CAST($6 AS TEXT) IS NULL OR CAST("resolved"."material_code" AS TEXT) = $6
  )
ORDER BY
  "base_name",
  "category",
  "sku",
  "snapshot_date",
  "current_qty",
  "target_qty",
  "planned_daily_qty",
  "external_demand_30d",
  "transfer_out_30d"`;

const BRANCH_SQL = `WITH "catalog_scopes" AS (
  SELECT DISTINCT
    COALESCE(
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."pickup_point"), ''),
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."self_pickup_point"), '')
    ) AS "pickup_code",
    "agents_scm_branch_inventory_snapshot"."warehouseid" AS "warehouseid",
    NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."warehouse_name"), '') AS "warehouse_name"
  FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
  WHERE
    "agents_scm_branch_inventory_snapshot"."snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_inventory_snapshot"."snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
      WHERE
        "agents_scm_branch_inventory_snapshot"."snapshot_date" <= CAST($1 AS DATE)
    )
    AND "agents_scm_branch_inventory_snapshot"."warehouse_classify" = '20'
), "catalog_plan_labels" AS (
  SELECT DISTINCT
    TRIM("agents_scm_branch_plan"."branch_pickup_point") AS "source_branch_key",
    CASE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
      WHEN '上海配送中心'
      THEN '上海分仓'
      WHEN '武汉配送中心'
      THEN '武汉分仓'
      ELSE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
    END AS "warehouse_name"
  FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
  WHERE
    "agents_scm_branch_plan"."plan_snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_plan"."plan_snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
      WHERE
        "agents_scm_branch_plan"."plan_snapshot_date" <= CAST($1 AS DATE)
    )
    AND NULLIF(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '') IS NOT NULL
), "catalog_name_codes" AS (
  SELECT
    "catalog_scopes"."warehouse_name" AS "warehouse_name",
    COUNT(DISTINCT "catalog_scopes"."pickup_code") AS "code_count"
  FROM "catalog_scopes" AS "catalog_scopes"
  GROUP BY
    "catalog_scopes"."warehouse_name"
), "catalog_candidates" AS (
  SELECT
    "s"."pickup_code" AS "pickup_code",
    MIN("s"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  WHERE
    "s"."pickup_code" ~ '^[A-Z0-9]{1,16}$' AND "s"."warehouse_name" IS NOT NULL
  GROUP BY
    "s"."pickup_code"
  HAVING
    COUNT(DISTINCT "s"."warehouse_name") = 1
), "catalog_unique" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_candidates" AS "c"
  INNER JOIN "catalog_name_codes" AS "n"
    ON "n"."warehouse_name" = "c"."branch_pickup_point" AND "n"."code_count" = 1
), "branch_catalog" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point",
    COALESCE(
      MIN(
        CASE
          WHEN "p"."source_branch_key" = "c"."pickup_code"
          THEN "p"."source_branch_key"
        END
      ),
      MIN("p"."source_branch_key"),
      "c"."pickup_code"
    ) AS "source_branch_key"
  FROM "catalog_unique" AS "c"
  LEFT JOIN "catalog_plan_labels" AS "p"
    ON "p"."source_branch_key" = "c"."pickup_code"
    OR "p"."warehouse_name" = "c"."branch_pickup_point"
  GROUP BY
    "c"."pickup_code",
    "c"."branch_pickup_point"
), "catalog_plans" AS (
  SELECT
    COALESCE("c"."branch_pickup_point", "p"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_plan_labels" AS "p"
  LEFT JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "p"."source_branch_key"
    OR "c"."branch_pickup_point" = "p"."warehouse_name"
), "catalog_warehouse_links" AS (
  SELECT
    "s"."warehouseid" AS "warehouseid",
    MIN("c"."pickup_code") AS "pickup_code",
    MIN("c"."branch_pickup_point") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "s"."pickup_code"
  GROUP BY
    "s"."warehouseid"
  HAVING
    COUNT(DISTINCT "c"."pickup_code") = 1
), "mapped_branch_inventory" AS (
  SELECT
    "i"."snapshot_date" AS "snapshot_date",
    "i"."material_code" AS "material_code",
    "i"."product_categ_name" AS "product_categ_name",
    "i"."live_qty" AS "live_qty",
    "i"."available_qty" AS "available_qty",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "agents_scm_branch_inventory_snapshot" AS "i"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = COALESCE(NULLIF(TRIM("i"."pickup_point"), ''), NULLIF(TRIM("i"."self_pickup_point"), ''))
  WHERE
    "i"."snapshot_date" <= CAST($1 AS DATE) AND "i"."warehouse_classify" = '20'
), "latest_plan" AS (
  SELECT
    MAX("agents_scm_branch_plan"."plan_snapshot_date") AS "value"
  FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
  WHERE
    "agents_scm_branch_plan"."plan_snapshot_date" <= CAST($1 AS DATE)
), "chosen_month" AS (
  SELECT
    CAST($2 AS DATE) AS "value"
), "selected_versions" AS (
  SELECT
    TRIM("pv"."branch_pickup_point") AS "branch_key",
    COALESCE(
      MIN("pv"."plan_version") FILTER(WHERE
        "pv"."plan_version" = 'MONTH_START'),
      MIN("pv"."plan_version") FILTER(WHERE
        "pv"."plan_version" = 'ROLLING'),
      MIN("pv"."plan_version")
    ) AS "plan_version"
  FROM "agents_scm_branch_plan" AS "pv"
  CROSS JOIN "latest_plan" AS "latest_plan"
  CROSS JOIN "chosen_month" AS "chosen_month"
  WHERE
    "pv"."plan_snapshot_date" = "latest_plan"."value"
    AND "pv"."target_month" = "chosen_month"."value"
  GROUP BY
    TRIM("pv"."branch_pickup_point")
), "plan_candidates" AS (
  SELECT
    "p"."id" AS "id",
    "p"."updated_time" AS "updated_time",
    CASE WHEN "p"."plan_status" = 'READY' THEN 0 ELSE 1 END AS "readiness",
    "c"."branch_pickup_point" AS "source_branch_key",
    "p"."material_code" AS "material_code",
    "p"."product_categ_name" AS "product_categ_name",
    CASE
      WHEN "p"."plan_status" = 'READY'
      AND NOT COALESCE("p"."bi_target_status", '') ~ 'MISSING|INVALID|INCOMPLETE|PENDING'
      THEN "p"."shipment_plan_qty"
    END AS "shipment_plan_qty",
    CASE
      WHEN "p"."plan_status" = 'READY'
      AND NOT COALESCE("p"."bi_target_status", '') ~ 'MISSING|INVALID|INCOMPLETE|PENDING'
      THEN "p"."expected_month_end_inventory_qty"
    END AS "expected_month_end_inventory_qty",
    "p"."replenishment_cycle_days" AS "replenishment_cycle_days"
  FROM "agents_scm_branch_plan" AS "p"
  JOIN "branch_catalog" AS "c"
    ON "c"."source_branch_key" = TRIM("p"."branch_pickup_point")
  JOIN "selected_versions" AS "v"
    ON "v"."branch_key" = TRIM("p"."branch_pickup_point")
    AND "v"."plan_version" = "p"."plan_version"
  CROSS JOIN "latest_plan" AS "latest_plan"
  CROSS JOIN "chosen_month" AS "chosen_month"
  WHERE
    "p"."plan_snapshot_date" = "latest_plan"."value"
    AND "p"."target_month" = "chosen_month"."value"
    AND (
      CAST($5 AS TEXT) IS NULL OR "p"."product_categ_name" = $5
    )
    AND (
      CAST($6 AS TEXT) IS NULL OR "p"."material_code" = $6
    )
), "plan_rows" AS (
  SELECT
    "c"."source_branch_key" AS "branch_pickup_point",
    "c"."material_code" AS "material_code",
    "c"."product_categ_name" AS "product_categ_name",
    "c"."shipment_plan_qty" AS "shipment_plan_qty",
    "c"."expected_month_end_inventory_qty" AS "expected_month_end_inventory_qty",
    "c"."replenishment_cycle_days" AS "replenishment_cycle_days"
  FROM "plan_candidates" AS "c"
  LEFT JOIN "plan_candidates" AS "better"
    ON "c"."source_branch_key" = "better"."source_branch_key"
    AND "c"."material_code" = "better"."material_code"
    AND (
      "better"."readiness" < "c"."readiness"
      OR (
        "better"."readiness" = "c"."readiness"
        AND (
          (
            "better"."updated_time" IS NULL AND "c"."updated_time" IS NOT NULL
          )
          OR "better"."updated_time" > "c"."updated_time"
          OR (
            (
              "better"."updated_time" = "c"."updated_time"
              OR (
                "better"."updated_time" IS NULL AND "c"."updated_time" IS NULL
              )
            )
            AND "better"."id" > "c"."id"
          )
        )
      )
    )
  WHERE
    "better"."id" IS NULL
), "latest_inventory" AS (
  SELECT
    MAX("agents_scm_branch_inventory_snapshot"."snapshot_date") AS "value"
  FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
  WHERE
    "agents_scm_branch_inventory_snapshot"."snapshot_date" <= CAST($1 AS DATE)
), "inventory_rows" AS (
  SELECT
    "mapped_branch_inventory"."snapshot_date" AS "snapshot_date",
    "mapped_branch_inventory"."branch_pickup_point" AS "branch",
    "mapped_branch_inventory"."material_code" AS "material_code",
    MAX("mapped_branch_inventory"."product_categ_name") AS "category",
    SUM("mapped_branch_inventory"."live_qty") AS "current_qty",
    CASE
      WHEN BOOL_AND("mapped_branch_inventory"."available_qty" IS NOT NULL)
      THEN SUM("mapped_branch_inventory"."available_qty")
    END AS "available_qty"
  FROM "mapped_branch_inventory" AS "mapped_branch_inventory"
  CROSS JOIN "latest_inventory" AS "latest_inventory"
  WHERE
    "mapped_branch_inventory"."snapshot_date" = "latest_inventory"."value"
    AND (
      :scope_3 OR "mapped_branch_inventory"."branch_pickup_point" IN (:list_3)
    )
    AND (
      CAST($4 AS TEXT) IS NULL OR "mapped_branch_inventory"."branch_pickup_point" = $4
    )
    AND (
      CAST($5 AS TEXT) IS NULL OR "mapped_branch_inventory"."product_categ_name" = $5
    )
    AND (
      CAST($6 AS TEXT) IS NULL OR "mapped_branch_inventory"."material_code" = $6
    )
  GROUP BY
    "mapped_branch_inventory"."snapshot_date",
    "mapped_branch_inventory"."branch_pickup_point",
    "mapped_branch_inventory"."material_code"
), "branch_result" AS (
  SELECT
    "inventory_rows"."snapshot_date" AS "snapshot_date",
    "inventory_rows"."branch" AS "branch",
    COALESCE("inventory_rows"."category", "plan_rows"."product_categ_name", '未分类') AS "category",
    "inventory_rows"."material_code" AS "sku",
    "inventory_rows"."current_qty" AS "current_qty",
    "inventory_rows"."available_qty" AS "available_qty",
    "plan_rows"."shipment_plan_qty" / EXTRACT(DAY FROM (
      DATE_TRUNC('MONTH', "chosen_month"."value") + INTERVAL '1 month - 1 day'
    )) AS "planned_daily_qty",
    "plan_rows"."expected_month_end_inventory_qty" AS "forecast_inventory_qty",
    CASE
      WHEN "plan_rows"."replenishment_cycle_days" >= 0
      AND "plan_rows"."shipment_plan_qty" >= 0
      THEN (
        "plan_rows"."replenishment_cycle_days" + 3
      ) * "plan_rows"."shipment_plan_qty" / EXTRACT(DAY FROM (
        DATE_TRUNC('MONTH', "chosen_month"."value") + INTERVAL '1 month - 1 day'
      ))
    END AS "target_qty",
    CAST(NULL AS DECIMAL) AS "external_demand_30d"
  FROM "inventory_rows" AS "inventory_rows"
  CROSS JOIN "chosen_month" AS "chosen_month"
  LEFT JOIN "plan_rows" AS "plan_rows"
    ON "plan_rows"."branch_pickup_point" = "inventory_rows"."branch"
    AND "plan_rows"."material_code" = "inventory_rows"."material_code"
)
SELECT
  "branch_result"."snapshot_date" AS "snapshot_date",
  "branch_result"."branch" AS "branch",
  "branch_result"."category" AS "category",
  "branch_result"."sku" AS "sku",
  "branch_result"."current_qty" AS "current_qty",
  "branch_result"."available_qty" AS "available_qty",
  "branch_result"."planned_daily_qty" AS "planned_daily_qty",
  "branch_result"."forecast_inventory_qty" AS "forecast_inventory_qty",
  "branch_result"."target_qty" AS "target_qty",
  "branch_result"."external_demand_30d" AS "external_demand_30d",
  (
    SELECT
      COUNT(*) AS "total"
    FROM "catalog_plans" AS "p"
    LEFT JOIN "branch_catalog" AS "c"
      ON "c"."branch_pickup_point" = "p"."branch_pickup_point"
    WHERE
      "c"."pickup_code" IS NULL
      AND (
        :scope_3 OR "p"."branch_pickup_point" IN (:list_3)
      )
      AND (
        CAST($4 AS TEXT) IS NULL OR "p"."branch_pickup_point" = $4
      )
  ) + (
    SELECT
      COUNT(*) AS "total"
    FROM "catalog_scopes" AS "s"
    LEFT JOIN "branch_catalog" AS "c"
      ON "c"."pickup_code" = "s"."pickup_code"
    WHERE
      "c"."pickup_code" IS NULL
      AND (
        :scope_3 OR "s"."warehouse_name" IN (:list_3)
      )
      AND (
        CAST($4 AS TEXT) IS NULL OR "s"."warehouse_name" = $4
      )
  ) AS "mapping_issue_count"
FROM (
  SELECT
    1 AS _
) AS "probe"
LEFT JOIN "branch_result" AS "branch_result"
  ON TRUE
ORDER BY
  "branch_result"."branch",
  "branch_result"."category",
  "branch_result"."sku"`;

const BASE_AGE_SQL = `WITH "latest_age" AS (
  SELECT
    MAX("agents_scm_inventory_age"."snapshot_time") AS "value"
  FROM "agents_scm_inventory_age" AS "agents_scm_inventory_age"
  WHERE
    "agents_scm_inventory_age"."snapshot_time" < CAST($1 AS DATE) + INTERVAL '1 DAY'
)
SELECT
  "agents_scm_inventory_age"."snapshot_date" AS "snapshot_date",
  "agents_scm_inventory_age"."base_name" AS "object_name",
  COALESCE("agents_scm_inventory_age"."product_categ_name", '未分类') AS "category",
  "agents_scm_inventory_age"."material_code" AS "sku",
  COALESCE("agents_scm_inventory_age"."warehouseid", '-') || ':' || COALESCE(
    "agents_scm_inventory_age"."productdate",
    "agents_scm_inventory_age"."create_date",
    '-'
  ) AS "batch",
  SUM("agents_scm_inventory_age"."qty") AS "qty",
  CASE
    WHEN BOOL_AND("agents_scm_inventory_age"."productage" IS NOT NULL)
    THEN MAX("agents_scm_inventory_age"."productage")
  END AS "age_days"
FROM "agents_scm_inventory_age" AS "agents_scm_inventory_age"
CROSS JOIN "latest_age" AS "latest_age"
WHERE
  "agents_scm_inventory_age"."snapshot_time" = "latest_age"."value"
  AND "agents_scm_inventory_age"."base_name" IN ('华东', '华南', '西南', '遂平', '郑州')
  AND (
    :scope_2 OR "agents_scm_inventory_age"."base_name" IN (:list_2)
  )
  AND (
    CAST($3 AS TEXT) IS NULL OR "agents_scm_inventory_age"."base_name" = $3
  )
  AND (
    CAST($4 AS TEXT) IS NULL OR "agents_scm_inventory_age"."product_categ_name" = $4
  )
  AND (
    CAST($5 AS TEXT) IS NULL OR "agents_scm_inventory_age"."material_code" = $5
  )
GROUP BY
  "agents_scm_inventory_age"."snapshot_date",
  "agents_scm_inventory_age"."base_name",
  "agents_scm_inventory_age"."product_categ_name",
  "agents_scm_inventory_age"."material_code",
  "agents_scm_inventory_age"."warehouseid",
  "agents_scm_inventory_age"."productdate",
  "agents_scm_inventory_age"."create_date"
ORDER BY
  "agents_scm_inventory_age"."snapshot_date",
  "agents_scm_inventory_age"."base_name",
  "agents_scm_inventory_age"."product_categ_name",
  "agents_scm_inventory_age"."material_code",
  "agents_scm_inventory_age"."warehouseid",
  "agents_scm_inventory_age"."productdate",
  "agents_scm_inventory_age"."create_date"`;

const BRANCH_AGE_SQL = `WITH "catalog_scopes" AS (
  SELECT DISTINCT
    COALESCE(
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."pickup_point"), ''),
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."self_pickup_point"), '')
    ) AS "pickup_code",
    "agents_scm_branch_inventory_snapshot"."warehouseid" AS "warehouseid",
    NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."warehouse_name"), '') AS "warehouse_name"
  FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
  WHERE
    "agents_scm_branch_inventory_snapshot"."snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_inventory_snapshot"."snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
      WHERE
        "agents_scm_branch_inventory_snapshot"."snapshot_date" <= CAST($1 AS DATE)
    )
    AND "agents_scm_branch_inventory_snapshot"."warehouse_classify" = '20'
), "catalog_plan_labels" AS (
  SELECT DISTINCT
    TRIM("agents_scm_branch_plan"."branch_pickup_point") AS "source_branch_key",
    CASE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
      WHEN '上海配送中心'
      THEN '上海分仓'
      WHEN '武汉配送中心'
      THEN '武汉分仓'
      ELSE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
    END AS "warehouse_name"
  FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
  WHERE
    "agents_scm_branch_plan"."plan_snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_plan"."plan_snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
      WHERE
        "agents_scm_branch_plan"."plan_snapshot_date" <= CAST($1 AS DATE)
    )
    AND NULLIF(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '') IS NOT NULL
), "catalog_name_codes" AS (
  SELECT
    "catalog_scopes"."warehouse_name" AS "warehouse_name",
    COUNT(DISTINCT "catalog_scopes"."pickup_code") AS "code_count"
  FROM "catalog_scopes" AS "catalog_scopes"
  GROUP BY
    "catalog_scopes"."warehouse_name"
), "catalog_candidates" AS (
  SELECT
    "s"."pickup_code" AS "pickup_code",
    MIN("s"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  WHERE
    "s"."pickup_code" ~ '^[A-Z0-9]{1,16}$' AND "s"."warehouse_name" IS NOT NULL
  GROUP BY
    "s"."pickup_code"
  HAVING
    COUNT(DISTINCT "s"."warehouse_name") = 1
), "catalog_unique" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_candidates" AS "c"
  INNER JOIN "catalog_name_codes" AS "n"
    ON "n"."warehouse_name" = "c"."branch_pickup_point" AND "n"."code_count" = 1
), "branch_catalog" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_unique" AS "c"
  LEFT JOIN "catalog_plan_labels" AS "p"
    ON "p"."source_branch_key" = "c"."pickup_code"
    OR "p"."warehouse_name" = "c"."branch_pickup_point"
  GROUP BY
    "c"."pickup_code",
    "c"."branch_pickup_point"
), "catalog_plans" AS (
  SELECT
    "p"."source_branch_key" AS "source_branch_key",
    COALESCE("c"."branch_pickup_point", "p"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_plan_labels" AS "p"
  LEFT JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "p"."source_branch_key"
    OR "c"."branch_pickup_point" = "p"."warehouse_name"
), "catalog_warehouse_links" AS (
  SELECT
    "s"."warehouseid" AS "warehouseid",
    MIN("c"."pickup_code") AS "pickup_code",
    MIN("c"."branch_pickup_point") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "s"."pickup_code"
  GROUP BY
    "s"."warehouseid"
  HAVING
    COUNT(DISTINCT "c"."pickup_code") = 1
), "mapped_branch_inventory" AS (
  SELECT
    "i"."snapshot_date" AS "snapshot_date",
    "i"."warehouseid" AS "warehouseid",
    "i"."material_code" AS "material_code",
    "i"."product_categ_name" AS "product_categ_name",
    "i"."prod_date" AS "prod_date",
    "i"."live_qty" AS "live_qty",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "agents_scm_branch_inventory_snapshot" AS "i"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = COALESCE(NULLIF(TRIM("i"."pickup_point"), ''), NULLIF(TRIM("i"."self_pickup_point"), ''))
  WHERE
    "i"."snapshot_date" <= CAST($1 AS DATE) AND "i"."warehouse_classify" = '20'
), "latest_age" AS (
  SELECT
    MAX("agents_scm_branch_inventory_snapshot"."snapshot_date") AS "value"
  FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
  WHERE
    "agents_scm_branch_inventory_snapshot"."snapshot_date" <= CAST($1 AS DATE)
), "age_batches" AS (
SELECT
  "mapped_branch_inventory"."snapshot_date" AS "snapshot_date",
  "mapped_branch_inventory"."branch_pickup_point" AS "object_name",
  COALESCE("mapped_branch_inventory"."product_categ_name", '未分类') AS "category",
  "mapped_branch_inventory"."material_code" AS "sku",
  "mapped_branch_inventory"."warehouseid" || ':' || COALESCE(CAST("mapped_branch_inventory"."prod_date" AS TEXT), '-') AS "batch",
  SUM("mapped_branch_inventory"."live_qty") AS "qty",
  CASE
    WHEN "mapped_branch_inventory"."prod_date" IS NULL
    THEN NULL
    ELSE GREATEST(
      0,
      "mapped_branch_inventory"."snapshot_date" - "mapped_branch_inventory"."prod_date"
    )
  END AS "age_days"
FROM "mapped_branch_inventory" AS "mapped_branch_inventory"
CROSS JOIN "latest_age" AS "latest_age"
WHERE
  "mapped_branch_inventory"."snapshot_date" = "latest_age"."value"
  AND (
    :scope_2 OR "mapped_branch_inventory"."branch_pickup_point" IN (:list_2)
  )
  AND (
    CAST($3 AS TEXT) IS NULL OR "mapped_branch_inventory"."branch_pickup_point" = $3
  )
  AND (
    CAST($4 AS TEXT) IS NULL OR "mapped_branch_inventory"."product_categ_name" = $4
  )
  AND (
    CAST($5 AS TEXT) IS NULL OR "mapped_branch_inventory"."material_code" = $5
  )
GROUP BY
  "mapped_branch_inventory"."snapshot_date",
  "mapped_branch_inventory"."warehouseid",
  "mapped_branch_inventory"."branch_pickup_point",
  "mapped_branch_inventory"."product_categ_name",
  "mapped_branch_inventory"."material_code",
  "mapped_branch_inventory"."prod_date"
), "zero_age" AS (
SELECT "a"."snapshot_date" AS "snapshot_date", "a"."object_name" AS "object_name",
 "a"."category" AS "category", "a"."sku" AS "sku", MIN("a"."batch") AS "batch",
 SUM("a"."qty") AS "qty", MAX("a"."age_days") AS "age_days", COUNT(*) AS "batch_count"
FROM "age_batches" AS "a"
WHERE "a"."qty" = 0 OR "a"."qty" IS NULL
GROUP BY "a"."snapshot_date", "a"."object_name", "a"."category", "a"."sku",
 CASE WHEN "a"."age_days" IS NULL THEN 1 ELSE 0 END
), "summarized_age" AS (
SELECT "p"."snapshot_date" AS "snapshot_date", "p"."object_name" AS "object_name",
 "p"."category" AS "category", "p"."sku" AS "sku", "p"."batch" AS "batch",
 "p"."qty" AS "qty", "p"."age_days" AS "age_days", "p"."batch_count" AS "batch_count"
FROM "zero_age" AS "p"
UNION ALL
SELECT "n"."snapshot_date" AS "snapshot_date", "n"."object_name" AS "object_name",
 "n"."category" AS "category", "n"."sku" AS "sku", "n"."batch" AS "batch",
 "n"."qty" AS "qty", "n"."age_days" AS "age_days", 1 AS "batch_count"
FROM "age_batches" AS "n" WHERE "n"."qty" <> 0
)
SELECT "s"."snapshot_date" AS "snapshot_date", "s"."object_name" AS "object_name",
 "s"."category" AS "category", "s"."sku" AS "sku", "s"."batch" AS "batch",
 "s"."qty" AS "qty", "s"."age_days" AS "age_days", "s"."batch_count" AS "batch_count"
FROM "summarized_age" AS "s"
ORDER BY "snapshot_date", "batch", "object_name", "category", "sku", "age_days"`;

const ORDER_SQL = `WITH "catalog_scopes" AS (
  SELECT DISTINCT
    COALESCE(
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."pickup_point"), ''),
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."self_pickup_point"), '')
    ) AS "pickup_code",
    "agents_scm_branch_inventory_snapshot"."warehouseid" AS "warehouseid",
    NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."warehouse_name"), '') AS "warehouse_name"
  FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
  WHERE
    "agents_scm_branch_inventory_snapshot"."snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_inventory_snapshot"."snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
      WHERE
        "agents_scm_branch_inventory_snapshot"."snapshot_date" <= CAST($1 AS DATE)
    )
    AND "agents_scm_branch_inventory_snapshot"."warehouse_classify" = '20'
), "catalog_plan_labels" AS (
  SELECT DISTINCT
    TRIM("agents_scm_branch_plan"."branch_pickup_point") AS "source_branch_key",
    CASE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
      WHEN '上海配送中心'
      THEN '上海分仓'
      WHEN '武汉配送中心'
      THEN '武汉分仓'
      ELSE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
    END AS "warehouse_name"
  FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
  WHERE
    "agents_scm_branch_plan"."plan_snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_plan"."plan_snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
      WHERE
        "agents_scm_branch_plan"."plan_snapshot_date" <= CAST($1 AS DATE)
    )
    AND NULLIF(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '') IS NOT NULL
), "catalog_name_codes" AS (
  SELECT
    "catalog_scopes"."warehouse_name" AS "warehouse_name",
    COUNT(DISTINCT "catalog_scopes"."pickup_code") AS "code_count"
  FROM "catalog_scopes" AS "catalog_scopes"
  GROUP BY
    "catalog_scopes"."warehouse_name"
), "catalog_candidates" AS (
  SELECT
    "s"."pickup_code" AS "pickup_code",
    MIN("s"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  WHERE
    "s"."pickup_code" ~ '^[A-Z0-9]{1,16}$' AND "s"."warehouse_name" IS NOT NULL
  GROUP BY
    "s"."pickup_code"
  HAVING
    COUNT(DISTINCT "s"."warehouse_name") = 1
), "catalog_unique" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_candidates" AS "c"
  INNER JOIN "catalog_name_codes" AS "n"
    ON "n"."warehouse_name" = "c"."branch_pickup_point" AND "n"."code_count" = 1
), "branch_catalog" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_unique" AS "c"
  LEFT JOIN "catalog_plan_labels" AS "p"
    ON "p"."source_branch_key" = "c"."pickup_code"
    OR "p"."warehouse_name" = "c"."branch_pickup_point"
  GROUP BY
    "c"."pickup_code",
    "c"."branch_pickup_point"
), "catalog_plans" AS (
  SELECT
    "p"."source_branch_key" AS "source_branch_key",
    COALESCE("c"."branch_pickup_point", "p"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_plan_labels" AS "p"
  LEFT JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "p"."source_branch_key"
    OR "c"."branch_pickup_point" = "p"."warehouse_name"
), "catalog_warehouse_links" AS (
  SELECT
    "s"."warehouseid" AS "warehouseid",
    MIN("c"."pickup_code") AS "pickup_code",
    MIN("c"."branch_pickup_point") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "s"."pickup_code"
  GROUP BY
    "s"."warehouseid"
  HAVING
    COUNT(DISTINCT "c"."pickup_code") = 1
), "mapped_branch_inventory" AS (
  SELECT
    "i"."id" AS "id",
    "i"."source_record_id" AS "source_record_id",
    "i"."snapshot_date" AS "snapshot_date",
    "i"."warehouseid" AS "warehouseid",
    "i"."warehouse_name" AS "warehouse_name",
    "i"."self_pickup_point" AS "self_pickup_point",
    "i"."pickup_point" AS "pickup_point",
    "i"."base_name" AS "base_name",
    "i"."material_code" AS "material_code",
    "i"."material_name" AS "material_name",
    "i"."product_categ_name" AS "product_categ_name",
    "i"."prod_date" AS "prod_date",
    "i"."live_qty" AS "live_qty",
    "i"."available_qty" AS "available_qty",
    "i"."warehouse_classify" AS "warehouse_classify",
    "i"."created_time" AS "created_time",
    "i"."updated_time" AS "updated_time",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "agents_scm_branch_inventory_snapshot" AS "i"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = COALESCE(NULLIF(TRIM("i"."pickup_point"), ''), NULLIF(TRIM("i"."self_pickup_point"), ''))
  WHERE
    "i"."snapshot_date" <= CAST($1 AS DATE) AND "i"."warehouse_classify" = '20'
), "latest_order" AS (
  SELECT
    MAX("agents_scm_order_fulfillment"."snapshot_date") AS "value"
  FROM "agents_scm_order_fulfillment" AS "agents_scm_order_fulfillment"
  WHERE
    "agents_scm_order_fulfillment"."snapshot_date" <= CAST($1 AS DATE)
)
SELECT
  "f"."snapshot_date" AS "snapshot_date",
  TO_CHAR("f"."fromorderno_month", 'YYYY-MM') AS "month",
  CASE WHEN "f"."pick_point_type2" = '工厂' THEN 'factory' ELSE 'branch' END AS "pickup_type",
  CASE
    WHEN "f"."pick_point_type2" = '工厂'
    THEN "f"."belong_base"
    ELSE "c"."branch_pickup_point"
  END AS "object_name",
  COALESCE("f"."product_categ_name", '未分类') AS "category",
  "f"."new_material_code" AS "sku",
  CASE
    WHEN BOOL_AND("f"."order_qty_origin" IS NOT NULL)
    THEN SUM("f"."order_qty_origin")
  END AS "order_qty",
  CAST(JSON_AGG(DISTINCT "f"."fromorderno") FILTER(WHERE "f"."fromorderno" IS NOT NULL) AS TEXT) AS "order_ids",
  CAST(JSON_AGG(DISTINCT "f"."fromorderno") FILTER(WHERE COALESCE("f"."outqty", 0) > 0 AND "f"."fromorderno" IS NOT NULL) AS TEXT) AS "affected_order_ids",
  SUM("f"."need_qty_origin") AS "demand_qty",
  SUM("f"."outqty") AS "shortage_qty",
  SUM("f"."qtyshipped") AS "shipped_qty",
  COUNT(DISTINCT "f"."fromorderno") FILTER(WHERE
    COALESCE("f"."outqty", 0) > 0) AS "affected_orders"
FROM "agents_scm_order_fulfillment" AS "f"
LEFT JOIN "catalog_warehouse_links" AS "c"
  ON "c"."warehouseid" = "f"."warehouseid"
CROSS JOIN "latest_order" AS "latest_order"
WHERE
  "f"."snapshot_date" = "latest_order"."value"
  AND "f"."fromorderno_month" >= CAST($2 AS DATE)
  AND "f"."fromorderno_month" < CAST($2 AS DATE) + INTERVAL '1 MONTH'
  AND (
    (
      "f"."pick_point_type2" = '工厂'
      AND "f"."belong_base" IN ('华东', '华南', '西南', '遂平', '郑州')
    )
    OR (
      "f"."pick_point_type2" = '分仓' AND "c"."pickup_code" IS NOT NULL
    )
  )
  AND (
    "f"."order_qty_origin" > 0 OR "f"."need_qty_origin" > 0
  )
  AND "f"."product_categ_name" <> '饺鲜说'
  AND (
    (
      "f"."pick_point_type2" = '工厂'
      AND (
        :scope_3 OR "f"."belong_base" IN (:list_3)
      )
    )
    OR (
      "f"."pick_point_type2" = '分仓'
      AND (
        :scope_8 OR "c"."branch_pickup_point" IN (:list_8)
      )
    )
  )
  AND (
    CAST($4 AS TEXT) IS NULL OR "f"."belong_base" = $4
  )
  AND (
    CAST($5 AS TEXT) IS NULL OR "c"."branch_pickup_point" = $5
  )
  AND (
    CAST($6 AS TEXT) IS NULL OR "f"."product_categ_name" = $6
  )
  AND (
    CAST($7 AS TEXT) IS NULL OR "f"."new_material_code" = $7
  )
GROUP BY
  "f"."snapshot_date",
  TO_CHAR("f"."fromorderno_month", 'YYYY-MM'),
  CASE WHEN "f"."pick_point_type2" = '工厂' THEN 'factory' ELSE 'branch' END,
  CASE
    WHEN "f"."pick_point_type2" = '工厂'
    THEN "f"."belong_base"
    ELSE "c"."branch_pickup_point"
  END,
  "f"."product_categ_name",
  "f"."new_material_code"
ORDER BY
  "snapshot_date",
  "pickup_type",
  "f"."snapshot_date",
  MIN("f"."fromorderno_month"),
  CASE WHEN "f"."pick_point_type2" = '工厂' THEN 'factory' ELSE 'branch' END,
  CASE
    WHEN "f"."pick_point_type2" = '工厂'
    THEN "f"."belong_base"
    ELSE "c"."branch_pickup_point"
  END,
  "f"."product_categ_name",
  "f"."new_material_code"`;

const PENDING_SQL = `WITH "catalog_scopes" AS (
  SELECT DISTINCT
    COALESCE(
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."pickup_point"), ''),
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."self_pickup_point"), '')
    ) AS "pickup_code",
    "agents_scm_branch_inventory_snapshot"."warehouseid" AS "warehouseid",
    NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."warehouse_name"), '') AS "warehouse_name"
  FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
  WHERE
    "agents_scm_branch_inventory_snapshot"."snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_inventory_snapshot"."snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
      WHERE
        "agents_scm_branch_inventory_snapshot"."snapshot_date" <= CAST($1 AS DATE)
    )
    AND "agents_scm_branch_inventory_snapshot"."warehouse_classify" = '20'
), "catalog_plan_labels" AS (
  SELECT DISTINCT
    TRIM("agents_scm_branch_plan"."branch_pickup_point") AS "source_branch_key",
    CASE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
      WHEN '上海配送中心'
      THEN '上海分仓'
      WHEN '武汉配送中心'
      THEN '武汉分仓'
      ELSE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
    END AS "warehouse_name"
  FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
  WHERE
    "agents_scm_branch_plan"."plan_snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_plan"."plan_snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
      WHERE
        "agents_scm_branch_plan"."plan_snapshot_date" <= CAST($1 AS DATE)
    )
    AND NULLIF(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '') IS NOT NULL
), "catalog_name_codes" AS (
  SELECT
    "catalog_scopes"."warehouse_name" AS "warehouse_name",
    COUNT(DISTINCT "catalog_scopes"."pickup_code") AS "code_count"
  FROM "catalog_scopes" AS "catalog_scopes"
  GROUP BY
    "catalog_scopes"."warehouse_name"
), "catalog_candidates" AS (
  SELECT
    "s"."pickup_code" AS "pickup_code",
    MIN("s"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  WHERE
    "s"."pickup_code" ~ '^[A-Z0-9]{1,16}$' AND "s"."warehouse_name" IS NOT NULL
  GROUP BY
    "s"."pickup_code"
  HAVING
    COUNT(DISTINCT "s"."warehouse_name") = 1
), "catalog_unique" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_candidates" AS "c"
  INNER JOIN "catalog_name_codes" AS "n"
    ON "n"."warehouse_name" = "c"."branch_pickup_point" AND "n"."code_count" = 1
), "branch_catalog" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_unique" AS "c"
  LEFT JOIN "catalog_plan_labels" AS "p"
    ON "p"."source_branch_key" = "c"."pickup_code"
    OR "p"."warehouse_name" = "c"."branch_pickup_point"
  GROUP BY
    "c"."pickup_code",
    "c"."branch_pickup_point"
), "catalog_plans" AS (
  SELECT
    "p"."source_branch_key" AS "source_branch_key",
    COALESCE("c"."branch_pickup_point", "p"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_plan_labels" AS "p"
  LEFT JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "p"."source_branch_key"
    OR "c"."branch_pickup_point" = "p"."warehouse_name"
), "catalog_warehouse_links" AS (
  SELECT
    "s"."warehouseid" AS "warehouseid",
    MIN("c"."pickup_code") AS "pickup_code",
    MIN("c"."branch_pickup_point") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "s"."pickup_code"
  GROUP BY
    "s"."warehouseid"
  HAVING
    COUNT(DISTINCT "c"."pickup_code") = 1
), "mapped_branch_inventory" AS (
  SELECT
    "i"."snapshot_date" AS "snapshot_date",
    "i"."material_code" AS "material_code",
    "i"."product_categ_name" AS "product_categ_name",
    "i"."available_qty" AS "available_qty",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "agents_scm_branch_inventory_snapshot" AS "i"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = COALESCE(NULLIF(TRIM("i"."pickup_point"), ''), NULLIF(TRIM("i"."self_pickup_point"), ''))
  WHERE
    "i"."snapshot_date" <= CAST($1 AS DATE) AND "i"."warehouse_classify" = '20'
), "latest_pending" AS (
  SELECT
    MAX("agents_scm_branch_pending_order"."source_snapshot_time") AS "value"
  FROM "agents_scm_branch_pending_order" AS "agents_scm_branch_pending_order"
  WHERE
    "agents_scm_branch_pending_order"."source_snapshot_time" < CAST($1 AS DATE) + INTERVAL '1 DAY'
)
SELECT
  CAST("p"."source_snapshot_time" AS DATE) AS "snapshot_date",
  "c"."branch_pickup_point" AS "branch",
  "p"."material_code" AS "sku",
  CASE
    WHEN COUNT(*) FILTER(WHERE
      "p"."order_stage" IS NULL
      OR (
        "p"."order_stage" = 'PREPARING'
        AND (
          "p"."order_qty" IS NULL
          OR "p"."allocated_qty" IS NULL
          OR "p"."allocated_qty" < 0
          OR "p"."order_qty" < "p"."allocated_qty"
        )
      )) > 0
    OR MAX("i"."available_qty") IS NULL
    THEN NULL
    ELSE GREATEST(
      0,
      SUM(
        CASE
          WHEN "p"."order_stage" = 'PREPARING'
          THEN "p"."order_qty" - "p"."allocated_qty"
          ELSE 0
        END
      ) - MAX("i"."available_qty")
    )
  END AS "shortage_qty",
  SUM(
    CASE
      WHEN "p"."order_stage" = 'PREPARED_UNSHIPPED'
      THEN "p"."allocated_qty"
      ELSE "p"."order_qty"
    END
  ) AS "demand_qty",
  SUM("p"."allocated_qty") AS "allocated_qty",
  SUM(
    CASE
      WHEN "p"."order_stage" = 'PREPARED_UNSHIPPED'
      THEN "p"."allocated_qty"
      ELSE 0
    END
  ) AS "prepared_qty",
  COUNT(*) FILTER(WHERE
    "p"."order_stage" IS NULL) AS "legacy_count"
FROM "agents_scm_branch_pending_order" AS "p"
JOIN "branch_catalog" AS "c"
  ON "c"."pickup_code" = TRIM("p"."pickup_point")
LEFT JOIN (
  SELECT
    "mapped_branch_inventory"."branch_pickup_point" AS "branch_pickup_point",
    "mapped_branch_inventory"."material_code" AS "material_code",
    MAX("mapped_branch_inventory"."product_categ_name") AS "category",
    CASE
      WHEN BOOL_AND("mapped_branch_inventory"."available_qty" IS NOT NULL)
      THEN SUM("mapped_branch_inventory"."available_qty")
    END AS "available_qty"
  FROM "mapped_branch_inventory" AS "mapped_branch_inventory"
  WHERE
    "mapped_branch_inventory"."snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_inventory_snapshot"."snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
      WHERE
        "agents_scm_branch_inventory_snapshot"."snapshot_date" <= CAST($1 AS DATE)
    )
  GROUP BY
    "mapped_branch_inventory"."branch_pickup_point",
    "mapped_branch_inventory"."material_code"
) AS "i"
  ON "i"."branch_pickup_point" = "c"."branch_pickup_point"
  AND "i"."material_code" = "p"."material_code"
CROSS JOIN "latest_pending" AS "latest_pending"
WHERE
  "p"."source_snapshot_time" = "latest_pending"."value"
  AND (
    "p"."order_stage" IN ('PREPARING', 'PREPARED_UNSHIPPED')
    OR "p"."order_stage" IS NULL
  )
  AND (
    :scope_2 OR "c"."branch_pickup_point" IN (:list_2)
  )
  AND (
    CAST($3 AS TEXT) IS NULL OR "c"."branch_pickup_point" = $3
  )
  AND (
    CAST($4 AS TEXT) IS NULL OR "p"."material_code" = $4
  )
  AND (
    CAST($5 AS TEXT) IS NULL OR "i"."category" = $5
  )
GROUP BY
  CAST("p"."source_snapshot_time" AS DATE),
  "c"."branch_pickup_point",
  "p"."material_code"
ORDER BY
  CAST("p"."source_snapshot_time" AS DATE),
  "c"."branch_pickup_point",
  "p"."material_code"`;

const ORDER_7D_SQL = `WITH "catalog_scopes" AS (
  SELECT DISTINCT
    COALESCE(
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."pickup_point"), ''),
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."self_pickup_point"), '')
    ) AS "pickup_code",
    "agents_scm_branch_inventory_snapshot"."warehouseid" AS "warehouseid",
    NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."warehouse_name"), '') AS "warehouse_name"
  FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
  WHERE
    "agents_scm_branch_inventory_snapshot"."snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_inventory_snapshot"."snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
      WHERE
        "agents_scm_branch_inventory_snapshot"."snapshot_date" <= CAST($1 AS DATE)
    )
    AND "agents_scm_branch_inventory_snapshot"."warehouse_classify" = '20'
), "catalog_plan_labels" AS (
  SELECT DISTINCT
    TRIM("agents_scm_branch_plan"."branch_pickup_point") AS "source_branch_key",
    CASE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
      WHEN '上海配送中心'
      THEN '上海分仓'
      WHEN '武汉配送中心'
      THEN '武汉分仓'
      ELSE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
    END AS "warehouse_name"
  FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
  WHERE
    "agents_scm_branch_plan"."plan_snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_plan"."plan_snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
      WHERE
        "agents_scm_branch_plan"."plan_snapshot_date" <= CAST($1 AS DATE)
    )
    AND NULLIF(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '') IS NOT NULL
), "catalog_name_codes" AS (
  SELECT
    "catalog_scopes"."warehouse_name" AS "warehouse_name",
    COUNT(DISTINCT "catalog_scopes"."pickup_code") AS "code_count"
  FROM "catalog_scopes" AS "catalog_scopes"
  GROUP BY
    "catalog_scopes"."warehouse_name"
), "catalog_candidates" AS (
  SELECT
    "s"."pickup_code" AS "pickup_code",
    MIN("s"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  WHERE
    "s"."pickup_code" ~ '^[A-Z0-9]{1,16}$' AND "s"."warehouse_name" IS NOT NULL
  GROUP BY
    "s"."pickup_code"
  HAVING
    COUNT(DISTINCT "s"."warehouse_name") = 1
), "catalog_unique" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_candidates" AS "c"
  INNER JOIN "catalog_name_codes" AS "n"
    ON "n"."warehouse_name" = "c"."branch_pickup_point" AND "n"."code_count" = 1
), "branch_catalog" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_unique" AS "c"
  LEFT JOIN "catalog_plan_labels" AS "p"
    ON "p"."source_branch_key" = "c"."pickup_code"
    OR "p"."warehouse_name" = "c"."branch_pickup_point"
  GROUP BY
    "c"."pickup_code",
    "c"."branch_pickup_point"
), "catalog_plans" AS (
  SELECT
    "p"."source_branch_key" AS "source_branch_key",
    COALESCE("c"."branch_pickup_point", "p"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_plan_labels" AS "p"
  LEFT JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "p"."source_branch_key"
    OR "c"."branch_pickup_point" = "p"."warehouse_name"
), "catalog_warehouse_links" AS (
  SELECT
    "s"."warehouseid" AS "warehouseid",
    MIN("c"."pickup_code") AS "pickup_code",
    MIN("c"."branch_pickup_point") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "s"."pickup_code"
  GROUP BY
    "s"."warehouseid"
  HAVING
    COUNT(DISTINCT "c"."pickup_code") = 1
), "mapped_branch_inventory" AS (
  SELECT
    "i"."id" AS "id",
    "i"."source_record_id" AS "source_record_id",
    "i"."snapshot_date" AS "snapshot_date",
    "i"."warehouseid" AS "warehouseid",
    "i"."warehouse_name" AS "warehouse_name",
    "i"."self_pickup_point" AS "self_pickup_point",
    "i"."pickup_point" AS "pickup_point",
    "i"."base_name" AS "base_name",
    "i"."material_code" AS "material_code",
    "i"."material_name" AS "material_name",
    "i"."product_categ_name" AS "product_categ_name",
    "i"."prod_date" AS "prod_date",
    "i"."live_qty" AS "live_qty",
    "i"."available_qty" AS "available_qty",
    "i"."warehouse_classify" AS "warehouse_classify",
    "i"."created_time" AS "created_time",
    "i"."updated_time" AS "updated_time",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "agents_scm_branch_inventory_snapshot" AS "i"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = COALESCE(NULLIF(TRIM("i"."pickup_point"), ''), NULLIF(TRIM("i"."self_pickup_point"), ''))
  WHERE
    "i"."snapshot_date" <= CAST($1 AS DATE) AND "i"."warehouse_classify" = '20'
), "latest_order" AS (
  SELECT
    MAX("agents_scm_order_fulfillment"."snapshot_date") AS "value"
  FROM "agents_scm_order_fulfillment" AS "agents_scm_order_fulfillment"
  WHERE
    "agents_scm_order_fulfillment"."snapshot_date" <= CAST($1 AS DATE)
)
SELECT
  "f"."snapshot_date" AS "snapshot_date",
  TO_CHAR("f"."fromorderno_month", 'YYYY-MM') AS "month",
  CASE WHEN "f"."pick_point_type2" = '工厂' THEN 'factory' ELSE 'branch' END AS "pickup_type",
  CASE
    WHEN "f"."pick_point_type2" = '工厂'
    THEN "f"."belong_base"
    ELSE "c"."branch_pickup_point"
  END AS "object_name",
  COALESCE("f"."product_categ_name", '未分类') AS "category",
  "f"."new_material_code" AS "sku",
  CASE
    WHEN BOOL_AND("f"."order_qty_origin" IS NOT NULL)
    THEN SUM("f"."order_qty_origin")
  END AS "order_qty",
  CAST(JSON_AGG(DISTINCT "f"."fromorderno") FILTER(WHERE "f"."fromorderno" IS NOT NULL) AS TEXT) AS "order_ids",
  CAST(JSON_AGG(DISTINCT "f"."fromorderno") FILTER(WHERE COALESCE("f"."outqty", 0) > 0 AND "f"."fromorderno" IS NOT NULL) AS TEXT) AS "affected_order_ids",
  SUM("f"."need_qty_origin") AS "demand_qty",
  SUM("f"."outqty") AS "shortage_qty",
  SUM("f"."qtyshipped") AS "shipped_qty",
  COUNT(DISTINCT "f"."fromorderno") FILTER(WHERE
    COALESCE("f"."outqty", 0) > 0) AS "affected_orders"
FROM "agents_scm_order_fulfillment" AS "f"
LEFT JOIN "catalog_warehouse_links" AS "c"
  ON "c"."warehouseid" = "f"."warehouseid"
CROSS JOIN "latest_order" AS "latest_order"
WHERE
  "f"."snapshot_date" = "latest_order"."value"
  AND "f"."header_addtime" >= LEAST(
    CAST($1 AS DATE),
    CAST((
      CAST($2 AS DATE) + INTERVAL '1 month - 1 day'
    ) AS DATE)
  ) - INTERVAL '6 DAYS'
  AND "f"."header_addtime" < LEAST(
    CAST($1 AS DATE),
    CAST((
      CAST($2 AS DATE) + INTERVAL '1 month - 1 day'
    ) AS DATE)
  ) + INTERVAL '1 DAY'
  AND (
    (
      "f"."pick_point_type2" = '工厂'
      AND "f"."belong_base" IN ('华东', '华南', '西南', '遂平', '郑州')
    )
    OR (
      "f"."pick_point_type2" = '分仓' AND "c"."pickup_code" IS NOT NULL
    )
  )
  AND (
    "f"."order_qty_origin" > 0 OR "f"."need_qty_origin" > 0
  )
  AND "f"."product_categ_name" <> '饺鲜说'
  AND (
    (
      "f"."pick_point_type2" = '工厂'
      AND (
        :scope_3 OR "f"."belong_base" IN (:list_3)
      )
    )
    OR (
      "f"."pick_point_type2" = '分仓'
      AND (
        :scope_8 OR "c"."branch_pickup_point" IN (:list_8)
      )
    )
  )
  AND (
    CAST($4 AS TEXT) IS NULL OR "f"."belong_base" = $4
  )
  AND (
    CAST($5 AS TEXT) IS NULL OR "c"."branch_pickup_point" = $5
  )
  AND (
    CAST($6 AS TEXT) IS NULL OR "f"."product_categ_name" = $6
  )
  AND (
    CAST($7 AS TEXT) IS NULL OR "f"."new_material_code" = $7
  )
GROUP BY
  "f"."snapshot_date",
  TO_CHAR("f"."fromorderno_month", 'YYYY-MM'),
  CASE WHEN "f"."pick_point_type2" = '工厂' THEN 'factory' ELSE 'branch' END,
  CASE
    WHEN "f"."pick_point_type2" = '工厂'
    THEN "f"."belong_base"
    ELSE "c"."branch_pickup_point"
  END,
  "f"."product_categ_name",
  "f"."new_material_code"
ORDER BY
  "snapshot_date",
  "pickup_type",
  "f"."snapshot_date",
  MIN("f"."fromorderno_month"),
  CASE WHEN "f"."pick_point_type2" = '工厂' THEN 'factory' ELSE 'branch' END,
  CASE
    WHEN "f"."pick_point_type2" = '工厂'
    THEN "f"."belong_base"
    ELSE "c"."branch_pickup_point"
  END,
  "f"."product_categ_name",
  "f"."new_material_code"`;

const BRANCH_OUTBOUND_SQL = `WITH "catalog_scopes" AS (
  SELECT DISTINCT
    COALESCE(
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."pickup_point"), ''),
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."self_pickup_point"), '')
    ) AS "pickup_code",
    "agents_scm_branch_inventory_snapshot"."warehouseid" AS "warehouseid",
    NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."warehouse_name"), '') AS "warehouse_name"
  FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
  WHERE
    "agents_scm_branch_inventory_snapshot"."snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_inventory_snapshot"."snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
      WHERE
        "agents_scm_branch_inventory_snapshot"."snapshot_date" <= CAST($1 AS DATE)
    )
    AND "agents_scm_branch_inventory_snapshot"."warehouse_classify" = '20'
), "catalog_plan_labels" AS (
  SELECT DISTINCT
    TRIM("agents_scm_branch_plan"."branch_pickup_point") AS "source_branch_key",
    CASE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
      WHEN '上海配送中心'
      THEN '上海分仓'
      WHEN '武汉配送中心'
      THEN '武汉分仓'
      ELSE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
    END AS "warehouse_name"
  FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
  WHERE
    "agents_scm_branch_plan"."plan_snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_plan"."plan_snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
      WHERE
        "agents_scm_branch_plan"."plan_snapshot_date" <= CAST($1 AS DATE)
    )
    AND NULLIF(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '') IS NOT NULL
), "catalog_name_codes" AS (
  SELECT
    "catalog_scopes"."warehouse_name" AS "warehouse_name",
    COUNT(DISTINCT "catalog_scopes"."pickup_code") AS "code_count"
  FROM "catalog_scopes" AS "catalog_scopes"
  GROUP BY
    "catalog_scopes"."warehouse_name"
), "catalog_candidates" AS (
  SELECT
    "s"."pickup_code" AS "pickup_code",
    MIN("s"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  WHERE
    "s"."pickup_code" ~ '^[A-Z0-9]{1,16}$' AND "s"."warehouse_name" IS NOT NULL
  GROUP BY
    "s"."pickup_code"
  HAVING
    COUNT(DISTINCT "s"."warehouse_name") = 1
), "catalog_unique" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_candidates" AS "c"
  INNER JOIN "catalog_name_codes" AS "n"
    ON "n"."warehouse_name" = "c"."branch_pickup_point" AND "n"."code_count" = 1
), "branch_catalog" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_unique" AS "c"
  LEFT JOIN "catalog_plan_labels" AS "p"
    ON "p"."source_branch_key" = "c"."pickup_code"
    OR "p"."warehouse_name" = "c"."branch_pickup_point"
  GROUP BY
    "c"."pickup_code",
    "c"."branch_pickup_point"
), "catalog_plans" AS (
  SELECT
    "p"."source_branch_key" AS "source_branch_key",
    COALESCE("c"."branch_pickup_point", "p"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_plan_labels" AS "p"
  LEFT JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "p"."source_branch_key"
    OR "c"."branch_pickup_point" = "p"."warehouse_name"
), "catalog_warehouse_links" AS (
  SELECT
    "s"."warehouseid" AS "warehouseid",
    MIN("c"."pickup_code") AS "pickup_code",
    MIN("c"."branch_pickup_point") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "s"."pickup_code"
  GROUP BY
    "s"."warehouseid"
  HAVING
    COUNT(DISTINCT "c"."pickup_code") = 1
), "mapped_branch_inventory" AS (
  SELECT
    "i"."id" AS "id",
    "i"."source_record_id" AS "source_record_id",
    "i"."snapshot_date" AS "snapshot_date",
    "i"."warehouseid" AS "warehouseid",
    "i"."warehouse_name" AS "warehouse_name",
    "i"."self_pickup_point" AS "self_pickup_point",
    "i"."pickup_point" AS "pickup_point",
    "i"."base_name" AS "base_name",
    "i"."material_code" AS "material_code",
    "i"."material_name" AS "material_name",
    "i"."product_categ_name" AS "product_categ_name",
    "i"."prod_date" AS "prod_date",
    "i"."live_qty" AS "live_qty",
    "i"."available_qty" AS "available_qty",
    "i"."warehouse_classify" AS "warehouse_classify",
    "i"."created_time" AS "created_time",
    "i"."updated_time" AS "updated_time",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "agents_scm_branch_inventory_snapshot" AS "i"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = COALESCE(NULLIF(TRIM("i"."pickup_point"), ''), NULLIF(TRIM("i"."self_pickup_point"), ''))
  WHERE
    "i"."snapshot_date" <= CAST($1 AS DATE) AND "i"."warehouse_classify" = '20'
), "product_categories" AS (
  WITH governed_choice_5 AS (
    SELECT
      "agents_scm_branch_inventory_snapshot"."material_code" AS "material_code",
      "agents_scm_branch_inventory_snapshot"."product_categ_name" AS "product_categ_name",
      "agents_scm_branch_inventory_snapshot"."id" AS "choice_record_id",
      "material_code" AS "choice_key_0",
      "material_code" AS "choice_order_0",
      "agents_scm_branch_inventory_snapshot"."snapshot_date" AS "choice_order_1",
      "agents_scm_branch_inventory_snapshot"."updated_time" AS "choice_order_2",
      1 AS choice_present
    FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
    WHERE
      "agents_scm_branch_inventory_snapshot"."snapshot_date" <= CAST($1 AS DATE)
  ), governed_choice_5_group_1 AS (
    SELECT
      c."choice_key_0" AS "choice_key_0",
      CASE
        WHEN COUNT(c."choice_order_1") < COUNT(*)
        THEN NULL
        ELSE MAX(c."choice_order_1")
      END AS choice_value
    FROM governed_choice_5 AS c
    GROUP BY
      c."choice_key_0"
  ), governed_choice_5_selected_1 AS (
    SELECT
      c."material_code" AS "material_code",
      c."product_categ_name" AS "product_categ_name",
      c."choice_record_id" AS "choice_record_id",
      c."choice_key_0" AS "choice_key_0",
      c."choice_order_0" AS "choice_order_0",
      c."choice_order_1" AS "choice_order_1",
      c."choice_order_2" AS "choice_order_2",
      c."choice_present" AS "choice_present"
    FROM governed_choice_5 AS c
    INNER JOIN governed_choice_5_group_1 AS g
      ON (
        COALESCE(CAST(c."choice_key_0" AS TEXT), '') = COALESCE(CAST(g."choice_key_0" AS TEXT), '')
        AND (
          c."choice_key_0" IS NULL
        ) = (
          g."choice_key_0" IS NULL
        )
      )
      AND (
        c."choice_order_1" = g.choice_value
        OR (
          c."choice_order_1" IS NULL AND g.choice_value IS NULL
        )
      )
  ), governed_choice_5_group_2 AS (
    SELECT
      c."choice_key_0" AS "choice_key_0",
      CASE
        WHEN COUNT(c."choice_order_2") < COUNT(*)
        THEN NULL
        ELSE MAX(c."choice_order_2")
      END AS choice_value
    FROM governed_choice_5_selected_1 AS c
    GROUP BY
      c."choice_key_0"
  ), governed_choice_5_selected_2 AS (
    SELECT
      c."material_code" AS "material_code",
      c."product_categ_name" AS "product_categ_name",
      c."choice_record_id" AS "choice_record_id",
      c."choice_key_0" AS "choice_key_0",
      c."choice_order_0" AS "choice_order_0",
      c."choice_order_1" AS "choice_order_1",
      c."choice_order_2" AS "choice_order_2",
      c."choice_present" AS "choice_present"
    FROM governed_choice_5_selected_1 AS c
    INNER JOIN governed_choice_5_group_2 AS g
      ON (
        COALESCE(CAST(c."choice_key_0" AS TEXT), '') = COALESCE(CAST(g."choice_key_0" AS TEXT), '')
        AND (
          c."choice_key_0" IS NULL
        ) = (
          g."choice_key_0" IS NULL
        )
      )
      AND (
        c."choice_order_2" = g.choice_value
        OR (
          c."choice_order_2" IS NULL AND g.choice_value IS NULL
        )
      )
  ), governed_choice_5_tie AS (
    SELECT
      MAX(t.choice_record_id) AS selected_id
    FROM governed_choice_5_selected_2 AS t
    GROUP BY
      t."choice_key_0"
  )
  SELECT DISTINCT
    c."material_code" AS "material_code",
    c."product_categ_name" AS "product_categ_name"
  FROM governed_choice_5 AS c
  INNER JOIN governed_choice_5_tie AS t
    ON c.choice_record_id = t.selected_id
)
SELECT
  "c"."branch_pickup_point" AS "branch",
  "f"."material_code" AS "sku",
  "p"."product_categ_name" AS "category",
  CAST(MAX("f"."business_date") AS DATE) AS "snapshot_date",
  CASE
    WHEN BOOL_AND("f"."metric_value" IS NOT NULL AND "f"."metric_value" >= 0)
    THEN SUM("f"."metric_value")
  END AS "outbound_qty"
FROM "agents_scm_branch_operation_fact" AS "f"
JOIN "branch_catalog" AS "c"
  ON "c"."pickup_code" = "f"."pickup_point"
LEFT JOIN "product_categories" AS "p"
  ON "p"."material_code" = "f"."material_code"
WHERE
  "f"."metric_name" = 'out_qty_daily'
  AND "f"."business_date" BETWEEN CAST($1 AS DATE) - INTERVAL '30 DAYS' AND CAST($1 AS DATE) - INTERVAL '1 DAY'
  AND (
    :scope_2 OR "c"."branch_pickup_point" IN (:list_2)
  )
  AND (
    CAST($3 AS TEXT) IS NULL OR "c"."branch_pickup_point" = $3
  )
  AND (
    CAST($4 AS TEXT) IS NULL OR "p"."product_categ_name" = $4
  )
  AND (
    CAST($5 AS TEXT) IS NULL OR "f"."material_code" = $5
  )
GROUP BY
  "c"."branch_pickup_point",
  "f"."material_code",
  "p"."product_categ_name"
ORDER BY
  "c"."branch_pickup_point",
  "f"."material_code",
  "p"."product_categ_name"`;

const BRANCH_FULFILLMENT_SQL = `WITH "catalog_scopes" AS (
  SELECT DISTINCT
    COALESCE(
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."pickup_point"), ''),
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."self_pickup_point"), '')
    ) AS "pickup_code",
    "agents_scm_branch_inventory_snapshot"."warehouseid" AS "warehouseid",
    NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."warehouse_name"), '') AS "warehouse_name"
  FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
  WHERE
    "agents_scm_branch_inventory_snapshot"."snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_inventory_snapshot"."snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
      WHERE
        "agents_scm_branch_inventory_snapshot"."snapshot_date" <= CAST($1 AS DATE)
    )
    AND "agents_scm_branch_inventory_snapshot"."warehouse_classify" = '20'
), "catalog_plan_labels" AS (
  SELECT DISTINCT
    TRIM("agents_scm_branch_plan"."branch_pickup_point") AS "source_branch_key",
    CASE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
      WHEN '上海配送中心'
      THEN '上海分仓'
      WHEN '武汉配送中心'
      THEN '武汉分仓'
      ELSE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
    END AS "warehouse_name"
  FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
  WHERE
    "agents_scm_branch_plan"."plan_snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_plan"."plan_snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
      WHERE
        "agents_scm_branch_plan"."plan_snapshot_date" <= CAST($1 AS DATE)
    )
    AND NULLIF(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '') IS NOT NULL
), "catalog_name_codes" AS (
  SELECT
    "catalog_scopes"."warehouse_name" AS "warehouse_name",
    COUNT(DISTINCT "catalog_scopes"."pickup_code") AS "code_count"
  FROM "catalog_scopes" AS "catalog_scopes"
  GROUP BY
    "catalog_scopes"."warehouse_name"
), "catalog_candidates" AS (
  SELECT
    "s"."pickup_code" AS "pickup_code",
    MIN("s"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  WHERE
    "s"."pickup_code" ~ '^[A-Z0-9]{1,16}$' AND "s"."warehouse_name" IS NOT NULL
  GROUP BY
    "s"."pickup_code"
  HAVING
    COUNT(DISTINCT "s"."warehouse_name") = 1
), "catalog_unique" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_candidates" AS "c"
  INNER JOIN "catalog_name_codes" AS "n"
    ON "n"."warehouse_name" = "c"."branch_pickup_point" AND "n"."code_count" = 1
), "branch_catalog" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_unique" AS "c"
  LEFT JOIN "catalog_plan_labels" AS "p"
    ON "p"."source_branch_key" = "c"."pickup_code"
    OR "p"."warehouse_name" = "c"."branch_pickup_point"
  GROUP BY
    "c"."pickup_code",
    "c"."branch_pickup_point"
), "catalog_plans" AS (
  SELECT
    "p"."source_branch_key" AS "source_branch_key",
    COALESCE("c"."branch_pickup_point", "p"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_plan_labels" AS "p"
  LEFT JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "p"."source_branch_key"
    OR "c"."branch_pickup_point" = "p"."warehouse_name"
), "catalog_warehouse_links" AS (
  SELECT
    "s"."warehouseid" AS "warehouseid",
    MIN("c"."pickup_code") AS "pickup_code",
    MIN("c"."branch_pickup_point") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "s"."pickup_code"
  GROUP BY
    "s"."warehouseid"
  HAVING
    COUNT(DISTINCT "c"."pickup_code") = 1
), "mapped_branch_inventory" AS (
  SELECT
    "i"."id" AS "id",
    "i"."source_record_id" AS "source_record_id",
    "i"."snapshot_date" AS "snapshot_date",
    "i"."warehouseid" AS "warehouseid",
    "i"."warehouse_name" AS "warehouse_name",
    "i"."self_pickup_point" AS "self_pickup_point",
    "i"."pickup_point" AS "pickup_point",
    "i"."base_name" AS "base_name",
    "i"."material_code" AS "material_code",
    "i"."material_name" AS "material_name",
    "i"."product_categ_name" AS "product_categ_name",
    "i"."prod_date" AS "prod_date",
    "i"."live_qty" AS "live_qty",
    "i"."available_qty" AS "available_qty",
    "i"."warehouse_classify" AS "warehouse_classify",
    "i"."created_time" AS "created_time",
    "i"."updated_time" AS "updated_time",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "agents_scm_branch_inventory_snapshot" AS "i"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = COALESCE(NULLIF(TRIM("i"."pickup_point"), ''), NULLIF(TRIM("i"."self_pickup_point"), ''))
  WHERE
    "i"."snapshot_date" <= CAST($1 AS DATE) AND "i"."warehouse_classify" = '20'
)
SELECT
  "c"."branch_pickup_point" AS "branch",
  MAX("f"."snapshot_date") AS "snapshot_date",
  CASE
    WHEN BOOL_AND("f"."metric_value" IS NOT NULL) FILTER(WHERE
      "f"."metric_name" = 'order_qty')
    THEN SUM("f"."metric_value") FILTER(WHERE
      "f"."metric_name" = 'order_qty')
  END AS "order_qty",
  CASE
    WHEN BOOL_AND("f"."metric_value" IS NOT NULL) FILTER(WHERE
      "f"."metric_name" = 'shipped_qty')
    THEN SUM("f"."metric_value") FILTER(WHERE
      "f"."metric_name" = 'shipped_qty')
  END AS "shipped_qty"
FROM "agents_scm_branch_operation_fact" AS "f"
JOIN "branch_catalog" AS "c"
  ON "c"."pickup_code" = "f"."pickup_point"
WHERE
  "f"."metric_group" = 'branch_fulfillment'
  AND "f"."period_month" = CAST($2 AS DATE)
  AND (
    :scope_3 OR "c"."branch_pickup_point" IN (:list_3)
  )
  AND (
    CAST($4 AS TEXT) IS NULL OR "c"."branch_pickup_point" = $4
  )
  AND /* This source has no published SKU/category fulfillment contract. */ CAST($5 AS TEXT) IS NULL
  AND CAST($6 AS TEXT) IS NULL
GROUP BY
  "c"."branch_pickup_point"
ORDER BY
  "c"."branch_pickup_point"`;

const BASE_CURRENT_ORDER_SQL = `WITH "bases" AS (
  SELECT
    '01' AS "pickup_code",
    '郑州' AS "base_name"
  UNION ALL
  SELECT
    '02' AS "pickup_code",
    '华东' AS "base_name"
  UNION ALL
  SELECT
    '03' AS "pickup_code",
    '西南' AS "base_name"
  UNION ALL
  SELECT
    '37' AS "pickup_code",
    '遂平' AS "base_name"
  UNION ALL
  SELECT
    '04' AS "pickup_code",
    '华南' AS "base_name"
), "latest_pending" AS (
  SELECT
    MAX("agents_scm_branch_pending_order"."source_snapshot_time") AS "value"
  FROM "agents_scm_branch_pending_order" AS "agents_scm_branch_pending_order"
  WHERE
    "agents_scm_branch_pending_order"."source_snapshot_time" < CAST($1 AS DATE) + INTERVAL '1 DAY'
), "stock" AS (
  SELECT
    "agents_scm_inventory_age"."base_name" AS "base_name",
    TRIM("agents_scm_inventory_age"."material_code") AS "sku",
    MAX("agents_scm_inventory_age"."product_categ_name") AS "category",
    CASE
      WHEN BOOL_AND("agents_scm_inventory_age"."qtylive" IS NOT NULL)
      THEN SUM("agents_scm_inventory_age"."qtylive")
    END AS "available_qty"
  FROM "agents_scm_inventory_age" AS "agents_scm_inventory_age"
  WHERE
    "agents_scm_inventory_age"."snapshot_time" = (
      SELECT
        MAX("agents_scm_inventory_age"."snapshot_time") AS "_col_0"
      FROM "agents_scm_inventory_age" AS "agents_scm_inventory_age"
      WHERE
        "agents_scm_inventory_age"."snapshot_time" < CAST($1 AS DATE) + INTERVAL '1 DAY'
    )
  GROUP BY
    "agents_scm_inventory_age"."base_name",
    TRIM("agents_scm_inventory_age"."material_code")
), "orders" AS (
  SELECT
    "b"."base_name" AS "base_name",
    TRIM("p"."material_code") AS "sku",
    CASE WHEN BOOL_AND("p"."order_qty" IS NOT NULL) THEN SUM("p"."order_qty") END AS "order_qty",
    CASE
      WHEN BOOL_AND("p"."order_qty" IS NOT NULL AND "p"."allocated_qty" IS NOT NULL) FILTER(WHERE
        TRIM("p"."bizflowstatus") <> 'OCP已下发')
      THEN SUM("p"."order_qty" - "p"."allocated_qty") FILTER(WHERE
        TRIM("p"."bizflowstatus") <> 'OCP已下发')
      WHEN COUNT(*) FILTER(WHERE
        TRIM("p"."bizflowstatus") <> 'OCP已下发') = 0
      THEN 0
    END AS "preparing_remaining"
  FROM "agents_scm_branch_pending_order" AS "p"
  JOIN "bases" AS "b"
    ON "b"."pickup_code" = TRIM("p"."pickup_point")
  CROSS JOIN "latest_pending" AS "latest_pending"
  WHERE
    "p"."source_snapshot_time" = "latest_pending"."value"
    AND NULLIF(TRIM("p"."bizflowstatus"), '') IS NOT NULL
    AND (
      TRIM("p"."bizflowstatus") <> 'OCP已下发' OR "p"."order_stage" = 'PREPARED_UNSHIPPED'
    )
  GROUP BY
    "b"."base_name",
    TRIM("p"."material_code")
)
SELECT
  "b"."base_name" AS "base_name",
  CAST("latest_pending"."value" AS DATE) AS "snapshot_date",
  CASE
    WHEN "latest_pending"."value" IS NULL
    OR COUNT(*) FILTER(WHERE
      "o"."base_name" IS NOT NULL AND "o"."order_qty" IS NULL) > 0
    THEN NULL
    ELSE COALESCE(SUM("o"."order_qty"), 0)
  END AS "order_qty",
  CASE
    WHEN "latest_pending"."value" IS NULL
    OR COUNT("i_all"."base_name") = 0
    OR COUNT(*) FILTER(WHERE
      "o"."base_name" IS NOT NULL
      AND (
        "o"."preparing_remaining" IS NULL
        OR (
          "i"."sku" IS NOT NULL AND "i"."available_qty" IS NULL
        )
      )) > 0
    THEN NULL
    ELSE COALESCE(SUM(GREATEST(0, "o"."preparing_remaining" - COALESCE("i"."available_qty", 0))), 0)
  END AS "shortage_qty"
FROM "bases" AS "b"
CROSS JOIN "latest_pending" AS "latest_pending"
LEFT JOIN (
  SELECT
    "stock"."base_name" AS "base_name"
  FROM "stock" AS "stock"
  GROUP BY
    "stock"."base_name"
) AS "i_all"
  ON "i_all"."base_name" = "b"."base_name"
LEFT JOIN "orders" AS "o"
  ON "o"."base_name" = "b"."base_name"
LEFT JOIN "stock" AS "i"
  ON "i"."base_name" = "o"."base_name" AND "i"."sku" = "o"."sku"
WHERE
  (
    :scope_2 OR "b"."base_name" IN (:list_2)
  )
  AND (
    CAST($3 AS TEXT) IS NULL OR "b"."base_name" = $3
  )
  AND (
    CAST($4 AS TEXT) IS NULL OR "i"."category" = $4
  )
  AND (
    CAST($5 AS TEXT) IS NULL OR "o"."sku" = $5
  )
GROUP BY
  "b"."base_name",
  "latest_pending"."value"
ORDER BY
  "b"."base_name",
  "latest_pending"."value"`;

const COMPANY_TREND_SQL = `WITH "catalog_scopes" AS (
  SELECT DISTINCT
    COALESCE(
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."pickup_point"), ''),
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."self_pickup_point"), '')
    ) AS "pickup_code",
    "agents_scm_branch_inventory_snapshot"."warehouseid" AS "warehouseid",
    NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."warehouse_name"), '') AS "warehouse_name"
  FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
  WHERE
    "agents_scm_branch_inventory_snapshot"."snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_inventory_snapshot"."snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
      WHERE
        "agents_scm_branch_inventory_snapshot"."snapshot_date" <= CAST($1 AS DATE)
    )
    AND "agents_scm_branch_inventory_snapshot"."warehouse_classify" = '20'
), "catalog_plan_labels" AS (
  SELECT DISTINCT
    TRIM("agents_scm_branch_plan"."branch_pickup_point") AS "source_branch_key",
    CASE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
      WHEN '上海配送中心'
      THEN '上海分仓'
      WHEN '武汉配送中心'
      THEN '武汉分仓'
      ELSE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
    END AS "warehouse_name"
  FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
  WHERE
    "agents_scm_branch_plan"."plan_snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_plan"."plan_snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
      WHERE
        "agents_scm_branch_plan"."plan_snapshot_date" <= CAST($1 AS DATE)
    )
    AND NULLIF(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '') IS NOT NULL
), "catalog_name_codes" AS (
  SELECT
    "catalog_scopes"."warehouse_name" AS "warehouse_name",
    COUNT(DISTINCT "catalog_scopes"."pickup_code") AS "code_count"
  FROM "catalog_scopes" AS "catalog_scopes"
  GROUP BY
    "catalog_scopes"."warehouse_name"
), "catalog_candidates" AS (
  SELECT
    "s"."pickup_code" AS "pickup_code",
    MIN("s"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  WHERE
    "s"."pickup_code" ~ '^[A-Z0-9]{1,16}$' AND "s"."warehouse_name" IS NOT NULL
  GROUP BY
    "s"."pickup_code"
  HAVING
    COUNT(DISTINCT "s"."warehouse_name") = 1
), "catalog_unique" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_candidates" AS "c"
  INNER JOIN "catalog_name_codes" AS "n"
    ON "n"."warehouse_name" = "c"."branch_pickup_point" AND "n"."code_count" = 1
), "branch_catalog" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_unique" AS "c"
), "catalog_plans" AS (
  SELECT
    "p"."source_branch_key" AS "source_branch_key",
    COALESCE("c"."branch_pickup_point", "p"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_plan_labels" AS "p"
  LEFT JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "p"."source_branch_key"
    OR "c"."branch_pickup_point" = "p"."warehouse_name"
), "catalog_warehouse_links" AS (
  SELECT
    "s"."warehouseid" AS "warehouseid",
    MIN("c"."pickup_code") AS "pickup_code",
    MIN("c"."branch_pickup_point") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "s"."pickup_code"
  GROUP BY
    "s"."warehouseid"
  HAVING
    COUNT(DISTINCT "c"."pickup_code") = 1
), "mapped_branch_inventory" AS (
  SELECT
    "i"."snapshot_date" AS "snapshot_date",
    "i"."material_code" AS "material_code",
    "i"."product_categ_name" AS "product_categ_name",
    "i"."available_qty" AS "available_qty",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "agents_scm_branch_inventory_snapshot" AS "i"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = COALESCE(NULLIF(TRIM("i"."pickup_point"), ''), NULLIF(TRIM("i"."self_pickup_point"), ''))
  WHERE
    "i"."snapshot_date" <= CAST($1 AS DATE) AND "i"."warehouse_classify" = '20'
), "base_snapshots" AS (
  SELECT
    CAST("agents_scm_safety_stock"."inventory_snapshot_time" AS DATE) AS "snapshot_date",
    MAX("agents_scm_safety_stock"."inventory_snapshot_time") AS "snapshot_time"
  FROM "agents_scm_safety_stock" AS "agents_scm_safety_stock"
  WHERE
    "agents_scm_safety_stock"."inventory_snapshot_time" >= CAST($1 AS DATE) - INTERVAL '29 DAYS'
    AND "agents_scm_safety_stock"."inventory_snapshot_time" < CAST($1 AS DATE) + INTERVAL '1 DAY'
  GROUP BY
    CAST("agents_scm_safety_stock"."inventory_snapshot_time" AS DATE)
), "base_history" AS (
  SELECT
    "s"."id" AS "id",
    "s"."base_name" AS "base_name",
    "s"."target_month" AS "target_month",
    "s"."material_code" AS "material_code",
    "s"."product_categ_name" AS "product_categ_name",
    "s"."current_inventory" AS "current_inventory",
    "d"."snapshot_date" AS "snapshot_date",
    CASE
      WHEN "s"."inventory_version" LIKE '%纠偏%'
      THEN 1
      WHEN "s"."inventory_version" LIKE '%月初%'
      THEN 2
      WHEN "s"."inventory_version" LIKE '%滚动%'
      THEN 3
      ELSE 4
    END AS "priority"
  FROM "agents_scm_safety_stock" AS "s"
  JOIN "base_snapshots" AS "d"
    ON "s"."inventory_snapshot_time" = "d"."snapshot_time"
  WHERE
    "s"."base_name" IN ('华东', '华南', '西南', '遂平', '郑州')
), "base_months" AS (
  SELECT
    "base_history"."snapshot_date" AS "snapshot_date",
    CASE
      WHEN EXTRACT(DAY FROM "base_history"."snapshot_date") >= 21
      AND BOOL_OR(
        "base_history"."target_month" = CAST((
          DATE_TRUNC('MONTH', "base_history"."snapshot_date") + INTERVAL '1 MONTH'
        ) AS DATE)
      )
      THEN CAST((
        DATE_TRUNC('MONTH', "base_history"."snapshot_date") + INTERVAL '1 MONTH'
      ) AS DATE)
      ELSE CAST(DATE_TRUNC('MONTH', "base_history"."snapshot_date") AS DATE)
    END AS "target_month"
  FROM "base_history" AS "base_history"
  GROUP BY
    "base_history"."snapshot_date"
), "base_versions" AS (
  SELECT
    "h"."snapshot_date" AS "snapshot_date",
    MIN("h"."priority") AS "priority"
  FROM "base_history" AS "h"
  JOIN "base_months" AS "m"
    ON "h"."snapshot_date" = "m"."snapshot_date"
    AND "h"."target_month" = "m"."target_month"
  WHERE
    "h"."priority" < 4
  GROUP BY
    "h"."snapshot_date"
), "base_candidates" AS (
  SELECT
    "h"."id" AS "id",
    "h"."snapshot_date" AS "snapshot_date",
    "h"."base_name" AS "base_name",
    "h"."material_code" AS "material_code",
    "h"."current_inventory" AS "current_inventory",
    "h"."priority" AS "priority"
  FROM "base_history" AS "h"
  JOIN "base_months" AS "m"
    ON "h"."snapshot_date" = "m"."snapshot_date"
    AND "h"."target_month" = "m"."target_month"
  JOIN "base_versions" AS "v"
    ON "h"."snapshot_date" = "v"."snapshot_date"
  WHERE
    (
      "h"."priority" = "v"."priority"
      OR (
        "v"."priority" = 1 AND "h"."priority" = 2
      )
    )
    AND (
      :scope_2 OR "h"."base_name" IN (:list_2)
    )
    AND (
      CAST($4 AS TEXT) IS NULL OR "h"."base_name" = $4
    )
    AND (
      CAST($6 AS TEXT) IS NULL OR "h"."product_categ_name" = $6
    )
    AND (
      CAST($7 AS TEXT) IS NULL OR CAST("h"."material_code" AS TEXT) = $7
    )
), "base_chosen_ids" AS (
  SELECT
    "base_candidates"."snapshot_date" AS "snapshot_date",
    COALESCE(
      MAX("base_candidates"."id") FILTER(WHERE
        "base_candidates"."priority" = 1),
      MAX("base_candidates"."id") FILTER(WHERE
        "base_candidates"."priority" = 2),
      MAX("base_candidates"."id") FILTER(WHERE
        "base_candidates"."priority" = 3)
    ) AS "id"
  FROM "base_candidates" AS "base_candidates"
  GROUP BY
    "base_candidates"."snapshot_date",
    "base_candidates"."base_name",
    "base_candidates"."material_code"
), "base_ranked" AS (
  SELECT
    "c"."snapshot_date" AS "snapshot_date",
    "s"."current_inventory" AS "current_inventory",
    1 AS "rn"
  FROM "agents_scm_safety_stock" AS "s"
  INNER JOIN "base_chosen_ids" AS "c"
    ON "c"."id" = "s"."id"
), "branch" AS (
  SELECT
    "mapped_branch_inventory"."snapshot_date" AS "snapshot_date",
    CASE
      WHEN BOOL_AND("mapped_branch_inventory"."available_qty" IS NOT NULL)
      THEN SUM("mapped_branch_inventory"."available_qty")
    END AS "qty"
  FROM "mapped_branch_inventory" AS "mapped_branch_inventory"
  WHERE
    "mapped_branch_inventory"."snapshot_date" BETWEEN CAST($1 AS DATE) - INTERVAL '29 DAYS' AND CAST($1 AS DATE)
    AND (
      :scope_3 OR "mapped_branch_inventory"."branch_pickup_point" IN (:list_3)
    )
    AND (
      CAST($5 AS TEXT) IS NULL OR "mapped_branch_inventory"."branch_pickup_point" = $5
    )
    AND (
      CAST($6 AS TEXT) IS NULL OR "mapped_branch_inventory"."product_categ_name" = $6
    )
    AND (
      CAST($7 AS TEXT) IS NULL OR "mapped_branch_inventory"."material_code" = $7
    )
  GROUP BY
    "mapped_branch_inventory"."snapshot_date"
)
SELECT
  "combined"."snapshot_date" AS "snapshot_date",
  "combined"."layer" AS "layer",
  "combined"."qty" AS "qty"
FROM (
  SELECT
    "base_ranked"."snapshot_date" AS "snapshot_date",
    'base' AS "layer",
    SUM("base_ranked"."current_inventory") AS "qty"
  FROM "base_ranked" AS "base_ranked"
  WHERE
    "base_ranked"."rn" = 1
  GROUP BY
    "base_ranked"."snapshot_date"
  UNION ALL
  SELECT
    "branch"."snapshot_date" AS "snapshot_date",
    'branch' AS "branch",
    "branch"."qty" AS "qty"
  FROM "branch" AS "branch"
) AS combined
ORDER BY
  "snapshot_date",
  "layer",
  "qty"`;

const ORDER_TREND_SQL = `WITH "catalog_scopes" AS (
  SELECT DISTINCT
    COALESCE(
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."pickup_point"), ''),
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."self_pickup_point"), '')
    ) AS "pickup_code",
    "agents_scm_branch_inventory_snapshot"."warehouseid" AS "warehouseid",
    NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."warehouse_name"), '') AS "warehouse_name"
  FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
  WHERE
    "agents_scm_branch_inventory_snapshot"."snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_inventory_snapshot"."snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
      WHERE
        "agents_scm_branch_inventory_snapshot"."snapshot_date" <= CAST($1 AS DATE)
    )
    AND "agents_scm_branch_inventory_snapshot"."warehouse_classify" = '20'
), "catalog_plan_labels" AS (
  SELECT DISTINCT
    TRIM("agents_scm_branch_plan"."branch_pickup_point") AS "source_branch_key",
    CASE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
      WHEN '上海配送中心'
      THEN '上海分仓'
      WHEN '武汉配送中心'
      THEN '武汉分仓'
      ELSE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
    END AS "warehouse_name"
  FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
  WHERE
    "agents_scm_branch_plan"."plan_snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_plan"."plan_snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
      WHERE
        "agents_scm_branch_plan"."plan_snapshot_date" <= CAST($1 AS DATE)
    )
    AND NULLIF(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '') IS NOT NULL
), "catalog_name_codes" AS (
  SELECT
    "catalog_scopes"."warehouse_name" AS "warehouse_name",
    COUNT(DISTINCT "catalog_scopes"."pickup_code") AS "code_count"
  FROM "catalog_scopes" AS "catalog_scopes"
  GROUP BY
    "catalog_scopes"."warehouse_name"
), "catalog_candidates" AS (
  SELECT
    "s"."pickup_code" AS "pickup_code",
    MIN("s"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  WHERE
    "s"."pickup_code" ~ '^[A-Z0-9]{1,16}$' AND "s"."warehouse_name" IS NOT NULL
  GROUP BY
    "s"."pickup_code"
  HAVING
    COUNT(DISTINCT "s"."warehouse_name") = 1
), "catalog_unique" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_candidates" AS "c"
  INNER JOIN "catalog_name_codes" AS "n"
    ON "n"."warehouse_name" = "c"."branch_pickup_point" AND "n"."code_count" = 1
), "branch_catalog" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_unique" AS "c"
  LEFT JOIN "catalog_plan_labels" AS "p"
    ON "p"."source_branch_key" = "c"."pickup_code"
    OR "p"."warehouse_name" = "c"."branch_pickup_point"
  GROUP BY
    "c"."pickup_code",
    "c"."branch_pickup_point"
), "catalog_plans" AS (
  SELECT
    "p"."source_branch_key" AS "source_branch_key",
    COALESCE("c"."branch_pickup_point", "p"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_plan_labels" AS "p"
  LEFT JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "p"."source_branch_key"
    OR "c"."branch_pickup_point" = "p"."warehouse_name"
), "catalog_warehouse_links" AS (
  SELECT
    "s"."warehouseid" AS "warehouseid",
    MIN("c"."pickup_code") AS "pickup_code",
    MIN("c"."branch_pickup_point") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "s"."pickup_code"
  GROUP BY
    "s"."warehouseid"
  HAVING
    COUNT(DISTINCT "c"."pickup_code") = 1
), "mapped_branch_inventory" AS (
  SELECT
    "i"."id" AS "id",
    "i"."source_record_id" AS "source_record_id",
    "i"."snapshot_date" AS "snapshot_date",
    "i"."warehouseid" AS "warehouseid",
    "i"."warehouse_name" AS "warehouse_name",
    "i"."self_pickup_point" AS "self_pickup_point",
    "i"."pickup_point" AS "pickup_point",
    "i"."base_name" AS "base_name",
    "i"."material_code" AS "material_code",
    "i"."material_name" AS "material_name",
    "i"."product_categ_name" AS "product_categ_name",
    "i"."prod_date" AS "prod_date",
    "i"."live_qty" AS "live_qty",
    "i"."available_qty" AS "available_qty",
    "i"."warehouse_classify" AS "warehouse_classify",
    "i"."created_time" AS "created_time",
    "i"."updated_time" AS "updated_time",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "agents_scm_branch_inventory_snapshot" AS "i"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = COALESCE(NULLIF(TRIM("i"."pickup_point"), ''), NULLIF(TRIM("i"."self_pickup_point"), ''))
  WHERE
    "i"."snapshot_date" <= CAST($1 AS DATE) AND "i"."warehouse_classify" = '20'
)
SELECT
  "f"."snapshot_date" AS "snapshot_date",
  TO_CHAR("f"."fromorderno_month", 'YYYY-MM') AS "month",
  CASE WHEN "f"."pick_point_type2" = '工厂' THEN 'factory' ELSE 'branch' END AS "pickup_type",
  CASE
    WHEN BOOL_AND("f"."order_qty_origin" IS NOT NULL)
    THEN SUM("f"."order_qty_origin")
  END AS "order_qty",
  SUM("f"."need_qty_origin") AS "demand_qty",
  SUM("f"."outqty") AS "shortage_qty",
  SUM("f"."qtyshipped") AS "shipped_qty",
  COUNT(DISTINCT "f"."fromorderno") FILTER(WHERE
    COALESCE("f"."outqty", 0) > 0) AS "affected_orders"
FROM "agents_scm_order_fulfillment" AS "f"
LEFT JOIN "catalog_warehouse_links" AS "c"
  ON "c"."warehouseid" = "f"."warehouseid"
WHERE
  "f"."snapshot_date" BETWEEN CAST($1 AS DATE) - INTERVAL '29 DAYS' AND CAST($1 AS DATE)
  AND "f"."fromorderno_month" >= CAST($2 AS DATE)
  AND "f"."fromorderno_month" < CAST($2 AS DATE) + INTERVAL '1 MONTH'
  AND (
    (
      "f"."pick_point_type2" = '工厂'
      AND "f"."belong_base" IN ('华东', '华南', '西南', '遂平', '郑州')
    )
    OR (
      "f"."pick_point_type2" = '分仓' AND "c"."pickup_code" IS NOT NULL
    )
  )
  AND (
    "f"."order_qty_origin" > 0 OR "f"."need_qty_origin" > 0
  )
  AND "f"."product_categ_name" <> '饺鲜说'
  AND (
    (
      "f"."pick_point_type2" = '工厂'
      AND (
        :scope_3 OR "f"."belong_base" IN (:list_3)
      )
    )
    OR (
      "f"."pick_point_type2" = '分仓'
      AND (
        :scope_8 OR "c"."branch_pickup_point" IN (:list_8)
      )
    )
  )
  AND (
    CAST($4 AS TEXT) IS NULL OR "f"."belong_base" = $4
  )
  AND (
    CAST($5 AS TEXT) IS NULL OR "c"."branch_pickup_point" = $5
  )
  AND (
    CAST($6 AS TEXT) IS NULL OR "f"."product_categ_name" = $6
  )
  AND (
    CAST($7 AS TEXT) IS NULL OR "f"."new_material_code" = $7
  )
GROUP BY
  "f"."snapshot_date",
  "f"."fromorderno_month",
  CASE WHEN "f"."pick_point_type2" = '工厂' THEN 'factory' ELSE 'branch' END
ORDER BY
  "snapshot_date",
  "pickup_type",
  "f"."snapshot_date",
  "f"."fromorderno_month",
  CASE WHEN "f"."pick_point_type2" = '工厂' THEN 'factory' ELSE 'branch' END`;

const AGING_TREND_SQL = `WITH "catalog_scopes" AS (
  SELECT DISTINCT
    COALESCE(
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."pickup_point"), ''),
      NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."self_pickup_point"), '')
    ) AS "pickup_code",
    "agents_scm_branch_inventory_snapshot"."warehouseid" AS "warehouseid",
    NULLIF(TRIM("agents_scm_branch_inventory_snapshot"."warehouse_name"), '') AS "warehouse_name"
  FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
  WHERE
    "agents_scm_branch_inventory_snapshot"."snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_inventory_snapshot"."snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_inventory_snapshot" AS "agents_scm_branch_inventory_snapshot"
      WHERE
        "agents_scm_branch_inventory_snapshot"."snapshot_date" <= CAST($1 AS DATE)
    )
    AND "agents_scm_branch_inventory_snapshot"."warehouse_classify" = '20'
), "catalog_plan_labels" AS (
  SELECT DISTINCT
    TRIM("agents_scm_branch_plan"."branch_pickup_point") AS "source_branch_key",
    CASE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
      WHEN '上海配送中心'
      THEN '上海分仓'
      WHEN '武汉配送中心'
      THEN '武汉分仓'
      ELSE REGEXP_REPLACE(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '提货点$', '')
    END AS "warehouse_name"
  FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
  WHERE
    "agents_scm_branch_plan"."plan_snapshot_date" = (
      SELECT
        MAX("agents_scm_branch_plan"."plan_snapshot_date") AS "_col_0"
      FROM "agents_scm_branch_plan" AS "agents_scm_branch_plan"
      WHERE
        "agents_scm_branch_plan"."plan_snapshot_date" <= CAST($1 AS DATE)
    )
    AND NULLIF(TRIM("agents_scm_branch_plan"."branch_pickup_point"), '') IS NOT NULL
), "catalog_name_codes" AS (
  SELECT
    "catalog_scopes"."warehouse_name" AS "warehouse_name",
    COUNT(DISTINCT "catalog_scopes"."pickup_code") AS "code_count"
  FROM "catalog_scopes" AS "catalog_scopes"
  GROUP BY
    "catalog_scopes"."warehouse_name"
), "catalog_candidates" AS (
  SELECT
    "s"."pickup_code" AS "pickup_code",
    MIN("s"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  WHERE
    "s"."pickup_code" ~ '^[A-Z0-9]{1,16}$' AND "s"."warehouse_name" IS NOT NULL
  GROUP BY
    "s"."pickup_code"
  HAVING
    COUNT(DISTINCT "s"."warehouse_name") = 1
), "catalog_unique" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_candidates" AS "c"
  INNER JOIN "catalog_name_codes" AS "n"
    ON "n"."warehouse_name" = "c"."branch_pickup_point" AND "n"."code_count" = 1
), "branch_catalog" AS (
  SELECT
    "c"."pickup_code" AS "pickup_code",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "catalog_unique" AS "c"
  LEFT JOIN "catalog_plan_labels" AS "p"
    ON "p"."source_branch_key" = "c"."pickup_code"
    OR "p"."warehouse_name" = "c"."branch_pickup_point"
  GROUP BY
    "c"."pickup_code",
    "c"."branch_pickup_point"
), "catalog_plans" AS (
  SELECT
    "p"."source_branch_key" AS "source_branch_key",
    COALESCE("c"."branch_pickup_point", "p"."warehouse_name") AS "branch_pickup_point"
  FROM "catalog_plan_labels" AS "p"
  LEFT JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "p"."source_branch_key"
    OR "c"."branch_pickup_point" = "p"."warehouse_name"
), "catalog_warehouse_links" AS (
  SELECT
    "s"."warehouseid" AS "warehouseid",
    MIN("c"."pickup_code") AS "pickup_code",
    MIN("c"."branch_pickup_point") AS "branch_pickup_point"
  FROM "catalog_scopes" AS "s"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = "s"."pickup_code"
  GROUP BY
    "s"."warehouseid"
  HAVING
    COUNT(DISTINCT "c"."pickup_code") = 1
), "mapped_branch_inventory" AS (
  SELECT
    "i"."snapshot_date" AS "snapshot_date",
    "i"."material_code" AS "material_code",
    "i"."product_categ_name" AS "product_categ_name",
    "i"."prod_date" AS "prod_date",
    "i"."live_qty" AS "live_qty",
    "c"."branch_pickup_point" AS "branch_pickup_point"
  FROM "agents_scm_branch_inventory_snapshot" AS "i"
  JOIN "branch_catalog" AS "c"
    ON "c"."pickup_code" = COALESCE(NULLIF(TRIM("i"."pickup_point"), ''), NULLIF(TRIM("i"."self_pickup_point"), ''))
  WHERE
    "i"."snapshot_date" <= CAST($1 AS DATE) AND "i"."warehouse_classify" = '20'
), "aged" AS (
  SELECT
    "agents_scm_inventory_age"."snapshot_date" AS "snapshot_date",
    CAST('base' AS TEXT) AS "layer",
    "agents_scm_inventory_age"."qty" AS "qty",
    CAST("agents_scm_inventory_age"."productage" AS DECIMAL) AS "age_days"
  FROM "agents_scm_inventory_age" AS "agents_scm_inventory_age"
  WHERE
    "agents_scm_inventory_age"."snapshot_date" BETWEEN CAST($1 AS DATE) - INTERVAL '29 DAYS' AND CAST($1 AS DATE)
    AND "agents_scm_inventory_age"."snapshot_time" IN (
      SELECT
        MAX("a"."snapshot_time") AS "_col_0"
      FROM "agents_scm_inventory_age" AS "a"
      WHERE
        "a"."snapshot_date" BETWEEN CAST($1 AS DATE) - INTERVAL '29 DAYS' AND CAST($1 AS DATE)
      GROUP BY
        "a"."snapshot_date"
    )
    AND "agents_scm_inventory_age"."base_name" IN ('华东', '华南', '西南', '遂平', '郑州')
    AND (
      :scope_2 OR "agents_scm_inventory_age"."base_name" IN (:list_2)
    )
    AND (
      CAST($4 AS TEXT) IS NULL OR "agents_scm_inventory_age"."base_name" = $4
    )
    AND (
      CAST($6 AS TEXT) IS NULL OR "agents_scm_inventory_age"."product_categ_name" = $6
    )
    AND (
      CAST($7 AS TEXT) IS NULL OR "agents_scm_inventory_age"."material_code" = $7
    )
  UNION ALL
  SELECT
    "mapped_branch_inventory"."snapshot_date" AS "snapshot_date",
    CAST('branch' AS TEXT) AS "layer",
    "mapped_branch_inventory"."live_qty" AS "qty",
    CASE
      WHEN "mapped_branch_inventory"."prod_date" IS NULL
      THEN NULL
      ELSE CAST(GREATEST(
        0,
        "mapped_branch_inventory"."snapshot_date" - "mapped_branch_inventory"."prod_date"
      ) AS DECIMAL)
    END AS "age_days"
  FROM "mapped_branch_inventory" AS "mapped_branch_inventory"
  WHERE
    "mapped_branch_inventory"."snapshot_date" BETWEEN CAST($1 AS DATE) - INTERVAL '29 DAYS' AND CAST($1 AS DATE)
    AND (
      :scope_3 OR "mapped_branch_inventory"."branch_pickup_point" IN (:list_3)
    )
    AND (
      CAST($5 AS TEXT) IS NULL OR "mapped_branch_inventory"."branch_pickup_point" = $5
    )
    AND (
      CAST($6 AS TEXT) IS NULL OR "mapped_branch_inventory"."product_categ_name" = $6
    )
    AND (
      CAST($7 AS TEXT) IS NULL OR "mapped_branch_inventory"."material_code" = $7
    )
)
SELECT
  "aged"."snapshot_date" AS "snapshot_date",
  "aged"."layer" AS "layer",
  CASE
    WHEN BOOL_OR("aged"."qty" > 0 AND "aged"."age_days" IS NULL)
    OR COALESCE(
      SUM("aged"."qty") FILTER(WHERE
        (
          "aged"."layer" = 'base' OR "aged"."qty" >= 0
        )),
      0
    ) <= 0
    THEN NULL
    ELSE ROUND(
      SUM("aged"."qty" * COALESCE("aged"."age_days", 0)) FILTER(WHERE
        (
          "aged"."layer" = 'base' OR "aged"."qty" >= 0
        )) / NULLIF(
        SUM("aged"."qty") FILTER(WHERE
          (
            "aged"."layer" = 'base' OR "aged"."qty" >= 0
          )),
        0
      ),
      1
    )
  END AS "average_age"
FROM "aged" AS "aged"
GROUP BY
  "aged"."snapshot_date",
  "aged"."layer"
ORDER BY
  "snapshot_date",
  "layer",
  "aged"."snapshot_date",
  "aged"."layer"`;

export const companySqlTemplates = {BASE_SQL, BRANCH_SQL, BASE_AGE_SQL, BRANCH_AGE_SQL, ORDER_SQL, PENDING_SQL, ORDER_7D_SQL, BRANCH_OUTBOUND_SQL, BRANCH_FULFILLMENT_SQL, BASE_CURRENT_ORDER_SQL, COMPANY_TREND_SQL, ORDER_TREND_SQL, AGING_TREND_SQL} as const;
