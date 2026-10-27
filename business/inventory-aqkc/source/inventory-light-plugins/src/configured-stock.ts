import { inventoryAverageAge } from '../../../../shared/inventory-age';
import { unpackAtomicPage } from '../../../../shared/atomic-page';
import sqlConfiguration from '../../../sql.config.json';
import { createAgentQueries } from '../../../../shared/agent-query';
import { agentSqlConfig } from '../../../../shared/sql-config';
import { readWorkspaceQuery } from '../../../../shared/workspace-query';
import { knownNumber } from '../../../../shared/configured-overview';
import {
  resolveInitialSafetyStockScope,
  type SafetyStockScope,
} from '../../aqkc/web/src/lib/safety-stock-scope';
import type { WorkbenchSqlQuery } from '../../aqkc/web/src/lib/workbench-sql-types';

/** Map verified facts into the existing page contract, retaining the page's month/version policy. */
export async function readConfiguredStock(
  query: WorkbenchSqlQuery,
  options: { signal?: AbortSignal; execute?: any; now?: Date } = {},
) {
  const config = agentSqlConfig(sqlConfiguration),
    binding = config.workspaceBindings[query.name];
  if (!binding)
    throw Object.assign(
      Error(
        config.workspaceUnavailable?.[query.name] ??
          '新库尚无该指标的等价基础事实：' + query.name + '；缺失不按零处理',
      ),
      { code: 'SOURCE_NOT_AVAILABLE' },
    );
  const now = options.now ?? new Date();
  const end = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const client = createAgentQueries(config, options.execute);
  if (binding.resultKind !== 'stock') {
    const rows = await readWorkspaceQuery(
      config,
      query.name,
      { start: end.slice(0, 7) + '-01', end, version: '滚动', order_type: 'M' },
      options,
    );
    return rows.map((row: any) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [binding.resultAliases?.[key] ?? key, value]),
      ),
    );
  }
  const versions = await client.readAll(
    'calendar.target_versions',
    { page_size: 200, offset: 0 },
    {
      signal: options.signal,
      keyFields: ['month', 'inventory_version'],
      requiredColumns: ['month', 'inventory_version'],
      maxRows: 10000,
      singlePageFirst: true,
    },
  );
  const calendar = versions.rows.map((r: any) => ({
    'safety_stock.target_month': r.month,
    'safety_stock.inventory_version': r.inventory_version,
  }));
  const scope = resolveInitialSafetyStockScope(calendar, now);
  if (query.name === 'workbench-scope') return calendar;
  if (!scope.published)
    throw Object.assign(Error('当前没有可用的目标月份/版本；不能伪造目标发布状态'), {
      code: 'SOURCE_NOT_AVAILABLE',
    });
  const stockMonth = end.slice(0, 7) + '-01';
  const latest = await client.read(
    'source.stock-date',
    { month: stockMonth, as_of: end },
    { signal: options.signal, requiredColumns: ['day'] },
  );
  if (latest.configVersion !== versions.configVersion)
    throw Object.assign(Error('目标版本与库存日期读取期间配置发生变化，请刷新重读'), {
      code: 'QUERY_CONFIG_CHANGED',
    });
  const day = latest.rows[0]?.day;
  if (
    typeof day !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    day > end ||
    !day.startsWith(stockMonth.slice(0, 7))
  )
    throw Object.assign(Error('所选读取时点之前无有效日库存快照'), {
      code: 'SOURCE_NOT_AVAILABLE',
    });
  const q = config.queries[binding.queryId];
  const values: Record<string, any> = Object.fromEntries(
    Object.entries(q.parameterSpec).map(([key, spec]: any) => [
      spec.name,
      structuredClone(q.request.parameters[key]),
    ]),
  );
  Object.assign(values, {
    month: scope.targetMonth,
    inventory_version: scope.versions[0],
    stock_date: day,
    stock_month: stockMonth,
    page_size: binding.pageSize ?? 200,
    offset: 0,
  });
  if (query.name === 'workbench-safety-stock-base-retry') {
    values.bases_enabled = true;
    values.bases = [query.parameters?.gea_p1];
  }
  const result = await client.readAll(binding.queryId, values, {
    signal: options.signal,
    keyFields: binding.keyFields,
    requiredColumns: q.resultColumns,
    maxRows: 50000,
  });
  if (result.configVersion !== versions.configVersion)
    throw Object.assign(Error('目标版本与库存明细读取期间配置发生变化，请刷新重读'), {
      code: 'QUERY_CONFIG_CHANGED',
    });
  return result.rows.map((row: any) => ({
    ...Object.fromEntries(
      Object.entries(config.resultAliases as Record<string, string>).map(([alias, source]) => [
        alias,
        row[source] ?? null,
      ]),
    ),
    // Stock-only keys stay in the view; this label identifies the selected comparison version, not a fabricated target.
    'safety_stock.inventory_version': row.effective_version ?? scope.versions[0],
    'safety_stock.id': JSON.stringify([row.base, row.sku]),
    'safety_stock.source': row.target_source_rows > 0 ? 'ai-db-daily-stock' : 'ai-db-stock-only',
    'safety_stock.record_count': 1,
    'safety_stock.last_30d_shipment_quantity': row.rolling_ship_positive ?? null,
  }));
}

