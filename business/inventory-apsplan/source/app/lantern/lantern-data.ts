import { businessDay } from '../../../../shared/business-day';
import { createAgentQueries } from '../../../../shared/agent-query';
import { inFlightQueries } from '../../../../shared/in-flight-query';
import {
  configuredQueryFreshAfter,
  configuredQueryIdentity,
  subscribeQueryIdentity,
} from '../../../../shared/query-cache';
import { agentSqlConfig } from '../../../../shared/sql-config';
import { deriveMetrics } from 'dsh-agent-manage/aps-compute/metrics';
import configuredSql from '../../../sql.config.json';

export type DateRange = { from: string; to: string };
export type PeriodView = 'year' | 'month' | 'week' | 'day';
export type DashboardModule = 'sales' | 'production' | 'inventory';
export type InventoryScope = 'all' | 'base' | 'branch' | 'customer';
export type DashboardPeriod = { view: PeriodView; range: DateRange };
export type MetricKey =
  | 'budget'
  | 'accuracy'
  | 'cancellation'
  | 'amendment'
  | 'ontime'
  | 'production'
  | 'fulfillment'
  | 'inventory'
  | 'age'
  | 'stockValue'
  | 'freshness'
  | 'largeDate';
type Source =
  | 'budget'
  | 'accuracy'
  | 'cancellation'
  | 'amendment'
  | 'ontime'
  | 'ontimeOrganization'
  | 'production'
  | 'fulfillment'
  | 'base'
  | 'branch'
  | 'customer';

type Row = Record<string, unknown>;
type SourceResult =
  | { status: 'ready'; rows: Row[]; date?: string }
  | { status: 'failed'; reason: string };

export type LanternFacts = Partial<Record<Source, SourceResult>>;
export type Scope = {
  base?: string;
  organization?: readonly string[];
  product?: readonly string[];
};
export type ProductFilters = {
  category: string;
  series: string;
  group: string;
  sku: string;
  level: number;
};
export type Observation = {
  value: number | null;
  date?: string;
  details?: readonly (readonly [string, number | null])[];
  note?: string;
  failed?: boolean;
};

const config = agentSqlConfig(configuredSql);
const sources = {
  sales: ['accuracy', 'budget', 'amendment', 'ontime', 'cancellation', 'ontimeOrganization'],
  production: ['production', 'fulfillment'],
  inventory: ['base', 'branch', 'customer'],
} satisfies Record<DashboardModule, readonly Source[]>;

export const sourceLabels: Record<Source, string> = {
  budget: '销售预算',
  accuracy: '销售提报准确率',
  cancellation: '作废率',
  amendment: '改单率',
  ontime: '准交率',
  ontimeOrganization: '销售组织准交率',
  production: '生产计划与实绩',
  fulfillment: '订单满足率',
  base: '基地库存',
  branch: '分仓库存',
  customer: '客户库存',
};
const durationDay = 86_400_000;
const compact = (day: string) => day.replaceAll('-', '');
const monthStart = (day: string) => day.slice(0, 7) + '-01';
export function shiftDay(day: string, count: number) {
  return new Date(Date.parse(day + 'T00:00:00Z') + count * durationDay).toISOString().slice(0, 10);
}
export const latestBusinessDate = () => shiftDay(businessDay(), -1);
const shiftMonth = (day: string, count: number) => {
  const date = new Date(monthStart(day) + 'T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + count);
  return shiftDay(date.toISOString().slice(0, 10), 0);
};
const number = (value: unknown) => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const known = (rows: readonly Row[], key: string) => {
  let total: number | null = null;
  for (const row of rows) {
    const amount = number(row[key]);
    if (amount !== null) total = (total ?? 0) + amount;
  }
  return total;
};
const complete = (rows: readonly Row[], key: string) =>
  rows.every((row) => number(row[key]) !== null) ? known(rows, key) : null;
const ratio = (numerator: number | null, denominator: number | null, scale = 100) =>
  numerator === null || denominator === null || denominator <= 0
    ? null
    : (numerator / denominator) * scale;
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const sourceDate = (value: unknown) => {
  const day = text(value)
    .replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
    .slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
};

const recentReads = new Map<string, { expires: number; rows: Row[] }>();
const pendingReads = inFlightQueries<Row[]>();
subscribeQueryIdentity(() => recentReads.clear());

function queryFailureText(error: unknown): string {
  const parts: string[] = [];
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if ('code' in cause) parts.push(String(cause.code));
    parts.push(cause.message);
  }
  return parts.join(' ');
}

