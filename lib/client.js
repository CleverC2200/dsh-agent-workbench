window.__ModuleLoader__.load({id:"@cleverc2200/dsh-agent-workbench",factory:(require)=>{var module={exports:{}};var exports=module.exports;const style=document.createElement("style");style.textContent="/* src/AppFrame.module.css */\n.AppFrame_frame {\n  position: relative;\n  display: grid;\n  grid-template-rows: 100%;\n  height: 100%;\n  overflow: hidden;\n  background: var(--dsw-alias-bg-base);\n  color: var(--dsw-alias-label-primary);\n  font-family: var(--workbench-font-family, var(--dsw-font-family));\n  font-size: var(--workbench-font-size, var(--dsh-content-font-size, 14px));\n  transition: grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out);\n}\n.AppFrame_frame[data-dragging] {\n  transition: none;\n}\n@media (prefers-reduced-motion: reduce) {\n  .AppFrame_frame {\n    transition: none;\n  }\n}\n.AppFrame_sidebarCol {\n  min-width: 0;\n  overflow: hidden;\n  background: var(--dsw-specific-sidebar-fill);\n  border-right: 0.5px solid var(--dsw-alias-border-l3);\n}\n.AppFrame_centerCol {\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;\n}\n.AppFrame_handle {\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  width: 8px;\n  margin-left: -4px;\n  cursor: col-resize;\n  z-index: 11;\n  touch-action: none;\n  transition: left var(--ds-transition-duration-slow) var(--ds-ease-in-out);\n}\n.AppFrame_frame[data-dragging] .AppFrame_handle {\n  transition: none;\n}\n.AppFrame_frame[data-rightbar-fullscreen],\n.AppFrame_frame[data-rightbar-fullscreen] .AppFrame_handle,\n.AppFrame_frame[data-rightbar-instant],\n.AppFrame_frame[data-rightbar-instant] .AppFrame_handle,\n.AppFrame_frame[data-conversation-stacked],\n.AppFrame_frame[data-conversation-stacked] .AppFrame_handle {\n  transition: none;\n}\n@media (prefers-reduced-motion: reduce) {\n  .AppFrame_handle {\n    transition: none;\n  }\n}\n.AppFrame_rightbarCol {\n  position: relative;\n  min-width: 0;\n  overflow: visible;\n}\n.AppFrame_frame[data-conversation-beside-panel] .AppFrame_rightbarCol {\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n  overflow: hidden;\n  border-left: 0.5px solid var(--dsw-alias-border-l3);\n}\n.AppFrame_frame[data-conversation-stacked] {\n  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);\n}\n.AppFrame_frame[data-conversation-stacked] .AppFrame_sidebarCol {\n  grid-row: 1 / -1;\n}\n.AppFrame_frame[data-conversation-stacked] .AppFrame_centerCol {\n  grid-column: 2;\n  grid-row: 1;\n  min-height: 0;\n}\n.AppFrame_frame[data-conversation-stacked] .AppFrame_rightbarCol {\n  grid-column: 2;\n  grid-row: 2;\n  border-left: 0;\n  border-top: 0.5px solid var(--dsw-alias-border-l3);\n}\n.AppFrame_overlayLayer {\n  position: absolute;\n  inset: 0;\n  z-index: 20;\n  pointer-events: none;\n}\n.AppFrame_overlayLayer > * {\n  pointer-events: auto;\n}\n";document.head.append(style);
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);

// src/workbench.ts
var WorkbenchController = class {
  /**
   * 中文：创建控制器并从浏览器存储恢复“页面—实例—Session”关联。
   * 恢复时只接受结构和 SessionId 格式都合法的数据，避免损坏的本地缓存影响真实 Session。
   */
  constructor(ports) {
    this.ports = ports;
    try {
      const active = ports.storage?.getItem("agent-workbench:active-panel");
      if (active && active.length <= 120) this.restorePanel = active;
      const raw = ports.storage?.getItem("agent-workbench:v1");
      if (!raw) return;
      const stored = JSON.parse(raw);
      if (!Array.isArray(stored)) return;
      for (const row of stored) {
        if (!Array.isArray(row) || row.length !== 3 && row.length !== 4 || typeof row[0] !== "string" || typeof row[1] !== "string" || !Array.isArray(row[2]))
          continue;
        const bindings = /* @__PURE__ */ new Map();
        for (const pair of row[2]) {
          if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && typeof pair[1] === "string" && /^session-[0-9a-f-]{36}$/.test(pair[1]))
            bindings.set(pair[0], pair[1]);
        }
        this.sessions.set(row[0], bindings);
        this.instances.set(row[0], row[1]);
        if (typeof row[3] === "string") this.scopes.set(row[0], row[3]);
      }
    } catch {
    }
  }
  /** 中文：当前仍有效的页面定义；页面卸载后会移除。 */
  pages = /* @__PURE__ */ new Map();
  /** 中文：pageId -> instance -> SessionId 的本地关联表。 */
  sessions = /* @__PURE__ */ new Map();
  /** 中文：记录每个页面最后一次选中的实例，用于再次进入页面时恢复。 */
  instances = /* @__PURE__ */ new Map();
  scopes = /* @__PURE__ */ new Map();
  verifiedScopes = /* @__PURE__ */ new Set();
  restorePanel;
  bootPanel;
  restoringPanel = false;
  restoredPanel = false;
  /** 中文：尚未完成的 Session 创建任务，用于合并同页面同实例的重复打开。 */
  pending = /* @__PURE__ */ new Map();
  /** 中文：控制器是否已销毁；销毁后不再接受页面或导航结果。 */
  disposed = false;
  openIntent = 0;
  /** 中文：把当前关联表和每页选中实例写入浏览器存储；存储失败不影响本次内存态业务。 */
  save() {
    try {
      this.ports.storage?.setItem(
        "agent-workbench:v1",
        JSON.stringify(
          [...this.sessions].map(([id, bindings]) => [
            id,
            this.instances.get(id) ?? "default",
            [...bindings],
            this.scopes.get(id) ?? null
          ])
        )
      );
    } catch {
    }
  }
  /** Register after the page's main slot; unmount keeps durable associations for reload. */
  register(page) {
    if (this.disposed) throw new Error("Workbench disposed");
    if (this.pages.has(page.id))
      throw new Error(`Duplicate workbench page: ${page.id}`);
    const owned = { ...page, allowedPresets: page.allowedPresets ? [...page.allowedPresets] : void 0 };
    this.pages.set(page.id, owned);
    return () => {
      if (this.pages.get(page.id) !== owned) return;
      this.pending.delete(owned);
      this.pages.delete(page.id);
      this.verifiedScopes.delete(page.id);
    };
  }
  permitsPreset(page, session) {
    const actual = this.ports.presetOf?.(session);
    return actual !== void 0 && (actual === page.preset || page.allowedPresets?.includes(actual) === true);
  }
  /** Called by the layout on every panel selection, including native navigation. 中文：布局每次切换主面板时调用；若目标是已登记工作台页面，则恢复该页当前实例对应且仍存在的 Session。 */
  selectPanel(id) {
    this.openIntent++;
    if (this.restorePanel && id !== this.bootPanel) this.restorePanel = void 0;
    if (!this.restorePanel) {
      try {
        this.ports.storage?.setItem("agent-workbench:active-panel", id ?? "");
      } catch {
      }
    }
    if (id === null) return;
    const page = this.pages.get(id);
    if (!page) return;
    if (this.restoringPanel) return;
    const session = this.sessions.get(id)?.get(this.instances.get(id) ?? "default");
    this.ports.select(
      (page.scope === void 0 || this.verifiedScopes.has(id)) && session !== void 0 && this.ports.available(session) && (page.allowedPresets === void 0 || this.permitsPreset(page, session)) ? session : void 0
    );
  }
  /** Startup defaults may render immediately; a saved page wins once its slot is registered. */
  selectDefault(id) {
    this.bootPanel = id;
    if (!this.restoredPanel) this.ports.panel(id);
  }
  restoreRegistered(ids) {
    const id = this.restorePanel;
    if (!id || !this.pages.has(id) || !ids.includes(id)) return;
    this.restorePanel = void 0;
    this.restoredPanel = true;
    this.restoringPanel = true;
    try {
      this.ports.panel(id);
    } finally {
      this.restoringPanel = false;
    }
  }
  /**
   * Create/reuse an instance Session, or explicitly associate a host-created Session.
   * 中文：打开一个“页面 + 实例”。优先采用显式 sessionId，其次复用已绑定 Session，最后按页面预设新建；
   * 同一实例的并发创建会共用一个任务。只有页面仍存活、关联表未被替换且本次导航未过期时，
   * 才会准备 Session、保存关联并切到目标面板，避免慢请求把用户带回旧页面。
   * 返回 false 表示导航已被后续动作取消，调用方不得把它当作页面已打开。
   */
  async open(id, instance, sessionId, preset) {
    const intent = ++this.openIntent;
    const opened = await this.openOnce(id, instance, sessionId, preset);
    if (opened || this.openIntent !== intent || this.ports.currentPanel?.() !== id || !this.pages.has(id) || this.disposed)
      return opened;
    return this.openOnce(id, instance, sessionId, preset);
  }
  async openOnce(id, instance, sessionId, preset) {
    const page = this.pages.get(id);
    if (!page || this.disposed)
      throw new Error(`Unknown workbench page: ${id}`);
    const selectedPreset = preset ?? page.preset;
    if (selectedPreset !== page.preset && !page.allowedPresets?.includes(selectedPreset))
      throw new Error(`Preset not allowed for workbench page: ${selectedPreset}`);
    const navigation = this.ports.beginNavigation();
    const alive = () => !this.disposed && this.pages.get(id) === page;
    let scope;
    if (page.scope) {
      scope = await page.scope();
      if (!alive() || navigation.aborted) return false;
      if (!scope) throw new Error("Workbench identity unavailable");
      if (this.scopes.get(id) !== scope) {
        this.sessions.delete(id);
        this.instances.delete(id);
        this.pending.delete(page);
        this.scopes.set(id, scope);
        this.save();
      }
      this.verifiedScopes.add(id);
    }
    instance ??= this.instances.get(id) ?? "default";
    let bindings = this.sessions.get(id);
    if (!bindings) this.sessions.set(id, bindings = /* @__PURE__ */ new Map());
    const ownedBindings = bindings;
    if (sessionId !== void 0) this.pending.get(page)?.delete(instance);
    let selected = sessionId ?? bindings.get(instance);
    if (!selected) {
      let flights = this.pending.get(page);
      if (!flights) this.pending.set(page, flights = /* @__PURE__ */ new Map());
      let flight = flights.get(instance);
      if (!flight) {
        flight = this.ports.create(selectedPreset).finally(() => {
          if (flights.get(instance) === flight) flights.delete(instance);
        });
        flights.set(instance, flight);
      }
      selected = await flight;
    }
    if (!alive() || this.sessions.get(id) !== ownedBindings || navigation.aborted)
      return false;
    await this.ports.prepare(selected);
    if (!alive() || this.sessions.get(id) !== ownedBindings || navigation.aborted) return false;
    if (page.allowedPresets !== void 0 && !this.permitsPreset(page, selected))
      throw new Error("Session preset is not allowed for this workbench page");
    if (preset !== void 0 && this.ports.presetOf?.(selected) !== selectedPreset)
      throw new Error(`Session preset differs from requested page ability: ${selectedPreset}`);
    if (page.scope && await page.scope() !== scope) {
      if (this.scopes.get(id) === scope) this.forget(id);
      throw new Error("Workbench identity changed while opening page");
    }
    if (!alive() || this.sessions.get(id) !== ownedBindings || navigation.aborted)
      return false;
    bindings.set(instance, selected);
    this.instances.set(id, instance);
    this.save();
    this.ports.panel(id);
    return true;
  }
  /** Opt a mounted page into the native conversation column. 中文：让已登记页面选择展示原生 Conversation 列，并把宿主清理函数原样返回。 */
  showConversation(id) {
    if (!this.pages.has(id)) throw new Error(`Unknown workbench page: ${id}`);
    return this.ports.showConversation(id);
  }
  /** Drop local associations, without deleting or stopping durable Sessions. 中文：只删除页面的本地映射、当前实例和待建任务，不删除也不停止宿主持久 Session。 */
  forget(id) {
    this.sessions.delete(id);
    this.instances.delete(id);
    this.scopes.delete(id);
    this.verifiedScopes.delete(id);
    const page = this.pages.get(id);
    if (page) this.pending.delete(page);
    this.save();
  }
  /** Invalidate pending navigation without cancelling host-owned Agent work. 中文：销毁控制器并使未完成导航的结果失效；宿主拥有的 Agent 任务仍继续运行。 */
  dispose() {
    this.disposed = true;
    this.pages.clear();
    this.sessions.clear();
    this.instances.clear();
    this.scopes.clear();
    this.verifiedScopes.clear();
    this.pending.clear();
  }
};

// src/AppFrame.tsx
var import_react2 = require("react");

// src/columns.ts
var CENTER_MIN = 400;
var SIDEBAR_MIN = 264;
var SIDEBAR_MAX = 420;
var SIDEBAR_DEFAULT = 280;
var SIDEBAR_COLLAPSED = 56;
var SIDEBAR_AUTO_COLLAPSE = 1024;
var RIGHTBAR_MIN = 300;
var RIGHTBAR_MAX_RATIO = 0.7;
var RIGHTBAR_DEFAULT_RATIO = 0.45;
var CONVERSATION_DEFAULT_WIDTH = 440;
function clampWidth(px, min, max) {
  return Math.min(max, Math.max(min, Math.round(px)));
}
function computeColumns(viewport, sidebar, rightbar) {
  const s = sidebar === 0 ? SIDEBAR_COLLAPSED : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX);
  const available = viewport - s - CENTER_MIN;
  const r = rightbar === 0 || available < RIGHTBAR_MIN ? 0 : Math.min(
    available,
    clampWidth(rightbar, RIGHTBAR_MIN, viewport * RIGHTBAR_MAX_RATIO)
  );
  return { sidebar: s, center: Math.max(0, viewport - s - r), rightbar: r };
}

