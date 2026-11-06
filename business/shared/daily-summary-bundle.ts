import { makeRequest, requireColumns } from './configured-query-client.mjs';
import { configuredQueryIdentity } from './query-cache';
import { inventoryCacheTtl } from './inventory-cache-policy';
import type { AgentSqlConfig } from './sql-config';
import type { DailySummarySnapshot } from './daily-summary';
import type { ConfiguredExecution } from './agent-query';

type Entry = {
  started: number;
  promise: Promise<any>;
  controller: AbortController;
  users: number;
  settled: boolean;
  failed: boolean;
};
const page = new Map<string, Entry>();
const supplied = new WeakMap<ConfiguredExecution, Map<string, Entry>>();
const active = new Set<AbortController>();
if (typeof window !== 'undefined')
  window.addEventListener('gea-identity-changed', () => {
    active.forEach((controller) => controller.abort());
    page.clear();
  });
const shift = (value: string, days: number) => {
  const date = new Date(value + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
export function dailyBundleValues(
  snapshot: Extract<DailySummarySnapshot, { kind: 'ready' }>,
  templates: Record<string, any>,
) {
  const businessMonth = snapshot.businessDate.slice(0, 7) + '-01';
  const next = new Date(businessMonth + 'T00:00:00Z');
  next.setUTCMonth(next.getUTCMonth() + 1);
  const nextMonth = next.toISOString().slice(0, 10);
  const daysInMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), 0)).getUTCDate();
  const nextDaysInMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const rollingStart = shift(snapshot.businessDate, -29);
  const context: Record<string, any> = {
    ...snapshot,
    businessMonth,
    nextMonth,
    daysInMonth,
    nextDaysInMonth,
    daysRemaining: daysInMonth - Number(snapshot.businessDate.slice(8)),
    nextDay: shift(snapshot.businessDate, 1),
    rollingStart,
    shipmentStart: businessMonth < rollingStart ? businessMonth : rollingStart,
    stockMonth: snapshot.stockDate.slice(0, 7) + '-01',
    stockRollingStart: shift(snapshot.stockDate, -29),
    stockNextDay: shift(snapshot.stockDate, 1),
    businessPlanMonths: [businessMonth, nextMonth].map((value) =>
      value.slice(0, 7).replace('-', ''),
    ),
  };
  return Object.fromEntries(
    Object.entries(templates).map(([key, template]) => {
      if (
        !template ||
        typeof template !== 'object' ||
        Array.isArray(template) ||
        !template.snapshotValue
      )
        return [key, template];
      let value = context[template.snapshotValue];
      if (typeof value === 'string' && template.format === 'YYYYMM')
        value = value.slice(0, 7).replace('-', '');
      if (typeof value === 'string' && template.format === 'YYYYMMDD')
        value = value.replaceAll('-', '');
      return [key, value];
    }),
  );
}

