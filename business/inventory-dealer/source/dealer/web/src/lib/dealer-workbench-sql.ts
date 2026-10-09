import "server-only";

import {
  executeAllGeaSqlPages,
  executeGeaSql,
  executeGeaSqlPage,
  type GeaSqlParameters,
  type GeaSqlRequestOptions,
  type GeaSqlRow,
} from "@/lib/gea-sql-client";

// GEA 的 SQL 重写器只接受已发布资源名。生产数据源需将 currentSchema
// 配为 data_service，因此目录内不携带 PostgreSQL schema 前缀。
function configuredResourceName(name: string, fallback: string) {
  const value = process.env[name]?.trim() || fallback;
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) {
    throw new Error(`${name} 只能配置 GEA 已发布的无 schema 资源名`);
  }
  return value;
}

function saleableMaterialTable() {
  return configuredResourceName(
    "DEALER_WORKBENCH_SQL_SALEABLE_MATERIAL_TABLE",
    "agents_scm_customer_saleable_material",
  );
}

function promotionScopeView() {
  return configuredResourceName(
    "DEALER_WORKBENCH_SQL_PROMOTION_SCOPE_VIEW",
    "agents_scm_promotion_policy_scope_view",
  );
}

/** 展示仅约束客户、政策状态和周期，提货点在使用优惠时独立核验。 */
function promotionScopeConditions(
  dateParameter: "businessDate" | "catalogToday",
) {
  return `s.scope_status = 1 AND s.scope_delete_status = 1 AND s.policy_status = 1 AND s.policy_delete_status = 1
       AND (s.promotion_start_date IS NULL OR s.promotion_start_date <= CAST(:${dateParameter} AS DATE))
       AND (s.promotion_end_date IS NULL OR s.promotion_end_date >= CAST(:${dateParameter} AS DATE))`;
}

// 默认沿用已发布的受控资源；若 GEA 管理端使用其它资源名，只改部署配置，
// 不需要重新修改或构建工作台代码。
const MAIN_TABLE = configuredResourceName(
  "DEALER_WORKBENCH_SQL_MAIN_TABLE",
  "agents_scm_cust_plan_order_analysis_governed",
);
const WL_AGE_TABLE = configuredResourceName(
  "DEALER_WORKBENCH_SQL_WL_AGE_TABLE",
  "agents_scm_wl_cust_stock_age_governed",
);
const SIMULATED_AGE_TABLE = configuredResourceName(
  "DEALER_WORKBENCH_SQL_SIMULATED_AGE_TABLE",
  "agents_scm_cust_stock_age_governed",
);
const INVENTORY_DAILY_TABLE = configuredResourceName(
  "DEALER_WORKBENCH_SQL_INVENTORY_DAILY_TABLE",
  "agents_scm_cust_inventory_daily",
);

type WorkbenchRow = Record<string, string | number | null | undefined>;
type SqlQuery = { sql: string; parameters: GeaSqlParameters };
export type CompanyProductFilters = {
  search?: string;
  category?: string;
  productTag?: string;
  policyCode?: string;
  policySearch?: string;
  materialCodes?: string[];
  download?: boolean;
};
export type InventoryDailyKey = { customerCode: string; materialCode: string };

export type WorkbenchResultSqlScope = {
  snapshotDate: string;
  planMonth?: string;
  customerCodes: string[];
  materialCode: string;
  mode: "detail" | "aggregate";
  groupBy: string;
  orderColumn: string;
};

const mainColumnToCubeMember: Record<string, string> = {
  record_count: "dealer_plan_order.record_count",
  snapshot_date: "dealer_plan_order.snapshot_date",
  plan_month: "dealer_plan_order.plan_month",
  cust_code: "dealer_plan_order.cust_code",
  cust_name: "dealer_plan_order.cust_name",
  material_code: "dealer_plan_order.material_code",
  material_name: "dealer_plan_order.material_name",
  product_categ_name: "dealer_plan_order.product_categ_name",
  inventory_source: "dealer_plan_order.inventory_source",
  stock_age_turnover_status: "dealer_plan_order.stock_age_turnover_status",
  source_load_time: "dealer_plan_order.source_load_time",
  updated_time: "dealer_plan_order.updated_time",
  budget_amount: "dealer_plan_order.budget_amount",
  shipped_qty: "dealer_plan_order.shipped_qty",
  ship_amount: "dealer_plan_order.ship_amount",
  unship_qty: "dealer_plan_order.unship_qty",
  unship_amount: "dealer_plan_order.unship_amount",
  total_qty: "dealer_plan_order.total_qty",
  total_amount: "dealer_plan_order.total_amount",
  planned_qty: "dealer_plan_order.planned_qty",
  daily_sales: "dealer_plan_order.daily_sales",
  in_transit_qty: "dealer_plan_order.in_transit_qty",
  stock_qty: "dealer_plan_order.stock_qty",
  target_inventory: "dealer_plan_order.target_inventory",
  pre_order_qty: "dealer_plan_order.pre_order_qty",
  average_turnover_days: "dealer_plan_order.average_turnover_days",
  label_turnover_days: "dealer_plan_order.label_turnover_days",
  average_stock_age: "dealer_plan_order.average_stock_age",
  average_budget_rate: "dealer_plan_order.average_budget_rate",
  average_planned_qty_rate: "dealer_plan_order.average_planned_qty_rate",
};

const inventoryDailyColumnToCubeMember: Record<string, string> = {
  stat_date: "dealer_inventory_daily.stat_date",
  inventory_snapshot_date: "dealer_inventory_daily.inventory_snapshot_date",
  cust_code: "dealer_inventory_daily.cust_code",
  cust_name: "dealer_inventory_daily.cust_name",
  material_code: "dealer_inventory_daily.material_code",
  material_name: "dealer_inventory_daily.material_name",
  product_range_name: "dealer_inventory_daily.product_range_name",
  product_tag: "dealer_inventory_daily.product_tag",
  material_size: "dealer_inventory_daily.material_size",
  measure_unit: "dealer_inventory_daily.measure_unit",
  cif_price: "dealer_inventory_daily.cif_price",
  stock_qty: "dealer_inventory_daily.stock_qty",
  in_transit_qty: "dealer_inventory_daily.in_transit_qty",
  normal_stock_qty: "dealer_inventory_daily.normal_stock_qty",
  stock_amount: "dealer_inventory_daily.stock_amount",
  sales_qty_7days_avg: "dealer_inventory_daily.sales_qty_7days_avg",
  sales_qty_7days: "dealer_inventory_daily.sales_qty_7days",
  sales_qty_30days_avg: "dealer_inventory_daily.sales_qty_30days_avg",
  sales_qty_30days: "dealer_inventory_daily.sales_qty_30days",
  sales_amount_30days: "dealer_inventory_daily.sales_amount_30days",
  sales_amount_30days_avg: "dealer_inventory_daily.sales_amount_30days_avg",
  source_load_time: "dealer_inventory_daily.source_load_time",
  inventory_source: "dealer_inventory_daily.inventory_source",
  updated_time: "dealer_inventory_daily.updated_time",
};

