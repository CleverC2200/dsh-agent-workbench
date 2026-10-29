import { fcCycleParameters, type FcCycleRule } from './fc-cycle-rules';
import { unpackAtomicPage } from './atomic-page';
import { createAgentQueries } from './agent-query';
import { agentSqlConfig, type AgentSqlConfig } from './sql-config';

export type FactReadContext = { key: string; snapshotDate: string; configVersion: string };
export type FactInput = {
  asOf: string;
  cycleDays?: number;
  fcCycleRules?: FcCycleRule[];
  fcCycleWarehouse?: string;
  page?: number;
  pageSize?: number;
  filters?: Record<string, string>;
  customer?: string;
  readContext?: FactReadContext;
};
const fail = (code: string, message: string): never => {
  throw Object.assign(Error(message), { code });
};
const dateOnly = (day: string) => {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(day)) return fail('INVALID_PERIOD', '读取日期无效');
  const d = new Date(day + 'T00:00:00Z');
  if (!Number.isFinite(d.valueOf()) || d.toISOString().slice(0, 10) !== day)
    return fail('INVALID_PERIOD', '读取日期无效');
  return d;
};
const nextDay = (day: string) => {
  const d = dateOnly(day);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const nextMonth = (day: string) => {
  const d = dateOnly(day);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
};
function totalOf(result: any): number {
  const raw = result.rows[0]?.total;
  if (
    result.rows.length !== 1 ||
    raw == null ||
    !/^(0|[1-9]\d*)$/.test(String(raw)) ||
    !Number.isSafeInteger(Number(raw))
  )
    return fail('INVALID_COUNT', '来源计数无效，未展示不完整页');
  return Number(raw);
}
const errorInfo = (error: any) => ({
  code: error.code || error.errorCode || 'QUERY_FAILED',
  message: error.message,
  failure: error.failure,
  returnedColumns: error.returnedColumns,
  rejectedColumns: error.rejectedColumns,
});

/** Parent filters apply only to compatible source views; production bases are not warehouse ownership. */
export function initialFiltersForView(
  config: AgentSqlConfig,
  id: string,
  filters: Record<string, string>,
) {
  const view = config.sourceViews?.views.find((view: any) => view.id === id);
  return Object.fromEntries(
    Object.entries(filters).filter(
      ([key]) =>
        view?.filters.some((field: any) => field.name === key) &&
        !(key === 'base' && view.inheritProductionBaseFilter === false),
    ),
  );
}

/** A source page is independent of other domains. Display paging never feeds a full-scope calculation. */
export async function readConfiguredFacts(
  fallback: AgentSqlConfig,
  viewId: string,
  input: FactInput,
  options: {
    signal?: AbortSignal;
    execute?: any;
    summaryOnly?: boolean;
    inventoryOnly?: boolean;
    detailsOnly?: boolean;
    snapshotReads?: Map<string, Promise<any>>;
    scopeReads?: Map<string, Promise<any>>;
  } = {},
): Promise<any> {
  const config = agentSqlConfig(fallback);
  const configuredView = config.sourceViews?.views.find((v: any) => v.id === viewId);
  const view =
    options.summaryOnly &&
    configuredView?.overviewSummaryId &&
    Object.values(input.filters ?? {}).every((value) => !value.trim()) &&
    !input.customer?.trim()
      ? {
          ...configuredView,
          summaryId:
            options.inventoryOnly && configuredView.inventorySummaryId
              ? configuredView.inventorySummaryId
              : configuredView.overviewSummaryId,
        }
      : configuredView;
  if (!view) return fail('VIEW_NOT_CONFIGURED', '未配置的数据视图');
  if (!view.queryId)
    return { status: 'unavailable', rows: [], total: null, viewId, description: view.description };
  dateOnly(input.asOf);
  if (view.requiresCustomer && !input.customer?.trim())
    return { status: 'select_customer', rows: [], total: null, viewId };
  const page = input.page ?? 1,
    pageSize = input.pageSize ?? 10;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !([10, 20, 50, 100].includes(pageSize) || (options.detailsOnly && pageSize === 200))
  )
    return fail('INVALID_PAGE', '分页参数无效');
  for (const [name, value] of Object.entries(input.filters ?? {}))
    if (
      !view.filters.some((f: any) => f.name === name) ||
      typeof value !== 'string' ||
      value.length > 100
    )
      return fail('INVALID_FILTER', '筛选字段或值无效');
  const client = createAgentQueries(config, options.execute),
    q = config.queries[view.queryId];
  // Display reads fetch only the requested page; full-scope totals and explicit
  // export/submission reads retain their independent contracts.
  const readSize = pageSize;
  const displayOffset = (page - 1) * pageSize;
  const readOffset = displayOffset;
  let version: any,
    versionSeen = false;
  const read = async (id: string, values: Record<string, any>, snapshot = false) => {
    // Owned by one overview load, never reused across refreshes or identities.
    // Keep rejected promises too: a denied snapshot must not trigger a retry.
    const key = JSON.stringify([config.agentId, id, values]);
    const shared = snapshot ? options.snapshotReads : options.scopeReads;
    let job = shared?.get(key);
    if (!job) {
      job = client.read(id, values, {
        signal: options.signal,
        requiredColumns: config.queries[id].resultColumns,
      });
      shared?.set(key, job);
    }
    const result = await job;
    options.signal?.throwIfAborted();
    if (versionSeen && result.configVersion !== version)
      return fail('QUERY_CONFIG_CHANGED', '读取期间配置发生变化，请刷新重读');
    versionSeen = true;
    version = result.configVersion;
    return result;
  };
  const month = input.asOf.slice(0, 7) + '-01';
  const contextKey = JSON.stringify([
    config.agentId,
    viewId,
    input.asOf,
    input.customer?.trim() ?? '',
    input.cycleDays,
    input.fcCycleRules,
    input.fcCycleWarehouse,
    Object.entries(input.filters ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  ]);
  let snapshotDate: string | null = null;
  if (view.snapshotQuery || view.timeMode === 'stock' || view.timeMode === 'health') {
    const stock = view.timeMode === 'stock';
    const previous = input.readContext;
    if (
      previous?.key === contextKey &&
      typeof previous.configVersion === 'string' &&
      previous.configVersion
    ) {
      snapshotDate = previous.snapshotDate;
      version = previous.configVersion;
      versionSeen = true;
    } else {
      const snapshotId = view.snapshotQuery ?? (stock ? 'source.stock-date' : 'source.health-date');
      const snapshotValues = Object.fromEntries(
        Object.entries(config.queries[snapshotId].parameterSpec).map(([key, spec]: any) => {
          let value = config.queries[snapshotId].request.parameters[key];
          if (spec.name === 'as_of') value = input.asOf;
          if (spec.name === 'month') value = month;
          if (spec.format === 'YYYYMM' && typeof value === 'string')
            value = value.slice(0, 7).replace('-', '');
          return [spec.name, value];
        }),
      );
      const result = await read(snapshotId, snapshotValues, true);
      snapshotDate = result.rows[0]?.day ?? null;
    }
    if (!snapshotDate)
      return {
        status: 'empty',
        rows: [],
        total: 0,
        viewId,
        message: '所选读取时点之前没有可用快照。',
        snapshotDate: null,
      };
    dateOnly(snapshotDate);
    if (snapshotDate > input.asOf || (stock && !snapshotDate.startsWith(month.slice(0, 7))))
      return fail('INVALID_SOURCE_DATE', '来源快照不在所选读取范围内');
  }
  const readContext =
    snapshotDate && typeof version === 'string' && version
      ? { key: contextKey, snapshotDate, configVersion: version }
      : undefined;
  const rollingDate = dateOnly(input.asOf);
  rollingDate.setUTCDate(rollingDate.getUTCDate() - 29);
  const rollingStart = rollingDate.toISOString().slice(0, 10);
  const filters = input.filters ?? {};
  const values: Record<string, any> = {};
  const cycleParameters = fcCycleParameters(input.fcCycleRules);
  for (const [key, spec] of Object.entries(q.parameterSpec) as Array<[string, any]>) {
    const name = spec.name;
    let value = structuredClone(q.request.parameters[key]);
    if (name.startsWith('fc_cycle_')) value = cycleParameters[name];
    if (name === 'start') value = month;
    if (name === 'as_of') value = input.asOf;
    if (name === 'shipment_start') value = month < rollingStart ? month : rollingStart;
    if (name === 'shipment_month_start') value = month;
    if (name === 'rolling_start') value = rollingStart;
    if (name === 'batch_rolling_start') {
      const from = dateOnly(snapshotDate ?? input.asOf);
      from.setUTCDate(from.getUTCDate() - 29);
      value = from.toISOString().slice(0, 10);
    }
    if (name === 'batch_end_exclusive') value = nextDay(snapshotDate ?? input.asOf);
    if (name === 'shipment_end_exclusive') value = nextDay(input.asOf);
    if (name === 'end_exclusive')
      value = spec.format === 'YYYYMM' ? nextMonth(month) : nextDay(input.asOf);
    if (name === 'month') value = month;
    if (name === 'next_month') value = nextMonth(month);
    if (name === 'days_in_month')
      value = new Date(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
      ).getUTCDate();
    if (name === 'days_remaining_in_month') {
      const day = dateOnly(input.asOf);
      value =
        new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate() -
        day.getUTCDate();
    }
    if (name === 'next_days_in_month') {
      const next = nextMonth(month);
      value = new Date(
        Date.UTC(Number(next.slice(0, 4)), Number(next.slice(5, 7)), 0),
      ).getUTCDate();
    }
    if (name === 'stock_date' || name === 'stat_date') value = snapshotDate;
    if (name === 'fc_cycle_warehouse') value = input.fcCycleWarehouse ?? '';
    if (name === 'cycle_days' && input.cycleDays !== undefined) value = input.cycleDays;
    if (name === 'page_size') value = readSize;
    if (name === 'offset') value = readOffset;
    if (spec.format === 'YYYYMM' && typeof value === 'string')
      value = value.slice(0, 7).replace('-', '');
    if (spec.format === 'YYYYMMDD' && typeof value === 'string') value = value.replaceAll('-', '');
    values[name] = value;
  }
  Object.assign(values, view.overrides);
  for (const [name, raw] of Object.entries(filters)) {
    const value = raw.trim();
    if (!value) continue;
    if (name === 'search') values.search_pattern = '%' + value.replace(/[\\%_]/g, '\\$&') + '%';
    else if (name === 'base') {
      values.bases_enabled = true;
      values.bases = value
        .split(',')
        .map((base) => base.trim())
        .filter(Boolean);
    } else if (name + '_mode' in values) {
      values[name + '_mode'] = 'equal';
      values[name] = value;
    } else if (name in values) values[name] = value;
    else return fail('INVALID_FILTER', '该查询不支持此筛选：' + name);
  }
  if (view.requiresCustomer || (view.optionalCustomer && input.customer?.trim())) {
    values.customer = input.customer!.trim();
    if ('customer_mode' in values) values.customer_mode = 'equal';
  }
  const subset = (id: string) =>
    Object.fromEntries(
      Object.values(config.queries[id].parameterSpec).map((s: any) => [s.name, values[s.name]]),
    );
  // A single aggregate already computes its own scope count in the same SQL
  // statement. Extra counts neither improve that snapshot nor validate details
  // (none are requested). Keep the paired counts for displayed detail pages.
  if (
    options.summaryOnly &&
    view.summaryId &&
    config.queries[view.summaryId].resultColumns.includes('row_count')
  ) {
    const aggregate = await read(view.summaryId, subset(view.summaryId));
    const total = totalOf({ rows: aggregate.rows.map((row: any) => ({ total: row.row_count })) });
    return {
      status: total ? 'available' : 'empty',
      rows: [],
      total,
      page,
      pageSize,
      viewId,
      summary: total ? aggregate.rows[0] : null,
      summaryError: null,
      snapshotDate,
      readContext,
      configVersion: version,
      returnedColumns: aggregate.returnedColumns,
      rejectedColumns: aggregate.rejectedColumns,
      source: aggregate.source,
      authorization: aggregate.authorization,
      consistency: 'single_statement_aggregate',
      queryId: view.summaryId,
      parameters: values,
      period:
        view.timeMode === 'current'
          ? null
          : view.timeMode === 'month'
            ? { month: month.slice(0, 7) }
            : { start: month, end: input.asOf },
      rowScope: 'summary_only',
    };
  }
  const countId = q.pagination?.countQuery;
  if (!countId) return fail('INVALID_COLLECTION_CONTRACT', '分页缺少配对计数');
  // The aggregate reads the full filter scope independently of the ten-row page.
  const readSummary = async () => {
    if (!view.summaryId || options.detailsOnly) return { summary: null, summaryError: null };
    try {
      const aggregate = await read(view.summaryId, subset(view.summaryId));
      if (aggregate.rows.length !== 1) return fail('INVALID_SUMMARY', '汇总未返回唯一记录');
      return { summary: aggregate.rows[0], summaryError: null };
    } catch (error: any) {
      if (options.signal?.aborted || error.code === 'QUERY_CONFIG_CHANGED') throw error;
      return { summary: null, summaryError: errorInfo(error) };
    }
  };
  // This auxiliary source cannot remove independently authorized stock rows.
  const readProduction = async () => {
    if (!view.productionQueryId) return { rows: [], error: null, configVersion: undefined };
    const productionValues: Record<string, unknown> = {
      bases_enabled: values.bases_enabled,
      bases: values.bases,
      sku: values.sku,
    };
    for (let i = 0; i < 7; i++) {
      const day = dateOnly(input.asOf);
      day.setUTCDate(day.getUTCDate() + i);
      productionValues['production_day_' + i] = day.toISOString().slice(0, 10).replaceAll('-', '');
    }
    try {
      const result = await client.read(view.productionQueryId, productionValues, {
        signal: options.signal,
        requiredColumns: config.queries[view.productionQueryId].resultColumns,
      });
      return { rows: result.rows, error: null, configVersion: result.configVersion };
    } catch (error: any) {
      if (options.signal?.aborted) throw error;
      return { rows: [], error: errorInfo(error), configVersion: undefined };
    }
  };
  if (!options.summaryOnly && q.pagination?.atomicQuery) {
    const id = q.pagination.atomicQuery;
    const [result, { summary, summaryError }, production] = await Promise.all([
      read(id, subset(id)),
      readSummary(),
      readProduction(),
    ]);
    if (
      !production.error &&
      production.configVersion &&
      production.configVersion !== result.configVersion
    ) {
      production.rows = [];
      production.error = errorInfo(
        Object.assign(Error('排程配置版本发生变化'), { code: 'QUERY_CONFIG_CHANGED' }),
      );
    }
    const block = unpackAtomicPage(result, readOffset / readSize + 1, readSize);
    const total = block.total;
    const rows = block.rows.slice(
      displayOffset - readOffset,
      displayOffset - readOffset + pageSize,
    );
    options.signal?.throwIfAborted();
    return {
      status: total ? 'available' : 'empty',
      rows: view.productionQueryId
        ? rows.map((row: Record<string, unknown>) => {
            const matches = production.rows.filter(
              (p: Record<string, unknown>) => p.base === row.base,
            );
            return matches.length === 1 ? { ...row, ...matches[0] } : row;
          })
        : rows,
      supplementaryError: production.error,
      total,
      page,
      pageSize,
      viewId,
      summary,
      summaryError,
      snapshotDate,
      readContext,
      configVersion: version,
      returnedColumns: result.returnedColumns,
      rejectedColumns: result.rejectedColumns,
      source: result.source,
      authorization: result.authorization,
      consistency: 'single_statement_page',
      period:
        view.timeMode === 'current'
          ? null
          : view.timeMode === 'month'
            ? { month: month.slice(0, 7) }
            : { start: month, end: input.asOf },
      queryId: id,
      parameters: values,
      rowScope: 'current_server_page',
    };
  }
  const before = await read(countId, subset(countId)),
    total = totalOf(before);
  // An empty scope needs no detail/aggregate scan. Keep the second count and
  // config check; zero rows must not conceal a source change or imply permission
  // to return detail columns that were never requested.
  const [result, { summary, summaryError }] =
    total === 0
      ? [
          { rows: [], source: before.source, authorization: before.authorization },
          { summary: null, summaryError: null },
        ]
      : await Promise.all([
          options.summaryOnly
            ? Promise.resolve({
                rows: [],
                source: before.source,
                authorization: before.authorization,
              })
            : read(view.queryId, values),
          readSummary(),
        ]);
  if (
    !options.summaryOnly &&
    result.rows.length !== Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize))
  )
    return fail('RESULT_INCOMPLETE', '分页行数与计数不一致，请刷新重读');
  if (totalOf(await read(countId, subset(countId))) !== total)
    return fail('SOURCE_CHANGED', '读取期间来源计数变化，请刷新重读');
  options.signal?.throwIfAborted();
  return {
    status: total ? 'available' : 'empty',
    rows: result.rows,
    total,
    page,
    pageSize,
    viewId,
    summary,
    summaryError,
    snapshotDate,
    readContext,
    configVersion: version,
    returnedColumns: result.returnedColumns,
    rejectedColumns: result.rejectedColumns,
    source: result.source,
    authorization: result.authorization,
    consistency: 'count_checked_not_atomic_snapshot',
    // Dates do not filter undated current master/plan facts.
    period:
      view.timeMode === 'current'
        ? null
        : view.timeMode === 'month'
          ? { month: month.slice(0, 7) }
          : { start: month, end: input.asOf },
    queryId: view.queryId,
    parameters: values,
    rowScope: options.summaryOnly ? 'summary_only' : 'current_server_page',
  };
}

export function factMetric(summary: any, metric: any) {
  const value = summary?.[metric.field];
  if (value == null || value === '' || (metric.missing && Number(summary?.[metric.missing]) > 0))
    return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
