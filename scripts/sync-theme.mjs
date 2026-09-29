/** Copy the versioned development resource into an explicit DSH source checkout. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { core: { type: "string" }, check: { type: "boolean" } } });
if (!values.core) throw Error("Pass --core <isolated DSH checkout>; add --check to verify without writing");
const core = resolve(values.core);
const manifest = JSON.parse(await readFile(resolve(core, "packages/client/ui-theme/package.json"), "utf8"));
if (manifest.name !== "@deepseek-ai/dsh-client-ui-theme") throw Error("Not a DSH ui-theme source checkout");
const css = await readFile(new URL("../theme/tokens.css", import.meta.url), "utf8");
const pageColors = [...css.matchAll(/--workbench-page:\s*(#[\da-f]{6});/gi)].map(match => match[1]);
if (pageColors.length !== 2) throw Error("Expected one light and one dark page color");
const bootPath = resolve(core, "packages/client/ui-theme/src/boot-theme.ts");
const boot = await readFile(bootPath, "utf8");
let bootMatches = 0;
const syncedBoot = boot.replace(/const (LIGHT|DARK)_BACKGROUND = '[^']+'/g, (_, mode) => {
  bootMatches++;
  return `const ${mode}_BACKGROUND = '${pageColors[mode === "LIGHT" ? 0 : 1]}'`;
});
if (bootMatches !== 2) throw Error("DSH boot palette declarations changed; review the adapter before syncing");
if (values.check) {
  if (boot !== syncedBoot) throw Error("Shared theme boot palette drift; run sync-theme without --check");
} else if (boot !== syncedBoot) await writeFile(bootPath, syncedBoot);
const digest = createHash("sha256").update(css).digest("hex");
const receipt = JSON.stringify({ resource: "dsh-agent-workbench/theme/tokens.css", version: "1.0.0", sha256: digest }, null, 2) + "\n";
for (const [file, content] of [["workbench-theme.css", css], ["workbench-theme.json", receipt]]) {
  const target = resolve(core, "packages/client/ui-theme/src/styles", file);
  if (values.check) {
    if (await readFile(target, "utf8") !== content) throw Error(`Shared theme drift: ${target}; run sync-theme without --check`);
  } else await writeFile(target, content);
}
console.log(`Shared theme 1.0.0 ${digest} ${values.check ? "verified" : "synced"}`);
