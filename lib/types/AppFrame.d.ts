import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from "@deepseek-ai/dsh-client-ui-slots";
import type { createLayoutStore } from "./stores.ts";
/** Full composed props: runtime share + child-slot render share + store share.
 * 中文：完整根框架属性，合并运行时能力、子槽位渲染能力、布局 store 与本地化能力。
 */
export type AppFrameProps = PropsRuntime<"root"> & PropsRenderSlots<"sidebar" | "main" | "rightbar" | "shell.overlay"> & PropsStore<ReturnType<typeof createLayoutStore>> & PropsLocale<"common">;
/** The three-column frame (see module doc).
 * 中文：根布局组件。读取布局 store 与运行时槽位，求解三列实际宽度并渲染侧栏、主内容、
 * 右栏和覆盖层；拖拽只更新对应尺寸偏好，窄屏和全屏规则由展示状态共同决定。
 */
export declare function AppFrame({ useStore, useSessions, usePanelInfo, actions, renderSlot, t, }: AppFrameProps): import("react").JSX.Element;
