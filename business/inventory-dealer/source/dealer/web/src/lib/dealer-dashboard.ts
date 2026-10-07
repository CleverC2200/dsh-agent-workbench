import "server-only";
import { inventoryDateLabel } from "@/lib/inventory-date-label";
import {
  evaluateStatusFilters,
  rowActionStatus,
  statusMatches,
  statusFilterLabel,
  validStatusFilters,
  type DealerStatusFilter,
  type StatusContext,
} from "@/lib/dealer-status-filters";

import fuse_rules from "../../../config/biz-rules/fuse-rules.json";
import exceptions from "../../../config/biz-rules/exceptions.json";
import filter_labels from "../../../config/biz-rules/filter-labels.json";
import metric_cards from "../../../config/biz-rules/metric-cards.json";
import stock_health from "../../../config/biz-rules/stock-health.json";
import report_templates from "../../../config/biz-rules/report-templates.json";
import split_params from "../../../config/biz-rules/split-params.json";

import {
  dealerWorkbenchSql,
  queryAllWorkbenchSqlRows,
  queryWorkbenchAging,
  queryWorkbenchCategorySummaries,
  queryWorkbenchCustomerSummaries,
  queryWorkbenchCustomers,
  queryWorkbenchDashboard,
  type CompanyProductFilters,
  queryWorkbenchInventoryDailyDetails,
  queryWorkbenchInventoryDailyCustomerSummaries,
  queryWorkbenchInventoryDailySummary,
  queryWorkbenchLatestSnapshot,
  queryWorkbenchSnapshotMonths,
  queryWorkbenchLatestInventoryDailySnapshot,
  queryWorkbenchPlanMonths,
  queryWorkbenchShortageDetails,
  queryWorkbenchSummary,
  queryWorkbenchSqlPage,
} from "@/lib/dealer-workbench-sql";
import { GeaSqlApiError } from "@/lib/gea-sql-client";
import dealerCubeContract from "@/contracts/dealer-inventory-cube.json";

type CubeValue = string | number | null | undefined;
type CubeRow = Record<string, CubeValue>;

const cube = dealerCubeContract.cube;
const planMonthDimension = dealerCubeContract.planMonthDimension;
const sourceLoadTimeDimension = dealerCubeContract.sourceLoadTimeDimension;
const updatedTimeDimension = dealerCubeContract.updatedTimeDimension;
const GEA_CUSTOMER_BOOTSTRAP_LIMIT = 10;
const GEA_CUSTOMER_SEARCH_LIMIT = 20;
const GEA_DASHBOARD_INITIAL_ROW_LIMIT = 200;

const DEFAULT_FUSE_RULES = { low: 60, high: 90, fused: 120 };
const DISABLED_FUSE_RULES = {
  low: Number.MAX_SAFE_INTEGER,
  high: Number.MAX_SAFE_INTEGER,
  fused: Number.MAX_SAFE_INTEGER,
};

type BizRuleFile = {
  status?: string;
  effective_time?: string;
  expire_time?: string;
  default?: {
    thresholdsDays?: number[];
    levels?: Array<Record<string, unknown>>;
  };
  overrides?: Array<Record<string, unknown>>;
  exceptions?: Array<Record<string, unknown>>;
  filters?: Array<Record<string, unknown>>;
  cards?: Array<Record<string, unknown>>;
  healthLevels?: Array<Record<string, unknown>>;
  healthBands?: Array<Record<string, unknown>>;
  ageDisplayBands?: Array<Record<string, unknown>>;
  stockVsTarget?: Record<string, unknown>;
};

const businessRules: Record<string, BizRuleFile> = {
  "fuse-rules": fuse_rules,
  exceptions,
  "filter-labels": filter_labels,
  "metric-cards": metric_cards,
  "stock-health": stock_health,
  "report-templates": report_templates,
  "split-params": split_params,
} as unknown as Record<string, BizRuleFile>;
function loadBizRuleFile(name: string): BizRuleFile {
  const rule = businessRules[name];
  if (!rule) throw Error("Missing business rule: " + name);
  return rule;
}

function isActiveBizRuleFile(config: BizRuleFile) {
  return isEffectiveBizRule(config);
}

function isEffectiveBizRule(rule: Record<string, unknown>) {
  if (String(rule.status ?? "生效") !== "生效") return false;
  const now = Date.now();
  const effective =
    typeof rule.effective_time === "string"
      ? Date.parse(rule.effective_time)
      : Number.NaN;
  const expire =
    typeof rule.expire_time === "string"
      ? Date.parse(rule.expire_time)
      : Number.NaN;
  return (
    (Number.isNaN(effective) || effective <= now) &&
    (Number.isNaN(expire) || expire > now)
  );
}

function fuseRulesFrom(
  config: Pick<BizRuleFile, "default"> | Record<string, unknown>,
): typeof DEFAULT_FUSE_RULES | null {
  const rawConfig = config as Record<string, unknown>;
  const levels = Array.isArray(rawConfig.levels)
    ? (rawConfig.levels as Array<Record<string, unknown>>)
    : undefined;
  if (levels) {
    const minDays = (name: string) =>
      levels.find((level) => String(level.level ?? "") === name)?.minDays;
    const [low, high, fused] = [
      minDays("low"),
      minDays("high"),
      minDays("fused"),
    ];
    if (
      typeof low === "number" &&
      low > 0 &&
      typeof high === "number" &&
      high > 0 &&
      typeof fused === "number" &&
      fused > 0
    )
      return { low, high, fused };
  }
  const defaults = rawConfig.default as
    { thresholdsDays?: unknown } | undefined;
  const thresholds = defaults?.thresholdsDays;
  if (Array.isArray(thresholds) && thresholds.length >= 3) {
    const [low, high, fused] = thresholds;
    if (
      [low, high, fused].every(
        (value) => typeof value === "number" && value > 0,
      )
    )
      return { low, high, fused };
  }
  return null;
}

function loadFuseRules(config = loadBizRuleFile("fuse-rules")) {
  // 与 Agent 共用 fuse-rules.json；文件、规则项均需同时满足生效状态和有效期。
  if (!isActiveBizRuleFile(config)) return DISABLED_FUSE_RULES;
  const rules = fuseRulesFrom(config);
  if (rules) return rules;
  return DEFAULT_FUSE_RULES;
}

type RuleScope = { customerCode: string; materialCode: string };

function scopeMatches(rule: Record<string, unknown>, scope: RuleScope) {
  const customer = String(rule.cust_code ?? rule.customer_code ?? "").trim();
  const material = String(rule.material_code ?? rule.sku_code ?? "").trim();
  if (customer && customer !== scope.customerCode) return false;
  if (material && material !== scope.materialCode) return false;
  // 当前工作台没有品类/标签字段，不能将该层级规则误匹配为任意 SKU。
  return !["material_group", "category", "product_label"].some((key) =>
    String(rule[key] ?? "").trim(),
  );
}

function fuseRuleRank(rule: Record<string, unknown>) {
  // 与 biz_rule_config._rule_specificity 保持同一优先级。
  return (
    (
      {
        customer_sku: 0,
        sku: 1,
        material_group: 2,
        category: 3,
        product_label: 4,
        default: 5,
      } as Record<string, number>
    )[String(rule.scope ?? rule.level ?? "")] ?? 6
  );
}

function effectiveRuleFor(
  rules: Array<Record<string, unknown>>,
  scope: RuleScope,
  rank: (rule: Record<string, unknown>) => number,
) {
  return rules
    .filter((rule) => isEffectiveBizRule(rule) && scopeMatches(rule, scope))
    .sort(
      (left, right) =>
        rank(left) - rank(right) ||
        String(right.updated_at ?? right.updatedAt ?? "").localeCompare(
          String(left.updated_at ?? left.updatedAt ?? ""),
        ),
    )[0];
}

function fuseRulesFor(scope: RuleScope, config: BizRuleFile) {
  if (!isActiveBizRuleFile(config)) return DISABLED_FUSE_RULES;
  const override = effectiveRuleFor(
    config.overrides ?? [],
    scope,
    fuseRuleRank,
  );
  return (override && fuseRulesFrom(override)) ?? loadFuseRules(config);
}

function fuseLevelForRow(
  row: CubeRow,
  config = loadBizRuleFile("fuse-rules"),
): string {
  const age = nullableNumber(row[`${cube}.average_stock_age`]);
  if (age === null || !isActiveBizRuleFile(config)) return "unknown";
  const scope = {
    customerCode: String(row[dealerCubeContract.customerCodeDimension] ?? ""),
    materialCode: String(row[dealerCubeContract.materialCodeDimension] ?? ""),
  };
  const override = effectiveRuleFor(
    config.overrides ?? [],
    scope,
    fuseRuleRank,
  );
  const levels = (
    Array.isArray(override?.levels)
      ? override.levels
      : (config.default?.levels ?? [])
  ) as Array<Record<string, unknown>>;
  const match = levels.find(
    (level) =>
      (typeof level.minDays === "number" ||
        typeof level.maxDays === "number") &&
      (typeof level.minDays !== "number" || age >= level.minDays) &&
      (typeof level.maxDays !== "number" || age < level.maxDays),
  );
  if (match) return String(match.level ?? "unknown");
  const last = levels.at(-1);
  return last && typeof last.minDays === "number" && age >= last.minDays
    ? String(last.level ?? "unknown")
    : "unknown";
}

function isFusedSku(row: CubeRow) {
  return fuseLevelForRow(row) === "fused";
}

