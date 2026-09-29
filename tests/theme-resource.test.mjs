import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

test("theme sync rejects stylesheet and first-paint drift", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "workbench-theme-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = join(root, "packages/client/ui-theme");
  await mkdir(join(target, "src/styles"), { recursive: true });
  await writeFile(join(target, "package.json"), JSON.stringify({ name: "@deepseek-ai/dsh-client-ui-theme" }));
  const boot = join(target, "src/boot-theme.ts");
  await writeFile(boot, "const LIGHT_BACKGROUND = '#fff'\nconst DARK_BACKGROUND = '#111'\n");
  const sync = (...args) => execFileSync(process.execPath, ["scripts/sync-theme.mjs", "--core", root, ...args], { stdio: "pipe" });
  sync();
  sync("--check");
  const generated = join(target, "src/styles/workbench-theme.css");
  await writeFile(generated, "/* drift */");
  assert.throws(() => sync("--check"), /Shared theme drift/);
  sync();
  await writeFile(boot, (await readFile(boot, "utf8")).replace("#f7f8fa", "#000000"));
  assert.throws(() => sync("--check"), /boot palette drift/);
  sync();
  sync("--check");
  assert.match(await readFile(boot, "utf8"), /LIGHT_BACKGROUND = '#f7f8fa'/);
});

test("reordering theme rules preserves the light and dark boot palette", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "workbench-theme-order-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const script = await readFile("scripts/sync-theme.mjs", "utf8");
  const css = await readFile("theme/tokens.css", "utf8");
  const light = css.match(/html body \{[^}]*\}/)[0];
  const dark = css.match(/html body\[data-ds-dark-theme\] \{[^}]*\}/)[0];
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, "theme"));
  await writeFile(join(root, "scripts/sync-theme.mjs"), script);
  const target = join(root, "core/packages/client/ui-theme");
  await mkdir(join(target, "src/styles"), { recursive: true });
  await writeFile(join(target, "package.json"), JSON.stringify({ name: "@deepseek-ai/dsh-client-ui-theme" }));
  const boot = join(target, "src/boot-theme.ts");
  const initial = "const LIGHT_BACKGROUND = '#f7f8fa'\nconst DARK_BACKGROUND = '#1b1d21'\n";
  await writeFile(boot, initial);
  const sync = (...args) => execFileSync(process.execPath, [join(root, "scripts/sync-theme.mjs"), "--core", join(root, "core"), ...args], { stdio: "pipe" });
  await writeFile(join(root, "theme/tokens.css"), css.replace(light, "__LIGHT__").replace(dark, light).replace("__LIGHT__", dark));
  sync();
  sync("--check");
  assert.equal(await readFile(boot, "utf8"), initial);
  for (const invalid of [
    css.replace(light, ""),
    css + light,
    css.replace("--workbench-page: #f7f8fa;", "--workbench-page: #f7f8fa; --workbench-page: #000000;"),
    css.replace("#f7f8fa", "var(--other)"),
    css.replace("html body {", "html main {"),
    `@media (prefers-color-scheme: dark) { ${css} }`,
  ]) {
    await writeFile(join(root, "theme/tokens.css"), invalid);
    assert.throws(() => sync(), /theme\/tokens.css:/);
    assert.equal(await readFile(boot, "utf8"), initial);
  }
  await writeFile(join(root, "theme/tokens.css"), css);
  await writeFile(boot, initial.replace("DARK_BACKGROUND", "LIGHT_BACKGROUND"));
  assert.throws(() => sync(), /boot palette declarations changed/);
});