const MAIN_SELECT = `
  1 AS record_count,
  snapshot_date,
  plan_month,
  cust_code,
  cust_name,
  material_code,
  material_name,
  product_categ_name,
  inventory_source,
  stock_age_turnover_status,
  source_load_time,
  updated_time,
  simulation_need_amount AS budget_amount,
  ship_qty AS shipped_qty,
  ship_amount,
  unship_qty,
  unship_amount,
  total_qty,
  total_amount,
  planned_qty,
  daily_sales,
  in_transit_qty,
  stock_qty,
  target_inventory,
  pre_order_qty,
  turnover_days AS average_turnover_days,
  label_turnover_days,
  avg_stock_age AS average_stock_age,
  budget_rate AS average_budget_rate,
  planned_qty_rate AS average_planned_qty_rate`;

function assertIdentifier(value: string, label: string) {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(normalized))
    throw new Error(`${label}格式无效`);
  return normalized;
}

function assertDate(value: string, label: string, pattern: RegExp) {
  const normalized = value.trim();
  if (!pattern.test(normalized)) throw new Error(`${label}格式无效`);
  return normalized;
}

function customerPredicate(
  customerCodes: string[],
  parameters: GeaSqlParameters,
  column = "cust_code",
) {
  if (!customerCodes.length) return "";
  const placeholders = customerCodes.map((code, index) => {
    const name = `customerCode${index}`;
    parameters[name] = assertIdentifier(code, "客户编码");
    return `:${name}`;
  });
  return ` AND ${column} IN (${placeholders.join(", ")})`;
}

function inventoryDailyKeyPredicate(
  keys: InventoryDailyKey[],
  parameters: GeaSqlParameters,
) {
  if (!keys.length) return " AND 1 = 0";
  if (keys.length > 200)
    throw new Error("库存日快照单次最多查询200个客户-SKU键");
  return ` AND (${keys
    .map((key, index) => {
      const customerName = `dailyCustomerCode${index}`;
      const materialName = `dailyMaterialCode${index}`;
      parameters[customerName] = assertIdentifier(key.customerCode, "客户编码");
      parameters[materialName] = assertIdentifier(key.materialCode, "SKU编码");
      return `(cust_code = :${customerName} AND material_code = :${materialName})`;
    })
    .join(" OR ")})`;
}

function scopedWhere(
  snapshotDate: string,
  planMonth: string | undefined,
  customerCodes: string[],
  materialCode = "",
) {
  const parameters: GeaSqlParameters = {
    snapshotDate: assertDate(snapshotDate, "快照日期", /^20\d{2}-\d{2}-\d{2}$/),
  };
  // GEA/JDBC binds JSON dates as VARCHAR; cast parameters, keeping date columns indexable.
  let where = "snapshot_date = CAST(:snapshotDate AS DATE)";
  if (planMonth) {
    parameters.planMonth = `${assertDate(planMonth, "计划月份", /^20\d{2}-\d{2}$/)}-01`;
    where += " AND plan_month = CAST(:planMonth AS DATE)";
  }
  where += customerPredicate(customerCodes, parameters);
  if (materialCode) {
    parameters.materialCode = assertIdentifier(materialCode, "SKU编码");
    where += " AND material_code = :materialCode";
  }
  return { where, parameters };
}

function toCubeRows(rows: GeaSqlRow[]): WorkbenchRow[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        mainColumnToCubeMember[key] ?? key,
        value,
      ]),
    ),
  );
}

function toInventoryDailyCubeRows(rows: GeaSqlRow[]): WorkbenchRow[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        inventoryDailyColumnToCubeMember[key] ?? key,
        value,
      ]),
    ),
  );
}