function statusContext(): StatusContext {
  const fuseConfig = loadBizRuleFile("fuse-rules"),
    healthConfig = loadBizRuleFile("stock-health"),
    exceptions = loadBizRuleFile("exceptions");
  return {
    fuse: (row) => fuseLevelForRow(row, fuseConfig),
    dataIssues: (row) => dataIssuesFor(row, false).length > 0,
    exception: (row) =>
      Boolean(
        orderExceptionFor(
          {
            customerCode: String(
              row[dealerCubeContract.customerCodeDimension] ?? "",
            ),
            materialCode: String(
              row[dealerCubeContract.materialCodeDimension] ?? "",
            ),
          },
          exceptions,
        ),
      ),
    health: (days) => {
      if (days === null || !isActiveBizRuleFile(healthConfig)) return "未知";
      const band = healthConfig.healthBands?.[0] ?? {};
      const match = healthConfig.healthLevels?.find((level) => {
        const min = Number(level.minDays ?? band.minDays ?? -Infinity),
          max = Number(level.maxDays ?? band.maxDays ?? Infinity);
        switch (
          String(level.condition ?? "")
            .replaceAll(" ", "")
            .toLowerCase()
        ) {
          case "turnover<mindays":
          case "turnover<min":
            return days < min;
          case "turnover>maxdays":
          case "turnover>max":
            return days > max;
          case "mindays<=turnover<=maxdays":
          case "min<=turnover<=max":
            return min <= days && days <= max;
          case "maxdays<turnover<=60":
          case "max<turnover<=60":
            return max < days && days <= 60;
          case "turnover>60":
            return days > 60;
          case "turnover>=60":
            return days >= 60;
          default:
            return false;
        }
      });
      return String(match?.level ?? "未知");
    },
    ageBand: (days) => {
      if (days === null || !isActiveBizRuleFile(healthConfig)) return "未知";
      const bands = healthConfig.ageDisplayBands ?? [];
      const match = bands.find(
        (band) =>
          (typeof band.minDays !== "number" || days >= band.minDays) &&
          (typeof band.maxDays !== "number" || days <= band.maxDays),
      );
      const last = bands.at(-1);
      return String(
        match?.band ??
          (last && typeof last.minDays === "number" && days >= last.minDays
            ? last.band
            : "未知"),
      );
    },
  };
}

function orderExceptionFor(scope: RuleScope, config: BizRuleFile) {
  if (!isActiveBizRuleFile(config)) return null;
  const exception = effectiveRuleFor(
    config.exceptions ?? [],
    scope,
    (rule) =>
      (({ customer_sku: 0, sku: 1, customer: 2 }) as Record<string, number>)[
        String(rule.level ?? "")
      ] ?? 3,
  );
  if (!exception) return null;
  const processing = String(
    exception.processing ?? exception.reason ?? "",
  ).trim();
  return /不可下单|暂缓|控货|停用|下市/.test(processing) ? processing : null;
}

function loadFilterLabels() {
  const config = loadBizRuleFile("filter-labels");
  if (!isActiveBizRuleFile(config)) return [];
  const filters = config.filters;
  if (!Array.isArray(filters)) return [];
  return filters
    .filter((item) => String(item.status ?? "生效") === "生效")
    .map((item) => ({
      key: String(item.key ?? ""),
      label: String(item.label ?? item.key ?? ""),
      anchor: String(item.anchor ?? ""),
      display: String(item.display ?? ""),
    }));
}

function loadMetricCards() {
  const config = loadBizRuleFile("metric-cards");
  if (!isActiveBizRuleFile(config)) return [];
  const cards = config.cards;
  if (!Array.isArray(cards)) return [];
  return cards
    .filter((item) => String(item.status ?? "生效") === "生效")
    .map((item) => ({
      key: String(item.key ?? ""),
      label: String(item.label ?? ""),
      note: String(item.note ?? ""),
      main: String((item.main as { field?: string } | undefined)?.field ?? ""),
      aux: Array.isArray(item.aux)
        ? item.aux.map((aux) => String((aux as { field?: string }).field ?? ""))
        : [],
    }));
}

function loadStockHealth() {
  const config = loadBizRuleFile("stock-health");
  if (!isActiveBizRuleFile(config)) {
    return { healthLevels: [], healthBands: [], highRatio: 1.2, lowRatio: 0.8 };
  }
  const ratios = config.stockVsTarget ?? {};
  return {
    healthLevels: Array.isArray(config.healthLevels) ? config.healthLevels : [],
    healthBands: Array.isArray(config.healthBands) ? config.healthBands : [],
    highRatio: Number(ratios.highRatio ?? 1.2),
    lowRatio: Number(ratios.lowRatio ?? 0.8),
  };
}

export type DealerCustomer = { code: string; name: string };
export type DealerCustomerInventorySummary = {
  code: string;
  name: string;
  hasInventoryData: boolean;
  skuCount: number;
  inventory: number;
  inTransit: number;
  normalInventory: number | null;
  stockAmount: number | null;
  dailyRowCount: number;
  normalStockCoverage: number;
  stockAmountCoverage: number;
  targetInventory: number;
  suggestedQuantity: number;
};
export type DealerCategoryInventorySummary = {
  riskInventory?: number | null;
  riskTransit?: number | null;
  riskDataComplete?: boolean;
  category: string;
  skuCount: number;
  inventory: number;
  inTransit: number;
  normalInventory: number | null;
  sales30: number | null;
  stockAmount: number | null;
  dailyMatchedSkuCount: number;
  targetInventory: number;
};
export type DealerDashboardRecord = {
  // Only populated from verified batch-expiry / effective-transit facts.
  verifiedNearExpiryInventory?: number | null;
  verifiedEffectiveInTransit?: number | null;
  id: string;
  recordCount: number;
  planMonth: string | null;
  sourceLoadTime: string | null;
  updatedTime: string | null;
  customerCode: string;
  customerName: string;
  materialCode: string;
  materialName: string;
  productCategory: string | null;
  budget: number;
  shipped: number;
  inTransit: number;
  inventory: number | null;
  turnoverDays: number | null;
  targetInventory: number | null;
  averageAge: number | null;
  agingStatus: string | null;
  suggestedQuantity: number;
  budgetRate: number | null;
  // Keep source nulls for company products; legacy inventory metrics use numeric defaults.
  publishedInTransit?: number | null;
  publishedSuggestedQuantity?: number | null;
  plannedQtyRate: number | null;
  plannedQty: number | null;
  dailySales: number | null;
  shipAmount: number;
  unshipQty: number;
  unshipAmount: number;
  totalQty: number;
  totalAmount: number;
  labelTurnoverDays: number | null;
  inventorySource: string | null;
  inventoryDailyStatDate: string | null;
  inventorySnapshotDate: string | null;
  actualInventory: number | null;
  actualInTransit: number | null;
  normalInventory: number | null;
  stockAmount: number | null;
  sales7: number | null;
  sales7DailyAverage: number | null;
  sales30: number | null;
  sales30DailyAverage: number | null;
  salesAmount30: number | null;
  salesAmount30DailyAverage: number | null;
  productRange: string | null;
  productTag: string | null;
  materialSize: string | null;
  cifPrice: number | null;
  inventoryDailySource: string | null;
  dataIssues: string[];
  fuseRules: typeof DEFAULT_FUSE_RULES;
  orderException: string | null;
};

export type DealerDashboardSummary = {
  nearExpirySkuCount?: number | null;
  skuCount: number;
  reasonableSkuCount: number;
  unreasonableSkuCount: number;
  shortageSkuCount: number;
  coveredSkuCount: number;
  budget: number | null;
  shipAmount: number | null;
  shipped: number;
  inTransit: number;
  inventory: number;
  targetInventory: number;
  suggestedQuantity: number;
  dailySales: number;
  averageAge: number | null;
};

export type DealerInventoryDailySummary = {
  noSalesSkuCount?: number | null;
  statDate: string;
  inventoryDateLabel?: string;
  rowCount: number;
  customerCount: number;
  coverageComplete: boolean;
  stockQtyComplete: boolean;
  inTransitQtyComplete: boolean;
  normalStockQtyComplete: boolean;
  stockAmountComplete: boolean;
  sales7Complete: boolean;
  sales7DailyAverageComplete: boolean;
  sales30Complete: boolean;
  sales30DailyAverageComplete: boolean;
  salesAmount30Complete: boolean;
  sales7Coverage: number;
  sales30Coverage: number;
  salesAmount30Coverage: number;
  normalStockCoverage: number;
  stockAmountCoverage: number;
  inventory: number;
  inTransit: number;
  normalInventory: number;
  stockAmount: number;
  sales7: number;
  sales7DailyAverage: number;
  sales30: number;
  sales30DailyAverage: number;
  salesAmount30: number;
  salesAmount30DailyAverage: number;
};

export type DealerFilterLabel = {
  key: string;
  label: string;
  anchor: string;
  display: string;
};
export type DealerMetricCard = {
  key: string;
  label: string;
  note: string;
  main: string;
  aux: string[];
};
export type DealerStockHealth = {
  healthLevels: Array<Record<string, unknown>>;
  healthBands: Array<Record<string, unknown>>;
  highRatio: number;
  lowRatio: number;
};

export type DealerAgingRow = {
  source: "文沥/D-Link" | "提报推演";
  statDate: string | null;
  produceDate: string | null;
  batchNo: string | null;
  shipType: string | null;
  ageDays: number | null;
  stockQty: number;
  finalQty: number;
};

