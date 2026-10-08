import { call } from "./channel.js";
import { sqlQueryError } from "./query-error.js";

export type GeaSqlRow = Record<string, string | number | null | undefined>;
export type GeaSqlParameters = Record<string, unknown>;
export type GeaSqlRequestOptions = {
  signal?: AbortSignal;
  parameters?: GeaSqlParameters;
  [key: string]: unknown;
};
let lifetime = new AbortController();
const pending = new Map<string, Promise<any>>();

export function clearReadCache() {
  lifetime.abort();
  lifetime = new AbortController();
  pending.clear();
}
if (typeof window !== "undefined") {
  window.addEventListener("gea-identity-changed", clearReadCache);
  window.addEventListener("light-refresh", clearReadCache);
}

async function read(
  parameters: object,
  options: GeaSqlRequestOptions,
): Promise<{
  rows: GeaSqlRow[];
  total: number;
  pageNo?: number;
  pageSize?: number;
  returnedColumns?: unknown;
  rejectedColumns?: unknown;
}> {
  const signal = options.signal
    ? AbortSignal.any([options.signal, lifetime.signal])
    : lifetime.signal;
  signal.throwIfAborted();
  const key = JSON.stringify(parameters);
  let request = options.signal ? undefined : pending.get(key);
  if (!request) {
    request = call("sql", parameters, { signal });
    if (!options.signal) pending.set(key, request);
  }
  try {
    const value = await request;
    signal.throwIfAborted();
    return structuredClone(value);
  } catch (error) {
    if (signal.aborted) throw error;
    throw sqlQueryError(error);
  } finally {
    if (pending.get(key) === request) pending.delete(key);
  }
}

export async function executeGeaSql(
  sql: string,
  options: GeaSqlRequestOptions = {},
): Promise<GeaSqlRow[]> {
  return executeAllGeaSqlPages(sql, options);
}
export async function executeGeaSqlPage(
  sql: string,
  pageNo = 1,
  pageSize = 200,
  options: GeaSqlRequestOptions = {},
) {
  return read(
    { sql, parameters: options.parameters ?? {}, pageNo, pageSize },
    options,
  );
}
export async function executeAllGeaSqlPages(
  sql: string,
  options: GeaSqlRequestOptions = {},
): Promise<GeaSqlRow[]> {
  // One range and identity own the entire read; no page can publish a partial result.
  const signal = options.signal
    ? AbortSignal.any([options.signal, lifetime.signal])
    : lifetime.signal;
  const parameters = structuredClone(options.parameters ?? {});
  const pageSize = 200;
  const rows: GeaSqlRow[] = [];
  let total: number | undefined;
  let permissions: string | undefined;
  for (let pageNo = 1; ; pageNo++) {
    const page = await read(
      { sql, parameters, pageNo, pageSize },
      { ...options, signal },
    );
    signal.throwIfAborted();
    const pagePermissions = JSON.stringify([
      page.returnedColumns,
      page.rejectedColumns,
    ]);
    if (
      !Number.isSafeInteger(page.total) ||
      page.total < 0 ||
      (total !== undefined && page.total !== total) ||
      (permissions !== undefined && pagePermissions !== permissions) ||
      !Array.isArray(page.rows) ||
      page.rows.length !== Math.min(pageSize, page.total - rows.length)
    )
      throw new GeaSqlApiError(
        "查询结果或字段权限在分页期间发生变化或不完整，请刷新后重新查询；未使用不完整结果",
        "GEA_SQL_RESULT_INCOMPLETE",
        409,
        false,
      );
    total = page.total;
    permissions = pagePermissions;
    rows.push(...page.rows);
    if (rows.length === total) return rows;
  }
}
export class GeaSqlApiError extends Error {
  constructor(
    message: string,
    public code = "GEA_QUERY_FAILED",
    public status = 503,
    public retryable = false,
  ) {
    super(message);
  }
}
