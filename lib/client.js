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
var import_react = __toESM(require("react"), 1);

// src/resource-selection.ts
async function selectResource(host, id, signal) {
  const configResponse = await host.fetch("/api/agent-workbench/config", { signal, cache: "no-store" });
  if (!configResponse.ok) throw Error("WORKBENCH_WORKSPACE_UNAVAILABLE");
  const config = await configResponse.json();
  if (typeof config.cwd !== "string" || !config.cwd.trim()) throw Error("WORKBENCH_WORKSPACE_REQUIRED");
  const response = await host.fetch("/api/agent-manage/resources/select", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }), signal });
  const resource = await response.json();
  if (!response.ok || typeof resource.preset !== "string") throw Error(resource.error ?? "RESOURCE_SELECTION_FAILED");
  signal.throwIfAborted();
  const sessionId = await host.create({ cwd: config.cwd });
  signal.throwIfAborted();
  await host.select(sessionId, resource.preset);
  signal.throwIfAborted();
  await host.open(sessionId, typeof resource.skill === "string" ? resource.skill : void 0, signal);
}
function mountNativeResourceSelection(ctx, ready) {
  let active;
  return ctx.inject(["sessions", "remote", "remote.agentPresets", "conversation", "uiWorkspace"], (scope) => {
    const host = {
      fetch: (...args) => fetch(...args),
      create: (options) => scope.sessions.create(options),
      select: async (id, preset) => {
        const result = await scope.remote.agentPresets.select(id, preset);
        if (!result.ok) throw Error(result.error.message);
      },
      open: async (id, skill, signal) => scope.sessions.using(id, { source: "agentResourceSelection", signal }, (reference) => {
        signal.throwIfAborted();
        if (skill) {
          const input = scope.conversation.input.for(reference.binding.ctx);
          const state = input.state.getSnapshot();
          if (state.draft || reference.binding.ctx.bail("slash/input-insert-text", { text: `/${skill} `, span: { start: 0, end: 0, draftRev: state.draftRev } }) !== true) throw Error("RESOURCE_DRAFT_CHANGED");
        }
        scope.uiWorkspace.openSession(id);
      })
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
  registerHtml(page) {
    if (!this.ports.html) throw Error("WORKBENCH_HTML_UNAVAILABLE");
    const unregister = this.register(page);
    let dispose;
    try {
      dispose = this.ports.html(page);
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
var tokens_default = '/* Shared workbench resource 1.0.0. State belongs to DSH ui-theme.\n * html + body specificity keeps the adapter stable when base sheets reload.\n * Inline user token overrides retain priority. Status palettes stay upstream. */\nhtml body {\n  --workbench-theme-version: "1.0.0";\n  --workbench-font-family: "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif;\n  --workbench-font-size: var(--dsh-content-font-size, 14px);\n  --workbench-page: #f7f8fa;\n  --workbench-surface: #ffffff;\n  --workbench-subtle: #fafafa;\n  --workbench-muted-surface: #f5f6f8;\n  --workbench-text: #20232a;\n  --workbench-body: #555d68;\n  --workbench-muted: #626b78;\n  --workbench-border: #e3e6ea;\n  --workbench-control-border: #d9dde3;\n  --workbench-brand: #df1732;\n  --workbench-selected-text: #d0132c;\n  --workbench-brand-hover: #c91029;\n  --workbench-brand-soft: #fff0f2;\n  --workbench-hover: #fffafb;\n}\n\nhtml body[data-ds-dark-theme] {\n  --workbench-page: #1b1d21;\n  --workbench-surface: #24262b;\n  --workbench-subtle: #282b31;\n  --workbench-muted-surface: #30343b;\n  --workbench-text: #edf0f5;\n  --workbench-body: #c7cdd6;\n  --workbench-muted: #aab3bf;\n  --workbench-border: #414751;\n  --workbench-control-border: #59616e;\n  --workbench-brand: #ff8092;\n  --workbench-selected-text: #ff9aa8;\n  --workbench-brand-hover: #ff9aa8;\n  --workbench-brand-soft: #442630;\n  --workbench-hover: #35272e;\n}\n\n.agent-workbench-ui {\n  background: var(--workbench-page);\n  color: var(--workbench-text);\n  font: var(--workbench-font-size)/1.5 var(--workbench-font-family);\n}\n.agent-workbench-directory { height: 100%; overflow: auto; box-sizing: border-box; padding: 24px; }\n.agent-workbench-pages { display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: 12px; }\n.agent-workbench-ui button { padding: 10px 14px; border: 1px solid var(--workbench-border); border-radius: 8px; background: var(--workbench-surface); color: var(--workbench-text); font: inherit; cursor: pointer; }\n.agent-workbench-ui button:not(:disabled):hover { background: var(--workbench-hover); border-color: var(--workbench-brand); }\n.agent-workbench-ui button:focus-visible { outline: 2px solid var(--workbench-brand); outline-offset: 2px; }\n.agent-workbench-html { height: 100%; width: 100%; border: 0; display: block; }\n\n.agent-workbench-ui button[aria-current="page"] { color: var(--workbench-selected-text); background: var(--workbench-brand-soft); border-color: var(--workbench-brand); }\n.agent-workbench-ui button:disabled { color: var(--workbench-muted); background: var(--workbench-muted-surface); cursor: default; }\n';

// src/html-document.ts
function presentHtml(html, css) {
  const bridge = `<style data-workbench-theme>${css}</style><script>window.addEventListener('message',function(event){if(event.source!==parent||event.data?.protocol!=='agent-workbench-theme')return;const value=event.data;if(document.body)document.body.toggleAttribute('data-ds-dark-theme',value.dark===true);if(Number.isFinite(value.fontSize))document.documentElement.style.setProperty('--dsh-content-font-size',String(value.fontSize)+'px');});document.addEventListener('DOMContentLoaded',function(){parent.postMessage({protocol:'agent-workbench-theme',type:'ready'},'*');});<\/script>`;
  return html.includes("</head>") ? html.replace("</head>", bridge + "</head>") : bridge + html;
}

// src/client.ts
var inject = ["slots", "layout", "locale", "theme"];
var DIRECTORY = "agent-workbench";
var zh = { title: "\u5DE5\u4F5C\u53F0", pages: "\u5DF2\u63A5\u5165\u9875\u9762", conversation: "\u539F\u751F\u5BF9\u8BDD", failed: "\u9875\u9762\u76EE\u5F55\u8BFB\u53D6\u5931\u8D25", retry: "\u91CD\u8BD5", empty: "\u6682\u65E0\u5DF2\u63A5\u5165\u9875\u9762", resources: "\u63D0\u793A\u8BCD\u4E0E Skill", start: "\u5F00\u59CB\u65B0\u804A\u5929", useSkill: "\u5728\u65B0\u804A\u5929\u4E2D\u4F7F\u7528", unavailable: "\u4E0D\u53EF\u9009\u7528", missing: "\u5F53\u524D\u4E0D\u53EF\u7528 Skill", resourcesFailed: "\u8D44\u6E90\u6E05\u5355\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u3002", selectionFailed: "\u8D44\u6E90\u9009\u7528\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002", resourceWorking: "\u6B63\u5728\u88C5\u8F7D", resourcesRefresh: "\u5237\u65B0\u8D44\u6E90" };
var en = { title: "Workbench", pages: "Available pages", conversation: "Conversation", failed: "Page directory unavailable", retry: "Retry", empty: "No pages available", resources: "Prompts and Skills", start: "Start a new chat", useSkill: "Use in a new chat", unavailable: "Unavailable", missing: "Unavailable Skills", resourcesFailed: "Resource list unavailable. Please refresh.", selectionFailed: "Unable to select this resource. Please retry.", resourceWorking: "Loading", resourcesRefresh: "Refresh resources" };
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
    html: (page) => ctx.slots.register({ name: "main", key: page.id }, () => import_react.default.createElement(HtmlFrame, { page: { id: page.id, name: typeof page.label === "function" ? page.label() : page.label ?? page.id, pluginId: page.id, order: 20, view: "", url: "" }, html: presentHtml(page.html, tokens_default) }))
  });
  ctx.provide("agentWorkbench", workbench);
  ctx.effect(() => () => workbench.dispose());
  let nativeResources;
  mountNativeResourceSelection(ctx, (host) => {
    nativeResources = host;
  });
  function Resources() {
    const [rows, setRows] = (0, import_react.useState)([]);
    const [resourceRevision, refreshResources] = (0, import_react.useState)(0);
    const [error, setError] = (0, import_react.useState)("");
    const [selectionError, setSelectionError] = (0, import_react.useState)(false);
    const [busy, setBusy] = (0, import_react.useState)("");
    const pending = (0, import_react.useRef)();
    (0, import_react.useEffect)(() => {
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
    return import_react.default.createElement(
      "section",
      null,
      import_react.default.createElement("h2", null, t("resources")),
      import_react.default.createElement("button", { type: "button", disabled: Boolean(busy), onClick: () => refreshResources((value) => value + 1) }, t("resourcesRefresh")),
      error ? import_react.default.createElement("p", { role: "alert" }, selectionError ? t("selectionFailed") : t("resourcesFailed")) : null,
      ...rows.map((row) => import_react.default.createElement(
        "div",
        { key: row.id },
        import_react.default.createElement("button", { type: "button", disabled: !row.enabled || Boolean(busy), onClick: () => void choose(row.id) }, row.label + " \xB7 " + (busy === row.id ? t("resourceWorking") : !row.enabled ? t("unavailable") : row.kind === "skill" ? t("useSkill") : t("start"))),
        row.missingSkills?.length ? import_react.default.createElement("p", null, t("missing") + ": " + row.missingSkills.join(", ")) : null,
        row.error ? import_react.default.createElement("p", { role: "alert" }, row.error) : null
      ))
    );
  }
  function Directory() {
    const [entries, setEntries] = (0, import_react.useState)(() => ctx.slots.entries("main"));
    (0, import_react.useEffect)(() => {
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
    return import_react.default.createElement(
      "section",
      { className: "agent-workbench-ui agent-workbench-directory" },
      import_react.default.createElement("h1", null, t("title")),
      import_react.default.createElement("button", { type: "button", onClick: () => ctx.layout.selectPanel(null) }, t("conversation")),
      import_react.default.createElement("h2", null, t("pages")),
      pages.length ? import_react.default.createElement("div", { className: "agent-workbench-pages" }, ...pages.map((entry) => {
        const id = entry.options.key;
        const sidebarLabel = ctx.slots.entries("sidebar.panellist").find((sidebar) => sidebar.options.id === id)?.options.label;
        const label = typeof sidebarLabel === "function" ? sidebarLabel() : sidebarLabel ?? workbench.label(id);
        return import_react.default.createElement("button", { key: id, type: "button", onClick: () => void workbench.open(id) }, label);
      })) : import_react.default.createElement("p", null, t("empty")),
      import_react.default.createElement(DiscoveryNotice),
      import_react.default.createElement(Resources)
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
    import_react.default.useSyncExternalStore((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }, () => discoveryRevision);
    return discoveryError ? import_react.default.createElement("p", { role: "alert" }, t("failed") + ": " + discoveryError, " ", import_react.default.createElement("button", { onClick: () => retry() }, t("retry"))) : null;
  }
  function HtmlFrame({ page, html }) {
    const frame = (0, import_react.useRef)(null);
    (0, import_react.useEffect)(() => {
      const theme = () => {
        const snapshot = ctx.theme.getTheme();
        frame.current?.contentWindow?.postMessage({ protocol: "agent-workbench-theme", dark: snapshot.active.colorScheme === "dark", fontSize: snapshot.fontSize }, "*");
      };
      const ready = (event) => {
        if (event.source === frame.current?.contentWindow && event.data?.protocol === "agent-workbench-theme") theme();
      };
      window.addEventListener("message", ready);
      const stop = ctx.on("theme/change", theme);
      return () => {
        window.removeEventListener("message", ready);
        stop();
      };
    }, [page.id]);
    return import_react.default.createElement("iframe", { ref: frame, title: page.name, ...html === void 0 ? { src: page.url } : { srcDoc: html }, sandbox: "allow-scripts allow-downloads", className: "agent-workbench-html", onLoad: () => {
      const snapshot = ctx.theme.getTheme();
      frame.current?.contentWindow?.postMessage({ protocol: "agent-workbench-theme", dark: snapshot.active.colorScheme === "dark", fontSize: snapshot.fontSize }, "*");
    } });
  }
  ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: DIRECTORY }, Directory));
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: DIRECTORY, order: 5, label: () => t("title") }, ({ size }) => import_react.default.createElement("span", { style: { fontSize: size }, "aria-hidden": true }, "\u25A6")));
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
            const disposeSlot = ctx.slots.register({ name: "main", key: page.id }, () => import_react.default.createElement(HtmlFrame, { page }));
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
