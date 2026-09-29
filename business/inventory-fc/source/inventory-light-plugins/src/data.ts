import { call } from "./channel.js";
import { DATA_PERMISSION_MESSAGE, sqlQueryError } from "./query-error.js";
import { bindGovernedSql } from "./governed/parameters";
import {columnarQuery, unpackColumns} from "./governed/columnar";
import {createQueryBatch} from "./governed/batch";
const batchRead = createQueryBatch(call);
declare const DSH_COLUMNAR_SQL: boolean;
declare const DSH_GOVERNED_SQL: boolean;
const governed = typeof DSH_GOVERNED_SQL !== "undefined" && DSH_GOVERNED_SQL;
import { packedSafetyStockSql, unpackSafetyStock, supportsPackedTransfer } from "./aqkc-transfer";
// Isolated per iframe/identity; only pending reads and a short-lived directory are shared.
const pendingReads = new Map<string, Promise<any>>();
const catalogs = new Map<string, { expires: number; value: any }>();
export function clearReadCache() {
  pendingReads.clear();
  catalogs.clear();
}
if (typeof window !== "undefined") {
  window.addEventListener("gea-identity-changed", clearReadCache);
  window.addEventListener("light-refresh", clearReadCache);
}
async function read(parameters: any, options: {signal?: AbortSignal} = {}) {
  try { return await readSql(parameters, options); }
  catch (error) {
    if (options.signal?.aborted || (error as Error)?.name === "AbortError") throw error;
    throw sqlQueryError(error);
  }
}
async function readSql(parameters: any, options: {signal?: AbortSignal} = {}) {
  if (governed && parameters.values !== undefined) {
    const {values, ...rest} = parameters;
    parameters = {...rest, ...bindGovernedSql(parameters.sql, values)};
  }
  const isCatalog = /^\/\* warehouse_catalog:(plans|inventory) \*\//.test(parameters.sql);
  const columnSql = parameters.pageNo === undefined && typeof DSH_COLUMNAR_SQL !== "undefined" && DSH_COLUMNAR_SQL
    ? columnarQuery(parameters.sql) : null;
  if (columnSql) parameters = {...parameters, sql: columnSql};
  const key = JSON.stringify(parameters);
  const cached = catalogs.get(key);
  if (!options.signal && cached && cached.expires > Date.now()) return structuredClone(cached.value);
  // Scoped requests must remain cancellable independently of shared reads.
  let request = options.signal ? call("sql", parameters, options) : pendingReads.get(key);
  if (!request) {
    request = typeof DSH_COLUMNAR_SQL !== "undefined" && DSH_COLUMNAR_SQL
      ? batchRead(parameters) : call("sql", parameters);
    pendingReads.set(key, request);
  }
  try {
    const raw = await request;
    const value = columnSql ? unpackColumns(raw) : raw;
    if (parameters.maxRows && value.rows.length > parameters.maxRows)
      throw Error("QUERY_RESULT_EXCEEDS_LIMIT");
    if (governed && value.rejectedColumns?.length && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("gea-query-warning", {detail: {
        message: DATA_PERMISSION_MESSAGE,
      }}));
    }
    if (isCatalog && pendingReads.get(key) === request)
      catalogs.set(key, { expires: Date.now() + 30000, value });
    // Business loaders mutate rows while normalizing; give each caller its own copy.
    return structuredClone(value);
  } finally {
    if (pendingReads.get(key) === request) pendingReads.delete(key);
  }
}
export const database = {
  queryNamed: async (sql: string, parameters: Record<string, unknown>, options: {signal?: AbortSignal; pageNo?: number; pageSize?: number} = {}) =>
    read({sql, parameters, ...(options.pageNo !== undefined ? {pageNo: options.pageNo, pageSize: options.pageSize ?? 10} : {})}, options),
  query: async (sql: string, values: unknown[] = [], options: {signal?: AbortSignal; pageSize?: number} = {}) =>
    read({ sql, values, ...(options.pageSize ? {pageSize: options.pageSize} : {}) }, options),
};
export function getDatabase() {
  return database;
}
export function getBusinessDatabase() {
  return database;
}
export function getReadOnlyPool() {
  return database;
}
export function usesGeaSql() {
  return true;
}
export async function queryBusinessDatabase(
  db: any,
  sql: string,
  values: unknown[],
  options: any,
) {
  if (!governed && options?.groupBy?.length && options?.orderBy?.length) {
    const packing = {keys:options.groupBy,order:options.orderBy,timestamps:["updated_time"]};
    if(db.queryPackedRows) return db.queryPackedRows(sql,values,packing);
    return read({sql,values,packing});
  }
  return db.query(sql, values, options);
}
export async function queryPackedBusinessRows(
  db: any,
  sql: string,
  values: unknown[],
  packing: any,
) {
  if (governed) return db.query(sql, values);
  return read({ sql, values, packing });
}
export async function executeWorkbenchSqlQuery(_ref: any, query: any) {
  if (!governed && supportsPackedTransfer(query.name)) {
    const result = await read({
      sql: packedSafetyStockSql(query.sql, query.name),
      parameters: query.parameters ?? {},
      maxRows: Math.ceil(query.maxRows / 100),
    });
    return unpackSafetyStock(result.rows, query.maxRows);
  }
  const result = await read({
      sql: query.sql,
      parameters: query.parameters ?? {},
      maxRows: query.maxRows,
    });
  const rows = result.rows;
  const decoded = query.outputAliases ? rows.map((row: any) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [query.outputAliases[key] ?? key, value]),
  )) : rows;
  if (result.rejectedColumns?.length) Object.defineProperty(decoded, 'rejectedColumns', {value: result.rejectedColumns});
  return decoded;
}
export class GeaSqlApiError extends Error {
  code: string;
  constructor(message: string, code = "GEA_QUERY_FAILED") {
    super(message);
    this.code = code;
  }
}
export async function executeGeaSql(sql: string, options: any = {}) {
  return (
    await read({
      sql,
      parameters: options.parameters ?? {},
      pageNo: 1,
      pageSize: 200,
    })
  ).rows;
}
export async function executeGeaSqlPage(
  sql: string,
  pageNo = 1,
  pageSize = 200,
  options: any = {},
) {
  return read({
    sql,
    parameters: options.parameters ?? {},
    pageNo,
    pageSize,
  });
}
export async function executeAllGeaSqlPages(sql: string, options: any = {}) {
  return (await read({ sql, parameters: options.parameters ?? {} }))
    .rows;
}
export const executeDirectSql = executeGeaSql;
export const executeDirectSqlPage = executeGeaSqlPage;
export const executeAllDirectSqlPages = executeAllGeaSqlPages;
export function createGeaSqlExecutor() {
  return database;
}
export const EMPTY_PLANNING = {
  imports: [],
  rules: [],
  revision: "browser-draft",
  available: false,
};
export async function readPlanningState() {
  return EMPTY_PLANNING;
}
export async function geaSqlSession() {
  throw Error("由 GEA 公共插件管理会话");
}

// Original Agent's GEA-only query path uses the same governed host bridge.
export const executeGeaSqlQuery = executeWorkbenchSqlQuery;