const restrictedQuery = /PERMISSION|DENIED|NOT_PUBLISHED|NOT_IN_DATASET|RETURN_COLUMN/;
const queryTimeout = /\bGEA_SQL_QUERY_TIMEOUT\b|GEA SQL 查询超时|业务请求超时/;
const temporaryQueryUnavailable =
  /\b(?:GEA_SQL_UNAVAILABLE|PAGE_CHANNEL_UNAVAILABLE)\b|GEA SQL 查询服务暂时不可用/;

function waitForCancellationRetry(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, 350);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function read(
  client: ReturnType<typeof createAgentQueries>,
  id: string,
  overrides: Record<string, unknown>,
  signal: AbortSignal,
  keyFields: string[] | undefined,
  cacheScope: { identity: number; freshness: number } | undefined,
  background: boolean,
): Promise<Row[]> {
  const { parameterSpec, request, resultColumns } = client.config.queries[id];
  const parameters: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(parameterSpec)) {
    if (!field || typeof field !== 'object' || !('name' in field) || typeof field.name !== 'string')
      throw Error('INVALID_LANTERN_QUERY_PARAMETER');
    parameters[field.name] = request.parameters[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (Object.hasOwn(parameters, key)) parameters[key] = value;
  }
  const requiredColumns = resultColumns.filter((column: string) => column !== 'material_name');
  const cancellation = id === 'lantern.cancellation' || id === 'lantern.product-cancellation';
  const priority = cancellation && background ? -1 : undefined;
  const loadOnce = async (requestSignal: AbortSignal) => {
    if (!keyFields)
      return (
        await client.read(id, parameters, { requiredColumns, signal: requestSignal, priority })
      ).rows;
    return (
      await client.readAll(
        id,
        { ...parameters, page_size: 200, offset: 0 },
        {
          signal: requestSignal,
          keyFields,
          requiredColumns,
          maxRows: 12_000,
          singlePageFirst: true,
          priority,
        },
      )
    ).rows;
  };
  const load = async (requestSignal: AbortSignal) => {
    try {
      return await loadOnce(requestSignal);
    } catch (error) {
      requestSignal.throwIfAborted();
      const failure = queryFailureText(error);
      if (
        !cancellation ||
        background ||
        restrictedQuery.test(failure) ||
        !(queryTimeout.test(failure) || temporaryQueryUnavailable.test(failure))
      )
        throw error;
      await waitForCancellationRetry(requestSignal);
      return loadOnce(requestSignal);
    }
  };
  if (!cacheScope) return load(signal);
  signal.throwIfAborted();
  const { identity, freshness } = cacheScope;
  if (identity !== configuredQueryIdentity()) throw new DOMException('Aborted', 'AbortError');
  const key = JSON.stringify([identity, freshness, id, parameters]);
  const cached = recentReads.get(key);
  if (cached && cached.expires > Date.now()) return cached.rows;
  return pendingReads(
    key,
    async (requestSignal) => {
      const rows = await load(requestSignal);
      requestSignal.throwIfAborted();
      if (identity !== configuredQueryIdentity()) throw new DOMException('Aborted', 'AbortError');
      if (freshness === configuredQueryFreshAfter()) {
        recentReads.delete(key);
        recentReads.set(key, { expires: Date.now() + 120_000, rows });
        const oldest = recentReads.keys().next().value;
        if (recentReads.size > 48 && oldest !== undefined) recentReads.delete(oldest);
      }
      return rows;
    },
    signal,
  );
}

function supported(source: Source, period: DashboardPeriod) {
  if (source === 'budget') return period.view === 'month' || period.view === 'year';
  if (source === 'accuracy')
    return (
      (period.view === 'month' || period.view === 'year') &&
      (period.range.to === latestBusinessDate() || shiftDay(period.range.to, 1).endsWith('-01'))
    );
  if (['cancellation', 'amendment', 'ontime', 'ontimeOrganization'].includes(source))
    return ['day', 'week', 'month'].includes(period.view);
  return true;
}

