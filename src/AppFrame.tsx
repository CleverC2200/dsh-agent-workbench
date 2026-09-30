/**
 * Three-column shell frame, registered into the built-in 'root' slot (the web
 * shell renders only 'root'). Owns the grid tracks (sidebar | center |
 * rightbar), the drag handles (pointer capture + rAF throttle), the column
 * solve (columns.ts), and the child-slot render decisions: the sidebar slot
 * receives live parameters from that solve. The root-scoped main slot selects
 * the Conversation or a global panel. Each column occupant owns its Session
 * binding and reports the geometry it needs.
 *
 * The right column is a track, not a box: its occupant draws its panel anchored
 * to the frame's right edge at the resolved normal width, and the
 * track only decides whether the centre makes room for it. The occupant reports
 * shown/track/fullscreen through `ctx.layout`; fullscreen keeps the reported
 * track but hides the outer resize handle. Everything arrives through the framework
 * shares — zero cordis or framework imports, zero self-made hooks.
 *
 * 中文说明：本文件是内置 root 槽位的三列壳层，位于应用布局最外层：组合 sidebar、
 * 主会话/主面板、rightbar 与覆盖层，并编排尺寸求解、响应式折叠和拖拽交互。业务面板
 * 由各子槽位提供，本文件只负责布局几何和渲染入口的选择。
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, CSSProperties } from "react";
import type {
  PropsLocale,
  PropsRenderSlots,
  PropsRuntime,
  PropsStore,
} from "@deepseek-ai/dsh-client-ui-slots";
import {
  computeColumns,
  CONVERSATION_DEFAULT_WIDTH,
  RIGHTBAR_DEFAULT_RATIO,
  SIDEBAR_AUTO_COLLAPSE,
  SIDEBAR_DEFAULT,
} from "./columns.ts";
import { DocumentTitle, type MainSessionProps } from "./DocumentTitle.tsx";
import type { createLayoutStore } from "./stores.ts";
import css from "./AppFrame.module.css";

/** Full composed props: runtime share + child-slot render share + store share.
 * 中文：完整根框架属性，合并运行时能力、子槽位渲染能力、布局 store 与本地化能力。
 */
export type AppFrameProps = PropsRuntime<"root"> & MainSessionProps &
  PropsRenderSlots<"sidebar" | "main" | "rightbar" | "shell.overlay" | "shell.conversation.toolbar"> &
  PropsStore<ReturnType<typeof createLayoutStore>> &
  PropsLocale<"common">;

/** Center column grid item (session-body building block).
 * 中文：主列网格容器；输入可选子节点，输出包裹后的主列 DOM，不改变子内容。
 */
function CenterColumn(props: { children?: ReactNode }) {
  return <div className={css.centerCol}>{props.children}</div>;
}

/** Subscribe to the main key without subscribing the column frame to each panel id.
 * 中文：读取当前主面板标识并选择 main 槽位入口；无活动面板时输出 Conversation，避免
 * 整个列框架订阅每个面板的细节状态。
 */
function MainPanel({
  usePanelInfo,
  renderSlot,
}: Pick<PropsRuntime<"root">, "usePanelInfo"> & PropsRenderSlots<"main">) {
  const panelId = usePanelInfo((info) => info.activePanelId);
  return renderSlot("main", {}, { entryKey: panelId ?? "conversation" });
}

/**
 * Right column grid item. Zero-width unless the occupant asked for a track; the
 * occupant's panel is positioned against the column's right edge, which never
 * moves, so it can hang over the centre when there is no track.
 * 中文：右列是可为零宽的轨道容器；面板锚定框架右边缘，因此无轨道时仍可覆盖主列，
 * 是否给主列让出空间由布局求解结果决定。
 */
function RightbarColumn(props: { children?: ReactNode }) {
  return (
    <div className={css.rightbarCol} data-rightbar-col>
      {props.children}
    </div>
  );
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
 * `side` keys the hover-reveal CSS to the owning column.
 * 中文：一个列宽拖拽把手。输入所属列、初始位置及开始/移动/结束回调，输出可捕获指针的
 * 交互元素；位移相对本次拖拽起点，并通过 rAF 合并上报，结束或取消时释放捕获。
 */
function DragHandle(props: {
  side: "sidebar" | "rightbar";
  left: number;
  onStart: () => void;
  onDrag: (dx: number) => void;
  onEnd: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const origin = useRef(0);
  const latest = useRef(0);
  const frame = useRef<number | null>(null);
  const capture = useRef<{ element: HTMLDivElement; id: number } | null>(null);
  const callbacks = useRef({
    onStart: props.onStart,
    onDrag: props.onDrag,
    onEnd: props.onEnd,
  });
  callbacks.current = {
    onStart: props.onStart,
    onDrag: props.onDrag,
    onEnd: props.onEnd,
  };

  // 中文：统一收尾拖拽，取消待处理帧、释放指针捕获并通知父布局。
  const endDrag = useCallback(() => {
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
  // 中文：组件卸载时复用 endDrag 清理仍在进行的拖拽。
  useEffect(() => endDrag, [endDrag]);

  // 中文：仅接受主键按下，记录起点并进入拖拽态；重复拖拽或其他按键直接忽略。
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || capture.current !== null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    capture.current = { element: e.currentTarget, id: e.pointerId };
    origin.current = e.clientX;
    latest.current = e.clientX;
    callbacks.current.onStart();
    setDragging(true);
  }, []);
  // 中文：记录最新横坐标，并在下一帧按“当前位置 - 起点”上报，避免高频事件直接重排。
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id !== e.pointerId) return;
    latest.current = e.clientX;
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null;
      callbacks.current.onDrag(latest.current - origin.current);
    });
  }, []);
  // 中文：指针抬起时先提交最后一次位移，再执行统一收尾。
  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (capture.current?.id !== e.pointerId) return;
      callbacks.current.onDrag(e.clientX - origin.current);
      endDrag();
    },
    [endDrag],
  );
  // 中文：指针取消或失去捕获时，仅对当前拖拽所属指针执行收尾。
  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (capture.current?.id === e.pointerId) endDrag();
    },
    [endDrag],
  );

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
    />
  );
}