// src/DocumentTitle.tsx
var import_react = require("react");
function DocumentTitle({
  useSessions,
  useMainSessionId,
  usePanelInfo,
  productTitle
}) {
  const showSessionTitle = usePanelInfo((info) => info.activePanelId === null);
  const current = useMainSessionId((id) => id);
  const title = useSessions((state) => {
    return !showSessionTitle || current === void 0 ? void 0 : state.byId[current]?.title;
  });
  (0, import_react.useEffect)(() => {
    document.title = title === void 0 ? productTitle : `${title} \u2014 ${productTitle}`;
    return () => {
      document.title = productTitle;
    };
  }, [productTitle, title]);
  return null;
}

// src/AppFrame.module.css
var AppFrame_default = {
  frame: "AppFrame_frame",
  sidebarCol: "AppFrame_sidebarCol",
  centerCol: "AppFrame_centerCol",
  handle: "AppFrame_handle",
  rightbarCol: "AppFrame_rightbarCol",
  overlayLayer: "AppFrame_overlayLayer"
};

// src/AppFrame.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function CenterColumn(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: AppFrame_default.centerCol, children: props.children });
}
function MainPanel({
  usePanelInfo,
  renderSlot
}) {
  const panelId = usePanelInfo((info) => info.activePanelId);
  return renderSlot("main", {}, { entryKey: panelId ?? "conversation" });
}
function RightbarColumn(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: AppFrame_default.rightbarCol, "data-rightbar-col": true, children: props.children });
}
function DragHandle(props) {
  const [dragging, setDragging] = (0, import_react2.useState)(false);
  const origin = (0, import_react2.useRef)(0);
  const latest = (0, import_react2.useRef)(0);
  const frame = (0, import_react2.useRef)(null);
  const capture = (0, import_react2.useRef)(null);
  const callbacks = (0, import_react2.useRef)({
    onStart: props.onStart,
    onDrag: props.onDrag,
    onEnd: props.onEnd
  });
  callbacks.current = {
    onStart: props.onStart,
    onDrag: props.onDrag,
    onEnd: props.onEnd
  };
  const endDrag = (0, import_react2.useCallback)(() => {
    const active = capture.current;
    if (active === null) return;
    capture.current = null;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    if (active.element.hasPointerCapture(active.id))
      active.element.releasePointerCapture(active.id);
    setDragging(false);
    callbacks.current.onEnd();
  }, []);
  (0, import_react2.useEffect)(() => endDrag, [endDrag]);
  const onPointerDown = (0, import_react2.useCallback)((e) => {
    if (e.button !== 0 || capture.current !== null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    capture.current = { element: e.currentTarget, id: e.pointerId };
    origin.current = e.clientX;
    latest.current = e.clientX;
    callbacks.current.onStart();
    setDragging(true);
  }, []);
  const onPointerMove = (0, import_react2.useCallback)((e) => {
    if (capture.current?.id !== e.pointerId) return;
    latest.current = e.clientX;
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null;
      callbacks.current.onDrag(latest.current - origin.current);
    });
  }, []);
  const onPointerUp = (0, import_react2.useCallback)(
    (e) => {
      if (capture.current?.id !== e.pointerId) return;
      callbacks.current.onDrag(e.clientX - origin.current);
      endDrag();
    },
    [endDrag]
  );
  const onPointerCancel = (0, import_react2.useCallback)(
    (e) => {
      if (capture.current?.id === e.pointerId) endDrag();
    },
    [endDrag]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "div",
    {
      className: AppFrame_default.handle,
      style: { left: props.left },
      "data-side": props.side,
      "data-dragging": dragging || void 0,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture: onPointerCancel
    }
  );
}
function AppFrame({
  useStore,
  useSessions,
  useMainSessionId,
  usePanelInfo,
  actions,
  renderSlot,
  t
}) {
  const conversationBesidePanel = useStore(
    (state) => state.panelInfo.activePanelId !== null && state.conversationPanelIds.includes(state.panelInfo.activePanelId)
  );
  const layoutInfo = useStore((state) => state.layoutInfo);
  const frameRef = (0, import_react2.useRef)(null);
  const viewport = layoutInfo.viewportWidth;
  (0, import_react2.useLayoutEffect)(() => {
    const el = frameRef.current;
    if (el === null) return;
    let raf = null;
    let disposed = false;
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      if (width > 0) actions.setViewportWidth(width);
    };
    measure();
    const observer = new ResizeObserver(() => {
      if (disposed) return;
      raf ??= requestAnimationFrame(() => {
        raf = null;
        measure();
      });
    });
    observer.observe(el);
    return () => {
      disposed = true;
      observer.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [actions]);
  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE;
  const sidebarCollapsed = narrow ? !layoutInfo.narrowExpanded : layoutInfo.sidebar === 0;
  const sidebarPreference = sidebarCollapsed ? 0 : layoutInfo.sidebar === 0 ? SIDEBAR_DEFAULT : layoutInfo.sidebar;
  const rightbarPreference = layoutInfo.rightbar ?? viewport * RIGHTBAR_DEFAULT_RATIO;
  const normal = computeColumns(
    viewport,
    !layoutInfo.rightbarShown && narrow ? 0 : sidebarPreference,
    rightbarPreference
  );
  const cols = computeColumns(
    viewport,
    sidebarPreference,
    conversationBesidePanel ? layoutInfo.conversationWidth ?? CONVERSATION_DEFAULT_WIDTH : layoutInfo.rightbarTrack ? rightbarPreference : 0
  );
  const conversationStacked = conversationBesidePanel && cols.rightbar === 0;
  const rightbarShown = conversationBesidePanel || layoutInfo.rightbarShown;
  const rightbarFullscreen = !conversationBesidePanel && layoutInfo.rightbarFullscreen;
  const resizeWidth = conversationBesidePanel ? cols.rightbar : normal.rightbar;
  const colsRef = (0, import_react2.useRef)(cols);
  colsRef.current = cols;
  const rightbarWidth = (0, import_react2.useRef)(resizeWidth);
  rightbarWidth.current = resizeWidth;
  const sidebarBase = (0, import_react2.useRef)(0);
  const rightbarBase = (0, import_react2.useRef)(0);
  const [dragging, setDragging] = (0, import_react2.useState)(false);
  const onDragEnd = (0, import_react2.useCallback)(() => {
    setDragging(false);
  }, []);
  const onSidebarStart = (0, import_react2.useCallback)(() => {
    sidebarBase.current = colsRef.current.sidebar;
    setDragging(true);
  }, []);
  const onSidebarDrag = (0, import_react2.useCallback)(
    (dx) => {
      actions.setSidebar(sidebarBase.current + dx);
    },
    [actions]
  );
  const onRightbarStart = (0, import_react2.useCallback)(() => {
    rightbarBase.current = rightbarWidth.current;
    setDragging(true);
  }, []);
  const onRightbarDrag = (0, import_react2.useCallback)(
    (dx) => {
      const width = rightbarBase.current - dx;
      if (conversationBesidePanel) actions.setConversationWidth(width);
      else actions.setRightbar(width);
    },
    [actions, conversationBesidePanel]
  );
  const productTitle = t("brand.localBuild");
  const sidebar = (0, import_react2.useMemo)(
    () => renderSlot("sidebar", {
      collapsed: sidebarCollapsed,
      width: cols.sidebar
    }),
    [renderSlot, sidebarCollapsed, cols.sidebar]
  );
  const main = (0, import_react2.useMemo)(
    () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MainPanel, { usePanelInfo, renderSlot }),
    [usePanelInfo, renderSlot]
  );
  const overlays = (0, import_react2.useMemo)(() => renderSlot("shell.overlay", {}), [renderSlot]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      ref: frameRef,
      className: AppFrame_default.frame,
      style: {
        gridTemplateColumns: `${cols.sidebar}px minmax(0, 1fr) ${cols.rightbar}px`
      },
      "data-sidebar-collapsed": sidebarCollapsed || void 0,
      "data-rightbar-collapsed": cols.rightbar === 0 || void 0,
      "data-rightbar-fullscreen": rightbarFullscreen || void 0,
      "data-rightbar-instant": !conversationBesidePanel && layoutInfo.rightbarInstant || void 0,
      "data-conversation-beside-panel": conversationBesidePanel || void 0,
      "data-conversation-stacked": conversationStacked || void 0,
      "data-dragging": dragging || void 0,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          DocumentTitle,
          {
            productTitle,
            useSessions,
            useMainSessionId,
            usePanelInfo
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: AppFrame_default.sidebarCol, children: sidebar }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CenterColumn, { children: main }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RightbarColumn, { children: conversationBesidePanel ? renderSlot("main", {}, { entryKey: "conversation" }) : renderSlot("rightbar", {
            width: normal.rightbar,
            viewportWidth: viewport,
            canShow: normal.rightbar > 0
          }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: AppFrame_default.overlayLayer, "data-shell-overlay": true, children: overlays }),
        !sidebarCollapsed && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          DragHandle,
          {
            side: "sidebar",
            left: cols.sidebar,
            onStart: onSidebarStart,
            onDrag: onSidebarDrag,
            onEnd: onDragEnd
          }
        ),
        rightbarShown && !rightbarFullscreen && resizeWidth > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          DragHandle,
          {
            side: "rightbar",
            left: viewport - resizeWidth,
            onStart: onRightbarStart,
            onDrag: onRightbarDrag,
            onEnd: onDragEnd
          }
        )
      ]
    }
  );
}

