/**
 * Browser title selection follows the active main panel without subscribing the frame.
 * 中文：本文件只负责浏览器标签页标题。它独立订阅“当前是否在原生 Conversation”以及
 * 当前 Session 标题，避免整个三栏框架因标题变化而重新订阅、重新渲染。
 */
import { useEffect } from "react";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";

/** Props for the browser title projection. 中文：标题投影组件所需的最小运行时订阅能力和产品名。 */
export type DocumentTitleProps = Pick<
  PropsRuntime<"root">,
  "useSessions" | "usePanelInfo"
> & {
  /** Build-configured or localized product title. 中文：构建配置或本地化提供的产品标题，也是无会话时的兜底标题。 */
  productTitle: string;
};

/**
 * Project the selected durable session title into the browser title and
 * restore the build-selected product title when unmounted.
 * @param props - Selected session title projection.
 * @returns No rendered content.
 * 中文：仅当主区域显示原生 Conversation 时，把当前持久 Session 的标题组合进浏览器标题；
 * 显示全局业务面板或没有当前 Session 时只显示产品名，组件卸载时也恢复产品名。
 * 该组件只产生副作用，不渲染任何 DOM。
 */
export function DocumentTitle({
  useSessions,
  usePanelInfo,
  productTitle,
}: DocumentTitleProps): null {
  const showSessionTitle = usePanelInfo((info) => info.activePanelId === null);
  const title = useSessions((state) => {
    const current = Object.values(state.byId).find(
      (session) => (session.retainedBy.mainView ?? 0) > 0,
    )?.id;
    return !showSessionTitle || current === undefined
      ? undefined
      : state.byId[current]?.title;
  });
  /** 中文：同步浏览器标题，并在依赖变化或组件卸载时撤回当前会话标题。 */
  useEffect(() => {
    document.title =
      title === undefined ? productTitle : `${title} — ${productTitle}`;
    return () => {
      document.title = productTitle;
    };
  }, [productTitle, title]);
  return null;
}
