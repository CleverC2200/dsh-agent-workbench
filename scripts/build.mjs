import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
await mkdir("lib", { recursive: true });
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
  loader: { ".module.css": "local-css" },
});
const workbenchCode = workbench.outputFiles.find((file) =>
  file.path.endsWith(".js"),
).text;
const workbenchCss =
  workbench.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
await writeFile(
  "lib/client.js",
  `window.__ModuleLoader__.load({id:"@cleverc2200/dsh-agent-workbench",factory:(require)=>{var module={exports:{}};var exports=module.exports;const style=document.createElement("style");style.textContent=${JSON.stringify(workbenchCss)};document.head.append(style);\n${workbenchCode}\nreturn module.exports;}});\n`,
);

execFileSync(process.execPath,["node_modules/typescript/bin/tsc","-p","tsconfig.json"],{stdio:"inherit"});