/** One authorized response supplies the initial page. Fields remain separate SQL columns. */
export async function executeDailyBundle(
  config: AgentSqlConfig,
  snapshot: DailySummarySnapshot | undefined,
  run: ConfiguredExecution,
  scope: ConfiguredExecution | undefined,
  request: any,
  options: Parameters<ConfiguredExecution>[1],
  freshAfter: number,
  preloaded?: { at: number; result: any },
) {
  const bundle = config.dailySummary?.bundle;
  const member = bundle?.members?.find((item: any) => item.queryId === options.queryId);
  if (!member || snapshot?.kind !== 'ready') return run(request, options);
  const warehouseCode =
    config.agentId === 'inventory-fc' && typeof options.values?.warehouse_code === 'string'
      ? options.values.warehouse_code
      : '';
  if (
    warehouseCode &&
    bundle.members.some(
      (part: { values: Record<string, unknown>; bindings: Record<string, string> }) =>
        Object.hasOwn(part.values, 'warehouse_code') &&
        (!Object.values(part.bindings).includes('warehouse_code') ||
          (Object.hasOwn(part.values, 'warehouse_code_mode') &&
            !Object.values(part.bindings).includes('warehouse_code_mode'))),
    )
  )
    return run(request, options);
  const memberValues = (templates: Record<string, unknown>) => {
    const values = dailyBundleValues(snapshot, templates);
    if (warehouseCode && Object.hasOwn(values, 'warehouse_code')) {
      values.warehouse_code = warehouseCode;
      if (Object.hasOwn(values, 'warehouse_code_mode')) values.warehouse_code_mode = 'equal';
    }
    return values;
  };
  const expected = memberValues(member.values);
  const definition = config.queries[options.queryId];
  // Only an exact covered input uses this response. Filters and later pages retain their own queries.
  if (
    Object.entries(definition.parameterSpec).some(
      ([key, spec]: [string, any]) =>
        expected[spec.name] === undefined ||
        JSON.stringify(request.parameters[key]) !== JSON.stringify(expected[spec.name]),
    )
  )
    return run(request, options);
  const cache = scope
    ? (supplied.get(scope) ??
      (() => {
        const cache = new Map<string, Entry>();
        supplied.set(scope, cache);
        return cache;
      })())
    : page;
  const key = JSON.stringify([
    configuredQueryIdentity(),
    config.agentId,
    config.queries[bundle.queryId],
    snapshot,
    warehouseCode,
    freshAfter,
  ]);
  let entry = cache.get(key);
  const ttl = inventoryCacheTtl(config.agentId);
  // These complete responses stay in memory only, under the same identity and exact inputs.
  if (!entry || Date.now() - entry.started >= (entry.failed ? Math.min(ttl, 45000) : ttl)) {
    const values: Record<string, any> = {};
    for (const part of bundle.members) {
      const inputs = memberValues(part.values);
      for (const [parameter, name] of Object.entries(part.bindings) as Array<[string, string]>)
        values[config.queries[bundle.queryId].parameterSpec[parameter].name] = inputs[name];
    }
    const controller = new AbortController();
    active.add(controller);
    const fresh: Entry = {
      started: Date.now(),
      controller,
      users: 0,
      settled: false,
      failed: false,
      promise: Promise.resolve(),
    };
    fresh.promise = (async () => {
      let first: any;
      const collected: any[] = [];
      let total = 1;
      for (let offset = 0; offset < total; offset += bundle.maxRows) {
        const pageValues = { ...values, bundle_offset: offset };
        const result =
          offset === 0 && !warehouseCode && preloaded && Date.now() - preloaded.at < ttl
            ? preloaded.result
            : await run(makeRequest(config, bundle.queryId, pageValues), {
                ...options,
                queryId: bundle.queryId,
                values: pageValues,
                signal: controller.signal,
              });
        if (result?.failure || result?.error || result?.success === false)
          throw Object.assign(Error(result.failure?.message || result.message || '汇总读取失败'), {
            code: result.failure?.reasonCode || 'QUERY_FAILED',
            failure: result.failure,
          });
        requireColumns(result, [
          'bundle_part',
          'bundle_total',
          'bundle_present',
          'bundle_scope_total',
        ]);
        const raw = result.rows[0]?.bundle_scope_total;
        const count = Number(raw);
        if (
          raw == null ||
          raw === '' ||
          !Number.isSafeInteger(count) ||
          count < 1 ||
          count > bundle.maxTotalRows ||
          result.rows.some((row: any) => Number(row.bundle_scope_total) !== count) ||
          result.rows.length !== Math.min(bundle.maxRows, Math.max(0, count - offset))
        )
          throw Object.assign(Error('首屏汇总分页不完整'), { code: 'RESULT_INCOMPLETE' });
        if (
          first &&
          (count !== total ||
            first.configVersion !== result.configVersion ||
            JSON.stringify(first.returnedColumns) !== JSON.stringify(result.returnedColumns) ||
            JSON.stringify(first.rejectedColumns) !== JSON.stringify(result.rejectedColumns))
        )
          throw Object.assign(Error('读取期间汇总范围或权限发生变化'), {
            code: 'QUERY_CONFIG_CHANGED',
          });
        first ??= result;
        total = count;
        collected.push(...result.rows);
      }
      return { ...first, rows: collected };
    })()
      .then((result) => {
        fresh.failed = Array.isArray(result.rejectedColumns) && result.rejectedColumns.length > 0;
        for (const part of bundle.members) {
          const rows = result.rows.filter((row: any) => String(row.bundle_part) === part.part);
          const raw = rows[0]?.bundle_total;
          const total = Number(raw);
          if (
            !rows.length ||
            raw == null ||
            raw === '' ||
            rows.length !== Math.max(1, total) ||
            !Number.isSafeInteger(total) ||
            total < 0 ||
            rows.some((row: any) => Number(row.bundle_total) !== total) ||
            rows.filter((row: any) => row.bundle_present != null).length !== total ||
            (total === 0 && rows.length !== 1)
          )
            throw Object.assign(Error('首屏汇总返回不完整'), { code: 'RESULT_INCOMPLETE' });
        }
        return result;
      })
      .catch((error) => {
        fresh.failed = true;
        throw error;
      })
      .finally(() => {
        fresh.settled = true;
        active.delete(controller);
      });
    entry = fresh;
    cache.set(key, entry);
    // Rejections remain in this load, so another card cannot retry a denied bundle.
    if (cache.size > 8) cache.delete(cache.keys().next().value ?? '');
  }
  entry.users++;
  const current = entry;
  let abort: (() => void) | undefined;
  try {
    options.signal?.throwIfAborted();
    const result = await (options.signal
      ? Promise.race([
          current.promise,
          new Promise<never>((_, reject) => {
            abort = () => reject(options.signal?.reason);
            options.signal!.addEventListener('abort', abort, { once: true });
          }),
        ])
      : current.promise);
    options.signal?.throwIfAborted();
    const rows = result.rows
      .filter((row: any) => String(row.bundle_part) === member.part && row.bundle_present != null)
      .map((row: any) =>
        Object.fromEntries(
          Object.entries(member.columns)
            .filter(([, column]) => Object.hasOwn(row, column as string))
            .map(([name, column]) => [name, row[column as string]]),
        ),
      );
    const translate = (columns: any[] | undefined) =>
      columns &&
      Object.entries(member.columns)
        .filter(([, column]) =>
          columns.some(
            (item) =>
              (typeof item === 'string'
                ? item
                : (item.outputAlias ?? item.alias ?? item.name ?? item.columnName)) === column,
          ),
        )
        .map(([name]) => name);
    return {
      ...result,
      rows,
      returnedColumns: translate(result.returnedColumns),
      rejectedColumns: translate(result.rejectedColumns),
    };
  } finally {
    if (abort) options.signal?.removeEventListener('abort', abort);
    if (--current.users === 0 && !current.settled) {
      current.controller.abort();
      cache.delete(key);
    }
  }
}
