import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
test("base query errors remain explicit and refresh discards a late old response", async () => {
  const result = await build({
    entryPoints: [
      "business/inventory-aqkc/source/inventory-light-plugins/src/native/api.ts",
    ],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    define: { PLUGIN_ID: '"aqkc"' },
    plugins: [
      {
        name: "host-fixture",
        setup(api) {
          api.onResolve(
            { filter: /(aqkc-engine|\/data|channel\.js|\/context)$/ },
            (a) => ({ path: a.path, namespace: "fixture" }),
          );
          api.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
            contents: a.path.includes("aqkc-engine")
              ? "export const load=(...args)=>globalThis.fixture.load(...args);"
              : a.path.endsWith("/context")
                ? "export const updateContext=(key,value)=>globalThis.fixture.updates.push({key,value});"
                : a.path.endsWith("/data")
                  ? "export const clearReadCache=()=>{};"
                  : "export const ready=Promise.resolve();",
          }));
        },
      },
    ],
  });
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  globalThis.fixture = {
    updates: [],
    load: async () => {
      throw Error("AGENT_ACCESS_DENIED");
    },
  };
  const api = await import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].text).toString("base64")
  );
  try {
    await api.mountBusinessFetch();
    const denied = await window.fetch("/api/inventory/dashboard");
    assert.equal(denied.status, 503);
    const error = await denied.json();
    assert.match(error.error, /AGENT_ACCESS_DENIED/);
    assert.equal(error.sampleFallback, false);
    assert.equal(error.workspace, undefined);
    let complete;
    let signal;
    fixture.load = (_ref, _op, requestSignal) => {
      signal = requestSignal;
      return new Promise((resolve) => (complete = resolve));
    };
    const old = window.fetch("/api/inventory/dashboard");
    await Promise.resolve();
    window.dispatchEvent(new Event("light-refresh"));
    assert.equal(signal.aborted, true);
    complete({ kpis: [{ value: "obsolete" }] });
    await assert.rejects(old, /abort/i);
    assert.equal(fixture.updates.length, 0);
    fixture.load = async () => ({ kpis: [{ value: "fresh" }] });
    const recovered = await window.fetch("/api/inventory/dashboard");
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).workspace.kpis[0].value, "fresh");
    assert.equal(fixture.updates.length, 0, "query results are published only by the current page owner");
    await assert.rejects(
      window.fetch("https://external.invalid/api/inventory/dashboard"),
      /数据访问/,
    );
  } finally {
    globalThis.window = previousWindow;
    delete globalThis.fixture;
  }
});
