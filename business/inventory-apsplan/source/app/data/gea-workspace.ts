import { readCurrentShortage } from '../../../../shared/current-shortage';
import sqlConfiguration from '../../../sql.config.json';
import { agentSqlConfig, usesConfiguredSql } from '../../../../shared/sql-config';
import { readWorkspaceQuery } from '../../../../shared/workspace-query';
const registry = agentSqlConfig(sqlConfiguration).workspace;
import { readGovernedSql, GeaQueryError, type SqlTransport } from './gea-sql';
type Row = Record<string, any>;
type Input = {
  date: string;
  granularity: string;
  version: string;
  orderType: string;
  stage?: string;
  comparison?: boolean;
  summary?: boolean;
  detailMode?: 'organization' | 'product';
  productScope?: {
    mode: 'category' | 'base';
    categories: string[];
    items: string[];
  };
  refresh?: boolean;
  signal?: AbortSignal;
  onProgress?: (data: any) => void;
  onComparison?: (data: any) => void;
};
const { labels, notes } = registry;
const paths = registry.paths as (string | null)[][];
const queries = registry.queries as Record<string, { sql: string; parameters: string[] }>;
// Core card sources enter the queue first. Direct preview also prioritizes MES
// production; the governed path retains its published-source set. Unused product forecast details are fetched only by an explicit details request.
const primarySources = ['stock', 'orders', 'finance', 'sales-budget'];
// KPI comparison does not need detail tables, product drill-downs or daily
// shipment exports. Keeping this list small avoids re-reading six large sources
// for both the previous period and the same period last year.
const comparisonKeys = [
  'demand-accuracy',
  'sales-accuracy',
  'finance',
  'sales-budget',
  'stock',
  'orders',
  'shippable',
];
const numericFields = new Set([
  'budget_keys',
  'income_keys',
  'missing_budget_keys',
  'missing_income_records',
  'matched_keys',
  'matched_budget',
  'matched_income',
  'known_planned',
  'known_actual',
  'valid_records',
  'covered_support_quantity',
  'covered_support_demand',
  'covered_support_count',
  'covered_shippable_quantity',
  'covered_shippable_demand',
  'covered_shippable_count',
  'records',
  'inventory',
  'demand',
  'target',
  'missing_demand',
  'missing_target',
  'predicted',
  'actual',
  'predicted_amount',
  'actual_amount',
  'missing_actual',
  'missing_predicted',
  'planned',
  'initial_plan',
  'demand_initial_plan',
  'demand_adjusted_plan',
  'base_sales_plan',
  'base_sales_adjusted_plan',
  'base_production_plan',
  'base_production_adjusted_plan',
  'missing_plan',
  'available',
  'invalid',
  'budget',
  'quantity',
  'weighted_age',
  'older_quantity',
  'ordered',
  'allocated',
  'value',
  'previous',
  'last_year',
  'actual_all',
  'income',
  'missing_qty',
  'missing_income',
  'shortage',
  'shipped',
  'adjusted_plan',
  'initial_deviation',
  'adjusted_deviation',
]);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const date = (s: string) => new Date(s + 'T00:00:00Z');
const shiftDays = (s: string, n: number) => {
  const d = date(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const shiftMonths = (s: string, n: number) => {
  const d = date(s),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, end));
  return iso(d);
};
export function period(end: string, kind: string): [string, string] {
  const d = date(end);
  return [
    kind === 'year'
      ? end.slice(0, 4) + '-01-01'
      : kind === 'month'
        ? end.slice(0, 7) + '-01'
        : kind === 'week'
          ? shiftDays(end, -((d.getUTCDay() + 6) % 7))
          : end,
    end,
  ];
}
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const monthly = (start: string, end: string, kind: string) =>
  ['month', 'year'].includes(kind) &&
  start.endsWith('-01') &&
  (end === today() || date(shiftDays(end, 1)).getUTCDate() === 1);