export async function readLanternFacts({
  module,
  period,
  signal,
  onSource,
  only,
  inventoryScope,
  product,
  organization = false,
  background = false,
  execute,
}: {
  module: DashboardModule;
  period: DashboardPeriod;
  signal: AbortSignal;
  onSource?: (name: Source, data: SourceResult) => void;
  only?: MetricKey;
  inventoryScope?: InventoryScope;
  product?: ProductFilters;
  organization?: boolean;
  background?: boolean;
  execute?: Parameters<typeof createAgentQueries>[1];
}): Promise<LanternFacts> {
  const freshness = configuredQueryFreshAfter();
  const cacheScope = execute ? undefined : { identity: configuredQueryIdentity(), freshness };
  const client = createAgentQueries(config, execute, { freshAfter: freshness });
  const query = (id: string, overrides: Record<string, unknown>, keyFields?: string[]) =>
    read(client, id, overrides, signal, keyFields, cacheScope, background);
  const { from, to } = period.range;
  const fromMonth = monthStart(from),
    nextMonth = shiftMonth(to, 1);
  const end = shiftDay(to, 1);
  const pattern = (value = '') => {
    const search = value.trim();
    return search ? '%' + search.toLowerCase().replace(/[\\%_]/g, '\\$&') + '%' : null;
  };
  const productDimensions = {
    sku_detail: Boolean(product?.sku.trim()),
    product_pattern: pattern(product?.sku || product?.group),
    group_detail: Boolean(product && product.level >= 1),
    material_detail: Boolean(product && product.level >= 2),
    product_category: product?.category || null,
  };
  const productionDimensions = {
    ...productDimensions,
    product_series: product?.series || null,
    group_pattern: pattern(product?.group),
    sku_pattern: pattern(product?.sku),
  };
  const results: LanternFacts = {};
  let dates: Promise<Row[]> | undefined;
  const dateFor = async (source: 'base' | 'branch' | 'customer') => {
    if (source === 'customer') {
      const rows = await query('lantern.customer-date', { start_day: from, end_day: to });
      return sourceDate(rows[0]?.day);
    }
    dates ??= query('lantern.stock-dates', { start_day: compact(from), end_day: compact(to) });
    const rows = await dates;
    return (
      sourceDate(rows.find((row) => row.scope === 'all')?.day) ??
      sourceDate(rows.find((row) => row.scope === source)?.day)
    );
  };
  const get = async (source: Source): Promise<SourceResult> => {
    const ready = (rows: Row[], date?: string): SourceResult => ({ status: 'ready', rows, date });
    switch (source) {
      case 'budget':
        return ready(
          await query(
            'page.budget-performance',
            {
              start_month: compact(fromMonth).slice(0, 6),
              end_month_exclusive: compact(nextMonth).slice(0, 6),
              as_of: to,
              start: compact(from),
              end_exclusive: compact(end),
            },
            ['month'],
          ),
        );
      case 'accuracy':
        return ready(
          await query(
            'lantern.accuracy',
            {
              start_month: fromMonth,
              end_month_exclusive: nextMonth,
            },
            ['month', 'region', 'province'],
          ),
        );
      case 'cancellation':
      case 'amendment':
      case 'ontime':
        if (product)
          return ready(
            await query(
              'lantern.product-' + source,
              {
                report_base: '',
                start: from,
                end_exclusive: end,
                ...productDimensions,
              },
              ['category', 'item', 'material', 'sku'],
            ),
          );
        return ready(
          await query(
            'lantern.' + source,
            {
              report_base: '',
              start: from,
              end_exclusive: end,
            },
            source === 'ontime' ? undefined : ['base', 'region', 'province', 'kind'],
          ),
        );
      case 'ontimeOrganization':
        return ready(
          await query(
            'lantern.ontime-organization',
            {
              report_base: '',
              start: from,
              end_exclusive: end,
            },
            ['region', 'province'],
          ),
        );
      case 'production':
        return ready(
          await query(
            'lantern.production',
            {
              start: compact(from),
              end_exclusive: compact(end),
              ...productionDimensions,
            },
            ['base', 'category', 'item', 'material', 'sku'],
          ),
        );
      case 'fulfillment': {
        const monthly = period.view === 'month';
        return ready(
          await query(
            'lantern.fulfillment',
            {
              date_basis: monthly ? 'order_month' : 'created',
              start: from,
              end_exclusive: end,
              ...productionDimensions,
            },
            ['base', 'category', 'item', 'material', 'sku'],
          ),
        );
      }
      case 'base':
      case 'branch':
      case 'customer': {
        const date = await dateFor(source);
        if (!date) return ready([]);
        if (date < from || date > to) throw Error('库存快照日期超出所选范围');
        const id = source === 'customer' ? 'lantern.customer-stock' : 'lantern.stock-' + source;
        return ready(
          await query(
            id,
            {
              stat_date: date,
              ...productDimensions,
              group_detail: Boolean(product),
            },
            ['category', 'item', 'material', 'sku'],
          ),
          date,
        );
      }
    }
  };
  const names = sources[module].filter(
    (source) =>
      supported(source, period) &&
      (organization ? source === 'ontimeOrganization' : source !== 'ontimeOrganization') &&
      (!only ||
        source === only ||
        inventorySources.includes(source) ||
        (only === 'ontime' && organization)) &&
      (module !== 'inventory' ||
        !inventoryScope ||
        inventoryScope === source ||
        (inventoryScope === 'all' && (source === 'base' || source === 'branch'))),
  );
  async function queue() {
    let next: Source | undefined;
    while ((next = names.shift()) !== undefined) {
      signal.throwIfAborted();
      let result: SourceResult;
      try {
        result = await get(next);
      } catch (error) {
        signal.throwIfAborted();
        const failure = queryFailureText(error);
        result = {
          status: 'failed',
          reason: restrictedQuery.test(failure)
            ? '当前账号或指标来源未开放所需数据'
            : queryTimeout.test(failure)
              ? '查询超时，可刷新重试'
              : '查询失败',
        };
      }
      results[next] = result;
      onSource?.(next, result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, names.length) }, queue));
  return results;
}

