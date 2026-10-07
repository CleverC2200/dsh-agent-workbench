import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { registerHtmlPlugins } from "../../../../clean-core-rewrite-42/integration/dsh-gea-plugin/src/html-plugins.ts";

test("the delivered personal package registers under the current GEA mock contract without a live Consumer", async (t) => {
  const definitions = new Map(),
    pages = new Map(),
    cleanups = [],
    surfaces = new Map(),
    identities = new Map();
  const ctx = {
    effect(fn) {
      const off = fn();
      if (typeof off === "function") cleanups.push(off);
    },
    agentResources: {
      register: async (entries) => {
        for (const item of entries) definitions.set(item.id, item);
        return async () => {
          for (const item of entries) definitions.delete(item.id);
        };
      },
    },
    connection: { fetch: { register: () => () => {} } },
    workbenchPages: {
      registerBusinessPage(page, authorize) {
        pages.set(page.id, authorize);
        return () => pages.delete(page.id);
      },
    },
  };
  const business = {
    status: () => ({ authenticated: false }),
    pageSessionScope: () => undefined,
    setSurface: (id, v) => {
      surfaces.set(id, v);
      return v;
    },
    surfaceFor: (id) => surfaces.get(id),
    clearSurface: (id) => surfaces.delete(id),
    touchPageIdentity: (id, v) => identities.set(id, v),
    currentPageIdentity: (id) => identities.get(id),
    clearPageIdentity: (id) => identities.delete(id),
    htmlLaunch() {
      assert.fail("personal reception must not launch a live Consumer");
    },
    pluginSql() {
      assert.fail("personal reception must not read SQL");
    },
  };
  const directory = resolve("lib/business/inventory-personal");
  const manifest = JSON.parse(
    await readFile(resolve(directory, "plugin.json"), "utf8"),
  );
  t.after(async () => {
    for (const off of cleanups.reverse()) await off();
  });
  await registerHtmlPlugins(ctx, business, [
    { directory, htmlPath: resolve(directory, "index.html"), manifest },
  ]);
  assert.equal(manifest.mode, "mock");
  assert.equal(Object.hasOwn(manifest, "mock"), false);
  assert.deepEqual(
    JSON.parse(await readFile(resolve(directory, "mcp.json"), "utf8"))
      .capabilities,
    [],
  );
  assert.equal(definitions.has("gea-html-inventory-personal"), true);
  const authorize = pages.get("inventory-personal");
  assert.ok(authorize);
  try {
    const grant = await authorize(
      "session-11111111-1111-4111-8111-111111111111",
      "gea-html-inventory-personal",
      new AbortController().signal,
    );
    assert.equal(grant.access.mode, "mock");
    await assert.rejects(
      grant.readSql({}, new AbortController().signal),
      /MOCK_DATA_ONLY/,
    );
    grant.release();
  } catch (error) {
    assert.match(error.message, /HIDDEN|RETIRED|DISABLED/);
  }
});
