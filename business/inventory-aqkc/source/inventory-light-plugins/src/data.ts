import { call } from './channel.js';
import { usesConfiguredSql } from '../../../../shared/sql-config';
import { readConfiguredStock } from './configured-stock';
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
  if (usesConfiguredSql()) {
    try {
      return await readConfiguredStock(query, { signal });
    } catch (error: any) {
      if (!signal?.aborted && (error.failure || error.errorCode)) {
        // Keep gateway diagnostics, while the original page receives an explicit permission/session message.
        error.message = sqlQueryError(error).message;
      }
      if (!signal?.aborted && error.code === 'SOURCE_NOT_AVAILABLE')
        window.dispatchEvent(
          new CustomEvent('gea-query-warning', { detail: { message: error.message } }),
        );
      throw error;
    }
  }
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
