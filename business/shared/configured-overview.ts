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
  const parts: Record<string, any> = {},
    versions = new Set<unknown>();
  let invalid: Error | undefined;
  await Promise.all(
    ids.map(async (id) => {
      let part: any;
      try {
        if (id === 'current-shortage') {
          const result = await readCurrentShortage(config, id + '.summary', {}, options);
          part = {
            rows: result.rows,
            configVersion: result.configVersion,
            snapshotDate: result.rows[0]?.snapshot_date,
          };
        } else {
          const result = await readConfiguredFacts(
            config,
            id,
            {
              asOf,
              customer,
              cycleDays: options.cycleDays,
              filters: id === 'customer' && customer ? { customer } : {},
            },
            { ...options, snapshotReads, scopeReads, summaryOnly: true },
          );
          part = result.summaryError
            ? { error: result.summaryError.message }
            : {
                summary: result.summary,
                total: result.total,
                snapshotDate: result.snapshotDate,
                inventoryVersion: result.parameters?.inventory_version,
                configVersion: result.configVersion,
              };
        }
      } catch (e: any) {
        if (options.signal?.aborted) throw e;
        if (e.code === 'QUERY_CONFIG_CHANGED') invalid = e;
        part = { error: e.message };
      }
      options.signal?.throwIfAborted();
      if (part.configVersion) versions.add(part.configVersion);
      if (versions.size > 1)
        invalid = Object.assign(Error('读取期间配置发生变化，请刷新'), {
          code: 'QUERY_CONFIG_CHANGED',
        });
      if (invalid) throw invalid;
      parts[id] = part;
      options.onProgress?.({ ...parts });
    }),
  );
  options.signal?.throwIfAborted();
  return parts;
}
