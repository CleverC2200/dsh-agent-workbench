import { businessDay } from '../../../../shared/business-day';
import { createAgentQueries } from '../../../../shared/agent-query';
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
};

const config = agentSqlConfig(configuredSql);
const sources = {
  sales: ['budget', 'accuracy', 'cancellation', 'amendment', 'ontime', 'ontimeOrganization'],
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

async function read(
  client: ReturnType<typeof createAgentQueries>,
  id: string,
  overrides: Record<string, unknown>,
  signal: AbortSignal,
  keyFields?: string[],
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
  if (!keyFields)
    return (await client.read(id, parameters, { requiredColumns: resultColumns, signal })).rows;
  Object.assign(parameters, { page_size: 200, offset: 0 });
  return (
    await client.readAll(id, parameters, {
      signal,
      keyFields,
      requiredColumns: resultColumns,
      maxRows: 12_000,
      singlePageFirst: true,
    })
  ).rows;
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
  execute?: Parameters<typeof createAgentQueries>[1];
}): Promise<LanternFacts> {
  const client = createAgentQueries(config, execute);
  const { from, to } = period.range;
  const fromMonth = monthStart(from),
    nextMonth = shiftMonth(to, 1);
  const end = shiftDay(to, 1);
  const search = product?.sku.trim() || product?.group.trim();
  const pattern = search ? '%' + search.toLowerCase().replace(/[\\%_]/g, '\\$&') + '%' : null;
  const productDimensions = {
    sku_detail: Boolean(product?.sku.trim()),
    product_pattern: pattern,
    group_detail: Boolean(product && product.level >= 1),
    material_detail: Boolean(product && product.level >= 2),
    product_category: product?.category || null,
  };
  const results: LanternFacts = {};
  let dates: Promise<Row[]> | undefined;
  const dateFor = async (source: 'base' | 'branch' | 'customer') => {
    if (source === 'customer') {
      const rows = await read(
        client,
        'lantern.customer-date',
        { start_day: from, end_day: to },
        signal,
      );
      return sourceDate(rows[0]?.day);
    }
    dates ??= read(
      client,
      'lantern.stock-dates',
      { start_day: compact(from), end_day: compact(to) },
      signal,
    );
    return sourceDate((await dates).find((row) => row.scope === source)?.day);
  };
  const get = async (source: Source): Promise<SourceResult> => {
    const ready = (rows: Row[], date?: string): SourceResult => ({ status: 'ready', rows, date });
    switch (source) {
      case 'budget':
        return ready(
          await read(
            client,
            'page.budget-performance',
            {
              start_month: compact(fromMonth).slice(0, 6),
              end_month_exclusive: compact(nextMonth).slice(0, 6),
              as_of: to,
              start: compact(from),
              end_exclusive: compact(end),
            },
            signal,
            ['month'],
          ),
        );
      case 'accuracy':
        return ready(
          await read(
            client,
            'lantern.accuracy',
            {
              start_month: fromMonth,
              end_month_exclusive: nextMonth,
            },
            signal,
            ['month', 'region', 'province'],
          ),
        );
      case 'cancellation':
      case 'amendment':
      case 'ontime':
        if (product)
          return ready(
            await read(
              client,
              'lantern.product-' + source,
              {
                report_base: '',
                start: from,
                end_exclusive: end,
                ...productDimensions,
              },
              signal,
              ['category', 'item', 'material', 'sku'],
            ),
          );
        return ready(
          await read(
            client,
            'lantern.' + source,
            {
              report_base: '',
              start: from,
              end_exclusive: end,
            },
            signal,
            source === 'ontime' ? undefined : ['base', 'region', 'province', 'kind'],
          ),
        );
      case 'ontimeOrganization':
        return ready(
          await read(
            client,
            'lantern.ontime-organization',
            {
              report_base: '',
              start: from,
              end_exclusive: end,
            },
            signal,
            ['region', 'province'],
          ),
        );
      case 'production':
        return ready(
          await read(
            client,
            'lantern.production',
            {
              start: compact(from),
              end_exclusive: compact(end),
            },
            signal,
            ['base', 'category', 'item', 'material', 'sku'],
          ),
        );
      case 'fulfillment': {
        const monthly = period.view === 'month';
        return ready(
          await read(
            client,
            monthly ? 'page.orders-month-products' : 'page.orders-products',
            {
              date_basis: monthly ? 'order_month' : 'created',
              start: from,
              end_exclusive: end,
            },
            signal,
            ['base', 'category', 'item', 'material'],
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
          await read(
            client,
            id,
            {
              stat_date: date,
              ...productDimensions,
              group_detail: Boolean(product),
            },
            signal,
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
        const code =
          error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        const restricted = /PERMISSION|DENIED|NOT_PUBLISHED|NOT_IN_DATASET|RETURN_COLUMN/.test(
          code,
        );
        result = {
          status: 'failed',
          reason: restricted
            ? '当前账号或指标来源未开放所需数据'
            : /TIMEOUT/.test(code)
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
      ((!row.category && !row.sku) || scope.product.some((part, i) => productPath(row)[i] !== part))
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
      note: '公司未税收入与月度预算',
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
      note: '源表月度累计',
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
      ? '基地与分仓需使用同日快照'
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
        note: (known(rows, 'unknown_value_rows') ?? 0) > 0 ? '已知金额' : note,
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
