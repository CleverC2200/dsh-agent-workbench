/**
 * LayoutController: the cross-plugin panel-action face behind ctx.layout.
 * Panel geometry and main-panel selection live in the root layout store;
 * the current-session selection lives with the runtime sessions service, and
 * the per-session active view dissolved into ui-conversation's session store
 * (its only consumer). What remains here is the contract other plugins'
 * apply worlds reach for panel transitions (main-panel selection and sidebar toggle,
 * right-panel show/hide from ui-sidebar-right) — writes stay inside the
 * store's declared action set, shared with the root registration.
 * 中文说明：本文件是跨插件的布局动作门面，不持有会话业务状态。调用链为“插件调用 ctx.layout → 本控制器校验并取消旧导航 → root store 更新 → AppFrame/占位面板重渲染”；会话选择仍由运行时 sessions 服务负责。
 */
import type { BoundActions, HostObservable } from "@deepseek-ai/dsh-client-ui-slots";
import type { Branded } from "@deepseek-ai/dsh-brand";
import type { ShellPresentation, createLayoutStore } from "./stores.ts";

/** Identity shared by a sidebar panel entry and its main-slot occupant. */
/** 侧栏条目与 main 插槽占位共同使用的身份标识，保证两处指向同一业务面板。 */
export type MainPanelId = Branded<"MainPanelId">;

/** Root-scoped navigation state exposed to panel-aware components. */
/** 暴露给面板组件的 root 级导航状态；它描述全局面板，不改变当前 Session。 */
export interface PanelInfo {
  /** Selected global panel; null displays the current Conversation. */
  /** 当前选中的全局面板；为 null 时显示当前会话的原生 Conversation。 */
  readonly activePanelId: MainPanelId | null;
}

/** The layout store's bound action set (framework-baked, draft params peeled). */
/** 布局 store 的绑定动作集合（框架已绑定 store 实例，参数中的 draft 已剥离）。 */
export type PanelActions = BoundActions<ReturnType<typeof createLayoutStore>>;

/** Panel navigation and geometry actions exposed through ctx.layout. */
/** 通过 ctx.layout 对外提供的面板导航与几何呈现动作接口。 */
export interface ILayout {
  /** Register a main panel that owns the entire frame while selected; disposal releases its claim. */
  registerFullscreenPanel(panelId: MainPanelId): () => void;
  readonly shellPresentation: HostObservable<ShellPresentation>;
  /** Change only the presentation of an already-associated Conversation. */
  setConversationView(view: ShellPresentation["conversationView"]): void;
  /** Register the fixed shell title; dispose restores normal Session title projection. */
  registerDocumentTitle(title: string): () => void;
  readonly panelInfo: HostObservable<PanelInfo>;
  /**
   * Select a global central panel without changing the current Session.
   * @param panelId - registered main key, or null to show the Conversation.
   * @throws if the selected main key is not registered; preserves the current selection.
   */
  selectPanel(panelId: MainPanelId | null): void;
  /** 选择全局面板；仅改变中心面板，不切换当前会话。 */
  /**
   * Show the native Conversation beside a selected global panel.
   * @param panelId - an already registered main key, other than `conversation`.
   * @returns an idempotent disposer; the panel stays opted in until all registrations leave.
   * @throws if the main key is missing or is the reserved Conversation key.
   */
  registerConversationPanel(panelId: MainPanelId): () => void;
  /** 为已注册全局面板登记并排显示原生 Conversation；返回的 disposer 对应一次登记。 */
  /**
   * Start an asynchronous navigation, superseding any earlier pending navigation.
   * @returns a signal aborted by the next navigation or layout disposal; check it before committing UI state.
   */
  beginNavigation(): AbortSignal;
  /** 开始一次可取消导航；后续导航或布局销毁会使该 signal 失效。 */
  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void;
  /** Expand without toggling an already-open column. */
  expandSidebar(): void;
  /** 切换侧栏显示状态；宽屏使用默认宽度，窄屏只切换临时展开覆盖。 */
  /**
   * Report the right panel's presentation without changing its expanded state.
   * @param track - whether the normal panel width reserves a grid track,
   *   including beneath a fullscreen overlay.
   * @param fullscreen - whether the panel covers the frame and hides its outer
   *   resize handle; independent of the underlying grid track.
   */
  openRightbar(track: boolean, fullscreen: boolean): void;
  /** 上报右栏的轨道和全屏呈现状态，不直接改变右栏拥有者的展开业务状态。 */
  /** Report the right panel as hidden: no track, no handle. */
  closeRightbar(): void;
  /** 上报右栏隐藏，并清除其网格轨道与拖拽句柄。 */
}

/** Cross-plugin panel-action face (ctx.layout). */
/** 跨插件面板动作门面（即 ctx.layout）；负责边界校验、导航失效和动作转发。 */
export class LayoutController implements ILayout {
  private navigation = new AbortController();
  private titleOwner: object | undefined;
  /** 面板选择成功校验后的通知回调；客户端用它同步对应的工作台 Session。 */
  onSelect?: (id: MainPanelId | null) => void;
  private readonly fullscreenPanels = new Map<MainPanelId, Set<object>>();
  private readonly conversationPanels = new Map<MainPanelId, Set<object>>();

