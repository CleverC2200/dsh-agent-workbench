import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import React from "react";
import { createRoot } from "react-dom/client";
import {Simulate} from "react-dom/test-utils";
import { JSDOM } from "jsdom";
import {createCompanyWire} from "./fixtures/full-chain-company-wire.mjs";

test("actual distribution page restores scoped filters and re-queries trends after refresh without persisting historical facts", async () => {
  const dom = new JSDOM('<main id="app"></main>', {
    url: "https://html-plugin.local",
    pretendToBeVisual: true,
  });
  const observer = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const globals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MutationObserver: dom.window.MutationObserver,
    ResizeObserver: observer,
    requestAnimationFrame: dom.window.requestAnimationFrame,
    cancelAnimationFrame: dom.window.cancelAnimationFrame,
    getComputedStyle: dom.window.getComputedStyle,
    Element: dom.window.Element,
    SVGElement: dom.window.SVGElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const saved = new Map(
    [...Object.keys(globals), "fetch"].map((k) => [
      k,
      Object.getOwnPropertyDescriptor(globalThis, k),
    ]),
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  Object.defineProperty(dom.window.HTMLElement.prototype, "innerText", {
    get() {
      return this.textContent;
    },
  });
  const ui = resolve(
    "business/inventory-qll/source/inventory-light-plugins/src",
  );
  const built = await build({
    stdin: {
      contents: `export {FullChainWorkbench as Page} from '${ui}/pages/qll.tsx';export {mountBusinessFetch,clearBusinessCache} from '${ui}/native/api.ts';export {pageContext,clearContext} from '${ui}/native/context.ts';export {WorkbenchController} from '${resolve("src/workbench.ts")}';`,
      loader: "ts",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    plugins: [
      {
        name: "host",
        setup(api) {
          api.onResolve({ filter: /\.css$/ }, () => ({
            path: "css",
            namespace: "fixture",
          }));
          api.onResolve({ filter: /channel\.js$/ }, () => ({
            path: "host",
            namespace: "fixture",
          }));
          api.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
            contents:
              a.path === "css"
                ? "export default {};"
                : 'export const currentSessionId=()=>"mock-session";export const call=(...args)=>globalThis.companyWire(...args);export const ready=Promise.resolve();export const publish=async()=>{};export const action=()=>()=>{};export const reportElements=(key,elements)=>{globalThis.restoreCatalog.set(key,elements);return()=>globalThis.restoreCatalog.delete(key);};',
          }));
        },
      },
    ],
  });
  await mkdir(".runtime", { recursive: true });
  const file = resolve(".runtime/full-chain-trends-restore.mjs");
  await writeFile(file, built.outputFiles[0].text);
  globalThis.restoreCatalog = new Map();
  const sourceWire = createCompanyWire();
  const sourceDates = [];
  const sourceParameters = [];
  globalThis.companyWire = (...args) => {
    if (args[0] === "sql") {sourceDates.push(args[1].parameters.gea_p1);sourceParameters.push(args[1].parameters);}
    return sourceWire(...args);
  };
  const api = await import(pathToFileURL(file));
  const owner = new api.WorkbenchController({ panel() {}, document() {} });
  owner.registerFrame({
    id: "inventory-qll",
    kind: "html",
    src: "/qll",
    resourceId: "gea-html-inventory-qll",
  });
  const intent = {
    version: 1,
    asOf: "",
    scope: "company",
    month: "2026-09",
    tab: "category",
    sku: "",
    risk: "",
    structureFilters: {
      category: "饺子",
      org: JSON.stringify(["base", "华东"]),
    },
  };
  owner.saveHtmlViewState("inventory-qll", "subject/mock-session", intent);
  dom.window.dispatchEvent(
    new dom.window.MessageEvent("message", {
      source: dom.window.parent,
      data: {
        protocol: "dsh-workbench-view-v1",
        page: "inventory-qll",
        version: 1,
        type: "restore",
        channel: "mock-owned-frame",
        generation: 1,
        state: owner.readHtmlViewState("inventory-qll", "subject/mock-session"),
      },
    }),
  );
  await api.mountBusinessFetch();
  globalThis.fetch = (...args) => dom.window.fetch(...args);
  let root = createRoot(document.getElementById("app"));
  const render = () =>
    React.act(async () => {
      root.render(React.createElement(api.Page));
      await new Promise((r) => setTimeout(r, 5));
    });
  const click = () =>
    React.act(async () => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "查询趋势")
        .click();
      await new Promise((r) => setTimeout(r, 5));
    });
  try {
    await render();
    await React.act(async () => new Promise((r) => setTimeout(r, 5)));
    assert.equal(sourceDates.length, 0, "missing date must issue no SQL");
    const initialSku = document.querySelector('[aria-label="查询 SKU"]');
    assert.ok(initialSku, "SKU query scope must be available before any result");
    await React.act(async () => {
      Simulate.change(initialSku, {target: {value: "MOCK-001"}});
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    assert.equal(sourceDates.length, 0, "SKU can be fixed while date is absent");
    await React.act(async () => {
      Simulate.change(document.querySelector('[aria-label="读取时点"]'), {target: {value: "2026-10-02"}});
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    assert.ok(sourceParameters.length > 0 && sourceParameters.every(values => Object.values(values).includes("MOCK-001")), JSON.stringify(sourceParameters));
    assert.equal(document.querySelector('[aria-label="含渠道"]').checked, false);
    assert.ok(
      document.querySelector('[aria-label="SKU编码筛选"]'),
      document.body.textContent,
    );
    assert.equal(
      document.querySelector('[aria-label="SKU编码筛选"]').value,
      "MOCK-001",
    );
    assert.equal(
      document.querySelector('[aria-label="组织筛选"]').value,
      intent.structureFilters.org,
    );
    assert.equal(api.pageContext().parts.trendView.state, "idle");
    const dateInput = document.querySelector('[aria-label="读取时点"]');
    sourceDates.length = 0;
    await React.act(async () => {
      Simulate.change(dateInput, {target: {value: "2026-10-03"}});
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    assert.ok(sourceDates.length > 0 && sourceDates.every(value => value === "2026-10-03"), JSON.stringify(sourceDates));
    await React.act(async () => {
      Simulate.change(dateInput, {target: {value: "2026-10-02"}});
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    await click();
    const first = api.pageContext().parts.trendView;
    assert.equal(first.state, "ready");
    assert.equal(first.filters.base, "华东");
    assert.equal(first.filters.category, "饺子");
    assert.equal(
      first.data.find((row) => row.snapshotDate === "2026-09-30").base,
      0,
    );
    const ref = globalThis.restoreCatalog.get("chain-trend")[0].id;
    await React.act(async () => root.unmount());
    api.clearBusinessCache();
    api.clearContext();
    assert.equal(globalThis.restoreCatalog.has("chain-trend"), false);
    root = createRoot(document.getElementById("app"));
    await render();
    await React.act(async () => new Promise((r) => setTimeout(r, 5)));
    const fresh = api.pageContext().parts.trendView;
    assert.equal(fresh.state, "idle");
    assert.equal(fresh.data, undefined);
    assert.notEqual(fresh.workspaceId, first.workspaceId);
    assert.equal(fresh.filters.base, "华东");
    await click();
    assert.equal(api.pageContext().parts.trendView.state, "ready");
    assert.notEqual(globalThis.restoreCatalog.get("chain-trend")[0].id, ref);
    assert.deepEqual(
      owner.readHtmlViewState("inventory-qll", "subject/mock-session"),
      intent,
    );
  } finally {
    await React.act(async () => root.unmount());
    api.clearBusinessCache();
    api.clearContext();
    dom.window.close();
    delete globalThis.restoreCatalog;
    delete globalThis.companyWire;
    for (const [key, value] of saved)
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
  }
});
