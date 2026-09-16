/** Authenticated deployment settings for the browser workbench. */
/** 浏览器工作台的认证部署配置。Host 端校验绝对工作区路径，并通过 DSH 的认证连接暴露只读 GET；客户端随后用该路径创建新业务 Session。 */
import { isAbsolute } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-connection";
export const inject = ["connection"];
/** The workspace directory used for new business Sessions. */
/** 新业务 Session 使用的工作区目录；必须是绝对路径，避免部署环境中的相对路径歧义。 */
export interface Config {
  cwd: string;
}
/** Publish configuration through the normal authenticated DSH connection. */
/** 通过 DSH 的标准认证连接发布配置；请求只返回配置，不写入业务数据，响应禁止缓存以避免跨用户复用。 */
export function apply(ctx: Context, config: Config): void {
  // 部署期先失败，确保错误配置不会注册一个看似可用但无法创建 Session 的接口。
  if (!config || typeof config.cwd !== "string" || !isAbsolute(config.cwd))
    throw new Error("agent-workbench: cwd must be absolute");
  ctx.effect(() =>
    ctx.connection.fetch.register({
      path: "/api/agent-workbench/config",
      methods: ["GET"],
      requestBody: "buffered",
      // GET 动作返回固定部署配置；客户端以同源凭据调用，Cache-Control 防止配置被缓存到其他会话。
      fetch: async () =>
        Response.json(
          { cwd: config.cwd },
          { headers: { "Cache-Control": "no-store" } },
        ),
    }),
  );
}
