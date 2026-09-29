/** Build the migrated page; Agent resources are assembled from their owning package. */
import { build } from "esbuild";
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "..");
const resource = resolve(root, "business/inventory-fc");
const source = resolve(resource, "source");
const ui = resolve(source, "inventory-light-plugins");
const resolver = createRequire(resolve(ui, "package.json"));
const result = await build({
  entryPoints: [resolve(ui, "src/native/entry.tsx")],
  outfile: "inventory-fc.js",
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
    PLUGIN_ID: '"fc"',
    PLUGIN_TITLE: '"分仓库存"',
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
        api.onResolve(
          { filter: /^react(?:\/|$)|^react-dom(?:\/|$)|^clsx$|^zod(?:\/|$)/ },
          (a) => ({ path: resolver.resolve(a.path) }),
        );
        api.onResolve({ filter: /^@business-page$/ }, () => ({
          path: resolve(ui, "src/pages/fc.tsx"),
        }));
        api.onResolve({ filter: /^@business-style$/ }, () => ({
          path: resolve(ui, "src/dsh-ui/base.css"),
        }));
        api.onResolve({ filter: /^\.\.?\/engine$/ }, () => ({
          path: resolve(ui, "src/fc-engine.ts"),
        }));
        api.onResolve(
          {
            filter:
              /(^|\/)(database|business-database|gea-sql|planning-store|workbench-sql-client|workbench-sql-executor|gea-sql-client)(\.ts)?$/,
          },
          () => ({ path: resolve(ui, "src/data.ts") }),
        );
        api.onResolve({ filter: /^node:crypto$/ }, () => ({
          path: resolve(ui, "src/browser-crypto.ts"),
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
          api.resolve(resolve(source, "fc/src", a.path.slice(2)), {
            kind: a.kind,
          }),
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
const code = result.outputFiles.find((f) => f.path.endsWith(".js")).text.replace(/^[ \t]+$/gm, "");
const styles = result.outputFiles
  .filter((f) => f.path.endsWith(".css"))
  .map((f) => f.text)
  .join("\n");
const theme = await readFile(resolve(root, "theme/tokens.css"), "utf8");
const adapter = await readFile(resolve(resource, "theme.css"), "utf8");
const out = resolve(root, "lib/business/inventory-fc");
await mkdir(out, { recursive: true });
await writeFile(
  resolve(out, "index.html"),
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>分仓库存</title><style>' +
    styles +
    "\n" +
    theme +
    "\n" +
    adapter +
    '</style><body><main id="app"></main><script>' +
    code.replace(/<\/script/gi, "<\\/script") +
    "</script></body></html>",
);
for (const file of ["plugin.json", "page.json"])
  await cp(resolve(resource, file), resolve(out, file));
const agentRoot = resolve(
  root,
  "../dsh-agent-manage/business-resources/inventory-fc",
);
for (const file of ["capability.json", "prompt.json", "mcp.json", "skills"])
  await cp(resolve(agentRoot, file), resolve(out, file), { recursive: true });
const inputs = {};
for (const input of Object.keys(result.metafile.inputs)) {
  if (input.includes("node_modules/")) continue;
  const path = resolve(input);
  if (!path.startsWith(resource + "/")) continue;
  inputs[path.slice(resource.length + 1)] = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}
await writeFile(
  resolve(out, "build-inputs.json"),
  JSON.stringify(
    { sourceCommit: "906b3b08947b71cecf627073c0b0e9a389b692bf", inputs },
    null,
    2,
  ) + "\n",
);
console.log(
  "Built inventory-fc from workbench source and Agent Manage resources",
);
