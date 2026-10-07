import "server-only";
import { dealerOverviewFacts } from "@/lib/dealer-overview-facts";
import {
  queryWorkbenchCustomerCars,
  queryWorkbenchCustomerReceives,
  queryWorkbenchCustomerPickupPoints,
  type CustomerPickupPoint,
  queryWorkbenchCompanyProductFacets,
  queryWorkbenchCompanyProductTotal,
} from "@/lib/dealer-workbench-sql";
import {
  loadDealerPromotionPolicies,
  type DealerPromotionResult,
} from "@/lib/dealer-promotion-policy";
import {
  loadDealerSapPrices,
  type SapPricingResult,
} from "../../../../inventory-light-plugins/src/platform-pending";

import {
  loadDealerDashboard,
  type DealerDashboardLoadOptions,
} from "@/lib/dealer-dashboard";

type Dashboard = Awaited<ReturnType<typeof loadDealerDashboard>>;

/** Chinese-calendar season, evaluated in the business timezone (including leap months). */
export function seasonalReplenishmentReason(
  category: string,
  now = new Date(),
) {
  if (!category.includes("粽")) return null;
  const parts = new Intl.DateTimeFormat("en-u-ca-chinese", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const monthText = parts.find((part) => part.type === "month")?.value || "";
  const month = Number.parseInt(monthText, 10);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const leap = /bis/.test(monthText);
  const stopped =
    month > 5 ||
    (month === 5 && (leap || day >= 5)) ||
    (month === 1 && !leap && day <= 15);
  return stopped ? "季节性商品过节日后不补货" : null;
}

export function skuExpiryFacts(
  age: number | null | undefined,
  stock: number | null | undefined,
) {
  if (age == null || stock == null)
    return { near: 0, expired: 0, remaining: null };
  const known =
    age != null &&
    Number.isFinite(age) &&
    age >= 0 &&
    stock != null &&
    Number.isFinite(stock) &&
    stock >= 0;
  if (!known) return { near: null, expired: null, remaining: null };
  return {
    near: age! >= (365 * 2) / 3 && age! <= 365 ? stock! : 0,
    expired: age! > 365 ? stock! : 0,
    remaining: 365 - age!,
  };
}

export function replenishmentFacts(
  stock: number | null | undefined,
  expiryStock: number | null | undefined,
  transitStock: number | null | undefined,
  sales30: number | null | undefined,
) {
  transitStock ??= 0;
  expiryStock ??= 0;
  const fields: [string, number | null | undefined][] = [
    ["在仓库存", stock],
    ["在仓临期库存", expiryStock],
    ["在途库存", transitStock],
    ["近30日销量", sales30],
  ];
  const missing = fields.flatMap(([name, value]) =>
    value == null
      ? [name + "未提供"]
      : !Number.isFinite(value) || value < 0
        ? [name + "异常"]
        : [],
  );
  if (missing.length)
    return {
      quantity: null,
      reason: missing.join("、") + "，暂无法计算建议备货量",
      action: "待核查",
    };
  const target = (sales30! / 30) * 20;
  const available = Math.max(stock! - expiryStock!, 0) + transitStock!;
  const quantity = Math.max(
    0,
    Math.round(Number((target - available).toFixed(6))),
  );
  if (![target, available, quantity].every(Number.isFinite))
    return {
      quantity: null,
      reason: "库存或动销数值超出可计算范围，请核查数据",
      action: "待核查",
    };
  const fmt = (value: number) =>
    new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
  return {
    quantity,
    reason: `按近30日销量${fmt(sales30!)}箱、20天目标计算目标库存${fmt(target)}箱；在仓可用库存${fmt(Math.max(stock! - expiryStock!, 0))}箱，在途${fmt(transitStock!)}箱；建议备货${fmt(quantity)}箱${quantity === 0 ? "，无需补货" : ""}`,
    action: quantity > 0 ? "建议补货" : "无需补货",
  };
}

export function missingStockFactsReason(
  stock: number | null | undefined,
  transit: number | null | undefined,
  target: number | null | undefined,
): string {
  const fields: [string, number | null | undefined][] = [
    ["在仓库存", stock],
    ["在途数量", transit ?? 0],
    ["目标备货", target],
  ];
  const issues = fields.flatMap(([name, value]) =>
    value == null
      ? [name + "未提供"]
      : !Number.isFinite(value) || value < 0
        ? [name + "异常"]
        : [],
  );
  return issues.length
    ? issues.join("、") + "，暂无法确定建议备货量，请核查对应数据"
    : "";
}

export function inventoryStructureRisk(
  categories: Dashboard["categorySummaries"],
) {
  const details = categories.map((row) => {
    const stock = row.riskInventory,
      transit = row.riskTransit,
      sales = row.sales30;
    const complete =
      row.riskDataComplete === true &&
      row.category !== "未分类" &&
      [stock, transit, sales].every(
        (value) => value != null && Number.isFinite(value) && value >= 0,
      );
    const reasons: string[] = [];
    if (complete) {
      const total = stock! + transit!;
      if (sales === 0 && total > 0) reasons.push("近30天无动销");
      if (sales! > 0 && total / (sales! / 30) < 20)
        reasons.push("覆盖低于20天");
      if (sales! > 0 && total / (sales! / 30) > 20)
        reasons.push("覆盖超过20天");
    }
    return { category: row.category, complete, reasons };
  });
  return {
    count:
      details.length && details.every((row) => row.complete)
        ? details.filter((row) => row.reasons.length > 0).length
        : null,
    details,
  };
}

type LiveDemoSku = {
  // 公司商品与购物车只消费真实字段，不能复用旧库存演示补齐值。
  commerceFacts: {
    stock: number | null;
    transit: number | null;
    recommendedQty: number | null;
    nearExpiryStock: number | null;
    price: number | null;
    warehouse: string | null;
  };
  dealer: string;
  dealerCode: string;
  dealerName: string;
  plannedQty: number | null;
  region: string;
  code: string;
  sku: string;
  category: string;
  stock: number | null;
  transit: number | null;
  normalStock: number | null;
  stockAmount: number | null;
  targetInventory: number | null;
  suggestedStockQty: number | null;
  orderRecommendation?: {
    quantity: number | null;
    reason: string;
    action: string;
  };
  // 用户指定按平均货龄判断整款在仓库存；未知货龄不按0处理。
  nearExpiryStock: number | null;
  expiredStock: number | null;
  remainingValidityDays: number | null;
  totalValidityDays: number;
  sales7: number | null;
  sales30: number | null;
  shortageSales30: number | null;
  publishedSales7: number | null;
  publishedSales30: number | null;
  publishedSalesAmount30: number | null;
  productRange: string | null;
  productTag: string | null;
  materialSize: string | null;
  cifPrice: number | null;
  averageAge: number | null;
  inventorySnapshotDate: string | null;
  inventoryDailySource: string | null;
  margin: number | null;
  price: number | null;
  sellThrough: number | null;
  manualQtyOverride: number;
  manualAdjustNote: string;
  liveAction: string;
  liveReason: string;
};

type LivePendingTask = {
  id: string;
  conversationId: string;
  title: string;
  createdTime: string;
};

type LiveCategorySummary = {
  category: string;
  skuCount: number;
  stock: number;
  transit: number;
  nearExpiryStock?: number | null;
  normalStock: number | null;
  sales30: number | null;
  stockAmount: number | null;
  dailyMatchedSkuCount: number;
  targetInventory: number;
};

type LiveCustomerSummary = {
  code: string;
  name: string;
  hasInventoryData: boolean;
  skuCount: number;
  stock: number;
  transit: number;
  nearExpiryStock?: number | null;
  normalStock: number | null;
  stockAmount: number | null;
  dailyRowCount: number;
  normalStockCoverage: number;
  stockAmountCoverage: number;
  targetInventory: number;
  suggestedQuantity: number;
};

type CompanyProduct = Pick<
  LiveDemoSku,
  | "commerceFacts"
  | "dealerCode"
  | "code"
  | "sku"
  | "category"
  | "productTag"
  | "materialSize"
  | "publishedSales30"
>;

type LiveDemoPayload = DealerPromotionResult & {
  pricing?: SapPricingResult;
  loadedStockTab?: DealerDashboardLoadOptions["stockTab"];
  companyProducts: CompanyProduct[];
  companyProductsSource?: "customer_saleable_material";
  companyProductTotal?: number | null;
  companyProductFacets?: { categories: string[]; tags: string[] };
  companyProductsStatus:
    "available" | "partial" | "empty" | "select_customer" | "unavailable";
  customerPickupPoints?: CustomerPickupPoint[];
  customerPickupPointsStatus?:
    "available" | "empty" | "unavailable" | "select_customer";
  customerCars?: Array<{
    id: string;
    organization: string;
    warehouse: string;
    type: string;
    code: string;
    name: string;
    min: string | null;
    max: string | null;
  }>;
  customerCarsStatus?:
    "available" | "empty" | "unavailable" | "select_customer";
  customerReceives?: Array<{
    id: string;
    code: string;
    name: string;
    address: string;
    mainDriver: string;
    maxDriver: string;
  }>;
  customerReceivesStatus?:
    "available" | "empty" | "unavailable" | "select_customer";
  customerName: string;
  customerCode: string;
  customerOptions: Array<{ code: string; name: string }>;
  customerCount: number;
  customerSummaries: LiveCustomerSummary[];
  categorySummaries: LiveCategorySummary[];
  customerSummaryTotal: number;
  customerPage: number;
  customerPageSize: number;
  scope: "single" | "sales" | "all";
  scopeCustomerCodes: string[];
  scopeLabel: string;
  snapshotDate: string | null;
  planMonth: string | null;
  targetAmount: number | null;
  completedAmount: number | null;
  totalInventory: number;
  totalTransitInventory: number;
  totalTargetInventory: number;
  totalNormalInventory: number | null;
  totalInventoryValue: number | null;
  inventoryDailyCustomerCount: number;
  inventoryDailyExpectedCustomerCount: number;
  normalStockCoverage: number | null;
  stockAmountCoverage: number | null;
  totalSales7: number | null;
  totalSales30: number | null;
  totalSalesAmount30: number | null;
  sales7Coverage: number | null;
  sales30Coverage: number | null;
  salesAmount30Coverage: number | null;
  forecastSales: number;
  inventoryDailyStatDate: string | null;
  inventoryDateLabel: string;
  averageAge: number | null;
  storeCount: number | null;
  skuCount: number;
  reasonableSkuCount: number;
  unreasonableSkuCount: number;
  nearExpirySkuCount: number | null;
  noSalesSkuCount: number | null;
  abnormalCategoryCount: number | null;
  inventoryStructureRisks: ReturnType<typeof inventoryStructureRisk>["details"];
  shortageSkuCount: number;
  coveredSkuCount: number;
  loadedSkuCount: number;
  recordTotal: number;
  page: number;
  pageSize: number;
  skus: LiveDemoSku[];
  shortageTotal: number;
  shortagePage: number;
  shortagePageSize: number;
  shortageSkus: LiveDemoSku[];
  mockedFields: string[];
  // 当前经销商库存 Agent 尚未发布待审批任务数据源，页面必须保持真实空态，
  // 不能沿用设计稿或参考项目中的示例任务。
  pendingTaskCount: number | null;
  pendingTasks: LivePendingTask[];
  capabilities: {
    nearExpiry: boolean;
    inventoryValue: boolean;
    normalInventory: boolean;
    skuLifecycle: boolean;
    storeCount: boolean;
  };
};

function finite(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function actionFor(record: Dashboard["records"][number]) {
  if (record.orderException || record.dataIssues.length > 0) return "";
  // 订补货动作直接以数据通道返回的已核验建议量为准。
  if (record.suggestedQuantity > 0) return "建议补货";
  return "暂无补货建议";
}

export function suggestedStockQuantity(
  target: number | null | undefined,
  stock: number | null | undefined,
  transit: number | null | undefined,
): number | null {
  transit ??= 0;
  if (
    [target, stock, transit].some(
      (value) => value == null || !Number.isFinite(value) || value < 0,
    )
  )
    return null;
  return Math.max(0, Number((target! - stock! - transit!).toFixed(6)));
}

function reasonFor(record: Dashboard["records"][number]) {
  const valid = (value: number | null | undefined) =>
    value != null && Number.isFinite(value) && value >= 0 ? value : null;
  const fmt = (value: number) =>
    new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
  if (record.orderException) return `暂停建议：${record.orderException}`;
  if (record.dataIssues.length)
    return `数据待核查：${record.dataIssues.join("、")}`;
  const stock = valid(record.actualInventory ?? record.inventory);
  const transit = valid(record.actualInTransit ?? record.publishedInTransit);
  const target = valid(record.targetInventory);
  const sales = valid(record.sales30);
  const qty = valid(record.publishedSuggestedQuantity);
  const total = stock != null && transit != null ? stock + transit : null;
  const reasons: string[] = [];
  if (total != null && target != null) {
    reasons.push(
      total < target
        ? `库存${fmt(total)}箱，低于目标${fmt(target)}箱，差额${fmt(target - total)}箱`
        : `库存${fmt(total)}箱，已达到目标${fmt(target)}箱`,
    );
  } else reasons.push("库存、在途或目标备货缺失，暂不能比较缺口");
  if (sales != null && sales > 0 && total != null)
    reasons.push(
      `近30日销量${fmt(sales)}箱，参考覆盖${fmt(total / (sales / 30))}天`,
    );
  else
    reasons.push(
      sales === 0
        ? "近30日销量为0，覆盖天数无法计算"
        : "动销或库存数据不完整，覆盖天数待核查",
    );
  if (qty == null) reasons.push("已发布建议量缺失，需核查");
  else if (qty === 0) reasons.push("已发布建议量为0，暂无补货建议");
  else {
    reasons.push(`已发布建议补货${fmt(qty)}箱`);
    reasons.push(
      total != null && target != null && total >= target
        ? "与当前库存对比不一致，请核查建议日期及备货口径"
        : "源未提供具体测算原因，以上为当前库存参考",
    );
  }
  return reasons.join("；");
}

/** Adapt authorized inventory records without synthetic data fallback. */
export async function loadDealerDemoPayload(
  customerCode?: string,
  options: DealerDashboardLoadOptions & { orderSuggestionsOnly?: boolean } = {},
): Promise<LiveDemoPayload> {
  const reportDeliveryError = (resource: string, error: unknown) => {
    const code =
      error && typeof error === "object" && "code" in error ? error.code : null;
    console.warn(
      JSON.stringify({
        event: "dealer_delivery_load_failed",
        resource,
        trace_id: options.actionId || crypto.randomUUID(),
        source_code:
          typeof code === "string" && /^[A-Z][A-Z0-9_]{2,127}$/.test(code)
            ? code
            : "DATA_VALIDATION_FAILED",
      }),
    );
  };
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
  const dashboard = await measure("dashboard", () =>
    loadDealerDashboard(customerCode, {
      ...options,
      autoSelectOnlyCustomer: true,
      includeCompanyProducts: !options.exportTab,
    }),
  );
  const activeCustomer = dashboard.customers.find(
    (customer) => customer.code === dashboard.activeCustomerCode,
  );
  if (!activeCustomer || !dashboard.snapshotDate)
    throw new Error("当前授权范围没有可展示的经销商库存数据");

  const promotionPromise =
    dashboard.scope === "single" &&
    !options.companyProductsOnly &&
    !options.tabDataOnly &&
    !options.exportTab
      ? measure("policies", () =>
          loadDealerPromotionPolicies(activeCustomer.code, { ...options }),
        )
      : Promise.resolve({
          policies: [],
          policiesStatus: "select_customer" as const,
        });

  const catalogTotalPromise =
    dashboard.scope === "single" &&
    !options.companyProductsOnly &&
    !options.tabDataOnly &&
    !options.exportTab &&
    !options.orderSuggestionsOnly
      ? measure("catalog_count", async () => {
          try {
            return await queryWorkbenchCompanyProductTotal(
              activeCustomer.code,
              options,
            );
          } catch (error) {
            if (options.signal?.aborted) throw error;
            return null;
          }
        })
      : Promise.resolve(null);

  const pickupsPromise = measure("pickups", async () => {
    if (
      dashboard.scope !== "single" ||
      options.companyProductsOnly ||
      options.tabDataOnly ||
      options.exportTab
    )
      return {
        customerPickupPoints: [] as CustomerPickupPoint[],
        customerPickupPointsStatus: "select_customer" as const,
      };
    try {
      const points = await queryWorkbenchCustomerPickupPoints(
        activeCustomer.code,
        options,
      );
      return {
        customerPickupPoints: points,
        customerPickupPointsStatus: points.length
          ? ("available" as const)
          : ("empty" as const),
      };
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason;
      reportDeliveryError("customer_pickup", error);
      return {
        customerPickupPoints: [] as CustomerPickupPoint[],
        customerPickupPointsStatus: "unavailable" as const,
      };
    }
  });
  const carsPromise = measure("cars", async () => {
    let customerCars: NonNullable<LiveDemoPayload["customerCars"]> = [];
    let customerCarsStatus: LiveDemoPayload["customerCarsStatus"] =
      "select_customer";
    if (
      dashboard.scope === "single" &&
      !options.companyProductsOnly &&
      !options.tabDataOnly &&
      !options.exportTab
    ) {
      try {
        const rows = await queryWorkbenchCustomerCars(activeCustomer.code, {
          ...options,
        });
        if (
          rows.some(
            (row) =>
              String(row.cust_code) !== activeCustomer.code ||
              !String(row.source_record_id ?? "").trim() ||
              !String(row.car_code ?? "").trim(),
          ) ||
          new Set(rows.map((row) => String(row.source_record_id))).size !==
            rows.length
        )
          throw new Error("车型客户范围或标识不匹配");
        customerCars = rows.map((row) => ({
          id: String(row.source_record_id),
          organization: String(row.organization_id ?? ""),
          warehouse: String(row.warehouse_group_id ?? ""),
          type: String(row.car_type ?? ""),
          code: String(row.car_code ?? ""),
          name: String(row.car_name ?? ""),
          min:
            row.min_discount_num == null ? null : String(row.min_discount_num),
          max:
            row.max_discount_num == null ? null : String(row.max_discount_num),
        }));
        customerCarsStatus = rows.length ? "available" : "empty";
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason;
        reportDeliveryError("customer_car", error);
        customerCarsStatus = "unavailable";
      }
    }
    return { customerCars, customerCarsStatus };
  });
  const receivesPromise = measure("receives", async () => {
    let customerReceives: NonNullable<LiveDemoPayload["customerReceives"]> = [];
    let customerReceivesStatus: LiveDemoPayload["customerReceivesStatus"] =
      "select_customer";
    if (
      dashboard.scope === "single" &&
      !options.companyProductsOnly &&
      !options.tabDataOnly &&
      !options.exportTab
    ) {
      try {
        const rows = await queryWorkbenchCustomerReceives(activeCustomer.code, {
          ...options,
        });
        if (
          rows.some(
            (row) =>
              String(row.cust_code) !== activeCustomer.code ||
              !String(row.source_record_id ?? "").trim() ||
              !String(row.receive_cust_code ?? "").trim(),
          ) ||
          new Set(rows.map((row) => String(row.source_record_id))).size !==
            rows.length
        )
          throw new Error("收货地数据范围或标识异常");
        customerReceives = rows.map((row) => ({
          id: String(row.source_record_id),
          code: String(row.receive_cust_code),
          name: String(row.receive_cust_name ?? ""),
          address: String(row.goods_address ?? ""),
          mainDriver: String(row.main_drivertype ?? ""),
          maxDriver: String(row.max_drivertype ?? ""),
        }));
        customerReceivesStatus = rows.length ? "available" : "empty";
      } catch (error) {
        if (options.signal?.aborted) throw options.signal.reason;
        reportDeliveryError("customer_receive", error);
        customerReceivesStatus = "unavailable";
      }
    }
    return { customerReceives, customerReceivesStatus };
  });
  let sapPrices = new Map<string, number>();
  const orderPrice = (record: Dashboard["records"][number]) =>
    record.customerCode === activeCustomer.code
      ? (sapPrices.get(record.materialCode) ?? null)
      : null;
  const inventoryDailySummary = dashboard.inventoryDailySummary;
  const overviewFacts = dealerOverviewFacts(
    dashboard.summary,
    inventoryDailySummary,
  );
  const hasInventoryValue = Boolean(inventoryDailySummary?.stockAmountCoverage);
  const hasNormalInventory = Boolean(
    inventoryDailySummary?.normalStockCoverage,
  );
  const liveSkuFor = (
    record: Dashboard["records"][number],
    useDailyInventory = true,
  ): LiveDemoSku => {
    const inventory =
      (useDailyInventory
        ? (record.actualInventory ?? record.inventory)
        : record.inventory) ?? null;
    const realTransit =
      (useDailyInventory
        ? (record.actualInTransit ?? record.publishedInTransit)
        : record.publishedInTransit) ?? 0;
    const transit = realTransit;
    const targetInventory = record.targetInventory ?? null;
    const blockingDataIssues = record.dataIssues.filter(
      (issue) =>
        !["日均销量缺失或为0", "目标库存缺失", "平均货龄缺失"].includes(issue),
    );
    const validOrderSuggestion =
      !record.orderException && blockingDataIssues.length === 0;
    const expiry = skuExpiryFacts(
      record.averageAge,
      useDailyInventory
        ? (record.actualInventory ?? record.inventory)
        : record.inventory,
    );
    const recommendation = replenishmentFacts(
      useDailyInventory
        ? (record.actualInventory ?? record.inventory)
        : record.inventory,
      expiry.near == null || expiry.expired == null
        ? null
        : expiry.near + expiry.expired,
      realTransit,
      record.sales30,
    );
    const orderInputs = [
      useDailyInventory
        ? (record.actualInventory ?? record.inventory)
        : record.inventory,
      expiry.near == null || expiry.expired == null
        ? null
        : expiry.near + expiry.expired,
      realTransit,
      record.sales30,
    ];
    const orderMissing = [
      "在仓库存",
      "在仓临期库存",
      "在途库存",
      "近30日销量",
    ].filter((_, index) => orderInputs[index] == null);
    const orderRecommendation = replenishmentFacts(
      orderInputs[0] ?? 0,
      orderInputs[1] ?? 0,
      orderInputs[2] ?? 0,
      orderInputs[3] ?? 0,
    );
    const orderIssues = blockingDataIssues.filter((issue) =>
      ["主粒度重复", "平均货龄为负", "统一到岸价为负"].includes(issue),
    );
    if (record.orderException || orderIssues.length) {
      orderRecommendation.quantity = null;
      orderRecommendation.action = "待核查";
      orderRecommendation.reason =
        "业务校验未通过：" + (record.orderException || orderIssues.join("、"));
    }
    if (
      orderRecommendation.quantity != null &&
      orderRecommendation.quantity > 0
    ) {
      const integerQuantity = Math.round(orderRecommendation.quantity);
      if (integerQuantity !== orderRecommendation.quantity)
        orderRecommendation.reason +=
          "；整箱订货四舍五入为" + integerQuantity + "箱";
      orderRecommendation.quantity = integerQuantity;
    }
    if (orderMissing.length)
      orderRecommendation.reason +=
        "；仅订单计算：" +
        orderMissing.join("、") +
        "缺失按0参与计算，源数据仍缺失";
    const seasonalReason =
      record.materialCode === "10005290"
        ? "商品已下架，不推荐补货"
        : seasonalReplenishmentReason(record.productCategory || "");
    if (seasonalReason) {
      Object.assign(recommendation, {
        quantity: 0,
        action: "无需补货",
        reason: seasonalReason,
      });
      Object.assign(orderRecommendation, {
        quantity: 0,
        action: "无需补货",
        reason: seasonalReason,
      });
    }
    const suggestedStockQty = recommendation.quantity;
    const noReplenishment = suggestedStockQty === 0;
    return {
      commerceFacts: {
        stock: useDailyInventory
          ? (record.actualInventory ?? record.inventory)
          : record.inventory,
        transit: realTransit,
        recommendedQty:
          suggestedStockQty == null
            ? null
            : noReplenishment
              ? 0
              : !validOrderSuggestion
                ? null
                : suggestedStockQty,
        nearExpiryStock: expiry.near,
        price: orderPrice(record),
        warehouse: null,
      },
      dealer: record.customerCode,
      dealerCode: record.customerCode,
      plannedQty: record.plannedQty ?? null,
      dealerName: record.customerName || record.customerCode,
      region: "已授权范围",
      code: record.materialCode,
      sku: record.materialName || record.materialCode,
      category: record.productCategory || "未分类",
      stock: inventory,
      transit,
      normalStock: record.normalInventory,
      stockAmount: record.stockAmount,
      targetInventory,
      suggestedStockQty,
      orderRecommendation,
      nearExpiryStock: expiry.near,
      expiredStock: expiry.expired,
      totalValidityDays: 365,
      remainingValidityDays: expiry.remaining,
      sales7: record.sales7 ?? null,
      sales30: record.sales30 ?? null,
      shortageSales30:
        record.dailySales != null && record.dailySales > 0
          ? record.dailySales * 30
          : null,
      publishedSales7: record.sales7,
      publishedSales30: record.sales30,
      publishedSalesAmount30: record.salesAmount30,
      productRange: record.productRange,
      productTag: record.productTag,
      materialSize: record.materialSize,
      cifPrice: record.cifPrice,
      averageAge: record.averageAge ?? null,
      inventorySnapshotDate: record.inventorySnapshotDate,
      inventoryDailySource: record.inventoryDailySource,
      margin: null,
      price: orderPrice(record),
      sellThrough: null,
      manualQtyOverride:
        suggestedStockQty != null && !noReplenishment && validOrderSuggestion
          ? suggestedStockQty
          : 0,
      manualAdjustNote:
        suggestedStockQty == null
          ? "补货数据待完善"
          : "按20天目标及可用库存计算",
      liveAction:
        suggestedStockQty == null
          ? recommendation.action
          : !noReplenishment && !validOrderSuggestion
            ? "待核查"
            : recommendation.action,
      liveReason:
        suggestedStockQty != null && !noReplenishment && !validOrderSuggestion
          ? recommendation.reason +
            "；业务校验未通过：" +
            (record.orderException || blockingDataIssues.join("、"))
          : recommendation.reason,
    };
  };
  // Reuse the final recommendation builder; non-suggested SKUs cannot consume the SAP budget.
  const pricingRecords = options.orderSuggestionsOnly
    ? dashboard.records.filter(
        (record) =>
          (record.plannedQty ?? 0) > 0 &&
          record.materialCode !== "10005290" &&
          (liveSkuFor(record).orderRecommendation?.quantity ?? 0) > 0,
      )
    : [
        ...dashboard.records,
        ...dashboard.shortageRecords,
        ...(dashboard.companyProductRecords || []),
      ];
  const pricingPromise =
    dashboard.scope === "single"
      ? measure("sap_pricing", async () => {
          if (
            pricingRecords.some(
              (record) => record.customerCode !== activeCustomer.code,
            )
          )
            throw new Error("定价商品客户范围不匹配");
          return loadDealerSapPrices(
            activeCustomer.code,
            pricingRecords.map((record) => record.materialCode),
            { signal: options.signal, traceId: options.actionId },
          );
        })
      : Promise.resolve(undefined);

  const [
    promotionResult,
    { customerCars, customerCarsStatus },
    { customerReceives, customerReceivesStatus },
    pricing,
    companyProductTotal,
    { customerPickupPoints, customerPickupPointsStatus },
  ] = await Promise.all([
    promotionPromise,
    carsPromise,
    receivesPromise,
    pricingPromise,
    catalogTotalPromise,
    pickupsPromise,
  ]);
  sapPrices = new Map(
    pricing?.data?.prices.map((item) => [item.materialCode, item.price]) ?? [],
  );

  const skus = dashboard.records.map((record) => liveSkuFor(record));
  const shortageSkus = dashboard.shortageRecords.map((record) =>
    liveSkuFor(record, false),
  );

  return {
    ...promotionResult,
    pricing,
    loadedStockTab: options.stockTab,
    companyProductFacets:
      options.companyProductFacets && dashboard.scope === "single"
        ? await measure("catalog_facets", () =>
            queryWorkbenchCompanyProductFacets(
              dashboard.snapshotDate!,
              dashboard.planMonth!,
              activeCustomer.code,
              options,
            ),
          )
        : undefined,
    companyProductsSource: "customer_saleable_material",
    companyProductTotal,
    companyProducts: (options.companyProductsOnly
      ? dashboard.companyProductRecords || []
      : []
    ).map((record) => ({
      dealerCode: record.customerCode,
      code: record.materialCode,
      sku: record.materialName || record.materialCode,
      category: record.productCategory || "-",
      productTag: record.productTag,
      materialSize: record.materialSize,
      publishedSales30: record.sales30,
      commerceFacts: {
        stock: record.actualInventory ?? record.inventory,
        transit: record.actualInTransit ?? record.publishedInTransit ?? 0,
        recommendedQty:
          record.orderException || record.dataIssues.length
            ? null
            : (record.publishedSuggestedQuantity ?? null),
        nearExpiryStock: skuExpiryFacts(
          record.averageAge,
          record.actualInventory ?? record.inventory,
        ).near,
        price: orderPrice(record),
        warehouse: null,
      },
    })),
    companyProductsStatus:
      dashboard.scope !== "single"
        ? "select_customer"
        : !options.companyProductsOnly
          ? companyProductTotal == null
            ? "unavailable"
            : companyProductTotal === 0
              ? "empty"
              : "partial"
          : dashboard.recordTotal >
              (dashboard.companyProductRecords?.length ?? 0)
            ? "partial"
            : dashboard.companyProductRecords?.length
              ? "available"
              : "empty",
    customerPickupPoints,
    customerPickupPointsStatus,
    customerCars,
    customerCarsStatus,
    customerReceives,
    customerReceivesStatus,
    customerName: activeCustomer.name,
    customerCode: activeCustomer.code,
    customerOptions: dashboard.customers,
    customerCount: dashboard.customerTotal,
    customerSummaries: dashboard.customerSummaries.map((customer) => ({
      code: customer.code,
      name: customer.name,
      hasInventoryData: customer.hasInventoryData,
      skuCount: customer.skuCount,
      stock: customer.inventory,
      transit: customer.inTransit ?? 0,
      nearExpiryStock: 0, // 汇总源未提供临期数量，按用户约定取0。
      normalStock: customer.normalInventory,
      stockAmount: customer.stockAmount,
      dailyRowCount: customer.dailyRowCount,
      normalStockCoverage: customer.normalStockCoverage,
      stockAmountCoverage: customer.stockAmountCoverage,
      targetInventory: customer.targetInventory,
      suggestedQuantity: customer.suggestedQuantity,
    })),
    categorySummaries: dashboard.categorySummaries.map((category) => ({
      category: category.category,
      skuCount: category.skuCount,
      stock: category.inventory,
      transit: category.inTransit ?? 0,
      nearExpiryStock: 0, // 汇总源未提供临期数量，按用户约定取0。
      normalStock: category.normalInventory,
      sales30: category.sales30,
      stockAmount: category.stockAmount,
      dailyMatchedSkuCount: category.dailyMatchedSkuCount,
      targetInventory: category.targetInventory,
    })),
    customerSummaryTotal: dashboard.customerSummaryTotal,
    customerPage: dashboard.customerPage,
    customerPageSize: dashboard.customerPageSize,
    scope: dashboard.scope,
    scopeCustomerCodes: dashboard.scopeCustomerCodes,
    scopeLabel:
      dashboard.scope === "sales"
        ? "全部负责客户"
        : dashboard.scope === "all"
          ? "全部授权客户"
          : activeCustomer.name,
    snapshotDate: dashboard.snapshotDate,
    planMonth: dashboard.planMonth,
    targetAmount: dashboard.summary?.budget ?? null,
    completedAmount: dashboard.summary?.shipAmount ?? null,
    totalInventory: overviewFacts.inventory ?? 0,
    totalTransitInventory: overviewFacts.inTransit ?? 0,
    totalTargetInventory: overviewFacts.targetInventory ?? 0,
    totalNormalInventory: hasNormalInventory
      ? (inventoryDailySummary?.normalInventory ?? null)
      : null,
    totalInventoryValue: hasInventoryValue
      ? (inventoryDailySummary?.stockAmount ?? null)
      : null,
    inventoryDailyCustomerCount: inventoryDailySummary?.customerCount ?? 0,
    inventoryDailyExpectedCustomerCount:
      dashboard.scopeCustomerCodes.length || dashboard.customerTotal,
    normalStockCoverage: inventoryDailySummary?.normalStockCoverage ?? null,
    stockAmountCoverage: inventoryDailySummary?.stockAmountCoverage ?? null,
    totalSales7: inventoryDailySummary?.sales7Coverage
      ? inventoryDailySummary.sales7
      : null,
    totalSales30: inventoryDailySummary?.sales30Coverage
      ? inventoryDailySummary.sales30
      : null,
    totalSalesAmount30: inventoryDailySummary?.salesAmount30Coverage
      ? inventoryDailySummary.salesAmount30
      : null,
    sales7Coverage: inventoryDailySummary?.sales7Coverage ?? null,
    sales30Coverage: inventoryDailySummary?.sales30Coverage ?? null,
    salesAmount30Coverage: inventoryDailySummary?.salesAmount30Coverage ?? null,
    forecastSales: overviewFacts.forecastSales ?? 0,
    inventoryDailyStatDate: inventoryDailySummary?.statDate ?? null,
    inventoryDateLabel: inventoryDailySummary?.inventoryDateLabel ?? "未提供",
    skuCount:
      dashboard.summary?.skuCount ??
      dashboard.recordTotal ??
      dashboard.records.length,
    reasonableSkuCount: dashboard.summary?.reasonableSkuCount ?? 0,
    unreasonableSkuCount: dashboard.summary?.unreasonableSkuCount ?? 0,
    nearExpirySkuCount: dashboard.summary?.nearExpirySkuCount ?? 0,
    noSalesSkuCount: inventoryDailySummary?.noSalesSkuCount ?? null,
    abnormalCategoryCount: inventoryStructureRisk(dashboard.categorySummaries)
      .count,
    inventoryStructureRisks: inventoryStructureRisk(dashboard.categorySummaries)
      .details,
    shortageSkuCount: dashboard.summary?.shortageSkuCount ?? 0,
    coveredSkuCount: dashboard.summary?.coveredSkuCount ?? 0,
    loadedSkuCount: dashboard.records.length,
    recordTotal: dashboard.recordTotal,
    page: Math.max(0, Math.floor(options.detailPage ?? 0)),
    pageSize: Math.max(
      1,
      Math.min(200, Math.floor(options.detailPageSize ?? 10)),
    ),
    averageAge: dashboard.summary?.averageAge ?? null,
    storeCount: null,
    skus,
    shortageTotal: dashboard.shortageTotal,
    shortagePage: dashboard.shortagePage,
    shortagePageSize: dashboard.shortagePageSize,
    shortageSkus,
    mockedFields: [],
    pendingTaskCount: null,
    pendingTasks: [],
    capabilities: {
      nearExpiry: true,
      inventoryValue: hasInventoryValue,
      normalInventory: hasNormalInventory,
      skuLifecycle: false,
      storeCount: false,
    },
  };
}
