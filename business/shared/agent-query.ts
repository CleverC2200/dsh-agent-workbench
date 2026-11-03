import { executeDailyBundle } from './daily-summary-bundle';
import { businessDay } from './business-day';
import { inFlightQueries } from './in-flight-query';
import { configuredQueryFreshAfter } from './query-cache';
import { agentSqlConfig, type AgentSqlConfig } from './sql-config';
import { createQueryClient } from './configured-query-client.mjs';
import {
  dailySummaryQuery,
  parseDailySummarySnapshot,
  type DailySummarySnapshot,
} from './daily-summary';
// Native pages install a business-fetch shim after module initialization.
const sourceFetch = globalThis.fetch?.bind(globalThis);

export type ConfiguredExecution = (
  request: any,
  options: { signal?: AbortSignal; queryId: string; values: Record<string, unknown> },
) => Promise<any>;

const pageReads = inFlightQueries<any>();
let identityGeneration = 0;
if (typeof window !== 'undefined')
  window.addEventListener('gea-identity-changed', () => identityGeneration++);
const suppliedReads = new WeakMap<ConfiguredExecution, ReturnType<typeof inFlightQueries<any>>>();
type SummaryRead = {
  snapshot: DailySummarySnapshot;
  preloaded?: { at: number; result: any };
};
type SummaryReads = Map<string, { result: Promise<SummaryRead> }>;
const pageSummaries: SummaryReads = new Map();
const suppliedSummaries = new WeakMap<ConfiguredExecution, SummaryReads>();

