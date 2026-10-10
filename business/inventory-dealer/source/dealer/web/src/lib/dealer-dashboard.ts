import {
  dealerCubeContract,
  CubeRow,
  cube,
  planMonthDimension,
  loadBizRuleFile,
  loadFuseRules,
  statusContext,
  loadFilterLabels,
  loadMetricCards,
  loadStockHealth,
  DealerCustomer,
  DealerCustomerInventorySummary,
  DealerCategoryInventorySummary,
  DealerDashboardRecord,
  DealerDashboardSummary,
  DealerInventoryDailySummary,
  DealerDetailScope,
  DealerMetric,
  numberOf,
  dateOnly,
  planMonthOf,
  dedupeRows,
  asCustomer,
  resultTableRow,
  matchesMetricCondition,
  validDetailScope,
  ageRowsFromCube,
  withRatio,
  summarizeDealerDashboard,
} from 'dsh-agent-manage/inventory-compute/dealer-dashboard';
export type {
  DealerCustomer,
  DealerCustomerInventorySummary,
  DealerCategoryInventorySummary,
  DealerDashboardRecord,
  DealerDashboardSummary,
  DealerInventoryDailySummary,
  DealerFilterLabel,
  DealerMetricCard,
  DealerStockHealth,
  DealerAgingRow,
  DealerDetailScope,
  DealerMetric,
  DealerMetricCondition,
} from 'dsh-agent-manage/inventory-compute/dealer-dashboard';
import 'server-only';

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
} from '@/lib/dealer-workbench-sql';

import { GeaSqlApiError } from '@/lib/gea-sql-client';

const GEA_CUSTOMER_BOOTSTRAP_LIMIT = 10;

const GEA_CUSTOMER_SEARCH_LIMIT = 20;

const GEA_DASHBOARD_INITIAL_ROW_LIMIT = 200;

const metricSqlColumns: Record<DealerMetric, string> = {
  budget_amount: 'simulation_need_amount',
  budget_rate: 'budget_rate',
  planned_qty_rate: 'planned_qty_rate',
  shipped_qty: 'ship_qty',
  in_transit_qty: 'in_transit_qty',
  stock_qty: 'stock_qty',
  target_inventory: 'target_inventory',
  pre_order_qty: 'pre_order_qty',
  turnover_days: 'turnover_days',
  stock_age: 'avg_stock_age',
};

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
      '查询范围包含当前用户无权访问的客户',
      'GEA_SQL_CUSTOMER_SCOPE_FORBIDDEN',
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
  stockTab?: 'customer' | 'category' | 'sku' | 'shortage' | 'expiry';
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
  exportTab?: 'sku' | 'shortage' | 'customer' | 'category' | 'expiry';
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
  scope?: 'single' | 'sales' | 'all';
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

/**
 * Search the authorized customer list with a bound JDBC parameter. The result
 * stays server-paged, so opening the picker never reads all authorized rows.
 */
export async function loadDealerCustomers(
  search = '',
  offset = 0,
  limit = GEA_CUSTOMER_SEARCH_LIMIT,
  options: DealerDashboardLoadOptions = {},
): Promise<DealerCustomerSearchResult> {
  const safeSearch = search.trim().slice(0, 100);
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(GEA_CUSTOMER_SEARCH_LIMIT, Math.floor(limit)))
    : GEA_CUSTOMER_SEARCH_LIMIT;
  const exactCustomerCode = options.lockedCustomerCode ?? '';
  const customerScope = exactCustomerCode ? [exactCustomerCode] : [];
  const snapshotRows = options.snapshotDate
    ? []
    : await queryWorkbenchLatestSnapshot(customerScope, options);
  const snapshotDate =
    options.snapshotDate ?? dateOnly(snapshotRows[0]?.[dealerCubeContract.snapshotDimension]);
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