  /**
   * @param panels - actions of the instance shared with the root entry.
   * @param hasMainPanel - checks the live main-slot registry for a panel id.
   * 中文：接收 root 入口共享的 store 动作，以及用于校验面板是否仍在实时 main 插槽中的检查器。
   */
  constructor(
    private readonly panels: PanelActions,
    private readonly hasMainPanel: (id: MainPanelId) => boolean,
    readonly panelInfo: HostObservable<PanelInfo>,
    readonly shellPresentation: HostObservable<ShellPresentation>,
  ) {}

  registerFullscreenPanel(panelId: MainPanelId): () => void {
    if (panelId === "conversation" || !this.hasMainPanel(panelId)) throw Error("UNKNOWN_FULLSCREEN_PANEL");
    const claims = this.fullscreenPanels.get(panelId) ?? new Set<object>();
    const claim = {};
    claims.add(claim);
    this.fullscreenPanels.set(panelId, claims);
    this.panels.setFullscreenPanels([...this.fullscreenPanels.keys()]);
    return () => {
      if (!claims.delete(claim) || this.fullscreenPanels.get(panelId) !== claims) return;
      if (!claims.size) this.fullscreenPanels.delete(panelId);
      this.panels.setFullscreenPanels([...this.fullscreenPanels.keys()]);
    };
  }

  setConversationView(view: ShellPresentation["conversationView"]): void {
    this.panels.setConversationView(view);
  }

  registerDocumentTitle(title: string): () => void {
    if (this.titleOwner) throw Error("SHELL_TITLE_ALREADY_REGISTERED");
    const owner = {};
    this.titleOwner = owner;
    this.panels.setDocumentTitle(title);
    return () => {
      if (this.titleOwner !== owner) return;
      this.titleOwner = undefined;
      this.panels.setDocumentTitle(undefined);
    };
  }

  /** Select a global panel or return to the Conversation. */
  /** 选择已注册全局面板，或传 null 返回 Conversation；未注册 ID 会抛错且不改选择。 */
  selectPanel(panelId: MainPanelId | null): void {
    if (panelId !== null && !this.hasMainPanel(panelId)) {
      throw new Error(
        `layout.selectPanel: main panel "${panelId}" is not registered`,
      );
    }
    // 面板切换会使尚未提交的异步 open 失效，避免旧请求覆盖最新选择。
    this.navigation.abort();
    this.onSelect?.(panelId);
    this.panels.selectPanel(panelId);
  }

  /** 登记一个并排 Conversation 占用者，并返回可重复调用安全的撤销函数。 */
  registerConversationPanel(panelId: MainPanelId): () => void {
    if (panelId === "conversation" || !this.hasMainPanel(panelId)) {
      throw new Error(
        `layout.registerConversationPanel: main panel "${panelId}" must be a registered global panel`,
      );
    }
    // 同一面板允许多个拥有者登记；只有最后一个 disposer 执行后才撤销并排显示。
    const registrations =
      this.conversationPanels.get(panelId) ?? new Set<object>();
    const registration = {};
    registrations.add(registration);
    this.conversationPanels.set(panelId, registrations);
    this.panels.setConversationPanels([...this.conversationPanels.keys()]);
    // disposer 只撤销自己持有的 token；重复调用或面板已被替换时保持幂等。
    return () => {
      if (
        !registrations.delete(registration) ||
        this.conversationPanels.get(panelId) !== registrations
      )
        return;
      if (registrations.size === 0) this.conversationPanels.delete(panelId);
      this.panels.setConversationPanels([...this.conversationPanels.keys()]);
    };
  }

  /** @returns the new pending navigation's cancellation signal. */
  /** 返回新导航的取消信号；调用者必须在异步提交 UI 前检查 aborted。 */
  beginNavigation(): AbortSignal {
    this.navigation.abort();
    this.navigation = new AbortController();
    return this.navigation.signal;
  }

  /** Invalidate pending navigations when the layout owner is unloaded. */
  /** 布局宿主卸载时使所有未完成导航失效，并撤销全部 Conversation 登记。 */
  dispose(): void {
    this.navigation.abort();
    this.titleOwner = undefined;
    this.panels.setDocumentTitle(undefined);
    this.fullscreenPanels.clear();
    this.panels.setFullscreenPanels([]);
    this.conversationPanels.clear();
    this.panels.setConversationPanels([]);
  }

  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  /** 转发侧栏切换动作；实际宽度和响应式规则由 root store 决定。 */
  expandSidebar(): void { this.panels.expandSidebar(); }

  toggleSidebar(): void {
    this.panels.toggleSidebar();
  }

  /** Report the right panel's track and fullscreen presentation. */
  /** 转发右栏轨道/全屏呈现报告；实际显示状态由右栏占用方上报。 */
  openRightbar(track: boolean, fullscreen: boolean): void {
    this.panels.openRightbar(track, fullscreen);
  }

  /** Report the right panel as hidden: no track, no handle. */
  /** 转发右栏隐藏报告，使布局不保留轨道或外部拖拽句柄。 */
  closeRightbar(): void {
    this.panels.closeRightbar();
  }
}
