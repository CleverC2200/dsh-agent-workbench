window.__ModuleLoader__.load({id:"@cleverc2200/dsh-agent-workbench",factory:(require)=>{var module={exports:{}};var exports=module.exports;"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react3 = __toESM(require("react"), 1);

// src/resource-selection.ts
async function selectResource(host, id, signal, embedded = false) {
  const configResponse = await host.fetch("/api/agent-workbench/config", { signal, cache: "no-store" });
  if (!configResponse.ok) throw Error("WORKBENCH_WORKSPACE_UNAVAILABLE");
  const config = await configResponse.json();
  if (typeof config.cwd !== "string" || !config.cwd.trim()) throw Error("WORKBENCH_WORKSPACE_REQUIRED");
  const response = await host.fetch("/api/agent-manage/resources/select", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }), signal });
  const resource = await response.json();
  if (!response.ok || typeof resource.preset !== "string") throw Error(resource.error ?? "RESOURCE_SELECTION_FAILED");
  signal.throwIfAborted();
  const workspaceId = await host.workspace(config.cwd);
  signal.throwIfAborted();
  const sessionId = await host.create({ workspaceId });
  signal.throwIfAborted();
  await host.select(sessionId, resource.preset);
  signal.throwIfAborted();
  const reference = await host.open(sessionId, typeof resource.skill === "string" ? resource.skill : void 0, signal, embedded);
  return { sessionId, preset: resource.preset, ...reference ? { reference } : {} };
}
function mountNativeResourceSelection(ctx, ready) {
  let active;
  return ctx.inject(["sessions", "workspaces", "remote", "remote.agentPresets", "conversation", "uiWorkspace"], (scope) => {
    const host = {
      fetch: (...args) => fetch(...args),
      workspace: async (path) => (await scope.workspaces.create({ path })).workspaceId,
      create: (options) => scope.sessions.create({ workspaceId: options.workspaceId }),
      select: async (id, preset) => {
        const result = await scope.remote.agentPresets.select(id, preset);
        if (!result.ok) throw Error(result.error.message);
      },
      open: async (id, skill, signal, embedded) => {
        const reference = scope.sessions.retain(id, { source: "agentResourceSelection", signal });
        try {
          await reference.ready;
          signal.throwIfAborted();
          if (skill) {
            const input = scope.conversation.input.for(reference.binding.ctx);
            const state = input.state.getSnapshot();
            if (state.draft || reference.binding.ctx.bail("slash/input-insert-text", { text: `/${skill} `, span: { start: 0, end: 0, draftRev: state.draftRev } }) !== true) throw Error("RESOURCE_DRAFT_CHANGED");
          }
          if (embedded) return reference;
          scope.uiWorkspace.openSession(id);
        } catch (error) {
          reference.release();
          throw error;
        }
        reference.release();
      }
    };
    active = host;
    ready(host);
    scope.effect(() => () => {
      if (active === host) {
        active = void 0;
        ready(void 0);
      }
    });
  });
}

