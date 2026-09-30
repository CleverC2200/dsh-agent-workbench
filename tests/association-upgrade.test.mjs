import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

test("offline association conversion preserves Session IDs and leaves the original export untouched", async t => {
  const dir = await mkdtemp(join(tmpdir(), "workbench-upgrade-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = join(dir, "input.json"), output = join(dir, "output.json");
  const rows = [["mock", "a", [["a", "session-00000000-0000-0000-0000-000000000001"]]], ["business", "a", [["a", "session-00000000-0000-0000-0000-000000000002"]], "known-scope"]];
  const original = JSON.stringify(rows);
  await writeFile(input, original);
  execFileSync(process.execPath, ["scripts/upgrade-workbench-associations.mjs", input, output]);
  assert.equal(await readFile(input, "utf8"), original);
  assert.deepEqual(JSON.parse(await readFile(output, "utf8")), [rows[0].concat(null), rows[1]]);
  assert.throws(() => execFileSync(process.execPath, ["scripts/upgrade-workbench-associations.mjs", input, output], { stdio: "ignore" }));
  assert.equal(await readFile(input, "utf8"), original);
});
