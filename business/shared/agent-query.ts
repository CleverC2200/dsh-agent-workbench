import { agentSqlConfig, type AgentSqlConfig } from './sql-config';
import { createQueryClient } from './configured-query-client.mjs';
// Native pages install a business-fetch shim after module initialization.
const sourceFetch = globalThis.fetch?.bind(globalThis);

export type ConfiguredExecution = (
  request: any,
  options: { signal?: AbortSignal; queryId: string; values: Record<string, unknown> },
) => Promise<any>;

/** Pages select a configured query; credentials and the physical database stay in the host. */
export function createAgentQueries(fallback: AgentSqlConfig, execute?: ConfiguredExecution) {
  const config = agentSqlConfig(fallback);
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
        { queryId: options.queryId, parameters: options.values },
        { signal: options.signal },
      );
    });
  const client = createQueryClient(config, run);
  return {
    config,
    read(id: string, values: Record<string, unknown>, options: any = {}) {
      return client.read(id, values, options);
    },
    readAll(id: string, values: Record<string, unknown>, options: any) {
      // Each count/page call retains its own query ID and business parameters.
      return client.readAll(id, values, options);
    },
  };
}
