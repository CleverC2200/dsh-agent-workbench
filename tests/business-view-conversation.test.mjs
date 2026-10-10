import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const bundle = await build({
  stdin: {
    contents:
      "export {mountBusinessViews} from './src/business-views.tsx';export {WorkbenchController} from './src/workbench.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  loader: { '.css': 'text' },
});
const module = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(
  module,
  module.exports,
  require,
);
const { mountBusinessViews, WorkbenchController } = module.exports;
test('registered original Inbox enters the shared document with its original resource and body rather than a standalone list', async (t) => {
  const panels = [],
    main = [];
  const account = { scope: null, status: { authenticated: false } };
  const ctx = {
    locale: { register() {}, bind: () => (key) => key, getSnapshot: () => ({ active: 'zh' }) },
    layout: { selectPanel: (id) => panels.push(id) },
    effect: () => {},
    slots: {
      inject: (_name, fn) => fn(),
      register: (options, component) => {
        main.push({ options, component });
        return () => {};
      },
    },
    inject: (_names, fn) =>
      fn({ ...ctx, businessAccount: { getSnapshot: () => account, subscribe: () => () => {} } }),
  };
  ctx.agentWorkbench = new WorkbenchController({
    panel: (id) => panels.push(id),
    document: (id) => panels.push(id),
  });
  mountBusinessViews(ctx);
  const inbox = ctx.agentWorkbench.getSnapshot().pages.find((page) => page.id === 'gea-inbox');
  assert.ok(
    inbox,
    'Inbox uses the same owned document route as the existing business Conversation',
  );
  assert.equal(inbox.kind, 'local');
  assert.equal(inbox.resourceId, 'gea-readonly');
  assert.equal(inbox.src, undefined);
  assert.equal(
    main.some((entry) => entry.options.name === 'main' && entry.options.key === 'gea-inbox'),
    false,
    'no duplicate standalone Inbox main registration',
  );
  const dom = new JSDOM('<main id="root"></main>', { pretendToBeVisual: true });
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  const saved = ['window', 'document', 'navigator', 'fetch', 'IS_REACT_ACT_ENVIRONMENT'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
  );
  const reads = [];
  const fetch = async (path, options) => {
    reads.push({ path, options });
    return Response.json({
      ok: true,
      value: {
        coverage: 'complete',
        items: [],
        total: 0,
        unreadCount: 0,
        pageSize: 20,
        environment: 'test',
        fetchedAt: 'offline-fixture',
      },
    });
  };
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['navigator', dom.window.navigator],
    ['fetch', fetch],
    ['IS_REACT_ACT_ENVIRONMENT', true],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const bodyRoot = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => bodyRoot.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await act(async () => bodyRoot.render(React.createElement(inbox.body)));
  assert.ok(
    document.querySelector('.gea-native-page'),
    'the original Inbox React page is retained',
  );
  assert.ok(
    reads.some((read) => read.path === '/api/gea-proof/notifications'),
    'the original Inbox guarded HTTP read protocol is preserved',
  );
  await ctx.agentWorkbench.open('gea-inbox');
  assert.deepEqual(panels, [undefined]);
  assert.equal(ctx.agentWorkbench.getSnapshot().selectedDocument.id, 'gea-inbox');
});

test('native navigation owner rejects a cancelled receipt and acknowledges only the currently active request', async () => {
  const entries = [];
  const identity = { getSnapshot: () => ({ status: { authenticated: true } }) };
  const ctx = {
    locale: { register() {}, bind: () => (key) => key, getSnapshot: () => ({ active: 'zh' }) },
    effect: () => {},
    slots: {
      inject: (_name, fn) => fn(),
      register: (options, component) => {
        entries.push({ options, component });
        return () => {};
      },
    },
    inject: (_names, fn) => fn({ ...ctx, businessAccount: identity }),
  };
  ctx.agentWorkbench = new WorkbenchController({ panel: () => {}, document: () => {} });
  mountBusinessViews(ctx);
  const document = ctx.agentWorkbench.getSnapshot().pages.find((page) => page.id === 'gea-proof');
  const overlay = entries.find((entry) => entry.options.id === 'gea-desktop-navigation');
  const { open } = overlay.component().props;
  const first = new AbortController();
  const cancelled = open({ panel: 'gea-proof', receipt: 'receipt-old' }, first.signal);
  first.abort();
  await assert.rejects(cancelled, /NAVIGATION_REQUEST_CANCELLED/);
  assert.equal(document.visibleRequest.getSnapshot(), undefined);
  let settled = false;
  const current = open(
    { panel: 'gea-proof', receipt: 'receipt-current' },
    new AbortController().signal,
  ).then(() => {
    settled = true;
  });
  document.onVisible('receipt-old');
  await Promise.resolve();
  assert.equal(settled, false, 'a late old receipt cannot release the current navigation');
  document.onVisible('receipt-current');
  await current;
  assert.equal(settled, true);
});

test('Inbox page/read filter survives Body remount and stays partitioned by the sole account scope', async (t) => {
  let snapshot = { state: 'confirmed', scope: 'account-a', status: { authenticated: true } };
  const subscribers = new Set();
  const identity = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
  };
  const ctx = {
    locale: { register() {}, bind: () => (key) => key, getSnapshot: () => ({ active: 'zh' }) },
    effect: () => {},
    slots: { inject: (_name, fn) => fn(), register: () => () => {} },
    inject: (_names, fn) => fn({ ...ctx, businessAccount: identity }),
  };
  ctx.agentWorkbench = new WorkbenchController({ panel: () => {}, document: () => {} });
  mountBusinessViews(ctx);
  const inbox = ctx.agentWorkbench.getSnapshot().pages.find((page) => page.id === 'gea-inbox');
  const dom = new JSDOM('<main id="root"></main>', { pretendToBeVisual: true });
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  const saved = ['window', 'document', 'navigator', 'fetch', 'IS_REACT_ACT_ENVIRONMENT'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
  );
  const reads = [];
  const fetch = async (_path, options) => {
    const query = JSON.parse(options.body);
    reads.push(query);
    return Response.json({
      ok: true,
      value: {
        coverage: 'complete',
        items: [],
        total: 60,
        unreadCount: 0,
        pageSize: 20,
        environment: 'test',
        fetchedAt: 'offline-recording',
      },
    });
  };
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['navigator', dom.window.navigator],
    ['fetch', fetch],
    ['IS_REACT_ACT_ENVIRONMENT', true],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const mount = () => act(async () => root.render(React.createElement(inbox.body)));
  await mount();
  await act(async () => {
    const filter = document.querySelector('[aria-label="notificationState"]');
    filter.value = 'unread';
    filter.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  await act(async () =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent === 'next')
      .click(),
  );
  assert.deepEqual(reads.at(-1), { pageNo: 2, state: 'unread' });
  await act(async () => root.render(null));
  await mount();
  assert.deepEqual(
    reads.at(-1),
    { pageNo: 2, state: 'unread' },
    'global main replacement does not erase the two owned UI values',
  );
  await act(async () => {
    snapshot = { ...snapshot, scope: 'account-b' };
    for (const changed of subscribers) changed();
  });
  assert.deepEqual(
    reads.at(-1),
    { pageNo: 1, state: '' },
    'a different Host account scope starts with its own UI defaults',
  );
  await act(async () => {
    snapshot = { ...snapshot, scope: 'account-a' };
    for (const changed of subscribers) changed();
  });
  assert.deepEqual(reads.at(-1), { pageNo: 2, state: 'unread' });
  assert.equal(
    reads.some((read) => read.operation),
    false,
    'restoring list UI does not retry or replay a mutation',
  );
});
