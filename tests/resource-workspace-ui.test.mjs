import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
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
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(
  module,
  module.exports,
  require,
);
const { apply } = module.exports;
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function fixture(t, { cwd, configCwd, language = 'zh', picked = '/workspace/B' } = {}) {
  const dom = new JSDOM('<main id="root"></main>', { url: 'https://host.example/workbench' });
  const saved = ['window', 'document', 'fetch', 'IS_REACT_ACT_ENVIRONMENT'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  const lists = [],
    selections = [],
    sessions = [],
    opened = [];
  let pickerCalls = 0;
  const request = async (url, options) => {
    const path = new URL(url, 'https://host.example');
    if (path.pathname === '/api/agent-workbench/pages') return Response.json([]);
    if (path.pathname === '/api/agent-workbench/config') return Response.json({ cwd: configCwd });
    if (path.pathname === '/api/agent-manage/resources') {
      lists.push(path.searchParams.get('cwd'));
      return Response.json([
        { id: 'prompt:fixture', label: 'Fixture', kind: 'prompt', enabled: true },
      ]);
    }
    if (path.pathname === '/api/agent-manage/resources/select') {
      selections.push(JSON.parse(options.body));
      return Response.json({ preset: 'fixture-preset' });
    }
    throw Error('Unexpected resource request: ' + url);
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    fetch: request,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const cleanups = [],
    slots = new Map(),
    locales = new Map(),
    workspacePaths = new Map();
  const selectedPresets = new Map();
  const sessionCatalogue = {
    phase: 'ready',
    byId: cwd ? { current: { cwd, retainedBy: { mainView: 1 }, draft: 'keep my draft' } } : {},
  };
  let navigation = new AbortController();
  const ctx = {
    locale: {
      register: (name, copy) => {
        locales.set(name, copy);
        return () => {};
      },
      bind: (name) => (key) => locales.get(name)?.[language]?.[key] ?? key,
      getSnapshot: () => ({ active: language }),
      subscribe: () => () => {},
    },
    effect: (fn) => {
      const off = fn();
      if (typeof off === 'function') cleanups.push(off);
    },
    provide: (name, value) => {
      ctx[name] = value;
    },
    get: () => undefined,
    inject: (names, fn) => {
      if (names.every((name) => ctx[name])) fn(ctx);
    },
    on: () => () => {},
    layout: {
      selectPanel() {},
      beginNavigation() {
        navigation.abort();
        navigation = new AbortController();
        return navigation.signal;
      },
    },
    slots: {
      entries: () => [],
      subscribe: () => () => {},
      registerFactory: () => () => {},
      register: (options, component) => {
        slots.set(options.id ?? options.key ?? options.name, component);
        return () => {};
      },
      inject: (_name, fn) => {
        const off = fn();
        if (typeof off === 'function') cleanups.push(off);
      },
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
        sessionCatalogue.byId[id] = { ...session, retainedBy: {} };
        return id;
      },
      retain: (sessionId) => ({
        sessionId,
        ready: Promise.resolve(),
        release() {},
        binding: {
          session: {
            projections: {
              faceOf: () => ({
                getSnapshot: () => selectedPresets.get(sessionId) ?? 'fixture-preset',
              }),
            },
          },
        },
      }),
    },
    conversation: {},
    uiWorkspace: {
      pickDirectory: async () => {
        pickerCalls++;
        return picked;
      },
      openSession: (id) => opened.push(id),
    },
  };
  ctx.remote.agentPresets = {
    select: async (sessionId, preset) => {
      selectedPresets.set(sessionId, preset);
      return { ok: true };
    },
  };
  const errors = [],
    originalError = console.error;
  console.error = (...args) => errors.push(args);
  apply(ctx);
  t.after(async () => {
    cleanups.reverse().forEach((off) => off());
    console.error = originalError;
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    ctx,
    sessionCatalogue,
    selectedPresets,
    lists,
    selections,
    sessions,
    opened,
    errors,
    pickerCalls: () => pickerCalls,
    text: () => dom.window.document.body.textContent,
  };
}

test('Agent configuration starts the chosen preset in a fresh native Conversation with the current Workspace', async (t) => {
  const h = await fixture(t, { cwd: '/workspace/A', configCwd: '/configured/unused' });
  const original = structuredClone(h.sessionCatalogue.byId.current);
  h.ctx.agentWorkbench.registerFrame({ id: 'agent-config', kind: 'native', render() {} });
  await h.ctx.agentWorkbench.open('agent-config');
  await h.ctx.agentWorkbench.startAgent('personal-agent');
  assert.deepEqual(h.sessions, [{ cwd: '/workspace/A' }]);
  assert.deepEqual([...h.selectedPresets], [['created-0', 'personal-agent']]);
  assert.deepEqual(h.opened, ['created-0']);
  assert.equal(h.pickerCalls(), 0);
  assert.equal(h.ctx.agentWorkbench.getSnapshot().selectedDocument, undefined);
  assert.deepEqual(h.sessionCatalogue.byId.current, original);
});

for (const configCwd of ['/configured/project', undefined]) {
  test(`Agent start uses ${configCwd ? 'the configured Workspace' : 'the user-selected directory'} without a current Conversation`, async (t) => {
    const h = await fixture(t, { configCwd });
    await h.ctx.agentWorkbench.startAgent('personal-agent');
    assert.deepEqual(h.sessions, [{ cwd: configCwd ?? '/workspace/B' }]);
    assert.deepEqual([...h.selectedPresets], [['created-0', 'personal-agent']]);
    assert.deepEqual(h.opened, ['created-0']);
    assert.equal(h.pickerCalls(), configCwd ? 0 : 1);
  });
}

test('cancelling Agent start directory selection retains the configuration page and creates no Conversation', async (t) => {
  const h = await fixture(t, { picked: null });
  h.ctx.agentWorkbench.registerFrame({ id: 'agent-config', kind: 'native', render() {} });
  await h.ctx.agentWorkbench.open('agent-config');
  await assert.rejects(
    h.ctx.agentWorkbench.startAgent('personal-agent'),
    /WORKBENCH_WORKSPACE_REQUIRED/,
  );
  assert.deepEqual(h.sessions, []);
  assert.deepEqual([...h.selectedPresets], []);
  assert.deepEqual(h.opened, []);
  assert.equal(h.ctx.agentWorkbench.getSnapshot().selectedDocument.id, 'agent-config');
});

test('a late Agent directory choice after navigation cannot create or select a Conversation', async (t) => {
  const choice = Promise.withResolvers();
  const h = await fixture(t, { picked: choice.promise });
  const starting = h.ctx.agentWorkbench.startAgent('personal-agent');
  await settle();
  h.ctx.layout.beginNavigation();
  choice.resolve('/late/project');
  await assert.rejects(starting, { name: 'AbortError' });
  assert.deepEqual(h.sessions, []);
  assert.deepEqual([...h.selectedPresets], []);
  assert.deepEqual(h.opened, []);
});
