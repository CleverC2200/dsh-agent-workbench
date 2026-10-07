import type { FullChainWorkspace } from "./full-chain/types";

export type WorkspaceEvent = { type: "workspace"; workspace: FullChainWorkspace } | { type: "error"; error: string };

/** Background history enriches the same view; a new query resets selections. */
export function workspaceViewKey(workspace: FullChainWorkspace | null) {
  return workspace ? JSON.stringify([workspace.accessScopeId, workspace.generatedAt, workspace.scope, workspace.filters]) : "";
}

/** Handles split UTF-8 characters/lines and treats a truncated stream as failure. */
export async function readWorkspaceResponse(response: Response, receive: (workspace: FullChainWorkspace) => void, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const workspace = await response.json();
    signal?.throwIfAborted();
    if (!response.ok || workspace.contractVersion !== "full-chain-workspace/v1") throw new Error(workspace.error || "全链路库存加载失败");
    receive(workspace);
    return;
  }
  if (!response.ok || !response.body) throw new Error("全链路库存加载失败");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let complete = false;
  const accept = (line: string) => {
    if (!line.trim()) return;
    signal?.throwIfAborted();
    const event = JSON.parse(line) as WorkspaceEvent;
    if (event.type === "error") throw new Error(event.error);
    if (event.type !== "workspace" || event.workspace?.contractVersion !== "full-chain-workspace/v1" || complete) throw new Error("库存数据响应无效");
    receive(event.workspace);
    complete = event.workspace.trends.state !== "loading";
  };
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n")) >= 0) {
        accept(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 1);
      }
      if (done) break;
    }
    if (buffer.trim()) accept(buffer);
    if (!complete) throw new Error("历史趋势连接中断，请重试");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