export type StockPageContext = {
  asOf: string;
  targetMonth: string;
  version: string;
  stockMonth: string;
  stockDate: string;
  configVersion: string;
};
type ResolvedStockScope = { context: StockPageContext; scope: SafetyStockScope };
let readCycle:
  | { signal: AbortSignal; day?: string; pending?: Promise<ResolvedStockScope> }
  | undefined;
/** Pin business date/version metadata for this page's refresh cycle, never rows or authorization. */
export function startConfiguredStockReadCycle(signal?: AbortSignal) {
  readCycle = signal ? { signal } : undefined;
}
async function resolveStockContext(
  client: ReturnType<typeof createAgentQueries>,
  now: Date,
  signal?: AbortSignal,
): Promise<ResolvedStockScope> {
  const cycle = readCycle;
  cycle?.signal.throwIfAborted();
  signal?.throwIfAborted();
  const end = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(now);
  const load = async () => {
    // Metadata belongs to the refresh cycle. Cancelling one drill must not
    // poison another drill waiting for the same date/version resolution.
    const readSignal = cycle?.signal ?? signal;
    const month = end.slice(0, 7) + '-01';
    const [versions, latest] = await Promise.all([
      client.readAll(
        'calendar.target_versions',
        { page_size: 200, offset: 0 },
        {
          signal: readSignal,
          keyFields: ['month', 'inventory_version'],
          requiredColumns: ['month', 'inventory_version'],
          maxRows: 10000,
          singlePageFirst: true,
        },
      ),
      client.read(
        'source.stock-date',
        { month, as_of: end },
        { signal: readSignal, requiredColumns: ['day'] },
      ),
    ]);
    if (latest.configVersion !== versions.configVersion)
      throw Object.assign(Error('配置已变化，请刷新重读'), { code: 'QUERY_CONFIG_CHANGED' });
    const scope = resolveInitialSafetyStockScope(
      versions.rows.map((r: any) => ({
        'safety_stock.target_month': r.month,
        'safety_stock.inventory_version': r.inventory_version,
      })),
      now,
    );
    if (!scope.published)
      throw Object.assign(Error('当前没有可用的目标月份/版本'), { code: 'SOURCE_NOT_AVAILABLE' });
    const day = latest.rows[0]?.day;
    if (
      typeof day !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      day > end ||
      !day.startsWith(end.slice(0, 7))
    )
      throw Object.assign(Error('无有效库存快照'), { code: 'INVALID_SOURCE_DATE' });
    return {
      scope,
      context: {
        asOf: end,
        targetMonth: scope.targetMonth,
        version: scope.versions[0],
        stockMonth: month,
        stockDate: day,
        configVersion: latest.configVersion,
      },
    };
  };
  if (cycle && (cycle.day !== end || !cycle.pending)) {
    cycle.day = end;
    cycle.pending = load();
  }
  const result = await (cycle?.pending ?? load());
  cycle?.signal.throwIfAborted();
  signal?.throwIfAborted();
  return structuredClone(result);
}
export type StockPageInput = {
  readContext?: StockPageContext;
  base: string;
  category?: string;
  query?: string;
  exactSku?: string;
  risks?: string[];
  tab?: string;
  page?: number;
  pageSize?: number;
  sort?: { key: string; direction: 'asc' | 'desc' };
};
export const stockPageSortFields: Record<string, string> = {
  current: 'inventory',
  target: 'target',
  gap: 'gap',
  currentTurnover: 'current_days',
  targetTurnover: 'target_days',
  dailyDemand: 'daily_demand',
  last30d: 'stock_avg_30d_sale',
  orderFillRate: 'fill_rate',
  age60Plus: 'over60',
  safety: 'safety_stock',
  turnover: 'turnover_inventory',
};
export function configuredStockRows(rows: any[], version: string) {
  const config = agentSqlConfig(sqlConfiguration);
  return rows.map((row) => ({
    ...Object.fromEntries(
      Object.entries(config.resultAliases as Record<string, string>).map(([alias, source]) => [
        alias,
        row[source] ?? null,
      ]),
    ),
    'safety_stock.inventory_version': row.effective_version ?? version,
    'safety_stock.id': JSON.stringify([row.base, row.sku]),
    'safety_stock.source': row.target_source_rows > 0 ? 'ai-db-daily-stock' : 'ai-db-stock-only',
    'safety_stock.record_count': 1,
    'safety_stock.last_30d_shipment_quantity': row.rolling_ship_positive ?? null,
  }));
}

