import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { Context } from '../../../official-latest-standard/vendor/cordis/lib/index.js';
const require = createRequire(import.meta.url);
const { outputFiles } = await build({
  stdin: {
    contents:
      "export {inject,apply as applyWorkbench} from './src/client.ts';export {mountFramePresentation} from './src/frame-presenter.tsx';export {installPageInteraction} from './src/page-interaction/client.ts';export {WorkbenchController} from './src/workbench.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  jsx: 'automatic',
  format: 'cjs',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  loader: { '.png': 'dataurl', '.css': 'text', '.module.css': 'text' },
});
const module = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(module, module.exports, require);
const {
  inject,
  applyWorkbench,
  mountFramePresentation,
  WorkbenchController,
  installPageInteraction,
} = module.exports;

test('the actual Workbench Cordis injection authorizes its Frame history borrow and releases it after recording the genuine preset', async (t) => {
  const dom = new JSDOM('<html><head></head><body></body></html>', {
    url: 'https://host.example/workbench',
  });
  const saved = ['window', 'document', 'Node'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['Node', dom.window.Node],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const ctx = new Context();
  let restore,
    workbench,
    released = false;
  const id = 'session-11111111-1111-4111-8111-111111111111';
  const binding = {
    sessionId: id,
    session: {
      projections: {
        faceOf: (key) => {
          assert.equal(key, 'agentPreset');
          return { getSnapshot: () => null };
        },
      },
    },
  };
  const services = {
    slots: {
      registerFactory: () => () => {},
      inject: (_name, callback) => callback(),
      register: () => () => {},
    },
    layout: { selectPanel: () => {} },
    locale: { subscribe: () => () => {}, getSnapshot: () => ({ active: 'zh' }) },
    theme: { getTheme: () => ({ active: { colorScheme: 'light', tokens: {} }, fontSize: 14 }) },
    uiWorkspace: { openSession: () => {} },
    workspaces: {},
    sessions: {
      list: { getSnapshot: () => ({ byId: { [id]: { cwd: '/isolated/static' } } }) },
      retain: (target) => {
        assert.equal(target, id);
        return {
          sessionId: id,
          ready: Promise.resolve(binding),
          get binding() {
            assert.equal(released, false);
            return binding;
          },
          release: () => {
            released = true;
          },
        };
      },
    },
  };
  await ctx.plugin({
    name: 'native-frame-runtime-providers',
    apply: (scope) => {
      for (const [name, value] of Object.entries(services)) scope.provide(name, value);
    },
  });
  t.after(async () => {
    await ctx.fiber.dispose();
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await ctx.plugin({
    name: 'workbench-frame-consumer',
    inject,
    apply: (scope) => {
      workbench = new WorkbenchController({ panel: () => {}, document: () => {} });
      workbench.registerFrame({ id: 'static-document', kind: 'html', src: '/static.html' });
      restore = mountFramePresentation(
        scope,
        () => undefined,
        (key) => key,
        workbench,
      );
    },
  });
  await restore('static-document', id, new AbortController().signal);
  await workbench.open('static-document');
  assert.deepEqual(workbench.getSnapshot().selection, {
    sessionId: id,
    preset: null,
    ownerScope: null,
    cwd: '/isolated/static',
  });
  assert.equal(released, true);
});

test('a quote consumer uses real Cordis dependencies and the actual Session-owned inputActions without any business Host request', async (t) => {
  const dom = new JSDOM(
    '<html><body><iframe sandbox="allow-scripts"></iframe><div id="trigger"></div></body></html>',
    { url: 'https://host.example/workbench' },
  );
  const saved = ['window', 'document', 'Node', 'fetch'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['Node', dom.window.Node],
    [
      'fetch',
      () => {
        throw Error('quote cannot call business/GEA Host');
      },
    ],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const ctx = new Context();
  let api, release;
  const posted = [],
    draft = [];
  const id = 'session-22222222-2222-4222-8222-222222222222';
  let live = true;
  const binding = { sessionId: id, ctx: {} };
  const reference = {
    sessionId: id,
    ready: Promise.resolve(binding),
    get binding() {
      if (!live) throw Error('REFERENCE_RELEASED');
      return binding;
    },
    release() {
      live = false;
    },
  };
  await ctx.plugin({
    name: 'quote-core-providers',
    apply: (scope) => {
      scope.provide('inputTriggers', { registerSource: () => () => {} });
      scope.provide('conversation', {
        input: {
          for: () => {
            throw Error('quote must use actual supplied inputActions');
          },
        },
      });
      scope.provide('slots', { inject: () => {}, register: () => () => {} });
    },
  });
  await ctx.plugin({
    name: 'quote-client',
    inject: ['slots'],
    apply: (scope) => {
      api = installPageInteraction(scope);
    },
  });
  const frame = document.querySelector('iframe');
  frame.getClientRects = () => [{}];
  frame.contentWindow.postMessage = (message) => posted.push(message);
  const anchor = document.getElementById('trigger');
  release = api.mountTrigger(anchor, id);
  anchor.children[0].getClientRects = () => [{}];
  const unbind = api.bindFrame({
    mode: 'quote',
    frame,
    reference,
    page: 'Static sample',
    isCurrentSession: () => live,
    inputActions: {
      captureInsertion: () => ({ start: 5, end: 5, draftRev: 3 }),
      insertText: (text, span) => {
        draft.push({ text, span, id });
        return true;
      },
      persistDraft: () => draft.push({ persisted: true, id }),
    },
  });
  t.after(async () => {
    unbind();
    release();
    reference.release();
    await ctx.fiber.dispose();
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const channel = posted.find((message) => message.type === 'configure').channel;
  const send = (data) =>
    window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        source: frame.contentWindow,
        origin: 'null',
        data: { protocol: 'dsh-page-interaction-v1', channel, ...data },
      }),
    );
  send({ type: 'selection-state', active: true });
  send({
    type: 'reference',
    requestId: 'quote-native-seam',
    reference: { label: '行', text: '只读引用', targets: [] },
  });
  await Promise.resolve();
  assert.deepEqual(draft, [
    { text: '引用：Static sample · 行\n> 只读引用\n', span: { start: 5, end: 5, draftRev: 3 }, id },
    { persisted: true, id },
  ]);
  assert.equal(posted.at(-1).ok, true);
});

test('actual Cordis discovery registers HTML Documents before main presentation is mounted and removes them with its own lifetime', async (t) => {
  const dom = new JSDOM('<html><head></head><body></body></html>', {
    url: 'https://host.example/workbench',
  });
  const saved = ['window', 'document', 'Node', 'fetch', 'localStorage'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  let reads = 0;
  const page = {
    id: 'discovered-static',
    name: 'Discovered static',
    url: '/static.html',
    pluginId: 'fixture-static',
  };
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['Node', dom.window.Node],
    ['localStorage', dom.window.localStorage],
    [
      'fetch',
      async (url) => {
        assert.equal(url, '/api/agent-workbench/pages');
        reads++;
        return Response.json([page]);
      },
    ],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const ctx = new Context();
  const mainCallbacks = [];
  const services = {
    slots: {
      registerFactory: () => () => {},
      inject: (name, callback) => {
        if (name === 'main') mainCallbacks.push(callback);
        return () => {};
      },
      register: () => () => {},
      entries: () => [],
    },
    layout: { selectPanel: () => {} },
    locale: {
      register: () => () => {},
      bind: () => (key) => key,
      subscribe: () => () => {},
      getSnapshot: () => ({ active: 'zh' }),
    },
    theme: { getTheme: () => ({ active: { colorScheme: 'light', tokens: {} }, fontSize: 14 }) },
    uiWorkspace: { openSession: () => {} },
    workspaces: {},
    sessions: {},
  };
  t.after(async () => {
    await ctx.fiber.dispose();
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await ctx.plugin({
    name: 'discovery-core-providers',
    apply: (scope) => {
      for (const [name, value] of Object.entries(services)) scope.provide(name, value);
    },
  });
  const consumer = await ctx.plugin({
    name: 'actual-workbench-discovery',
    inject,
    apply: applyWorkbench,
  });
  await new Promise((resolve) => setImmediate(resolve));
  const workbench = ctx.agentWorkbench;
  assert.equal(reads, 1);
  assert.ok(mainCallbacks.length, 'presentation remains contributed through public main slots');
  assert.ok(
    workbench.getSnapshot().pages.some((item) => item.id === page.id),
    'HTML metadata must be available without executing a main slot callback',
  );
  await workbench.open(page.id);
  assert.equal(workbench.getSnapshot().selectedDocument.id, page.id);
  await consumer.dispose();
  assert.equal(
    workbench.getSnapshot().pages.some((item) => item.id === page.id),
    false,
    'discovery cleanup unregisters its own page',
  );
});