/** Pages select a configured query; credentials and the physical database stay in the host. */
export function createAgentQueries(
  fallback: AgentSqlConfig,
  execute?: ConfiguredExecution,
  freshness: { freshAfter?: number } = {},
) {
  const config = agentSqlConfig(fallback);
  const freshAfter = freshness.freshAfter ?? configuredQueryFreshAfter();
  const run: ConfiguredExecution =
    execute ??
    (async (request, options) => {
      const local =
        typeof document === 'undefined' ? null : document.getElementById('agent-sql-direct');
      if (local) {
        const settings = JSON.parse(local.textContent || '{}');
        if (!/^\/api\/agents\/[a-z-]+\/query$/.test(settings.path))
          throw Error('INVALID_SQL_TRANSPORT');
        if (!sourceFetch) throw Error('SQL_TRANSPORT_UNAVAILABLE');
        const response = await sourceFetch(settings.path, {
          method: 'POST',
          signal: options.signal,
          headers: { 'Content-Type': 'application/json', 'X-SQL-Preview': settings.token },
          body: JSON.stringify({ queryId: options.queryId, parameters: options.values }),
        });
        const body = await response.json();
        if (!response.ok) throw Object.assign(Error(body.message || 'DIRECT_SQL_FAILED'), body);
        return body;
      }
      // Use the existing owned page channel: no SQL, identity or credentials cross from the page.
      if (typeof window === 'undefined')
        throw Object.assign(Error('请在已连接的工作台页面内查询'), {
          code: 'PAGE_CHANNEL_UNAVAILABLE',
        });
      const { call, ready } = await import('./channel.js');
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          cleanup();
          reject(options.signal?.reason);
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(
            Object.assign(Error('页面尚未连接统一身份，请重新打开'), {
              code: 'PAGE_CHANNEL_UNAVAILABLE',
            }),
          );
        }, 30000);
        const cleanup = () => {
          clearTimeout(timer);
          options.signal?.removeEventListener('abort', abort);
        };
        if (options.signal?.aborted) return abort();
        options.signal?.addEventListener('abort', abort, { once: true });
        ready.then(
          () => {
            cleanup();
            resolve();
          },
          (error) => {
            cleanup();
            reject(error);
          },
        );
      });
      options.signal?.throwIfAborted();
      return call(
        'sql',
        {
          queryId: options.queryId,
          parameters: options.values,
          freshAfter,
        },
        { signal: options.signal },
      );
    });
  let selectedSnapshot: DailySummarySnapshot | undefined;
  let preloaded: SummaryRead['preloaded'];
  const client = createQueryClient(config, (request, options) =>
    executeDailyBundle(
      config,
      selectedSnapshot,
      run,
      execute,
      request,
      options,
      freshAfter,
      preloaded,
    ),
  );
  const shared = execute
    ? (suppliedReads.get(execute) ??
      (() => {
        const reads = inFlightQueries<any>();
        suppliedReads.set(execute, reads);
        return reads;
      })())
    : pageReads;
  const summaryReads = execute
    ? (suppliedSummaries.get(execute) ??
      (() => {
        const reads: SummaryReads = new Map();
        suppliedSummaries.set(execute, reads);
        return reads;
      })())
    : pageSummaries;
  const selectRead = async (id: string, values: Record<string, unknown>) => {
    if (!config.dailySummary || !config.queries[id]?.summaryRoute) return { id, values };
    const bootstrapId = config.dailySummary.bundle?.bootstrapQueryId;
    const snapshotId = bootstrapId ?? config.dailySummary.snapshotQueryId;
    if (typeof snapshotId !== 'string' || !config.queries[snapshotId])
      throw Error('SUMMARY_SNAPSHOT_NOT_CONFIGURED');
    const key = JSON.stringify([
      identityGeneration,
      config.agentId,
      config.queries[snapshotId],
      businessDay(),
      freshAfter,
    ]);
    // Keep cards and later pages on one daily batch until the whole view refreshes.
    let snapshot = summaryReads.get(key);
    if (!snapshot) {
      const metadataColumns = config.queries[config.dailySummary.snapshotQueryId].resultColumns;
      const result = client
        .read(snapshotId, {}, { requiredColumns: metadataColumns })
        .then((response: any): SummaryRead => {
          if (!bootstrapId) return { snapshot: parseDailySummarySnapshot(response) };
          const metadata = (row: any) =>
            Object.fromEntries(metadataColumns.map((name: string) => [name, row[name]]));
          const rows = response.rows;
          if (!Array.isArray(rows)) throw Error('SUMMARY_SNAPSHOT_INVALID');
          if (
            rows.some(
              (row: any) => JSON.stringify(metadata(row)) !== JSON.stringify(metadata(rows[0])),
            )
          )
            throw Error('SUMMARY_SNAPSHOT_INVALID');
          const businessColumns = (columns: any[] | undefined) =>
            columns?.filter(
              (column) =>
                !metadataColumns.includes(
                  typeof column === 'string'
                    ? column
                    : (column.outputAlias ?? column.alias ?? column.name ?? column.columnName),
                ),
            );
          return {
            snapshot: parseDailySummarySnapshot({ rows: rows.length ? [metadata(rows[0])] : [] }),
            preloaded: {
              at: Date.now(),
              result: {
                ...response,
                returnedColumns: businessColumns(response.returnedColumns),
                rejectedColumns: businessColumns(response.rejectedColumns),
              },
            },
          };
        });
      snapshot = { result };
      summaryReads.set(key, snapshot);
      result.catch((error) => {
        const code = error?.failure?.reasonCode ?? error?.code ?? '';
        // A later card must not automatically retry a denied metadata request.
        if (
          /PERMISSION|NOT_PUBLISHED|NO_RETURN_COLUMN_ALLOWED|REQUIRED_COLUMN_UNAVAILABLE/.test(code)
        )
          return;
        if (summaryReads.get(key)?.result === result) summaryReads.delete(key);
      });
      // Prefetched rows expire after the initial-load window; metadata can outlive them.
      if (summaryReads.size > 32) summaryReads.delete(summaryReads.keys().next().value ?? '');
    }
    const selectedRead = await snapshot.result;
    selectedSnapshot = selectedRead.snapshot;
    preloaded = selectedRead.preloaded;
    const selected = dailySummaryQuery(config.queries[id], selectedSnapshot, values);
    if (!selected && config.queries[id].summaryRoute.required === true)
      throw Object.assign(Error('当前范围的汇总数据尚未就绪'), {
        code:
          selectedSnapshot.kind === 'unavailable'
            ? 'SUMMARY_NOT_AVAILABLE'
            : 'SUMMARY_SCOPE_NOT_COVERED',
      });
    return selected ? { id: selected.queryId, values: selected.values } : { id, values };
  };
  return {
    config,
    read(id: string, values: Record<string, unknown>, options: any = {}) {
      const generation = identityGeneration;
      const key = JSON.stringify([
        identityGeneration,
        config.agentId,
        id,
        config.queries[id],
        values,
        options.requiredColumns,
        freshAfter,
      ]);
      return shared(
        key,
        async (signal) => {
          const selected = await selectRead(id, values);
          signal?.throwIfAborted();
          return client.read(selected.id, selected.values, { ...options, signal });
        },
        options.signal,
      ).then((result) => {
        if (generation !== identityGeneration)
          throw Object.assign(Error('身份已变化，请重新读取当前账号的数据'), {
            code: 'IDENTITY_CHANGED',
          });
        return structuredClone(result);
      });
    },
    async readAll(id: string, values: Record<string, unknown>, options: any) {
      // Each count/page call retains its own query ID and business parameters.
      const generation = identityGeneration;
      const selected = await selectRead(id, values);
      options?.signal?.throwIfAborted();
      const result = await client.readAll(selected.id, selected.values, options);
      if (generation !== identityGeneration)
        throw Object.assign(Error('身份已变化，请重新读取当前账号的数据'), {
          code: 'IDENTITY_CHANGED',
        });
      return result;
    },
  };
}