/** Fetch one displayed SKU page. Filtering, ordering and counting happen before LIMIT in SQL. */
export async function readConfiguredStockPage(
  input: StockPageInput,
  options: { signal?: AbortSignal; execute?: any; now?: Date } = {},
) {
  const config = agentSqlConfig(sqlConfiguration),
    client = createAgentQueries(config, options.execute);
  const page = input.page ?? 1,
    size = input.pageSize ?? 10;
  if (!Number.isSafeInteger(page) || page < 1 || ![10, 20, 50, 100].includes(size))
    throw Object.assign(Error('分页参数无效'), { code: 'INVALID_PAGE' });
  const risks = input.risks ?? [];
  if (input.tab === '货龄结构' && risks.length)
    throw Object.assign(
      Error('缺少批次生产日期和货龄，暂不能按货龄风险筛选；可查看实存及超60天库存'),
      { code: 'FILTER_SOURCE_UNAVAILABLE' },
    );
  if (
    risks.some(
      (r) => !['缺货', '库存偏低', '库存偏高', '缺失目标', '正常', '预警', '-'].includes(r),
    )
  )
    throw Object.assign(Error('风险筛选无效'), { code: 'INVALID_FILTER' });
  if (input.sort && !stockPageSortFields[input.sort.key])
    throw Object.assign(Error('该字段缺少完整来源，暂不能排序'), { code: 'UNAVAILABLE_SORT' });
  const now = options.now ?? new Date(),
    end = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(now);
  let context = input.readContext?.asOf === end ? input.readContext : undefined;
  if (!context) {
    context = (await resolveStockContext(client, now, options.signal)).context;
  }
  const { stockMonth: month, stockDate: day } = context;
  if (
    typeof day !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    day > end ||
    !day.startsWith(end.slice(0, 7)) ||
    month !== end.slice(0, 7) + '-01'
  )
    throw Object.assign(Error('无有效库存快照'), { code: 'SOURCE_NOT_AVAILABLE' });
  const read = async (id: string, values: Record<string, any>) => {
    const result = await client.read(id, values, {
      signal: options.signal,
      requiredColumns: config.queries[id].resultColumns,
    });
    if (result.configVersion !== context!.configVersion)
      throw Object.assign(Error('配置已变化，请刷新重读'), { code: 'QUERY_CONFIG_CHANGED' });
    return result;
  };
  const query = config.queries['page.sku-detail'];
  const values: Record<string, any> = Object.fromEntries(
    Object.entries(query.parameterSpec).map(([key, spec]: any) => [
      spec.name,
      structuredClone(query.request.parameters[key]),
    ]),
  );
  const next = new Date(end + 'T00:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  const rollingStart = new Date(end + 'T00:00:00Z');
  rollingStart.setUTCDate(rollingStart.getUTCDate() - 29);
  const bases = input.base
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const category = input.category === '未分类' ? null : input.category;
  Object.assign(values, {
    month: context.targetMonth,
    inventory_version: context.version,
    stock_month: month,
    stock_date: day,
    bases_enabled: bases.length > 0,
    bases: bases.length ? bases : ['郑州'],
    category_mode: input.category === '未分类' ? 'missing' : category ? 'equal' : 'all',
    category: category || null,
    sku_mode: input.exactSku ? 'equal' : 'all',
    sku: input.exactSku ?? null,
    search_pattern: input.query?.trim()
      ? '%' + input.query.trim().replace(/[\\%_]/g, '\\$&') + '%'
      : null,
    risk_enabled: risks.length > 0,
    risks: risks.length ? risks : ['正常'],
    age_only: input.tab === '货龄结构',
    sort_field: input.sort ? stockPageSortFields[input.sort.key] : 'sku',
    sort_direction: input.sort?.direction ?? 'asc',
    page_size: size,
    offset: (page - 1) * size,
    rolling_start: rollingStart.toISOString().slice(0, 10).replaceAll('-', ''),
    shipment_end_exclusive: next.toISOString().slice(0, 10).replaceAll('-', ''),
    order_start: month,
    order_end_exclusive: next.toISOString().slice(0, 10),
    order_bases_enabled: bases.length > 0,
    order_bases: bases.length ? bases : ['郑州'],
  });
  const subset = (id: string) =>
    Object.fromEntries(
      Object.values(config.queries[id].parameterSpec).map((s: any) => [s.name, values[s.name]]),
    );
  const count = async () => {
    const result = await read('page.sku-detail.count', subset('page.sku-detail.count'));
    const raw = result.rows[0]?.total;
    if (
      result.rows.length !== 1 ||
      !/^(0|[1-9]\d*)$/.test(String(raw)) ||
      !Number.isSafeInteger(Number(raw))
    )
      throw Object.assign(Error('计数无效'), { code: 'INVALID_COUNT' });
    return Number(raw);
  };
  const atomic = query.pagination?.atomicQuery;
  const result = await (atomic
    ? read(atomic, subset(atomic))
    : (async () => {
        const total = await count();
        const result = await read('page.sku-detail', values);
        if ((await count()) !== total)
          throw Object.assign(Error('读取期间数据变化，请刷新'), { code: 'SOURCE_CHANGED' });
        return { ...result, legacyTotal: total };
      })());
  const pageResult = atomic
    ? unpackAtomicPage(result, page, size)
    : { rows: result.rows, total: result.legacyTotal };
  const total = pageResult.total;
  result.rows = pageResult.rows;
  if (result.rows.length !== Math.min(size, Math.max(0, total - values.offset)))
    throw Object.assign(Error('分页数据不完整'), { code: 'RESULT_INCOMPLETE' });
  if (
    new Set(result.rows.map((r: any) => JSON.stringify([r.base, r.sku]))).size !==
    result.rows.length
  )
    throw Object.assign(Error('分页出现重复SKU'), { code: 'UNSTABLE_PAGINATION' });
  return {
    rows: configuredStockRows(result.rows, context.version),
    facts: result.rows,
    total,
    page,
    pageSize: size,
    configVersion: result.configVersion,
    readContext: context,
  };
}

/** Batch aggregates supply base list ages and the quantity-weighted average-age card in two reads. */
export async function readConfiguredHealthSummary(
  bases: string[] | undefined,
  signal?: AbortSignal,
) {
  const config = agentSqlConfig(sqlConfiguration);
  const client = createAgentQueries(config);
  const asOf = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
  const latest = await client.read(
    'source.health-date',
    { as_of: asOf },
    { signal, requiredColumns: ['day'] },
  );
  const snapshotDate = latest.rows[0]?.day;
  if (snapshotDate == null) return { rows: [], summary: null, snapshotDate: null };
  if (
    typeof snapshotDate !== 'string' ||
    !/^20\d{2}-\d{2}-\d{2}$/.test(snapshotDate) ||
    snapshotDate > asOf
  )
    throw Object.assign(Error('无有效库存快照'), { code: 'INVALID_SOURCE_DATE' });
  const query = config.queries['page.health-groups'];
  const result = await client.read(
    'page.health-groups',
    {
      stat_date: snapshotDate,
      bases_enabled: Boolean(bases?.length),
      bases: bases?.length ? bases : [''],
      warehouse_code: null,
      material_code: null,
    },
    { signal, requiredColumns: query.resultColumns },
  );
  if (result.configVersion !== latest.configVersion)
    throw Object.assign(Error('配置已变化，请刷新重读'), { code: 'QUERY_CONFIG_CHANGED' });
  const rows = result.rows.map((row: any) => ({
    level: row.level,
    average_age: knownNumber(row.average_age),
    weighted_age_sum: knownNumber(row.weighted_age_sum),
    age_weight_qty: knownNumber(row.age_weight_qty),
    unknown_age_qty: knownNumber(row.unknown_age_qty),
    max_age: knownNumber(row.max_age),
    row_count: knownNumber(row.row_count) ?? 0,
    age_valid_count: knownNumber(row.age_valid_count) ?? 0,
  }));
  const ages = rows.flatMap((row: any) => (row.max_age === null ? [] : [row.max_age]));
  return {
    ...result,
    rows,
    snapshotDate,
    summary: rows.length
      ? {
          average_age: inventoryAverageAge(...rows),
          max_age: ages.length ? Math.max(...ages) : null,
          row_count: rows.reduce((n: number, row: any) => n + row.row_count, 0),
          age_valid_count: rows.reduce((n: number, row: any) => n + row.age_valid_count, 0),
        }
      : null,
  };
}

/** Server aggregates preserve per-SKU target rules before reducing transport volume. */
export async function readConfiguredStockSummary(
  selectedBases?: string[],
  options: {
    signal?: AbortSignal;
    execute?: any;
    now?: Date;
    onInventory?: (value: {
      groups: Record<string, unknown>[];
      scope: Awaited<ReturnType<typeof resolveStockContext>>['scope'];
      day: string;
    }) => void;
    structure?: { groupBy: 'base' | 'category'; category?: string; stockOnly?: boolean };
  } = {},
) {
  const config = agentSqlConfig(sqlConfiguration),
    client = createAgentQueries(config, options.execute);
  const now = options.now ?? new Date();
  const { scope, context } = await resolveStockContext(client, now, options.signal);
  const { stockMonth, stockDate: day } = context;
  const id = options.structure ? 'page.structure-groups' : 'page.dashboard-groups',
    q = config.queries[id];
  const values = Object.fromEntries(
    Object.entries(q.parameterSpec).map(([k, s]: any) => [
      s.name,
      structuredClone(q.request.parameters[k]),
    ]),
  );
  Object.assign(values, {
    month: scope.targetMonth,
    inventory_version: scope.versions[0],
    stock_date: day,
    stock_month: stockMonth,
    page_size: 200,
    offset: 0,
  });
  if (selectedBases?.length) Object.assign(values, { bases_enabled: true, bases: selectedBases });
  if (options.structure)
    Object.assign(values, {
      bases_enabled: true,
      bases: selectedBases?.length
        ? selectedBases
        : ['华东', '华南', '西南', '遂平', '郑州', '濮阳'],
      group_level: options.structure.groupBy,
      structure_category: options.structure.category || null,
      stock_only: !!options.structure.stockOnly,
    });
  let fullReady = false;
  const inventory = (async () => {
    if (!options.onInventory || options.structure || !config.queries['page.inventory-groups'])
      return;
    const quickQuery = config.queries['page.inventory-groups'];
    const quickValues = Object.fromEntries(
      Object.values(quickQuery.parameterSpec).map((spec: any) => [spec.name, values[spec.name]]),
    );
    const quick = await client.readAll('page.inventory-groups', quickValues, {
      signal: options.signal,
      keyFields: ['base', 'category'],
      requiredColumns: quickQuery.resultColumns,
      maxRows: 10000,
      singlePageFirst: true,
    });
    if (quick.configVersion !== context.configVersion)
      throw Object.assign(Error('配置已变化，请刷新重读'), { code: 'QUERY_CONFIG_CHANGED' });
    options.signal?.throwIfAborted();
    if (!fullReady) options.onInventory({ groups: quick.rows, scope, day });
  })();
  const inventorySettled = inventory.catch(() => undefined);
  const complete = client
    .readAll(id, values, {
      signal: options.signal,
      keyFields: options.structure ? ['level'] : ['base', 'category'],
      requiredColumns: q.resultColumns,
      maxRows: 10000,
      singlePageFirst: true,
    })
    .then((result) => {
      if (result.configVersion !== context.configVersion)
        throw Object.assign(Error('配置已变化，请刷新重读'), { code: 'QUERY_CONFIG_CHANGED' });
      fullReady = true;
      return result;
    });
  const result = await complete.catch(async (error) => {
    options.signal?.throwIfAborted();
    await inventorySettled;
    throw error;
  });
  if (result.configVersion !== context.configVersion)
    throw Object.assign(Error('配置已变化，请刷新重读'), { code: 'QUERY_CONFIG_CHANGED' });
  return {
    groups: result.rows.map((r: any) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [
          k,
          ['base', 'category', 'level'].includes(k) || v === null ? v : Number(v),
        ]),
      ),
    ),
    scope,
    day,
  };
}
