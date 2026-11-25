import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { CustomerSkuTable } from './prototypes/inventory-customer/sku-table.js';
      const root = createRoot(document.getElementById('root'));
      const Table = props => { globalThis.skuTableProps = props; return React.createElement('div'); };
      globalThis.renderSku = props => root.render(React.createElement(CustomerSkuTable, { ...props, react: React, Table }));
      globalThis.disposeSku = () => root.unmount();`,
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  plugins: [
    {
      name: 'sku-read',
      setup(api) {
        api.onLoad({ filter: /[\\/]inventory-customer[\\/]sku-source\.js$/ }, () => ({
          contents:
            'export const customerSkuPresentation = { columns: [] }; export const readCustomerSkus = (...args) => globalThis.readSku(...args);',
          loader: 'js',
        }));
      },
    },
  ],
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 30));

test('rapid SKU filters issue only the settled scope; reordering and page changes avoid a filter reload', async (t) => {
  const dom = new JSDOM('<div id="root"></div>', { runScripts: 'outside-only' });
  const calls = [],
    states = [];
  dom.window.readSku = (inventory, codes, input, { signal }) =>
    new Promise((resolve) => {
      calls.push({ codes, input, signal, resolve });
    });
  dom.window.eval(bundle.outputFiles[0].text);
  t.after(() => {
    dom.window.disposeSku();
    dom.window.close();
  });
  const owner = { snapshot: '2026-11-25', rows: ['A', 'B', 'C'].map((code) => ({ code })) };
  const render = (codes, page = 1) =>
    dom.window.renderSku({
      inventory: owner,
      customers: codes.map((code) => ({ code })),
      page,
      onPageChange() {},
      onRead: (state) => states.push(state),
    });
  render(['A', 'B']);
  await flush();
  assert.equal(calls.length, 1);
  render(['B', 'A']);
  await flush();
  assert.equal(calls.length, 1, 'customer order alone must not reload the scope');
  render(['B']);
  await flush();
  assert.equal(calls[0].signal.aborted, true);
  render(['C']);
  await flush();
  assert.equal(calls.length, 1, 'intermediate scopes are not queried while typing');
  calls[0].resolve({ rows: [{ customer: 'A' }], total: 1, page: 1, pageSize: 10 });
  await flush();
  assert.equal(states.at(-1).state, 'loading');
  assert.equal(
    dom.window.skuTableProps.data.length,
    0,
    'old scope cannot appear under the new filter',
  );
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.equal(calls.length, 2);
  assert.deepEqual(Array.from(calls[1].codes), ['C']);
  calls[1].resolve({ rows: [{ customer: 'C' }], total: 20, page: 1, pageSize: 10 });
  await flush();
  assert.equal(states.at(-1).state, 'ready');
  render(['C'], 2);
  await flush();
  assert.equal(calls.length, 3, 'paging does not wait for the filter debounce');
  assert.equal(calls[2].input.page, 2);
  render([]);
  await flush();
  assert.equal(calls[2].signal.aborted, true);
  assert.equal(states.at(-1).state, 'empty');
  assert.equal(calls.length, 3);
});
