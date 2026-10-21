import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

test('base changes and closed details cannot retain or publish obsolete query results', async (t) => {
  const require = createRequire(import.meta.url);
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<div id="app"></div>', { url: 'https://html-plugin.local' });
  const previous = new Map(
    ['window', 'document', 'fetch', 'IS_REACT_ACT_ENVIRONMENT', 'stockRangeTest'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.getElementById('app');
  Object.defineProperty(container, 'innerText', { get: () => container.textContent });
  const table = (base) => ({
    columns: [
      { key: 'category', label: '品类' },
      { key: 'current', label: '库存' },
      { key: 'scope', label: '范围' },
    ],
    rows: [{ category: '汤圆', current: base === '华东' ? 100 : 200, scope: `${base}品类` }],
  });
  const workspace = (bases) => ({
    title: '基地库存',
    kpis: [
      {
        label: '当前库存',
        value: bases?.[0] === '华南' ? '200' : '100',
        delta: '固定样本',
        tone: 'neutral',
      },
    ],
    table: {
      columns: [
        { key: 'base', label: '基地' },
        { key: 'current', label: '库存' },
      ],
      rows: (bases ?? ['华东', '华南']).map((base) => ({
        base,
        level: base,
        current: base === '华东' ? 100 : 200,
      })),
    },
  });
  globalThis.stockRangeTest = {
    handlers: {},
    queries: [],
    published: [],
    hold: null,
    deferred: [],
    load: async (_ref, _op, _signal, bases) => workspace(bases),
    tabs: (_ref, base, category, tab, _op, signal) => {
      const result = {
        [tab]: {
          ...table(base),
          rows: table(base).rows.map((row) => ({ ...row, level: category ? 'SKU-1' : '汤圆' })),
        },
      };
      stockRangeTest.queries.push({ base, category, tab, signal });
      if (stockRangeTest.hold?.base === base && Boolean(category) === stockRangeTest.hold.detail)
        return new Promise((done) => stockRangeTest.deferred.push(() => done(result)));
      return Promise.resolve(result);
    },
  };
  let root, page;
  t.after(async () => {
    if (root) await React.act(async () => root.unmount());
    page?.clearContext();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const bundle = await build({
    stdin: {
      contents:
        "export {InventoryOperationsWorkbench} from './business/inventory-aqkc/source/inventory-light-plugins/src/pages/aqkc.tsx';export {mountBusinessFetch} from './business/inventory-aqkc/source/inventory-light-plugins/src/native/api.ts';export * from './business/inventory-aqkc/source/inventory-light-plugins/src/native/context.ts';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    outfile: 'page.mjs',
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.module.css': 'empty' },
    define: { PLUGIN_ID: '"aqkc"' },
    plugins: [
      {
        name: 'local-page-fixture',
        setup(api) {
          api.onResolve(
            { filter: /^(?:react(?:\/jsx-runtime)?|react-dom(?:\/client)?)$/ },
            (args) => ({
              path: pathToFileURL(require.resolve(args.path)).href,
              external: true,
            }),
          );
          api.onResolve(
            {
              filter:
                /channel\.js$|aqkc-engine$|\/data$|workspace-normalizer\.ts$|dsh-ui\/(controls|icons|workbench-loading)$|daily-report-dialog\.tsx$|floating-table-scrollbar\.tsx$/,
            },
            (args) => ({ path: args.path, namespace: 'fixture' }),
          );
          api.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            contents: args.path.includes('aqkc-engine')
              ? 'export const load=(...a)=>stockRangeTest.load(...a);export const loadInventoryDashboardTabs=(...a)=>stockRangeTest.tabs(...a);'
              : args.path.endsWith('channel.js')
                ? "export const call=async()=>({principalId:'fixture',trusted:false});export const ready=Promise.resolve();export const action=(key,info,handler)=>{stockRangeTest.handlers[key]=handler};export const reportElements=()=>()=>{};export const publish=async value=>stockRangeTest.published.push(structuredClone(value));export const ask=async()=>{};"
                : args.path.endsWith('/data')
                  ? 'export const clearReadCache=()=>{};'
                  : args.path.includes('workspace-normalizer')
                    ? 'export const normalizeWorkspaceState=value=>value;'
                    : `import React from "react";const Pass=p=>React.createElement('div',null,p.children);export const Button=p=>React.createElement('button',{onClick:p.onClick,disabled:p.disabled},p.children);export const Table=Pass;export const Input=Pass;export const Dropdown=Pass;export const Menu=Pass;Menu.Item=Pass;export const DataPagination=()=>null;export const IconDown=()=>null;export const DashboardOverviewSkeleton=()=>null;export const DashboardTableSkeleton=()=>null;export const DailyReportButton=()=>null;export const FloatingTableScrollbar=()=>null;`,
          }));
        },
      },
    ],
  });
  page = await import(
    'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
  );
  root = createRoot(container);
  const settle = () =>
    React.act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });
  const filter = async (args) => {
    await React.act(async () => {
      await stockRangeTest.handlers.filter(args);
    });
    await settle();
  };
  {
    await page.mountBusinessFetch();
    globalThis.fetch = (...args) => window.fetch(...args);
    await React.act(async () =>
      root.render(React.createElement(page.InventoryOperationsWorkbench)),
    );
    await settle();
    await filter({ bases: ['华东基地'], tab: '品类结构' });
    assert.ok(container.textContent.includes('华东品类'));
    await filter({ bases: ['华南基地'] });
    assert.ok(container.textContent.includes('华南品类'));
    assert.ok(!container.textContent.includes('华东品类'));
    assert.equal(page.pageContext().parts.queryState.scope, '华南基地');

    stockRangeTest.hold = { base: '华东', detail: false };
    await filter({ bases: ['华东基地'] });
    assert.equal(stockRangeTest.deferred.length, 1);
    await filter({ bases: ['华南基地'] });
    await React.act(async () => stockRangeTest.deferred.shift()());
    await settle();
    assert.equal(page.pageContext().parts.queryState.state, 'ready');
    assert.equal(page.pageContext().parts.queryState.scope, '华南基地');
    assert.ok(container.textContent.includes('华南品类'));
    assert.ok(!container.textContent.includes('华东品类'));
    assert.equal(page.pageContext().parts.data, undefined);

    stockRangeTest.hold = { base: '华南', detail: true };
    const detailButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent.includes('汤圆'),
    );
    assert.ok(detailButton, 'category detail is reachable through its visible button');
    await React.act(async () => detailButton.click());
    await settle();
    assert.equal(stockRangeTest.deferred.length, 1);
    await React.act(async () => detailButton.click());
    assert.equal(page.pageContext().parts.stockDetail, undefined);
    await React.act(async () => stockRangeTest.deferred.shift()());
    await settle();
    assert.equal(page.pageContext().parts.stockDetail, undefined);
    assert.equal(page.pageContext().parts.data, undefined);

    stockRangeTest.hold = null;
    const beforeRestore = stockRangeTest.queries.length;
    await React.act(async () =>
      window.dispatchEvent(
        new window.MessageEvent('message', {
          source: window.parent,
          data: {
            protocol: 'dsh-workbench-view-v1',
            type: 'restore',
            page: 'inventory-aqkc',
            version: 1,
            channel: 'test-ui-generation',
            generation: 1,
            state: {
              version: 1,
              activeBoardTab: '基地结构',
              pathSelection: ['华南基地'],
              expandedBaseId: '华南',
              expandedCategoryId: '汤圆',
              expandedSkuId: 'SKU-1',
              skuExpanded: true,
              detailTab: '品类结构',
            },
          },
        }),
      ),
    );
    for (let i = 0; i < 8; i++) await settle();
    assert.ok(
      stockRangeTest.queries
        .slice(beforeRestore)
        .some((query) => query.base === '华南' && !query.category),
      'restore obtains the current parent detail',
    );
    assert.ok(
      stockRangeTest.queries
        .slice(beforeRestore)
        .some((query) => query.base === '华南' && query.category === '汤圆'),
      'only a currently visible category restores the SKU detail',
    );
    assert.ok(container.textContent.includes('华南品类'));
    const beforeUnknown = stockRangeTest.queries.length;
    await React.act(async () =>
      window.dispatchEvent(
        new window.MessageEvent('message', {
          source: window.parent,
          data: {
            protocol: 'dsh-workbench-view-v1',
            type: 'restore',
            page: 'inventory-aqkc',
            version: 1,
            channel: 'test-ui-generation',
            generation: 2,
            state: {
              version: 1,
              activeBoardTab: '基地结构',
              pathSelection: ['华南基地'],
              expandedBaseId: '不在当前范围',
              expandedCategoryId: '汤圆',
              skuExpanded: true,
            },
          },
        }),
      ),
    );
    for (let i = 0; i < 4; i++) await settle();
    assert.equal(
      stockRangeTest.queries.slice(beforeUnknown).some((query) => query.base === '不在当前范围'),
      false,
      'unknown restored IDs never trigger a detail read',
    );
  }
});