// src/stores.ts
var import_dsh_client_store = require("@deepseek-ai/dsh-client-store");
function createLayoutStore() {
  const handle = (0, import_dsh_client_store.defineStore)({
    init: () => ({
      conversationPanelIds: [],
      panelInfo: { activePanelId: null },
      layoutInfo: {
        conversationWidth: null,
        sidebar: SIDEBAR_DEFAULT,
        viewportWidth: window.innerWidth,
        narrowExpanded: false,
        rightbar: null,
        rightbarShown: false,
        rightbarTrack: false,
        rightbarFullscreen: false,
        rightbarInstant: false
      }
    }),
    actions: {
      setConversationPanels: (d, panelIds) => {
        d.conversationPanelIds = [...panelIds];
      },
      setConversationWidth: (d, px) => {
        d.layoutInfo.conversationWidth = clampWidth(
          px,
          RIGHTBAR_MIN,
          Math.max(
            RIGHTBAR_MIN,
            d.layoutInfo.viewportWidth * RIGHTBAR_MAX_RATIO
          )
        );
      },
      selectPanel: (d, panelId) => {
        d.panelInfo.activePanelId = panelId;
      },
      retainMainPanels: (d, panelIds) => {
        if (d.panelInfo.activePanelId !== null && !panelIds.includes(d.panelInfo.activePanelId)) {
          d.panelInfo.activePanelId = null;
        }
      },
      setSidebar: (d, px) => {
        d.layoutInfo.rightbarInstant = false;
        d.layoutInfo.sidebar = clampWidth(px, SIDEBAR_MIN, SIDEBAR_MAX);
      },
      // Narrow toggles flip only the override: the width preference survives
      // untouched, so re-widening restores the pre-squeeze layout.
      // 窄屏切换只翻转临时覆盖值，不改宽度偏好；恢复宽屏后回到收缩前布局。
      toggleSidebar: (d) => {
        d.layoutInfo.rightbarInstant = false;
        if (d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE)
          d.layoutInfo.narrowExpanded = !d.layoutInfo.narrowExpanded;
        else
          d.layoutInfo.sidebar = d.layoutInfo.sidebar === 0 ? SIDEBAR_DEFAULT : 0;
      },
      // Crossing the breakpoint in either direction drops the override: the
      // narrow default is auto-collapsed, the wide state is the preference.
      // 跨过断点时清除临时覆盖：窄屏回到自动收缩，宽屏直接使用已保存偏好。
      setViewportWidth: (d, width) => {
        if (d.layoutInfo.viewportWidth === width) return;
        d.layoutInfo.rightbarInstant = false;
        if (d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE !== width < SIDEBAR_AUTO_COLLAPSE) {
          d.layoutInfo.narrowExpanded = false;
        }
        d.layoutInfo.viewportWidth = width;
      },
      setRightbar: (d, px) => {
        d.layoutInfo.rightbarInstant = false;
        d.layoutInfo.rightbar = clampWidth(
          px,
          RIGHTBAR_MIN,
          Math.max(
            RIGHTBAR_MIN,
            d.layoutInfo.viewportWidth * RIGHTBAR_MAX_RATIO
          )
        );
      },
      openRightbar: (d, track, fullscreen) => {
        if (!d.layoutInfo.rightbarShown || d.layoutInfo.rightbarTrack !== track || d.layoutInfo.rightbarFullscreen !== fullscreen) {
          d.layoutInfo.rightbarInstant = d.layoutInfo.rightbarFullscreen && !fullscreen;
        }
        if (!d.layoutInfo.rightbarShown && d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE)
          d.layoutInfo.narrowExpanded = false;
        d.layoutInfo.rightbar ??= Math.max(
          RIGHTBAR_MIN,
          Math.round(d.layoutInfo.viewportWidth * RIGHTBAR_DEFAULT_RATIO)
        );
        d.layoutInfo.rightbarShown = true;
        d.layoutInfo.rightbarTrack = track;
        d.layoutInfo.rightbarFullscreen = fullscreen;
      },
      closeRightbar: (d) => {
        if (d.layoutInfo.rightbarShown)
          d.layoutInfo.rightbarInstant = d.layoutInfo.rightbarFullscreen;
        d.layoutInfo.rightbarShown = false;
        d.layoutInfo.rightbarTrack = false;
        d.layoutInfo.rightbarFullscreen = false;
      }
    }
  });
  return handle;
}

