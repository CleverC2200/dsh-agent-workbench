import { build } from "esbuild";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
const { values } = parseArgs({options:{target:{type:"string"}}});
if (values.target && values.target !== "core") throw Error("Unsupported build target");
if (process.env.DSH_TYPECHECK_PROJECT === "tsconfig.official.json") await import("./verify-official-input.mjs");
await mkdir("lib", { recursive: true });
await mkdir("lib/theme", { recursive: true });
await copyFile("theme/tokens.css", "lib/theme/tokens.css");
await build({
  entryPoints: ["src/host.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: "lib/host.js",
});
const workbench = await build({
  entryPoints: ["src/client.ts"],
  bundle: true,
  write: false,
  outfile: "client.js",
  format: "cjs",
  platform: "browser",
  target: "es2022",
  external: ["react", "@deepseek-ai/dsh-client-store"],
  loader: { ".module.css": "local-css", ".css": "text" },
});
const workbenchCode = workbench.outputFiles.find((file) =>
  file.path.endsWith(".js"),
).text;
await writeFile(
  "lib/client.js",
  `window.__ModuleLoader__.load({id:"@cleverc2200/dsh-agent-workbench",factory:(require)=>{var module={exports:{}};var exports=module.exports;${workbenchCode}\nreturn module.exports;}});\n`,
);

execFileSync(process.execPath,["node_modules/typescript/bin/tsc","-p",process.env.DSH_TYPECHECK_PROJECT ?? "tsconfig.json","--noEmit","false","--emitDeclarationOnly","true"],{stdio:"inherit"});

await import("./build-html-sample.mjs");
if (values.target !== "core") {
  await import("./build-inventory-fc.mjs");
  await import("./build-inventory-aqkc.mjs");
}
