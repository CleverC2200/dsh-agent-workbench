/** Layout replacement for unmodified DSH, with native conversation composition. */
/** 未改动 DSH 业务的布局替换层：把工作台页面与原生 Conversation 组合到同一框架中。端到端链路为：Host 通过认证连接提供配置，客户端创建工作区和 Session，注册布局/工作台服务，最后由 root 插槽驱动界面，主题由宿主 ui-theme 统一投影。 */
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import type {} from "@deepseek-ai/dsh-client-ui-workspace/client";
import type {} from "@deepseek-ai/dsh-client-ui-theme/client";
import type { HostObservable } from "@deepseek-ai/dsh-client-ui-slots";
import type { PanelInfo } from "./service.ts";
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type { IWorkspaces } from "@deepseek-ai/dsh-api-workspace-controller/client";
import type { ISessions } from "@deepseek-ai/dsh-api-session-controller/client";
import { WorkbenchController, type AgentWorkbench } from "./workbench.ts";
import { AppFrame } from "./AppFrame.tsx";
import { createLayoutStore } from "./stores.ts";
import { LayoutController } from "./service.ts";
/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
/** 必需服务（Cordis fiber 注入；加载器会把模块导出整体作为对象插件传入）。 */
export const inject = [
  "slots",
  "uiSession",
  "theme",
  "locale",
  "sessions",
  "remote",
  "remote.session",
  "workspaces",
];

/**
 * Client plugin body: provide ctx.layout, then one register() call — AppFrame
 * into 'root' with the four child-slot declarations, the layout store seat,
 * and the shared root instance supplying commands and the panel-info source.
 * @param ctx - client root context.
 * 客户端插件入口：创建共享 store、布局控制器和工作台控制器，向其他插件提供服务，并一次注册 root 及其四类子插槽。
 * @param ctx - 客户端根上下文；用于读取 DSH 服务、注册插槽和监听主题。
 */
export function apply(ctx: ClientContext): void {
  // 生命周期：effect 建立所有客户端资源；清理函数按逆向依赖释放服务、插槽和控制器。
  ctx.effect(() => {
    const handle = createLayoutStore();
    const instance = handle.create();
    const store: typeof handle = { ...handle, create: () => instance };
    // 主面板注册变化时同步保留有效选择；已卸载的面板会回退到原生 Conversation。
    const retainMainPanels = (): void => {
      const registered = ctx.slots
          .entries("main")
          .flatMap((entry) =>
            entry.options.key === undefined ? [] : [entry.options.key],
          );
      instance.actions.retainMainPanels(registered);
      workbench.restoreRegistered(registered);
    };
    // 将 store 的面板快照包装成 root slot 可订阅的数据源，供宿主组件响应选择变化。
    const panelInfo: HostObservable<PanelInfo> = {
      getSnapshot: () => instance.getSnapshot().panelInfo,
      subscribe: (listener) => instance.subscribe(listener),
    };
    const layout = new LayoutController(instance.actions, (id) =>
      ctx.slots.entries("main").some((entry) => entry.options.key === id),
      panelInfo,
    );
    const disposePanelInfo = ctx.slots.provideRoot({ hooks: { panelInfo } });
    const workspaces = ctx.get("workspaces") as unknown as IWorkspaces;
    const sessions = ctx.get("sessions") as unknown as ISessions;
    let storage: Storage | undefined;
    try {
      storage = window.sessionStorage;
    } catch {
      /* Privacy settings can deny browser storage. */
      /* 隐私设置可能禁止浏览器存储；此时工作台关联只保留在内存中。 */
    }
    const workbench = new WorkbenchController({
      storage,
      // 创建链路：读取 Host 的绝对工作区配置 → 创建 workspace → 创建带 preset 的 Session。
      create: async (preset) => {
        const response = await fetch("/api/agent-workbench/config", {
          credentials: "same-origin",
        });
        if (!response.ok)
          throw new Error(
            `Workbench configuration unavailable: ${response.status}`,
          );
        const config: unknown = await response.json();
        if (
          !config ||
          typeof config !== "object" ||
          !("cwd" in config) ||
          typeof config.cwd !== "string"
        )
          throw new Error("Invalid workbench configuration");
        const workspace = await workspaces.create({ path: config.cwd });
        const result = await ctx.remote.session.create({
          workspaceId: workspace.workspaceId,
          agentPreset: preset,
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
      available: (id) => sessions.list.getSnapshot().byId[id] !== undefined,
      presetOf: (id) => {
        const value = sessions.list.getSnapshot().byId[id]?.projectionValues?.agentPreset;
        return typeof value === "string" ? value : undefined;
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
      showConversation: (id) => layout.registerConversationPanel(id),
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
          "shell.overlay": { kind: "list", scope: "root" },
        },
        store,
      },
      AppFrame,
    );
    const disposePanels = ctx.slots.subscribe("main", retainMainPanels);
    retainMainPanels();
    // 卸载顺序：先停止控制器并取消订阅，再异步完成 reflect 服务注销。
    return () => {
      workbench.dispose();
      layout.dispose();
      disposePanels();
      disposeRegistration();
      disposePanelInfo();
      // provide()'s disposer settles asynchronously; teardown is synchronous fire-and-forget.
      void disposeService();
      void disposeWorkbench();
    };
  }, "ui-layout: service + root registration");

}

declare module "@deepseek-ai/cordis" {
  /** 向 Cordis 上下文声明由本插件提供的工作台服务类型。 */
  interface Context {
    agentWorkbench: AgentWorkbench;
  }
}
