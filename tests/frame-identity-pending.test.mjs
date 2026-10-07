import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const { outputFiles } = await build({
  stdin: {
    contents: `export {mountFramePresentation} from './src/frame-presenter.tsx';export {mountNativeResourceSelection} from './src/resource-selection.ts';export {WorkbenchController} from './src/workbench.ts';export {createElement,act,useSyncExternalStore} from 'react';export {createRoot} from ${JSON.stringify(require.resolve('react-dom/client'))};`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  alias: { react: resolve('node_modules/react') },
  loader: { '.png': 'dataurl', '.css': 'text' },
});
const module = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(module, module.exports, require);
const {
  mountFramePresentation,
  mountNativeResourceSelection,
  WorkbenchController,
  createElement,
  createRoot,
  act,
  useSyncExternalStore,
} = module.exports;
async function fixture(
  t,
  {
    authenticated = true,
    enabled = true,
    delayFirstSelection = false,
    delayList = false,
    selectionFails = false,
    localBody = false,
    available = true,
    nativeTools = false,
    secondInterpreter = false,
    secondInterpreterOnlyInFirstScope = false,
    staticDocument = false,
    visibleRequests = false,
    initialSession,
    initialPreset = null,
    restoredSelection,
    nativeResourceSdk = false,
    declareSecondInterpreter = true,
  } = {},
) {
  const dom = new JSDOM('<main id="root"></main>', {
    url: 'https://host.example/workbench',
    pretendToBeVisual: true,
  });
  const keys = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT', 'MessageChannel'];
  const saved = keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['navigator', dom.window.navigator],
    ['IS_REACT_ACT_ENVIRONMENT', true],
    [
      'MessageChannel',
      class {
        constructor() {
          this.port1 = { onmessage: null, close() {} };
          this.port2 = {
            postMessage: (value) => setImmediate(() => this.port1.onmessage?.({ data: value })),
            close() {},
          };
        }
      },
    ],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  let Document, Conversation;
  const effects = [],
    listeners = new Set();
  let snapshot = {
    state: 'confirmed',
    scope: authenticated ? 'principal-a' : null,
    subject: authenticated ? 'fixture-user-a' : null,
    status: { authenticated },
  };
  const identity = {
    getSnapshot: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const locale = { active: 'zh' };
  const toolChanges = new Set();
  let expanded = false;
  let toolGuide = [
    {
      id: 'upstream-files-entry',
      providerId: 'external-provider',
      kind: 'files',
      title: () => '文件',
    },
  ];
  const native = {
    sidebarRight: {
      isExpanded: () => expanded,
      openTab: (kind) => {
        calls.push(['native-tool', kind, mainSession]);
        expanded = true;
      },
      toggleExpanded: () => {
        expanded = !expanded;
      },
    },
    sidebarRightTabs: {
      get: (kind) => toolGuide.find((tool) => tool.kind === kind),
      guide: () => toolGuide,
      subscribe: (listener) => {
        toolChanges.add(listener);
        return () => toolChanges.delete(listener);
      },
    },
  };
  const ctx = {
    get: () => undefined,
    provide() {},
    locale: { subscribe: () => () => {}, getSnapshot: () => locale },
    theme: { getTheme: () => ({ active: { colorScheme: 'light', tokens: {} }, fontSize: 14 }) },
    on: () => () => {},
    effect: (fn) => {
      const off = fn();
      if (typeof off === 'function') effects.push(off);
    },
    inputTriggers: { registerSource: () => () => {} },
    conversation: { input: { for: () => ({}) } },
    slots: {
      registerFactory: (_meta, component) => {
        Document = component;
        return () => {};
      },
      register: (_meta, component) => {
        Conversation = component;
        return () => {};
      },
      inject: (_name, fn) => fn(),
    },
    inject: (names, fn) => {
      if (names.includes('sidebarRight')) {
        if (nativeTools) fn({ ...ctx, ...native });
        return;
      }
      return fn(
        names.includes('businessAccount')
          ? { ...ctx, businessAccount: identity, remote: { session: {} } }
          : ctx,
      );
    },
  };
  const calls = [],
    waiting = [];
  let sessions = 0,
    listRequests = 0,
    selectionRequests = 0;
  let secondInstalled = secondInterpreter;
  const host = {
    fetch: async (path, options) => {
      calls.push([path, options]);
      if (path.endsWith('/config')) return Response.json({ cwd: '/owned/workspace' });
      if (path.includes('/resources?')) {
        listRequests++;
        if (delayList)
          return new Promise((resolve) =>
            waiting.push({ kind: 'list', resolve, signal: options.signal }),
          );
        return Response.json([
          { id: 'original', label: 'Original', kind: 'prompt', installed: true, enabled,
            ...(nativeResourceSdk && secondInstalled && declareSecondInterpreter ? { interpreters: ['original', 'other'] } : {}) },
          ...(secondInstalled &&
          (!secondInterpreterOnlyInFirstScope || snapshot.scope === 'principal-a')
            ? [{ id: 'other', label: 'Other', kind: 'prompt', installed: true, enabled: true }]
            : []),
        ]);
      }
      selectionRequests++;
      if (delayFirstSelection && selectionRequests === 1)
        return new Promise((resolve) =>
          waiting.push({ kind: 'select', resolve, signal: options.signal }),
        );
      if (selectionFails)
        return Response.json({ error: 'ORIGINAL_RESOURCE_FAILURE' }, { status: 400 });
      const resourceId = JSON.parse(options.body).id;
      if (nativeResourceSdk && resourceId !== 'original' && !(secondInstalled && resourceId === 'other'))
        return Response.json({ error: 'AGENT_RESOURCE_DISABLED_OR_MISSING' }, { status: 400 });
      return enabled
        ? Response.json({
            preset: nativeResourceSdk ? resourceId : 'original',
            ...(secondInstalled && (!nativeResourceSdk || declareSecondInterpreter) &&
            (!secondInterpreterOnlyInFirstScope || snapshot.scope === 'principal-a')
              ? { interpreters: ['original', 'other'] }
              : {}),
          })
        : Response.json({ error: 'AGENT_RESOURCE_DISABLED_OR_MISSING' }, { status: 400 });
    },
    workspace: async (path) => {
      calls.push(['workspace', path]);
      return { workspaceId: 'workspace', path };
    },
    create: async () => 'session-' + ++sessions,
    select: async () => {},
    open: async (id, _skill, signal, beforeOpen) => {
      signal.throwIfAborted();
      const preset = page.resourceId ? 'original' : null;
      beforeOpen?.({ sessionId: id, preset, cwd: '/owned/workspace' });
      mainPreset = preset;
      ctx.uiWorkspace.openSession(id);
    },
  };
  const sessionListeners = new Set();
  let mainSession = initialSession,
    mainPreset = initialSession ? initialPreset : undefined;
  ctx.uiWorkspace = {
    openSession: (id) => {
      mainSession = id;
      for (const listener of sessionListeners) listener();
    },
  };
  ctx.sessions = {
    list: {
      getSnapshot: () => ({
        phase: 'ready',
        ids: mainSession ? [mainSession] : [],
        byId: mainSession ? { [mainSession]: { cwd: '/owned/workspace' } } : {},
      }),
    },
  };
  let currentHost = host;
  const sdkDrafts = new Map(initialSession ? [[initialSession, '未发送的历史草稿']] : []);
  if (nativeResourceSdk) {
    const presets = new Map(initialSession ? [[initialSession, initialPreset]] : []);
    ctx.sessions.list.getSnapshot = () => ({
      phase: 'ready',
      ids: [...presets.keys()],
      byId: Object.fromEntries([...presets.keys()].map(id => [id, { cwd: '/owned/workspace' }])),
    });
    ctx.workspaces = { create: ({ path }) => host.workspace(path) };
    ctx.sessions.create = async options => {
      calls.push(['core-create', options]);
      const id = await host.create(options);
      presets.set(id, null);
      sdkDrafts.set(id, '');
      return id;
    };
    ctx.sessions.retain = (id, { signal }) => {
      signal.throwIfAborted();
      if (!presets.has(id)) throw Error('PAGE_SESSION_UNAVAILABLE');
      return {
        sessionId: id,
        ready: Promise.resolve(),
        binding: { ctx: { id }, session: { projections: { faceOf: () => ({ getSnapshot: () => presets.get(id) }) } } },
        release: () => calls.push(['core-release', id]),
      };
    };
    ctx.remote = { agentPresets: { select: async (id, preset) => {
      calls.push(['core-select-preset', id, preset]);
      presets.set(id, preset);
      return { ok: true, value: preset };
    } } };
    ctx.conversation.input.for = binding => ({ state: { getSnapshot: () => ({ draft: sdkDrafts.get(binding.id), draftRev: 0 }) } });
    const openSession = ctx.uiWorkspace.openSession;
    ctx.uiWorkspace.openSession = id => { mainPreset = presets.get(id); openSession(id); };
    mountNativeResourceSelection(ctx, value => { currentHost = value; });
    currentHost.fetch = host.fetch;
  }
  const workbench = new WorkbenchController({
    panel: () => {},
    document: (id) => {
      if (id) ctx.uiWorkspace.openSession(id);
    },
  }, restoredSelection ? {
    getSnapshot: () => ({ version: 2, selections: [{ page: 'native', active: true, ...restoredSelection }], views: [] }),
    set() {},
  } : undefined);
  workbench.subscribeHistory(() =>
    calls.push(['history', workbench.getSnapshot().selectedDocument?.id]),
  );
  const restorePageSession = mountFramePresentation(
    ctx,
    () => (available ? currentHost : undefined),
    (key) => key,
    workbench,
  );
  const root = createRoot(dom.window.document.getElementById('root'));
  const page = localBody
    ? {
        id: 'gea-inbox',
        label: 'Original inbox',
        kind: 'local',
        body: () => createElement('article', { 'data-original-inbox': true }, 'original body'),
        resourceId: 'original',
      }
    : {
        id: 'native',
        label: 'Original page',
        src: 'https://host.example/document',
        kind: 'native',
        resourceId: 'original',
      };
  const visibleChanges = new Set();
  let visibleReceipt = 'receipt-1';
  if (visibleRequests) {
    page.visibleRequest = {
      subscribe: (listener) => {
        visibleChanges.add(listener);
        return () => visibleChanges.delete(listener);
      },
      getSnapshot: () => visibleReceipt,
    };
    page.onVisible = (receipt) => calls.push(['visible', receipt]);
  }
  if (staticDocument) delete page.resourceId;
  workbench.registerFrame(page);
  await workbench.open(page.id);
  function Main() {
    const sessionId = useSyncExternalStore(
      (listener) => {
        sessionListeners.add(listener);
        return () => sessionListeners.delete(listener);
      },
      () => mainSession,
    );
    const state = useSyncExternalStore(workbench.subscribe, workbench.getSnapshot);
    return createElement(Document, {
      page,
      active: state.selectedDocument?.id === page.id,
      sessionId,
      useProjection: () => mainPreset,
      useSession: (selector) =>
        sessionId
          ? selector({ blank: true, running: false, promptAttempted: false, openState: 'open' })
          : undefined,
      renderSlot: () =>
        createElement(
          'div',
          { 'data-native-session': sessionId, ...(nativeResourceSdk ? { key: sessionId } : {}) },
          createElement(Conversation, {
            page: page.id,
            useSession: (selector) =>
              selector({ blank: true, running: false, promptAttempted: false }),
            inputActions: { setDraft: (text) => calls.push(['draft', text]) },
            renderFactorySlot: (name, _options, extension) =>
              createElement(
                'div',
                { 'data-official-factory': name },
                extension?.slots.views &&
                  createElement(extension.slots.views, {
                    useSession: (selector) =>
                      selector({ blank: true, running: false, promptAttempted: false }),
                    inputActions: { setDraft: (text) => calls.push(['draft', text]) },
                    renderSlot: (name) => createElement('article', { 'data-native-seat': name }),
                  }),
                createElement('textarea', { 'aria-label': 'SDK draft fixture', defaultValue: nativeResourceSdk ? sdkDrafts.get(sessionId) ?? '' : '' }),
              ),
          }),
        ),
    });
  }
  const render = () => root.render(createElement(Main));
  t.after(async () => {
    await act(async () => root.unmount());
    effects.reverse().forEach((off) => off());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await act(async () => render());
  const transportFrame = dom.window.document.querySelector('iframe');
  if (transportFrame)
    transportFrame.contentWindow.postMessage = (message) => calls.push(['frame-message', message]);
  return {
    dom,
    calls,
    waiting,
    render,
    load: async () =>
      act(async () =>
        dom.window.document.querySelector('iframe').dispatchEvent(new dom.window.Event('load')),
      ),
    replaceResourceAdapter: async () =>
      act(async () => {
        secondInstalled = false;
        currentHost = { ...host };
        render();
      }),
    hide: async () => act(async () => workbench.leaveDocument()),
    show: async () => act(async () => workbench.open(page.id)),
    changeReceipt: async (receipt) =>
      act(async () => {
        visibleReceipt = receipt;
        for (const changed of visibleChanges) changed();
      }),
    selectMain: async (id, preset) =>
      act(async () => {
        mainPreset = preset;
        ctx.uiWorkspace.openSession(id);
      }),
    historyPage: () => workbench.takeHistoryPage(),
    toolsExpanded: () => expanded,
    removeTools: async () =>
      act(async () => {
        toolGuide = [];
        for (const changed of toolChanges) changed();
      }),
    dispose: async () => act(async () => root.unmount()),
    counts: () => ({ sessions, listRequests, selectionRequests }),
    association: () => workbench.getSnapshot().selection,
    selection: () => workbench.getSnapshot().selection,
    failIdentityRead: async () =>
      act(async () => {
        snapshot = { ...snapshot, error: 'PROFILE_IDENTITY_UNAVAILABLE' };
        for (const listener of listeners) listener();
      }),
    changeIdentity: async () =>
      act(async () => {
        snapshot = { ...snapshot, scope: 'principal-b', subject: 'fixture-user-b' };
        for (const listener of listeners) listener();
      }),
    identityFailure: async () =>
      act(async () => {
        snapshot = {
          ...snapshot,
          state: snapshot.state === 'confirmed' ? 'confirmed' : 'error',
          error: 'FIXTURE_IDENTITY_OBSERVATION_FAILED',
        };
        for (const listener of listeners) listener();
      }),
    identityUnknown: async () =>
      act(async () => {
        snapshot = { state: 'unknown', scope: null, status: null };
        for (const listener of listeners) listener();
      }),
    identityLogout: async () =>
      act(async () => {
        snapshot = { state: 'confirmed', scope: null, status: { authenticated: false } };
        for (const listener of listeners) listener();
      }),
    identityRecovery: async () =>
      act(async () => {
        snapshot = {
          state: 'confirmed',
          scope: 'principal-a',
          subject: 'fixture-user-a',
          status: { authenticated: true },
        };
        for (const listener of listeners) listener();
      }),
    newConversation: async () =>
      act(async () => dom.window.document.querySelector('[aria-label="新建对话"]').click()),
    selectHistory: async id => act(async () => {
      await restorePageSession(page.id, id, new AbortController().signal);
      await workbench.open(page.id);
    }),
    resolve: async (item, value) => act(async () => item.resolve(Response.json(value))),
  };
}
test('reopening a restored Document revalidates the same subject Session after its Host scope changes', async (t) => {
  const sessionId = 'session-00000000-0000-4000-8000-000000000034';
  const f = await fixture(t, {
    initialSession: sessionId,
    initialPreset: 'original',
    restoredSelection: { sessionId, preset: 'original', ownerScope: 'previous-host-run', subject: 'fixture-user-a', cwd: '/owned/workspace' },
  });
  assert.equal(f.selection()?.sessionId, sessionId);
  assert.equal(f.selection()?.ownerScope, 'principal-a', 'the confirmed current scope must be rebound through the public resource open callback');
  assert.equal(f.dom.window.document.querySelector('[data-native-session]')?.dataset.nativeSession, sessionId);
  assert.deepEqual(f.counts(), { sessions: 0, listRequests: 1, selectionRequests: 0 }, 'restoring a reference cannot replace the original Session');
});

for (const oldPreset of ['agent-resource-skill', null, 'standard', 'original']) {
  test(`new conversation on a received business page uses its current resource after restoring the old ${oldPreset} Core Session`, async t => {
    const sessionId = 'session-00000000-0000-4000-8000-000000000024';
    const f = await fixture(t, {
      nativeResourceSdk: true,
      initialSession: sessionId,
      initialPreset: oldPreset,
      restoredSelection: { sessionId, preset: oldPreset, ownerScope: 'principal-a', subject: 'fixture-user-a', cwd: '/owned/workspace' },
    });
    const document = f.dom.window.document;
    assert.equal(document.querySelector('[data-native-session]')?.dataset.nativeSession, sessionId);
    assert.equal(f.counts().sessions, 0, 'opening historical presentation creates no replacement Session');
    assert.equal(document.querySelector('[aria-label="SDK draft fixture"]').value, '未发送的历史草稿');
    await f.newConversation();
    assert.equal(document.querySelector('[role="alert"]')?.getAttribute('title'), undefined, document.body.textContent);
    assert.equal(document.querySelector('[data-native-session]')?.dataset.nativeSession, 'session-1');
    assert.deepEqual(
      JSON.parse(f.calls.find(([path]) => typeof path === 'string' && path.endsWith('/resources/select'))[1].body),
      { id: 'original', cwd: '/owned/workspace' },
      'the received page resource is a Manage resource ID, while the old projection remains a Core preset',
    );
    assert.deepEqual(f.calls.filter(([operation]) => operation === 'core-select-preset'), [['core-select-preset', 'session-1', 'original']]);
    assert.equal(document.querySelector('[aria-label="SDK draft fixture"]').value, '');
    await act(async () => document.querySelector('[aria-label="历史对话"]').click());
    await f.selectHistory(sessionId);
    assert.equal(document.querySelector('[data-native-session]')?.dataset.nativeSession, sessionId);
    assert.equal(document.querySelector('[aria-label="SDK draft fixture"]').value, '未发送的历史草稿');
    assert.equal(f.association().preset, oldPreset, 'the public history borrow observes the unchanged original Core composition');
  });
}

for (const declareSecondInterpreter of [true, false]) {
  test(`new conversation ${declareSecondInterpreter ? 'keeps' : 'does not borrow'} an installed Interpreter ${declareSecondInterpreter ? 'declared' : 'not declared'} by the current page`, async t => {
    const sessionId = 'session-00000000-0000-4000-8000-000000000024';
    const f = await fixture(t, {
      nativeResourceSdk: true,
      secondInterpreter: true,
      declareSecondInterpreter,
      initialSession: sessionId,
      initialPreset: 'other',
      restoredSelection: { sessionId, preset: 'other', ownerScope: 'principal-a', subject: 'fixture-user-a', cwd: '/owned/workspace' },
    });
    await f.newConversation();
    assert.equal(f.dom.window.document.querySelector('[role="alert"]')?.getAttribute('title'), undefined);
    assert.deepEqual(
      JSON.parse(f.calls.find(([path]) => typeof path === 'string' && path.endsWith('/resources/select'))[1].body),
      { id: declareSecondInterpreter ? 'other' : 'original', cwd: '/owned/workspace' },
    );
    assert.equal(f.dom.window.document.querySelector('[data-native-session]')?.dataset.nativeSession, 'session-1');
  });
}

for (const oldPreset of ['agent-resource-skill', null]) {
  test(`restoring an old ${oldPreset ?? 'plain'} Session after Host restart borrows its unchanged composition before explicitly creating from the received page resource`, async t => {
    const sessionId = 'session-00000000-0000-4000-8000-000000000024';
    const f = await fixture(t, {
      nativeResourceSdk: true,
      initialSession: sessionId,
      initialPreset: oldPreset,
      restoredSelection: { sessionId, preset: oldPreset, ownerScope: 'previous-host-run', subject: 'fixture-user-a', cwd: '/owned/workspace' },
    });
    assert.equal(f.dom.window.document.querySelector('[data-native-session]')?.dataset.nativeSession, sessionId);
    assert.deepEqual(f.counts(), { sessions: 0, listRequests: 1, selectionRequests: 0 });
    await f.newConversation();
    assert.equal(f.dom.window.document.querySelector('[role="alert"]')?.getAttribute('title'), undefined);
    assert.deepEqual(f.calls.filter(([operation]) => operation === 'core-select-preset'), [['core-select-preset', 'session-1', 'original']]);
  });
}

test('formal page navigation auto-prepares one actual native Session only for an authenticated enabled resource', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(f.counts(), { sessions: 1, listRequests: 1, selectionRequests: 1 });
  assert.equal(
    f.dom.window.document.querySelector('[data-native-session]').dataset.nativeSession,
    'session-1',
  );
  assert.ok(!f.dom.window.document.body.textContent.includes('pageConnect'));
  await act(async () => f.render());
  assert.deepEqual(f.counts(), { sessions: 1, listRequests: 1, selectionRequests: 1 });
  assert.deepEqual(
    JSON.parse(f.calls.find(([path]) => path.endsWith('/resources/select'))[1].body),
    { id: 'original', cwd: '/owned/workspace' },
  );
});
for (const options of [{ authenticated: false }, { enabled: false }])
  test(`auto preparation does not invent a binding for ${options.authenticated === false ? 'Guest' : 'disabled resource'}`, async (t) => {
    const f = await fixture(t, options);
    assert.equal(f.counts().sessions, 0);
    assert.equal(f.counts().selectionRequests, 0);
    assert.equal(f.dom.window.document.querySelector('[data-native-session]'), null);
    await act(async () => f.render());
    assert.equal(f.counts().listRequests, options.authenticated === false ? 0 : 1);
  });
test('identity changes cancel an old resource selection and its late result cannot replace the new binding', async (t) => {
  const f = await fixture(t, { delayFirstSelection: true });
  assert.equal(f.counts().sessions, 0);
  await f.changeIdentity();
  assert.equal(f.waiting[0].signal.aborted, true);
  assert.equal(f.counts().sessions, 1);
  await f.resolve(f.waiting[0], { preset: 'original' });
  assert.equal(f.counts().sessions, 1);
  assert.equal(
    f.dom.window.document.querySelector('[data-native-session]').dataset.nativeSession,
    'session-1',
  );
});
test('failed automatic preparation is not retried by a render or a view change', async (t) => {
  const f = await fixture(t, { selectionFails: true });
  assert.equal(f.counts().sessions, 0);
  assert.equal(f.counts().selectionRequests, 1);
  await act(async () => f.render());
  await act(async () =>
    f.dom.window.document.querySelector('[aria-label="中间区域最大，隐藏会话区"]').click(),
  );
  assert.equal(f.counts().selectionRequests, 1);
  assert.equal(f.counts().listRequests, 1);
});
test('explicit new conversation supersedes pending automatic discovery without a late second preparation', async (t) => {
  const f = await fixture(t, { delayList: true });
  assert.equal(f.counts().sessions, 0);
  await f.newConversation();
  assert.equal(f.waiting[0].signal.aborted, true);
  assert.equal(f.counts().sessions, 1);
  await f.resolve(f.waiting[0], [{ id: 'original', installed: true, enabled: true }]);
  assert.equal(f.counts().sessions, 1);
  assert.equal(f.counts().selectionRequests, 1);
});

test('local original Inbox body shares actual resource selection, toolbar and Session lifetime without an iframe or page grant', async (t) => {
  const f = await fixture(t, { localBody: true });
  assert.ok(
    f.dom.window.document.querySelector('[data-original-inbox]'),
    'the original React body remains mounted',
  );
  assert.equal(f.dom.window.document.querySelector('iframe'), null);
  assert.deepEqual(f.counts(), { sessions: 1, listRequests: 1, selectionRequests: 1 });
  assert.equal(
    f.dom.window.document.querySelector('[data-native-session]').dataset.nativeSession,
    'session-1',
  );
  assert.equal(
    f.dom.window.document.querySelectorAll('.gea-conversation-view-switch button').length,
    3,
  );
  const body = f.dom.window.document.querySelector('[data-original-inbox]');
  await act(async () =>
    f.dom.window.document.querySelector('[aria-label="中间区域最大，隐藏会话区"]').click(),
  );
  assert.ok(f.dom.window.document.querySelector('.view-center'));
  await act(async () =>
    f.dom.window.document.querySelector('[aria-label="会话区最大，隐藏中间区域"]').click(),
  );
  assert.ok(f.dom.window.document.querySelector('.view-chat'));
  await act(async () =>
    f.dom.window.document.querySelector('[aria-label="同时显示中间区域和会话区"]').click(),
  );
  assert.ok(f.dom.window.document.querySelector('.view-split'));
  assert.equal(
    f.dom.window.document.querySelector('[data-original-inbox]'),
    body,
    'view changes preserve the original list mount and local selections',
  );
  assert.ok(f.dom.window.document.querySelector('[data-official-factory="conversation.content"]'));
  const recommendations = [...f.dom.window.document.querySelectorAll('.gea-agent-prompts button')];
  assert.equal(recommendations.length, 4);
  await act(async () => recommendations[0].click());
  assert.ok(
    f.calls.some((row) => row[0] === 'draft' && row[1] === recommendations[0].textContent),
    'original Inbox recommendation fills the real public input action',
  );
  await act(async () => f.dom.window.document.querySelector('[aria-label="历史对话"]').click());
  assert.ok(f.calls.some((row) => row[0] === 'history' && row[1] === 'gea-inbox'));
  await f.newConversation();
  assert.equal(f.counts().sessions, 2);
  assert.equal(
    f.dom.window.document.querySelector('[data-native-session]').dataset.nativeSession,
    'session-2',
  );
  await f.dispose();
  assert.equal(
    f.dom.window.document.querySelector('[data-native-session]'),
    null,
    'unmount removes the presentation while native ownership belongs to Core',
  );
});

for (const options of [{ authenticated: false }, { enabled: false }])
  test(`local Inbox preserves the original body without invented Session for ${options.authenticated === false ? 'Guest' : 'disabled resource'}`, async (t) => {
    const f = await fixture(t, { localBody: true, ...options });
    assert.ok(f.dom.window.document.querySelector('[data-original-inbox]'));
    assert.equal(f.dom.window.document.querySelector('iframe'), null);
    assert.equal(f.dom.window.document.querySelector('[data-native-session]'), null);
    assert.equal(f.counts().sessions, 0);
    assert.equal(f.counts().selectionRequests, 0);
  });

for (const options of [{ authenticated: false }, { enabled: false }, { selectionFails: true }])
  test(`unbound business Document preserves its AI region and reports ${options.authenticated === false ? 'login' : options.enabled === false ? 'resource selection' : 'preparation failure'} without a Session or composer`, async (t) => {
    const f = await fixture(t, options);
    const ai = f.dom.window.document.querySelector('[aria-label="AI对话"]');
    assert.ok(ai, 'the split view retains a visible AI region before a Session is bound');
    assert.equal(ai.hidden, false);
    assert.match(
      ai.textContent,
      new RegExp(
        options.authenticated === false
          ? 'pageLogin'
          : options.selectionFails
            ? 'ORIGINAL_RESOURCE_FAILURE'
            : 'pageHint',
      ),
    );
    assert.equal(ai.querySelector('[data-native-session]'), null);
    assert.equal(ai.querySelector('textarea,input,[contenteditable="true"]'), null);
    const business = f.dom.window.document.querySelector('iframe');
    await act(async () =>
      f.dom.window.document.querySelector('[aria-label="会话区最大，隐藏中间区域"]').click(),
    );
    assert.equal(business.parentElement.hidden, true);
    assert.equal(ai.hidden, false);
    await act(async () =>
      f.dom.window.document.querySelector('[aria-label="中间区域最大，隐藏会话区"]').click(),
    );
    assert.equal(business.parentElement.hidden, false);
    assert.equal(ai.hidden, true);
    await act(async () =>
      f.dom.window.document.querySelector('[aria-label="同时显示中间区域和会话区"]').click(),
    );
    assert.equal(business.parentElement.hidden, false);
    assert.equal(ai.hidden, false);
    assert.equal(
      f.dom.window.document.querySelector('iframe'),
      business,
      'switching modes keeps the business frame',
    );
    assert.equal(f.counts().sessions, 0);
  });

test('mode changes retain the borrowed Session, public Conversation draft and business frame without resource preparation', async (t) => {
  const f = await fixture(t);
  const document = f.dom.window.document;
  const session = document.querySelector('[data-native-session]'),
    draft = document.querySelector('[aria-label="SDK draft fixture"]'),
    business = document.querySelector('iframe');
  draft.value = '尚未发送的分析问题';
  for (const label of [
    '中间区域最大，隐藏会话区',
    '会话区最大，隐藏中间区域',
    '同时显示中间区域和会话区',
  ]) {
    await act(async () => document.querySelector('[aria-label="' + label + '"]').click());
    assert.equal(
      document.querySelector('[data-native-session]'),
      session,
      'the same native Conversation remains mounted',
    );
    assert.equal(document.querySelector('[aria-label="SDK draft fixture"]'), draft);
    assert.equal(draft.value, '尚未发送的分析问题');
    assert.equal(document.querySelector('iframe'), business);
  }
  assert.deepEqual(f.counts(), { sessions: 1, listRequests: 1, selectionRequests: 1 });
  assert.equal(
    f.calls.some((row) => row[0] === 'release'),
    false,
    'mode changes do not release or rebind the current reference',
  );
});

test('unavailable resource backend keeps the AI region and reports readiness without a fabricated Conversation', async (t) => {
  const f = await fixture(t, { available: false });
  const ai = f.dom.window.document.querySelector('[aria-label="AI对话"]');
  assert.ok(ai);
  assert.equal(ai.hidden, false);
  assert.match(ai.textContent, /pageWait/);
  assert.equal(ai.querySelector('[data-official-factory]'), null);
  assert.equal(f.counts().sessions, 0);
});

test('the Document consumes native tab kinds from public metadata, keeps its draft, and restores the original mode after its own close', async (t) => {
  const f = await fixture(t, { localBody: true, nativeTools: true });
  const document = f.dom.window.document;
  const draft = document.querySelector('[aria-label="SDK draft fixture"]');
  draft.value = '同一真实Session的未发送草稿';
  const open = async () =>
    act(async () => {
      const menu = document.querySelector('[aria-label="原生工具"]');
      menu.value = 'files';
      menu.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
    });
  await open();
  assert.ok(document.querySelector('.view-center'));
  assert.equal(f.toolsExpanded(), true);
  assert.deepEqual(
    f.calls.find((row) => row[0] === 'native-tool'),
    ['native-tool', 'files', 'session-1'],
    'the native kind belongs to the same currently presented Session',
  );
  assert.equal(document.querySelector('[aria-label="SDK draft fixture"]'), draft);
  await act(async () => document.querySelector('[aria-label="关闭原生工具并恢复视图"]').click());
  assert.ok(document.querySelector('.view-split'));
  assert.equal(f.toolsExpanded(), false);
  assert.equal(draft.value, '同一真实Session的未发送草稿');
  await open();
  await act(async () => document.querySelector('[aria-label="会话区最大，隐藏中间区域"]').click());
  assert.ok(document.querySelector('.view-chat'));
  assert.equal(
    f.toolsExpanded(),
    false,
    'an explicit mode choice takes priority over temporary tool presentation',
  );
  await f.removeTools();
  assert.equal(
    document.querySelector('[aria-label="原生工具"]'),
    null,
    'unloaded providers cease to be selectable',
  );
});

test('a static Document can explicitly choose an existing native history without login, resource preparation or Session creation', async (t) => {
  const f = await fixture(t, { localBody: true, staticDocument: true, authenticated: false });
  assert.ok(f.dom.window.document.querySelector('[data-original-inbox]'));
  assert.deepEqual(f.counts(), { sessions: 0, listRequests: 0, selectionRequests: 0 });
  await act(async () => f.dom.window.document.querySelector('[aria-label="历史对话"]').click());
  assert.equal(
    f.historyPage(),
    'gea-inbox',
    'the explicit history request preserves its actual static Document location',
  );
  assert.deepEqual(f.counts(), { sessions: 0, listRequests: 0, selectionRequests: 0 });
});

test('a loaded cached native Document acknowledges a new visible receipt only after it becomes active again', async (t) => {
  const f = await fixture(t, { visibleRequests: true });
  await f.load();
  await f.hide();
  await f.changeReceipt('receipt-2');
  assert.equal(
    f.calls.some((row) => row[0] === 'visible' && row[1] === 'receipt-2'),
    false,
    'inactive receipt is never confirmed',
  );
  await f.show();
  assert.equal(
    f.calls.some((row) => row[0] === 'visible' && row[1] === 'receipt-2'),
    true,
    'cached re-entry does not wait for another iframe load',
  );
});

test('a new navigation receipt to an already active loaded Document receives its own visibility acknowledgement', async (t) => {
  const f = await fixture(t, { visibleRequests: true });
  await f.load();
  await f.changeReceipt('receipt-2');
  assert.equal(
    f.calls.some((row) => row[0] === 'visible' && row[1] === 'receipt-2'),
    true,
  );
  assert.deepEqual(
    f.counts(),
    { sessions: 1, listRequests: 1, selectionRequests: 1 },
    'receipt changes never prepare another resource',
  );
});

test('an inactive cached native Document does not push changed identity or acknowledge a late iframe load', async (t) => {
  const f = await fixture(t, { visibleRequests: true });
  const transport = [];
  const iframe = f.dom.window.document.querySelector('iframe');
  iframe.contentWindow.postMessage = (message) => transport.push(message);
  await f.hide();
  await f.changeReceipt('receipt-2');
  await f.changeIdentity();
  await f.load();
  assert.equal(
    transport.some((message) => message.type === 'gea:identity-snapshot'),
    false,
    'hidden identity updates cannot start the original native status/business pipeline',
  );
  assert.equal(
    f.calls.some((row) => row[0] === 'visible' && row[1] === 'receipt-2'),
    false,
  );
});

test('an unbound static Document gives Core conversation choices without requiring GEA identity', async (t) => {
  const f = await fixture(t, { localBody: true, staticDocument: true, authenticated: false });
  const ai = f.dom.window.document.querySelector('[aria-label="AI对话"]');
  assert.match(ai.textContent, /pageStaticHint/);
  assert.doesNotMatch(ai.textContent, /pageLogin|pageWait/);
});

test('static new conversation uses deployment workspace and records the real nullable preset before normal Core navigation', async (t) => {
  const f = await fixture(t, { localBody: true, staticDocument: true, authenticated: false });
  await f.newConversation();
  assert.deepEqual(f.counts(), { sessions: 1, listRequests: 0, selectionRequests: 0 });
  assert.ok(f.calls.some((row) => row[0] === 'workspace' && row[1] === '/owned/workspace'));
  assert.equal(
    f.dom.window.document.querySelector('[data-native-session]').dataset.nativeSession,
    'session-1',
  );
  assert.equal(
    f.calls.some(([path]) => typeof path === 'string' && path.includes('/resources/select')),
    false,
    'plain static creation never selects a Managed resource',
  );
});

test('the static toolbar explicitly associates the current real main Session even when its ID never changes', async (t) => {
  const f = await fixture(t, {
    localBody: true,
    staticDocument: true,
    authenticated: false,
    initialSession: 'existing-native-session',
    initialPreset: null,
  });
  const document = f.dom.window.document;
  const current = document.querySelector('[aria-label="关联当前对话"]');
  assert.ok(current);
  await act(async () => current.click());
  assert.equal(
    document.querySelector('[data-native-session]').dataset.nativeSession,
    'existing-native-session',
  );
  assert.deepEqual(f.counts(), { sessions: 0, listRequests: 0, selectionRequests: 0 });
});

test('a fresh validated selection publishes its declared installed Interpreter choices without a second list read', async (t) => {
  const f = await fixture(t, { secondInterpreter: true });
  const chooser = f.dom.window.document.querySelector('[aria-label="pageInterpreter"]');
  assert.ok(
    chooser,
    'Manage validates page choices during the first selection, after the initial list',
  );
  assert.deepEqual(
    [...chooser.options].map((option) => option.value),
    ['original', 'other'],
  );
  assert.deepEqual(f.counts(), { sessions: 1, listRequests: 1, selectionRequests: 1 });
});

test('a confirmed identity read error blocks the old page without discarding its Session association', async (t) => {
  const f = await fixture(t);
  const association = f.association();
  const oldFrame = f.dom.window.document.querySelector('iframe');
  assert.equal(association.sessionId, 'session-1');
  await f.failIdentityRead();
  assert.deepEqual(
    f.association(),
    association,
    'a read error does not assert logout or delete metadata',
  );
  assert.equal(f.dom.window.document.querySelector('[data-native-session]'), null);
  assert.equal(
    oldFrame.isConnected,
    false,
    'old business data cannot remain mounted after identity reading fails',
  );
  assert.deepEqual(f.counts(), { sessions: 1, listRequests: 1, selectionRequests: 1 });
});

test('a business Document shows failed public identity observation without replacing its confirmed principal or creating another Session', async (t) => {
  const f = await fixture(t);
  const before = f.counts(),
    association = f.selection();
  await f.identityFailure();
  assert.deepEqual(f.selection(), association);
  assert.equal(
    f.dom.window.document.querySelector('[data-native-session]'),
    null,
    'uncertain identity suspends the borrowed Conversation without deleting its metadata',
  );
  const alert = f.dom.window.document.querySelector('[role="alert"]');
  assert.ok(alert, 'the user must see the public identity observation failure');
  assert.equal(alert.getAttribute('title'), 'FIXTURE_IDENTITY_OBSERVATION_FAILED');
  assert.match(alert.textContent, /pageIdentityFailed/);
  assert.deepEqual(f.counts(), before, 'showing failure does not create another login or Session');
  await f.identityRecovery();
  assert.equal(f.dom.window.document.querySelector('[role="alert"]'), null);
});

test('an independent static Document does not depend on business identity observation errors', async (t) => {
  const f = await fixture(t, { localBody: true, staticDocument: true, authenticated: false });
  await f.identityFailure();
  assert.equal(f.dom.window.document.querySelector('[role="alert"]'), null);
  assert.ok(f.dom.window.document.querySelector('[data-original-inbox]'));
});

test('an unknown projection retains Document metadata for confirmed recovery while explicit logout forgets only the UI association', async (t) => {
  const f = await fixture(t);
  const association = f.selection(),
    before = f.counts();
  assert.ok(association);
  await f.identityUnknown();
  assert.deepEqual(f.selection(), association, 'unknown is not logout');
  assert.equal(f.dom.window.document.querySelector('[data-native-session]'), null);
  await f.identityRecovery();
  assert.deepEqual(f.selection(), association);
  assert.deepEqual(f.counts(), before);
  assert.equal(
    f.dom.window.document.querySelector('[data-native-session]').dataset.nativeSession,
    association.sessionId,
  );
  await f.identityLogout();
  assert.equal(f.selection(), undefined);
  assert.equal(f.dom.window.document.querySelector('[data-native-session]'), null);
});

test('validated Interpreter choices survive unknown and failed identity observation without another directory or selection', async (t) => {
  const f = await fixture(t, { secondInterpreter: true });
  const choices = () =>
    [...(f.dom.window.document.querySelector('[aria-label="pageInterpreter"]')?.options ?? [])].map(
      (option) => option.value,
    );
  assert.deepEqual(choices(), ['original', 'other']);
  await f.identityUnknown();
  assert.deepEqual(choices(), [], 'unknown identity cannot select cached business choices');
  assert.equal(f.dom.window.document.querySelector('[data-native-session]'), null);
  await f.identityRecovery();
  assert.deepEqual(choices(), ['original', 'other']);
  assert.deepEqual(f.counts(), { sessions: 1, listRequests: 1, selectionRequests: 1 });
  await f.identityFailure();
  assert.deepEqual(choices(), [], 'failed observation cannot select cached business choices');
  assert.ok(f.dom.window.document.querySelector('[role="alert"]'));
  await f.identityRecovery();
  assert.deepEqual(choices(), ['original', 'other']);
  assert.equal(f.dom.window.document.querySelector('[role="alert"]'), null);
  assert.deepEqual(f.counts(), { sessions: 1, listRequests: 1, selectionRequests: 1 });
});

test('validated Interpreter choices survive leaving and reactivating the same Document without another catalog request', async (t) => {
  const f = await fixture(t, { secondInterpreter: true });
  const choices = () =>
    [...(f.dom.window.document.querySelector('[aria-label="pageInterpreter"]')?.options ?? [])].map(
      (option) => option.value,
    );
  assert.deepEqual(choices(), ['original', 'other']);
  await f.hide();
  await f.show();
  assert.deepEqual(choices(), ['original', 'other']);
  assert.deepEqual(f.counts(), { sessions: 1, listRequests: 1, selectionRequests: 1 });
});

test('a confirmed new identity scope reads fresh choices and cannot borrow the previous validated Interpreter metadata', async (t) => {
  const f = await fixture(t, { secondInterpreter: true, secondInterpreterOnlyInFirstScope: true });
  assert.deepEqual(
    [...f.dom.window.document.querySelector('[aria-label="pageInterpreter"]').options].map(
      (option) => option.value,
    ),
    ['original', 'other'],
  );
  await f.changeIdentity();
  assert.equal(
    f.dom.window.document.querySelector('[aria-label="pageInterpreter"]'),
    null,
    'the old second Interpreter is absent from the new scope catalog',
  );
  assert.equal(
    f.dom.window.document.querySelector('[data-native-session]'),
    null,
    'cached UI metadata never grants the old Session to a new identity',
  );
  assert.equal(f.association(), undefined);
  assert.equal(f.counts().listRequests, 2, 'a real scope change performs a fresh directory read');
});

test('a new resource adapter lifetime refreshes Interpreter metadata without preparing another Session', async (t) => {
  const f = await fixture(t, { secondInterpreter: true });
  assert.deepEqual(
    [...f.dom.window.document.querySelector('[aria-label="pageInterpreter"]').options].map(
      (option) => option.value,
    ),
    ['original', 'other'],
  );
  const association = f.association();
  await f.replaceResourceAdapter();
  assert.equal(
    f.dom.window.document.querySelector('[aria-label="pageInterpreter"]'),
    null,
    'new adapter catalog removed the previous second Interpreter',
  );
  assert.deepEqual(
    f.association(),
    association,
    'refreshing display metadata does not replace the Core Session',
  );
  assert.deepEqual(f.counts(), { sessions: 1, listRequests: 2, selectionRequests: 1 });
});
