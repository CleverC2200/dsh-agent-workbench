/** Keep session failures and query failures distinct from explicit permission denial. */
export const DATA_PERMISSION_MESSAGE = "当前账号暂无数据权限";
export function sqlQueryError(cause) {
  if (cause?.name === "AbortError") return cause;
  if (cause?.code === "GEA_SQL_DISPLAY_ERROR") return cause;
  const code = String(cause?.code ?? "");
  const message = String(cause?.message ?? "");
  const denied = /(?:DATA_PERMISSION_DENIED|RETURN_PERMISSION_DENIED|NO_RETURN_COLUMN_ALLOWED|ACCESS_DENIED)/.test(code + " " + message);
  const expired = /(?:SESSION_(?:EXPIRED|REJECTED|NOT_FOUND|MAX_LIFETIME_EXCEEDED)|会话已失效)/.test(code + " " + message);
  const error = new Error(denied ? DATA_PERMISSION_MESSAGE : expired
    ? "数据会话已失效，请刷新页面重试"
    : "数据读取失败，请刷新重试；若仍失败，请查看接口错误详情", { cause });
  error.code = "GEA_SQL_DISPLAY_ERROR";
  return error;
}
export function queryErrorText(value) {
  const text = value instanceof Error ? value.message : value;
  return typeof text === "string" && text.includes(DATA_PERMISSION_MESSAGE)
    ? DATA_PERMISSION_MESSAGE : text;
}
/** Only used for SQL-backed report diagnostics, after the calculations finish. */
export function sqlReportCopy(value) {
  if (typeof value === "string") return queryErrorText(value);
  if (Array.isArray(value)) return value.map(sqlReportCopy);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sqlReportCopy(item)]));
  return value;
}