export type DealerDetailScope = {
  snapshotDate: string;
  planMonth?: string;
  customerCodes: string[];
  materialCode: string;
  mode: "detail" | "aggregate";
  groupBy: string;
  orderBy: "preOrder" | "stockAge" | "metric";
  stockCondition?: "none" | "equals_zero";
  metricCondition?: DealerMetricCondition;
};

export type DealerMetric =
  | "budget_amount"
  | "budget_rate"
  | "planned_qty_rate"
  | "shipped_qty"
  | "in_transit_qty"
  | "stock_qty"
  | "target_inventory"
  | "pre_order_qty"
  | "turnover_days"
  | "stock_age";

export type DealerMetricCondition = {
  metric: DealerMetric;
  comparison: "none" | "gt" | "gte" | "lt" | "lte" | "equals";
  threshold: number | null;
  stockCondition: "none" | "equals_zero";
  inventoryRelation: "none" | "below_target" | "above_target";
  replenishmentRequired: boolean;
  agingAttentionOnly: boolean;
  orderBlocked?: boolean;
  fuseStatus?: "none" | "fused";
  statusFilters?: DealerStatusFilter[];
};

const metricMembers: Record<DealerMetric, string> = {
  budget_amount: `${cube}.budget_amount`,
  budget_rate: `${cube}.average_budget_rate`,
  planned_qty_rate: `${cube}.average_planned_qty_rate`,
  shipped_qty: `${cube}.shipped_qty`,
  in_transit_qty: `${cube}.in_transit_qty`,
  stock_qty: `${cube}.stock_qty`,
  target_inventory: `${cube}.target_inventory`,
  pre_order_qty: `${cube}.pre_order_qty`,
  turnover_days: `${cube}.average_turnover_days`,
  stock_age: `${cube}.average_stock_age`,
};

const metricSqlColumns: Record<DealerMetric, string> = {
  budget_amount: "simulation_need_amount",
  budget_rate: "budget_rate",
  planned_qty_rate: "planned_qty_rate",
  shipped_qty: "ship_qty",
  in_transit_qty: "in_transit_qty",
  stock_qty: "stock_qty",
  target_inventory: "target_inventory",
  pre_order_qty: "pre_order_qty",
  turnover_days: "turnover_days",
  stock_age: "avg_stock_age",
};

const metricLabels: Record<DealerMetric, string> = {
  budget_amount: "月度预算额",
  budget_rate: "预算达成率",
  planned_qty_rate: "计划量达成率",
  shipped_qty: "已发货量",
  in_transit_qty: "在途量",
  stock_qty: "当前库存",
  target_inventory: "目标库存",
  pre_order_qty: "建议补货量",
  turnover_days: "库存周转天数",
  stock_age: "货龄",
};

function numberOf(value: CubeValue) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function nullableNumber(value: CubeValue) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateOnly(value: CubeValue) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, 10) : null;
}

function planMonthOf(value: CubeValue) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, 7) : null;
}

function mainGrainKey(row: CubeRow) {
  return [
    dateOnly(row[dealerCubeContract.snapshotDimension]),
    String(row[dealerCubeContract.customerCodeDimension] ?? "").trim(),
    String(row[dealerCubeContract.materialCodeDimension] ?? "").trim(),
    planMonthOf(row[planMonthDimension]),
  ].join("|");
}

function dedupeRows(rows: CubeRow[]) {
  const seen = new Map<string, CubeRow>();
  const duplicateKeys = new Set<string>();
  let dropped = 0;
  for (const row of rows) {
    const key = mainGrainKey(row);
    if (!key || key === "||||") {
      seen.set(`unkeyed-${seen.size}`, row);
      continue;
    }
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, row);
      continue;
    }
    duplicateKeys.add(key);
    const existingTime = [
      String(existing[sourceLoadTimeDimension] ?? ""),
      String(existing[updatedTimeDimension] ?? ""),
    ];
    const rowTime = [
      String(row[sourceLoadTimeDimension] ?? ""),
      String(row[updatedTimeDimension] ?? ""),
    ];
    if (rowTime.join() > existingTime.join()) seen.set(key, row);
    dropped += 1;
  }
  return { rows: [...seen.values()], dropped, duplicateKeys };
}

/** BIZ-FILTER-06 / BIZ-CHECK-02: preserve missing values instead of coercing them to 0. */
function dataIssuesFor(row: CubeRow, duplicate: boolean) {
  const issues: string[] = [];
  const stock = nullableNumber(row[`${cube}.stock_qty`]);
  const dailySales = nullableNumber(row[`${cube}.daily_sales`]);
  const target = nullableNumber(row[`${cube}.target_inventory`]);
  const averageAge = nullableNumber(row[`${cube}.average_stock_age`]);
  if (stock == null) issues.push("库存缺失");
  else if (stock < 0) issues.push("库存为负");
  if (dailySales == null || dailySales === 0) issues.push("日均销量缺失或为0");
  else if (dailySales < 0) issues.push("日均销量为负");
  if (target == null) issues.push("目标库存缺失");
  else if (target < 0) issues.push("目标库存为负");
  if (averageAge == null) issues.push("平均货龄缺失");
  else if (averageAge < 0) issues.push("平均货龄为负");
  // Cube may already aggregate identical detail dimensions into one response
  // row. `record_count > 1` keeps that duplicate signal visible as well.
  if (duplicate || numberOf(row[`${cube}.record_count`]) > 1)
    issues.push("主粒度重复");
  return issues;
}

function dailyInventoryDataIssuesFor(row: CubeRow | undefined) {
  if (!row) return [];
  const issues: string[] = [];
  const stock = nullableNumber(row["dealer_inventory_daily.stock_qty"]);
  const transit = nullableNumber(row["dealer_inventory_daily.in_transit_qty"]);
  const cifPrice = nullableNumber(row["dealer_inventory_daily.cif_price"]);
  const sales7 = nullableNumber(
    row["dealer_inventory_daily.sales_qty_7days_avg"],
  );
  const sales30 = nullableNumber(
    row["dealer_inventory_daily.sales_qty_30days_avg"],
  );
  if (stock != null && stock < 0) issues.push("库存日快照为负");
  if (transit != null && transit < 0) issues.push("库存日快照在途为负");
  if (cifPrice != null && cifPrice < 0) issues.push("统一到岸价为负");
  if ((sales7 != null && sales7 < 0) || (sales30 != null && sales30 < 0))
    issues.push("库存日快照动销为负");
  return issues;
}

function ageInDays(statDate: string | null, produceDate: string | null) {
  if (!statDate || !produceDate) return null;
  const stat = Date.parse(`${statDate}T00:00:00Z`);
  const produced = Date.parse(`${produceDate}T00:00:00Z`);
  if (!Number.isFinite(stat) || !Number.isFinite(produced)) return null;
  return Math.floor((stat - produced) / 86_400_000);
}

async function assertAuthorizedSqlCustomerCodes(
  customerCodes: string[],
  options: DealerDashboardLoadOptions = {},
) {
  const scopedCustomerCodes = customerCodes;
  if (scopedCustomerCodes.length === 0) return scopedCustomerCodes;
  // GEA 会在该受控 SQL 上注入当前用户的数据范围；不再为二次校验拉取完整客户清单。
  const rows = await queryWorkbenchLatestSnapshot(scopedCustomerCodes, options);
  if (!dateOnly(rows[0]?.[dealerCubeContract.snapshotDimension])) {
    throw new GeaSqlApiError(
      "查询范围包含当前用户无权访问的客户",
      "GEA_SQL_CUSTOMER_SCOPE_FORBIDDEN",
      403,
      false,
    );
  }
  return scopedCustomerCodes;
}

export type DealerDashboardLoadOptions = {
  /** Internal overview reads use only metadata and database aggregate queries. */
  overviewOnly?: boolean;
  overviewCustomerCodes?: string[];
  /** UI default: select the sole visible customer using the queried total. */
  autoSelectOnlyCustomer?: boolean;
  /** Only fetch this stock tab; omitted by existing full-workspace consumers. */
  stockTab?: "customer" | "category" | "sku" | "shortage" | "expiry";
  /** Partial table response; global metrics remain in the existing document. */
  tabDataOnly?: boolean;
  planMonth?: string;
  inventoryDailyStatDate?: string;
  /** Include the current page of authorized products for the company catalog. */
  includeCompanyProducts?: boolean;
  /** Catalog pagination needs only product facts, not dashboard aggregates. */
  companyProductsOnly?: boolean;
  companyProductFilters?: CompanyProductFilters;
  companyProductFacets?: boolean;
  onTiming?: (stage: string, durationMs: number) => void;
  /** Internal export scope; never used for normal screen pagination. */
  exportTab?: "sku" | "shortage" | "customer" | "category" | "expiry";
  actionId?: string;
  clientRequestId?: string;
  signal?: AbortSignal;
  /** Zero-based database detail page used by the review prototype. */
  detailPage?: number;
  /** Database detail page size; summary metrics remain scoped to all rows. */
  detailPageSize?: number;
  /** Independent zero-based customer-summary page for the customer inventory tab. */
  customerPage?: number;
  /** Customer-summary page size; does not change SKU detail pagination. */
  customerPageSize?: number;
  /** Independent zero-based shortage-SKU page for the shortage inventory tab. */
  shortagePage?: number;
  /** Shortage-SKU page size; does not change the regular SKU page. */
  shortagePageSize?: number;
  scope?: "single" | "sales" | "all";
  snapshotDate?: string;
  /** Trusted GEA dealer identity; narrows customer-list queries to one code. */
  lockedCustomerCode?: string;
};

export type DealerCustomerSearchResult = {
  customers: DealerCustomer[];
  offset: number;
  limit: number;
  hasMore: boolean;
};