// src/workbench.ts
var WorkbenchController = class {
  constructor(ports) {
    this.ports = ports;
  }
  pages = /* @__PURE__ */ new Map();
  disposed = false;
  listeners = /* @__PURE__ */ new Set();
  register(page) {
    if (this.disposed) throw Error("WORKBENCH_DISPOSED");
    if (this.pages.has(page.id)) throw Error(`Duplicate workbench page: ${page.id}`);
    this.pages.set(page.id, page);
    this.changed();
    return () => {
      if (this.pages.get(page.id) === page) {
        this.pages.delete(page.id);
        this.changed();
      }
    };
  }
  async open(id) {
    if (this.disposed) return false;
    if (!this.pages.has(id) && !this.ports.hasPanel?.(id)) throw Error(`Unknown workbench page: ${id}`);
    this.ports.panel(id);
    return true;
  }
  registerFrame(page) {
    if (!this.ports.frame) throw Error("WORKBENCH_FRAME_UNAVAILABLE");
    const unregister = this.register(page);
    let dispose;
    try {
      dispose = this.ports.frame(page);
    } catch (error) {
      unregister();
      throw error;
    }
    return () => {
      dispose();
      unregister();
    };
  }
  label(id) {
    const label = this.pages.get(id)?.label;
    return typeof label === "function" ? label() : label ?? id;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  changed() {
    for (const listener of this.listeners) listener();
  }
  dispose() {
    this.disposed = true;
    this.pages.clear();
  }
};

// theme/tokens.css
var tokens_default = '/* Shared workbench resource 1.0.0. State belongs to DSH ui-theme.\n * html + body specificity keeps the adapter stable when base sheets reload.\n * Inline user token overrides retain priority. Status palettes stay upstream. */\nhtml body {\n  --workbench-theme-version: "1.0.0";\n  --workbench-font-family: "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif;\n  --workbench-font-size: var(--dsh-content-font-size, 14px);\n  --workbench-page: #f7f8fa;\n  --workbench-surface: #ffffff;\n  --workbench-subtle: #fafafa;\n  --workbench-muted-surface: #f5f6f8;\n  --workbench-text: #20232a;\n  --workbench-body: #555d68;\n  --workbench-muted: #626b78;\n  --workbench-border: #e3e6ea;\n  --workbench-control-border: #d9dde3;\n  --workbench-brand: #df1732;\n  --workbench-selected-text: #d0132c;\n  --workbench-brand-hover: #c91029;\n  --workbench-brand-soft: #fff0f2;\n  --workbench-hover: #fffafb;\n}\n\nhtml body[data-ds-dark-theme] {\n  --workbench-page: #1b1d21;\n  --workbench-surface: #24262b;\n  --workbench-subtle: #282b31;\n  --workbench-muted-surface: #30343b;\n  --workbench-text: #edf0f5;\n  --workbench-body: #c7cdd6;\n  --workbench-muted: #aab3bf;\n  --workbench-border: #414751;\n  --workbench-control-border: #59616e;\n  --workbench-brand: #ff8092;\n  --workbench-selected-text: #ff9aa8;\n  --workbench-brand-hover: #ff9aa8;\n  --workbench-brand-soft: #442630;\n  --workbench-hover: #35272e;\n}\n\n.agent-workbench-ui {\n  background: var(--workbench-page);\n  color: var(--workbench-text);\n  font: var(--workbench-font-size)/1.5 var(--workbench-font-family);\n}\n.agent-workbench-directory { height: 100%; overflow: auto; box-sizing: border-box; padding: 24px; }\n.agent-workbench-pages { display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: 12px; }\n.agent-workbench-ui button { padding: 10px 14px; border: 1px solid var(--workbench-border); border-radius: 8px; background: var(--workbench-surface); color: var(--workbench-text); font: inherit; cursor: pointer; }\n.agent-workbench-ui button:not(:disabled):hover { background: var(--workbench-hover); border-color: var(--workbench-brand); }\n.agent-workbench-ui button:focus-visible { outline: 2px solid var(--workbench-brand); outline-offset: 2px; }\n.agent-workbench-html { height: 100%; width: 100%; border: 0; display: block; }\n\n.agent-workbench-ui button[aria-current="page"] { color: var(--workbench-selected-text); background: var(--workbench-brand-soft); border-color: var(--workbench-brand); }\n.agent-workbench-ui button:disabled { color: var(--workbench-muted); background: var(--workbench-muted-surface); cursor: default; }\n\n.agent-workbench-document { height: 100%; min-height: 0; display:flex; flex-direction:column; }\n.agent-workbench-page-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:12px; padding:8px 16px; border-bottom:1px solid var(--workbench-border); flex:none; }\n.agent-workbench-page-toolbar>span:last-child { color:var(--workbench-muted); }\n.agent-workbench-page-error { padding:8px 16px; margin:0; flex:none; color:var(--workbench-text); }\n.agent-workbench-document-body { min-height:0; flex:1; display:grid; grid-template-columns:minmax(0,1fr); }\n.agent-workbench-document-body.with-conversation { grid-template-columns:minmax(0,1fr) minmax(340px,36%); }\n.agent-workbench-native-conversation { min-height:0; border-left:1px solid var(--workbench-border); overflow:auto; }\n@media(max-width:900px) { .agent-workbench-document-body.with-conversation { grid-template-columns:minmax(0,1fr); grid-template-rows:minmax(320px,1fr) minmax(320px,1fr); overflow:auto; } .agent-workbench-native-conversation {border-left:0;border-top:1px solid var(--workbench-border);} }\n';

// src/frame-presenter.tsx
var import_react2 = require("react");

// src/page-interaction/page-bridge/protocol.ts
var AGUI_EVENT_TOOL_CALL_START = "TOOL_CALL_START";
var AGUI_EVENT_TOOL_CALL_ARGS = "TOOL_CALL_ARGS";
var AGUI_EVENT_TOOL_CALL_END = "TOOL_CALL_END";

// src/page-interaction/page-bridge/client.ts
function startPageBridgeClient(options) {
  if (options.sessionId === null) return () => {
  };
  const pollMs = options.pollMs ?? 1200;
  const initialDelayMs = options.initialDelayMs ?? 500;
  const applyTimeoutMs = options.applyTimeoutMs ?? 8e3;
  const buffers = /* @__PURE__ */ new Map();
  const names = /* @__PURE__ */ new Map();
  const settled = /* @__PURE__ */ new Set();
  const activeApplies = /* @__PURE__ */ new Map();
  const outbox = [];
  let counter = 0;
  let stopped = false;
  let timer;
  const closeOnDispose = options.closeOnDispose ?? true;
  const message = (toolCallId, result) => ({
    id: `page-bridge-result-${++counter}`,
    role: "tool",
    toolCallId,
    content: JSON.stringify({ toolCallId, applied: result.applied }),
    ...result.error ? { error: result.error } : {}
  });
  const runApply = async (toolCallId, toolCallName, args) => {
    const controller = new AbortController();
    activeApplies.set(toolCallId, controller);
    let timeout;
    let timedOut = false;
    try {
      return await Promise.race([
        Promise.resolve(
          options.apply(
            args,
            { toolCallId, toolCallName },
            controller.signal
          )
        ),
        new Promise((resolve) => {
          controller.signal.addEventListener(
            "abort",
            () => {
              if (!timedOut) resolve({ applied: false, error: "APPLY_CANCELLED" });
            },
            { once: true }
          );
          timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
            resolve({ applied: false, error: "APPLY_TIMEOUT" });
          }, applyTimeoutMs);
        })
      ]);
    } catch (error) {
      return { applied: false, error: "APPLY_FAILED" };
    } finally {
      if (timeout) clearTimeout(timeout);
      activeApplies.delete(toolCallId);
    }
  };
  const poll = async () => {
    const pending = outbox.splice(0, outbox.length);
    try {
      const pageSource = typeof options.pageSource === "function" ? options.pageSource() : options.pageSource;
      const result = await options.request(
        options.endpoint,
        {
          sessionId: options.sessionId,
          toolMessages: pending,
          ...options.catalog ? { catalog: options.catalog() } : {},
          ...pageSource === void 0 ? {} : { pageSource }
        }
      );
      if (stopped) return;
      for (const event of result.events ?? []) {
        if (event.type === AGUI_EVENT_TOOL_CALL_START) {
          buffers.set(event.toolCallId, "");
          names.set(event.toolCallId, event.toolCallName);
          continue;
        }
        if (event.type === AGUI_EVENT_TOOL_CALL_ARGS) {
          buffers.set(
            event.toolCallId,
            (buffers.get(event.toolCallId) ?? "") + event.delta
          );
          continue;
        }
        if (event.type !== AGUI_EVENT_TOOL_CALL_END) continue;
        const raw = buffers.get(event.toolCallId) ?? "";
        const toolCallName = names.get(event.toolCallId) ?? "";
        buffers.delete(event.toolCallId);
        names.delete(event.toolCallId);
        if (settled.has(event.toolCallId)) continue;
        settled.add(event.toolCallId);
        let args;
        try {
          args = JSON.parse(raw);
        } catch {
          outbox.push(message(event.toolCallId, { applied: false, error: "INVALID_TOOL_ARGUMENTS" }));
          continue;
        }
        const outcome = await runApply(
          event.toolCallId,
          toolCallName,
          args
        );
        if (stopped) return;
        outbox.push(message(event.toolCallId, outcome));
      }
    } catch (error) {
      if (stopped) return;
      options.onError?.(error);
    }
    if (!stopped) timer = setTimeout(() => void poll(), pollMs);
  };
  timer = setTimeout(() => void poll(), initialDelayMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
    for (const controller of activeApplies.values()) controller.abort();
    activeApplies.clear();
    if (!closeOnDispose || typeof options.sessionId !== "string") return;
    try {
      void Promise.resolve(
        options.request(options.endpoint, {
          sessionId: options.sessionId,
          toolMessages: [],
          catalog: null
        })
      ).catch(() => {
      });
    } catch {
    }
  };
}

