import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const bundle = await build({
  entryPoints: ['src/client.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  loader: { '.css': 'text', '.module.css': 'text', '.png': 'dataurl' },
});
const module = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(module, module.exports, require);
const { apply } = module.exports;
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function fixture(t, { cwd, language = 'zh', picked = '/workspace/B' } = {}) {
  const dom = new JSDOM('<main id="root"></main>', { url: 'https://host.example/workbench' });
  const saved = ['window', 'document', 'fetch', 'IS_REACT_ACT_ENVIRONMENT'].map((key) => [
    key, Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  const lists = [], selections = [], sessions = [], opened = [];
  let pickerCalls = 0;
  const request = async (url, options) => {
    const path = new URL(url, 'https://host.example');
    if (path.pathname === '/api/agent-workbench/pages') return Response.json([]);
    if (path.pathname === '/api/agent-workbench/config') return Response.json({});
    if (path.pathname === '/api/agent-manage/resources') {
      lists.push(path.searchParams.get('cwd'));
      return Response.json([{ id: 'prompt:fixture', label: 'Fixture', kind: 'prompt', enabled: true }]);
    }
    if (path.pathname === '/api/agent-manage/resources/select') {
      selections.push(JSON.parse(options.body));
      return Response.json({ preset: 'fixture-preset' });
    }
    throw Error('Unexpected resource request: ' + url);
  };
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, fetch: request, IS_REACT_ACT_ENVIRONMENT: true,
  });
  const cleanups = [], slots = new Map(), locales = new Map(), workspacePaths = new Map();
  const sessionCatalogue = { byId: { ...(cwd ? { current: { cwd } } : {}) } };
  const ctx = {
    locale: {
      register: (name, copy) => { locales.set(name, copy); return () => {}; },
      bind: (name) => (key) => locales.get(name)?.[language]?.[key] ?? key,
      getSnapshot: () => ({ active: language }), subscribe: () => () => {},
    },
    effect: (fn) => { const off = fn(); if (typeof off === 'function') cleanups.push(off); },
    provide: (name, value) => { ctx[name] = value; },
    get: () => undefined,
    inject: (names, fn) => { if (names.every((name) => ctx[name])) fn(ctx); },
    on: () => () => {},
    layout: { selectPanel() {} },
    slots: {
      entries: () => [], subscribe: () => () => {}, registerFactory: () => () => {},
      register: (options, component) => { slots.set(options.id ?? options.key ?? options.name, component); return () => {}; },
      inject: (_name, fn) => { const off = fn(); if (typeof off === 'function') cleanups.push(off); },
    },
    remote: {},
    'remote.agentPresets': {},
    workspaces: {
      create: async ({ path }) => {
        const workspaceId = 'workspace-' + workspacePaths.size;
        workspacePaths.set(workspaceId, path);
        return { workspaceId, path };
      },
    },
    sessions: {
      list: { getSnapshot: () => sessionCatalogue },
      create: async ({ workspaceId }) => {
        const id = 'created-' + sessions.length;
        const session = { cwd: workspacePaths.get(workspaceId) };
        sessions.push(session);
        sessionCatalogue.byId[id] = session;
        return id;
      },
      retain: (sessionId) => ({
        sessionId, ready: Promise.resolve(), release() {},
        binding: { session: { projections: { faceOf: () => ({ getSnapshot: () => 'fixture-preset' }) } } },
      }),
    },
    conversation: {},
    uiWorkspace: {
      pickDirectory: async () => { pickerCalls++; return picked; },
      openSession: (id) => opened.push(id),
    },
  };
  ctx.remote.agentPresets = { select: async () => ({ ok: true }) };
  const errors = [], originalError = console.error;
  console.error = (...args) => errors.push(args);
  apply(ctx);
  const root = createRoot(dom.window.document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(slots.get('agent-workbench.directory'), {
      sessionId: cwd ? 'current' : undefined,
      useSessions: (select) => select(sessionCatalogue),
    }));
    await settle();
  });
  t.after(async () => {
    await act(async () => root.unmount());
    cleanups.reverse().forEach((off) => off());
    console.error = originalError;
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const click = async (button) => act(async () => { button.click(); await settle(); });
  return {
    lists, selections, sessions, opened, errors, pickerCalls: () => pickerCalls,
    text: () => dom.window.document.body.textContent,
    workspaceButton: () => [...dom.window.document.querySelectorAll('button')].find((button) =>
      button.textContent === (language === 'en' ? 'Choose Workspace' : '选择工作区')),
    resourceButton: () => [...dom.window.document.querySelectorAll('button')].find((button) => button.textContent.startsWith('Fixture')),
    click,
  };
}

test('Resources keeps current Session workspace A visible and prevents choosing an ineffective B', async (t) => {
  const h = await fixture(t, { cwd: '/workspace/A' });
  assert.equal(h.workspaceButton().disabled, true);
  assert.match(h.text(), /当前对话工作区.*\/workspace\/A/);
  await h.click(h.workspaceButton());
  assert.equal(h.pickerCalls(), 0);
  assert.deepEqual(h.lists, ['/workspace/A']);
  await h.click(h.resourceButton());
  assert.deepEqual(h.selections, [{ id: 'prompt:fixture', cwd: '/workspace/A' }]);
  assert.deepEqual(h.sessions, [{ cwd: '/workspace/A' }]);
  assert.deepEqual(h.opened, ['created-0']);
});

test('Resources with no current workspace lets the chosen B drive its list and new Session', async (t) => {
  const h = await fixture(t);
  assert.equal(h.workspaceButton().disabled, false);
  assert.equal(h.pickerCalls(), 0, 'loading Resources does not open the directory picker');
  assert.match(h.text(), /请先选择工作区/);
  await h.click(h.workspaceButton());
  assert.equal(h.pickerCalls(), 1);
  assert.match(h.text(), /已选择工作区.*\/workspace\/B/);
  assert.deepEqual(h.lists, ['/workspace/B']);
  await h.click(h.resourceButton());
  assert.deepEqual(h.selections, [{ id: 'prompt:fixture', cwd: '/workspace/B' }]);
  assert.deepEqual(h.sessions, [{ cwd: '/workspace/B' }]);
  assert.deepEqual(h.opened, ['created-0']);
});

test('cancelling the workspace picker keeps Resources unselected and creates no Session', async (t) => {
  const h = await fixture(t, { picked: null });
  await h.click(h.workspaceButton());
  assert.equal(h.pickerCalls(), 1);
  assert.equal(h.workspaceButton().disabled, false);
  assert.match(h.text(), /请先选择工作区/);
  assert.deepEqual(h.lists, []);
  assert.deepEqual(h.selections, []);
  assert.deepEqual(h.sessions, []);
  assert.deepEqual(h.opened, []);
});

test('Resources explains the current Conversation workspace in English', async (t) => {
  const h = await fixture(t, { cwd: '/workspace/A', language: 'en' });
  assert.equal(h.workspaceButton().disabled, true);
  assert.match(h.text(), /Current Conversation Workspace.*\/workspace\/A/);
});