/** Read one result-table page using the exact scope recorded by the Agent. */
export async function loadDealerResultPage(
  scope: DealerDetailScope,
  page: number,
  pageSize: number,
) {
  if (!validDetailScope(scope)) throw new Error('结果查询范围无效');
  const authorizedCustomerCodes = await assertAuthorizedSqlCustomerCodes(scope.customerCodes);
  const safePage = Math.max(0, Math.floor(page));
  const safePageSize = Math.min(200, Math.max(1, Math.floor(pageSize)));
  const needsInMemoryFilter =
    scope.stockCondition === 'equals_zero' || scope.metricCondition !== undefined;
  const sqlOrderColumn =
    scope.orderBy === 'stockAge'
      ? 'avg_stock_age'
      : scope.orderBy === 'metric' && scope.metricCondition
        ? metricSqlColumns[scope.metricCondition.metric]
        : 'pre_order_qty';
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
  const deduped = scope.mode === 'detail' ? dedupeRows(rows).rows : rows;
  const pageRows = needsInMemoryFilter
    ? deduped.slice(safePage * safePageSize, (safePage + 1) * safePageSize)
    : deduped;
  return {
    page: safePage,
    pageSize: safePageSize,
    rows: pageRows.map((row) => resultTableRow(row, scope.metricCondition, context)),
  };
}