function asCustomer(row: CubeRow): DealerCustomer | null {
  const code = String(row["dealer_plan_order.cust_code"] ?? "").trim();
  if (!code) return null;
  return {
    code,
    name: String(row["dealer_plan_order.cust_name"] ?? code).trim() || code,
  };
}

/**
 * Search the authorized customer list with a bound JDBC parameter. The result
 * stays server-paged, so opening the picker never reads all authorized rows.
 */
export async function loadDealerCustomers(
  search = "",
  offset = 0,
  limit = GEA_CUSTOMER_SEARCH_LIMIT,
  options: DealerDashboardLoadOptions = {},
): Promise<DealerCustomerSearchResult> {
  const safeSearch = search.trim().slice(0, 100);
  const safeOffset = Number.isFinite(offset)
    ? Math.max(0, Math.floor(offset))
    : 0;
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(GEA_CUSTOMER_SEARCH_LIMIT, Math.floor(limit)))
    : GEA_CUSTOMER_SEARCH_LIMIT;
  const exactCustomerCode = options.lockedCustomerCode ?? "";
  const customerScope = exactCustomerCode ? [exactCustomerCode] : [];
  const snapshotRows = options.snapshotDate
    ? []
    : await queryWorkbenchLatestSnapshot(customerScope, options);
  const snapshotDate =
    options.snapshotDate ??
    dateOnly(snapshotRows[0]?.[dealerCubeContract.snapshotDimension]);
  if (!snapshotDate)
    return {
      customers: [],
      offset: safeOffset,
      limit: safeLimit,
      hasMore: false,
    };
  const page = Math.floor(safeOffset / safeLimit);
  const result = await queryWorkbenchCustomers(
    snapshotDate,
    safeSearch,
    exactCustomerCode,
    page,
    safeLimit,
    options,
  );
  const customers = result.records
    .map(asCustomer)
    .filter((value): value is DealerCustomer => Boolean(value));
  return {
    customers,
    offset: safeOffset,
    limit: safeLimit,
    hasMore: safeOffset + customers.length < result.total,
  };
}

function resultStatus(row: CubeRow, context = statusContext()) {
  return rowActionStatus(row, context);
}

function formatMetricValue(metric: DealerMetric, row: CubeRow) {
  const value = numberOf(row[metricMembers[metric]]);
  if (metric === "budget_rate" || metric === "planned_qty_rate")
    return `${(value * 100).toFixed(1)}%`;
  if (metric === "turnover_days" || metric === "stock_age")
    return `${value.toFixed(1)}天`;
  return value.toLocaleString("zh-CN");
}

function resultTableRow(
  row: CubeRow,
  condition?: DealerMetricCondition,
  context = statusContext(),
) {
  return {
    customerCode:
      String(row[dealerCubeContract.customerCodeDimension] ?? "-") || "-",
    customerName:
      String(row[dealerCubeContract.customerNameDimension] ?? "-") || "-",
    materialCode:
      String(row[dealerCubeContract.materialCodeDimension] ?? "-") || "-",
    materialName:
      String(row[dealerCubeContract.materialNameDimension] ?? "-") || "-",
    stock: numberOf(row[`${cube}.stock_qty`]).toLocaleString("zh-CN"),
    target: numberOf(row[`${cube}.target_inventory`]).toLocaleString("zh-CN"),
    preOrder: numberOf(row[`${cube}.pre_order_qty`]).toLocaleString("zh-CN"),
    budget: numberOf(row[`${cube}.budget_amount`]).toLocaleString("zh-CN"),
    budgetRate: formatMetricValue("budget_rate", row),
    plannedQtyRate: formatMetricValue("planned_qty_rate", row),
    shipped: numberOf(row[`${cube}.shipped_qty`]).toLocaleString("zh-CN"),
    inTransit: numberOf(row[`${cube}.in_transit_qty`]).toLocaleString("zh-CN"),
    turnoverDays: formatMetricValue("turnover_days", row),
    averageAge: formatMetricValue("stock_age", row),
    metricValue: condition ? formatMetricValue(condition.metric, row) : "-",
    businessStatus: statusFilterLabel(
      (condition?.statusFilters ?? []).filter(
        (item) =>
          item.exclude || statusMatches(row, item.code, context) === true,
      ),
    ),
    status: resultStatus(row, context),
  };
}

function isMetric(value: unknown): value is DealerMetric {
  return typeof value === "string" && value in metricMembers;
}

function validMetricCondition(value: DealerMetricCondition | undefined) {
  return (
    value === undefined ||
    (isMetric(value.metric) &&
      ["none", "gt", "gte", "lt", "lte", "equals"].includes(value.comparison) &&
      (value.threshold === null ||
        (typeof value.threshold === "number" &&
          Number.isFinite(value.threshold) &&
          value.threshold >= 0)) &&
      (value.stockCondition === "none" ||
        value.stockCondition === "equals_zero") &&
      ["none", "below_target", "above_target"].includes(
        value.inventoryRelation,
      ) &&
      typeof value.replenishmentRequired === "boolean" &&
      typeof value.agingAttentionOnly === "boolean" &&
      (value.orderBlocked === undefined ||
        typeof value.orderBlocked === "boolean") &&
      validStatusFilters(value.statusFilters) &&
      (value.fuseStatus === undefined ||
        value.fuseStatus === "none" ||
        value.fuseStatus === "fused"))
  );
}

function matchesMetricCondition(
  row: CubeRow,
  condition: DealerMetricCondition,
  context = statusContext(),
) {
  if (
    condition.statusFilters?.length &&
    evaluateStatusFilters(row, condition.statusFilters, context) !== true
  )
    return false;
  if (condition.fuseStatus === "fused" && !condition.statusFilters?.length) {
    if (!isFusedSku(row)) return false;
  }
  if (
    condition.stockCondition === "equals_zero" &&
    numberOf(row[`${cube}.stock_qty`]) !== 0
  )
    return false;
  if (condition.comparison !== "none" && condition.threshold !== null) {
    const rawValue = row[metricMembers[condition.metric]];
    if (rawValue === null || rawValue === undefined || rawValue === "")
      return false;
    const value = numberOf(rawValue);
    const comparisons = {
      gt: value > condition.threshold,
      gte: value >= condition.threshold,
      lt: value < condition.threshold,
      lte: value <= condition.threshold,
      equals: value === condition.threshold,
    };
    if (
      !comparisons[
        condition.comparison as Exclude<
          DealerMetricCondition["comparison"],
          "none"
        >
      ]
    )
      return false;
  }
  const stock = numberOf(row[`${cube}.stock_qty`]);
  const rawTarget = row[`${cube}.target_inventory`];
  if (
    condition.inventoryRelation !== "none" &&
    (rawTarget === null || rawTarget === undefined || rawTarget === "")
  )
    return false;
  const target = numberOf(rawTarget);
  if (condition.inventoryRelation === "below_target" && !(stock < target))
    return false;
  if (condition.inventoryRelation === "above_target" && !(stock > target))
    return false;
  if (
    condition.replenishmentRequired &&
    !(numberOf(row[`${cube}.pre_order_qty`]) > 0)
  )
    return false;
  if (
    condition.agingAttentionOnly &&
    !/风险|异常|待核查|需核查/.test(
      String(row[dealerCubeContract.stockAgeStatusDimension] ?? ""),
    )
  )
    return false;
  if (
    condition.orderBlocked &&
    statusMatches(row, "action_blocked", context) !== true
  )
    return false;
  return true;
}

function validDetailScope(value: DealerDetailScope) {
  return (
    /^20\d{2}-\d{2}-\d{2}$/.test(value.snapshotDate) &&
    (value.planMonth === undefined ||
      value.planMonth === "" ||
      /^20\d{2}-\d{2}$/.test(value.planMonth)) &&
    (value.mode === "detail" || value.mode === "aggregate") &&
    (value.mode === "detail" ||
      value.groupBy === "客户" ||
      value.groupBy === "SKU") &&
    (value.orderBy === "preOrder" ||
      value.orderBy === "stockAge" ||
      value.orderBy === "metric") &&
    (value.stockCondition === undefined ||
      value.stockCondition === "none" ||
      value.stockCondition === "equals_zero") &&
    validMetricCondition(value.metricCondition) &&
    Array.isArray(value.customerCodes) &&
    value.customerCodes.length <= dealerCubeContract.maxCustomerLookupRows &&
    value.customerCodes.every(
      (code) => typeof code === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(code),
    ) &&
    (!value.materialCode ||
      (typeof value.materialCode === "string" &&
        /^[A-Za-z0-9_-]{1,64}$/.test(value.materialCode)))
  );
}

