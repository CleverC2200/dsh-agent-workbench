/** Layout replacement for unmodified DSH, with native conversation composition. */
/** 未改动 DSH 业务的布局替换层：把工作台页面与原生 Conversation 组合到同一框架中。端到端链路为：Host 通过认证连接提供配置，客户端创建工作区和 Session，注册布局/工作台服务，最后由 root 插槽和主题 presenter 驱动界面。 */
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import { type AgentWorkbench } from "./workbench.ts";
/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
/** 必需服务（Cordis fiber 注入；加载器会把模块导出整体作为对象插件传入）。 */
export declare const inject: string[];
/**
 * Client plugin body: provide ctx.layout, then one register() call — AppFrame
 * into 'root' with the four child-slot declarations, the layout store seat,
 * and the shared root instance supplying commands and the panel-info source.
 * @param ctx - client root context.
 * 客户端插件入口：创建共享 store、布局控制器和工作台控制器，向其他插件提供服务，并一次注册 root 及其四类子插槽。
 * @param ctx - 客户端根上下文；用于读取 DSH 服务、注册插槽和监听主题。
 */
export declare function apply(ctx: ClientContext): void;
declare module "@deepseek-ai/cordis" {
    /** 向 Cordis 上下文声明由本插件提供的工作台服务类型。 */
    interface Context {
        agentWorkbench: AgentWorkbench;
    }
}
