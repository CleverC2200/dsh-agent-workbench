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