/** The three-column frame (see module doc).
 * 中文：根布局组件。读取布局 store 与运行时槽位，求解三列实际宽度并渲染侧栏、主内容、
 * 右栏和覆盖层；拖拽只更新对应尺寸偏好，窄屏和全屏规则由展示状态共同决定。
 */
export function AppFrame({
  useStore,
  useSessions,
  useMainSessionId,
  usePanelInfo,
  actions,
  renderSlot,
  t,
}: AppFrameProps) {
  const conversationBesidePanel = useStore(
    (state) =>
      state.panelInfo.activePanelId !== null &&
      state.conversationPanelIds.includes(state.panelInfo.activePanelId),
  );
  const mainFullscreen = useStore(state => state.panelInfo.activePanelId !== null && state.fullscreenPanelIds.includes(state.panelInfo.activePanelId));
  const presentation = useStore(state => state.shellPresentation);
  const layoutInfo = useStore((state) => state.layoutInfo);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const viewport = layoutInfo.viewportWidth;

  // Track the frame's own box (not the window): rAF-throttled ResizeObserver.
  // 中文：观察框架自身宽度而非浏览器窗口；正宽度测量写入 store，供列宽求解和默认右栏宽度使用。
  useLayoutEffect(() => {
    const el = frameRef.current;
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (el === null) return;
    let raf: number | null = null;
    let disposed = false;
    // 中文：读取框架实际像素宽度，只提交正值，避免初始化或隐藏阶段的零宽污染布局状态。
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      if (width > 0) actions.setViewportWidth(width);
    };
    measure();
    // 中文：ResizeObserver 回调只安排一次下一帧测量，组件卸载后不再触发状态写入。
    const observer = new ResizeObserver(() => {
      if (disposed) return;
      raf ??= requestAnimationFrame(() => {
        raf = null;
        measure();
      });
    });
    observer.observe(el);
    // 中文：清理观察器并取消尚未执行的测量帧，防止卸载后的异步回调残留。
    return () => {
      disposed = true;
      observer.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [actions]);

  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE;
  const sidebarCollapsed = narrow
    ? !layoutInfo.narrowExpanded
    : layoutInfo.sidebar === 0;
  const sidebarPreference = sidebarCollapsed
    ? 0
    : layoutInfo.sidebar === 0
      ? SIDEBAR_DEFAULT
      : layoutInfo.sidebar;
  const rightbarPreference =
    layoutInfo.rightbar ?? viewport * RIGHTBAR_DEFAULT_RATIO;
  // Opening on a narrow frame collapses the left sidebar. Eligibility must
  // include that space before the occupant's first shown report arrives.
  // 中文：窄屏首次打开右栏时先按侧栏折叠后的空间判断资格，不能等待右栏首次上报。
  const normal = computeColumns(
    viewport,
    !layoutInfo.rightbarShown && narrow ? 0 : sidebarPreference,
    rightbarPreference,
  );
  const cols = mainFullscreen ? {sidebar: 0, center: viewport, rightbar: 0} : computeColumns(
    viewport,
    sidebarPreference,
    conversationBesidePanel && presentation.conversationView === "split"
      ? (layoutInfo.conversationWidth ?? CONVERSATION_DEFAULT_WIDTH)
      : layoutInfo.rightbarTrack
        ? rightbarPreference
        : 0,
  );
  const conversationStacked = conversationBesidePanel && presentation.conversationView === "split" && cols.rightbar === 0;
  const rightbarShown = conversationBesidePanel || layoutInfo.rightbarShown;
  const rightbarFullscreen =
    !conversationBesidePanel && layoutInfo.rightbarFullscreen;
  const resizeWidth = conversationBesidePanel ? cols.rightbar : normal.rightbar;
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const rightbarWidth = useRef(resizeWidth);
  rightbarWidth.current = resizeWidth;

  // The drag base is the rendered width captured at drag start (grabbing a
  // concession-clamped panel must not jump back to the stored preference);
  // it stays frozen for the whole gesture so dx deltas do not compound.
  // 中文：拖拽基准取当前实际渲染宽度，避免受约束的面板跳回存储偏好；整个手势固定基准，
  // 使位移始终相对起点计算而不会累加误差。
  const sidebarBase = useRef(0);
  const rightbarBase = useRef(0);
  // Track-level transitions pause for the whole gesture: eased tracks would
  // detach the column edge from the pointer (AppFrame.module.css).
  // 中文：拖拽期间暂停列轨道动画，保证边界跟随指针；结束后恢复布局过渡。
  const [dragging, setDragging] = useState(false);
  // 中文：拖拽结束后恢复轨道过渡。
  const onDragEnd = useCallback(() => {
    setDragging(false);
  }, []);
  // 中文：记录侧栏当前实际宽度并进入拖拽态。
  const onSidebarStart = useCallback(() => {
    sidebarBase.current = colsRef.current.sidebar;
    setDragging(true);
  }, []);
  // 中文：把起始宽度加横向位移交给 store，由 store 按 264–420px 约束。
  const onSidebarDrag = useCallback(
    (dx: number) => {
      actions.setSidebar(sidebarBase.current + dx);
    },
    [actions],
  );
  // 中文：记录右栏（或并排 Conversation）当前实际宽度并进入拖拽态。
  const onRightbarStart = useCallback(() => {
    rightbarBase.current = rightbarWidth.current;
    setDragging(true);
  }, []);
  // 中文：右边界向左拖会增宽右栏；并排 Conversation 时写入 conversationWidth，否则写入 rightbar。
  const onRightbarDrag = useCallback(
    (dx: number) => {
      const width = rightbarBase.current - dx;
      if (conversationBesidePanel) actions.setConversationWidth(width);
      else actions.setRightbar(width);
    },
    [actions, conversationBesidePanel],
  );
  const productTitle = t("brand.localBuild");
  const sidebar = useMemo(
    () =>
      renderSlot("sidebar", {
        collapsed: sidebarCollapsed,
        width: cols.sidebar,
      }),
    [renderSlot, sidebarCollapsed, cols.sidebar],
  );
  const main = useMemo(
    () => <MainPanel usePanelInfo={usePanelInfo} renderSlot={renderSlot} />,
    [usePanelInfo, renderSlot],
  );
  const overlays = useMemo(() => renderSlot("shell.overlay", {}), [renderSlot]);
  return (
    <div
      ref={frameRef}
      className={css.frame}
      style={{
        gridTemplateColumns: `${cols.sidebar}px minmax(0, 1fr) ${cols.rightbar}px`,
        "--dsh-conversation-background": conversationBesidePanel ? "var(--workbench-surface)" : undefined,
      } as CSSProperties}
      data-main-fullscreen={mainFullscreen || undefined}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-rightbar-collapsed={cols.rightbar === 0 || undefined}
      data-rightbar-fullscreen={rightbarFullscreen || undefined}
      data-rightbar-instant={
        (!conversationBesidePanel && layoutInfo.rightbarInstant) || undefined
      }
      data-conversation-view={conversationBesidePanel ? presentation.conversationView : undefined}
      data-conversation-beside-panel={conversationBesidePanel || undefined}
      data-conversation-stacked={conversationStacked || undefined}
      data-dragging={dragging || undefined}
    >
      <DocumentTitle
        productTitle={productTitle}
        fixedTitle={presentation.documentTitle}
        useSessions={useSessions}
        useMainSessionId={useMainSessionId}
        usePanelInfo={usePanelInfo}
      />
      <div className={css.sidebarCol}>{sidebar}</div>
      <>
        <CenterColumn>{conversationBesidePanel && presentation.conversationView === "center" && renderSlot("shell.conversation.toolbar", {})}{main}</CenterColumn>
        <RightbarColumn>
          {conversationBesidePanel
            ? <>{presentation.conversationView !== "center" && renderSlot("shell.conversation.toolbar", {})}{renderSlot("main", {}, { entryKey: "conversation" })}</>
            : renderSlot("rightbar", {
                width: normal.rightbar,
                viewportWidth: viewport,
                canShow: normal.rightbar > 0,
              })}
        </RightbarColumn>
      </>
      <div className={css.overlayLayer} data-shell-overlay>
        {overlays}
      </div>
      {/* The collapsed rail is fixed-width: no resize handle while closed.
          中文：折叠后的侧栏是固定宽度的图标轨道，关闭时不显示可调整宽度的把手。
       */}
      {!sidebarCollapsed && !mainFullscreen && (
        <DragHandle
          side="sidebar"
          left={cols.sidebar}
          onStart={onSidebarStart}
          onDrag={onSidebarDrag}
          onEnd={onDragEnd}
        />
      )}
      {rightbarShown && !rightbarFullscreen && resizeWidth > 0 && (
        <DragHandle
          side="rightbar"
          left={viewport - resizeWidth}
          onStart={onRightbarStart}
          onDrag={onRightbarDrag}
          onEnd={onDragEnd}
        />
      )}
    </div>
  );
}
