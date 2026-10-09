import {computeDealerSku,type LiveDemoSku} from 'dsh-agent-manage/inventory-compute/dealer-recommendation';
import {skuExpiryFacts,inventoryStructureRisk} from 'dsh-agent-manage/inventory-compute/dealer-recommendation';
import "server-only";
import { dealerOverviewFacts } from "dsh-agent-manage/inventory-compute/dealer-overview-facts";
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
  const liveSkuFor=(record:Dashboard["records"][number],useDailyInventory=true)=>computeDealerSku(record,orderPrice(record),useDailyInventory);
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