const inventorySources: readonly Source[] = ['base', 'branch', 'customer'];
export function productPath(row: Row) {
  const parts = [
    text(row.category) || '未分类',
    text(row.item) || '未归属系列',
    text(row.material) || '未归属物料组',
  ];
  const sku = text(row.sku);
  if (sku) parts.push(sku);
  return parts;
}

function scoped(rows: Row[], scope: Scope) {
  return rows.filter((row) => {
    if (scope.base && row.base !== scope.base) return false;
    if (
      scope.product &&
      ((!Object.hasOwn(row, 'category') && !Object.hasOwn(row, 'sku')) ||
        scope.product.some((part, i) => productPath(row)[i] !== part))
    )
      return false;
    return !scope.organization?.some(
      (part, i) => text(row[['region', 'province', 'sales_group', 'sales_group'][i]]) !== part,
    );
  });
}

export function productFacts(facts: LanternFacts, keys: readonly Source[], scope: Scope = {}) {
  return keys.flatMap((name) => {
    const source = facts[name];
    return source?.status === 'ready' ? scoped(source.rows, scope) : [];
  });
}

export function observe(
  key: MetricKey,
  facts: LanternFacts,
  period: DashboardPeriod,
  scope: Scope = {},
  inventoryScope: InventoryScope = 'all',
): Observation {
  const pick = (name: Source) => productFacts(facts, [name], scope);
  const source = (name: Source) => {
    const result = facts[name];
    return result?.status === 'ready' ? result.date : undefined;
  };
  const cut = (rows: Row[]) =>
    rows
      .map((row) => sourceDate(row.source_date))
      .filter(Boolean)
      .sort()
      .at(-1);
  const metric = (name: string, id: string, rows: Row[]) =>
    deriveMetrics({
      start: period.range.from,
      end: period.range.to,
      granularity: period.view,
      missingValuePolicy: 'zero',
      sections: [
        { id, status: rows.length ? 'ready' : 'empty', rows },
        ...(id === 'finance' ? [{ id: 'sales-budget', status: 'ready', rows }] : []),
      ],
    })[name]?.value ?? null;
  if (key === 'budget') {
    const rows = pick('budget');
    return {
      value: metric('销售预算达成率', 'finance', rows),
      date: cut(rows),
      details: [
        ['销售额', known(rows, 'actual')],
        ['月度预算', known(rows, 'budget')],
      ],
      note: supported('budget', period) ? '公司未税收入与月度预算' : '预算按月发布',
    };
  }
  if (key === 'accuracy') {
    const rows = pick('accuracy');
    const initial = ratio(complete(rows, 'initial_deviation'), complete(rows, 'initial_plan'));
    const adjusted = ratio(complete(rows, 'adjusted_deviation'), complete(rows, 'adjusted_plan'));
    return {
      value: metric('销售提报准确率', 'sales-accuracy', rows),
      details: [
        ['初版需求预测准确率', initial === null ? null : 100 - initial],
        ['纠偏版需求预测准确率', adjusted === null ? null : 100 - adjusted],
      ],
      note: supported('accuracy', period) ? '源表月度累计' : '该期间暂无同口径的月度累计',
    };
  }
  if (key === 'production') {
    const rows = pick('production');
    return {
      value: metric('生产计划达成率', 'production', rows),
      date: cut(rows),
      note: 'MES 已返回产线',
    };
  }
  if (key === 'fulfillment') return { value: metric('订单满足率', 'orders', pick(key)) };
  if (key === 'cancellation' || key === 'amendment') {
    const result = facts[key];
    if (key === 'cancellation' && result?.status === 'failed')
      return { value: null, failed: true, note: result.reason };
    const rows = pick(key);
    const all = ratio(complete(rows, 'numerator'), complete(rows, 'denominator'));
    const sample = ratio(known(rows, 'sample_numerator'), known(rows, 'sample_denominator'));
    const partial =
      all === null ||
      (known(rows, 'invalid') ?? 0) > 0 ||
      (key === 'amendment' && (known(rows, 'unknown_quantity') ?? 0) > 0);
    return partial
      ? { value: sample, note: sample === null ? undefined : '可判定样本' }
      : { value: all };
  }
  if (key === 'ontime') {
    const rows = pick(scope.organization ? 'ontimeOrganization' : key);
    const partial = (known(rows, 'pending') ?? 0) > 0;
    return {
      value: ratio(complete(rows, 'numerator'), complete(rows, 'denominator')),
      note: partial ? '待判定执行单保留在分母' : undefined,
    };
  }
  const date =
    inventoryScope === 'all'
      ? source('base') && source('base') === source('branch')
        ? source('base')
        : undefined
      : source(inventoryScope);
  const rows = date
    ? inventoryScope === 'all'
      ? [...pick('base'), ...pick('branch')]
      : pick(inventoryScope)
    : [];
  const stock = known(rows, 'inventory'),
    large = known(rows, 'older_qty');
  const oldCoverage =
    (known(rows, 'unknown_age_qty') ?? 0) + (known(rows, 'unknown_older_rows') ?? 0);
  const unknownStock = (known(rows, 'unknown_inventory_rows') ?? 0) > 0;
  const note =
    inventoryScope === 'all' && !date && (source('base') || source('branch'))
      ? '所选期间内暂无基地与分仓的同日快照'
      : undefined;
  switch (key) {
    case 'inventory':
      return { value: stock, date, note: unknownStock ? '已知数量' : note };
    case 'age':
      return { value: ratio(known(rows, 'age_sum'), known(rows, 'age_qty'), 1), date, note };
    case 'stockValue':
      return {
        value: known(rows, 'stock_value'),
        date,
        note:
          inventoryScope !== 'customer'
            ? '库存金额来源仅覆盖客户库存'
            : (known(rows, 'unknown_value_rows') ?? 0) > 0
              ? '已知金额'
              : note,
      };
    case 'freshness': {
      const share = ratio(large, stock);
      return {
        value: share === null || share < 0 || share > 100 ? null : 100 - share,
        date,
        note: unknownStock ? '按已知库存测算' : oldCoverage > 0 ? '部分货龄，测算上限' : note,
      };
    }
    case 'largeDate':
      return { value: large, date, note: oldCoverage > 0 ? '已知数量' : note };
  }
}

export function comparisonPeriods(period: DashboardPeriod) {
  const { view, range } = period;
  const shift = (day: string, months: number) => {
    const start = shiftMonth(day, months);
    const last = shiftDay(shiftMonth(start, 1), -1);
    return (
      start.slice(0, 8) +
      String(Math.min(Number(day.slice(-2)), Number(last.slice(-2)))).padStart(2, '0')
    );
  };
  const remap = (move: (day: string) => string): DashboardPeriod => ({
    view,
    range: { from: move(range.from), to: move(range.to) },
  });
  return view === 'year'
    ? [
        { label: '前年同期', period: remap((day) => shift(day, -24)) },
        { label: '去年同期', period: remap((day) => shift(day, -12)) },
      ]
    : [
        {
          label: view === 'month' ? '去年同月同期' : view === 'week' ? '去年同期' : '去年同日',
          period: remap((day) => shift(day, -12)),
        },
        {
          label: view === 'month' ? '上月同期' : view === 'week' ? '上周同期' : '前一日',
          period: remap((day) =>
            view === 'month' ? shift(day, -1) : shiftDay(day, view === 'week' ? -7 : -1),
          ),
        },
      ];
}
