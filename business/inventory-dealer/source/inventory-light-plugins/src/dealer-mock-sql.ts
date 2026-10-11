/** Fixed offline input. This reader never opens a Host, HTTP or database connection. */
import sample from './dealer-mock-input.json';
import { dealerWorkbenchSql } from '../../dealer/web/src/lib/dealer-workbench-sql';
export async function readDealerMock(parameters: any, options: { signal?: AbortSignal } = {}) {
  options.signal?.throwIfAborted();
  const q = dealerWorkbenchSql,
    customer = sample.authorizedCustomer,
    date = sample.snapshotDate,
    month = sample.planMonth;
  const mains = Array.from({ length: 201 }, (_, i) => ({
    ...sample.main,
    material_code: 'sku-A-' + String(i).padStart(3, '0'),
  }));
  const days = mains.map((row) => ({ ...sample.daily, material_code: row.material_code }));
  const summary = {
    sku_count: 201,
    stock_qty: 12060,
    in_transit_qty: 2412,
    target_inventory: 20100,
    pre_order_qty: 5628,
    daily_sales: 804,
    reasonable_sku_count: 0,
    unreasonable_sku_count: 201,
    shortage_sku_count: 201,
    covered_sku_count: 0,
    near_expiry_sku_count: 0,
    stock_age_weighted_sum: 361800,
    stock_age_weight: 12060,
  };
  const dailySummary = {
    row_count: 201,
    customer_count: 1,
    stock_qty_present: 201,
    in_transit_qty_present: 201,
    normal_stock_qty_present: 201,
    stock_amount_present: 201,
    sales_qty_7days_present: 201,
    sales_qty_7days_avg_present: 201,
    sales_qty_30days_present: 201,
    sales_qty_30days_avg_present: 201,
    stock_qty: 12060,
    in_transit_qty: 2412,
    normal_stock_qty: 12060,
    stock_amount: 120600,
    sales_qty_7days: 5628,
    sales_qty_7days_avg: 804,
    sales_qty_30days: 24120,
    sales_qty_30days_avg: 804,
    earliest_inventory_date: date,
    latest_inventory_date: date,
    missing_inventory_date_count: 0,
    no_sales_sku_count: 0,
  };
  const exportQuery = q.inventoryDailyDetails(date, [], [customer]);
  const fullRoutes = new Map<string, Record<string, string | number | null | undefined>[]>([
    [q.latestSnapshot([customer]).sql, [{ snapshot_date: date }]],
    [q.latestInventoryDailySnapshot([customer]).sql, [{ stat_date: date }]],
    [q.customers(date, '', customer).sql, [{ cust_code: customer, cust_name: '客户A' }]],
    [q.planMonths(date, [customer]).sql, [{ plan_month: month }]],
    [q.dashboard(date, month, [customer], date).sql, mains],
    [q.summary(date, month, [customer]).sql, [summary]],
    [
      q.customerSummaries(date, month, [customer]).sql,
      [{ ...summary, cust_code: customer, cust_name: '客户A' }],
    ],
    [
      q.categorySummaries(date, month, date, [customer]).sql,
      [
        {
          ...summary,
          product_categ_name: '汤圆',
          category_actual_stock_qty: 12060,
          category_actual_transit_qty: 2412,
          category_risk_valid_count: 201,
          category_normal_stock_qty: 12060,
          category_sales_qty_30days: 24120,
          category_stock_amount: 120600,
          daily_matched_sku_count: 201,
        },
      ],
    ],
    [q.shortageDetails(date, month, [customer]).sql, mains],
    [exportQuery.sql, days],
    [q.inventoryDailySummary(date, [customer]).sql, [dailySummary]],
    [
      q.inventoryDailyCustomerSummaries(date, [customer]).sql,
      [{ ...dailySummary, cust_code: customer, cust_name: '客户A' }],
    ],
    [
      q.inventoryDailyDetails(
        date,
        mains
          .slice(0, 10)
          .map((row) => ({ customerCode: customer, materialCode: row.material_code })),
      ).sql,
      days.slice(0, 10),
    ],
  ]);
  const p = parameters.parameters ?? {};
  const customerValues = Object.entries(p)
    .filter(([key]) => /customer/i.test(key) && !/search/i.test(key))
    .map(([, value]) => value);
  if (customerValues.some((value) => value !== customer))
    throw Error('MOCK_CUSTOMER_SCOPE_FORBIDDEN');
  for (const scope of [[], [customer]]) {
    fullRoutes.set(q.latestSnapshot(scope).sql, [{ snapshot_date: date }]);
    fullRoutes.set(q.snapshotMonths(scope).sql, [{ snapshot_date: date, plan_month: month }]);
    fullRoutes.set(q.latestInventoryDailySnapshot(scope).sql, [{ stat_date: date }]);
    fullRoutes.set(q.summary(date, month, scope).sql, [summary]);
    fullRoutes.set(q.inventoryDailySummary(date, scope).sql, [dailySummary]);
  }
  const keys = Object.entries(p)
    .filter(([key]) => /^dailyMaterialCode[0-9]+$/.test(key))
    .map(([, value]) => ({ customerCode: customer, materialCode: String(value) }));
  if (keys.length)
    fullRoutes.set(
      q.inventoryDailyDetails(date, keys).sql,
      days.filter((row) => keys.some((key) => key.materialCode === row.material_code)),
    );
  const search = String(p.customerSearch ?? '').replace(/^%|%$/g, '');
  fullRoutes.set(
    q.customers(date, search, p.exactCustomerCode ? customer : '').sql,
    !search || `${customer}客户A`.toLowerCase().includes(search)
      ? [{ cust_code: customer, cust_name: '客户A' }]
      : [],
  );
  let all = fullRoutes.get(parameters.sql);
  // These declared original master-data inputs have no fixture records. Keep their real gap visible.
  if (
    !all &&
    /FROM (agents_scm_cust_pickup_point|agents_scm_customer_car_current|agents_scm_customer_receive|agents_scm_promotion_policy_scope_view)\b/.test(
      parameters.sql,
    )
  )
    all = [];
  if (!all && /agents_scm_customer_saleable_material/.test(parameters.sql)) all = [];
  if (!all) throw Error('UNDECLARED_DEALER_MOCK_QUERY');
  const offset = (parameters.pageNo - 1) * parameters.pageSize;
  await Promise.resolve();
  options.signal?.throwIfAborted();
  return {
    rows: structuredClone(all.slice(offset, offset + parameters.pageSize)),
    total: all.length,
    returnedColumns: all.length ? Object.keys(all[0]) : [],
    rejectedColumns: [],
  };
}
