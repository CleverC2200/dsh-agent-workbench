import { createAgentQueries } from './agent-query';
import type { FcCycleRule } from './fc-cycle-rules';
import { readConfiguredFacts } from './configured-facts';
import { agentSqlConfig, type AgentSqlConfig } from './sql-config';
import { readCurrentShortage } from './current-shortage';

export const businessDay = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
export function knownNumber(value: unknown): number | null {
  return value == null || String(value).trim() === '' || !Number.isFinite(Number(value))
    ? null
    : Number(value);
}
export function completeValue(summary: any, field: string) {
  return Number(summary?.['missing_' + field]) > 0 ? null : knownNumber(summary?.[field]);
}
/** SQL counts retain zero, but missing identities/quantities are not complete counts. */
export function completeCount(summary: any, field: string, missingFields: string[] = []) {
  const value = knownNumber(summary?.[field]);
  return value !== null &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    missingFields.every((key) => knownNumber(summary?.[key]) === 0)
    ? value
    : null;
}
/** orders.summary returns (demand-shortage)/demand, a fraction. */
export function fulfillmentPercent(summary: any) {
  const value = completeValue(summary, 'fulfillment_rate');
  return value == null ? null : value * 100;
}
/** These are separate business scopes, never summed into a full-chain total. */
export async function readConfiguredOverview(
  config: AgentSqlConfig,
  asOf: string,
  customer = '',
  options: {
    signal?: AbortSignal;
    viewIds?: readonly string[];
    cycleDays?: number;
    fcCycleRules?: FcCycleRule[];
    execute?: any;
    onProgress?: (parts: Record<string, any>) => void;
  } = {},
) {
  config = agentSqlConfig(config);
  const ids: string[] = [
    ...(options.viewIds ??
      config.overviewViewIds ??
      (config.agentId === 'inventory-fc'
        ? ['orders', 'plan']
        : config.agentId === 'inventory-qll'
          ? ['base', 'orders']
          : ['customer'])),
  ];
  const snapshotReads = new Map<string, Promise<any>>();
  const scopeReads = new Map<string, Promise<any>>();
  if (config.queries?.['current-shortage.summary']) ids.push('current-shortage');
  const priority = [
    'health',
    'branch-stock',
    'current-shortage',
    'factory-overview',
    'branch-overview',
  ];
  ids.sort((a, b) => {
    const rank = (id: string) => {
      const at = priority.indexOf(id);
      return at < 0 ? priority.length : at;
    };
    return rank(a) - rank(b);
  });
  const parts: Record<string, any> = {},
    versions = new Set<unknown>();
  let invalid: Error | undefined;
  const publish = (id: string, part: any) => {
    options.signal?.throwIfAborted();
    if (part.configVersion) versions.add(part.configVersion);
    if (versions.size > 1)
      invalid = Object.assign(Error('读取期间配置发生变化，请刷新'), {
        code: 'QUERY_CONFIG_CHANGED',
      });
    if (invalid) throw invalid;
    parts[id] = part;
    options.onProgress?.({ ...parts });
  };
  const fromResult = (result: any) =>
    result.summaryError
      ? { error: result.summaryError.message }
      : {
          summary: result.summary,
          total: result.total,
          snapshotDate: result.snapshotDate,
          inventoryVersion: result.parameters?.inventory_version,
          configVersion: result.configVersion,
        };
  let quickStockFailed = false;
  if (config.overviewQuickStock && ids.some((id) => ['health', 'branch-stock'].includes(id))) {
    try {
      const result = await createAgentQueries(config, options.execute).read(
        config.overviewQuickStock,
        { as_of: asOf },
        {
          signal: options.signal,
          requiredColumns: config.queries[config.overviewQuickStock].resultColumns,
        },
      );
      for (const row of result.rows) {
        const id =
          row.location_type === '基地'
            ? 'health'
            : row.location_type === '分仓'
              ? 'branch-stock'
              : undefined;
        if (!id || !ids.includes(id)) continue;
        const { location_type: _type, snapshot_date: snapshotDate, ...summary } = row;
        const instant =
          typeof snapshotDate === 'string' ? Date.parse(snapshotDate + 'T00:00:00Z') : NaN;
        if (
          !Number.isFinite(instant) ||
          new Date(instant).toISOString().slice(0, 10) !== snapshotDate ||
          snapshotDate > asOf
        ) {
          publish(id, { error: '库存快照无效', partial: true });
          continue;
        }
        publish(id, {
          summary,
          snapshotDate,
          total: Number(row.row_count),
          configVersion: result.configVersion,
        });
        const snapshotId = id === 'health' ? 'source.health-date' : 'source.branch-stock-date';
        snapshotReads.set(
          JSON.stringify([config.agentId, snapshotId, { as_of: asOf }]),
          Promise.resolve({ ...result, rows: [{ day: snapshotDate }] }),
        );
      }
    } catch (error: any) {
      if (options.signal?.aborted || error.code === 'QUERY_CONFIG_CHANGED') throw error;
      quickStockFailed = true;
      for (const id of ['health', 'branch-stock'])
        if (ids.includes(id)) publish(id, { error: error.message, partial: true });
    }
  }
  await Promise.all(
    ids.map(async (id) => {
      let part: any;
      if (quickStockFailed && ['health', 'branch-stock'].includes(id)) return;
      try {
        if (id === 'current-shortage') {
          const result = await readCurrentShortage(config, id + '.summary', {}, options);
          part = {
            rows: result.rows,
            partial: result.partial,
            configVersion: result.configVersion,
            snapshotDate: result.rows[0]?.snapshot_date,
          };
        } else {
          const view = config.sourceViews?.views.find((view: any) => view.id === id);
          const input = {
            asOf,
            customer,
            cycleDays: options.cycleDays,
            fcCycleRules: options.fcCycleRules,
            filters: id === 'customer' && customer ? { customer } : {},
          };
          const readOptions = { ...options, snapshotReads, scopeReads, summaryOnly: true };
          // Quantities can be shown before batch-age calculation completes. A late
          // age failure cannot invalidate the separately completed inventory read.
          if (view?.inventorySummaryId && !parts[id]?.summary) {
            const inventory = await readConfiguredFacts(config, id, input, {
              ...readOptions,
              inventoryOnly: true,
            });
            publish(id, fromResult(inventory));
          }
          part = fromResult(await readConfiguredFacts(config, id, input, readOptions));
        }
      } catch (e: any) {
        if (options.signal?.aborted) throw e;
        if (e.code === 'QUERY_CONFIG_CHANGED') invalid = e;
        part = { ...parts[id], error: e.message, partial: true };
      }
      publish(id, part);
    }),
  );
  options.signal?.throwIfAborted();
  return parts;
}