export const dealerWorkbenchSql = {
  latestSnapshot(customerCodes: string[] = []): SqlQuery {
    const parameters: GeaSqlParameters = {};
    return {
      sql: `SELECT (SELECT snapshot_date FROM ${MAIN_TABLE}
WHERE snapshot_date IS NOT NULL${customerPredicate(customerCodes, parameters)}
ORDER BY snapshot_date DESC LIMIT 1) AS snapshot_date`,
      parameters,
    };
  },

  latestInventoryDailySnapshot(customerCodes: string[] = []): SqlQuery {
    const parameters: GeaSqlParameters = {};
    return {
      sql: `SELECT MAX(stat_date) AS stat_date
FROM ${INVENTORY_DAILY_TABLE}
WHERE 1 = 1${customerPredicate(customerCodes, parameters)}`,
      parameters,
    };
  },

  inventoryDailyDetails(
    statDate: string,
    keys: InventoryDailyKey[],
    exportCustomerCodes?: string[],
  ): SqlQuery {
    const parameters: GeaSqlParameters = {
      statDate: assertDate(statDate, "库存统计日期", /^20\d{2}-\d{2}-\d{2}$/),
    };
    const keyFilter =
      exportCustomerCodes === undefined
        ? inventoryDailyKeyPredicate(keys, parameters)
        : customerPredicate(exportCustomerCodes, parameters);
    return {
      sql: `SELECT
  stat_date,
  inventory_snapshot_date,
  cust_code,
  cust_name,
  material_code,
  material_name,
  product_range_name,
  product_tag,
  material_size,
  measure_unit,
  cif_price,
  stock_qty,
  in_transit_qty,
  normal_stock_qty,
  stock_amt AS stock_amount,
  sales_qty_7days_avg,
  sales_qty_7days,
  sales_qty_30days_avg,
  sales_qty_30days,
  sales_amt_30days AS sales_amount_30days,
  sales_amt_30days_avg AS sales_amount_30days_avg,
  source_load_time,
  inventory_source,
  updated_time
FROM ${INVENTORY_DAILY_TABLE}
WHERE stat_date = CAST(:statDate AS DATE)${keyFilter}
ORDER BY cust_code ASC, material_code ASC`,
      parameters,
    };
  },

  inventoryDailySummary(statDate: string, customerCodes: string[]): SqlQuery {
    const parameters: GeaSqlParameters = {
      statDate: assertDate(statDate, "库存统计日期", /^20\d{2}-\d{2}-\d{2}$/),
    };
    return {
      sql: `SELECT
  COUNT(*) AS row_count,
  CASE WHEN COUNT(*) = COUNT(CASE WHEN stock_qty >= 0 AND sales_qty_30days >= 0 THEN 1 END)
    THEN COUNT(DISTINCT CASE WHEN stock_qty > 0 AND sales_qty_30days = 0 THEN (TRIM(cust_code), TRIM(material_code)) END)
    ELSE NULL END AS no_sales_sku_count,
  MIN(inventory_snapshot_date) AS earliest_inventory_date,
  MAX(inventory_snapshot_date) AS latest_inventory_date,
  COUNT(*) - COUNT(inventory_snapshot_date) AS missing_inventory_date_count,
  COUNT(DISTINCT cust_code) AS customer_count,
  COUNT(stock_qty) AS stock_qty_present,
  COUNT(in_transit_qty) AS in_transit_qty_present,
  COUNT(normal_stock_qty) AS normal_stock_qty_present,
  COUNT(stock_amt) AS stock_amount_present,
  COUNT(sales_qty_7days) AS sales_qty_7days_present,
  COUNT(sales_qty_7days_avg) AS sales_qty_7days_avg_present,
  COUNT(sales_qty_30days) AS sales_qty_30days_present,
  COUNT(sales_qty_30days_avg) AS sales_qty_30days_avg_present,
  COUNT(sales_amt_30days) AS sales_amount_30days_present,
  SUM(stock_qty) AS stock_qty,
  SUM(in_transit_qty) AS in_transit_qty,
  SUM(normal_stock_qty) AS normal_stock_qty,
  SUM(stock_amt) AS stock_amount,
  SUM(sales_qty_7days) AS sales_qty_7days,
  SUM(sales_qty_7days_avg) AS sales_qty_7days_avg,
  SUM(sales_qty_30days) AS sales_qty_30days,
  SUM(sales_qty_30days_avg) AS sales_qty_30days_avg,
  SUM(sales_amt_30days) AS sales_amount_30days,
  SUM(sales_amt_30days_avg) AS sales_amount_30days_avg
FROM ${INVENTORY_DAILY_TABLE}
WHERE stat_date = CAST(:statDate AS DATE)${customerPredicate(customerCodes, parameters)}`,
      parameters,
    };
  },

  inventoryDailyCustomerSummaries(
    statDate: string,
    customerCodes: string[],
  ): SqlQuery {
    const parameters: GeaSqlParameters = {
      statDate: assertDate(statDate, "库存统计日期", /^20\d{2}-\d{2}-\d{2}$/),
    };
    return {
      sql: `SELECT
  cust_code,
  COALESCE(NULLIF(MAX(cust_name), ''), cust_code) AS cust_name,
  COUNT(*) AS row_count,
  COUNT(stock_qty) AS stock_qty_present,
  COUNT(in_transit_qty) AS in_transit_qty_present,
  COUNT(normal_stock_qty) AS normal_stock_qty_present,
  COUNT(stock_amt) AS stock_amount_present,
  SUM(stock_qty) AS stock_qty,
  SUM(in_transit_qty) AS in_transit_qty,
  SUM(normal_stock_qty) AS normal_stock_qty,
  SUM(stock_amt) AS stock_amount
FROM ${INVENTORY_DAILY_TABLE}
WHERE stat_date = CAST(:statDate AS DATE)${customerPredicate(customerCodes, parameters)}
GROUP BY cust_code
ORDER BY cust_code ASC`,
      parameters,
    };
  },

  snapshotMonths(customerCodes: string[]): SqlQuery {
    const parameters: GeaSqlParameters = {};
    // Only months belonging to the latest authorized snapshot are used by the page.
    const scope = customerPredicate(customerCodes, parameters);
    return {
      sql: `WITH latest AS (
  SELECT snapshot_date FROM ${MAIN_TABLE}
  WHERE snapshot_date IS NOT NULL${scope}
  ORDER BY snapshot_date DESC LIMIT 1
)
SELECT snapshot_date, plan_month FROM ${MAIN_TABLE}
WHERE snapshot_date = (SELECT snapshot_date FROM latest)${scope}
GROUP BY snapshot_date, plan_month
ORDER BY snapshot_date DESC, plan_month DESC`,
      parameters,
    };
  },

  customers(snapshotDate: string, search = "", exactCode = ""): SqlQuery {
    const parameters: GeaSqlParameters = {
      snapshotDate: assertDate(
        snapshotDate,
        "快照日期",
        /^20\d{2}-\d{2}-\d{2}$/,
      ),
    };
    let filters = "";
    if (exactCode) {
      parameters.exactCustomerCode = assertIdentifier(exactCode, "客户编码");
      filters += " AND cust_code = :exactCustomerCode";
    }
    if (search.trim()) {
      parameters.customerSearch = `%${search.trim().slice(0, 100).toLocaleLowerCase("zh-CN")}%`;
      filters +=
        " AND (LOWER(cust_code) LIKE :customerSearch OR LOWER(cust_name) LIKE :customerSearch)";
    }
    return {
      sql: `SELECT cust_code, COALESCE(NULLIF(MAX(cust_name), ''), cust_code) AS cust_name
FROM ${MAIN_TABLE}
WHERE snapshot_date = CAST(:snapshotDate AS DATE)${filters}
GROUP BY cust_code
ORDER BY cust_code ASC`,
      parameters,
    };
  },

  planMonths(snapshotDate: string, customerCodes: string[]): SqlQuery {
    const { where, parameters } = scopedWhere(
      snapshotDate,
      undefined,
      customerCodes,
    );
    return {
      sql: `SELECT plan_month
FROM ${MAIN_TABLE}
WHERE ${where}
GROUP BY plan_month
ORDER BY plan_month DESC`,
      parameters,
    };
  },

  dashboard(
    snapshotDate: string,
    planMonth: string,
    customerCodes: string[],
    inventoryStatDate?: string,
  ): SqlQuery {
    const { where, parameters } = scopedWhere(
      snapshotDate,
      planMonth,
      customerCodes,
    );
    if (inventoryStatDate)
      parameters.inventoryStatDate = assertDate(
        inventoryStatDate,
        "库存统计日期",
        /^20\d{2}-\d{2}-\d{2}$/,
      );
    return {
      sql: inventoryStatDate
        ? `SELECT ${MAIN_SELECT.replace(/\n  ([a-z_]+)/g, "\n  plan.$1")}
FROM ${MAIN_TABLE} plan
LEFT JOIN agents_scm_cust_inventory_daily_keys daily
  ON daily.stat_date = CAST(:inventoryStatDate AS DATE) AND daily.cust_code = plan.cust_code AND daily.material_code = plan.material_code
WHERE ${where.replace(/\b(snapshot_date|plan_month|cust_code)\b/g, "plan.$1")}
ORDER BY CASE WHEN daily.cust_code IS NULL THEN 1 ELSE 0 END, plan.pre_order_qty DESC NULLS LAST, plan.cust_code ASC, plan.material_code ASC, plan.plan_month ASC`
        : `SELECT ${MAIN_SELECT}
FROM ${MAIN_TABLE}
WHERE ${where}
ORDER BY pre_order_qty DESC NULLS LAST, cust_code ASC, material_code ASC, plan_month ASC`,
      parameters,
    };
  },

  companyProducts(
    snapshotDate: string,
    planMonth: string,
    customerCodes: string[],
    inventoryStatDate: string | undefined,
    filters: CompanyProductFilters = {},
    facets = false,
  ): SqlQuery {
    if (customerCodes.length !== 1)
      throw new Error("公司商品必须限定单个授权客户");
    const { parameters } = scopedWhere(snapshotDate, planMonth, customerCodes);
    if (inventoryStatDate)
      parameters.inventoryStatDate = assertDate(
        inventoryStatDate,
        "库存统计日期",
        /^20\d{2}-\d{2}-\d{2}$/,
      );
    const tagExpression = "catalog.material_sales_status";
    const conditions = [
      "catalog.cust_code = :customerCode0",
      "catalog.material_code IS NOT NULL",
      "TRIM(catalog.material_code) <> ''",
    ];
    // Business-confirmed delisting; historical customer stock remains visible.
    conditions.push("catalog.material_code <> '10005290'");
    const joins = [
      `LEFT JOIN ${MAIN_TABLE} plan ON plan.snapshot_date = CAST(:snapshotDate AS DATE) AND plan.plan_month = CAST(:planMonth AS DATE) AND plan.cust_code = catalog.cust_code AND plan.material_code = catalog.material_code`,
    ];
    if (filters.search?.trim()) {
      parameters.catalogSearch = `%${filters.search
        .trim()
        .toLowerCase()
        .replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(
        "(LOWER(catalog.material_name) LIKE :catalogSearch OR LOWER(catalog.material_code) LIKE :catalogSearch)",
      );
    }
    if (filters.category) {
      parameters.catalogCategory = filters.category;
      conditions.push(
        "COALESCE(NULLIF(plan.product_categ_name, ''), '-') = :catalogCategory",
      );
    }
    if (filters.productTag) {
      parameters.catalogTag = filters.productTag;
      conditions.push(
        `COALESCE(NULLIF(${tagExpression}, ''), '-') = :catalogTag`,
      );
    }
    if (filters.materialCodes) {
      if (!filters.materialCodes.length || filters.materialCodes.length > 100)
        throw new Error("商品核验每次需提供 1 至 100 个 SKU");
      const names = [...new Set(filters.materialCodes)].map((code, index) => {
        const name = `catalogCode${index}`;
        parameters[name] = assertIdentifier(code, "商品编码");
        return `:${name}`;
      });
      conditions.push(`catalog.material_code IN (${names.join(", ")})`);
    }
    if (filters.policyCode || filters.policySearch?.trim()) {
      if (filters.policyCode) {
        parameters.catalogPolicy = filters.policyCode;
        conditions.push("s.promotion_code = :catalogPolicy");
      }
      if (filters.policySearch?.trim()) {
        parameters.catalogPolicySearch = `%${filters.policySearch
          .trim()
          .toLowerCase()
          .replace(/[\\%_]/g, "\\$&")}%`;
        conditions.push(
          "(LOWER(s.promotion_name) LIKE :catalogPolicySearch OR LOWER(s.promotion_code) LIKE :catalogPolicySearch)",
        );
      }
      parameters.catalogToday = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const scope = promotionScopeView();
      joins.push(
        `JOIN ${scope} s ON s.customer_code = catalog.cust_code AND s.product_code = catalog.material_code`,
      );
      conditions.push(
        "s.data_type = 'cust'",
        promotionScopeConditions("catalogToday"),
      );
    }
    const catalogValues: Record<string, string> = {
      snapshot_date: "CAST(:snapshotDate AS DATE)",
      plan_month: "CAST(:planMonth AS DATE)",
      cust_code: "catalog.cust_code",
      cust_name: "MAX(catalog.cust_name)",
      material_code: "catalog.material_code",
      material_name: "MAX(catalog.material_name)",
    };
    // Aggregate duplicate cooperation/policy rows without multiplying stock or quantities.
    const columns = MAIN_SELECT.split(",")
      .slice(1)
      .map((column) => {
        const [name, , alias] = column.trim().split(/\s+/);
        return `${catalogValues[name] || "MAX(plan." + name + ")"} AS ${alias || name}`;
      })
      .join(", ");
    const from = `FROM ${saleableMaterialTable()} catalog
${joins.join("\n")}
WHERE ${conditions.join(" AND ")}`;
    return {
      sql: facets
        ? `SELECT plan.product_categ_name, ${tagExpression} AS product_tag
${from}
GROUP BY plan.product_categ_name, ${tagExpression}
ORDER BY product_categ_name, product_tag`
        : `SELECT 1 AS record_count, ${columns},
STRING_AGG(DISTINCT NULLIF(${tagExpression}, ''), '、' ORDER BY NULLIF(${tagExpression}, '')) AS catalog_product_tag,
MIN(CASE WHEN ${tagExpression} = '新品' THEN 0 ELSE 1 END) AS catalog_new_rank
${from}
GROUP BY catalog.cust_code, catalog.material_code
ORDER BY catalog_new_rank, pre_order_qty DESC NULLS LAST, material_code ASC`,
      parameters,
    };
  },

  summary(
    snapshotDate: string,
    planMonth: string,
    customerCodes: string[],
  ): SqlQuery {
    const { where, parameters } = scopedWhere(
      snapshotDate,
      planMonth,
      customerCodes,
    );
    return {
      sql: `SELECT
  COUNT(*) AS sku_count,
  SUM(simulation_need_amount) AS budget_amount,
  SUM(ship_amount) AS ship_amount,
  SUM(ship_qty) AS shipped_qty,
  SUM(in_transit_qty) AS in_transit_qty,
  SUM(stock_qty) AS stock_qty,
  SUM(target_inventory) AS target_inventory,
  SUM(pre_order_qty) AS pre_order_qty,
  SUM(daily_sales) AS daily_sales,
  CASE WHEN COUNT(*) = COUNT(CASE WHEN avg_stock_age >= 0 AND stock_qty >= 0 THEN 1 END)
    THEN SUM(CASE WHEN avg_stock_age >= 365.0 * 2 / 3 AND avg_stock_age <= 365 AND stock_qty > 0 THEN 1 ELSE 0 END) ELSE NULL END AS near_expiry_sku_count,
  SUM(CASE WHEN target_inventory IS NOT NULL AND COALESCE(stock_qty, 0) + COALESCE(in_transit_qty, 0) >= target_inventory THEN 1 ELSE 0 END) AS reasonable_sku_count,
  SUM(CASE WHEN target_inventory IS NULL OR COALESCE(stock_qty, 0) + COALESCE(in_transit_qty, 0) < target_inventory THEN 1 ELSE 0 END) AS unreasonable_sku_count,
  SUM(CASE WHEN daily_sales > 0 AND (COALESCE(stock_qty, 0) + COALESCE(in_transit_qty, 0)) / daily_sales < 20 THEN 1 ELSE 0 END) AS shortage_sku_count,
  SUM(CASE WHEN daily_sales <= 0 OR daily_sales IS NULL OR (COALESCE(stock_qty, 0) + COALESCE(in_transit_qty, 0)) / daily_sales >= 20 THEN 1 ELSE 0 END) AS covered_sku_count,
  SUM(CASE WHEN avg_stock_age IS NOT NULL AND stock_qty > 0 THEN avg_stock_age * stock_qty ELSE 0 END) AS stock_age_weighted_sum,
  SUM(CASE WHEN avg_stock_age IS NOT NULL AND stock_qty > 0 THEN stock_qty ELSE 0 END) AS stock_age_weight
FROM ${MAIN_TABLE}
WHERE ${where}`,
      parameters,
    };
  },

  customerSummaries(
    snapshotDate: string,
    planMonth: string,
    customerCodes: string[],
  ): SqlQuery {
    const { where, parameters } = scopedWhere(
      snapshotDate,
      planMonth,
      customerCodes,
    );
    return {
      sql: `SELECT
  cust_code,
  COALESCE(NULLIF(MAX(cust_name), ''), cust_code) AS cust_name,
  COUNT(*) AS sku_count,
  SUM(stock_qty) AS stock_qty,
  SUM(in_transit_qty) AS in_transit_qty,
  SUM(target_inventory) AS target_inventory,
  SUM(pre_order_qty) AS pre_order_qty
FROM ${MAIN_TABLE}
WHERE ${where}
GROUP BY cust_code
ORDER BY cust_code ASC`,
      parameters,
    };
  },

  categorySummaries(
    snapshotDate: string,
    planMonth: string,
    inventoryDailyStatDate: string,
    customerCodes: string[],
  ): SqlQuery {
    const { where, parameters } = scopedWhere(
      snapshotDate,
      planMonth,
      customerCodes,
    );
    parameters.inventoryDailyStatDate = assertDate(
      inventoryDailyStatDate,
      "库存统计日期",
      /^20\d{2}-\d{2}-\d{2}$/,
    );
    const qualifiedWhere = where
      .replace(/\bsnapshot_date\b/g, "plan.snapshot_date")
      .replace(/\bplan_month\b/g, "plan.plan_month")
      .replace(/\bcust_code\b/g, "plan.cust_code");
    return {
      sql: `SELECT
  COALESCE(NULLIF(plan.product_categ_name, ''), '未分类') AS product_categ_name,
  COUNT(*) AS sku_count,
  SUM(plan.stock_qty) AS stock_qty,
  SUM(plan.in_transit_qty) AS in_transit_qty,
  SUM(plan.target_inventory) AS target_inventory,
  SUM(daily.normal_stock_qty) AS category_normal_stock_qty,
  SUM(daily.stock_qty) AS category_actual_stock_qty,
  SUM(daily.in_transit_qty) AS category_actual_transit_qty,
  COUNT(CASE WHEN daily.stock_qty >= 0 AND daily.in_transit_qty >= 0 AND daily.sales_qty_30days >= 0 THEN 1 END) AS category_risk_valid_count,
  SUM(daily.sales_qty_30days) AS category_sales_qty_30days,
  SUM(daily.stock_amt) AS category_stock_amount,
  COUNT(daily.material_code) AS daily_matched_sku_count
FROM ${MAIN_TABLE} plan
LEFT JOIN ${INVENTORY_DAILY_TABLE} daily
  ON daily.stat_date = CAST(:inventoryDailyStatDate AS DATE)
 AND TRIM(daily.cust_code) = TRIM(plan.cust_code)
 AND TRIM(daily.material_code) = TRIM(plan.material_code)
WHERE ${qualifiedWhere}
GROUP BY COALESCE(NULLIF(plan.product_categ_name, ''), '未分类')
ORDER BY SUM(COALESCE(plan.stock_qty, 0) + COALESCE(plan.in_transit_qty, 0)) DESC, product_categ_name ASC`,
      parameters,
    };
  },

  shortageDetails(
    snapshotDate: string,
    planMonth: string,
    customerCodes: string[],
  ): SqlQuery {
    const { where, parameters } = scopedWhere(
      snapshotDate,
      planMonth,
      customerCodes,
    );
    return {
      sql: `SELECT ${MAIN_SELECT}
FROM ${MAIN_TABLE}
WHERE ${where}
  AND daily_sales > 0 AND (COALESCE(stock_qty, 0) + COALESCE(in_transit_qty, 0)) / daily_sales < 20
ORDER BY (COALESCE(stock_qty, 0) + COALESCE(in_transit_qty, 0)) / daily_sales ASC, pre_order_qty DESC, cust_code ASC, material_code ASC`,
      parameters,
    };
  },

  result(scope: WorkbenchResultSqlScope): SqlQuery {
    const { where, parameters } = scopedWhere(
      scope.snapshotDate,
      scope.planMonth,
      scope.customerCodes,
      scope.materialCode,
    );
    const allowedOrderColumns = new Set([
      "pre_order_qty",
      "avg_stock_age",
      "simulation_need_amount",
      "budget_rate",
      "planned_qty_rate",
      "ship_qty",
      "in_transit_qty",
      "stock_qty",
      "target_inventory",
      "turnover_days",
    ]);
    if (!allowedOrderColumns.has(scope.orderColumn))
      throw new Error("结果排序字段无效");
    if (scope.mode === "detail") {
      return {
        sql: `SELECT ${MAIN_SELECT}
FROM ${MAIN_TABLE}
WHERE ${where}
ORDER BY ${scope.orderColumn} DESC, cust_code ASC, material_code ASC`,
        parameters,
      };
    }

    const byCustomer = scope.groupBy === "客户";
    const groupColumns = byCustomer
      ? "snapshot_date, cust_code, cust_name"
      : "snapshot_date, material_code, material_name";
    const identityColumns = byCustomer
      ? "cust_code, cust_name, '' AS material_code, '' AS material_name"
      : "'' AS cust_code, '' AS cust_name, material_code, material_name";
    const aggregateOrder = [
      "avg_stock_age",
      "turnover_days",
      "budget_rate",
      "planned_qty_rate",
    ].includes(scope.orderColumn)
      ? `AVG(${scope.orderColumn})`
      : `SUM(${scope.orderColumn})`;
    return {
      sql: `SELECT
  COUNT(*) AS record_count,
  snapshot_date,
  MIN(plan_month) AS plan_month,
  ${identityColumns},
  '' AS product_categ_name,
  '' AS inventory_source,
  '' AS stock_age_turnover_status,
  MAX(source_load_time) AS source_load_time,
  MAX(updated_time) AS updated_time,
  SUM(simulation_need_amount) AS budget_amount,
  SUM(ship_qty) AS shipped_qty,
  SUM(ship_amount) AS ship_amount,
  SUM(unship_qty) AS unship_qty,
  SUM(unship_amount) AS unship_amount,
  SUM(total_qty) AS total_qty,
  SUM(total_amount) AS total_amount,
  SUM(planned_qty) AS planned_qty,
  AVG(daily_sales) AS daily_sales,
  SUM(in_transit_qty) AS in_transit_qty,
  SUM(stock_qty) AS stock_qty,
  SUM(target_inventory) AS target_inventory,
  SUM(pre_order_qty) AS pre_order_qty,
  AVG(turnover_days) AS average_turnover_days,
  AVG(label_turnover_days) AS label_turnover_days,
  AVG(avg_stock_age) AS average_stock_age,
  AVG(budget_rate) AS average_budget_rate,
  AVG(planned_qty_rate) AS average_planned_qty_rate
FROM ${MAIN_TABLE}
WHERE ${where}
GROUP BY ${groupColumns}
ORDER BY ${aggregateOrder} DESC`,
      parameters,
    };
  },

  aging(
    table: typeof WL_AGE_TABLE | typeof SIMULATED_AGE_TABLE,
    customerCode: string,
    materialCode: string,
  ): SqlQuery {
    return {
      sql: `SELECT stat_date, produce_date, batch_no, ship_type, stock_qty, final_qty
FROM ${table}
WHERE cust_code = :customerCode AND material_code = :materialCode
ORDER BY produce_date ASC, batch_no ASC`,
      parameters: {
        customerCode: assertIdentifier(customerCode, "客户编码"),
        materialCode: assertIdentifier(materialCode, "SKU编码"),
      },
    };
  },
};

function queryOptions(
  options: GeaSqlRequestOptions,
  query: SqlQuery,
): GeaSqlRequestOptions {
  return { ...options, parameters: query.parameters };
}

export async function queryWorkbenchLatestSnapshot(
  customerCodes: string[] = [],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.latestSnapshot(customerCodes);
  return toCubeRows(
    await executeGeaSql(query.sql, queryOptions(options, query)),
  );
}

export async function queryWorkbenchSnapshotMonths(
  customerCodes: string[],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.snapshotMonths(customerCodes);
  return toCubeRows(
    await executeGeaSql(query.sql, queryOptions(options, query)),
  );
}

export async function queryWorkbenchLatestInventoryDailySnapshot(
  customerCodes: string[] = [],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.latestInventoryDailySnapshot(customerCodes);
  return toInventoryDailyCubeRows(
    await executeGeaSql(query.sql, queryOptions(options, query)),
  );
}

export async function queryWorkbenchInventoryDailyDetails(
  statDate: string,
  keys: InventoryDailyKey[],
  options: GeaSqlRequestOptions = {},
  exportCustomerCodes?: string[],
) {
  const query = dealerWorkbenchSql.inventoryDailyDetails(
    statDate,
    keys,
    exportCustomerCodes,
  );
  const rows = await executeAllGeaSqlPages(
    query.sql,
    queryOptions(options, query),
  );
  return toInventoryDailyCubeRows(rows);
}

export async function queryWorkbenchInventoryDailySummary(
  statDate: string,
  customerCodes: string[],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.inventoryDailySummary(
    statDate,
    customerCodes,
  );
  return (
    (await executeGeaSql(query.sql, queryOptions(options, query)))[0] ?? {}
  );
}

export async function queryWorkbenchInventoryDailyCustomerSummaries(
  statDate: string,
  customerCodes: string[],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.inventoryDailyCustomerSummaries(
    statDate,
    customerCodes,
  );
  return toInventoryDailyCubeRows(
    await executeGeaSql(query.sql, queryOptions(options, query)),
  );
}

export async function queryWorkbenchCustomers(
  snapshotDate: string,
  search: string,
  exactCode: string,
  page: number,
  pageSize: number,
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.customers(snapshotDate, search, exactCode);
  const result = await executeGeaSqlPage(
    query.sql,
    page + 1,
    pageSize,
    queryOptions(options, query),
  );
  return { records: toCubeRows(result.rows), total: result.total };
}

export async function queryWorkbenchPlanMonths(
  snapshotDate: string,
  customerCodes: string[],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.planMonths(snapshotDate, customerCodes);
  return toCubeRows(
    await executeGeaSql(query.sql, queryOptions(options, query)),
  );
}

export async function queryWorkbenchDashboard(
  snapshotDate: string,
  planMonth: string,
  customerCodes: string[],
  page: number,
  pageSize: number,
  options: GeaSqlRequestOptions = {},
  inventoryDailySnapshotDate?: string | null,
  companyFilters?: CompanyProductFilters,
) {
  const dailyDate =
    inventoryDailySnapshotDate === undefined
      ? (
          await queryWorkbenchLatestInventoryDailySnapshot(
            customerCodes,
            options,
          )
        )[0]?.["dealer_inventory_daily.stat_date"]
      : inventoryDailySnapshotDate;
  const date = dailyDate ? String(dailyDate).slice(0, 10) : undefined;
  const query = companyFilters
    ? dealerWorkbenchSql.companyProducts(
        snapshotDate,
        planMonth,
        customerCodes,
        date,
        companyFilters,
      )
    : dealerWorkbenchSql.dashboard(
        snapshotDate,
        planMonth,
        customerCodes,
        date,
      );
  if (
    options.exportTab === "sku" ||
    options.exportTab === "expiry" ||
    companyFilters?.download
  ) {
    const records = toCubeRows(
      await executeAllGeaSqlPages(query.sql, queryOptions(options, query)),
    );
    return { records, total: records.length };
  }
  const result = await executeGeaSqlPage(
    query.sql,
    page + 1,
    pageSize,
    queryOptions(options, query),
  );
  return { records: toCubeRows(result.rows), total: result.total };
}

export async function queryWorkbenchSummary(
  snapshotDate: string,
  planMonth: string,
  customerCodes: string[],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.summary(
    snapshotDate,
    planMonth,
    customerCodes,
  );
  return (
    (await executeGeaSql(query.sql, queryOptions(options, query)))[0] ?? {}
  );
}

export async function queryWorkbenchCustomerSummaries(
  snapshotDate: string,
  planMonth: string,
  customerCodes: string[],
  page: number,
  pageSize: number,
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.customerSummaries(
    snapshotDate,
    planMonth,
    customerCodes,
  );
  if (options.exportTab === "customer") {
    const records = toCubeRows(
      await executeAllGeaSqlPages(query.sql, queryOptions(options, query)),
    );
    return { records, total: records.length };
  }
  const result = await executeGeaSqlPage(
    query.sql,
    page + 1,
    pageSize,
    queryOptions(options, query),
  );
  return { records: toCubeRows(result.rows), total: result.total };
}

export async function queryWorkbenchCategorySummaries(
  snapshotDate: string,
  planMonth: string,
  inventoryDailyStatDate: string,
  customerCodes: string[],
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.categorySummaries(
    snapshotDate,
    planMonth,
    inventoryDailyStatDate,
    customerCodes,
  );
  return toCubeRows(
    await executeAllGeaSqlPages(query.sql, queryOptions(options, query)),
  );
}

export async function queryWorkbenchShortageDetails(
  snapshotDate: string,
  planMonth: string,
  customerCodes: string[],
  page: number,
  pageSize: number,
  options: GeaSqlRequestOptions = {},
) {
  const query = dealerWorkbenchSql.shortageDetails(
    snapshotDate,
    planMonth,
    customerCodes,
  );
  if (options.exportTab === "shortage") {
    const records = toCubeRows(
      await executeAllGeaSqlPages(query.sql, queryOptions(options, query)),
    );
    return { records, total: records.length };
  }
  const result = await executeGeaSqlPage(
    query.sql,
    page + 1,
    pageSize,
    queryOptions(options, query),
  );
  return { records: toCubeRows(result.rows), total: result.total };
}

export async function queryWorkbenchAging(
  source: "wl" | "simulated",
  customerCode: string,
  materialCode: string,
  options: GeaSqlRequestOptions = {},
) {
  const table = source === "wl" ? WL_AGE_TABLE : SIMULATED_AGE_TABLE;
  const prefix =
    source === "wl" ? "dealer_wl_stock_age" : "dealer_simulated_stock_age";
  const query = dealerWorkbenchSql.aging(table, customerCode, materialCode);
  const rows = await executeAllGeaSqlPages(
    query.sql,
    queryOptions(options, query),
  );
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [`${prefix}.${key}`, value]),
    ),
  );
}

export async function queryWorkbenchSqlPage(
  query: SqlQuery,
  page: number,
  pageSize: number,
  options: GeaSqlRequestOptions = {},
) {
  const result = await executeGeaSqlPage(
    query.sql,
    page + 1,
    pageSize,
    queryOptions(options, query),
  );
  return { ...result, records: toCubeRows(result.rows) };
}

export async function queryAllWorkbenchSqlRows(
  query: SqlQuery,
  options: GeaSqlRequestOptions = {},
) {
  return toCubeRows(
    await executeAllGeaSqlPages(query.sql, queryOptions(options, query)),
  );
}

// 客户编码必须来自已经完成权限校验的工作台范围。
export async function queryWorkbenchCustomerCars(
  customerCode: string,
  options: GeaSqlRequestOptions = {},
) {
  if (!customerCode.trim()) return [];
  const table = configuredResourceName(
    "DEALER_WORKBENCH_SQL_CUSTOMER_CAR_TABLE",
    "agents_scm_customer_car_current",
  );
  return executeAllGeaSqlPages(
    `SELECT source_record_id, organization_id, cust_code, warehouse_group_id,
            car_type, car_code, car_name, min_discount_num, max_discount_num
     FROM ${table}
     WHERE cust_code = :customerCode
     ORDER BY organization_id, warehouse_group_id, car_code, source_record_id`,
    { ...options, parameters: { customerCode } },
  );
}

/** 读取已授权客户的收货地；不读取联系人及电话，不将其当作提货点。 */
export async function queryWorkbenchCustomerReceives(
  customerCode: string,
  options: GeaSqlRequestOptions = {},
) {
  if (!customerCode.trim()) return [];
  const table = configuredResourceName(
    "DEALER_WORKBENCH_SQL_CUSTOMER_RECEIVE_TABLE",
    "agents_scm_customer_receive",
  );
  return executeAllGeaSqlPages(
    `SELECT source_record_id, cust_code, receive_cust_code, receive_cust_name,
            goods_address, main_drivertype, max_drivertype
     FROM ${table} WHERE cust_code = :customerCode
     ORDER BY receive_cust_code, source_record_id`,
    { ...options, parameters: { customerCode } },
  );
}

/** Exact SKU authorization before a DMS read; use the same GEA row-level scope as the catalog. */
export async function queryWorkbenchFulfillmentMaterials(
  customerCode: string,
  materialCodes: string[],
  options: GeaSqlRequestOptions = {},
) {
  if (!materialCodes.length || materialCodes.length > 500)
    throw new Error("商品范围无效");
  const parameters: GeaSqlParameters = {
    customerCode: assertIdentifier(customerCode, "客户编码"),
  };
  const names = materialCodes.map((code, i) => {
    parameters[`material${i}`] = assertIdentifier(code, "商品编码");
    return `:material${i}`;
  });
  return executeAllGeaSqlPages(
    `SELECT DISTINCT cust_code, material_code FROM ${saleableMaterialTable()}
    WHERE cust_code = :customerCode AND material_code IN (${names.join(",")}) AND material_code <> '10005290'`,
    { ...options, parameters },
  );
}

export type CustomerPickupPoint = {
  code: string;
  name: string;
  isDefault: boolean;
  isSecondary: boolean;
  matched: boolean;
  activeFlag: string;
  available: boolean;
  factoryCode: string;
  companyCode: string;
  type: string;
  baseName: string;
};

/** Read only within the already authorized customer. Preserve unavailable records for UI explanations. */
export async function queryWorkbenchCustomerPickupPoints(
  customerCode: string,
  options: GeaSqlRequestOptions = {},
): Promise<CustomerPickupPoint[]> {
  if (!customerCode.trim()) return [];
  const table = configuredResourceName(
    "DEALER_WORKBENCH_SQL_CUSTOMER_PICKUP_TABLE",
    "agents_scm_cust_pickup_point",
  );
  const rows = await executeAllGeaSqlPages(
    `SELECT cust_code, warehouse_group_id, warehousegroup_name, CAST(is_default_shipping AS TEXT) AS is_default_shipping,
            CAST(is_secondary_shipping AS TEXT) AS is_secondary_shipping, CAST(is_pickup_point_matched AS TEXT) AS is_pickup_point_matched, active_flag, factory_code,
            warehouse_group_type, base_name, company_code
     FROM ${table} WHERE cust_code = :customerCode
     ORDER BY is_default_shipping DESC, warehouse_group_id`,
    { ...options, parameters: { customerCode } },
  );
  const seen = new Set<string>();
  return rows.map((row) => {
    const text = (value: unknown) =>
      value == null ? "" : String(value).trim();
    const code = text(row.warehouse_group_id);
    const flag = (value: unknown) =>
      value === true || value === "true"
        ? true
        : value === false || value === "false"
          ? false
          : null;
    if (
      text(row.cust_code) !== customerCode ||
      !code ||
      seen.has(code) ||
      [
        row.is_default_shipping,
        row.is_secondary_shipping,
        row.is_pickup_point_matched,
      ].some((value) => flag(value) === null)
    ) {
      throw new Error("提货点客户范围、编码或状态异常");
    }
    seen.add(code);
    const matched = flag(row.is_pickup_point_matched) === true,
      activeFlag = text(row.active_flag);
    return {
      code,
      name: text(row.warehousegroup_name),
      isDefault: flag(row.is_default_shipping) === true,
      isSecondary: flag(row.is_secondary_shipping) === true,
      matched,
      activeFlag,
      available: matched && activeFlag === "Y",
      factoryCode: text(row.factory_code),
      companyCode: text(row.company_code),
      type: text(row.warehouse_group_type),
      baseName: text(row.base_name),
    };
  });
}

/** Compatibility entry point: defaults now come from customer master data, never order history. */
export async function queryWorkbenchDefaultPickup(
  customerCode: string,
  options: GeaSqlRequestOptions = {},
) {
  const points = await queryWorkbenchCustomerPickupPoints(
    customerCode,
    options,
  );
  return points
    .filter((point) => point.available && point.isDefault)
    .map((point) => ({
      pickup_point_default: point.name,
      pickup_code: point.code,
    }));
}

/** Customer company code supplies SAP VKORG; pickup/factory stay paired with that source row. */
export async function queryWorkbenchSapSalesArea(
  customerCode: string,
  docType: string,
  options: GeaSqlRequestOptions = {},
) {
  if (!customerCode.trim() || !docType.trim()) return [];
  const points = await queryWorkbenchCustomerPickupPoints(
    customerCode,
    options,
  );
  return points
    .filter((point) => point.available)
    .map((point) => ({
      cust_code: customerCode,
      vsbed: point.code,
      werks: point.factoryCode,
      vkorg: point.companyCode,
      vtweg: "",
      spart: "",
      doc_type: docType,
    }));
}

/** customerCode 必须来自已授权的单客户工作台；不能查询全库政策。 */
export async function queryWorkbenchPromotionPolicies(
  customerCode: string,
  businessDate: string,
  options: GeaSqlRequestOptions = {},
) {
  if (!customerCode.trim()) return [];
  const scope = promotionScopeView();
  return executeAllGeaSqlPages(
    `SELECT DISTINCT s.range_record_id, s.customer_code, s.data_type, s.scope_level,
            s.product_code, s.product_name, s.scope_pup_code AS pup_code, s.scope_pup_name AS pup_name,
            s.promotion_code, s.promotion_name, s.promotion_type, CAST(s.promotion_limit AS TEXT) AS promotion_limit,
            CAST(s.promotion_start_date AS TEXT) AS promotion_start_date, CAST(s.promotion_end_date AS TEXT) AS promotion_end_date,
            CAST(s.usable_quantity AS TEXT) AS usable_quantity, CAST(s.used_quantity AS TEXT) AS used_quantity,
            s.policy_pup_code, s.policy_pup_name,
            CAST(s.purchase_batch_start_date AS TEXT) AS policy_purchase_start_date,
            CAST(s.purchase_batch_end_date AS TEXT) AS policy_purchase_end_date,
            CAST(s.gift_batch_start_date AS TEXT) AS policy_gift_start_date,
            CAST(s.gift_batch_end_date AS TEXT) AS policy_gift_end_date,
            s.gift_batch_remarks AS policy_gift_remarks,
            s.policy_remarks AS remarks, s.goods_age_range, s.goods_dimension${process.env.DEALER_WORKBENCH_POLICY_EXCLUSIVE_ENABLED === "true" ? ", s.is_customer_exclusive" : ""}
     FROM ${scope} s
     WHERE s.customer_code = :customerCode AND s.data_type = :scopeType
       AND ${promotionScopeConditions("businessDate")}
     ORDER BY s.promotion_code, s.range_record_id`,
    {
      ...options,
      parameters: { customerCode, businessDate, scopeType: "cust" },
    },
  );
}

/** Resolve the chat allowlist using the same GEA row permissions. */
export async function queryAuthorizedDealerChatCustomers(
  exactCode = "",
  options: GeaSqlRequestOptions = {},
): Promise<string[]> {
  const parameters: GeaSqlParameters = {};
  const predicate = exactCode ? customerPredicate([exactCode], parameters) : "";
  const rows = await executeAllGeaSqlPages(
    `SELECT DISTINCT cust_code FROM ${MAIN_TABLE} WHERE cust_code IS NOT NULL${predicate} ORDER BY cust_code ASC`,
    { ...options, parameters, pageConcurrency: 3 },
  );
  // GEA owns the business identifiers, including virtual dealers. Validate the
  // response shape only; never infer account permissions from an identifier's format.
  const codes = rows.map((row) => {
    if (typeof row.cust_code !== "string" || !row.cust_code.trim()) {
      throw new Error("GEA 返回的客户编码字段缺失或为空，无法确认对话权限范围");
    }
    return row.cust_code;
  });
  return [...new Set(codes)];
}

export async function queryWorkbenchCompanyProductFacets(
  snapshotDate: string,
  planMonth: string,
  customerCode: string,
  options: GeaSqlRequestOptions = {},
) {
  const dailyDate = (
    await queryWorkbenchLatestInventoryDailySnapshot([customerCode], options)
  )[0]?.["dealer_inventory_daily.stat_date"];
  const query = dealerWorkbenchSql.companyProducts(
    snapshotDate,
    planMonth,
    [customerCode],
    dailyDate ? String(dailyDate).slice(0, 10) : undefined,
    {},
    true,
  );
  const rows = await executeAllGeaSqlPages(
    query.sql,
    queryOptions(options, query),
  );
  return {
    categories: [
      ...new Set(rows.map((row) => String(row.product_categ_name || "-"))),
    ],
    tags: [...new Set(rows.map((row) => String(row.product_tag || "-")))],
  };
}

/** Count the same customer-saleable set used by catalog queries, without reading inventory as a catalog. */
export async function queryWorkbenchCompanyProductTotal(
  customerCode: string,
  options: GeaSqlRequestOptions = {},
) {
  const rows = await executeGeaSql(
    `SELECT COUNT(DISTINCT material_code) AS product_total
FROM ${saleableMaterialTable()}
WHERE cust_code = :customerCode AND material_code IS NOT NULL AND TRIM(material_code) <> '' AND material_code <> '10005290'`,
    {
      ...options,
      parameters: { customerCode: assertIdentifier(customerCode, "客户编码") },
    },
  );
  const raw = rows[0]?.product_total;
  const total = raw == null ? NaN : Number(raw);
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error("可售商品总数无效");
  return total;
}
