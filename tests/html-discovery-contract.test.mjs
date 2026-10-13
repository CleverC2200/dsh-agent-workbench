import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const { outputFiles } = await build({
  stdin: {
    contents: `export{apply}from'./src/client.ts';export{createElement,act}from'react';export{createRoot}from'react-dom/client';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  jsx: 'automatic',
  plugins: [
    {
      name: 'node-react',
      setup(builder) {
        builder.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, (args) => ({
          path: require.resolve(args.path),
          external: true,
        }));
      },
    },
  ],
  loader: { '.css': 'text', '.module.css': 'text', '.png': 'dataurl' },
});
const module = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(module, module.exports, require);
const { apply, createElement, act, createRoot } = module.exports;
async function fixture(t, fetcher) {
  const saved = {
    window: globalThis.window,
    document: globalThis.document,
    fetch: globalThis.fetch,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const dom = new JSDOM('<body><div id=notice></div></body>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.fetch = fetcher;
  const cleanups = [],
    slots = new Map();
  let workbench;
  const sessionCalls = [];
  const ctx = {
    locale: {
      register: () => () => {},
      bind: () => (key) => key,
      getSnapshot: () => ({ active: 'zh' }),
      subscribe: () => () => {},
    },
    effect: (fn) => {
      const off = fn();
      if (typeof off === 'function') cleanups.push(off);
    },
    provide: (name, value) => {
      if (name === 'agentWorkbench') {
        workbench = value;
        ctx.agentWorkbench = value;
      }
    },
    get: () => undefined,
    inject: () => {},
    on: () => () => {},
    layout: { selectPanel() {} },
    uiWorkspace: {
      openSession(...args) {
        sessionCalls.push(args);
      },
    },
    sessions: {
      retain(...args) {
        sessionCalls.push(args);
        throw Error('unexpected Session retention');
      },
    },
    remote: {
      session: {
        create(...args) {
          sessionCalls.push(args);
          throw Error('unexpected Session creation');
        },
      },
    },
    slots: {
      entries: () => [],
      registerFactory: () => () => {},
      register: (options, component) => {
        const id = options.id ?? options.key ?? options.name;
        slots.set(id, component);
        return () => {
          slots.delete(id);
        };
      },
      inject: (_name, fn) => {
        const off = fn();
        if (typeof off === 'function') cleanups.push(off);
      },
    },
  };
  apply(ctx);
  const root = createRoot(dom.window.document.getElementById('notice'));
  await act(async () => root.render(createElement(slots.get('workbench-page-discovery'))));
  await act(async () => await new Promise((resolve) => setImmediate(resolve)));
  const dispose = () =>
    cleanups
      .splice(0)
      .reverse()
      .forEach((off) => off());
  t.after(async () => {
    await act(async () => root.unmount());
    dispose();
    dom.window.close();
    Object.assign(globalThis, saved);
  });
  return {
    workbench,
    slots,
    dispose,
    sessionCalls,
    stop: async () => {
      await act(async () => root.unmount());
      dispose();
    },
    notice: () => dom.window.document.getElementById('notice').innerHTML,
    retry: async () =>
      act(async () => {
        dom.window.document.querySelector('#notice button').click();
        await new Promise((resolve) => setImmediate(resolve));
      }),
  };
}

test('current page catalog registers every declared HTML view once and never observes GEA identity', async (t) => {
  const pages = [
    ...['plan', 'board', 'demand', 'delivery'].map((view) => ({
      id: 'inventory-aps' + view,
      name: view,
      pluginId: 'inventory-aps',
      view,
      url: '/html?page=' + view,
      resourceId: 'gea-html-inventory-aps',
    })),
    ...['customer', 'orderworkbench', 'orderfulfillment'].map((id) => ({
      id: 'inventory-' + id,
      name: id,
      pluginId: 'inventory-' + id,
      view: '',
      url: '/html?id=' + id,
    })),
  ];
  const urls = [];
  const h = await fixture(t, async (url) => {
    urls.push(url);
    assert.equal(url, '/api/agent-workbench/pages');
    return Response.json(pages);
  });
  const registered = h.workbench.getSnapshot().pages;
  assert.deepEqual(
    registered.filter((page) => pages.some((item) => item.id === page.id)).map((page) => page.id),
    pages.map((page) => page.id),
  );
  for (const page of pages) {
    await h.workbench.open(page.id);
    const selected = h.workbench.getSnapshot().selectedDocument;
    assert.equal(selected.id, page.id);
    assert.equal(selected.resourceId, page.resourceId);
    assert.equal(selected.src, page.url);
  }
  assert.deepEqual(urls, ['/api/agent-workbench/pages']);
  assert.deepEqual(
    h.sessionCalls,
    [],
    'catalog discovery and display never create or bind a Session',
  );
  h.dispose();
  assert.equal(h.workbench.getSnapshot().pages.length, 0);
});

test('unmounted discovery removes its slot and cancels a late catalog response', async (t) => {
  const pending = Promise.withResolvers();
  let signal;
  const h = await fixture(t, async (_url, options) => {
    signal = options.signal;
    return pending.promise;
  });
  await h.stop();
  assert.equal(signal.aborted, true);
  assert.equal(h.slots.has('workbench-page-discovery'), false);
  assert.equal(h.notice(), '');
  pending.resolve(
    Response.json([{ id: 'late', name: 'Late', pluginId: 'late', view: '', url: '/html' }]),
  );
  await act(async () => await new Promise((resolve) => setImmediate(resolve)));
  assert.equal(h.workbench.getSnapshot().pages.length, 0);
  assert.deepEqual(h.sessionCalls, []);
});

for (const failure of ['HTTP', 'network'])
  test(`${failure} discovery failure stays visible until explicit retry without background polling`, async (t) => {
    let calls = 0;
    const h = await fixture(t, async () => {
      calls++;
      if (calls > 1)
        return Response.json([
          { id: 'fixture', name: 'Fixture', view: '', pluginId: 'fixture', url: '/html' },
        ]);
      if (failure === 'network') throw Error('offline');
      return Response.json({}, { status: 503 });
    });
    assert.match(h.notice(), /role="alert"/);
    assert.match(h.notice(), failure === 'HTTP' ? /HTTP 503/ : /offline/);
    assert.match(h.notice(), /retry/);
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(calls, 1);
    // The button calls the current public discovery action, not a timer or secondary identity reader.
    await h.retry();
    assert.equal(calls, 2);
    assert.equal(h.notice(), '');
    assert.ok(h.workbench.getSnapshot().pages.some((page) => page.id === 'fixture'));
  });