// src/service.ts
var LayoutController = class {
  /**
   * @param panels - actions of the instance shared with the root entry.
   * @param hasMainPanel - checks the live main-slot registry for a panel id.
   * 中文：接收 root 入口共享的 store 动作，以及用于校验面板是否仍在实时 main 插槽中的检查器。
   */
  constructor(panels, hasMainPanel, panelInfo) {
    this.panels = panels;
    this.hasMainPanel = hasMainPanel;
    this.panelInfo = panelInfo;
  }
  navigation = new AbortController();
  /** 面板选择成功校验后的通知回调；客户端用它同步对应的工作台 Session。 */
  onSelect;
  conversationPanels = /* @__PURE__ */ new Map();
  /** Select a global panel or return to the Conversation. */
  /** 选择已注册全局面板，或传 null 返回 Conversation；未注册 ID 会抛错且不改选择。 */
  selectPanel(panelId) {
    if (panelId !== null && !this.hasMainPanel(panelId)) {
      throw new Error(
        `layout.selectPanel: main panel "${panelId}" is not registered`
      );
    }
    this.navigation.abort();
    this.onSelect?.(panelId);
    this.panels.selectPanel(panelId);
  }
  /** 登记一个并排 Conversation 占用者，并返回可重复调用安全的撤销函数。 */
  registerConversationPanel(panelId) {
    if (panelId === "conversation" || !this.hasMainPanel(panelId)) {
      throw new Error(
        `layout.registerConversationPanel: main panel "${panelId}" must be a registered global panel`
      );
    }
    const registrations = this.conversationPanels.get(panelId) ?? /* @__PURE__ */ new Set();
    const registration = {};
    registrations.add(registration);
    this.conversationPanels.set(panelId, registrations);
    this.panels.setConversationPanels([...this.conversationPanels.keys()]);
    return () => {
      if (!registrations.delete(registration) || this.conversationPanels.get(panelId) !== registrations)
        return;
      if (registrations.size === 0) this.conversationPanels.delete(panelId);
      this.panels.setConversationPanels([...this.conversationPanels.keys()]);
    };
  }
  /** @returns the new pending navigation's cancellation signal. */
  /** 返回新导航的取消信号；调用者必须在异步提交 UI 前检查 aborted。 */
  beginNavigation() {
    this.navigation.abort();
    this.navigation = new AbortController();
    return this.navigation.signal;
  }
  /** Invalidate pending navigations when the layout owner is unloaded. */
  /** 布局宿主卸载时使所有未完成导航失效，并撤销全部 Conversation 登记。 */
  dispose() {
    this.navigation.abort();
    this.conversationPanels.clear();
    this.panels.setConversationPanels([]);
  }
  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  /** 转发侧栏切换动作；实际宽度和响应式规则由 root store 决定。 */
  toggleSidebar() {
    this.panels.toggleSidebar();
  }
  /** Report the right panel's track and fullscreen presentation. */
  /** 转发右栏轨道/全屏呈现报告；实际显示状态由右栏占用方上报。 */
  openRightbar(track, fullscreen) {
    this.panels.openRightbar(track, fullscreen);
  }
  /** Report the right panel as hidden: no track, no handle. */
  /** 转发右栏隐藏报告，使布局不保留轨道或外部拖拽句柄。 */
  closeRightbar() {
    this.panels.closeRightbar();
  }
};

