import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
const built = await build({
  entryPoints: [
    'business/inventory-fc/source/inventory-light-plugins/src/pages/fc-persistence-panel.tsx',
  ],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  external: ['react'],
  plugins: [
    {
      name: 'store',
      setup(b) {
        b.onResolve({ filter: /fc-storage-client$/ }, () => ({
          path: 'fixture',
          namespace: 'fixture',
        }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents:
            'export const fcStorageSelection={read:()=>globalThis.fcPanelFixture?.selected??"",save:()=>{}};export const fcPersistence=new Proxy({}, {get:(_t,k)=>(...args)=>globalThis.fcPanelFixture[k](...args)});',
        }));
      },
    },
  ],
});
await mkdir('.scratch', { recursive: true });
await writeFile('.scratch/fc-persistence-panel.mjs', built.outputFiles[0].text);
const { FcPersistencePanel } = await import(
  pathToFileURL(resolve('.scratch/fc-persistence-panel.mjs'))
);
test('dashboard restores saved inputs without rendering the storage controls', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const applied = [];
  globalThis.fcPanelFixture = {
    selected: '001',
    pending: () => false,
    load: async (scope) => ({
      revision: '2',
      value: scope.kind === 'plans' ? { plans: [] } : { days: 14, rules: [] },
    }),
  };
  try {
    await act(async () =>
      root.render(
        React.createElement(FcPersistencePanel, {
          showControls: false,
          plans: [],
          days: 7,
          rules: [],
          onPlans: async () => {
            applied.push('plans');
          },
          onCycles: (days) => {
            applied.push(days);
          },
        }),
      ),
    );
    assert.deepEqual(applied, [14, 'plans']);
    assert.equal(document.getElementById('root').innerHTML, '');
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.fcPanelFixture;
  }
});
test('saved plans replace the complete warehouse/month package; failed recalculation retries application, then another save creates a new version', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const old = {
    warehouseCode: '001',
    warehouseName: '分仓',
    sku: 'OLD',
    productName: '老品',
    month: '2026-10',
    outboundQty: 2,
    transferQty: 0,
  };
  let stored = { plans: [old] },
    revision = 1,
    writes = 0,
    reads = 0,
    fail = true,
    applies = 0;
  globalThis.fcPanelFixture = {
    pending: () => false,
    load: async () => {
      reads++;
      return { revision: String(revision), value: stored };
    },
    save: async (_s, _r, value) => {
      writes++;
      revision++;
      stored = value;
      return { status: 'saved', revision: String(revision), value };
    },
  };
  const click = async (label) =>
    act(async () => {
      [...document.querySelectorAll('button')].find((x) => x.textContent === label).click();
      await new Promise((r) => setTimeout(r, 10));
    });
  try {
    await act(async () =>
      root.render(
        React.createElement(FcPersistencePanel, {
          plans: [{ ...old, sku: 'NEW', outboundQty: 9 }],
          days: 7,
          rules: [],
          onCycles: () => {},
          onPlans: async () => {
            applies++;
            if (fail) throw Error('计算读取失败');
          },
        }),
      ),
    );
    const input = document.querySelector('input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(
        input,
        '001',
      );
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await click('保存人工计划');
    assert.equal(writes, 1);
    assert.equal(reads, 1);
    assert.deepEqual(stored.plans.map((x) => x.sku).sort(), ['NEW']);
    assert.match(document.body.textContent, /计算读取失败/);
    fail = false;
    await click('保存人工计划');
    assert.equal(writes, 1);
    assert.equal(reads, 2);
    assert.equal(applies, 2);
    assert.match(document.body.textContent, /并应用/);
    await click('保存人工计划');
    assert.equal(writes, 2);
    assert.equal(reads, 3);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.fcPanelFixture;
  }
});

test('reopening verifies historical intent, restores latest versions and prevents concurrent overwrites', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  let planRevision = '5';
  const applied = [],
    reads = [];
  globalThis.fcPanelFixture = {
    selected: '001',
    pending: (scope) => scope.kind === 'plans',
    verify: async () => {
      globalThis.fcPanelFixture.pending = () => false;
      return { revision: '2', value: { plans: [] } };
    },
    load: async (scope) => {
      reads.push(scope.kind);
      return {
        revision: scope.kind === 'plans' ? planRevision : '3',
        value: scope.kind === 'plans' ? { plans: [] } : { days: 14, rules: [] },
      };
    },
    save: () => {
      throw Error('must not write');
    },
  };
  try {
    await act(async () => {
      root.render(
        React.createElement(FcPersistencePanel, {
          plans: [],
          days: 7,
          rules: [],
          onCycles: (days, rules, warehouse, revision) =>
            applied.push(['cycles', days, warehouse, revision]),
          onPlans: async (plans, signal, revision, warehouse) =>
            applied.push(['plans', plans, warehouse, revision]),
        }),
      );
    });
    assert.deepEqual(reads.sort(), ['cycles', 'plans']);
    assert.deepEqual(applied, [
      ['cycles', 14, '001', '3'],
      ['plans', [], '001', '5'],
    ]);
    assert.match(document.body.textContent, /计划版本 5、周期版本 3/);
    planRevision = '6';
    await act(async () => {
      [...document.querySelectorAll('button')]
        .find((x) => x.textContent === '保存人工计划')
        .click();
    });
    assert.match(document.body.textContent, /其他人已更新/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.fcPanelFixture;
  }
});

for (const [name, cycleWarehouse, expected] of [
  ['foreign warehouse rules', '002', /属于其他分仓/],
  ['unread existing rules', undefined, /已有周期配置/],
])
  test(`cycle save rejects ${name} before writing`, async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test' });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const { createRoot } = await import('react-dom/client');
    const root = createRoot(document.getElementById('root'));
    let writes = 0;
    globalThis.fcPanelFixture = {
      pending: () => false,
      load: async () => ({ revision: '4', value: { days: 14, rules: [] } }),
      save: async () => {
        writes++;
        throw Error('unexpected write');
      },
    };
    try {
      await act(async () =>
        root.render(
          React.createElement(FcPersistencePanel, {
            plans: [],
            days: 7,
            rules: [],
            cycleWarehouse,
            onPlans: async () => {},
            onCycles: () => {},
          }),
        ),
      );
      await act(async () => {
        const input = document.querySelector('input');
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(
          input,
          '001',
        );
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
      await act(async () => {
        [...document.querySelectorAll('button')]
          .find((x) => x.textContent === '保存周期规则')
          .click();
      });
      assert.equal(writes, 0);
      assert.match(document.body.textContent, expected);
    } finally {
      await act(async () => root.unmount());
      dom.window.close();
      delete globalThis.window;
      delete globalThis.document;
      delete globalThis.fcPanelFixture;
    }
  });
