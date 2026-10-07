import {
  ready,
  publish,
  currentSessionId,
  reportElements,
  action,
} from "../../../business/shared/channel.js";
import { createPageViewState } from "../../../business/shared/view-state.js";
export const mpsView = createPageViewState("plan-category-production");
const parts = new Map();
let restored = false,
  restoration = 0;
const restorationListeners = new Set();
let connected = false,
  scheduled = false,
  active = true,
  revision = 0,
  epoch = 0,
  publishing = false;
let latest;
let lifetime = new AbortController();
const notice =
  "模拟原型：所有数据和操作均为模拟，保存、提交、导出及结转不会写入业务系统。当前Session保留界面意图和未发送文字；模拟派生结果不存业务库。";
mpsView.subscribe(() => {
  latest = undefined;
  revision++;
  restored = true;
  restoration++;
  for (const listener of restorationListeners) listener(restoration);
});
async function flush() {
  if (publishing || !active || !connected || !restored) return;
  publishing = true;
  try {
    while (latest && active && connected && restored) {
      const next = latest;
      latest = undefined;
      if (next.epoch !== epoch || next.session !== currentSessionId()) continue;
      const signal = lifetime.signal;
      try {
        // Await the previous delivery before sending the latest authored context.
        await publish(next.snapshot, { signal });
        if (
          active &&
          !signal.aborted &&
          next.epoch === epoch &&
          next.revision === revision
        )
          document.getElementById("mps-context-status").textContent = "";
      } catch (error) {
        if (
          active &&
          !signal.aborted &&
          next.epoch === epoch &&
          next.revision === revision
        )
          document.getElementById("mps-context-status").textContent =
            "页面上下文连接失败：" + error.message;
      }
    }
  } finally {
    publishing = false;
  }
}
function schedule() {
  revision++;
  if (!connected || scheduled || !active) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    const session = currentSessionId();
    if (
      !active ||
      !restored ||
      !session ||
      !parts.has("navigation") ||
      [...parts.values()].some((part) => part.restoration !== restoration)
    )
      return;
    latest = {
      revision,
      epoch,
      session,
      snapshot: {
        page: "主生产计划(MPS) · 模拟原型",
        mock: true,
        notice,
        parts: Object.fromEntries(
          [...parts].map(([key, part]) => [key, part.value]),
        ),
      },
    };
    void flush();
  });
}
function cancelPublication() {
  epoch++;
  revision++;
  lifetime.abort();
  lifetime = new AbortController();
  latest = undefined;
}
/** Component owners report their current state, without discovering DOM. */
export function useMpsPart(react, key, value, label) {
  const serialized = JSON.stringify(value);
  const [restoreRevision, setRestoreRevision] = react.useState(restoration);
  react.useEffect(() => {
    restorationListeners.add(setRestoreRevision);
    setRestoreRevision(restoration);
    return () => restorationListeners.delete(setRestoreRevision);
  }, []);
  react.useEffect(() => {
    const part = {
      value: JSON.parse(serialized),
      restoration: restoreRevision,
      stop: () => {},
    };
    parts.set(key, part);
    const stop =
      key === "navigation"
        ? () => {}
        : reportElements("mps-part:" + key, [
            { id: "step:" + key, role: "collection", label, editable: false },
          ]);
    part.stop = stop;
    schedule();
    return () => {
      if (parts.get(key) !== part) return;
      parts.delete(key);
      stop();
      schedule();
    };
  }, [key, serialized, restoreRevision]);
}
export function useMpsNavigation(react, state, select) {
  useMpsPart(react, "navigation", state);
  react.useEffect(
    () =>
      reportElements(
        "mps-tabs",
        state.tabs.map((tab) => ({
          id: "tab:" + tab.key,
          role: "control",
          label: tab.label,
          value: state.tab === tab.key ? "当前步骤" : "未选中",
          actions: ["invoke"],
          effect: "view",
        })),
        (args, signal) => {
          signal.throwIfAborted();
          if (
            args.kind !== "invoke" ||
            (args.action && args.action !== "invoke")
          )
            throw Error("ACTION_NOT_ALLOWED");
          const tab = state.tabs.find(
            (tab) => "tab:" + tab.key === args.target,
          );
          if (!tab) throw Error("ELEMENT_GONE");
          select(tab.key);
        },
      ),
    [state.tab, select],
  );
}
void ready.then(() => {
  connected = true;
  schedule();
});
const refreshLabel = "刷新MPS模拟原型，恢复当前Session界面意图并保留未发送文字";
action("refresh", refreshLabel, () => window.location.reload());
reportElements(
  "refresh",
  [
    {
      id: "control:refresh",
      role: "control",
      label: refreshLabel,
      actions: ["invoke"],
      effect: "view",
    },
  ],
  (args, signal) => {
    signal.throwIfAborted();
    if (args.kind !== "invoke" || (args.action && args.action !== "invoke"))
      throw Error("ACTION_NOT_ALLOWED");
    window.location.reload();
  },
);
window.addEventListener("gea-session-changed", () => {
  cancelPublication();
  restored = false;
  for (const part of parts.values()) part.stop();
  parts.clear();
  // Ask the current Workbench binding to restore its own Session scope, then
  // publish only after the authors have committed that restored projection.
  window.parent.postMessage(
    {
      protocol: "dsh-workbench-view-v1",
      type: "ready",
      page: "plan-category-production",
      version: 1,
    },
    "*",
  );
});
window.addEventListener("gea-identity-changed", () => {
  active = false;
  connected = false;
  cancelPublication();
  parts.clear();
});
window.addEventListener("pagehide", () => {
  active = false;
  connected = false;
  cancelPublication();
  parts.clear();
});
