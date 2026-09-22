// src/host.ts
import { isAbsolute } from "node:path";
var inject = ["connection"];
function apply(ctx, config) {
  if (!config || typeof config.cwd !== "string" || !isAbsolute(config.cwd))
    throw new Error("agent-workbench: cwd must be absolute");
  ctx.effect(
    () => ctx.connection.fetch.register({
      path: "/api/agent-workbench/config",
      methods: ["GET"],
      requestBody: "buffered",
      // GET 动作返回固定部署配置；客户端以同源凭据调用，Cache-Control 防止配置被缓存到其他会话。
      fetch: async () => Response.json(
        { cwd: config.cwd },
        { headers: { "Cache-Control": "no-store" } }
      )
    })
  );
}
export {
  apply,
  inject
};