/** Read one result-table page using the exact scope recorded by the Agent. */
export async function loadDealerResultPage(
  scope: DealerDetailScope,
  page: number,
  pageSize: number,
) {
  if (!validDetailScope(scope)) throw new Error("结果查询范围无效");
  const authorizedCustomerCodes = await assertAuthorizedSqlCustomerCodes(
    scope.customerCodes,
  );
  const safePage = Math.max(0, Math.floor(page));
  const safePageSize = Math.min(200, Math.max(1, Math.floor(pageSize)));
  const needsInMemoryFilter =
    scope.stockCondition === "equals_zero" ||
    scope.metricCondition !== undefined;
  const sqlOrderColumn =
    scope.orderBy === "stockAge"
      ? "avg_stock_age"
      : scope.orderBy === "metric" && scope.metricCondition
        ? metricSqlColumns[scope.metricCondition.metric]
        : "pre_order_qty";
  const query = dealerWorkbenchSql.result({
    snapshotDate: scope.snapshotDate,
    planMonth: scope.planMonth,
    customerCodes: authorizedCustomerCodes,
    materialCode: scope.materialCode,
    mode: scope.mode,
    groupBy: scope.groupBy,
    orderColumn: sqlOrderColumn,
  });
  const context = statusContext();
  const rows = needsInMemoryFilter
    ? (await queryAllWorkbenchSqlRows(query)).filter((row) =>
        scope.metricCondition
          ? matchesMetricCondition(row, scope.metricCondition, context)
          : numberOf(row[`${cube}.stock_qty`]) === 0,
      )
    : (await queryWorkbenchSqlPage(query, safePage, safePageSize)).records;
  // 主粒度去重：明细模式按 snapshot+cust+material+plan_month 保留最新记录，
  // 与 Agent 侧 workspace 的口径一致；汇总模式行已由 Cube 聚合，不再重复。
  const deduped = scope.mode === "detail" ? dedupeRows(rows).rows : rows;
  const pageRows = needsInMemoryFilter
    ? deduped.slice(safePage * safePageSize, (safePage + 1) * safePageSize)
    : deduped;
  return {
    page: safePage,
    pageSize: safePageSize,
    rows: pageRows.map((row) =>
      resultTableRow(row, scope.metricCondition, context),
    ),
  };
}

