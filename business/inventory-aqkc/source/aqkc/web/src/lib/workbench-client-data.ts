import { withAppBasePath } from "./app-base-path";
import { createRuntimeId } from "./runtime-id";

export type InitialDashboardPayload = {
  workspace?: unknown;
  error?: unknown;
};

export function loadInitialDashboardPayload(signal?: AbortSignal) {
  return fetch(withAppBasePath("/api/inventory/dashboard"), {
    headers: { "X-Client-Request-Id": createRuntimeId("workbench-load") },
    cache: "no-store",
    signal,
  })
    .then(async (response) => {
      const payload = (await response.json().catch(() => null)) as InitialDashboardPayload | null;
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "库存数据加载失败，请稍后重试。");
      }
      return payload ?? {};
    })
;
}

/** Recompute every overview metric in the same server pipeline as the initial view. */
export async function loadSelectedDashboardPayload(paths: string[], signal: AbortSignal): Promise<InitialDashboardPayload> {
  if (!paths.length) throw new Error("请选择基地查看指标。");
  const query = new URLSearchParams({ base: paths.map(path => path.replace(/基地$/u, "")).join(",") });
  const response = await fetch(withAppBasePath(`/api/inventory/dashboard?${query.toString()}`), {
    signal,
    headers: { "X-Client-Request-Id": createRuntimeId("workbench-overview") },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as InitialDashboardPayload | null;
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "所选基地指标加载失败，请重试。");
  return payload ?? {};
}
