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