export async function loadDealerDashboard(
  customerCode?: string,
  options: DealerDashboardLoadOptions = {},
) {
  const measure = async <T>(
    stage: string,
    task: () => Promise<T>,
  ): Promise<T> => {
    const start = performance.now();
    try {
      return await task();
    } finally {
      options.onTiming?.(stage, performance.now() - start);
    }
  };
  const fuseRuleConfig = loadBizRuleFile("fuse-rules");
  const exceptionRuleConfig = loadBizRuleFile("exceptions");
  const fuseRules = loadFuseRules(fuseRuleConfig);
  const filterLabels = loadFilterLabels();
  const metricCards = loadMetricCards();
  const stockHealth = loadStockHealth();
  const customerBootstrapLimit = GEA_CUSTOMER_BOOTSTRAP_LIMIT;
  const effectiveCustomerCode = customerCode;
  let requestedScope = customerCode ? "single" : (options.scope ?? "single");
  const knownScope = Boolean(
    effectiveCustomerCode || requestedScope !== "single",
  );
  const metadataCodes =
    options.overviewCustomerCodes ??
    (effectiveCustomerCode ? [effectiveCustomerCode] : []);
  const pinnedSnapshot =
    options.tabDataOnly &&
    options.snapshotDate &&
    /^20\d{2}-\d{2}-\d{2}$/.test(options.snapshotDate)
      ? options.snapshotDate
      : undefined;
  const pinnedMonth =
    pinnedSnapshot &&
    options.planMonth &&
    /^20\d{2}-\d{2}$/.test(options.planMonth)
      ? options.planMonth
      : undefined;
  const combinedMetadata = Boolean(
    options.stockTab && knownScope && !pinnedSnapshot,
  );
  const snapshotRows = pinnedSnapshot
    ? [{ [dealerCubeContract.snapshotDimension]: pinnedSnapshot }]
    : await measure("snapshot", () =>
        combinedMetadata
          ? queryWorkbenchSnapshotMonths(metadataCodes, options)
          : queryWorkbenchLatestSnapshot(metadataCodes, options),
      );
  const snapshotDate = dateOnly(
    snapshotRows[0]?.[dealerCubeContract.snapshotDimension],
  );
  if (!snapshotDate) {
    return {
      customers: [] as DealerCustomer[],
      customerTotal: 0,
      customerSummaries: [] as DealerCustomerInventorySummary[],
      customerSummaryTotal: 0,
      customerPage: 0,
      customerPageSize: 10,
      categorySummaries: [] as DealerCategoryInventorySummary[],
      shortageRecords: [] as DealerDashboardRecord[],
      shortageTotal: 0,
      shortagePage: 0,
      shortagePageSize: 10,
      activeCustomerCode: null,
      scope: requestedScope,
      scopeCustomerCodes: [] as string[],
      snapshotDate: null,
      planMonth: null,
      records: [] as DealerDashboardRecord[],
      companyProductRecords: [] as DealerDashboardRecord[],
      recordTotal: 0,
      summary: null as DealerDashboardSummary | null,
      inventoryDailySummary: null as DealerInventoryDailySummary | null,
      dailyInventoryCoverageComplete: false,
      fuseRules,
      filterLabels,
      metricCards,
      stockHealth,
      dedupedRows: 0,
    };
  }
  // 已明确客户或全部范围时，客户目录与月份列表只依赖同一个快照。
  const metadataMonths = pinnedMonth
    ? [{ [planMonthDimension]: pinnedMonth }]
    : combinedMetadata
      ? snapshotRows.filter(
          (row) =>
            dateOnly(row[dealerCubeContract.snapshotDimension]) ===
            snapshotDate,
        )
      : null;
  // The daily snapshot and full daily totals do not depend on plan-order details.
  const earlyDailySnapshot = knownScope
    ? measure("daily_snapshot", () =>
        options.tabDataOnly && options.inventoryDailyStatDate
          ? Promise.resolve([
              {
                "dealer_inventory_daily.stat_date":
                  options.inventoryDailyStatDate,
              },
            ])
          : queryWorkbenchLatestInventoryDailySnapshot(metadataCodes, options),
      )
    : null;
  const earlyDailySummary = earlyDailySnapshot?.then((rows) => {
    const date = dateOnly(rows[0]?.["dealer_inventory_daily.stat_date"]);
    return date && !options.companyProductsOnly && !options.tabDataOnly
      ? measure("daily_summary", () =>
          queryWorkbenchInventoryDailySummary(date, metadataCodes, options),
        )
      : ({} as CubeRow);
  });
  // Join below; attach a handler now so an earlier independent failure cannot leak a rejection.
  earlyDailySummary?.catch(() => {});
  const customerQuery = measure("customers", () =>
    queryWorkbenchCustomers(
      snapshotDate,
      "",
      effectiveCustomerCode ?? "",
      0,
      customerBootstrapLimit,
      options,
    ),
  );
  const [customerResult, selectedMonthRows] =
    effectiveCustomerCode || requestedScope !== "single"
      ? await Promise.all([
          customerQuery,
          metadataMonths
            ? Promise.resolve(metadataMonths)
            : measure("months", () =>
                queryWorkbenchPlanMonths(snapshotDate, metadataCodes, options),
              ),
        ])
      : [await customerQuery, null];
  const authorizedCustomers = customerResult.records
    .map(asCustomer)
    .filter((value): value is DealerCustomer => Boolean(value));
  const customers = authorizedCustomers;
  const autoSelectedCustomer = Boolean(
    options.autoSelectOnlyCustomer &&
    requestedScope !== "single" &&
    !options.overviewOnly &&
    !options.overviewCustomerCodes &&
    customerResult.total === 1 &&
    customers.length === 1,
  );
  if (autoSelectedCustomer) {
    requestedScope = "single";
  }
  const activeCustomerCode =
    effectiveCustomerCode &&
    customers.some((item) => item.code === effectiveCustomerCode)
      ? effectiveCustomerCode
      : (customers[0]?.code ?? null);
  if (!activeCustomerCode) {
    return {
      customers,
      customerTotal: customerResult.total,
      customerSummaries: [] as DealerCustomerInventorySummary[],
      customerSummaryTotal: 0,
      customerPage: 0,
      customerPageSize: 10,
      categorySummaries: [] as DealerCategoryInventorySummary[],
      shortageRecords: [] as DealerDashboardRecord[],
      shortageTotal: 0,
      shortagePage: 0,
      shortagePageSize: 10,
      activeCustomerCode: null,
      scope: requestedScope,
      scopeCustomerCodes: [] as string[],
      snapshotDate,
      planMonth: null,
      records: [] as DealerDashboardRecord[],
      companyProductRecords: [] as DealerDashboardRecord[],
      recordTotal: 0,
      summary: null as DealerDashboardSummary | null,
      inventoryDailySummary: null as DealerInventoryDailySummary | null,
      dailyInventoryCoverageComplete: false,
      fuseRules,
      filterLabels,
      metricCards,
      stockHealth,
      dedupedRows: 0,
    };
  }
  const scopedCustomerCodes = options.overviewCustomerCodes
    ? options.overviewCustomerCodes
    : requestedScope === "sales" || requestedScope === "all"
      ? []
      : [activeCustomerCode];
  const monthRows = selectedMonthRows
    ? selectedMonthRows
    : await measure("months", () =>
        queryWorkbenchPlanMonths(snapshotDate, scopedCustomerCodes, options),
      );
  const months = monthRows
    .map((row) => planMonthOf(row[planMonthDimension]))
    .filter((value): value is string => Boolean(value));
  const nowMonth = new Date().toISOString().slice(0, 7);
  const planMonth = options.planMonth
    ? months.includes(options.planMonth)
      ? options.planMonth
      : null
    : months.includes(nowMonth)
      ? nowMonth
      : (months[0] ?? null);
  if (!planMonth) {
    return {
      customers,
      customerTotal: customerResult.total,
      customerSummaries: [] as DealerCustomerInventorySummary[],
      customerSummaryTotal: 0,
      customerPage: 0,
      customerPageSize: 10,
      categorySummaries: [] as DealerCategoryInventorySummary[],
      shortageRecords: [] as DealerDashboardRecord[],
      shortageTotal: 0,
      shortagePage: 0,
      shortagePageSize: 10,
      activeCustomerCode,
      scope: requestedScope,
      scopeCustomerCodes: scopedCustomerCodes,
      snapshotDate,
      planMonth: null,
      records: [] as DealerDashboardRecord[],
      companyProductRecords: [] as DealerDashboardRecord[],
      recordTotal: 0,
      summary: null as DealerDashboardSummary | null,
      inventoryDailySummary: null as DealerInventoryDailySummary | null,
      dailyInventoryCoverageComplete: false,
      fuseRules,
      filterLabels,
      metricCards,
      stockHealth,
      dedupedRows: 0,
    };
  }

  // 页签只读取自己的明细，顶部指标仍使用全范围汇总。下载保留完整数据。
  const stockTab = options.companyProductsOnly
    ? "sku"
    : options.exportTab
      ? undefined
      : options.stockTab;
  const readSku =
    !options.overviewOnly &&
    (!stockTab || stockTab === "sku" || stockTab === "expiry");
  const readCustomers =
    !options.overviewOnly &&
    !options.companyProductsOnly &&
    (!stockTab || stockTab === "customer");
  const readCategory =
    !options.overviewOnly &&
    !options.companyProductsOnly &&
    (!stockTab || stockTab === "category" || stockTab === "sku");
  const readShortage =
    !options.overviewOnly &&
    !options.companyProductsOnly &&
    (!stockTab || stockTab === "shortage");
  const detailPage = Number.isFinite(options.detailPage)
    ? Math.max(0, Math.floor(options.detailPage ?? 0))
    : 0;
  const detailPageSize = Number.isFinite(options.detailPageSize)
    ? Math.max(
        1,
        Math.min(
          200,
          Math.floor(options.detailPageSize ?? GEA_DASHBOARD_INITIAL_ROW_LIMIT),
        ),
      )
    : GEA_DASHBOARD_INITIAL_ROW_LIMIT;
  const customerPage = Number.isFinite(options.customerPage)
    ? Math.max(0, Math.floor(options.customerPage ?? 0))
    : 0;
  const customerPageSize = Number.isFinite(options.customerPageSize)
    ? Math.max(1, Math.min(100, Math.floor(options.customerPageSize ?? 10)))
    : 10;
  const shortagePage = Number.isFinite(options.shortagePage)
    ? Math.max(0, Math.floor(options.shortagePage ?? 0))
    : 0;
  const shortagePageSize = Number.isFinite(options.shortagePageSize)
    ? Math.max(1, Math.min(100, Math.floor(options.shortagePageSize ?? 10)))
    : 10;
  const includeCompanyProducts = Boolean(
    options.includeCompanyProducts &&
    requestedScope === "single" &&
    scopedCustomerCodes.length === 1,
  );
  const fullSkuDetails =
    options.exportTab === "expiry" ||
    stockTab === "expiry" ||
    options.exportTab === "sku" ||
    Boolean(
      options.companyProductsOnly && options.companyProductFilters?.download,
    );
  const customerPageResultPromise = !readCustomers
    ? Promise.resolve({ records: [] as CubeRow[], total: customerResult.total })
    : customerPage === 0 && customerPageSize === customerBootstrapLimit
      ? Promise.resolve(customerResult)
      : measure("customers", () =>
          queryWorkbenchCustomers(
            snapshotDate,
            "",
            "",
            customerPage,
            customerPageSize,
            options,
          ),
        );
  const dailySnapshotPromise =
    (autoSelectedCustomer ? null : earlyDailySnapshot) ??
    measure("daily_snapshot", () =>
      queryWorkbenchLatestInventoryDailySnapshot(scopedCustomerCodes, options),
    );
  const categorySummaryPromise = dailySnapshotPromise.then((snapshotRows) => {
    const inventoryDailyStatDate = dateOnly(
      snapshotRows[0]?.["dealer_inventory_daily.stat_date"],
    );
    return inventoryDailyStatDate && readCategory
      ? measure("category", () =>
          queryWorkbenchCategorySummaries(
            snapshotDate,
            planMonth,
            inventoryDailyStatDate,
            scopedCustomerCodes,
            options,
          ),
        )
      : ([] as CubeRow[]);
  });
  const [
    detailResult,
    summaryRow,
    customerSummaryResult,
    customerPageResult,
    inventoryDailySnapshotRows,
    shortageResult,
    categorySummaryRows,
  ] = await Promise.all([
    readSku
      ? dailySnapshotPromise.then((snapshotRows) =>
          measure("details", () =>
            queryWorkbenchDashboard(
              snapshotDate,
              planMonth,
              scopedCustomerCodes,
              detailPage,
              detailPageSize,
              stockTab === "expiry"
                ? { ...options, exportTab: "expiry" }
                : options,
              dateOnly(snapshotRows[0]?.["dealer_inventory_daily.stat_date"]),
              options.companyProductsOnly
                ? options.companyProductFilters || {}
                : undefined,
            ),
          ),
        )
      : Promise.resolve({ records: [] as CubeRow[], total: 0 }),
    options.companyProductsOnly || options.tabDataOnly
      ? Promise.resolve({} as CubeRow)
      : measure("summary", () =>
          queryWorkbenchSummary(
            snapshotDate,
            planMonth,
            scopedCustomerCodes,
            options,
          ),
        ),
    !readCustomers
      ? Promise.resolve({ records: [] as CubeRow[], total: 0 })
      : measure("customer_summary", () =>
          queryWorkbenchCustomerSummaries(
            snapshotDate,
            planMonth,
            scopedCustomerCodes,
            customerPage,
            customerPageSize,
            options,
          ),
        ),
    customerPageResultPromise,
    dailySnapshotPromise,
    !readShortage
      ? Promise.resolve({ records: [] as CubeRow[], total: 0 })
      : measure("shortage", () =>
          queryWorkbenchShortageDetails(
            snapshotDate,
            planMonth,
            scopedCustomerCodes,
            shortagePage,
            shortagePageSize,
            options,
          ),
        ),
    categorySummaryPromise,
  ]);
  const rows = detailResult.records;
  const shortageRows = shortageResult.records;

  const inventoryDailyStatDate = dateOnly(
    inventoryDailySnapshotRows[0]?.["dealer_inventory_daily.stat_date"],
  );
  const dailyKeysFor = (sourceRows: CubeRow[]) => {
    const seen = new Set<string>();
    return sourceRows
      .map((row) => ({
        customerCode: String(row["dealer_plan_order.cust_code"] ?? "").trim(),
        materialCode: String(
          row["dealer_plan_order.material_code"] ?? "",
        ).trim(),
      }))
      .filter((key) => {
        const id = JSON.stringify([key.customerCode, key.materialCode]);
        if (!key.customerCode || !key.materialCode || seen.has(id))
          return false;
        seen.add(id);
        return true;
      });
  };
  const inventoryDailyKeys = fullSkuDetails ? [] : dailyKeysFor(rows);
  const shortageInventoryDailyKeys =
    options.exportTab === "shortage" ? [] : dailyKeysFor(shortageRows);
  const dailyCustomerCodes = (
    options.exportTab === "customer"
      ? customerSummaryResult.records
      : customerPageResult.records
  )
    .map((row) => String(row["dealer_plan_order.cust_code"] ?? "").trim())
    .filter(Boolean);
  const [
    inventoryDailyRows,
    inventoryDailySummaryRow,
    inventoryDailyCustomerRows,
    shortageInventoryDailyRows,
  ] = inventoryDailyStatDate
    ? await Promise.all([
        !readSku
          ? Promise.resolve([] as CubeRow[])
          : measure("daily_details", () =>
              queryWorkbenchInventoryDailyDetails(
                inventoryDailyStatDate,
                inventoryDailyKeys,
                options,
                fullSkuDetails ? scopedCustomerCodes : undefined,
              ),
            ),
        (autoSelectedCustomer ? null : earlyDailySummary) ??
          (options.companyProductsOnly || options.tabDataOnly
            ? Promise.resolve({} as CubeRow)
            : measure("daily_summary", () =>
                queryWorkbenchInventoryDailySummary(
                  inventoryDailyStatDate,
                  scopedCustomerCodes,
                  options,
                ),
              )),
        !readCustomers
          ? Promise.resolve([] as CubeRow[])
          : measure("daily_customers", () =>
              queryWorkbenchInventoryDailyCustomerSummaries(
                inventoryDailyStatDate,
                dailyCustomerCodes,
                options,
              ),
            ),
        !readShortage
          ? Promise.resolve([] as CubeRow[])
          : measure("shortage_daily", () =>
              queryWorkbenchInventoryDailyDetails(
                inventoryDailyStatDate,
                shortageInventoryDailyKeys,
                options,
                options.exportTab === "shortage"
                  ? scopedCustomerCodes
                  : undefined,
              ),
            ),
      ])
    : [[], {} as CubeRow, [] as CubeRow[], [] as CubeRow[]];
  if (
    includeCompanyProducts &&
    (rows.some(
      (row) =>
        String(row["dealer_plan_order.cust_code"] ?? "").trim() !==
        activeCustomerCode,
    ) ||
      inventoryDailyRows.some(
        (row) =>
          String(row["dealer_inventory_daily.cust_code"] ?? "").trim() !==
          activeCustomerCode,
      ))
  )
    throw new GeaSqlApiError(
      "商品客户范围不匹配",
      "COMPANY_PRODUCT_SCOPE_FORBIDDEN",
      403,
      false,
    );
  const inventoryDailyBySku = new Map(
    [...inventoryDailyRows, ...shortageInventoryDailyRows].map((row) => [
      `${String(row["dealer_inventory_daily.cust_code"] ?? "").trim()}|${String(row["dealer_inventory_daily.material_code"] ?? "").trim()}`,
      row,
    ]),
  );
  const dailyRowCount = numberOf(inventoryDailySummaryRow.row_count);
  const dailyCustomerCount = numberOf(inventoryDailySummaryRow.customer_count);
  const expectedCustomerCount =
    scopedCustomerCodes.length || customerResult.total;
  const dailyInventoryCoverageComplete =
    dailyRowCount > 0 && dailyCustomerCount >= expectedCustomerCount;
  const completeCount = (field: string) =>
    dailyRowCount > 0 &&
    numberOf(inventoryDailySummaryRow[field]) === dailyRowCount;
  const coverageRatio = (field: string) =>
    dailyRowCount > 0
      ? numberOf(inventoryDailySummaryRow[field]) / dailyRowCount
      : 0;
  const inventoryDailySummary: DealerInventoryDailySummary | null =
    inventoryDailyStatDate && dailyRowCount > 0
      ? {
          noSalesSkuCount: dailyInventoryCoverageComplete
            ? nullableNumber(inventoryDailySummaryRow.no_sales_sku_count)
            : null,
          statDate: inventoryDailyStatDate,
          inventoryDateLabel: inventoryDateLabel(
            dateOnly(inventoryDailySummaryRow.earliest_inventory_date),
            dateOnly(inventoryDailySummaryRow.latest_inventory_date),
            numberOf(inventoryDailySummaryRow.missing_inventory_date_count),
          ),
          rowCount: dailyRowCount,
          customerCount: dailyCustomerCount,
          coverageComplete: dailyInventoryCoverageComplete,
          stockQtyComplete: completeCount("stock_qty_present"),
          inTransitQtyComplete: completeCount("in_transit_qty_present"),
          normalStockQtyComplete: completeCount("normal_stock_qty_present"),
          stockAmountComplete: completeCount("stock_amount_present"),
          sales7Complete: completeCount("sales_qty_7days_present"),
          sales7DailyAverageComplete: completeCount(
            "sales_qty_7days_avg_present",
          ),
          sales30Complete: completeCount("sales_qty_30days_present"),
          sales30DailyAverageComplete: completeCount(
            "sales_qty_30days_avg_present",
          ),
          salesAmount30Complete: completeCount("sales_amount_30days_present"),
          sales7Coverage: coverageRatio("sales_qty_7days_present"),
          sales30Coverage: coverageRatio("sales_qty_30days_present"),
          salesAmount30Coverage: coverageRatio("sales_amount_30days_present"),
          normalStockCoverage: coverageRatio("normal_stock_qty_present"),
          stockAmountCoverage: coverageRatio("stock_amount_present"),
          inventory: numberOf(inventoryDailySummaryRow.stock_qty),
          inTransit: numberOf(inventoryDailySummaryRow.in_transit_qty),
          normalInventory: numberOf(inventoryDailySummaryRow.normal_stock_qty),
          stockAmount: numberOf(inventoryDailySummaryRow.stock_amount),
          sales7: numberOf(inventoryDailySummaryRow.sales_qty_7days),
          sales7DailyAverage: numberOf(
            inventoryDailySummaryRow.sales_qty_7days_avg,
          ),
          sales30: numberOf(inventoryDailySummaryRow.sales_qty_30days),
          sales30DailyAverage: numberOf(
            inventoryDailySummaryRow.sales_qty_30days_avg,
          ),
          salesAmount30: numberOf(inventoryDailySummaryRow.sales_amount_30days),
          salesAmount30DailyAverage: numberOf(
            inventoryDailySummaryRow.sales_amount_30days_avg,
          ),
        }
      : null;

  const {
    rows: deduped,
    dropped: dedupedRows,
    duplicateKeys,
  } = dedupeRows(rows);
  const toDashboardRecord = (row: CubeRow): DealerDashboardRecord => {
    const dailyRow = inventoryDailyBySku.get(
      `${String(row["dealer_plan_order.cust_code"] ?? "").trim()}|${String(row["dealer_plan_order.material_code"] ?? "").trim()}`,
    );
    return {
      id: `${row["dealer_plan_order.cust_code"] ?? "-"}-${row["dealer_plan_order.material_code"] ?? "-"}-${planMonthOf(row[planMonthDimension]) ?? "-"}`,
      recordCount: numberOf(row["dealer_plan_order.record_count"]),
      planMonth: planMonthOf(row[planMonthDimension]),
      sourceLoadTime: String(row[sourceLoadTimeDimension] ?? "").trim() || null,
      updatedTime: String(row[updatedTimeDimension] ?? "").trim() || null,
      customerCode: String(row["dealer_plan_order.cust_code"] ?? ""),
      customerName: String(row["dealer_plan_order.cust_name"] ?? ""),
      materialCode: String(row["dealer_plan_order.material_code"] ?? ""),
      materialName: String(row["dealer_plan_order.material_name"] ?? ""),
      productCategory:
        String(row[dealerCubeContract.productCategoryDimension] ?? "").trim() ||
        null,
      budget: numberOf(row["dealer_plan_order.budget_amount"]),
      shipped: numberOf(row["dealer_plan_order.shipped_qty"]),
      inTransit: numberOf(row["dealer_plan_order.in_transit_qty"]),
      inventory: nullableNumber(row["dealer_plan_order.stock_qty"]),
      turnoverDays: nullableNumber(
        row["dealer_plan_order.average_turnover_days"],
      ),
      targetInventory: nullableNumber(
        row["dealer_plan_order.target_inventory"],
      ),
      averageAge: nullableNumber(row["dealer_plan_order.average_stock_age"]),
      agingStatus:
        String(
          row["dealer_plan_order.stock_age_turnover_status"] ?? "",
        ).trim() || null,
      suggestedQuantity: numberOf(row["dealer_plan_order.pre_order_qty"]),
      publishedInTransit: nullableNumber(
        row["dealer_plan_order.in_transit_qty"],
      ),
      publishedSuggestedQuantity: nullableNumber(
        row["dealer_plan_order.pre_order_qty"],
      ),
      budgetRate: nullableNumber(row["dealer_plan_order.average_budget_rate"]),
      plannedQtyRate: nullableNumber(
        row["dealer_plan_order.average_planned_qty_rate"],
      ),
      dataIssues: dataIssuesFor(
        row,
        duplicateKeys.has(mainGrainKey(row)),
      ).concat(dailyInventoryDataIssuesFor(dailyRow)),
      fuseRules: fuseRulesFor(
        {
          customerCode: String(row["dealer_plan_order.cust_code"] ?? "").trim(),
          materialCode: String(
            row["dealer_plan_order.material_code"] ?? "",
          ).trim(),
        },
        fuseRuleConfig,
      ),
      orderException: orderExceptionFor(
        {
          customerCode: String(row["dealer_plan_order.cust_code"] ?? "").trim(),
          materialCode: String(
            row["dealer_plan_order.material_code"] ?? "",
          ).trim(),
        },
        exceptionRuleConfig,
      ),
      plannedQty: nullableNumber(row["dealer_plan_order.planned_qty"]),
      dailySales: nullableNumber(row["dealer_plan_order.daily_sales"]),
      shipAmount: numberOf(row["dealer_plan_order.ship_amount"]),
      unshipQty: numberOf(row["dealer_plan_order.unship_qty"]),
      unshipAmount: numberOf(row["dealer_plan_order.unship_amount"]),
      totalQty: numberOf(row["dealer_plan_order.total_qty"]),
      totalAmount: numberOf(row["dealer_plan_order.total_amount"]),
      labelTurnoverDays: nullableNumber(
        row["dealer_plan_order.label_turnover_days"],
      ),
      inventorySource:
        String(row["dealer_plan_order.inventory_source"] ?? "").trim() || null,
      inventoryDailyStatDate: dateOnly(
        dailyRow?.["dealer_inventory_daily.stat_date"],
      ),
      inventorySnapshotDate: dateOnly(
        dailyRow?.["dealer_inventory_daily.inventory_snapshot_date"],
      ),
      actualInventory: nullableNumber(
        dailyRow?.["dealer_inventory_daily.stock_qty"],
      ),
      actualInTransit: nullableNumber(
        dailyRow?.["dealer_inventory_daily.in_transit_qty"],
      ),
      normalInventory: nullableNumber(
        dailyRow?.["dealer_inventory_daily.normal_stock_qty"],
      ),
      stockAmount: nullableNumber(
        dailyRow?.["dealer_inventory_daily.stock_amount"],
      ),
      sales7: nullableNumber(
        dailyRow?.["dealer_inventory_daily.sales_qty_7days"],
      ),
      sales7DailyAverage: nullableNumber(
        dailyRow?.["dealer_inventory_daily.sales_qty_7days_avg"],
      ),
      sales30: nullableNumber(
        dailyRow?.["dealer_inventory_daily.sales_qty_30days"],
      ),
      sales30DailyAverage: nullableNumber(
        dailyRow?.["dealer_inventory_daily.sales_qty_30days_avg"],
      ),
      salesAmount30: nullableNumber(
        dailyRow?.["dealer_inventory_daily.sales_amount_30days"],
      ),
      salesAmount30DailyAverage: nullableNumber(
        dailyRow?.["dealer_inventory_daily.sales_amount_30days_avg"],
      ),
      productRange:
        String(
          dailyRow?.["dealer_inventory_daily.product_range_name"] ?? "",
        ).trim() || null,
      productTag:
        String(
          options.companyProductsOnly
            ? (row.catalog_product_tag ?? "")
            : (dailyRow?.["dealer_inventory_daily.product_tag"] ?? ""),
        ).trim() || null,
      materialSize:
        String(
          dailyRow?.["dealer_inventory_daily.material_size"] ?? "",
        ).trim() || null,
      cifPrice: nullableNumber(dailyRow?.["dealer_inventory_daily.cif_price"]),
      inventoryDailySource:
        String(
          dailyRow?.["dealer_inventory_daily.inventory_source"] ?? "",
        ).trim() || null,
    };
  };
  const records = deduped
    .map(toDashboardRecord)
    .sort(
      (left, right) =>
        right.suggestedQuantity - left.suggestedQuantity ||
        right.shipped - left.shipped ||
        right.inTransit - left.inTransit ||
        left.materialCode.localeCompare(right.materialCode),
    );
  const shortageRecords = dedupeRows(shortageRows).rows.map(toDashboardRecord);
  const ageWeight = numberOf(summaryRow.stock_age_weight);
  const summary: DealerDashboardSummary | null =
    options.tabDataOnly || options.companyProductsOnly
      ? null
      : {
          nearExpirySkuCount: nullableNumber(summaryRow.near_expiry_sku_count),
          skuCount: numberOf(summaryRow.sku_count),
          reasonableSkuCount: numberOf(summaryRow.reasonable_sku_count),
          unreasonableSkuCount: numberOf(summaryRow.unreasonable_sku_count),
          shortageSkuCount: numberOf(summaryRow.shortage_sku_count),
          coveredSkuCount: numberOf(summaryRow.covered_sku_count),
          budget: nullableNumber(summaryRow.budget_amount),
          shipAmount: nullableNumber(summaryRow.ship_amount),
          shipped: numberOf(summaryRow.shipped_qty),
          inTransit: numberOf(summaryRow.in_transit_qty),
          inventory: numberOf(summaryRow.stock_qty),
          targetInventory: numberOf(summaryRow.target_inventory),
          suggestedQuantity: numberOf(summaryRow.pre_order_qty),
          dailySales: numberOf(summaryRow.daily_sales),
          averageAge:
            ageWeight > 0
              ? numberOf(summaryRow.stock_age_weighted_sum) / ageWeight
              : null,
        };
  const inventorySummaryByCustomer = new Map(
    customerSummaryResult.records.map((row) => [
      String(row["dealer_plan_order.cust_code"] ?? ""),
      row,
    ]),
  );
  const inventoryDailySummaryByCustomer = new Map(
    inventoryDailyCustomerRows.map((row) => [
      String(row["dealer_inventory_daily.cust_code"] ?? ""),
      row,
    ]),
  );
  const customerSummaries: DealerCustomerInventorySummary[] =
    customerPageResult.records
      .map(asCustomer)
      .filter((value): value is DealerCustomer => Boolean(value))
      .map((customer) => {
        const row = inventorySummaryByCustomer.get(customer.code);
        const dailyRow = inventoryDailySummaryByCustomer.get(customer.code);
        const dailyRowCount = numberOf(dailyRow?.row_count);
        const dailyInventory =
          dailyRowCount > 0 &&
          numberOf(dailyRow?.stock_qty_present) === dailyRowCount
            ? nullableNumber(dailyRow?.["dealer_inventory_daily.stock_qty"])
            : null;
        const dailyInTransit =
          dailyRowCount > 0 &&
          numberOf(dailyRow?.in_transit_qty_present) === dailyRowCount
            ? nullableNumber(
                dailyRow?.["dealer_inventory_daily.in_transit_qty"],
              )
            : null;
        return {
          code: customer.code,
          name: customer.name,
          hasInventoryData: Boolean(row || dailyRow),
          skuCount: numberOf(row?.sku_count),
          inventory:
            dailyInventory ?? numberOf(row?.["dealer_plan_order.stock_qty"]),
          inTransit:
            dailyInTransit ??
            numberOf(row?.["dealer_plan_order.in_transit_qty"]),
          normalInventory: nullableNumber(
            dailyRow?.["dealer_inventory_daily.normal_stock_qty"],
          ),
          stockAmount: nullableNumber(
            dailyRow?.["dealer_inventory_daily.stock_amount"],
          ),
          dailyRowCount,
          normalStockCoverage:
            dailyRowCount > 0
              ? numberOf(dailyRow?.normal_stock_qty_present) / dailyRowCount
              : 0,
          stockAmountCoverage:
            dailyRowCount > 0
              ? numberOf(dailyRow?.stock_amount_present) / dailyRowCount
              : 0,
          targetInventory: numberOf(
            row?.["dealer_plan_order.target_inventory"],
          ),
          suggestedQuantity: numberOf(row?.["dealer_plan_order.pre_order_qty"]),
        };
      });
  const categorySummaries: DealerCategoryInventorySummary[] =
    categorySummaryRows.map((row) => ({
      riskInventory: nullableNumber(row.category_actual_stock_qty),
      riskTransit: nullableNumber(row.category_actual_transit_qty),
      riskDataComplete:
        numberOf(row.sku_count) > 0 &&
        nullableNumber(row.category_risk_valid_count) ===
          numberOf(row.sku_count),
      category:
        String(row[dealerCubeContract.productCategoryDimension] ?? "").trim() ||
        "未分类",
      skuCount: numberOf(row.sku_count),
      inventory: numberOf(row["dealer_plan_order.stock_qty"]),
      inTransit: numberOf(row["dealer_plan_order.in_transit_qty"]),
      normalInventory: nullableNumber(row.category_normal_stock_qty),
      sales30: nullableNumber(row.category_sales_qty_30days),
      stockAmount: nullableNumber(row.category_stock_amount),
      dailyMatchedSkuCount: numberOf(row.daily_matched_sku_count),
      targetInventory: numberOf(row["dealer_plan_order.target_inventory"]),
    }));
  return {
    customers,
    customerTotal: customerResult.total,
    customerSummaries,
    customerSummaryTotal: customerPageResult.total,
    customerPage,
    customerPageSize,
    categorySummaries,
    shortageRecords,
    shortageTotal: readShortage
      ? shortageResult.total
      : numberOf(summaryRow.shortage_sku_count),
    shortagePage,
    shortagePageSize,
    activeCustomerCode,
    scope: requestedScope,
    scopeCustomerCodes: scopedCustomerCodes,
    snapshotDate,
    planMonth,
    records,
    companyProductRecords: includeCompanyProducts ? records : [],
    recordTotal: readSku ? detailResult.total : numberOf(summaryRow.sku_count),
    summary,
    inventoryDailySummary,
    dailyInventoryCoverageComplete,
    fuseRules,
    filterLabels,
    metricCards,
    stockHealth,
    dedupedRows,
  };
}

