/** Authenticated deployment settings for the browser workbench. */
/** Host owns safe package HTML presentation and deployment metadata over official authenticated Fetch. */
import { isAbsolute } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-connection";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { HtmlPages, type WorkbenchPages } from "./html-pages.ts";
export const inject = ["connection"];
/** The workspace directory used for new business Sessions. */
/** 新业务 Session 使用的工作区目录；必须是绝对路径，避免部署环境中的相对路径歧义。 */
export interface Config {
  cwd: string;
  htmlRoots?: readonly string[];
}
/** Publish configuration through the normal authenticated DSH connection. */
/** 通过 DSH 的标准认证连接发布配置；请求只返回配置，不写入业务数据，响应禁止缓存以避免跨用户复用。 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  // Fail before publishing configuration if the explicit workspace path is invalid.
  if (!config || typeof config.cwd !== "string" || !isAbsolute(config.cwd))
    throw new Error("agent-workbench: cwd must be absolute");
  const pages = new HtmlPages(await readFile(new URL("./theme/tokens.css", import.meta.url), "utf8"),()=>readFile(new URL("./page-picker.js",import.meta.url),"utf8"));
  if (config.htmlRoots?.some(root => typeof root !== "string" || !isAbsolute(root))) throw Error("INVALID_WORKBENCH_HTML_ROOTS");
  await pages.registerHtml([
    fileURLToPath(new URL("./samples/", import.meta.url)),
    ...["regional", "category", "mps"].map(id => fileURLToPath(new URL(`./static/${id}/`, import.meta.url))),
    ...(config.htmlRoots ?? ["fc", "aqkc"].map(id => fileURLToPath(new URL(`./business/inventory-${id}/`, import.meta.url)))),
  ]);
  ctx.provide("workbenchPages", pages);
  ctx.effect(() => ctx.connection.fetch.register({
    path: "/api/agent-workbench/theme.css", methods: ["GET"], requestBody: "buffered",
    fetch: async () => new Response(await readFile(new URL("./theme/tokens.css", import.meta.url), "utf8"), { headers: {"Content-Type":"text/css; charset=utf-8", "Cache-Control":"no-store"} }),
  }));
  ctx.effect(() => ctx.connection.fetch.register({
    path: "/api/agent-workbench/pages", methods: ["GET"], requestBody: "buffered",
    fetch: async () => Response.json(pages.list(), { headers: { "Cache-Control": "no-store" } }),
  }));
  ctx.effect(() => ctx.connection.fetch.register({
    path: "/api/agent-workbench/html", methods: ["GET"], requestBody: "buffered",
    fetch: request => pages.fetch(request),
  }));
  ctx.effect(() =>
    ctx.connection.fetch.register({
      path: "/api/agent-workbench/config",
      methods: ["GET"],
      requestBody: "buffered",
      // Read-only deployment metadata; static presentation does not use it to create Sessions.
      fetch: async () =>
        Response.json(
          { cwd: config.cwd },
          { headers: { "Cache-Control": "no-store" } },
        ),
    }),
  );
}

declare module "@deepseek-ai/cordis" {
  interface Context { workbenchPages: WorkbenchPages; }
}
export type { HtmlPackage, WorkbenchPages } from "./html-pages.ts";
