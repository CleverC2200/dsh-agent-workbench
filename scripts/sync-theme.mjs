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
// This resource owns flat rules and one six-digit page color per theme selector.
const selectors = { "html body": "LIGHT", "html body[data-ds-dark-theme]": "DARK" };
const pageColors = {};
const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
if (stripped.replace(/([^{}]+)\{([^{}]*)\}/g, "").trim())
  throw Error("theme/tokens.css: expected flat theme rules");
for (const [, selector, declarations] of rules) {
  const entries = declarations.split(";").map(value => value.trim())
    .filter(value => /^--workbench-page\s*:/.test(value));
  if (!entries.length) continue;
  const key = selector.trim().replace(/\s+/g, " ");
  const mode = Object.hasOwn(selectors, key) ? selectors[key] : undefined;
  if (!mode || entries.length !== 1 || pageColors[mode])
    throw Error(`theme/tokens.css: expected one page color for each theme, got ${key}`);
  const color = entries[0].match(/^--workbench-page\s*:\s*(#[\da-f]{6})$/i)?.[1];
  if (!color) throw Error(`theme/tokens.css: invalid page color for ${key}`);
  pageColors[mode] = color;
}
if (!pageColors.LIGHT || !pageColors.DARK)
  throw Error("theme/tokens.css: missing light or dark page color");
const bootPath = resolve(core, "packages/client/ui-theme/src/boot-theme.ts");
const boot = await readFile(bootPath, "utf8");
const bootMatches = { LIGHT: 0, DARK: 0 };
const syncedBoot = boot.replace(/const (LIGHT|DARK)_BACKGROUND = '[^']+'/g, (_, mode) => {
  bootMatches[mode]++;
  return `const ${mode}_BACKGROUND = '${pageColors[mode]}'`;
});
if (bootMatches.LIGHT !== 1 || bootMatches.DARK !== 1) throw Error("DSH boot palette declarations changed; review the adapter before syncing");
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