function ageRowsFromCube(
  rows: CubeRow[],
  source: DealerAgingRow["source"],
): DealerAgingRow[] {
  const prefix =
    source === "文沥/D-Link"
      ? "dealer_wl_stock_age"
      : "dealer_simulated_stock_age";
  return rows.map((row) => {
    const statDate = dateOnly(row[`${prefix}.stat_date`]);
    const produceDate = dateOnly(row[`${prefix}.produce_date`]);
    return {
      source,
      statDate,
      produceDate,
      batchNo: String(row[`${prefix}.batch_no`] ?? "").trim() || null,
      shipType: String(row[`${prefix}.ship_type`] ?? "").trim() || null,
      ageDays: ageInDays(statDate, produceDate),
      stockQty: numberOf(row[`${prefix}.stock_qty`]),
      finalQty: numberOf(row[`${prefix}.final_qty`]),
    };
  });
}

export async function loadDealerAging(
  customerCode: string,
  materialCode: string,
  inventorySource?: string | null,
) {
  await assertAuthorizedSqlCustomerCodes([customerCode]);
  const source = String(inventorySource ?? "").trim();
  const isWenli = /文沥|D-Link|dlink/i.test(source);
  const isSimulated = /提报|推演|库存推演/i.test(source);
  if (isWenli && !isSimulated) {
    const rows = await queryWorkbenchAging("wl", customerCode, materialCode);
    return {
      sourceUnknown: false,
      rows: withRatio(ageRowsFromCube(rows, "文沥/D-Link")),
    };
  }
  if (isSimulated && !isWenli) {
    const rows = await queryWorkbenchAging(
      "simulated",
      customerCode,
      materialCode,
    );
    return {
      sourceUnknown: false,
      rows: withRatio(ageRowsFromCube(rows, "提报推演")),
    };
  }
  // 主表库存来源缺失或不明确：不直接穿透单一明细表、不合并口径判断，
  // 两套来源分别展示并提示先确认主表库存口径（规划规则包 5.4/6.2）。
  const [wlRows, simulatedRows] = await Promise.all([
    queryWorkbenchAging("wl", customerCode, materialCode),
    queryWorkbenchAging("simulated", customerCode, materialCode),
  ]);
  return {
    sourceUnknown: true,
    rows: [
      ...withRatio(ageRowsFromCube(wlRows, "文沥/D-Link")),
      ...withRatio(ageRowsFromCube(simulatedRows, "提报推演")),
    ],
  };
}

function withRatio(
  rows: DealerAgingRow[],
): Array<DealerAgingRow & { ratio: number | null }> {
  const total = rows.reduce((sum, row) => sum + row.finalQty, 0);
  return rows.map((row) => ({
    ...row,
    ratio: total > 0 ? row.finalQty / total : null,
  }));
}