// src/html-bridge.ts
function connectHtmlFrame(frame, connection, execution, theme, signal, failed) {
  const lifetime = new AbortController();
  const channel = new MessageChannel();
  const tasks = /* @__PURE__ */ new Map();
  const applies = /* @__PURE__ */ new Map();
  let connected = false, themeRequested = false;
  let elements = null;
  let pollTimer;
  const context = { plugin: connection.page.pluginId, session: connection.sessionId };
  const alive = () => !lifetime.signal.aborted && !signal.aborted;
  const call = (method, parameters, requestSignal = lifetime.signal) => execution.call(connection, method, parameters, AbortSignal.any([signal, lifetime.signal, requestSignal]));
  const sendTheme = () => {
    if (!alive() || !connected || !themeRequested) return;
    const snapshot = theme();
    channel.port1.postMessage({ type: "theme", context, version: "1.0.0", colorScheme: snapshot.active.colorScheme, fontSize: snapshot.fontSize, tokens: snapshot.active.tokens });
  };
  const ready = (event) => {
    if (!alive() || event.source !== frame.contentWindow || event.data?.protocol !== "gea-html-v2" || event.data.type !== "ready" || connected) return;
    connected = true;
    frame.contentWindow?.postMessage({ protocol: "gea-html-v2", type: "connect", context }, "*", [channel.port2]);
  };
  window.addEventListener("message", ready);
  const pageBridge = startPageBridgeClient({
    endpoint: "page-bridge",
    request: (_endpoint, payload) => call("page-bridge", payload),
    sessionId: connection.sessionId,
    pageSource: "self-report",
    catalog: () => elements === null ? null : { elements },
    apply: (args, meta, applySignal) => new Promise((resolve) => {
      const settle = (result) => {
        applies.delete(meta.toolCallId);
        applySignal.removeEventListener("abort", cancel);
        resolve(result);
      };
      const cancel = () => {
        channel.port1.postMessage({ type: "cancel", session: connection.sessionId, toolCallId: meta.toolCallId });
        settle({ applied: false, error: "PAGE_ACTION_CANCELLED" });
      };
      applies.set(meta.toolCallId, settle);
      if (!alive() || applySignal.aborted) return cancel();
      applySignal.addEventListener("abort", cancel, { once: true });
      channel.port1.postMessage({ type: "apply", session: connection.sessionId, toolCallId: meta.toolCallId, toolCallName: meta.toolCallName, args });
    })
  });
  channel.port1.onmessage = async (event) => {
    if (!alive()) return;
    const message = event.data;
    if (!message || typeof message !== "object") return;
    try {
      if (["request", "register", "invoked", "catalog", "applied", "cancel", "theme:subscribe"].includes(message.type) && message.session !== connection.sessionId) throw Error("PAGE_SESSION_CHANGED");
      if (message.type === "theme:subscribe") {
        themeRequested = true;
        sendTheme();
        return;
      }
      if (message.type === "catalog") {
        elements = Array.isArray(message.elements) && message.elements.length ? message.elements : null;
        return;
      }
      if (message.type === "applied") {
        applies.get(message.toolCallId)?.({ applied: message.applied === true, ...typeof message.error === "string" ? { error: message.error } : {} });
        return;
      }
      if (message.type === "cancel") {
        tasks.get(message.id)?.abort();
        return;
      }
      if (message.type === "register") {
        await call("register", { name: message.name, description: message.description });
        return;
      }
      if (message.type === "invoked") {
        await call("reply", message);
        return;
      }
      if (message.type !== "request" || typeof message.id !== "string") return;
      const task = new AbortController();
      tasks.set(message.id, task);
      try {
        let result;
        if (message.method === "conversation") {
          const text2 = message.parameters?.text;
          if (typeof text2 !== "string" || !text2.trim() || text2.length > 1e4 || JSON.stringify(message.parameters?.context ?? {}).length > 1e5) throw Error("INVALID_PAGE_QUESTION");
          await call("context", message.parameters?.context, task.signal);
          if (!alive() || task.signal.aborted) return;
          await execution.prompt(connection, text2, AbortSignal.any([signal, lifetime.signal, task.signal]));
          result = { sent: true };
        } else if (["sql", "workspace", "access", "context"].includes(message.method)) result = await call(message.method, message.parameters, task.signal);
        else throw Error("HTML_METHOD_NOT_ALLOWED");
        if (alive() && !task.signal.aborted) channel.port1.postMessage({ type: "response", id: message.id, result });
      } finally {
        tasks.delete(message.id);
      }
    } catch (error) {
      if (alive()) channel.port1.postMessage({ type: "response", id: message.id, error: error instanceof Error ? error.message : String(error) });
    }
  };
  channel.port1.start();
  frame.contentWindow?.postMessage({ protocol: "gea-html-v2", type: "request-ready" }, "*");
  const poll = async () => {
    try {
      const events = await call("events", void 0);
      if (alive()) for (const event of events) channel.port1.postMessage(event);
    } catch (error) {
      if (alive()) {
        failed(error);
        dispose();
      }
    }
    if (alive()) pollTimer = setTimeout(poll, 1e3);
  };
  const dispose = () => {
    if (lifetime.signal.aborted) return;
    lifetime.abort();
    signal.removeEventListener("abort", dispose);
    pageBridge();
    if (pollTimer) clearTimeout(pollTimer);
    for (const task of tasks.values()) task.abort();
    tasks.clear();
    for (const settle of [...applies.values()]) settle({ applied: false, error: "PAGE_ACTION_CANCELLED" });
    channel.port1.postMessage({ type: "context", context: null });
    window.removeEventListener("message", ready);
    channel.port1.close();
    channel.port2.close();
  };
  signal.addEventListener("abort", dispose, { once: true });
  if (signal.aborted) dispose();
  else void poll();
  return Object.assign(dispose, { sendTheme });
}

// src/page-interaction/client.ts
var import_react = __toESM(require("react"), 1);

// src/page-interaction/reference.ts
var PAGE_INTERACTION = "dsh-page-interaction-v1";
var REFERENCE_SOURCE = "page-content";
var text = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";
function pageReference(value) {
  if (!value || typeof value !== "object") return;
  const v = value;
  if (typeof v.text !== "string" || !v.text.trim()) return;
  return {
    page: text(v.page, 160),
    kind: v.kind === "row" || v.kind === "table" ? v.kind : "block",
    label: text(v.label, 160) || "\u9875\u9762\u5185\u5BB9",
    text: text(v.text, 6e3),
    row: text(v.row, 200),
    column: text(v.column, 200),
    scope: text(v.scope, 1e3),
    targets: Array.isArray(v.targets) ? v.targets.filter(
      (x) => typeof x === "string" && x.length <= 200
    ) : [],
    capturedAt: text(v.capturedAt, 64),
    truncated: v.text.length > 6e3 || v.truncated === true
  };
}
function serializeReference(value) {
  if (!/^R[a-f0-9]{12}$/.test(value.id) || typeof value.label !== "string")
    throw Error("\u5F15\u7528\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5185\u5BB9\u3002");
  const label = value.label.replace(/[%\[\]\\@\/\r\n]/g, encodeURIComponent);
  return `[${label}](dsh-page:${value.id}) `;
}

