/** Build the migrated page; Agent resources are assembled from their owning package. */
import { build } from "esbuild";
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "..");
export async function buildInventory(id, sourceCommit) {
  const resource = resolve(root, `business/inventory-${id}`);
  const source = resolve(resource, "source");
  const ui = resolve(source, "inventory-light-plugins");
  const manifest = JSON.parse(
    await readFile(resolve(resource, "plugin.json"), "utf8"),
  );
  const computeRoot = resolve(root, "../dsh-agent-manage");
  let computeExport;
  const resolver = createRequire(resolve(id === "personal" ? root : ui, "package.json"));
  const result = await build({
    entryPoints: [resolve(ui, id === "personal" ? "src/personal/entry.tsx" : "src/native/entry.tsx")],
    outfile: `inventory-${id}.js`,
    bundle: true,
    write: false,
    minify: true,
    metafile: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    target: ["chrome110", "safari16"],
    loader: { ".module.css": "local-css" },
    define: {
      PLUGIN_ID: JSON.stringify(id),
      PLUGIN_TITLE: JSON.stringify(manifest.name),
      DSH_COLUMNAR_SQL: "false",
      DSH_GOVERNED_SQL: "false",
      "process.env": JSON.stringify({
        NEXT_PUBLIC_APP_MODE: "gea",
        WORKBENCH_SQL_MODE: "gea",
      }),
    },
    plugins: [
      {
        name: "inventory-browser",
        setup(api) {
          api.onResolve({filter:/^dsh-agent-manage\/inventory-compute\/[a-z-]+$/}, async a => {
            computeExport ??= JSON.parse(await readFile(resolve(computeRoot,"package.json"),"utf8")).exports["./inventory-compute/*"];
            if (computeExport?.source !== "./src/inventory-compute/*.ts") throw Error("MANAGE_COMPUTE_PUBLIC_EXPORT_MISMATCH");
            return {path:resolve(computeRoot,computeExport.source.replace("*",a.path.split("/").at(-1)))};
          });
          api.onResolve(
            { filter: /^react(?:\/|$)|^react-dom(?:\/|$)|^clsx$|^zod(?:\/|$)/ },
            (a) => ({ path: resolver.resolve(a.path) }),
          );
          api.onResolve({ filter: /^@business-page$/ }, () => ({
            path: resolve(ui, id === "dealer" ? "src/native/dealer.tsx" : `src/pages/${id}.tsx`),
          }));
          api.onResolve({ filter: /^@business-style$/ }, () => ({
            path: resolve(ui, "src/dsh-ui/base.css"),
          }));
          api.onResolve({ filter: /^\.\.?\/engine$/ }, () => ({
            path: resolve(ui, `src/${id}-engine.ts`),
          }));
          api.onResolve(
            {
              filter:
                /(^|\/)(database|business-database|gea-sql|planning-store|workbench-sql-client|workbench-sql-executor|gea-sql-client|dealer-direct-sql-client)(\.ts)?$/,
            },
            () => ({ path: resolve(ui, "src/data.ts") }),
          );
          api.onResolve({ filter: /^node:crypto$/ }, () => ({
            path: resolve(root, "business/shared/browser-crypto.ts"),
          }));
          api.onResolve({ filter: /^node:(fs|path)$/ }, () => ({
            path: resolve(ui, "src/no-server.ts"),
          }));
          api.onResolve({ filter: /^server-only$/ }, () => ({
            path: "empty",
            namespace: "empty",
          }));
          api.onLoad({ filter: /.*/, namespace: "empty" }, () => ({
            contents: "export {};",
          }));
          api.onResolve({ filter: /^@\// }, (a) =>
            api.resolve(
              resolve(
                source,
                id === "fc" ? "fc/src" : id === "qll" ? "qll/src" : `${id}/web/src`,
                a.path.slice(2),
              ),
              {
                kind: a.kind, resolveDir: source,
              },
            ),
          );
        },
      },
    ],
  });
  if (
    Object.keys(result.metafile.inputs).some((p) =>
      /node_modules\/(pg|next|fastify|express)\//.test(p),
    )
  )
    throw Error("SERVER_DEPENDENCY_IN_PAGE");
  const code = result.outputFiles
    .find((f) => f.path.endsWith(".js"))
    .text.replace(/^[ \t]+$/gm, "");
  const styles = result.outputFiles
    .filter((f) => f.path.endsWith(".css"))
    .map((f) => f.text)
    .join("\n");
  const theme = await readFile(resolve(root, "theme/tokens.css"), "utf8");
  const adapter = await readFile(resolve(resource, "theme.css"), "utf8");
  const out = resolve(root, `lib/business/inventory-${id}`);
  await mkdir(out, { recursive: true });
  await writeFile(
    resolve(out, "index.html"),
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
      manifest.name +
      (id === "qll" ? "</title><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'\"><style>" : "</title><style>") +
      styles +
      "\n" +
      theme +
      "\n" +
      adapter +
      '</style><body>' + (id === "qll" ? '<aside role="note" style="padding:12px;background:#fff7e8;color:#8a4800">全链库存分布 · 固定模拟输入 · 不代表真实数据、行权限或模型结果。公司件数与客户箱数分列，禁止混算。</aside>' : '') + '<main id="app"></main><script>' +
      code.replace(/<\/script/gi, "<\\/script") +
      "</script></body></html>",
  );
  for (const file of ["plugin.json", "page.json"])
    await cp(resolve(resource, file), resolve(out, file));
  const agentRoot = resolve(
    root,
    `../dsh-agent-manage/business-resources/inventory-${id}`,
  );
  for (const file of ["capability.json", "prompt.json", "mcp.json", "skills"])
    await cp(resolve(agentRoot, file), resolve(out, file), { recursive: true });
  const inputs = {};
  for (const input of Object.keys(result.metafile.inputs)) {
    if (input.includes("node_modules/")) continue;
    const path = resolve(input);
    if (
      !path.startsWith(resource + "/") &&
      !path.startsWith(resolve(root, "business/shared") + "/") &&
      !path.startsWith(resolve(computeRoot,"src/inventory-compute") + "/")
    )
      continue;
    inputs[
      path.startsWith(resource + "/")
        ? path.slice(resource.length + 1)
        : path.startsWith(computeRoot+"/") ? "../dsh-agent-manage/"+path.slice(computeRoot.length+1) : "../shared/" + path.split("/shared/")[1]
    ] = createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  }
  if(computeExport) inputs["../dsh-agent-manage/package.json"] = createHash("sha256").update(await readFile(resolve(computeRoot,"package.json"))).digest("hex");
  await writeFile(
    resolve(out, "build-inputs.json"),
    JSON.stringify({ sourceCommit, ...(computeExport?{computeOwner:"dsh-agent-manage", computePublicExport:"./inventory-compute/*"}:{}), inputs }, null, 2) + "\n",
  );
  console.log(
    `Built inventory-${id} from Workbench source and Manage resources`,
  );
}