export async function loadDealerDashboard(
  customerCode?: string,
  options: DealerDashboardLoadOptions = {},
) {
  const measure = async <T>(stage: string, task: () => Promise<T>): Promise<T> => {
    const start = performance.now();
    try {
      return await task();
    } finally {
      options.onTiming?.(stage, performance.now() - start);
    }
  };
  const fuseRuleConfig = loadBizRuleFile('fuse-rules');
  const exceptionRuleConfig = loadBizRuleFile('exceptions');
  const fuseRules = loadFuseRules(fuseRuleConfig);
  const filterLabels = loadFilterLabels();
  const metricCards = loadMetricCards();
  const stockHealth = loadStockHealth();
  const customerBootstrapLimit = GEA_CUSTOMER_BOOTSTRAP_LIMIT;
  const effectiveCustomerCode = customerCode;
  let requestedScope = customerCode ? 'single' : (options.scope ?? 'single');
  const knownScope = Boolean(effectiveCustomerCode || requestedScope !== 'single');
  const metadataCodes =
    options.overviewCustomerCodes ?? (effectiveCustomerCode ? [effectiveCustomerCode] : []);
  const pinnedSnapshot =
    options.tabDataOnly &&
    options.snapshotDate &&
    /^20\d{2}-\d{2}-\d{2}$/.test(options.snapshotDate)
      ? options.snapshotDate
      : undefined;
  const pinnedMonth =
    pinnedSnapshot && options.planMonth && /^20\d{2}-\d{2}$/.test(options.planMonth)
      ? options.planMonth
      : undefined;
  const combinedMetadata = Boolean(options.stockTab && knownScope && !pinnedSnapshot);
  const snapshotRows = pinnedSnapshot
    ? [{ [dealerCubeContract.snapshotDimension]: pinnedSnapshot }]
    : await measure('snapshot', () =>
        combinedMetadata
          ? queryWorkbenchSnapshotMonths(metadataCodes, options)
          : queryWorkbenchLatestSnapshot(metadataCodes, options),
      );
  const snapshotDate = dateOnly(snapshotRows[0]?.[dealerCubeContract.snapshotDimension]);
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
          (row) => dateOnly(row[dealerCubeContract.snapshotDimension]) === snapshotDate,
        )
      : null;
  // The daily snapshot and full daily totals do not depend on plan-order details.
  const earlyDailySnapshot = knownScope
    ? measure('daily_snapshot', () =>
        options.tabDataOnly && options.inventoryDailyStatDate
          ? Promise.resolve([
              {
                'dealer_inventory_daily.stat_date': options.inventoryDailyStatDate,
              },
            ])
          : queryWorkbenchLatestInventoryDailySnapshot(metadataCodes, options),
      )
    : null;
  const earlyDailySummary = earlyDailySnapshot?.then((rows) => {
    const date = dateOnly(rows[0]?.['dealer_inventory_daily.stat_date']);
    return date && !options.companyProductsOnly && !options.tabDataOnly
      ? measure('daily_summary', () =>
          queryWorkbenchInventoryDailySummary(date, metadataCodes, options),
        )
      : ({} as CubeRow);
  });
  // Join below; attach a handler now so an earlier independent failure cannot leak a rejection.
  earlyDailySummary?.catch(() => {});
  const customerQuery = measure('customers', () =>
    queryWorkbenchCustomers(
      snapshotDate,
      '',
      effectiveCustomerCode ?? '',
      0,
      customerBootstrapLimit,
      options,
    ),
  );
  const [customerResult, selectedMonthRows] =
    effectiveCustomerCode || requestedScope !== 'single'
      ? await Promise.all([
          customerQuery,
          metadataMonths
            ? Promise.resolve(metadataMonths)
            : measure('months', () =>
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
    requestedScope !== 'single' &&
    !options.overviewOnly &&
    !options.overviewCustomerCodes &&
    customerResult.total === 1 &&
    customers.length === 1,
  );
  if (autoSelectedCustomer) {
    requestedScope = 'single';
  }
  const activeCustomerCode =
    effectiveCustomerCode && customers.some((item) => item.code === effectiveCustomerCode)
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
    : requestedScope === 'sales' || requestedScope === 'all'
      ? []
      : [activeCustomerCode];
  const monthRows = selectedMonthRows
    ? selectedMonthRows
    : await measure('months', () =>
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
    ? 'sku'
    : options.exportTab
      ? undefined
      : options.stockTab;
  const readSku =
    !options.overviewOnly && (!stockTab || stockTab === 'sku' || stockTab === 'expiry');
  const readCustomers =
    !options.overviewOnly && !options.companyProductsOnly && (!stockTab || stockTab === 'customer');
  const readCategory =
    !options.overviewOnly &&
    !options.companyProductsOnly &&
    (!stockTab || stockTab === 'category' || stockTab === 'sku');
  const readShortage =
    !options.overviewOnly && !options.companyProductsOnly && (!stockTab || stockTab === 'shortage');
  const detailPage = Number.isFinite(options.detailPage)
    ? Math.max(0, Math.floor(options.detailPage ?? 0))
    : 0;
  const detailPageSize = Number.isFinite(options.detailPageSize)
    ? Math.max(
        1,
        Math.min(200, Math.floor(options.detailPageSize ?? GEA_DASHBOARD_INITIAL_ROW_LIMIT)),
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
    requestedScope === 'single' &&
    scopedCustomerCodes.length === 1,
  );
  const fullSkuDetails =
    options.exportTab === 'expiry' ||
    stockTab === 'expiry' ||
    options.exportTab === 'sku' ||
    Boolean(options.companyProductsOnly && options.companyProductFilters?.download);
  const customerPageResultPromise = !readCustomers
    ? Promise.resolve({ records: [] as CubeRow[], total: customerResult.total })
    : customerPage === 0 && customerPageSize === customerBootstrapLimit
      ? Promise.resolve(customerResult)
      : measure('customers', () =>
          queryWorkbenchCustomers(snapshotDate, '', '', customerPage, customerPageSize, options),
        );
  const dailySnapshotPromise =
    (autoSelectedCustomer ? null : earlyDailySnapshot) ??
    measure('daily_snapshot', () =>
      queryWorkbenchLatestInventoryDailySnapshot(scopedCustomerCodes, options),
    );
  const categorySummaryPromise = dailySnapshotPromise.then((snapshotRows) => {
    const inventoryDailyStatDate = dateOnly(snapshotRows[0]?.['dealer_inventory_daily.stat_date']);
    return inventoryDailyStatDate && readCategory
      ? measure('category', () =>
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
          measure('details', () =>
            queryWorkbenchDashboard(
              snapshotDate,
              planMonth,
              scopedCustomerCodes,
              detailPage,
              detailPageSize,
              stockTab === 'expiry' ? { ...options, exportTab: 'expiry' } : options,
              dateOnly(snapshotRows[0]?.['dealer_inventory_daily.stat_date']),
              options.companyProductsOnly ? options.companyProductFilters || {} : undefined,
            ),
          ),
        )
      : Promise.resolve({ records: [] as CubeRow[], total: 0 }),
    options.companyProductsOnly || options.tabDataOnly
      ? Promise.resolve({} as CubeRow)
      : measure('summary', () =>
          queryWorkbenchSummary(snapshotDate, planMonth, scopedCustomerCodes, options),
        ),
    !readCustomers
      ? Promise.resolve({ records: [] as CubeRow[], total: 0 })
      : measure('customer_summary', () =>
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
      : measure('shortage', () =>
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
    inventoryDailySnapshotRows[0]?.['dealer_inventory_daily.stat_date'],
  );
  const dailyKeysFor = (sourceRows: CubeRow[]) => {
    const seen = new Set<string>();
    return sourceRows
      .map((row) => ({
        customerCode: String(row['dealer_plan_order.cust_code'] ?? '').trim(),
        materialCode: String(row['dealer_plan_order.material_code'] ?? '').trim(),
      }))
      .filter((key) => {
        const id = JSON.stringify([key.customerCode, key.materialCode]);
        if (!key.customerCode || !key.materialCode || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  };
  const inventoryDailyKeys = fullSkuDetails ? [] : dailyKeysFor(rows);
  const shortageInventoryDailyKeys =
    options.exportTab === 'shortage' ? [] : dailyKeysFor(shortageRows);
  const dailyCustomerCodes = (
    options.exportTab === 'customer' ? customerSummaryResult.records : customerPageResult.records
  )
    .map((row) => String(row['dealer_plan_order.cust_code'] ?? '').trim())
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
          : measure('daily_details', () =>
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
            : measure('daily_summary', () =>
                queryWorkbenchInventoryDailySummary(
                  inventoryDailyStatDate,
                  scopedCustomerCodes,
                  options,
                ),
              )),
        !readCustomers
          ? Promise.resolve([] as CubeRow[])
          : measure('daily_customers', () =>
              queryWorkbenchInventoryDailyCustomerSummaries(
                inventoryDailyStatDate,
                dailyCustomerCodes,
                options,
              ),
            ),
        !readShortage
          ? Promise.resolve([] as CubeRow[])
          : measure('shortage_daily', () =>
              queryWorkbenchInventoryDailyDetails(
                inventoryDailyStatDate,
                shortageInventoryDailyKeys,
                options,
                options.exportTab === 'shortage' ? scopedCustomerCodes : undefined,
              ),
            ),
      ])
    : [[], {} as CubeRow, [] as CubeRow[], [] as CubeRow[]];
  if (
    includeCompanyProducts &&
    (rows.some(
      (row) => String(row['dealer_plan_order.cust_code'] ?? '').trim() !== activeCustomerCode,
    ) ||
      inventoryDailyRows.some(
        (row) =>
          String(row['dealer_inventory_daily.cust_code'] ?? '').trim() !== activeCustomerCode,
      ))
  )
    throw new GeaSqlApiError('商品客户范围不匹配', 'COMPANY_PRODUCT_SCOPE_FORBIDDEN', 403, false);
  const {
    dailyInventoryCoverageComplete,
    inventoryDailySummary,
    dedupedRows,
    records,
    shortageRecords,
    summary,
    customerSummaries,
    categorySummaries,
  } = summarizeDealerDashboard({
    rows,
    inventoryDailyRows,
    shortageInventoryDailyRows,
    inventoryDailySummaryRow,
    scopedCustomerCodes,
    customerResult,
    inventoryDailyStatDate,
    shortageRows,
    fuseRuleConfig,
    exceptionRuleConfig,
    options,
    summaryRow,
    customerSummaryResult,
    inventoryDailyCustomerRows,
    customerPageResult,
    categorySummaryRows,
  });
  return {
    customers,
    customerTotal: customerResult.total,
    customerSummaries,
    customerSummaryTotal: customerPageResult.total,
    customerPage,
    customerPageSize,
    categorySummaries,
    shortageRecords,
    shortageTotal: readShortage ? shortageResult.total : numberOf(summaryRow.shortage_sku_count),
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

export async function loadDealerAging(
  customerCode: string,
  materialCode: string,
  inventorySource?: string | null,
) {
  await assertAuthorizedSqlCustomerCodes([customerCode]);
  const source = String(inventorySource ?? '').trim();
  const isWenli = /文沥|D-Link|dlink/i.test(source);
  const isSimulated = /提报|推演|库存推演/i.test(source);
  if (isWenli && !isSimulated) {
    const rows = await queryWorkbenchAging('wl', customerCode, materialCode);
    return {
      sourceUnknown: false,
      rows: withRatio(ageRowsFromCube(rows, '文沥/D-Link')),
    };
  }
  if (isSimulated && !isWenli) {
    const rows = await queryWorkbenchAging('simulated', customerCode, materialCode);
    return {
      sourceUnknown: false,
      rows: withRatio(ageRowsFromCube(rows, '提报推演')),
    };
  }
  // 主表库存来源缺失或不明确：不直接穿透单一明细表、不合并口径判断，
  // 两套来源分别展示并提示先确认主表库存口径（规划规则包 5.4/6.2）。
  const [wlRows, simulatedRows] = await Promise.all([
    queryWorkbenchAging('wl', customerCode, materialCode),
    queryWorkbenchAging('simulated', customerCode, materialCode),
  ]);
  return {
    sourceUnknown: true,
    rows: [
      ...withRatio(ageRowsFromCube(wlRows, '文沥/D-Link')),
      ...withRatio(ageRowsFromCube(simulatedRows, '提报推演')),
    ],
  };
}