// src/client.ts
var inject = [
  "slots",
  "uiSession",
  "theme",
  "locale",
  "sessions",
  "remote",
  "remote.session",
  "workspaces"
];
function apply(ctx) {
  ctx.effect(() => {
    const handle = createLayoutStore();
    const instance = handle.create();
    const store = { ...handle, create: () => instance };
    const retainMainPanels = () => {
      const registered = ctx.slots.entries("main").flatMap(
        (entry) => entry.options.key === void 0 ? [] : [entry.options.key]
      );
      instance.actions.retainMainPanels(registered);
      workbench.restoreRegistered(registered);
    };
    const panelInfo = {
      getSnapshot: () => instance.getSnapshot().panelInfo,
      subscribe: (listener) => instance.subscribe(listener)
    };
    const layout = new LayoutController(
      instance.actions,
      (id) => ctx.slots.entries("main").some((entry) => entry.options.key === id),
      panelInfo
    );
    const disposePanelInfo = ctx.slots.provideRoot({ hooks: { panelInfo } });
    const workspaces = ctx.get("workspaces");
    const sessions = ctx.get("sessions");
    let storage;
    try {
      storage = window.sessionStorage;
    } catch {
    }
    const workbench = new WorkbenchController({
      storage,
      // 创建链路：读取 Host 的绝对工作区配置 → 创建 workspace → 创建带 preset 的 Session。
      create: async (preset) => {
        const response = await fetch("/api/agent-workbench/config", {
          credentials: "same-origin"
        });
        if (!response.ok)
          throw new Error(
            `Workbench configuration unavailable: ${response.status}`
          );
        const config = await response.json();
        if (!config || typeof config !== "object" || !("cwd" in config) || typeof config.cwd !== "string")
          throw new Error("Invalid workbench configuration");
        const workspace = await workspaces.create({ path: config.cwd });
        const result = await ctx.remote.session.create({
          workspaceId: workspace.workspaceId,
          agentPreset: preset
        });
        if (!result.ok) throw new Error(result.error.message);
        return result.value.sessionId;
      },
      // 提交选中的 Session 前刷新会话目录，确保当前客户端能解析该 ID。
      prepare: async (id) => {
        await sessions.refresh();
        if (!sessions.list.getSnapshot().byId[id])
          throw new Error(`Session unavailable: ${id}`);
      },
      // 只允许选择当前会话服务已知的 Session，避免恢复过期关联。
      available: (id) => sessions.list.getSnapshot().byId[id] !== void 0,
      presetOf: (id) => {
        const value = sessions.list.getSnapshot().byId[id]?.projectionValues?.agentPreset;
        return typeof value === "string" ? value : void 0;
      },
      // 将工作台选择映射到原生会话选择；undefined 表示清空当前会话。
      select: (id) => {
        const navigation = ctx.get("uiWorkspace");
        if (!navigation) throw new Error("Workbench session navigation unavailable");
        navigation.selectSession(id);
      },
      // 面板动作统一经过 LayoutController，集中执行注册校验和导航取消规则。
      panel: (id) => layout.selectPanel(id),
      beginNavigation: () => layout.beginNavigation(),
      currentPanel: () => panelInfo.getSnapshot().activePanelId,
      showConversation: (id) => layout.registerConversationPanel(id)
    });
    layout.onSelect = (id) => workbench.selectPanel(id);
    const disposeWorkbench = ctx.reflect.provide("agentWorkbench", workbench);
    const disposeService = ctx.reflect.provide("layout", layout);
    const disposeRegistration = ctx.slots.register(
      {
        name: "root",
        inject: () => ({ hooks: { mainSessionId: ctx.uiSession.mainSessionId } }),
        locale: "common",
        children: {
          sidebar: { kind: "single", scope: "root" },
          main: { kind: "keyed", scope: "root" },
          rightbar: { kind: "single", scope: "root" },
          "shell.overlay": { kind: "list", scope: "root" }
        },
        store
      },
      AppFrame
    );
    const disposePanels = ctx.slots.subscribe("main", retainMainPanels);
    retainMainPanels();
    return () => {
      workbench.dispose();
      layout.dispose();
      disposePanels();
      disposeRegistration();
      disposePanelInfo();
      void disposeService();
      void disposeWorkbench();
    };
  }, "ui-layout: service + root registration");
}

return module.exports;}});
