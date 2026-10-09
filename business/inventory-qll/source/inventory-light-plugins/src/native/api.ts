import * as engine from "../qll-engine";
import { ready } from "../channel.js";

async function dispatch(url: URL, method: string, body: any, signal: AbortSignal) {
  const p = url.searchParams;
  if (url.pathname === "/api/workspace/details" && method === "POST")
    return engine.loadDetails(body, signal);
  if (url.pathname === "/api/workspace/trend" && method === "POST")
    return engine.loadTrend(body, signal);
  if (url.pathname === "/api/workspace/history" && method === "GET")
    return engine.loadHistory(p.get("workspaceId") ?? "", signal);
  if (url.pathname === "/api/workspace" && method === "GET") {
    const { scope, part, asOf, reuseCurrent: _reuse, ...filters } = Object.fromEntries(p);
    if (part !== undefined && part !== "current") throw Error("查询阶段无效");
    if (part === "current") window.dispatchEvent(new Event("gea-query-start"));
    return engine.load({ asOf, scope: scope ?? "company", part, filters, signal });
  }
  throw Error("暂不支持此操作，业务数据未保存或提交。");
}

export async function mountBusinessFetch() {
  await ready;
  let lifetime = new AbortController();
  window.addEventListener("light-refresh", () => {
    lifetime.abort();
    lifetime = new AbortController();
  });
  window.addEventListener("gea-identity-changed", () => lifetime.abort());
  window.fetch = async (input: any, init: any = {}) => {
    const signal = init.signal
      ? AbortSignal.any([lifetime.signal, init.signal])
      : lifetime.signal;
    const url = new URL(input instanceof Request ? input.url : String(input), "https://html-plugin.local");
    if (url.origin !== "https://html-plugin.local") throw Error("当前数据访问方式不可用，请重新打开工作台。");
    const method = init.method ?? (input instanceof Request ? input.method : "GET");
    const body = init.body ? JSON.parse(String(init.body)) : {};
    signal.throwIfAborted();
    try {
      const result = await dispatch(url, method, body, signal);
      signal.throwIfAborted();
      return Response.json(result);
    } catch (e) {
      if (signal.aborted) throw e;
      const message = (e as Error).message;
      return Response.json({ error: message, message, recoverable: true, sampleFallback: false }, { status: 503 });
    }
  };
}
export function clearBusinessCache(_identityChanged = false) {
  engine.clearFacts();
}