// src/page-interaction/client.ts
function installPageInteraction(ctx) {
  try {
    const existing = ctx.get("pageInteraction");
    if (existing) return existing;
  } catch {
  }
  let ready;
  let disposed = false;
  const bindings = /* @__PURE__ */ new Set();
  const releases = /* @__PURE__ */ new Set();
  const triggers = /* @__PURE__ */ new Set();
  const currentPicker = (sessionId) => [...bindings].reverse().find(
    (binding) => binding.available && binding.sessionId === sessionId && binding.frame.isConnected && binding.frame.getClientRects().length > 0
  );
  const updateTriggers = () => {
    if (!triggers.size) return;
    for (const button of triggers) {
      const binding = currentPicker(button.dataset.sessionId);
      button.disabled = !binding;
      button.setAttribute("aria-pressed", String(binding?.selecting === true));
      button.setAttribute(
        "aria-label",
        binding?.selecting ? "\u9000\u51FA\u9009\u62E9" : "\u9009\u62E9\u5185\u5BB9"
      );
      button.title = binding?.selecting ? "\u9000\u51FA\u9009\u62E9\uFF08Esc\uFF09" : "\u9009\u62E9\u5185\u5BB9\uFF08\u6309\u4F4F Alt \u4E34\u65F6\u9009\u62E9\uFF0CEsc \u9000\u51FA\uFF09";
    }
  };
  ctx.inject(["inputTriggers", "conversation"], (scope) => {
    scope.effect(
      () => scope.inputTriggers.registerSource({
        trigger: "@",
        name: REFERENCE_SOURCE,
        candidates: async () => [],
        onPick: () => void 0,
        codec: {
          clipboardText: (ref) => serializeReference(JSON.parse(ref)),
          serialize: async (ref) => {
            return serializeReference(JSON.parse(ref));
          }
        }
      })
    );
    ready = scope;
    scope.effect(() => {
      const down = (event) => {
        const paired = [...triggers].filter((button) => button.isConnected && button.getClientRects().length > 0 && currentPicker(button.dataset.sessionId));
        const sessions = new Set(paired.map((button) => button.dataset.sessionId));
        const picker = sessions.size === 1 ? currentPicker([...sessions][0]) : void 0;
        if (!picker || event.isComposing) return;
        if (event.key === "Alt" && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          picker.send({ type: "hold-selection", held: true });
        }
        if (event.key === "Escape") {
          if (picker.selecting) event.preventDefault();
          picker.send({ type: "stop-selection", altHeld: event.altKey });
        }
      };
      const release = (transient = false) => {
        for (const picker of bindings)
          picker.send({
            type: transient ? "suspend-selection" : "hold-selection",
            held: false
          });
      };
      const up = (event) => {
        if (event.key === "Alt") release();
      };
      const blur = () => {
        if (typeof document === "undefined" || !document.hasFocus())
          release(true);
      };
      const visibility = () => {
        if (document.hidden) release(true);
      };
      window.addEventListener("keydown", down, true);
      window.addEventListener("keyup", up, true);
      window.addEventListener("blur", blur);
      if (typeof document !== "undefined")
        document.addEventListener("visibilitychange", visibility);
      return () => {
        window.removeEventListener("keydown", down, true);
        window.removeEventListener("keyup", up, true);
        window.removeEventListener("blur", blur);
        if (typeof document !== "undefined")
          document.removeEventListener("visibilitychange", visibility);
      };
    });
    updateTriggers();
    scope.effect(() => () => {
      if (ready === scope) ready = void 0;
    });
  });
  const api = {
    mountTrigger(container, sessionId) {
      if (disposed) throw new Error("\u9875\u9762\u4EA4\u4E92\u5DF2\u91CA\u653E\u3002");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.sessionId = sessionId;
      button.setAttribute("aria-keyshortcuts", "Alt Escape");
      button.setAttribute("aria-label", "\u9009\u62E9\u5185\u5BB9");
      button.setAttribute("data-page-selection-trigger", "");
      const icon = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("width", "20");
      icon.setAttribute("height", "20");
      icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(icon.namespaceURI, "path");
      path.setAttribute("d", "M3.5 3.5 21 11.5l-7.5 2-2 7.5L3.5 3.5Z");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("stroke-linejoin", "round");
      icon.append(path);
      button.append(icon);
      button.addEventListener(
        "click",
        () => currentPicker(sessionId)?.send({ type: "toggle-selection" })
      );
      container.append(button);
      triggers.add(button);
      for (const binding of bindings) binding.configure();
      updateTriggers();
      return () => {
        triggers.delete(button);
        button.remove();
        for (const binding of bindings) binding.configure();
      };
    },
    bindFrame({ frame, reference, page, surface, tool, referenceLease }) {
      if (disposed) throw new Error("\u9875\u9762\u4EA4\u4E92\u5DF2\u91CA\u653E\u3002");
      const { sessionId } = reference;
      const owned = reference.binding;
      const retained = () => {
        try {
          return reference.binding === owned;
        } catch {
          return false;
        }
      };
      const paired = () => retained() && currentPicker(sessionId) === binding && [...triggers].some((button) => button.dataset.sessionId === sessionId && button.isConnected && button.getClientRects().length > 0);
      const input = () => {
        if (!ready || !retained()) throw new Error("\u5BF9\u8BDD\u5DF2\u91CA\u653E\uFF0C\u8BF7\u91CD\u65B0\u5173\u8054\u9875\u9762\u3002");
        return ready.conversation.input.for(reference.binding.ctx);
      };
      const channel = crypto.randomUUID();
      const sandbox = frame.getAttribute("sandbox");
      const opaqueOrigin = sandbox !== null && !sandbox.split(/\s+/).includes("allow-same-origin");
      const expectedOrigin = opaqueOrigin ? "null" : frame.src && !frame.srcdoc ? new URL(frame.src, window.location.href).origin : void 0;
      let active = true;
      let generation;
      const bindingRequest = new AbortController();
      const requests = /* @__PURE__ */ new Map();
      const send = (message) => frame.contentWindow?.postMessage(
        { protocol: PAGE_INTERACTION, channel, ...message },
        "*"
      );
      const configure = () => {
        if (generation) send({ type: "configure", page, externalTrigger: [...triggers].some((button) => button.dataset.sessionId === sessionId) });
      };
      const binding = {
        frame,
        sessionId,
        selecting: false,
        available: false,
        send,
        configure
      };
      bindings.add(binding);
      updateTriggers();
      const receive = async (event) => {
        if (event.source !== frame.contentWindow || expectedOrigin !== void 0 && event.origin !== expectedOrigin || event.data?.protocol !== PAGE_INTERACTION)
          return;
        if (event.data.type === "ready") {
          configure();
          return;
        }
        if (!active || event.data.channel !== channel) return;
        if (event.data.type === "selection-state") {
          binding.selecting = event.data.active === true;
          binding.available = true;
          updateTriggers();
          return;
        }
        if (event.data.type === "selection-error") {
          if (ready && retained())
            input().notify(
              "error",
              String(event.data.error || "\u5F15\u7528\u672A\u52A0\u5165\uFF0C\u8BF7\u91CD\u8BD5\u3002")
            );
          return;
        }
        if (event.data.type === "cancel-reference") {
          requests.get(event.data.requestId)?.abort();
          return;
        }
        if (event.data.type !== "reference" || typeof event.data.requestId !== "string")
          return;
        const requestId = event.data.requestId;
        const controller = new AbortController();
        requests.set(requestId, controller);
        const deadline = setTimeout(() => {
          if (!active || controller.signal.aborted) return;
          controller.abort();
          send({ type: "result", requestId, ok: false, error: "\u5F15\u7528\u672A\u52A0\u5165\uFF0C\u8BF7\u91CD\u8BD5\u3002" });
        }, 5e3);
        try {
          if (!ready || !generation || !paired())
            throw Error("\u8BF7\u5148\u6253\u5F00\u5F53\u524D\u9875\u9762\u7684\u5BF9\u8BDD\uFF0C\u518D\u52A0\u5165\u63D0\u95EE\u3002");
          const selected = pageReference(event.data.reference);
          if (!selected) throw Error("\u672A\u8BFB\u5230\u9009\u4E2D\u5185\u5BB9\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002");
          const value = {
            ...selected,
            page,
            sessionId,
            surface,
            tool
          };
          const response = await fetch("/api/page-interaction/reference", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...value, generation, lease: referenceLease?.() }),
            signal: controller.signal
          });
          const receipt = await response.json();
          if (!active || controller.signal.aborted) return;
          if (!response.ok)
            throw Error(receipt.error || "\u5F15\u7528\u672A\u4FDD\u5B58\uFF0C\u8BF7\u91CD\u8BD5\u3002");
          const bindingResponse = await fetch("/api/page-interaction/binding", {
            cache: "no-store",
            signal: controller.signal
          });
          const currentBinding = await bindingResponse.json();
          if (!active || controller.signal.aborted) return;
          if (!bindingResponse.ok || currentBinding.generation !== generation)
            throw Error("\u767B\u5F55\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5F15\u7528\u3002");
          if (!ready || !paired())
            throw Error("\u5DF2\u5207\u6362\u5BF9\u8BDD\uFF0C\u8BF7\u5728\u5F53\u524D\u9875\u9762\u91CD\u65B0\u5F15\u7528\u3002");
          const composer = input();
          const state = composer.state.getSnapshot();
          const inserted = composer.insertReference(
            {
              source: REFERENCE_SOURCE,
              ref: JSON.stringify(receipt),
              label: receipt.label,
              appearance: "session",
              clipboardText: serializeReference(receipt)
            },
            {
              start: state.draft.length,
              end: state.draft.length,
              draftRev: state.draftRev
            }
          );
          if (!inserted) throw Error("\u8F93\u5165\u6846\u6B63\u5728\u53D1\u9001\uFF0C\u8BF7\u7A0D\u540E\u518D\u52A0\u5165\u63D0\u95EE\u3002");
          send({ type: "result", requestId: event.data.requestId, ok: true });
        } catch (error) {
          if (!active || controller.signal.aborted) return;
          send({
            type: "result",
            requestId: event.data.requestId,
            ok: false,
            error: error instanceof Error ? error.message : "\u5F15\u7528\u672A\u52A0\u5165\uFF0C\u8BF7\u91CD\u8BD5\u3002"
          });
        } finally {
          clearTimeout(deadline);
          requests.delete(requestId);
        }
      };
      const reloaded = () => {
        if (requests.size) {
          for (const controller of requests.values()) controller.abort();
          requests.clear();
          if (ready && retained()) input().notify("error", "\u9875\u9762\u5DF2\u91CD\u65B0\u52A0\u8F7D\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5F15\u7528\u3002");
        }
        configure();
      };
      window.addEventListener("message", receive);
      frame.addEventListener("load", reloaded);
      void fetch("/api/page-interaction/binding", { cache: "no-store", signal: bindingRequest.signal }).then(async (response) => {
        const value = await response.json();
        if (!response.ok || typeof value.generation !== "string") throw Error("\u9875\u9762\u5F15\u7528\u8FDE\u63A5\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u9875\u9762\u3002");
        if (!active) return;
        generation = value.generation;
        configure();
      }).catch((error) => {
        if (!active) return;
        if (ready && retained()) input().notify("error", String(error.message));
      });
      const release = () => {
        if (!active) return;
        active = false;
        releases.delete(release);
        bindingRequest.abort();
        bindings.delete(binding);
        updateTriggers();
        for (const controller of requests.values()) controller.abort();
        requests.clear();
        send({ type: "disconnect" });
        window.removeEventListener("message", receive);
        frame.removeEventListener("load", reloaded);
      };
      releases.add(release);
      return release;
    }
  };
  ctx.provide("pageInteraction", api);
  ctx.effect(() => () => {
    disposed = true;
    for (const release of [...releases]) release();
    for (const button of triggers) button.remove();
    triggers.clear();
  });
  ctx.inject(["slots"], (scope) => {
    if (!scope.slots?.inject) return;
    scope.effect(() => scope.slots.inject(
      "conversation.input.left",
      () => scope.slots.register(
        { name: "conversation.input.left", id: "page-selection", order: 50 },
        function SelectionControl({ sessionId }) {
          const anchor = (0, import_react.useRef)(null);
          (0, import_react.useEffect)(
            () => anchor.current ? api.mountTrigger(anchor.current, sessionId) : void 0,
            [sessionId]
          );
          return import_react.default.createElement("span", {
            ref: anchor,
            className: "dspi-composer-trigger"
          });
        }
      )
    ));
    scope.effect(() => {
      const style = document.createElement("style");
      style.textContent = ".dspi-composer-trigger{display:inline-flex;align-items:center}.dspi-composer-trigger button{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary,#606977);cursor:pointer}.dspi-composer-trigger button:hover{background:var(--dsw-alias-interactive-bg-hover,#f2f3f5)}.dspi-composer-trigger button[aria-pressed=true]{background:#fff1f1;color:#df1d28}.dspi-composer-trigger button:disabled{opacity:.4;cursor:default}.dspi-composer-trigger button:focus-visible{outline:2px solid #d0132c;outline-offset:2px}.dspi-composer-trigger svg{width:16px;height:16px}";
      document.head.append(style);
      return () => style.remove();
    });
  });
  return api;
}

