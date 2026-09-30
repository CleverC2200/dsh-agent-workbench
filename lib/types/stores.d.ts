/**
 * Root-owned frame measurement, panel preferences, and presentation reports.
 * The registration supplies a fresh store and binds its actions to ctx.layout.
 * 根级布局 store 统一保存框架测量值、面板宽度偏好和右侧面板展示报告；
 * 注册入口为每个实例创建全新 store，并把 action 绑定到 ctx.layout。
 */
import { type EngineStoreHandle } from "@deepseek-ai/dsh-client-store";
import type { MainPanelId } from "./service.ts";
/**
 * Transient layout preferences. Responsive concessions never rewrite widths;
 * the right panel's expanded state belongs to its occupant.
 * 临时布局偏好。响应式收缩只改变当前展示，不覆盖用户保存的宽度；右侧
 * 面板是否展开由面板自身负责，本 store 只接收它上报的展示状态。
 */
/** 根布局 store 的完整状态：注册关系、当前主面板和所有几何/展示信息。 */
type LayoutState = {
    /** 当前已注册、可在会话旁展示的主面板 ID 列表。 */
    conversationPanelIds: MainPanelId[];
    fullscreenPanelIds: MainPanelId[];
    panelInfo: {
        /** Null selects the Conversation; global panels keep the current Session intact. */
        /** 为 null 时显示当前 Conversation；切换全局面板不改变当前 Session。 */
        activePanelId: MainPanelId | null;
    };
    layoutInfo: LayoutInfo;
    shellPresentation: ShellPresentation;
};
/** Transient shell appearance; Session and panel identities remain with their owners. */
export type ShellPresentation = {
    conversationView: "center" | "split" | "chat";
    documentTitle?: string;
};
/** 由 AppFrame 和右侧面板共同维护的尺寸偏好及响应式展示状态。 */
type LayoutInfo = {
    /** Conversation width preference, independent of the built-in right panel. */
    /** Conversation 的宽度偏好，与内置右侧面板的宽度彼此独立。 */
    conversationWidth: number | null;
    /** 侧栏宽度偏好；宽屏下为 0 表示关闭，窄屏收缩时另由 narrowExpanded 覆盖。 */
    sidebar: number;
    /** Last positive frame measurement; window width bootstraps the first render. */
    /** 最近一次大于 0 的框架宽度；首次渲染用 window.innerWidth 初始化。 */
    viewportWidth: number;
    /** 窄屏下是否临时展开侧栏；不改写 sidebar 宽度偏好。 */
    narrowExpanded: boolean;
    /**
     * Saved right panel width in px, or null before its first opening. Resizing
     * the frame and closing the panel preserve this preference.
     * 右侧面板保存的像素宽度；首次打开前为 null。框架缩放或关闭面板都不丢失该偏好。
     */
    rightbar: number | null;
    /**
     * Whether the right panel is drawn at all, in either presentation.
     *
     * Derived chrome, not a source of truth: whether the right surface is
     * expanded is a recorded fact owned by that surface, reported here so the
     * frame can place the panel's resize handle. The occupant reports it; nothing
     * else writes it.
     * 这是面板上报的事实，供框架决定是否放置调整手柄；其他逻辑不得自行写入，
     * 也不应把它当作“展开意图”的来源。
     */
    rightbarShown: boolean;
    /**
     * Whether the normal panel width reserves a grid track, including beneath
     * fullscreen. Reported by the occupant; always false while hidden.
     * 普通面板宽度是否占用网格轨道（全屏覆盖时也可能保留）；由面板上报，隐藏时
     * 始终为 false。
     */
    rightbarTrack: boolean;
    /** Reported fullscreen presentation; hides the outer resize handle. */
    /** 面板上报的全屏展示状态；为 true 时隐藏外层调整手柄。 */
    rightbarFullscreen: boolean;
    /** Suppress transitions for a fullscreen exit until another geometry action. */
    /** 全屏退出后在下一次几何操作前抑制过渡动画，避免错误的中间态动画。 */
    rightbarInstant: boolean;
};
/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 * 这是下方 actions 字面量的显式类型镜像（导出类型需要声明返回值）；
 * 若 action 签名漂移，defineStore 调用处会因不可赋值而失败。
 */
type LayoutActions = {
    setFullscreenPanels: (draft: LayoutState, panels: readonly MainPanelId[]) => void;
    setConversationView: (draft: LayoutState, view: ShellPresentation["conversationView"]) => void;
    setDocumentTitle: (draft: LayoutState, title: string | undefined) => void;
    /** 同步会话旁可展示的主面板注册列表。 */
    setConversationPanels: (draft: LayoutState, panelIds: readonly MainPanelId[]) => void;
    /** 设置会话区域宽度，并按当前视口上限夹紧。 */
    setConversationWidth: (draft: LayoutState, px: number) => void;
    /** 记录当前主面板选择；null 表示回到 Conversation。 */
    selectPanel: (draft: LayoutState, panelId: MainPanelId | null) => void;
    /** 清理已从主槽注销的当前选择。 */
    retainMainPanels: (draft: LayoutState, panelIds: readonly string[]) => void;
    /** 保存侧栏拖拽宽度，并清除立即切换标记。 */
    setSidebar: (draft: LayoutState, px: number) => void;
    /** 按宽屏关闭/打开或窄屏覆盖状态切换侧栏。 */
    toggleSidebar: (draft: LayoutState) => void;
    expandSidebar: (draft: LayoutState) => void;
    /** 上报新的框架宽度，并在跨响应式断点时重置窄屏覆盖。 */
    setViewportWidth: (draft: LayoutState, width: number) => void;
    /** 保存右侧面板拖拽宽度，并按当前视口上限夹紧。 */
    setRightbar: (draft: LayoutState, px: number) => void;
    /** 上报右侧面板是否占轨道及是否全屏，同时按需初始化宽度。 */
    openRightbar: (draft: LayoutState, track: boolean, fullscreen: boolean) => void;
    /** 隐藏右侧面板、释放轨道和全屏标记，但保留宽度偏好。 */
    closeRightbar: (draft: LayoutState) => void;
};
/**
 * Create the layout panel store handle. For the sidebar the preference IS the
 * width, so closing it forgets its drag width — reopening restores the contract
 * default. The right panel initializes at 45% of the frame on first opening
 * and keeps that px preference across resizes and close. Drag writes clamp to
 * the current frame's range. Narrow sidebar toggles change only the expansion
 * override; opening the right panel clears that override.
 * @returns the store handle (spec + type + identity + factory in one).
 * 中文：创建根布局 store。侧栏关闭后重新打开会回到契约默认宽度；右栏首次按框架
 * 宽度的 45% 初始化，并跨缩放和关闭保留像素偏好；窄屏侧栏只改变临时展开覆盖。
 * @returns store handle（合并了 store 规格、类型、身份和工厂）。
 */
export declare function createLayoutStore(): EngineStoreHandle<LayoutState, LayoutActions>;
export {};
