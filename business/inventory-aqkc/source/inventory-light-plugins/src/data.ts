import { call } from './channel.js';
import { sqlQueryError, DATA_PERMISSION_MESSAGE } from './query-error.js';
import { packedSafetyStockSql, unpackSafetyStock, supportsPackedTransfer } from './aqkc-transfer';
import type {
  WorkbenchSqlQuery,
  WorkbenchSqlRow,
} from '../../aqkc/web/src/lib/workbench-sql-types';
const pending = new Map<string, Promise<WorkbenchSqlRow[]>>();
export function clearReadCache() {
  pending.clear();
}
if (typeof window !== 'undefined') {
  window.addEventListener('gea-identity-changed', clearReadCache);
  window.addEventListener('light-refresh', clearReadCache);
}
/** GEA owns the identity and applies the same Consumer grant to every read. */
export async function queryStock(
  query: WorkbenchSqlQuery,
  signal?: AbortSignal,
): Promise<WorkbenchSqlRow[]> {
  const key = JSON.stringify(query);
  let request = signal ? undefined : pending.get(key);
  if (!request) {
    request = (async () => {
      const packed = supportsPackedTransfer(query.name);
      try {
        const result = await call(
          'sql',
          {
            sql: packed ? packedSafetyStockSql(query.sql, query.name) : query.sql,
            parameters: query.parameters ?? {},
            maxRows: packed ? Math.ceil(query.maxRows / 100) : query.maxRows,
          },
          { signal },
        );
        signal?.throwIfAborted();
        if (result.rejectedColumns?.length)
          window.dispatchEvent(
            new CustomEvent('gea-query-warning', {
              detail: { message: DATA_PERMISSION_MESSAGE },
            }),
          );
        return packed ? unpackSafetyStock(result.rows, query.maxRows) : result.rows;
      } catch (error) {
        if (signal?.aborted) throw error;
        throw sqlQueryError(error);
      }
    })();
    if (!signal) pending.set(key, request);
  }
  try {
    return structuredClone(await request);
  } finally {
    if (pending.get(key) === request) pending.delete(key);
  }
}