// src/frame-presenter.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var unknownIdentity = { state: "unknown", scope: null, status: null };
var noSubscribe = () => () => {
};
function mountFramePresentation(ctx, resources, t) {
  let execution;
  const backendListeners = /* @__PURE__ */ new Set();
  ctx.inject(["geaPageExecution"], (scope) => {
    execution = scope.geaPageExecution;
    for (const changed of backendListeners) changed();
    scope.effect(() => () => {
      if (execution === scope.geaPageExecution) {
        execution = void 0;
        for (const changed of backendListeners) changed();
      }
    });
  });
  const interaction = installPageInteraction(ctx);
  function Document({ page, SessionProvider, renderSlot }) {
    (0, import_react2.useSyncExternalStore)((listener) => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot());
    const currentExecution = (0, import_react2.useSyncExternalStore)((listener) => {
      backendListeners.add(listener);
      return () => {
        backendListeners.delete(listener);
      };
    }, () => execution);
    const identity = (0, import_react2.useSyncExternalStore)(currentExecution?.identity.subscribe ?? noSubscribe, currentExecution?.identity.getSnapshot ?? (() => unknownIdentity));
    const frame = (0, import_react2.useRef)(null);
    const [loaded, setLoaded] = (0, import_react2.useState)(0), [busy, setBusy] = (0, import_react2.useState)(false), [error, setError] = (0, import_react2.useState)("");
    const [selection, setSelection] = (0, import_react2.useState)();
    const pending = (0, import_react2.useRef)();
    const connectionTransition = (0, import_react2.useRef)(Promise.resolve());
    const title = typeof page.label === "function" ? page.label() : page.label ?? page.id;
    const src = typeof page.src === "function" ? page.src() : page.src;
    const sendTheme = () => {
      const theme = ctx.theme.getTheme();
      frame.current?.contentWindow?.postMessage({ protocol: "agent-workbench-theme", dark: theme.active.colorScheme === "dark", fontSize: theme.fontSize }, "*");
    };
    (0, import_react2.useEffect)(() => {
      const off = ctx.on("theme/change", sendTheme);
      return () => {
        off();
      };
    }, []);
    (0, import_react2.useEffect)(() => {
      const ready = (event) => {
        if (event.source === frame.current?.contentWindow && event.data?.protocol === "agent-workbench-theme") sendTheme();
      };
      window.addEventListener("message", ready);
      return () => window.removeEventListener("message", ready);
    }, []);
    (0, import_react2.useEffect)(() => () => {
      pending.current?.controller.abort();
      pending.current = void 0;
    }, []);
    (0, import_react2.useEffect)(() => {
      const flight = pending.current;
      if (flight && (flight.scope !== identity.scope || !identity.status?.authenticated)) {
        flight.controller.abort();
        if (pending.current === flight) {
          pending.current = void 0;
          setBusy(false);
        }
      }
      if (selection && (identity.scope !== selection.ownerScope || !identity.status?.authenticated)) {
        setSelection(void 0);
        setError(t("pageChanged"));
      }
    }, [identity.scope, identity.status?.authenticated, selection]);
    (0, import_react2.useEffect)(() => {
      if (!selection) return;
      return () => selection.reference.release();
    }, [selection]);
    (0, import_react2.useEffect)(() => {
      if (page.kind !== "native" || !frame.current) return;
      frame.current.contentWindow?.postMessage({ type: "gea:identity-snapshot", snapshot: identity }, window.location.origin);
      if (loaded && identity.status?.authenticated) page.onVisible?.();
    }, [identity, loaded, page]);
    (0, import_react2.useEffect)(() => {
      if (!selection || !loaded || !frame.current || !currentExecution) return;
      const controller = new AbortController();
      let connection;
      let disposeBridge = () => {
      }, disposeReference = () => {
      }, disposeTheme = () => {
      };
      const target = frame.current;
      const alive = () => !controller.signal.aborted && selection.ownerScope === currentExecution.identity.getSnapshot().scope;
      const setup = connectionTransition.current.then(async () => {
        controller.signal.throwIfAborted();
        connection = await currentExecution.open(page, selection.reference.sessionId, selection.preset, controller.signal);
        if (!alive()) {
          await currentExecution.close(connection);
          connection = void 0;
          return;
        }
        if (page.kind === "html") {
          const bridge = connectHtmlFrame(target, connection, currentExecution, () => ctx.theme.getTheme(), controller.signal, (failure) => {
            if (alive()) {
              setError(failure instanceof Error ? failure.message : String(failure));
              if (connection) void currentExecution.close(connection).catch(() => {
              });
            }
          });
          disposeBridge = bridge;
          const off = ctx.on("theme/change", () => bridge.sendTheme());
          disposeTheme = () => {
            off();
          };
        } else target.contentWindow?.postMessage({ type: "gea:session", sessionId: selection.reference.sessionId }, window.location.origin);
        disposeReference = interaction.bindFrame({ frame: target, reference: selection.reference, page: title, surface: page.kind === "html" ? `gea-html-${page.pluginId}` : "gea-workbench", tool: page.kind === "native" ? "gea_workbench_apply" : void 0, referenceLease: () => connection?.lease });
        setError("");
      });
      connectionTransition.current = setup.catch((failure) => {
        if (alive()) {
          setError(failure instanceof Error ? failure.message : String(failure));
          if (connection) void currentExecution.close(connection).catch(() => {
          });
        }
      });
      return () => {
        controller.abort();
        disposeTheme();
        disposeReference();
        disposeBridge();
        if (page.kind === "native") target.contentWindow?.postMessage({ type: "gea:session", sessionId: null }, window.location.origin);
        connectionTransition.current = setup.catch(() => {
        }).then(async () => {
          if (connection) {
            const owned = connection;
            connection = void 0;
            await currentExecution.close(owned);
          }
        }).catch(() => {
        });
      };
    }, [selection, loaded, currentExecution, page, title]);
    const connect = async () => {
      const host = resources();
      if (!host || !currentExecution || !page.resourceId) {
        setError(t("pageWait"));
        return;
      }
      if (!identity.status?.authenticated) {
        setError(t("pageLogin"));
        return;
      }
      pending.current?.controller.abort();
      const controller = new AbortController();
      const flight = { controller, scope: identity.scope };
      pending.current = flight;
      setBusy(true);
      setError("");
      try {
        const selected = await selectResource(host, page.resourceId, controller.signal, true);
        if (!selected.reference) throw Error(t("pageSessionUnavailable"));
        if (controller.signal.aborted || identity.scope !== currentExecution.identity.getSnapshot().scope) {
          selected.reference.release();
          return;
        }
        setSelection({ reference: selected.reference, preset: selected.preset, ownerScope: identity.scope });
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (pending.current === flight) {
          pending.current = void 0;
          setBusy(false);
        }
      }
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "agent-workbench-ui agent-workbench-document", children: [
      page.resourceId && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "agent-workbench-page-toolbar", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: title }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: busy, onClick: () => void connect(), children: busy ? t("pageWorking") : selection ? t("pageNewChat") : t("pageConnect") }),
        !selection && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("pageHint") })
      ] }),
      error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "alert", className: "agent-workbench-page-error", children: error }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "agent-workbench-document-body" + (selection ? " with-conversation" : ""), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("iframe", { ref: frame, title, src, ...page.kind === "html" ? { sandbox: "allow-scripts allow-downloads" } : {}, className: "agent-workbench-html", onLoad: () => {
          setLoaded((value) => value + 1);
          sendTheme();
          if (page.kind === "native") frame.current?.contentWindow?.postMessage({ type: "gea:identity-snapshot", snapshot: identity }, window.location.origin);
          page.onVisible?.();
        } }),
        selection && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", { className: "agent-workbench-native-conversation", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SessionProvider, { session: selection.reference, children: renderSlot("agent-workbench.conversation", {}) }) })
      ] })
    ] });
  }
  ctx.effect(() => ctx.slots.registerFactory({ name: "agent-workbench.document", scope: "root", children: { "agent-workbench.conversation": { kind: "single", scope: "session" } } }, Document));
  ctx.slots.inject("agent-workbench.conversation", () => ctx.slots.register({ name: "agent-workbench.conversation" }, ({ renderFactorySlot }) => renderFactorySlot("conversation.content", { variant: "embedded", phase: "active", hero: false })));
}

