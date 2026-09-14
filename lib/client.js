window.__ModuleLoader__.load({id:"@cleverc2200/dsh-agent-workbench",factory:(require)=>{var module={exports:{}};var exports=module.exports;const style=document.createElement("style");style.textContent="/* src/AppFrame.module.css */\n.AppFrame_frame {\n  position: relative;\n  display: grid;\n  grid-template-rows: 100%;\n  height: 100%;\n  overflow: hidden;\n  background: var(--dsw-alias-bg-base);\n  transition: grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out);\n}\n.AppFrame_frame[data-dragging] {\n  transition: none;\n}\n@media (prefers-reduced-motion: reduce) {\n  .AppFrame_frame {\n    transition: none;\n  }\n}\n.AppFrame_sidebarCol {\n  min-width: 0;\n  overflow: hidden;\n  background: var(--dsw-specific-sidebar-fill);\n  border-right: 0.5px solid var(--dsw-alias-border-l3);\n}\n.AppFrame_centerCol {\n  min-width: 0;\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;\n}\n.AppFrame_handle {\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  width: 8px;\n  margin-left: -4px;\n  cursor: col-resize;\n  z-index: 11;\n  touch-action: none;\n  transition: left var(--ds-transition-duration-slow) var(--ds-ease-in-out);\n}\n.AppFrame_frame[data-dragging] .AppFrame_handle {\n  transition: none;\n}\n.AppFrame_frame[data-rightbar-fullscreen],\n.AppFrame_frame[data-rightbar-fullscreen] .AppFrame_handle,\n.AppFrame_frame[data-rightbar-instant],\n.AppFrame_frame[data-rightbar-instant] .AppFrame_handle,\n.AppFrame_frame[data-conversation-stacked],\n.AppFrame_frame[data-conversation-stacked] .AppFrame_handle {\n  transition: none;\n}\n@media (prefers-reduced-motion: reduce) {\n  .AppFrame_handle {\n    transition: none;\n  }\n}\n.AppFrame_rightbarCol {\n  position: relative;\n  min-width: 0;\n  overflow: visible;\n}\n.AppFrame_frame[data-conversation-beside-panel] .AppFrame_rightbarCol {\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n  overflow: hidden;\n  border-left: 0.5px solid var(--dsw-alias-border-l3);\n}\n.AppFrame_frame[data-conversation-stacked] {\n  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);\n}\n.AppFrame_frame[data-conversation-stacked] .AppFrame_sidebarCol {\n  grid-row: 1 / -1;\n}\n.AppFrame_frame[data-conversation-stacked] .AppFrame_centerCol {\n  grid-column: 2;\n  grid-row: 1;\n  min-height: 0;\n}\n.AppFrame_frame[data-conversation-stacked] .AppFrame_rightbarCol {\n  grid-column: 2;\n  grid-row: 2;\n  border-left: 0;\n  border-top: 0.5px solid var(--dsw-alias-border-l3);\n}\n.AppFrame_overlayLayer {\n  position: absolute;\n  inset: 0;\n  z-index: 20;\n  pointer-events: none;\n}\n.AppFrame_overlayLayer > * {\n  pointer-events: auto;\n}\n";document.head.append(style);
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
  constructor(ports) {
    this.ports = ports;
    try {
      const raw = ports.storage?.getItem("agent-workbench:v1");
      if (!raw) return;
      const stored = JSON.parse(raw);
      if (!Array.isArray(stored)) return;
      for (const row of stored) {
        if (!Array.isArray(row) || row.length !== 3 || typeof row[0] !== "string" || typeof row[1] !== "string" || !Array.isArray(row[2]))
          continue;
        const bindings = /* @__PURE__ */ new Map();
        for (const pair of row[2]) {
          if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === "string" && typeof pair[1] === "string" && /^session-[0-9a-f-]{36}$/.test(pair[1]))
            bindings.set(pair[0], pair[1]);
        }
        this.sessions.set(row[0], bindings);
        this.instances.set(row[0], row[1]);
      }
    } catch {
    }
  }
  pages = /* @__PURE__ */ new Map();
  sessions = /* @__PURE__ */ new Map();
  instances = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  disposed = false;
  save() {
    try {
      this.ports.storage?.setItem(
        "agent-workbench:v1",
        JSON.stringify(
          [...this.sessions].map(([id, bindings]) => [
            id,
            this.instances.get(id) ?? "default",
            [...bindings]
          ])
        )
      );
    } catch {
    }
  }
  /** Register after the page's main slot; the disposer forgets its associations. */
  register(page) {
    if (this.disposed) throw new Error("Workbench disposed");
    if (this.pages.has(page.id))
      throw new Error(`Duplicate workbench page: ${page.id}`);
    const owned = { ...page };
    this.pages.set(page.id, owned);
    return () => {
      if (this.pages.get(page.id) !== owned) return;
      this.pending.delete(owned);
      this.pages.delete(page.id);
      this.forget(page.id);
    };
  }
  /** Called by the layout on every panel selection, including native navigation. */
  selectPanel(id) {
    if (id === null || !this.pages.has(id)) return;
    const session = this.sessions.get(id)?.get(this.instances.get(id) ?? "default");
    this.ports.select(
      session !== void 0 && this.ports.available(session) ? session : void 0
    );
  }
  /** Create/reuse an instance Session, or explicitly associate a host-created Session. */
  async open(id, instance, sessionId) {
    const page = this.pages.get(id);
    if (!page || this.disposed)
      throw new Error(`Unknown workbench page: ${id}`);
    instance ??= this.instances.get(id) ?? "default";
    const navigation = this.ports.beginNavigation();
    const alive = () => !this.disposed && this.pages.get(id) === page;
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
        flight = this.ports.create(page.preset).then((created) => {
          if (alive() && this.sessions.get(id) === ownedBindings && flights.get(instance) === flight)
            ownedBindings.set(instance, created);
          return created;
        }).finally(() => {
          if (flights.get(instance) === flight) flights.delete(instance);
        });
        flights.set(instance, flight);
      }
      selected = await flight;
    }
    if (!alive() || this.sessions.get(id) !== ownedBindings || navigation.aborted)
      return;
    await this.ports.prepare(selected);
    if (!alive() || this.sessions.get(id) !== ownedBindings || navigation.aborted)
      return;
    bindings.set(instance, selected);
    this.instances.set(id, instance);
    this.save();
    this.ports.panel(id);
  }
  /** Opt a mounted page into the native conversation column. */
  showConversation(id) {
    if (!this.pages.has(id)) throw new Error(`Unknown workbench page: ${id}`);
    return this.ports.showConversation(id);
  }
  /** Drop local associations, without deleting or stopping durable Sessions. */
  forget(id) {
    this.sessions.delete(id);
    this.instances.delete(id);
    const page = this.pages.get(id);
    if (page) this.pending.delete(page);
    this.save();
  }
  /** Invalidate pending navigation without cancelling host-owned Agent work. */
  dispose() {
    this.disposed = true;
    this.pages.clear();
    this.sessions.clear();
    this.instances.clear();
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
  usePanelInfo,
  productTitle
}) {
  const showSessionTitle = usePanelInfo((info) => info.activePanelId === null);
  const title = useSessions((state) => {
    const current = state.current;
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
      toggleSidebar: (d) => {
        d.layoutInfo.rightbarInstant = false;
        if (d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE)
          d.layoutInfo.narrowExpanded = !d.layoutInfo.narrowExpanded;
        else
          d.layoutInfo.sidebar = d.layoutInfo.sidebar === 0 ? SIDEBAR_DEFAULT : 0;
      },
      // Crossing the breakpoint in either direction drops the override: the
      // narrow default is auto-collapsed, the wide state is the preference.
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
   */
  constructor(panels, hasMainPanel) {
    this.panels = panels;
    this.hasMainPanel = hasMainPanel;
  }
  navigation = new AbortController();
  onSelect;
  conversationPanels = /* @__PURE__ */ new Map();
  /** Select a global panel or return to the Conversation. */
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
  beginNavigation() {
    this.navigation.abort();
    this.navigation = new AbortController();
    return this.navigation.signal;
  }
  /** Invalidate pending navigations when the layout owner is unloaded. */
  dispose() {
    this.navigation.abort();
    this.conversationPanels.clear();
    this.panels.setConversationPanels([]);
  }
  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar() {
    this.panels.toggleSidebar();
  }
  /** Report the right panel's track and fullscreen presentation. */
  openRightbar(track, fullscreen) {
    this.panels.openRightbar(track, fullscreen);
  }
  /** Report the right panel as hidden: no track, no handle. */
  closeRightbar() {
    this.panels.closeRightbar();
  }
};

// src/theme-presenter.ts
var DARK_ATTRIBUTE = "data-ds-dark-theme";
var CONTENT_FONT_SIZE_VARIABLE = "--dsh-content-font-size";
var ThemePresenter = class {
  /** Token names this presenter wrote in the last apply (its retraction set). */
  appliedTokens = [];
  /** The single metadata node this presenter inserts and removes. */
  themeColorMeta;
  /** Create the presenter-owned metadata node before the first snapshot arrives. */
  constructor() {
    this.themeColorMeta = document.createElement("meta");
    this.themeColorMeta.name = "theme-color";
  }
  /**
   * Project a snapshot onto the document: set root `color-scheme` and the body
   * palette attribute from `active.colorScheme` (never the id — `system` is
   * resolved upstream), publish the content font-size axis, then replace the
   * previously applied token variables with `active.tokens`. Browser
   * theme-color metadata follows the computed body background after those
   * writes, so the rendered palette remains the color authority.
   * @param snapshot - resolved theme snapshot from ctx.theme.
   */
  apply(snapshot) {
    const scheme = snapshot.active.colorScheme;
    document.documentElement.style.colorScheme = scheme;
    const body = document.body;
    if (scheme === "dark") body.setAttribute(DARK_ATTRIBUTE, "");
    else body.removeAttribute(DARK_ATTRIBUTE);
    body.style.setProperty(
      CONTENT_FONT_SIZE_VARIABLE,
      `${snapshot.fontSize}px`
    );
    for (const name of this.appliedTokens) body.style.removeProperty(name);
    this.appliedTokens = [];
    for (const [name, value] of Object.entries(snapshot.active.tokens)) {
      body.style.setProperty(name, value);
      this.appliedTokens.push(name);
    }
    this.themeColorMeta.content = getComputedStyle(body).backgroundColor;
    if (!this.themeColorMeta.isConnected)
      document.head.append(this.themeColorMeta);
  }
  /** Retract root color-scheme, the palette attribute, token variables, the font-size axis, and the owned metadata node. */
  dispose() {
    document.documentElement.style.removeProperty("color-scheme");
    const body = document.body;
    body.removeAttribute(DARK_ATTRIBUTE);
    body.style.removeProperty(CONTENT_FONT_SIZE_VARIABLE);
    for (const name of this.appliedTokens) body.style.removeProperty(name);
    this.appliedTokens = [];
    this.themeColorMeta.remove();
  }
};

// src/client.ts
var inject = [
  "slots",
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
    const layout = new LayoutController(
      instance.actions,
      (id) => ctx.slots.entries("main").some((entry) => entry.options.key === id)
    );
    const retainMainPanels = () => {
      instance.actions.retainMainPanels(
        ctx.slots.entries("main").flatMap(
          (entry) => entry.options.key === void 0 ? [] : [entry.options.key]
        )
      );
    };
    const panelInfo = {
      getSnapshot: () => instance.getSnapshot().panelInfo,
      subscribe: (listener) => instance.subscribe(listener)
    };
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
      prepare: async (id) => {
        await sessions.refresh();
        if (!sessions.list.getSnapshot().byId[id])
          throw new Error(`Session unavailable: ${id}`);
      },
      available: (id) => sessions.list.getSnapshot().byId[id] !== void 0,
      select: (id) => {
        if (id === void 0) sessions.clear();
        else sessions.open(id);
      },
      panel: (id) => layout.selectPanel(id),
      beginNavigation: () => layout.beginNavigation(),
      showConversation: (id) => layout.registerConversationPanel(id)
    });
    layout.onSelect = (id) => workbench.selectPanel(id);
    const disposeWorkbench = ctx.reflect.provide("agentWorkbench", workbench);
    const disposeService = ctx.reflect.provide("layout", layout);
    const disposeRegistration = ctx.slots.register(
      {
        name: "root",
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
  ctx.effect(() => {
    const presenter = new ThemePresenter();
    presenter.apply(ctx.theme.getTheme());
    const off = ctx.on("theme/change", (snapshot) => {
      presenter.apply(snapshot);
    });
    return () => {
      off();
      presenter.dispose();
    };
  }, "ui-layout: theme presenter");
}

return module.exports;}});