// One adapter owns a bounded queue shared by main and comparison requests.
export function createGeaWorkspace(transport: SqlTransport) {
  const unavailable = new Map<string, unknown>();
  const sharedReads = new Map<string, Promise<Row[]>>();
  let running = 0;
  const waiting: Array<() => void> = [];
  async function limited<T>(task: () => Promise<T>): Promise<T> {
    if (running >= 3) await new Promise<void>((r) => waiting.push(r));
    else running++;
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  }
  async function run(
    input: Input,
    bounds = period(input.date, input.granularity),
    selected?: string[],
    sourceConcurrency?: number,
  ) {
    const [start, end] = bounds,
      kind = input.granularity;
    // A single period load may expose the same configured snapshot in two
    // sections. Share only that load's raw read; refreshes and comparisons own
    // separate maps, and each consumer receives its own converted row objects.
    const directReads = new Map<string, Promise<Row[]>>();
    const primary = usesConfiguredSql()
      ? [
          'finance',
          'stock',
          'orders',
          'production',
          'plans',
          'demand-accuracy',
          'sales-accuracy',
          'sales-budget',
        ]
      : primarySources;
    const values: Row = {
      summary: input.summary,
      detailMode: input.detailMode,
      productScope: input.productScope,
      start,
      end,
      anchor: input.date,
      version: input.version,
      order_type: input.orderType,
      month_start: start.slice(0, 7).replace('-', ''),
      month_end: end.slice(0, 7).replace('-', ''),
      day_start: start.replaceAll('-', ''),
      day_end: end.replaceAll('-', ''),
      iso_month_start: start.slice(0, 7),
      iso_month_end: end.slice(0, 7),
      start_month: start.slice(0, 7),
      end_month: end.slice(0, 7),
      age_limit: 180,
      ratio_group: 'warehouse_examine',
    };
    const normalize = (rows: Row[]) =>
      rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            numericFields.has(key) &&
            typeof value === 'string' &&
            value.trim() !== '' &&
            Number.isFinite(Number(value))
              ? Number(value)
              : value,
          ]),
        ),
      );
    let publishInventory: ((rows: Row[]) => void) | undefined;
    async function read(name: string): Promise<Row[]> {
      if (usesConfiguredSql() && name === 'pending') {
        const result = await limited(() => {
          input.signal?.throwIfAborted();
          return readCurrentShortage(
            sqlConfiguration,
            'current-shortage.locations',
            {},
            { signal: input.signal },
          );
        });
        return result.rows.map((row: Row) => ({
          ...row,
          scope: row.location_type,
          warehouse: row.warehouse_code,
          stage: 'PREPARING',
          ordered: row.demand,
          source_date: row.snapshot_date,
        }));
      }
      if (usesConfiguredSql()) {
        const config = agentSqlConfig(sqlConfiguration);
        const binding =
          (input.summary
            ? config.workspaceSummaryBindings?.[name]
            : config.workspaceDrillBindings?.[input.detailMode]?.[name]) ??
          config.workspaceBindings?.[name];
        const key = binding ? JSON.stringify(binding) : name;
        const permissionKey = 'configured:' + key;
        if (unavailable.has(permissionKey)) throw unavailable.get(permissionKey);
        let job = directReads.get(key);
        if (!job) {
          job = limited(async () => {
            input.signal?.throwIfAborted();
            if (unavailable.has(permissionKey)) throw unavailable.get(permissionKey);
            return readWorkspaceQuery(sqlConfiguration, name, values, {
              signal: input.signal,
              onInventory:
                name === 'stock' && input.summary && !selected
                  ? (rows) => publishInventory?.(normalize(rows))
                  : undefined,
            });
          }).catch((error) => {
            if (
              !input.signal?.aborted &&
              /^(RESOURCE_NOT_PUBLISHED|RESOURCE_NOT_IN_DATASET|FIELD_NOT_PUBLISHED|NO_RETURN_COLUMN_ALLOWED|RETURN_PERMISSION_DENIED|GEA_RETURN_COLUMNS_REJECTED|GEA_SQL_PERMISSION_DENIED|DATA_PERMISSION_DENIED|AI_GATEWAY_DATA_PERMISSION_DENIED|ACCESS_DENIED)$/.test(
                String(error?.code),
              )
            )
              unavailable.set(permissionKey, error);
            throw error;
          });
          directReads.set(key, job);
        }
        const rows = await job;
        return rows.map((row: Row) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key,
              numericFields.has(key) &&
              typeof value === 'string' &&
              value.trim() !== '' &&
              Number.isFinite(Number(value))
                ? Number(value)
                : value,
            ]),
          ),
        );
      }
      const q = queries[name];
      if (!q) throw new GeaQueryError('QUERY_NOT_REGISTERED', '未登记的查询');
      const parameters = Object.fromEntries(
        q.parameters.map((key, i) => {
          if (!(key in values)) throw new GeaQueryError('PARAMETER_MISSING', '查询参数缺失');
          return ['gea_p' + (i + 1), values[key]];
        }),
      );
      input.signal?.throwIfAborted();
      if (unavailable.has(q.sql)) throw unavailable.get(q.sql);
      const cacheKey = JSON.stringify([q.sql, parameters]);
      let job = sharedReads.get(cacheKey);
      if (!job) {
        job = readGovernedSql(
          (method, payload) =>
            limited(async () => {
              input.signal?.throwIfAborted();
              if (unavailable.has(q.sql)) throw unavailable.get(q.sql);
              return transport(method, payload, { signal: input.signal });
            }),
          q.sql,
          parameters,
          { signal: input.signal },
        ).catch((error) => {
          if (sharedReads.get(cacheKey) === job) sharedReads.delete(cacheKey);
          const denied =
            /^(RESOURCE_NOT_PUBLISHED|RESOURCE_NOT_IN_DATASET|FIELD_NOT_PUBLISHED|NO_RETURN_COLUMN_ALLOWED|RETURN_PERMISSION_DENIED|GEA_RETURN_COLUMNS_REJECTED|GEA_SQL_PERMISSION_DENIED|DATA_PERMISSION_DENIED|AI_GATEWAY_DATA_PERMISSION_DENIED|ACCESS_DENIED)$/.test(
              String(error?.code),
            );
          if (!input.signal?.aborted && (denied || /数据表未发布/.test(String(error?.message))))
            unavailable.set(q.sql, error);
          throw error;
        });
        sharedReads.set(cacheKey, job);
      }
      // Consumers annotate rows by scope; never mutate the shared raw response.
      const rows = await job;
      input.signal?.throwIfAborted();
      if (rows.length > 12000)
        throw new GeaQueryError('GEA_RESULT_INCOMPLETE', '聚合结果超过完整返回上限，请缩小范围');
      return rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            numericFields.has(key) &&
            typeof value === 'string' &&
            value.trim() !== '' &&
            Number.isFinite(Number(value))
              ? Number(value)
              : value,
          ]),
        ),
      );
    }
    let orgPromise: Promise<Row[]> | undefined;
    async function section(key: string) {
      const override = usesConfiguredSql()
        ? agentSqlConfig(sqlConfiguration).workspaceSourceOverrides?.[key]
        : undefined;
      const result = {
        id: key,
        label: override?.label ?? (labels as Row)[key],
        note: override?.note ?? (notes as Row)[key],
      };
      try {
        if (
          ['demand-accuracy', 'sales-accuracy', 'finance', 'sales-budget'].includes(key) &&
          !(override?.supportsHistoricalCutoff
            ? ['month', 'year'].includes(kind) && start.endsWith('-01')
            : monthly(start, end, kind))
        )
          return {
            ...result,
            status:
              usesConfiguredSql() && agentSqlConfig(sqlConfiguration).missingValuePolicy === 'zero'
                ? 'unavailable'
                : 'empty',
            rows: [],
            error: {
              code: 'HISTORICAL_CUTOFF_UNAVAILABLE',
              message: `${result.label}仅有月度累计值，无法还原${end}的历史月中值；不能用历史整月值替代同期值。`,
            },
          };
        let query =
          key === 'plans' ? (kind === 'year' ? 'plans-source-year' : 'plans-source') : key;
        if (['orders', 'orders-products'].includes(key) && start.slice(0, 7) === end.slice(0, 7))
          query = key === 'orders' ? 'orders-month' : 'orders-month-products';
        const rows = await read(query);
        if (key === 'plans')
          for (const row of rows) {
            const matches = paths.filter(
              (p) => p[2] === row.sales_group && (!row.province || p[1] === row.province),
            );
            const unique = new Map(matches.map((p) => [JSON.stringify(p), p]));
            if (unique.size === 1)
              [row.region, row.province, row.sales_group] = [...unique.values()][0];
          }
        if (key === 'sales-accuracy')
          for (const row of rows) {
            const parents = new Set(
              paths.filter((p) => p[1] && p[1] === row.province).map((p) => p[0]),
            );
            if (parents.size === 1) row.region = [...parents][0];
          }
        if (
          ['finance', 'sales-budget'].includes(key) &&
          override?.organizationBasis !== 'company'
        ) {
          const orgs = await (orgPromise ??= read('sales-org'));
          const codes = ['region_code', 'province_code', 'group_code'];
          for (const row of rows) {
            const matched = orgs.filter((o) => codes.every((k) => o[k] === row[k]));
            const matches = paths.filter((p) =>
              matched.some((o) => o.sales_group === p[2] && (p[1] === null || o.province === p[1])),
            );
            const unique = new Map(matches.map((p) => [JSON.stringify(p), p]));
            if (unique.size === 1)
              [row.region, row.province, row.sales_group] = [...unique.values()][0];
            else
              for (const [i, field] of ['region', 'province', 'sales_group'].entries()) {
                let names = new Set(matched.map((o) => o[field]).filter(Boolean));
                if (!names.size)
                  names = new Set(
                    orgs
                      .filter((o) => codes.slice(0, i + 1).every((k) => o[k] === row[k]))
                      .map((o) => o[field])
                      .filter(Boolean),
                  );
                row[field] = names.size === 1 ? [...names][0] : null;
              }
            if (key === 'finance' && row.currency !== 'CNY')
              row.invalid =
                typeof row.invalid === 'number' && typeof row.records === 'number'
                  ? row.invalid + row.records
                  : null;
          }
        }
        return { ...result, status: rows.length ? 'ready' : 'empty', rows };
      } catch (e) {
        const error = e as GeaQueryError & {
          failure?: any;
          returnedColumns?: any;
          rejectedColumns?: any;
        };
        const known =
          key === 'stock' && error.code !== 'QUERY_CONFIG_CHANGED' ? byId.get(key) : undefined;
        return {
          ...result,
          ...(known?.partial ? known : {}),
          // Missing source mappings or snapshots are data limitations, not failed
          // gateway requests. Keep their structured reason in page/Agent context.
          status: known?.partial
            ? 'ready'
            : error.code === 'SOURCE_NOT_AVAILABLE'
              ? 'unavailable'
              : 'error',
          rows: known?.partial ? known.rows : [],
          error: {
            code: error.code || 'GEA_QUERY_FAILED',
            message: error.message,
            stage: error.stage ?? error.failure?.stage,
            failure: error.failure,
            returnedColumns: error.returnedColumns,
            rejectedColumns: error.rejectedColumns,
          },
        };
      }
    }
    // These product forecast rows do not feed any initial card or current drill metric.
    // They remain queryable explicitly without delaying the initial workspace.
    const deferred = usesConfiguredSql()
      ? ['forecast-products', ...(input.summary ? ['branch', 'operations'] : [])]
      : [];
    const keys =
      selected ??
      (input.stage === 'details'
        ? deferred
        : input.stage === 'primary'
          ? primary
          : input.stage === 'remaining'
            ? Object.keys(labels).filter((k) => !primary.includes(k) && !deferred.includes(k))
            : [
                ...primary,
                ...Object.keys(labels).filter((k) => !primary.includes(k) && !deferred.includes(k)),
              ]);
    const byId = new Map<string, any>();
    const snapshot = () => ({
      mode:
        typeof document !== 'undefined' && document.getElementById('agent-sql-direct')
          ? 'direct-doris'
          : 'gea-governed-sql',
      missingValuePolicy: usesConfiguredSql()
        ? agentSqlConfig(sqlConfiguration).missingValuePolicy
        : undefined,
      realData: true,
      readOnly: true,
      readAt: new Date().toISOString(),
      start,
      end,
      granularity: kind,
      orderType: input.orderType,
      version: input.version,
      sections: (!selected && input.stage !== 'details'
        ? [
            ...new Set([
              ...keys,
              ...deferred,
              ...(input.stage === 'primary' ? Object.keys(labels) : []),
            ]),
          ]
        : keys
      ).map(
        (id) =>
          byId.get(id) ?? {
            id,
            label: (labels as Row)[id],
            note: (notes as Row)[id],
            status: deferred.includes(id) ? 'deferred' : 'loading',
            rows: [],
          },
      ),
      limitations: [
        typeof document !== 'undefined' && document.getElementById('agent-sql-direct')
          ? '本地数据库账户只读直连；尚未核验 GEA 用户、Consumer 与字段授权。'
          : '由 GEA 当前用户和 Agent aps 的授权范围读取；权限拒绝与不完整返回不补零。',
        '各来源日期和完整性请在数据来源中核对。',
        '正式派单与写回尚未接入。',
      ],
    });
    publishInventory = (rows) => {
      input.signal?.throwIfAborted();
      byId.set('stock', {
        id: 'stock',
        label: labels.stock,
        note: notes.stock,
        status: rows.length ? 'ready' : 'empty',
        rows,
        partial: true,
      });
      input.onProgress?.(snapshot());
    };
    let nextKey = 0;
    await Promise.all(
      Array.from({ length: Math.min(sourceConcurrency ?? keys.length, keys.length) }, async () => {
        while (nextKey < keys.length) {
          const key = keys[nextKey++];
          const result = await section(key);
          byId.set(key, result);
          if (!input.signal?.aborted) input.onProgress?.(snapshot());
        }
      }),
    );
    return snapshot();
  }
  return async (input: Input): Promise<any> => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
      !Number.isFinite(date(input.date).valueOf()) ||
      iso(date(input.date)) !== input.date ||
      input.date > today() ||
      !['year', 'month', 'week', 'day'].includes(input.granularity) ||
      !['月初', '滚动', '纠偏'].includes(input.version) ||
      !['M', 'Z'].includes(input.orderType) ||
      ![undefined, 'primary', 'remaining', 'details'].includes(input.stage)
    )
      throw new GeaQueryError('APS_INVALID_FILTER', '筛选参数无效');
    if (input.refresh && !input.comparison && input.stage !== 'remaining') {
      sharedReads.clear();
      unavailable.clear();
    }
    if (!input.comparison) return run(input);
    const bounds = period(input.date, input.granularity);
    const previous = bounds.map((s) =>
      input.granularity === 'year'
        ? shiftMonths(s, -12)
        : input.granularity === 'month'
          ? shiftMonths(s, -1)
          : shiftDays(s, input.granularity === 'week' ? -7 : -1),
    ) as [string, string];
    const annual = bounds.map((s) => shiftMonths(s, -12)) as [string, string];
    // Shippable reuses stock. Do not let that waiting consumer occupy the
    // second annual worker ahead of independent production.
    const keys = usesConfiguredSql()
      ? [...comparisonKeys.filter((key) => key !== 'shippable'), 'plans', 'production', 'shippable']
      : comparisonKeys;
    const previousRead = run(
      {
        ...input,
        date: previous[1],
        onProgress: (data) => input.onComparison?.({ previous: data }),
      },
      previous,
      keys,
    ).then((before) => {
      if (!input.signal?.aborted) input.onComparison?.({ previous: before });
      return before;
    });
    const annualRead =
      JSON.stringify(previous) === JSON.stringify(annual)
        ? // Let annual orders/production progress while stock pages are in flight.
          // Both periods still share the adapter's three-source limit.
          previousRead
        : run(
            {
              ...input,
              date: annual[1],
              onProgress: (data) => input.onComparison?.({ annual: data }),
            },
            annual,
            keys,
            2,
          );
    const [before, yearBefore] = await Promise.all([previousRead, annualRead]);
    return { previous: before, annual: yearBefore };
  };
}