// src/client.ts
var inject = ["slots", "layout", "locale", "theme"];
var DIRECTORY = "agent-workbench";
var zh = { title: "\u5DE5\u4F5C\u53F0", pages: "\u5DF2\u63A5\u5165\u9875\u9762", conversation: "\u539F\u751F\u5BF9\u8BDD", failed: "\u9875\u9762\u76EE\u5F55\u8BFB\u53D6\u5931\u8D25", retry: "\u91CD\u8BD5", empty: "\u6682\u65E0\u5DF2\u63A5\u5165\u9875\u9762", resources: "\u63D0\u793A\u8BCD\u4E0E Skill", start: "\u5F00\u59CB\u65B0\u804A\u5929", useSkill: "\u5728\u65B0\u804A\u5929\u4E2D\u4F7F\u7528", unavailable: "\u4E0D\u53EF\u9009\u7528", missing: "\u5F53\u524D\u4E0D\u53EF\u7528 Skill", resourcesFailed: "\u8D44\u6E90\u6E05\u5355\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u3002", selectionFailed: "\u8D44\u6E90\u9009\u7528\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002", resourceWorking: "\u6B63\u5728\u88C5\u8F7D", resourcesRefresh: "\u5237\u65B0\u8D44\u6E90", pageConnect: "\u8FDE\u63A5\u9875\u9762\u4E0E\u539F\u751F\u5BF9\u8BDD", pageNewChat: "\u5F00\u59CB\u65B0\u7684\u9875\u9762\u5BF9\u8BDD", pageWorking: "\u6B63\u5728\u8FDE\u63A5\u2026", pageChanged: "\u767B\u5F55\u8EAB\u4EFD\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u9009\u7528\u9875\u9762\u80FD\u529B\u3002", pageHint: "\u4E1A\u52A1\u8BFB\u53D6\u9700\u767B\u5F55\u5E76\u9009\u7528\u9875\u9762\u80FD\u529B\u3002", pageWait: "\u9875\u9762\u80FD\u529B\u5C1A\u672A\u5C31\u7EEA\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", pageLogin: "\u8BF7\u5148\u767B\u5F55 GEA\uFF0C\u518D\u8FDE\u63A5\u9875\u9762\u80FD\u529B\u3002", pageSessionUnavailable: "\u9875\u9762\u539F\u751F\u4F1A\u8BDD\u672A\u5C31\u7EEA\u3002" };
var en = { title: "Workbench", pages: "Available pages", conversation: "Conversation", failed: "Page directory unavailable", retry: "Retry", empty: "No pages available", resources: "Prompts and Skills", start: "Start a new chat", useSkill: "Use in a new chat", unavailable: "Unavailable", missing: "Unavailable Skills", resourcesFailed: "Resource list unavailable. Please refresh.", selectionFailed: "Unable to select this resource. Please retry.", resourceWorking: "Loading", resourcesRefresh: "Refresh resources", pageConnect: "Connect page and Conversation", pageNewChat: "Start a new page chat", pageWorking: "Connecting\u2026", pageChanged: "Your identity changed. Select this page resource again.", pageHint: "Business reads require login and a selected page resource.", pageWait: "Page capability is not ready. Please retry shortly.", pageLogin: "Sign in to GEA before connecting this page.", pageSessionUnavailable: "The page Conversation is unavailable." };
function apply(ctx) {
  ctx.effect(() => ctx.locale.register("agentWorkbench", { zh, en }));
  const t = ctx.locale.bind("agentWorkbench");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.agentWorkbenchTheme = "1.0.0";
    style.textContent = tokens_default;
    document.head.append(style);
    return () => style.remove();
  });
  const workbench = new WorkbenchController({
    panel: (id) => ctx.layout.selectPanel(id),
    hasPanel: (id) => ctx.slots.entries("main").some((entry) => entry.options.key === id),
    frame: (page) => ctx.slots.register({ name: "main", key: page.id }, ({ renderFactorySlot }) => renderFactorySlot("agent-workbench.document", { page }))
  });
  ctx.provide("agentWorkbench", workbench);
  ctx.effect(() => () => workbench.dispose());
  let nativeResources;
  mountNativeResourceSelection(ctx, (host) => {
    nativeResources = host;
  });
  mountFramePresentation(ctx, () => nativeResources, (key) => t(key));
  function Resources() {
    const [rows, setRows] = (0, import_react3.useState)([]);
    const [resourceRevision, refreshResources] = (0, import_react3.useState)(0);
    const [error, setError] = (0, import_react3.useState)("");
    const [selectionError, setSelectionError] = (0, import_react3.useState)(false);
    const [busy, setBusy] = (0, import_react3.useState)("");
    const pending = (0, import_react3.useRef)();
    (0, import_react3.useEffect)(() => {
      const lifetime = new AbortController();
      void fetch("/api/agent-manage/resources", { signal: lifetime.signal, cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const value = await response.json();
        lifetime.signal.throwIfAborted();
        setRows(value);
        setError("");
      }).catch((failure) => {
        if (!lifetime.signal.aborted) {
          console.error("[agent-workbench] resource list failed", failure);
          setSelectionError(false);
          setError(String(failure));
        }
      });
      return () => {
        lifetime.abort();
        pending.current?.abort();
      };
    }, [resourceRevision]);
    const choose = async (id) => {
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setBusy(id);
      setError("");
      try {
        if (!nativeResources) throw Error(t("unavailable"));
        await selectResource(nativeResources, id, controller.signal);
      } catch (failure) {
        if (!controller.signal.aborted) {
          console.error("[agent-workbench] resource selection failed", { id, error: failure instanceof Error ? failure.message : String(failure) });
          setSelectionError(true);
          setError(String(failure));
        }
      } finally {
        if (!controller.signal.aborted) setBusy("");
      }
    };
    return import_react3.default.createElement(
      "section",
      null,
      import_react3.default.createElement("h2", null, t("resources")),
      import_react3.default.createElement("button", { type: "button", disabled: Boolean(busy), onClick: () => refreshResources((value) => value + 1) }, t("resourcesRefresh")),
      error ? import_react3.default.createElement("p", { role: "alert" }, selectionError ? t("selectionFailed") : t("resourcesFailed")) : null,
      ...rows.map((row) => import_react3.default.createElement(
        "div",
        { key: row.id },
        import_react3.default.createElement("button", { type: "button", disabled: !row.enabled || Boolean(busy), onClick: () => void choose(row.id) }, row.label + " \xB7 " + (busy === row.id ? t("resourceWorking") : !row.enabled ? t("unavailable") : row.kind === "skill" ? t("useSkill") : t("start"))),
        row.missingSkills?.length ? import_react3.default.createElement("p", null, t("missing") + ": " + row.missingSkills.join(", ")) : null,
        row.error ? import_react3.default.createElement("p", { role: "alert" }, row.error) : null
      ))
    );
  }
  function Directory() {
    const [entries, setEntries] = (0, import_react3.useState)(() => ctx.slots.entries("main"));
    (0, import_react3.useEffect)(() => {
      const refresh = () => setEntries([...ctx.slots.entries("main")]);
      const offSlots = ctx.slots.subscribe("main", refresh);
      const offSidebar = ctx.slots.subscribe("sidebar.panellist", refresh);
      const offPages = workbench.subscribe(refresh);
      const offLocale = ctx.locale.subscribe(refresh);
      return () => {
        offSlots();
        offSidebar();
        offPages();
        offLocale();
      };
    }, []);
    const pages = entries.filter((entry) => entry.options.key && entry.options.key !== DIRECTORY && entry.options.key !== "conversation");
    return import_react3.default.createElement(
      "section",
      { className: "agent-workbench-ui agent-workbench-directory" },
      import_react3.default.createElement("h1", null, t("title")),
      import_react3.default.createElement("button", { type: "button", onClick: () => ctx.layout.selectPanel(null) }, t("conversation")),
      import_react3.default.createElement("h2", null, t("pages")),
      pages.length ? import_react3.default.createElement("div", { className: "agent-workbench-pages" }, ...pages.map((entry) => {
        const id = entry.options.key;
        const sidebarLabel = ctx.slots.entries("sidebar.panellist").find((sidebar) => sidebar.options.id === id)?.options.label;
        const label = typeof sidebarLabel === "function" ? sidebarLabel() : sidebarLabel ?? workbench.label(id);
        return import_react3.default.createElement("button", { key: id, type: "button", onClick: () => void workbench.open(id) }, label);
      })) : import_react3.default.createElement("p", null, t("empty")),
      import_react3.default.createElement(DiscoveryNotice),
      import_react3.default.createElement(Resources)
    );
  }
  let discoveryError = "";
  let discoveryRevision = 0;
  const listeners = /* @__PURE__ */ new Set();
  let retry = () => {
  };
  const notify = () => {
    discoveryRevision++;
    for (const listener of listeners) listener();
  };
  function DiscoveryNotice() {
    import_react3.default.useSyncExternalStore((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }, () => discoveryRevision);
    return discoveryError ? import_react3.default.createElement("p", { role: "alert" }, t("failed") + ": " + discoveryError, " ", import_react3.default.createElement("button", { onClick: () => retry() }, t("retry"))) : null;
  }
  ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: DIRECTORY }, Directory));
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: DIRECTORY, order: 5, label: () => t("title") }, ({ size }) => import_react3.default.createElement("span", { style: { fontSize: size }, "aria-hidden": true }, "\u25A6")));
  ctx.effect(() => {
    const controller = new AbortController();
    const registered = /* @__PURE__ */ new Set();
    const cleanup = [];
    let loading = false;
    const discover = async () => {
      if (loading || controller.signal.aborted) return;
      loading = true;
      try {
        const response = await fetch("/api/agent-workbench/pages", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const pages = await response.json();
        controller.signal.throwIfAborted();
        for (const page of pages) {
          if (registered.has(page.id)) continue;
          registered.add(page.id);
          ctx.slots.inject("main", () => {
            if (controller.signal.aborted) return () => {
            };
            const unregister = workbench.register({ id: page.id, label: page.name });
            const disposeSlot = ctx.slots.register({ name: "main", key: page.id }, ({ renderFactorySlot }) => renderFactorySlot("agent-workbench.document", { page: { id: page.id, label: page.name, src: page.url, kind: "html", pluginId: page.pluginId, resourceId: page.resourceId } }));
            const dispose = () => {
              disposeSlot();
              unregister();
            };
            cleanup.push(dispose);
            return dispose;
          });
        }
        discoveryError = "";
      } catch (error) {
        if (!controller.signal.aborted) discoveryError = error instanceof Error ? error.message : String(error);
      } finally {
        loading = false;
        if (!controller.signal.aborted) notify();
      }
    };
    retry = () => {
      void discover();
    };
    void discover();
    return () => {
      controller.abort();
      retry = () => {
      };
      for (const dispose of cleanup) dispose();
    };
  });
}

return module.exports;}});
