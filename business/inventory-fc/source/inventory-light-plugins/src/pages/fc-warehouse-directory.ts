import { createAgentQueries, type ConfiguredExecution } from '../../../../../shared/agent-query';
import type { AgentSqlConfig } from '../../../../../shared/sql-config';

export type FcWarehouse = {
  warehouse_code: string;
  warehouse_name: string | null;
  base: string | null;
};

function transportFailure(error: unknown): boolean {
  for (let cause: any = error, depth = 0; cause && depth < 4; cause = cause.cause, depth++) {
    const code = String(cause.failure?.reasonCode ?? cause.code ?? '');
    if (
      /DENIED|PERMISSION|NOT_PUBLISHED|NOT_IN_DATASET|AUTHENTICATION/.test(
        code + ' ' + cause.message,
      )
    )
      return false;
  }
  for (let cause: any = error, depth = 0; cause && depth < 4; cause = cause.cause, depth++) {
    if (
      /\b(?:GEA_SQL_QUERY_TIMEOUT|GEA_SQL_UNAVAILABLE|PAGE_CHANNEL_UNAVAILABLE)\b/.test(
        String(cause.code) + ' ' + cause.message,
      ) ||
      cause.message === '业务请求超时'
    )
      return true;
  }
  return false;
}

export async function readFcWarehouseDirectory(
  config: AgentSqlConfig,
  date: string,
  signal: AbortSignal,
  execute?: ConfiguredExecution,
): Promise<FcWarehouse[]> {
  const read = () =>
    createAgentQueries(config, execute).readAll(
      'branch-warehouse.directory',
      { as_of: date, page_size: 200, offset: 0 },
      {
        signal,
        keyFields: ['warehouse_code'],
        requiredColumns: ['warehouse_name', 'base'],
        singlePageFirst: true,
      },
    );
  try {
    return (await read()).rows;
  } catch (error) {
    signal.throwIfAborted();
    if (!transportFailure(error)) throw error;
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, 250);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    return (await read()).rows;
  }
}
