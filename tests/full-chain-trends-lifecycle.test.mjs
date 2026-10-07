import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import React from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

test("actual trend panel switches analysis, keeps missing days and zeros, withdraws scope changes, errors, cancelled and late results", async () => {
  const dom = new JSDOM('<div id="app"></div>');
  const saved = new Map(
    ["window", "document", "fetch", "IS_REACT_ACT_ENVIRONMENT"].map((k) => [
      k,
      Object.getOwnPropertyDescriptor(globalThis, k),
    ]),
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const ui = resolve(
    "business/inventory-qll/source/inventory-light-plugins/src",
  );
  const built = await build({
    stdin: {
      contents: `export {FullChainTrends,trendView} from '${ui}/pages/qll/components/full-chain-trends.tsx';export {trendSegments} from '${ui}/dsh-ui/chart.tsx';export {pageContext,clearContext} from '${ui}/native/context.ts';`,
      loader: "ts",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    loader: { ".css": "empty" },
    plugins: [
      {
        name: "channel",
        setup(api) {
          api.onResolve({ filter: /\.css$/ }, () => ({
            path: "style",
            namespace: "fixture",
          }));
          api.onResolve({ filter: /channel\.js$/ }, () => ({
            path: "channel",
            namespace: "fixture",
          }));
          api.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
            contents:
              a.path === "style"
                ? "export default {};"
                : "export const publish=async()=>{}; export const reportElements=(key,elements)=>{globalThis.trendCatalog ??= new Map();globalThis.trendCatalog.set(key,elements);return()=>globalThis.trendCatalog.delete(key);};",
          }));
        },
      },
    ],
  });
  await mkdir(".runtime", { recursive: true });
  const file = resolve(".runtime/full-chain-trends-test.mjs");
  await writeFile(file, built.outputFiles[0].text);
  const api = await import(pathToFileURL(file));
  const root = createRoot(document.getElementById("app"));
  const workspace = {
    workspaceId: "W1",
    scope: "company",
    filters: { month: "2026-09", sku: "S1" },
    freshness: {},
    coverage: {},
    structure: [{ layer: "base", objectName: "华东", objectId: "华东" }],
  };
  let filters = { category: "食品", org: JSON.stringify(["base", "华东"]) };
  const trends = {
    inventory: [
      { snapshotDate: "2026-09-28", layer: "base", qty: 10 },
      { snapshotDate: "2026-09-30", layer: "base", qty: 0 },
    ],
    orders: [{ snapshotDate: "2026-09-30", demandQty: 100, shortageQty: 12 }],
    aging: [],
    historyPoints: 2,
  };
  const response = () =>
    Response.json({
      dataMode: "MOCK_DATA_ONLY",
      workspaceId: workspace.workspaceId,
      scope: workspace.scope,
      filters: {
        ...workspace.filters,
        category: filters.category,
        base: "华东",
      },
      generatedAt: "2026-09-30T01:00:00Z",
      trends,
    });
  const render = () =>
    React.act(async () =>
      root.render(
        React.createElement(api.FullChainTrends, {
          key: JSON.stringify([workspace.workspaceId, filters]),
          workspace,
          filters,
        }),
      ),
    );
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    );
  const click = (text) => React.act(async () => button(text).click());
  try {
    let sent;
    globalThis.fetch = async (_url, init) => {
      sent = JSON.parse(init.body);
      return response();
    };
    await render();
    assert.equal(api.pageContext().parts.trendView.state, "idle");
    await click("查询趋势");
    assert.deepEqual(sent, {
      workspaceId: "W1",
      filters: { category: "食品", base: "华东" },
    });
    const context = api.pageContext().parts.trendView;
    assert.equal(context.state, "ready");
    assert.equal(globalThis.trendCatalog.get("chain-trend").length, 1);
    assert.match(
      globalThis.trendCatalog.get("chain-trend")[0].value,
      /固定模拟/,
    );
    const firstReference = globalThis.trendCatalog.get("chain-trend")[0].id;
    assert.equal(context.data.length, 30);
    assert.equal(context.data[28].base, null);
    assert.equal(context.data[29].base, 0);
    assert.deepEqual(
      api.trendSegments(context.data, "base").map((s) => s.length),
      [1, 1],
    );
    await React.act(async () => {
      const select = document.querySelector("select");
      select.value = "orders";
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.equal(api.pageContext().parts.trendView.metric, "orders");
    assert.equal(api.pageContext().parts.trendView.data[29].shortageQty, 12);
    filters = { ...filters, category: "汤圆" };
    await render();
    assert.equal(api.pageContext().parts.trendView.state, "idle");
    assert.equal(api.pageContext().parts.trendView.data, undefined);
    assert.equal(globalThis.trendCatalog.has("chain-trend"), false);
    let finish, signal;
    globalThis.fetch = async (_url, init) => {
      signal = init.signal;
      return new Promise((r) => (finish = r));
    };
    await click("查询趋势");
    assert.equal(api.pageContext().parts.trendView.state, "loading");
    await click("取消查询");
    assert.ok(signal.aborted);
    assert.equal(api.pageContext().parts.trendView.state, "cancelled");
    await React.act(async () => {
      finish(response());
      await Promise.resolve();
    });
    assert.equal(api.pageContext().parts.trendView.state, "cancelled");
    globalThis.fetch = async () =>
      Response.json({ error: "拒绝当前范围" }, { status: 503 });
    await click("查询趋势");
    assert.equal(api.pageContext().parts.trendView.state, "error");
    assert.equal(api.pageContext().parts.trendView.data, undefined);
    assert.match(document.querySelector("[role=alert]").textContent, /拒绝/);
    globalThis.fetch = async () => response();
    await click("重试当前范围");
    assert.equal(api.pageContext().parts.trendView.state, "ready");
    globalThis.fetch = async () => {
      const value = await response().json();
      return Response.json({ ...value, dataMode: "live" });
    };
    await click("查询趋势");
    assert.equal(api.pageContext().parts.trendView.state, "error");
    assert.equal(globalThis.trendCatalog.has("chain-trend"), false);
    globalThis.fetch = async () => response();
    await click("重试当前范围");
    trends.inventory = [];
    trends.orders = [];
    await click("查询趋势");
    assert.match(document.getElementById("app").textContent, /暂无可验证/);
    globalThis.fetch = async (_url, init) => {
      signal = init.signal;
      return new Promise((r) => (finish = r));
    };
    await click("查询趋势");
    workspace.workspaceId = "W2";
    workspace.filters.month = "2026-10";
    await render();
    assert.ok(signal.aborted);
    await React.act(async () => {
      finish(response());
      await Promise.resolve();
    });
    assert.equal(api.pageContext().parts.trendView.state, "idle");
    await React.act(async () => root.unmount());
    assert.equal(api.pageContext().parts.trendView, undefined);
  } finally {
    delete globalThis.trendCatalog;
    api.clearContext();
    dom.window.close();
    for (const [k, v] of saved)
      if (v) Object.defineProperty(globalThis, k, v);
      else delete globalThis[k];
  }
});
