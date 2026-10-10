import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const { outputFiles } = await build({
  stdin: {
    contents: `export{PersistedCycleSettings}from'./business/inventory-fc/source/inventory-light-plugins/src/pages/fc/components/planning-settings.tsx';export{BrowserRepository}from'./business/inventory-fc/source/fc/src/lib/browser-repository.ts';export{createElement,act}from'react';export{createRoot}from'react-dom/client';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react-dom', 'react-dom/client'],
  loader: { '.css': 'text', '.module.css': 'text' },
});
const module = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(module, module.exports, require);
const { PersistedCycleSettings, BrowserRepository, createElement, act, createRoot } =
  module.exports;
test('FC restores its typed unsent cycle controls without caching service rules or replaying onSave', async (t) => {
  const dom = new JSDOM('<main id="root"></main>', { pretendToBeVisual: true });
  const keys = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['navigator', dom.window.navigator],
    ['IS_REACT_ACT_ENVIRONMENT', true],
  ])
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  const values = new Map();
  const repository = new BrowserRepository({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  });
  const scope = { userId: 'account', conversationId: 'actual-core-session', warehouseId: 'Z001' };
  repository.saveCycleEdit(scope, {
    level: 'sku',
    object: 'SKU-1',
    days: '9',
    from: '2026-10-01',
    to: '2026-10-31',
    overrides: [],
  });
  const writes = [];
  const root = createRoot(document.getElementById('root'));
  let initial = [
    { id: 'rule-server', level: 'warehouse', objectId: 'Z001', cycleDays: 7, status: 'effective' },
  ];
  const mount = () =>
    act(async () =>
      root.render(
        createElement(PersistedCycleSettings, {
          warehouseId: 'Z001',
          warehouseName: '当前仓',
          initial,
          saving: false,
          view: repository.loadCycleEdit(scope),
          onViewChange: (value) => repository.saveCycleEdit(scope, value),
          onSave: (value) => {
            writes.push(value);
            return Promise.resolve();
          },
        }),
      ),
    );
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, value] of previous) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
    }
  });
  await mount();
  assert.equal(document.querySelector('[aria-label="补货周期天数"]').value, '9');
  assert.equal(document.querySelector('[aria-label="规则对象"]').value, 'SKU-1');
  await act(async () => root.render(null));
  await mount();
  assert.equal(document.querySelector('[aria-label="补货周期天数"]').value, '9');
  assert.equal(writes.length, 0);
  const payload = repository.loadCycleEdit(scope);
  assert.deepEqual(payload.overrides, []);
  assert.equal(
    JSON.stringify(payload).includes('rule-server'),
    false,
    'a service rule is not a user override',
  );
  await act(async () =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent === '移除')
      .click(),
  );
  assert.deepEqual(repository.loadCycleEdit(scope).overrides, [
    { kind: 'remove', level: 'warehouse', objectId: 'Z001' },
  ]);
  await act(async () => root.render(null));
  initial = [
    {
      id: 'fresh-server',
      level: 'warehouse',
      objectId: 'Z001',
      cycleDays: 10,
      status: 'effective',
    },
    { id: 'other-current', level: 'sku', objectId: 'SKU-2', cycleDays: 5, status: 'effective' },
  ];
  await mount();
  const rows = [...document.querySelectorAll('tbody tr')];
  assert.equal(rows.length, 1);
  assert.match(rows[0].textContent, /SKU-2/);
  assert.equal(writes.length, 0);
  assert.equal(JSON.stringify(repository.loadCycleEdit(scope)).includes('fresh-server'), false);
});
