import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";

async function fixture(t, respond) {
  const controller = new AbortController();
  const calls = [];
  const bundle = await build({
    stdin: {
      contents: 'export * from "./business/inventory-dealer/source/inventory-light-plugins/src/data.ts";',
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [{
      name: "in-memory-sql-transport",
      setup(api) {
        api.onResolve({ filter: /dealer-mock-sql$/ }, () => ({ path: "transport", namespace: "fixture" }));
        api.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'export const readDealerMock=(parameters,options)=>transport("sql",parameters,options);' }));
      },
    }],
  });
  const module = { exports: {} };
  const transport = async (method, parameters, options) => {
    assert.equal(method, "sql");
    options.signal.throwIfAborted();
    calls.push(structuredClone(parameters));
    return respond(parameters, options.signal, controller);
  };
  new Function("require", "module", "exports", "transport", bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports, transport);
  t.after(() => module.exports.clearReadCache());
  return { ...module.exports, calls, controller };
}

test("both row-array interfaces return all 501 rows in stable page order", async t => {
  const f = await fixture(t, ({ pageNo }) => {
    const offset = (pageNo - 1) * 200;
    return { rows: Array.from({ length: Math.min(200, 501 - offset) }, (_, i) => ({ sku: String(offset + i) })), total: 501 };
  });
  for (const read of [f.executeAllGeaSqlPages, f.executeGeaSql]) {
    f.calls.length = 0;
    const rows = await read("SELECT sku FROM fixture ORDER BY sku", { parameters: { customer: "A" } });
    assert.deepEqual(rows.map(row => row.sku), Array.from({ length: 501 }, (_, i) => String(i)));
    assert.deepEqual(f.calls.map(call => call.pageNo), [1, 2, 3]);
    assert.ok(f.calls.every(call => call.pageSize === 200 && call.parameters.customer === "A"));
  }
});

test("empty and exact-page totals finish without an unnecessary next page", async t => {
  for (const total of [0, 200]) {
    const f = await fixture(t, () => ({ rows: Array.from({ length: total }, (_, i) => ({ sku: i })), total }));
    assert.equal((await f.executeAllGeaSqlPages("SELECT sku FROM fixture")).length, total);
    assert.equal(f.calls.length, 1);
  }
});

test("changed permissions/totals, short pages and missing totals never publish partial rows", async t => {
  for (const secondTotal of [1, 202, undefined]) {
    const f = await fixture(t, ({ pageNo }) => ({ rows: Array.from({ length: pageNo === 1 ? 200 : 1 }, (_, i) => ({ sku: i })), total: pageNo === 1 ? 201 : secondTotal }));
    await assert.rejects(f.executeAllGeaSqlPages("SELECT sku FROM fixture"), error => error.code === "GEA_SQL_RESULT_INCOMPLETE");
    assert.equal(f.calls.length, 2);
  }
  const short = await fixture(t, () => ({ rows: [], total: 201 }));
  await assert.rejects(short.executeAllGeaSqlPages("SELECT sku FROM fixture"), error => error.code === "GEA_SQL_RESULT_INCOMPLETE");
  assert.equal(short.calls.length, 1);
});

test("a later-page failure rejects the complete read without returning the first page", async t => {
  const f = await fixture(t, ({ pageNo }) => {
    if (pageNo === 2) throw Error("DATA_PERMISSION_DENIED");
    return { rows: Array.from({ length: 200 }, (_, i) => ({ sku: i })), total: 201 };
  });
  await assert.rejects(f.executeAllGeaSqlPages("SELECT sku FROM fixture"), /当前账号暂无数据权限/);
  assert.equal(f.calls.length, 2);
});

test("changed column permissions reject all pages even when the total stays 201", async t => {
  const f = await fixture(t, ({ pageNo }) => ({
    rows: Array.from({ length: pageNo === 1 ? 200 : 1 }, (_, i) => ({ sku: i })),
    total: 201,
    returnedColumns: pageNo === 1 ? ["sku", "amount"] : ["sku"],
    rejectedColumns: pageNo === 1 ? [] : [{ alias: "amount", reason: "RETURN_PERMISSION_DENIED" }],
  }));
  await assert.rejects(f.executeAllGeaSqlPages("SELECT sku,amount FROM fixture"), error => error.code === "GEA_SQL_RESULT_INCOMPLETE");
  assert.equal(f.calls.length, 2);
});

test("caller cancellation and identity/cache invalidation stop a whole multi-page read", async t => {
  for (const reason of ["caller", "identity"]) {
    let f;
    f = await fixture(t, ({ pageNo }, signal, controller) => {
      if (pageNo === 1) return { rows: Array.from({ length: 200 }, (_, i) => ({ sku: i })), total: 501 };
      if (reason === "caller") controller.abort(); else f.clearReadCache();
      assert.equal(signal.aborted, true);
      return { rows: Array.from({ length: 200 }, (_, i) => ({ sku: 200 + i })), total: 501 };
    });
    await assert.rejects(f.executeAllGeaSqlPages("SELECT sku FROM fixture", { signal: f.controller.signal }), error => error.name === "AbortError");
    assert.equal(f.calls.length, 2);
  }
});
