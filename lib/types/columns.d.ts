/**
 * Normal column geometry: the right column shrinks, then loses its track,
 * before the center drops below its minimum. The sidebar never concedes here;
 * AppFrame supplies its effective preference after responsive collapse.
 * 普通布局的列宽规则：先压缩右列，空间仍不足时移除右列轨道，之后中心列
 * 才允许低于最小宽度。此处不处理侧栏让步；侧栏响应式收缩后的有效宽度由
 * AppFrame 传入。
 */
/** Resolved widths for one frame. */
/** 单个框架计算后的实际列宽，单位为 px。 */
export interface Columns {
    /** 实际侧栏宽度，关闭时仍保留折叠图标轨道。 */
    sidebar: number;
    /** 中心内容区实际宽度，可能因极窄视口降到 0。 */
    center: number;
    /** 右侧面板实际宽度；无轨道时为 0。 */
    rightbar: number;
}
/** Center width protected while the normal right column is open. */
/** 普通右列仍打开时为中心内容保护的最小宽度。 */
export declare const CENTER_MIN = 400;
/** Sidebar drag clamp floor. */
/** 侧栏拖拽宽度下限。 */
export declare const SIDEBAR_MIN = 264;
/** Sidebar drag clamp ceiling. */
/** 侧栏拖拽宽度上限。 */
export declare const SIDEBAR_MAX = 420;
/** Sidebar width before any user drag. */
/** 用户首次拖拽前的侧栏默认宽度。 */
export declare const SIDEBAR_DEFAULT = 280;
/** Closed-sidebar rail: a 24px icon column between 16px horizontal paddings. */
/** 侧栏关闭后的轨道宽度：左右各 16px 内边距，中间为 24px 图标列。 */
export declare const SIDEBAR_COLLAPSED = 56;
/** Viewport width below which the sidebar auto-collapses to the rail (deepsuite
 * LG breakpoint); a manual toggle below it re-expands over the squeezed center
 * (stores.ts narrowExpanded). */
/** 视口小于该值时侧栏自动收缩为轨道（deepsuite LG 断点）；窄屏手动切换
 * 会覆盖在被压缩的中心区上展开（状态见 stores.ts 的 narrowExpanded）。 */
export declare const SIDEBAR_AUTO_COLLAPSE = 1024;
/** Right column drag clamp floor. */
/** 右列拖拽宽度下限。 */
export declare const RIGHTBAR_MIN = 300;
/** Maximum normal right panel width as a fraction of the frame. */
/** 普通右侧面板宽度相对框架宽度的最大比例。 */
export declare const RIGHTBAR_MAX_RATIO = 0.7;
/** First-open right panel preference as a fraction of the frame. */
/** 右侧面板首次打开时按框架宽度计算的默认比例。 */
export declare const RIGHTBAR_DEFAULT_RATIO = 0.45;
/** Initial width of the native Conversation beside an opted-in global panel. */
/** 用户注册全局面板并与其并排显示时，原生 Conversation 的初始宽度。 */
export declare const CONVERSATION_DEFAULT_WIDTH = 440;
/**
 * Clamp a panel width into its contract range.
 * @param px - requested width.
 * @param min - range lower bound.
 * @param max - range upper bound.
 * @returns the clamped width.
 * @param px - 请求的宽度（单位 px）。
 * @param min - 范围下限。
 * @param max - 范围上限。
 * 将输入宽度四舍五入后限制在闭区间 [min, max] 内。
 */
export declare function clampWidth(px: number, min: number, max: number): number;
/**
 * Solve the three column widths for one viewport frame.
 * @param viewport - available frame width in px.
 * @param sidebar - sidebar width preference in px (0 = closed).
 * @param rightbar - requested right panel width in px (0 = no track).
 * @param viewport - 可用框架宽度（px）。
 * @param sidebar - 侧栏宽度偏好（px；0 表示关闭，但仍保留折叠轨道）。
 * @param rightbar - 请求的右侧面板宽度（px；0 表示不占用轨道）。
 * @returns actual widths after shrinking or removing the right track; only
 *   without that track may the center fall below its minimum, down to zero.
 * @returns 依次执行右列压缩或移除轨道后的实际宽度；只有移除右列轨道后，
 *   中心列才可低于最小值，极窄时最低为 0。
 */
export declare function computeColumns(viewport: number, sidebar: number, rightbar: number): Columns;
