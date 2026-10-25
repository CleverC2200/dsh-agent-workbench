import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { zh } from '../src/company/locales.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyOfficialCore } from '../scripts/verify-official-input.mjs';
const corePath = resolve(process.env.DSH_TEST_CORE ?? '../../official-latest-standard');
verifyOfficialCore(corePath);
const { SlotCore } = await import(
  pathToFileURL(resolve(corePath, 'packages/client/ui-slots/lib/index.js')).href
);
const require = createRequire(import.meta.url);
const bundle = await build({
  stdin: {
    contents: `export {ConversationContent} from ${JSON.stringify(resolve(corePath, 'packages/client/ui-conversation/src/client/skeleton/ConversationContent.tsx'))};export {mountCompanyUI} from './src/company/ui.tsx';export {WorkbenchController} from './src/workbench.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  jsx: 'automatic',
  platform: 'node',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  loader: { '.png': 'dataurl', '.css': 'text' },
  plugins: [
    {
      name: 'node-css-modules',
      setup(build) {
        build.onLoad({ filter: /\.module\.css$/ }, (args) => ({
          contents: readFileSync(args.path, 'utf8'),
          loader: 'text',
        }));
      },
    },
  ],
});
const module = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(
  module,
  module.exports,
  require,
);
const { mountCompanyUI, WorkbenchController, ConversationContent } = module.exports;
function fixture(
  account,
  panels = [{ options: { id: 'plugins', label: () => '插件管理' } }],
  { memory, restorePageSession, slotCore, navigation, businessNavigation } = {},
) {
  const entries = [],
    calls = [];
  let navigationConsumer, disposeNavigation;
  const attachNavigation = () => {
    if (!businessNavigation || !navigationConsumer) return;
    const cleanups = [];
    navigationConsumer({
      ...ctx,
      businessNavigation,
      effect: (setup) => {
        const cleanup = setup();
        if (typeof cleanup === 'function') cleanups.push(cleanup);
      },
    });
    disposeNavigation = () => cleanups.forEach((cleanup) => cleanup());
  };
  const panelEntries = () =>
    Array.isArray(panels) ? panels : panels.entriesOfSlot('sidebar.panellist');
  const ctx = {
    layout: {
      selectPanel: (id) => calls.push(['panel', id]),
      toggleSidebar: () => calls.push(['toggle']),
    },
    uiWorkspace: { startSession: () => calls.push(['new']) },
    locale: {
      getSnapshot: () => ({ active: 'zh' }),
      subscribe: () => () => {},
      bind: () => (key) => zh[key] ?? key,
    },
    slots: {
      entries: (name) =>
        !Array.isArray(panels)
          ? panels.entries(name)
          : name === 'sidebar.panellist'
            ? panels
            : [
                { options: { key: 'gea-proof' } },
                { options: { key: 'inventory-fc' } },
                { options: { key: 'plugins' } },
                ...entries.filter((entry) => entry.options.name === 'main'),
              ],
      entriesOfSlot: (name) =>
        !Array.isArray(panels) ? panels.entriesOfSlot(name) : ctx.slots.entries(name),
      subscribe: (name, listener) =>
        Array.isArray(panels) ? () => {} : panels.subscribe(name, listener),
      inject: (_name, fn) => fn(),
      register: (options, component) => {
        entries.push({ options, component });
        return slotCore ? slotCore.register(options, component) : () => {};
      },
    },
    inject: (names, fn) => {
      if (account && names.includes('businessAccount')) fn({ ...ctx, businessAccount: account });
      if (names.includes('businessNavigation')) {
        navigationConsumer = fn;
        attachNavigation();
      }
    },
    effect: () => {},
    ...navigation,
  };
  const workbench = new WorkbenchController(
    {
      panel: (id) => calls.push(['page', id]),
      document: (id) => calls.push(['document', id]),
      hasPanel: (id) => ctx.slots.entries('main').some((entry) => entry.options.key === id),
    },
    memory,
  );
  mountCompanyUI(ctx, workbench, restorePageSession);
  const renderSlot = (name, props = {}, options = {}) => {
    if (name === 'sidebar.panellist') {
      const entry = panelEntries().find((row) => row.options.id === options.only);
      return entry?.component
        ? React.createElement(entry.component, props)
        : React.createElement('svg', {
            'data-public-panel-icon': options.only,
            'data-active': props.active,
          });
    }
    if (name === 'sidebar.toggle.badge' && !Array.isArray(panels)) {
      const entry = panels.entriesOfSlot(name)[0];
      return entry ? React.createElement(entry.component, props) : null;
    }
    if (name === 'sidebar.workspaces')
      return React.createElement('div', { 'data-slot': name }, props.heading, name);
    const entry = entries.find((entry) => entry.options.name === name);
    return React.createElement(
      'div',
      { 'data-slot': name },
      entry ? React.createElement(entry.component, props) : name,
    );
  };
  return {
    ctx,
    entries,
    calls,
    workbench,
    renderSlot,
    replaceBusinessNavigation: (next) => {
      disposeNavigation?.();
      businessNavigation = next;
      attachNavigation();
    },
  };
}

test('company new-conversation buttons create through Core without adopting a stale blank Session', async (t) => {
  const dom = new JSDOM('<main id="root"></main>', { pretendToBeVisual: true });
  const saved = ['window', 'document', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
  );
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['Node', dom.window.Node],
    ['navigator', dom.window.navigator],
    ['IS_REACT_ACT_ENVIRONMENT', true],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await React.act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const calls = [],
    legacy = {
      id: 'blank-old',
      blank: true,
      cwd: '/user-project',
      retainedBy: { mainView: 1 },
      updatedAt: 1,
      projectionValues: { agentPreset: 'custom-removed' },
    };
  const navigation = {
    layout: { beginNavigation: () => new AbortController().signal, toggleSidebar() {} },
    sessions: {
      list: {
        getSnapshot: () => ({ phase: 'ready', ids: [legacy.id], byId: { [legacy.id]: legacy } }),
      },
      create: async (options) => {
        calls.push(['create', options]);
        return 'fresh';
      },
    },
    workspaces: {
      list: {
        getSnapshot: () => ({
          phase: 'ready',
          items: [
            { workspaceId: 'user-workspace', path: '/user-project', sessionIds: [legacy.id] },
          ],
        }),
      },
    },
    uiWorkspace: {
      startSession() {
        throw Error('agent-preset/not-found: custom-removed');
      },
      openSession(id) {
        calls.push(['open', id]);
      },
    },
  };
  const { entries, renderSlot } = fixture(undefined, undefined, { navigation });
  for (const name of ['sidebar', 'shell.leading']) {
    const entry = entries.find((row) => row.options.name === name);
    await React.act(() =>
      root.render(
        React.createElement(entry.component, {
          collapsed: false,
          width: 280,
          usePanelInfo: (fn) => fn({ activePanelId: null }),
          renderSlot,
        }),
      ),
    );
    for (const button of document.querySelectorAll('button[aria-label="新会话"]')) {
      await React.act(async () => {
        button.click();
      });
    }
  }
  assert.equal(calls.length, 4, 'both plugin controls create and open a fresh Session');
  for (let i = 0; i < calls.length; i += 2) {
    assert.deepEqual(calls[i], ['create', { workspaceId: 'user-workspace' }]);
    assert.deepEqual(calls[i + 1], ['open', 'fresh']);
  }
  assert.equal(legacy.projectionValues.agentPreset, 'custom-removed');
  navigation.sessions.create = async () => {
    throw Error('Unknown agent preset: user-default');
  };
  const warning = entries.find((row) => row.options.id === 'gea-conversation-creation-warning');
  const leading = entries.find((row) => row.options.name === 'shell.leading');
  await React.act(() =>
    root.render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(leading.component),
        React.createElement(warning.component),
      ),
    ),
  );
  await React.act(async () => document.querySelector('button[aria-label="新会话"]').click());
  assert.match(
    document.querySelector('[role="alert"]').textContent,
    /新会话创建失败.*user-default/,
  );
  assert.equal(calls.length, 4, 'failure must not replace the current Session');
});
test('formal sidebar renders original button/icon hierarchy and the actual workspace/settings seats without details redesign', () => {
  const { entries, renderSlot } = fixture(navigationAccount);
  const entry = entries.find((e) => e.options.name === 'sidebar');
  const markup = renderToStaticMarkup(
    React.createElement(entry.component, {
      collapsed: false,
      width: 280,
      usePanelInfo: (fn) => fn({ activePanelId: 'inventory-fc' }),
      renderSlot,
    }),
  );
  for (const text of [
    'Synear GEA',
    '智能体工作台',
    '业务工作台',
    '历史会话',
    '本地原型',
    '品类计划（模拟）',
    '区域计划（模拟）',
    '产能评估(待设计)',
  ])
    assert.ok(markup.includes(text), text);
  assert.ok(markup.includes('sidebar.workspaces'));
  assert.ok(markup.includes('AI工作台'));
  assert.ok(markup.includes('sidebar.settings'));
  assert.ok(markup.includes('gea-brand-copy'));
  assert.ok(markup.includes('gea-shell-nav-heading'));
  assert.ok(markup.includes('gea-shell-nav-icon'));
  assert.ok(!markup.includes('<details'));
  assert.ok(!markup.includes('<summary'));
  assert.ok(!markup.includes('workbench-sidebar'));
  assert.ok(markup.includes('disabled=""'), 'unavailable registered-page entries remain disabled');
});
test('formal static controls restore original card and SVG structure without old host selectors', () => {
  const { entries, renderSlot } = fixture();
  const sidebar = entries.find((row) => row.options.name === 'sidebar');
  const markup = renderToStaticMarkup(
    React.createElement(sidebar.component, {
      collapsed: false,
      width: 280,
      usePanelInfo: (selector) => selector({ activePanelId: null }),
      renderSlot,
    }),
  );
  const dom = new JSDOM(markup);
  const button = dom.window.document.querySelector('.gea-ai-workbench-entry');
  assert.ok(button, 'AI workbench uses its own card rather than drawer-tab styling');
  assert.equal(button.querySelector('svg').getAttribute('viewBox'), '0 0 24 24');
  assert.equal(button.querySelector('.gea-ai-entry-label').textContent, 'AI工作台');
  assert.equal(
    dom.window.document.querySelector('.gea-owned-sidebar-toggle svg').getAttribute('viewBox'),
    '0 0 16 16',
  );
  dom.window.close();
});
test('formal account contribution renders the GEA read-only avatar and pending label', () => {
  const { entries } = fixture();
  const entry = entries.find((e) => e.options.name === 'settings.launcher');
  const markup = renderToStaticMarkup(
    React.createElement(entry.component, {
      wide: true,
      settingsOpen: false,
      openSettings: () => {},
    }),
  );
  assert.ok(markup.includes('账户菜单'));
  assert.ok(markup.includes('正在确认 GEA 身份'));
  assert.ok(markup.includes('gea-user-avatar'));
  assert.ok(!markup.includes('workbench-avatar'));
});
test('actual owned anchors constrain the bell and keep one workspace heading inside the browser', (t) => {
  const { entries, renderSlot } = fixture();
  const entry = entries.find((row) => row.options.name === 'sidebar');
  const markup = renderToStaticMarkup(
    React.createElement(entry.component, {
      collapsed: false,
      width: 280,
      usePanelInfo: (selector) => selector({ activePanelId: null }),
      renderSlot,
    }),
  );
  const dom = new JSDOM(
    '<style>' + readFileSync('src/company/layout.css', 'utf8') + '</style>' + markup,
  );
  t.after(() => dom.window.close());
  const document = dom.window.document,
    row = document.querySelector('.gea-sidebar-brand-row'),
    bell = document.querySelector('[aria-label="消息待办"]'),
    browser = document.querySelector('.gea-workspace-owned');
  assert.equal(bell.parentElement, row);
  assert.equal(
    dom.window.getComputedStyle(row).position,
    'relative',
    'the original absolute bell anchors to the brand row',
  );
  assert.equal(
    dom.window.getComputedStyle(browser).order,
    '4',
    'the owned wrapper receives the original browser order rather than the unmatched native-slot selector',
  );
  const siblings = [...browser.parentElement.children];
  assert.ok(
    siblings.indexOf(document.querySelector('.gea-drawer-function')) < siblings.indexOf(browser),
  );
  assert.equal(document.querySelectorAll('.gea-drawer-recent').length, 1);
  assert.equal(browser.querySelectorAll('.gea-workspace-heading').length, 0);
});
test('formal business navigation removes the Workbench directory and retains the registered public Plugins label', () => {
  const { entries, renderSlot } = fixture();
  const entry = entries.find((row) => row.options.name === 'sidebar');
  const markup = renderToStaticMarkup(
    React.createElement(entry.component, {
      collapsed: false,
      width: 280,
      usePanelInfo: (fn) => fn({ activePanelId: 'gea-proof' }),
      renderSlot,
    }),
  );
  assert.ok(markup.includes('插件管理'));
  assert.equal(
    new JSDOM(markup).window.document.querySelector('[data-gea-business-entry="workbench"]'),
    null,
  );
  assert.ok(!markup.includes('>plugins</span>'));
  const dom = new JSDOM(markup);
  const entryButton = dom.window.document.querySelector('.gea-plugin-entry');
  assert.equal(entryButton.textContent, '插件管理');
  assert.equal(dom.window.document.querySelectorAll('.gea-plugin-entry').length, 1);
  assert.equal(dom.window.document.querySelector('.gea-shell-plugin-group'), null);
  assert.equal(
    entryButton.previousElementSibling.classList.contains('gea-ai-workbench-entry'),
    true,
  );
  assert.equal(entryButton.nextElementSibling.classList.contains('gea-sidebar-region'), true);
  dom.window.close();
  assert.ok(!markup.includes('公共工具与原型'));
});
function nativeFactory(_name, options, extension, sessionId) {
  const shares = {
    t: (key) => (key === 'hero.chooseWorkspace' ? '选择工作区' : key),
    sessionId,
    useWorkspaces: (selector) => selector({ items: [] }),
    selectWorkspace: () => {},
    renderSlot: (name) => React.createElement('article', { 'data-native-seat': name }),
  };
  const Views = extension.slots.views;
  return React.createElement(
    'div',
    { 'data-native-content': options.variant },
    React.createElement(
      'div',
      { 'data-native-flow': true },
      sessionId && Views ? React.createElement(Views, shares) : null,
    ),
    React.createElement(
      'div',
      { 'data-root-controls': true },
      React.createElement(extension.slots.widthControls, shares),
    ),
  );
}
function officialContentProps(overrides = {}) {
  return {
    phase: 'hero',
    variant: 'main',
    hero: true,
    useSession: () => undefined,
    useSessions: (select) => select({ byId: {} }),
    useSessionStatus: (select) => select({ get: () => undefined }),
    useWorkspaces: (select) => select({ items: [] }),
    useInput: () => undefined,
    useComposerBlock: () => undefined,
    useFactorySlot: (_name, fallback) => fallback,
    t: (key) => (key === 'hero.chooseWorkspace' ? '选择工作区' : key),
    selectWorkspace: () => Promise.resolve(),
    renderSlot: (name) => React.createElement('article', { 'data-native-seat': name }),
    renderSlotChain: (_name, _owner, options) => options.fallback,
    ...overrides,
  };
}
test('official Home remains Core-owned while the company brand and retained resources stay available', () => {
  const { entries } = fixture();
  assert.equal(entries.filter((e) => e.options.name === 'main.conversation').length, 0);
  const welcome = entries.find((e) => e.options.name === 'conversation.hero.content');
  const markup = renderToStaticMarkup(React.createElement(welcome.component));
  const document = new JSDOM(markup).window.document;
  assert.equal(document.querySelector('h1').textContent, 'AI不止于对话，更融入工作');
  assert.deepEqual(
    [...document.querySelectorAll('h1 span')].map((node) => node.textContent),
    ['AI', '工作'],
  );
  assert.equal(document.querySelector('p').textContent, '懂业务 · 会协同 · 能行动');
  assert.equal(markup.includes('预览版'), false);
  assert.equal(
    entries.some((e) => e.options.name === 'main' && e.options.key === 'agent-workbench'),
    false,
  );
});
test('official blank Home keeps its native workspace, Agent and composer seats without company overrides', () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationContent, officialContentProps()),
  );
  for (const seat of [
    'conversation.hero.content',
    'conversation.hero.workspace',
    'conversation.hero.agentPreset',
    'conversation.composer.bar',
  ])
    assert.ok(markup.includes(seat), seat);
  assert.match(markup, /data-conversation-content/);
  assert.equal(markup.includes('gea-home-hero'), false);
  assert.equal(markup.includes('data-resource-selection'), false);
});
test('business Documents have a persistent independent Session seat and retain the original resource module', () => {
  const { entries } = fixture();
  const overlay = entries.find(
    (e) => e.options.name === 'shell.overlay' && e.options.id === 'agent-workbench.documents',
  );
  assert.deepEqual(overlay.options.children, {
    'agent-workbench.documents': { kind: 'single', scope: 'session-maybe' },
  });
  assert.equal(entries.filter((e) => e.options.name === 'agent-workbench.documents').length, 1);
  assert.equal(
    entries.some((e) => e.options.name === 'conversation.header'),
    false,
  );
  assert.equal(
    entries.some((e) => e.options.name === 'conversation.hero.workspace'),
    false,
  );
  assert.equal(
    entries.some((e) => e.options.name === 'conversation.hero.agentPreset'),
    false,
  );
});
test('the Workbench directory page and slot are unregistered while business Documents remain available', () => {
  const { entries, workbench } = fixture();
  assert.equal(
    entries.some((row) => row.options.name === 'agent-workbench.directory'),
    false,
  );
  assert.equal(
    entries.some((row) => row.options.name === 'main' && row.options.key === 'agent-workbench'),
    false,
  );
  assert.equal(
    workbench.getSnapshot().pages.some((page) => page.id === 'agent-workbench'),
    false,
  );
});
test('formal registrations use the fixed public declaration ledger without taking Core-owned children', () => {
  const core = new SlotCore();
  core.register(
    {
      name: 'root',
      children: {
        sidebar: { kind: 'single', scope: 'root' },
        main: { kind: 'keyed', scope: 'root' },
        'shell.overlay': { kind: 'list', scope: 'root' },
        'shell.leading': { kind: 'single', scope: 'root' },
      },
    },
    () => null,
  );
  core.register(
    {
      name: 'main',
      key: 'conversation',
      children: { 'main.conversation': { kind: 'single', scope: 'session-maybe' } },
    },
    () => null,
  );
  core.register(
    {
      name: 'main.conversation',
      children: { 'conversation.header': { kind: 'single', scope: 'session-maybe' } },
    },
    () => null,
  );
  core.registerFactory(
    {
      name: 'conversation.content',
      scope: 'session-maybe',
      children: {
        'conversation.hero.content': { kind: 'single', scope: 'root' },
        'conversation.hero.workspace': { kind: 'single', scope: 'root' },
        'conversation.hero.agentPreset': { kind: 'single', scope: 'session-maybe' },
      },
    },
    () => null,
  );
  core.register(
    {
      name: 'conversation.header',
      children: { 'settings.launcher': { kind: 'single', scope: 'root' } },
    },
    () => null,
  );
  const { entries } = fixture();
  for (const entry of entries)
    assert.doesNotThrow(() => core.register(entry.options, entry.component));
  assert.equal(core.entriesOfSlot('main.conversation')[0].options.priority ?? 0, 0);
  assert.equal(core.entriesOfSlot('sidebar').length, 1);
});
test('Core keeps the native header owner while Workbench takes only the selected business Document', () => {
  const core = new SlotCore();
  core.register(
    {
      name: 'root',
      children: {
        sidebar: { kind: 'single', scope: 'root' },
        main: { kind: 'keyed', scope: 'root' },
        'shell.overlay': { kind: 'list', scope: 'root' },
        'shell.leading': { kind: 'single', scope: 'root' },
      },
    },
    () => null,
  );
  core.register(
    {
      name: 'main',
      key: 'conversation',
      children: {
        'main.conversation': { kind: 'single', scope: 'session-maybe' },
      },
    },
    () => null,
  );
  const Native = () => null;
  core.register(
    {
      name: 'main.conversation',
      children: {
        'conversation.header': { kind: 'single', scope: 'session-maybe' },
      },
    },
    Native,
  );
  core.register(
    {
      name: 'conversation.header',
      children: {
        'settings.launcher': { kind: 'single', scope: 'root' },
      },
    },
    () => null,
  );
  core.registerFactory(
    {
      name: 'conversation.content',
      scope: 'session-maybe',
      children: { 'conversation.hero.content': { kind: 'single', scope: 'root' } },
    },
    () => null,
  );
  const { workbench } = fixture(undefined, undefined, { slotCore: core });
  assert.equal(core.entriesOfSlot('main.conversation')[0].component, Native);
  workbench.registerFrame({
    id: 'header-test-page',
    kind: 'local',
    label: '业务页面',
    body: () => null,
  });
  workbench.open('header-test-page');
  assert.equal(core.entriesOfSlot('main.conversation')[0].options.priority, -20);
  assert.equal(core.entriesOfSlot('conversation.header').length, 1);
  workbench.leaveDocument();
  assert.equal(core.entriesOfSlot('main.conversation')[0].component, Native);
  assert.equal(core.entriesOfSlot('conversation.header').length, 1);
});
test('formal account menu preserves keyboard focus and dismissal while ignoring a late logout UI completion', async (t) => {
  const dom = new JSDOM('<main id="root"></main>', { pretendToBeVisual: true });
  const saved = ['window', 'document', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
  );
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['Node', dom.window.Node],
    ['navigator', dom.window.navigator],
    ['IS_REACT_ACT_ENVIRONMENT', true],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const snapshot = {
    state: 'confirmed',
    scope: 'host-fixture',
    status: {
      environment: 'test',
      environments: ['production', 'test'],
      authenticated: true,
      user: { name: 'Fixture User' },
    },
  };
  const delayed = Promise.withResolvers();
  let logoutSignal;
  const authority = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    logout: (signal) => {
      logoutSignal = signal;
      return delayed.promise;
    },
  };
  const { entries } = fixture(authority);
  const entry = entries.find((row) => row.options.name === 'settings.launcher');
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, value] of saved) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
    }
  });
  await act(async () =>
    root.render(
      React.createElement(entry.component, {
        wide: true,
        settingsOpen: false,
        openSettings: () => {},
      }),
    ),
  );
  const trigger = document.querySelector('button[aria-label="账户菜单"]');
  await act(async () => trigger.click());
  assert.equal(document.activeElement.textContent, '⚙设置');
  await act(async () =>
    document.activeElement.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    ),
  );
  assert.equal(document.activeElement.textContent, '退出登录');
  await act(async () => document.activeElement.click());
  await act(async () =>
    document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  );
  assert.equal(document.activeElement, trigger);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(logoutSignal.aborted, true);
  await act(async () => trigger.click());
  await act(async () => delayed.resolve());
  assert.equal(
    trigger.getAttribute('aria-expanded'),
    'true',
    'late completion cannot close a newer menu owner',
  );
});
test('formal Workspace trigger anchors the public menu and delegates selection through the official action', async (t) => {
  const dom = new JSDOM('<main id="root"></main>', { pretendToBeVisual: true });
  const saved = [
    'window',
    'document',
    'Node',
    'navigator',
    'IS_REACT_ACT_ENVIRONMENT',
    'ResizeObserver',
  ].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['Node', dom.window.Node],
    ['navigator', dom.window.navigator],
    ['IS_REACT_ACT_ENVIRONMENT', true],
    [
      'ResizeObserver',
      class {
        constructor(callback) {
          this.callback = callback;
        }
        observe(target) {
          this.callback([{ target }]);
        }
        disconnect() {}
      },
    ],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const root = createRoot(document.getElementById('root'));
  let menu;
  const picks = [];
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, value] of saved) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
    }
  });
  const shares = {
    t: (key) => (key === 'hero.chooseWorkspace' ? '选择工作区' : key),
    sessionId: 'blank',
    useWorkspaces: (selector) => selector({ items: [] }),
    selectWorkspace: (id) => {
      picks.push(id);
      return Promise.resolve();
    },
    renderSlot: (name, props) => {
      if (name === 'conversation.hero.workspace') menu = props;
      return React.createElement('article', { 'data-native-seat': name });
    },
  };
  await act(async () =>
    root.render(
      React.createElement(
        ConversationContent,
        officialContentProps({
          sessionId: 'blank',
          useSession: () => ({ blank: true }),
          selectWorkspace: shares.selectWorkspace,
          renderSlot: shares.renderSlot,
          useFactorySlot: (name, fallback) =>
            name === 'views' ? () => shares.renderSlot('conversation.session', {}) : fallback,
        }),
      ),
    ),
  );
  const trigger = document.querySelector('button[aria-label="选择工作区"]');
  assert.equal(menu.anchorRef.current, trigger);
  assert.equal(trigger.querySelector('svg').getAttribute('viewBox'), '0 0 16 16');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  await act(async () => trigger.click());
  assert.equal(menu.open, true);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  await act(async () => menu.onPick('actual-workspace'));
  assert.deepEqual(picks, ['actual-workspace']);
  assert.equal(menu.open, false);
});
test('entering a business page opens its functional drawer once and preserves manual History selection within business', async (t) => {
  const dom = new JSDOM('<main id="root"></main>', { pretendToBeVisual: true });
  const saved = ['window', 'document', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
  );
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['Node', dom.window.Node],
    ['navigator', dom.window.navigator],
    ['IS_REACT_ACT_ENVIRONMENT', true],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const { entries, renderSlot } = fixture();
  const entry = entries.find((row) => row.options.name === 'sidebar');
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, value] of saved) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
    }
  });
  const render = async (activePanelId) =>
    act(async () =>
      root.render(
        React.createElement(entry.component, {
          collapsed: false,
          width: 280,
          usePanelInfo: (selector) => selector({ activePanelId }),
          renderSlot,
        }),
      ),
    );
  const drawer = () => document.querySelector('.gea-sidebar-region').dataset.geaDrawer;
  await render(null);
  assert.equal(drawer(), 'function');
  await render('gea-inbox');
  assert.equal(
    drawer(),
    'function',
    'a directory/notification arrival opens the business navigation',
  );
  await act(async () => document.querySelector('.gea-drawer-recent .gea-sidebar-tab').click());
  assert.equal(drawer(), 'workspace');
  await render('inventory-fc');
  assert.equal(
    drawer(),
    'workspace',
    'business-to-business rerenders do not seize the user drawer',
  );
  await render(null);
  assert.equal(drawer(), 'workspace');
  await render('gea-proof');
  assert.equal(drawer(), 'function', 'a later new business entry restores the original transition');
});

test('opening real history from a static Document returns to native Conversation without clearing the initial static presentation', async (t) => {
  const dom = new JSDOM('<main id="root"></main>', { pretendToBeVisual: true });
  const saved = ['window', 'document', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'].map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
  );
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['Node', dom.window.Node],
    ['navigator', dom.window.navigator],
    ['IS_REACT_ACT_ENVIRONMENT', true],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const { entries, workbench } = fixture();
  const entry = entries.find((row) => row.options.name === 'agent-workbench.documents');
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, value] of saved) {
      if (value) Object.defineProperty(globalThis, key, value);
      else delete globalThis[key];
    }
  });
  workbench.registerFrame({ id: 'static-document', kind: 'local', body: () => null });
  await workbench.open('static-document');
  const render = async (sessionId) =>
    act(async () =>
      root.render(
        React.createElement(entry.component, {
          sessionId,
          useSession: (selector) =>
            selector({ blank: false, running: false, promptAttempted: true, openState: 'open' }),
          useConversation: (selector) => selector({ activeTargets: new Set(['chat']) }),
          useSessions: (selector) => selector({ phase: 'ready', ids: [], byId: {} }),
          renderFactorySlot: (name, ...args) =>
            name === 'agent-workbench.document'
              ? React.createElement('article', { 'data-static-document': true })
              : nativeFactory(name, ...args, sessionId),
        }),
      ),
    );
  await render('existing-native-session');
  assert.equal(workbench.getSnapshot().selectedDocument.id, 'static-document');
  await render('chosen-history-session');
  assert.equal(
    workbench.getSnapshot().selectedDocument,
    undefined,
    'the changed real main Session belongs to the native history view',
  );
  assert.ok(document.querySelector('.gea-workbench-documents[hidden]'));
});

async function mountedDom(t) {
  const dom = new JSDOM('<main id="root"></main>', {
    pretendToBeVisual: true,
    url: 'http://localhost',
  });
  const values = {
    window: dom.window,
    document: dom.window.document,
    Node: dom.window.Node,
    navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: () => {
      throw Error('Account presentation must not fetch business/model routes');
    },
  };
  const saved = Object.keys(values).map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await React.act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return { root, dom };
}

async function mountedMainConversation(t, options = {}) {
  const { root } = await mountedDom(t);
  const { entries, workbench } = fixture(options.account, undefined, options);
  const entry = entries.find((row) => row.options.name === 'agent-workbench.documents');
  const render = (sessionId, epoch = 0) =>
    React.act(async () =>
      root.render(
        React.createElement(entry.component, {
          key: epoch,
          sessionId,
          useSession: (selector) =>
            selector(
              sessionId
                ? { blank: false, running: false, promptAttempted: true, openState: 'open' }
                : undefined,
            ),
          useConversation: (selector) => selector({ activeTargets: new Set(['chat']) }),
          useSessions: (selector) =>
            selector(options.catalogue ?? { phase: 'ready', ids: [], byId: {} }),
          renderFactorySlot: (name, ...args) =>
            name === 'agent-workbench.document'
              ? React.createElement('iframe', { 'data-restored-document': true })
              : nativeFactory(name, ...args, sessionId),
        }),
      ),
    );
  return { workbench, render };
}

test('first Core main Session hydration preserves the restored unbound Document presentation', async (t) => {
  let saved = { version: 2, page: 'gea-proof', selections: [], views: [] };
  const { workbench, render } = await mountedMainConversation(t, {
    memory: {
      getSnapshot: () => saved,
      set: (value) => (saved = structuredClone(value)),
    },
  });
  workbench.registerFrame({ id: 'gea-proof', kind: 'local', body: () => null });
  await render(undefined);
  assert.equal(workbench.getSnapshot().selectedDocument.id, 'gea-proof');
  await render('session-a');
  assert.equal(workbench.getSnapshot().selectedDocument?.id, 'gea-proof');
  assert.equal(saved.page, 'gea-proof');
  assert.equal(
    document.querySelector('[data-restored-document]').parentElement.style.display,
    'flex',
  );
  assert.equal(workbench.getSnapshot().selection, undefined);
});

test('a later main Session remount leaves the restored unbound Document', async (t) => {
  const { workbench, render } = await mountedMainConversation(t, {
    memory: {
      getSnapshot: () => ({ version: 2, page: 'gea-proof', selections: [], views: [] }),
      set: () => {},
    },
  });
  workbench.registerFrame({ id: 'gea-proof', kind: 'local', body: () => null });
  await render(undefined);
  await render('session-a');
  await render('session-b', 1);
  assert.equal(workbench.getSnapshot().selectedDocument, undefined);
  assert.equal(
    document.querySelector('[data-restored-document]').parentElement.style.display,
    'none',
  );
  assert.ok(document.querySelector('.gea-workbench-documents[hidden]'));
});

test('closing the main Session consumes the initial allowance before another Session is adopted', async (t) => {
  const { workbench, render } = await mountedMainConversation(t, {
    memory: {
      getSnapshot: () => ({ version: 2, page: 'gea-proof', selections: [], views: [] }),
      set: () => {},
    },
  });
  workbench.registerFrame({ id: 'gea-proof', kind: 'local', body: () => null });
  await render(undefined);
  await render('session-a');
  await render(undefined, 1);
  assert.equal(workbench.getSnapshot().selectedDocument, undefined);
  await React.act(async () => workbench.open('gea-proof'));
  await render('session-b', 1);
  assert.equal(workbench.getSnapshot().selectedDocument, undefined);
});

test('an ordinary initial Session consumes the allowance before a late page registration restores presentation', async (t) => {
  const { workbench, render } = await mountedMainConversation(t, {
    memory: {
      getSnapshot: () => ({ version: 2, page: 'gea-proof', selections: [], views: [] }),
      set: () => {},
    },
  });
  await render('session-a');
  await React.act(async () =>
    workbench.registerFrame({ id: 'gea-proof', kind: 'local', body: () => null }),
  );
  assert.equal(workbench.getSnapshot().restoredWithoutSession, true);
  await render('session-b', 1);
  assert.equal(workbench.getSnapshot().selectedDocument, undefined);
});

test('first main Session adoption leaves a manually opened unbound Document', async (t) => {
  const { workbench, render } = await mountedMainConversation(t);
  workbench.registerFrame({ id: 'gea-proof', kind: 'local', body: () => null });
  await workbench.open('gea-proof');
  await render(undefined);
  await render('session-a');
  assert.equal(workbench.getSnapshot().selectedDocument, undefined);
});

test('explicit page History binds its Session before the initial presentation allowance', async (t) => {
  const restored = [];
  const { workbench, render } = await mountedMainConversation(t, {
    memory: {
      getSnapshot: () => ({ version: 2, page: 'gea-proof', selections: [], views: [] }),
      set: () => {},
    },
    restorePageSession: async (page, sessionId, signal, expected) => {
      signal.throwIfAborted();
      restored.push({ page, sessionId, expected });
      workbench.associateSession(page, { sessionId, ...expected, ownerScope: 'owner' });
    },
  });
  workbench.registerFrame({ id: 'gea-proof', kind: 'local', body: () => null });
  await render(undefined);
  const expected = { preset: 'forecast', cwd: '/workspace' };
  await React.act(async () => {
    workbench.showHistory('gea-proof');
    workbench.selectHistorySession('gea-proof', 'session-a', expected);
  });
  await render('session-a');
  assert.deepEqual(restored, [{ page: 'gea-proof', sessionId: 'session-a', expected }]);
  assert.equal(workbench.getSnapshot().selectedDocument.id, 'gea-proof');
  assert.deepEqual(workbench.getSnapshot().selection, {
    sessionId: 'session-a',
    ...expected,
    ownerScope: 'owner',
  });
  assert.equal(workbench.getSnapshot().restoredWithoutSession, undefined);
});

test('main Session observation starts fresh for each mounted company UI lifetime', async (t) => {
  for (const lifetime of ['before UI teardown', 'after UI reconstruction'])
    await t.test(lifetime, async (t) => {
      const { workbench, render } = await mountedMainConversation(t, {
        memory: {
          getSnapshot: () => ({ version: 2, page: 'gea-proof', selections: [], views: [] }),
          set: () => {},
        },
      });
      workbench.registerFrame({ id: 'gea-proof', kind: 'local', body: () => null });
      await render(undefined);
      await render('session-a');
      assert.equal(workbench.getSnapshot().selectedDocument?.id, 'gea-proof');
      await render('session-b', 1);
      assert.equal(workbench.getSnapshot().selectedDocument, undefined);
    });
});

test('a bound Document retains its matching main Session and leaves on a remounted different Session', async (t) => {
  const { workbench, render } = await mountedMainConversation(t);
  workbench.registerFrame({ id: 'gea-proof', kind: 'local', body: () => null });
  workbench.associateSession('gea-proof', {
    sessionId: 'session-a',
    preset: 'forecast',
    ownerScope: 'owner',
  });
  await workbench.open('gea-proof');
  await render('session-a');
  assert.equal(workbench.getSnapshot().selectedDocument.id, 'gea-proof');
  await render('session-b', 1);
  assert.equal(workbench.getSnapshot().selectedDocument, undefined);
});

test('initial main Session observation does not restore a saved page whose Session is missing', async (t) => {
  const sessionId = 'session-00000000-0000-0000-0000-000000000001';
  const restored = [];
  const { workbench, render } = await mountedMainConversation(t, {
    memory: {
      getSnapshot: () => ({
        version: 2,
        page: 'gea-proof',
        selections: [
          { page: 'gea-proof', active: true, sessionId, preset: null, ownerScope: null },
        ],
        views: [],
      }),
      set: () => {},
    },
    restorePageSession: async (...args) => restored.push(args),
  });
  workbench.registerFrame({ id: 'gea-proof', kind: 'local', body: () => null });
  await render(undefined);
  await render('session-a');
  assert.deepEqual(restored, []);
  assert.equal(workbench.getSnapshot().selectedDocument, undefined);
  assert.equal(workbench.recoveryTarget().sessionId, sessionId);
});

test('initial main Session observation preserves validated bound business Session recovery', async (t) => {
  const sessionId = 'session-00000000-0000-0000-0000-000000000001';
  const selection = {
    sessionId,
    preset: 'forecast',
    ownerScope: 'old-owner',
    subject: 'subject',
    cwd: '/workspace',
  };
  const identity = {
    state: 'confirmed',
    scope: 'current-owner',
    subject: 'subject',
    status: { authenticated: true },
  };
  const restored = [];
  const { workbench, render } = await mountedMainConversation(t, {
    account: { getSnapshot: () => identity, subscribe: () => () => {} },
    catalogue: { phase: 'ready', ids: [sessionId], byId: { [sessionId]: { cwd: '/workspace' } } },
    memory: {
      getSnapshot: () => ({
        version: 2,
        page: 'gea-proof',
        selections: [{ page: 'gea-proof', active: true, ...selection }],
        views: [],
      }),
      set: () => {},
    },
    restorePageSession: async (page, sessionId, signal, expected) => {
      signal.throwIfAborted();
      restored.push({ page, sessionId, expected });
      workbench.associateSession(page, { ...selection, ownerScope: 'current-owner' });
    },
  });
  workbench.registerFrame({
    id: 'gea-proof',
    kind: 'local',
    resourceId: 'forecast',
    body: () => null,
  });
  await render(undefined);
  await render(sessionId);
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0], {
    page: 'gea-proof',
    sessionId,
    expected: { page: 'gea-proof', ...selection, resourceId: 'forecast' },
  });
  assert.equal(workbench.getSnapshot().selectedDocument.id, 'gea-proof');
  assert.deepEqual(workbench.getSnapshot().selection, {
    ...selection,
    ownerScope: 'current-owner',
  });
  assert.equal(workbench.getSnapshot().restoredWithoutSession, undefined);
});

test('initial main Session observation keeps GEA identity checks on saved business Session recovery', async (t) => {
  for (const state of ['unknown', 'signed-out'])
    await t.test(state, async (t) => {
      const sessionId = 'session-00000000-0000-0000-0000-000000000001';
      const restored = [];
      const identity =
        state === 'unknown'
          ? { state: 'unknown', scope: null, status: null }
          : { state: 'confirmed', scope: null, subject: null, status: { authenticated: false } };
      const { workbench, render } = await mountedMainConversation(t, {
        account: {
          getSnapshot: () => identity,
          subscribe: () => () => {},
        },
        catalogue: {
          phase: 'ready',
          ids: [sessionId],
          byId: { [sessionId]: { cwd: '/workspace' } },
        },
        memory: {
          getSnapshot: () => ({
            version: 2,
            page: 'gea-proof',
            selections: [
              {
                page: 'gea-proof',
                active: true,
                sessionId,
                preset: 'forecast',
                ownerScope: 'old-owner',
                subject: 'old-subject',
                cwd: '/workspace',
              },
            ],
            views: [],
          }),
          set: () => {},
        },
        restorePageSession: async (...args) => restored.push(args),
      });
      workbench.registerFrame({
        id: 'gea-proof',
        kind: 'local',
        resourceId: 'forecast',
        body: () => null,
      });
      await render(undefined);
      await render('session-a');
      assert.deepEqual(restored, []);
      assert.equal(workbench.getSnapshot().selectedDocument, undefined);
      assert.equal(
        workbench.recoveryTarget()?.sessionId,
        state === 'unknown' ? sessionId : undefined,
      );
    });
});

test('public official and third-party panel rows keep order, icons, activation, live removal and the collapsed badge', async (t) => {
  const { root } = await mountedDom(t);
  const core = new SlotCore();
  core.register(
    { name: 'root', children: { sidebar: { kind: 'single', scope: 'root' } } },
    () => null,
  );
  core.register(
    {
      name: 'sidebar',
      children: {
        'sidebar.panellist': { kind: 'list', scope: 'root' },
        'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
      },
    },
    () => null,
  );
  const icon = (props) =>
    React.createElement('svg', {
      'data-actual-icon': true,
      'data-active': props.active,
      'data-size': props.size,
    });
  core.register(
    { name: 'sidebar.panellist', id: 'plugins', order: 20, label: () => '插件管理' },
    icon,
  );
  const removeSchedule = core.register(
    { name: 'sidebar.panellist', id: 'schedules', order: 10, label: '定时任务' },
    icon,
  );
  core.register({ name: 'sidebar.toggle.badge' }, () =>
    React.createElement('span', { 'data-actual-badge': true }, '3'),
  );
  const { entries, calls, renderSlot, workbench } = fixture(undefined, core);
  workbench.registerFrame({ id: 'fixture-document', kind: 'html', src: '/fixture.html' });
  await workbench.open('fixture-document');
  const sidebar = entries.find((entry) => entry.options.name === 'sidebar');
  const render = (collapsed) =>
    React.act(async () =>
      root.render(
        React.createElement(sidebar.component, {
          collapsed,
          width: collapsed ? 56 : 280,
          usePanelInfo: (selector) => selector({ activePanelId: 'schedules' }),
          renderSlot,
        }),
      ),
    );
  await render(false);
  assert.deepEqual(
    [...document.querySelectorAll('.gea-plugin-entry')].map((button) =>
      button.getAttribute('aria-label'),
    ),
    ['定时任务', '插件管理'],
  );
  assert.equal(
    document.querySelector('[aria-label="定时任务"]').getAttribute('aria-current'),
    'page',
  );
  assert.equal(document.querySelector('[aria-label="定时任务"] svg').dataset.active, 'true');
  await React.act(async () => document.querySelector('[aria-label="定时任务"]').click());
  assert.deepEqual(calls.at(-1), ['panel', 'schedules']);
  assert.equal(workbench.getSnapshot().selectedDocument, undefined);
  const removeThird = await React.act(async () =>
    core.register(
      { name: 'sidebar.panellist', id: 'third-party', order: -1, label: '第三方面板' },
      icon,
    ),
  );
  assert.equal(
    document.querySelector('.gea-plugin-entry').getAttribute('aria-label'),
    '第三方面板',
  );
  await render(true);
  assert.equal(document.querySelector('[aria-label="第三方面板"] svg').dataset.size, '18');
  assert.ok(document.querySelector('.gea-owned-sidebar-toggle [data-actual-badge]'));
  await React.act(async () => document.querySelector('.gea-owned-sidebar-toggle').click());
  assert.deepEqual(calls.at(-1), ['toggle']);
  await React.act(async () => {
    removeSchedule();
    removeThird();
  });
  assert.equal(document.querySelector('[aria-label="定时任务"]'), null);
  assert.equal(document.querySelector('[aria-label="第三方面板"]'), null);
});

test('desktop opens company login once only after GEA confirms signed out', async (t) => {
  const { root, dom } = await mountedDom(t);
  dom.window.dshDesktop = {};
  let snapshot = { state: 'unknown', scope: null, status: null };
  const listeners = new Set(),
    starts = [];
  const authority = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    startLogin: async (signal) => {
      starts.push(signal);
      return { loginId: 'desktop', image: 'data:image/png;base64,AA==', expiresIn: 120 };
    },
    pollLogin: async () => false,
  };
  const { entries } = fixture(authority);
  const account = entries.find((row) => row.options.name === 'settings.launcher');
  const render = () =>
    React.act(async () =>
      root.render(
        React.createElement(account.component, {
          wide: true,
          settingsOpen: false,
          openSettings() {},
        }),
      ),
    );
  const update = async (next) =>
    React.act(async () => {
      snapshot = next;
      for (const changed of listeners) changed();
    });
  const status = {
    environment: 'production',
    environments: ['production'],
    authenticated: false,
    loginState: 'signed-out',
    user: null,
  };
  await render();
  assert.equal(document.querySelector('[role="dialog"]'), null);
  await update({ state: 'confirmed', scope: null, error: 'offline', status });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  await update({
    state: 'confirmed',
    scope: 'signed-in',
    status: { ...status, authenticated: true, user: { name: 'Host User' } },
  });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  await update({ state: 'confirmed', scope: null, status });
  assert.ok(document.querySelector('[role="dialog"] .gea-account-login-qr img'));
  assert.equal(starts.length, 1);
  await React.act(async () => document.querySelector('.gea-account-login-close').click());
  assert.equal(starts[0].aborted, true);
  await update({ state: 'confirmed', scope: null, status: { ...status } });
  await React.act(async () => root.render(null));
  await render();
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(starts.length, 1);
  assert.equal(dom.window.localStorage.length, 0);
});

test('account QR login uses only GEA authority, refresh cancels the old challenge and Host subscription owns success', async (t) => {
  const { root, dom } = await mountedDom(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  let snapshot = {
    state: 'confirmed',
    scope: null,
    status: {
      environment: 'test',
      environments: ['production', 'test'],
      authenticated: false,
      user: null,
    },
  };
  const listeners = new Set(),
    starts = [],
    polls = [];
  const delayedPoll = Promise.withResolvers();
  const authority = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    startLogin: async (signal) => {
      starts.push(signal);
      return {
        loginId: 'challenge-' + starts.length,
        image: 'data:image/png;base64,AA==',
        expiresIn: 120,
      };
    },
    pollLogin: (id, signal) => {
      polls.push({ id, signal });
      return delayedPoll.promise;
    },
  };
  const { entries, calls } = fixture(authority);
  const account = entries.find((row) => row.options.name === 'settings.launcher');
  await React.act(async () =>
    root.render(
      React.createElement(account.component, {
        wide: true,
        settingsOpen: false,
        openSettings: () => {},
      }),
    ),
  );
  const trigger = document.querySelector('[aria-label="账户菜单"]');
  await React.act(async () => trigger.click());
  assert.equal(starts.length, 0);
  await React.act(async () =>
    [...document.querySelectorAll('[role="menuitem"]')]
      .find((button) => button.textContent === '登录 GEA')
      .click(),
  );
  assert.equal(starts.length, 1);
  assert.ok(document.querySelector('[role="dialog"] img'));
  assert.deepEqual(calls, []);
  await React.act(async () => t.mock.timers.tick(500));
  assert.equal(polls[0].id, 'challenge-1');
  await React.act(async () =>
    [...document.querySelectorAll('[role="dialog"] button')]
      .find((button) => button.textContent === '刷新二维码')
      .click(),
  );
  assert.equal(starts[0].aborted, true);
  assert.equal(polls[0].signal.aborted, true);
  assert.equal(starts.length, 2);
  await React.act(async () => delayedPoll.resolve(true));
  assert.ok(
    document.querySelector('[role="dialog"]'),
    'old poll cannot close a refreshed challenge',
  );
  await React.act(async () => {
    snapshot = {
      state: 'confirmed',
      scope: 'host-authenticated',
      status: {
        environment: 'test',
        environments: ['production', 'test'],
        authenticated: true,
        user: { name: 'Host User' },
      },
    };
    for (const changed of listeners) changed();
  });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(starts[1].aborted, true);
  assert.ok(trigger.textContent.includes('Host User'));
  assert.equal(dom.window.localStorage.length, 0);
});

test('closing and unmounting account QR login abort actual requests and ignore late start responses', async (t) => {
  const { root, dom } = await mountedDom(t);
  const delayed = Promise.withResolvers(),
    starts = [];
  const authority = {
    getSnapshot: () => signedOutSnapshot,
    subscribe: () => () => {},
    startLogin: (signal) => {
      starts.push(signal);
      return delayed.promise;
    },
    pollLogin: () => {
      throw Error('A cancelled QR must never start polling');
    },
  };
  const signedOutSnapshot = {
    state: 'confirmed',
    scope: null,
    status: {
      environment: 'test',
      environments: ['production', 'test'],
      authenticated: false,
      user: null,
    },
  };
  const { entries } = fixture(authority);
  const account = entries.find((row) => row.options.name === 'settings.launcher');
  await React.act(async () =>
    root.render(
      React.createElement(account.component, {
        wide: true,
        settingsOpen: false,
        openSettings: () => {},
      }),
    ),
  );
  const open = async () => {
    await React.act(async () => document.querySelector('[aria-label="账户菜单"]').click());
    await React.act(async () =>
      [...document.querySelectorAll('[role="menuitem"]')]
        .find((button) => button.textContent === '登录 GEA')
        .click(),
    );
  };
  await open();
  await React.act(async () =>
    document
      .querySelector('[role="dialog"]')
      .dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  assert.equal(starts[0].aborted, true);
  await React.act(async () =>
    delayed.resolve({ loginId: 'late', image: 'data:image/png;base64,AA==', expiresIn: 120 }),
  );
  assert.equal(document.querySelector('[role="dialog"]'), null);
  await open();
  await React.act(async () => root.render(null));
  assert.equal(starts[1].aborted, true);
});

test('account QR expiration stops polling and an unavailable GEA authority cannot initiate login', async (t) => {
  const { root } = await mountedDom(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const unavailable = fixture().entries.find((row) => row.options.name === 'settings.launcher');
  await React.act(async () =>
    root.render(
      React.createElement(unavailable.component, {
        wide: true,
        settingsOpen: false,
        openSettings: () => {},
      }),
    ),
  );
  await React.act(async () => document.querySelector('[aria-label="账户菜单"]').click());
  assert.equal(
    [...document.querySelectorAll('[role="menuitem"]')].find(
      (button) => button.textContent === '登录 GEA',
    ).disabled,
    true,
  );
  const signedOut = {
    state: 'confirmed',
    scope: null,
    status: {
      environment: 'test',
      environments: ['production', 'test'],
      authenticated: false,
      user: null,
    },
  };
  let polls = 0;
  const authority = {
    getSnapshot: () => signedOut,
    subscribe: () => () => {},
    startLogin: async () => ({
      loginId: 'expiring',
      image: 'data:image/png;base64,AA==',
      expiresIn: 120,
    }),
    pollLogin: async () => {
      polls++;
      return false;
    },
  };
  const account = fixture(authority).entries.find(
    (row) => row.options.name === 'settings.launcher',
  );
  await React.act(async () =>
    root.render(
      React.createElement(account.component, {
        wide: true,
        settingsOpen: false,
        openSettings: () => {},
      }),
    ),
  );
  await React.act(async () => document.querySelector('[aria-label="账户菜单"]').click());
  await React.act(async () =>
    [...document.querySelectorAll('[role="menuitem"]')]
      .find((button) => button.textContent === '登录 GEA')
      .click(),
  );
  await React.act(async () => t.mock.timers.tick(120000));
  assert.ok(document.querySelector('[role="dialog"]').textContent.includes('二维码已过期'));
  assert.ok(document.querySelector('.gea-account-login-qr').classList.contains('is-expired'));
  assert.equal(polls, 0);
});

test('a current successful QR poll waits for the latest confirmed Host identity before closing', async (t) => {
  const { root } = await mountedDom(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  let snapshot = {
    state: 'confirmed',
    scope: null,
    status: {
      environment: 'test',
      environments: ['production', 'test'],
      authenticated: false,
      user: null,
    },
  };
  const listeners = new Set();
  let polls = 0;
  const authority = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    startLogin: async () => ({
      loginId: 'current',
      image: 'data:image/png;base64,AA==',
      expiresIn: 120,
    }),
    pollLogin: async () => {
      polls++;
      return true;
    },
  };
  const account = fixture(authority).entries.find(
    (row) => row.options.name === 'settings.launcher',
  );
  await React.act(async () =>
    root.render(
      React.createElement(account.component, {
        wide: true,
        settingsOpen: false,
        openSettings: () => {},
      }),
    ),
  );
  await React.act(async () => document.querySelector('[aria-label="账户菜单"]').click());
  await React.act(async () =>
    [...document.querySelectorAll('[role="menuitem"]')]
      .find((button) => button.textContent === '登录 GEA')
      .click(),
  );
  await React.act(async () => t.mock.timers.tick(500));
  assert.equal(polls, 1);
  assert.ok(
    document.querySelector('[role="dialog"]'),
    'poll=true is not the current Host authentication projection',
  );
  assert.equal(document.querySelector('.gea-account-login-qr').getAttribute('aria-busy'), 'false');
  await React.act(async () => t.mock.timers.tick(1000));
  assert.equal(polls, 1, 'a completed challenge does not busy-poll while awaiting Host identity');
  const publish = (next) =>
    React.act(async () => {
      snapshot = next;
      for (const changed of listeners) changed();
    });
  await publish({
    state: 'unknown',
    scope: null,
    status: {
      environment: 'test',
      environments: ['production', 'test'],
      authenticated: true,
      user: { name: 'Unconfirmed' },
    },
  });
  assert.ok(
    document.querySelector('[role="dialog"]'),
    'an unconfirmed identity cannot close the dialog',
  );
  await publish({
    state: 'confirmed',
    error: 'IDENTITY_READ_FAILED',
    scope: 'stale-host',
    status: {
      environment: 'test',
      environments: ['production', 'test'],
      authenticated: true,
      user: { name: 'Stale Host User' },
    },
  });
  assert.ok(
    document.querySelector('[role="dialog"]'),
    'an observation error cannot turn a cached identity into current login confirmation',
  );
  await publish({
    state: 'confirmed',
    scope: 'current-host',
    status: {
      environment: 'test',
      environments: ['production', 'test'],
      authenticated: true,
      user: { name: 'Confirmed Host User' },
    },
  });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.ok(
    document.querySelector('[aria-label="账户菜单"]').textContent.includes('Confirmed Host User'),
  );
});

test('sidebar metadata and icons use the same winning slot projection with shadowed and abdicated owners', async (t) => {
  const { root } = await mountedDom(t);
  const core = new SlotCore();
  core.register(
    { name: 'root', children: { sidebar: { kind: 'single', scope: 'root' } } },
    () => null,
  );
  core.register(
    { name: 'sidebar', children: { 'sidebar.panellist': { kind: 'list', scope: 'root' } } },
    () => null,
  );
  const icon = (owner) => () => React.createElement('svg', { 'data-panel-owner': owner });
  core.register(
    { name: 'sidebar.panellist', id: 'schedules', priority: 10, order: 20, label: '原定时任务' },
    icon('original'),
  );
  core.register(
    { name: 'sidebar.panellist', id: 'plugins', order: 10, label: '插件管理' },
    icon('plugins'),
  );
  const removeWinner = core.register(
    { name: 'sidebar.panellist', id: 'schedules', priority: -10, order: -5, label: '新定时任务' },
    icon('winner'),
  );
  core.register(
    {
      name: 'sidebar.panellist',
      id: 'schedules',
      priority: -20,
      order: -20,
      label: '退位定时任务',
    },
    icon('abdicated'),
  );
  const abdicated = core
    .entries('sidebar.panellist')
    .find((row) => row.options.label === '退位定时任务');
  core.reportEntryError('sidebar.panellist', abdicated, Error('fixture owner failed'), {
    abdicate: true,
  });
  const { ctx, entries, renderSlot } = fixture(undefined, core);
  assert.equal(
    ctx.slots.entries('sidebar.panellist').length,
    4,
    'raw ledger retains shadowed and abdicated registrations',
  );
  assert.equal(
    ctx.slots.entriesOfSlot('sidebar.panellist').length,
    2,
    'rendered projection elects one non-abdicated owner per id',
  );
  const sidebar = entries.find((row) => row.options.name === 'sidebar');
  await React.act(async () =>
    root.render(
      React.createElement(sidebar.component, {
        collapsed: false,
        width: 280,
        usePanelInfo: (selector) => selector({ activePanelId: 'schedules' }),
        renderSlot,
      }),
    ),
  );
  const rows = () => [...document.querySelectorAll('.gea-plugin-entry')];
  assert.deepEqual(
    rows().map((row) => row.getAttribute('aria-label')),
    ['新定时任务', '插件管理'],
  );
  assert.equal(rows()[0].querySelector('svg').dataset.panelOwner, 'winner');
  assert.equal(document.querySelectorAll('[aria-label="新定时任务"]').length, 1);
  assert.equal(document.querySelector('[aria-label="原定时任务"]'), null);
  assert.equal(document.querySelector('[aria-label="退位定时任务"]'), null);
  await React.act(async () => removeWinner());
  assert.deepEqual(
    rows().map((row) => row.getAttribute('aria-label')),
    ['插件管理', '原定时任务'],
  );
  assert.equal(rows()[1].querySelector('svg').dataset.panelOwner, 'original');
  assert.equal(rows()[1].getAttribute('aria-current'), 'page');
});

test('login environment controls follow Host choices, replace QR and reject late responses from the previous environment', async (t) => {
  const { root } = await mountedDom(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const snapshot = {
    state: 'confirmed',
    scope: null,
    status: {
      environment: 'test',
      environments: ['production', 'test'],
      authenticated: false,
      user: null,
    },
  };
  const starts = [],
    polls = [];
  const oldPoll = Promise.withResolvers();
  const oldProduction = Promise.withResolvers();
  const authority = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    startLogin: (signal, environment) => {
      starts.push({ signal, environment });
      if (environment === 'production') return oldProduction.promise;
      return Promise.resolve({
        loginId: 'test-' + starts.length,
        image: 'data:image/png;base64,VEVTVA==',
        expiresIn: 120,
      });
    },
    pollLogin: (id, signal) => {
      polls.push({ id, signal });
      return oldPoll.promise;
    },
  };
  const account = fixture(authority).entries.find(
    (row) => row.options.name === 'settings.launcher',
  );
  await React.act(async () =>
    root.render(
      React.createElement(account.component, {
        wide: true,
        settingsOpen: false,
        openSettings: () => {},
      }),
    ),
  );
  await React.act(async () => document.querySelector('[aria-label="账户菜单"]').click());
  await React.act(async () =>
    [...document.querySelectorAll('[role="menuitem"]')]
      .find((button) => button.textContent === '登录 GEA')
      .click(),
  );
  const radio = (value) => document.querySelector('input[type="radio"][value="' + value + '"]');
  assert.deepEqual(
    [...document.querySelectorAll('fieldset label')].map((label) => label.textContent),
    ['正式', '测试'],
  );
  assert.equal(radio('test').checked, true, 'initial choice is the current Host environment');
  assert.equal(starts[0].environment, 'test');
  await React.act(async () => t.mock.timers.tick(500));
  await React.act(async () => radio('production').click());
  assert.equal(starts[0].signal.aborted, true);
  assert.equal(polls[0].signal.aborted, true);
  assert.equal(starts[1].environment, 'production');
  await React.act(async () => oldPoll.resolve(true));
  assert.ok(
    document.querySelector('[role="dialog"]'),
    'old successful poll cannot authenticate or close the new environment',
  );
  await React.act(async () =>
    oldProduction.resolve({
      loginId: 'production-current',
      image: 'data:image/png;base64,UFJPRA==',
      expiresIn: 120,
    }),
  );
  assert.equal(radio('production').checked, true);
  await React.act(async () => radio('test').click());
  assert.equal(starts[1].signal.aborted, true);
  assert.equal(starts[2].environment, 'test');
  assert.equal(
    document.querySelector('.gea-account-login-qr img').src,
    'data:image/png;base64,VEVTVA==',
  );
  await React.act(async () =>
    [...document.querySelectorAll('[role="dialog"] button')]
      .find((button) => button.textContent === '刷新二维码')
      .click(),
  );
  assert.equal(starts[2].signal.aborted, true);
  assert.equal(starts[3].environment, 'test', 'refresh keeps the requested environment');
  assert.equal(snapshot.status.authenticated, false, 'presentation does not create authentication');
});

test('login displays only configured Host environments', async (t) => {
  const { root } = await mountedDom(t);
  const snapshot = {
    state: 'confirmed',
    scope: null,
    status: {
      environment: 'production',
      environments: ['production'],
      authenticated: false,
      user: null,
    },
  };
  const targets = [];
  const authority = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    startLogin: async (_signal, environment) => {
      targets.push(environment);
      return { loginId: 'formal', image: 'data:image/png;base64,AA==', expiresIn: 120 };
    },
    pollLogin: async () => false,
  };
  const account = fixture(authority).entries.find(
    (row) => row.options.name === 'settings.launcher',
  );
  await React.act(async () =>
    root.render(
      React.createElement(account.component, {
        wide: true,
        settingsOpen: false,
        openSettings: () => {},
      }),
    ),
  );
  await React.act(async () => document.querySelector('[aria-label="账户菜单"]').click());
  await React.act(async () =>
    [...document.querySelectorAll('[role="menuitem"]')]
      .find((button) => button.textContent === '登录 GEA')
      .click(),
  );
  assert.deepEqual(
    [...document.querySelectorAll('input[type="radio"]')].map((input) => input.value),
    ['production'],
  );
  assert.deepEqual(targets, ['production']);
});

test('account distinguishes pending identity, service failure and authenticated users without a name', () => {
  const snapshots = [
    [{ state: 'unknown', scope: null, status: null }, '正在确认 GEA 身份'],
    [{ state: 'error', scope: null, status: null, error: 'offline' }, '身份服务暂不可用'],
    [{ state: 'confirmed', scope: 'A', status: { authenticated: true, user: null } }, '已登录 GEA'],
    [
      {
        state: 'confirmed',
        scope: null,
        status: { authenticated: false, loginState: 'expired', user: null },
      },
      '登录已过期',
    ],
    [
      {
        state: 'confirmed',
        scope: 'A',
        error: 'offline',
        status: { authenticated: true, user: { name: 'Alice' } },
      },
      '身份确认异常',
    ],
  ];
  for (const [snapshot, expected] of snapshots) {
    const { entries } = fixture({ getSnapshot: () => snapshot, subscribe: () => () => {} });
    const Account = entries.find((row) => row.options.name === 'settings.launcher').component;
    const html = renderToStaticMarkup(
      React.createElement(Account, { wide: true, settingsOpen: false, openSettings() {} }),
    );
    assert.ok(html.includes(expected), html);
    assert.equal(html.includes('尚未登录 GEA'), false);
  }
});

const navigationAccount = {
  getSnapshot: () => navigationIdentity,
  subscribe: () => () => {},
};
const navigationIdentity = {
  state: 'confirmed',
  scope: 'tenant:test:user',
  subject: 'user',
  status: { environment: 'test', environments: ['test'], authenticated: true, user: null },
};
const marketAgents = [
  {
    id: '1970123456789012345',
    agentCode: 'base-safety-stock',
    agentName: '基地库存',
    businessDomain: 'inventory',
    appSource: 'EXTERNAL',
    externalOpenMode: 'IFRAME',
    launchUrl: 'https://must-not-open.invalid',
    enterpriseManaged: false,
  },
  {
    id: '1970123456789012346',
    agentCode: 'sales_forecast',
    agentName: '销售计划',
    businessDomain: 'planning',
    enterpriseManaged: false,
  },
  {
    id: '1970123456789012347',
    agentCode: 'branch-inventory',
    agentName: '分仓库存',
    businessDomain: 'inventory',
    enterpriseManaged: false,
  },
  {
    id: '1970123456789012348',
    agentCode: 'full-chain-inventory',
    agentName: '全链库存',
    businessDomain: 'inventory',
    enterpriseManaged: false,
  },
];
async function mountNavigation(t, options = {}) {
  const mounted = await mountedDom(t);
  const result = fixture(options.account ?? navigationAccount, undefined, options);
  const Sidebar = result.entries.find((entry) => entry.options.name === 'sidebar').component;
  await React.act(async () => {
    for (const id of options.pages ?? ['inventory-aqkc', 'inventory-qll'])
      result.workbench.register({ id, label: id });
    mounted.root.render(
      React.createElement(Sidebar, {
        collapsed: false,
        width: 280,
        usePanelInfo: (select) => select({ activePanelId: 'gea-proof' }),
        renderSlot: result.renderSlot,
      }),
    );
  });
  return { ...mounted, ...result };
}
const businessButtons = () => [...document.querySelectorAll('[data-gea-business-entry]')];

test('desktop groups, original icons and short titles retain all confirmed page mappings without aliasing Consumers', async (t) => {
  const bindings = [
    ['aps', 'inventory-apsplan', '产销协同工作台', 'business/inventory-apsplan/page.json'],
    ['sales_forecast', 'gea-proof', '销售计划'],
    ['mps', 'plan-category-production', '主生产计划(MPS)(开发中)', 'static/mps/page.json'],
    ['full-chain-inventory', 'inventory-qll', '全链库存工作台'],
    ['base-safety-stock', 'inventory-aqkc', '基地库存'],
    ['branch-inventory', 'inventory-fc', '分仓库存'],
    [
      'customer_inventory',
      'inventory-customer',
      '客户库存(开发中)',
      'prototypes/inventory-customer/page.json',
    ],
    [
      'dealer-inventory-replenishment',
      'inventory-dealer',
      '经销商补货',
      'business/inventory-dealer/page.json',
    ],
    [
      'order',
      'inventory-orderworkbench',
      '订单工作台(开发中)',
      'prototypes/inventory-orderworkbench/page.json',
    ],
    [
      'order01',
      'inventory-orderfulfillment',
      '订单履约(开发中)',
      'prototypes/inventory-orderfulfillment/page.json',
    ],
  ];
  for (const [code, page, , manifest] of bindings) {
    if (!manifest) continue;
    const declaration = JSON.parse(readFileSync(manifest, 'utf8'));
    assert.equal(declaration.consumerCode, code);
    assert.ok(declaration.pageIds.includes(page));
  }
  const { calls } = await mountNavigation(t, {
    pages: bindings.map(([, page]) => page),
    businessNavigation: {
      read: async () => ({
        agents: [
          ...bindings
            .slice()
            .reverse()
            .map(([agentCode]) => ({
              id: agentCode,
              agentCode,
              agentName: '后台长名称Agent',
              businessDomain: 'market',
            })),
          {
            id: 'stock-only',
            agentCode: 'dealer-inventory-replenishment-stock',
            agentName: '经销商库存',
            businessDomain: 'market',
          },
          {
            id: 'numeric-only',
            agentCode: '04',
            agentName: '区域及品类计划Agent(开发中)',
            businessDomain: 'finance',
          },
        ],
        domains: {
          kind: 'available',
          items: [{ value: 'market', text: '后台客户分类', description: null }],
        },
      }),
    },
  });
  const groups = [
    ...document.querySelectorAll(
      '.gea-shell-nav-section:not([data-gea-menu-group="local-prototypes"])',
    ),
  ];
  assert.deepEqual(
    groups.map((group) => group.querySelector('.gea-shell-nav-heading').textContent),
    ['产销协同', '计划管理', '库存管理', '客户管理', '订单管理'],
  );
  assert.ok(groups[0].querySelector('svg[viewBox="0 0 1024 1024"]'));
  assert.ok(groups[1].querySelector('svg path[d="M8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 17h2"]'));
  assert.ok(groups[2].querySelector('svg path[d="m3 10 9-6 9 6v10H3z"]'));
  assert.equal(document.querySelector('[aria-label="刷新业务应用"]'), null);
  for (const [, page, title] of bindings) {
    const button = document.querySelector(`[data-gea-business-entry="${page}"]`);
    assert.equal(button.textContent, title);
    assert.equal(button.disabled, false);
    await React.act(async () => button.click());
  }
  assert.deepEqual(
    calls,
    bindings.map(([, page]) => ['page', page]),
  );
  const stock = document.querySelector('[data-gea-business-entry="stock-only"]');
  assert.equal(stock.disabled, true);
  assert.equal(stock.closest('[data-gea-menu-group]').dataset.geaMenuGroup, 'inventory');
  assert.equal(document.querySelector('[data-gea-business-entry="numeric-only"]').disabled, true);
  assert.doesNotMatch(document.body.textContent, /后台长名称|后台客户分类/);
});

test('market workbench never duplicates the existing AI workbench entry or leaves an empty group', async (t) => {
  for (const kind of ['available', 'unavailable'])
    await t.test(kind, async (t) => {
      const identity = {
        ...navigationIdentity,
        status: { ...navigationIdentity.status, environment: 'production' },
      };
      await mountNavigation(t, {
        account: {
          getSnapshot: () => identity,
          subscribe: () => () => {},
        },
        businessNavigation: {
          read: async () => ({
            agents: [
              {
                id: 'duplicate-workbench',
                agentCode: 'workbench',
                agentName: '后台改名的工作台',
                businessDomain: 'market',
              },
              marketAgents[1],
            ],
            domains:
              kind === 'available'
                ? { kind, items: [{ value: 'market', text: '其他业务', description: null }] }
                : { kind, message: 'dictionary offline' },
          }),
        },
      });
      assert.equal(document.querySelector('[data-gea-business-entry="duplicate-workbench"]'), null);
      assert.equal(document.querySelector('[data-gea-menu-group="other"]'), null);
      assert.equal(document.querySelector('[data-gea-menu-group="domain:market"]'), null);
      assert.doesNotMatch(document.body.textContent, /后台改名的工作台|其他业务/);
      assert.equal(document.querySelectorAll('.gea-ai-workbench-entry').length, 1);
      assert.match(document.querySelector('.gea-ai-workbench-entry').textContent, /AI工作台/);
      assert.equal(document.querySelector('[data-gea-business-entry="gea-proof"]').disabled, false);
    });
});

test('a returned mapped Agent without an installed page remains unavailable', async (t) => {
  await mountNavigation(t, {
    pages: [],
    businessNavigation: {
      read: async () => ({
        agents: [
          {
            id: 'customer',
            agentCode: 'customer_inventory',
            agentName: '客户库存Agent',
            businessDomain: null,
          },
        ],
        domains: { kind: 'unavailable', message: 'dictionary offline' },
      }),
    },
  });
  const customer = document.querySelector('[data-gea-business-entry="inventory-customer"]');
  assert.equal(customer.disabled, true);
  assert.equal(customer.title, '页面尚未安装或启用');
  assert.equal(customer.closest('[data-gea-menu-group]').dataset.geaMenuGroup, 'inventory');
});

test('market catalog keeps controlled pages in desktop order, including an EXTERNAL base-stock Agent', async (t) => {
  const signals = [];
  const { calls } = await mountNavigation(t, {
    businessNavigation: {
      read: async (signal) => {
        signals.push(signal);
        return { agents: marketAgents, domains: { kind: 'unavailable', message: 'offline' } };
      },
    },
  });
  const buttons = businessButtons().filter((button) => !button.disabled);
  assert.deepEqual(
    buttons.map((button) => button.dataset.geaBusinessEntry),
    ['gea-proof', 'inventory-qll', 'inventory-aqkc', 'inventory-fc'],
  );
  assert.equal(signals.length, 1);
  assert.equal(signals[0].aborted, false);
  for (const button of buttons) await React.act(async () => button.click());
  assert.deepEqual(calls, [
    ['page', 'gea-proof'],
    ['page', 'inventory-qll'],
    ['page', 'inventory-aqkc'],
    ['page', 'inventory-fc'],
  ]);
  assert.equal(document.querySelector('[aria-label="刷新业务应用"]'), null);
  assert.match(document.body.textContent, /业务分类暂不可用/);
});

test('unmapped applications retain dictionary order and unknown domains remain visible', async (t) => {
  await mountNavigation(t, {
    businessNavigation: {
      read: async () => ({
        agents: [
          { ...marketAgents[0], agentCode: 'future-base' },
          { ...marketAgents[1], agentCode: 'future-plan' },
          { ...marketAgents[2], agentCode: 'future-branch' },
          {
            id: 'unknown-domain',
            agentCode: 'new-agent',
            agentName: '未来业务',
            businessDomain: 'future',
          },
          { id: 'empty-domain', agentCode: null, agentName: null, businessDomain: null },
        ],
        domains: {
          kind: 'available',
          items: [
            { value: 'planning', text: '计划分类', description: 'lucide:calendar-check' },
            { value: 'inventory', text: '库存分类', description: 'lucide:warehouse' },
            { value: 'unused', text: '不显示空分类', description: 'ordinary text' },
          ],
        },
      }),
    },
  });
  const groups = [
    ...document.querySelectorAll(
      '.gea-shell-nav-section:not([data-gea-menu-group="local-prototypes"])',
    ),
  ];
  assert.deepEqual(
    groups.map((group) => group.querySelector('.gea-shell-nav-heading')?.textContent),
    ['计划分类', '库存分类', '其他业务'],
  );
  assert.deepEqual(
    groups.flatMap((group) =>
      [...group.querySelectorAll('[data-gea-business-entry]')].map((button) => button.textContent),
    ),
    ['销售计划', '基地库存', '分仓库存', '未来业务', '未命名应用'],
  );
  assert.equal(document.querySelector('[data-gea-business-entry="unknown-domain"]').disabled, true);
  assert.match(
    document.querySelector('[data-gea-business-entry="unknown-domain"]').title,
    /当前客户端暂未接入/,
  );
  assert.match(
    document.querySelector('[data-gea-business-entry="empty-domain"]').title,
    /应用配置未完整/,
  );
  assert.ok(groups[0].querySelector('svg.lucide-calendar-check'));
  assert.ok(groups[1].querySelector('svg.lucide-warehouse'));
  assert.ok(groups[2].querySelector('svg.lucide-layout-grid'));
  assert.doesNotMatch(document.body.textContent, /业务分类暂不可用/);
});

test('only declared mock prototypes remain local while unreturned business pages and personal inventory stay out of the menu', async (t) => {
  const { calls } = await mountNavigation(t, {
    pages: [
      'plan-region-category',
      'gea-regional-plan',
      'inventory-orderworkbench',
      'inventory-dms',
      'inventory-personal',
      'inventory-dealer',
      'inventory-customer',
      'inventory-orderfulfillment',
      'inventory-apsplan',
      'plan-category-production',
    ],
  });
  assert.match(document.body.textContent, /本地原型/);
  const buttons = businessButtons();
  assert.deepEqual(
    buttons.map((button) => button.dataset.geaBusinessEntry),
    ['plan-region-category', 'gea-regional-plan', 'inventory-dms', 'plan-capacity-assessment'],
  );
  for (const button of buttons.slice(0, 3)) {
    assert.match(button.textContent, /模拟/);
    await React.act(async () => button.click());
  }
  assert.equal(buttons[3].disabled, true);
  assert.match(buttons[3].textContent, /待设计/);
  assert.deepEqual(calls, [
    ['page', 'plan-region-category'],
    ['page', 'gea-regional-plan'],
    ['page', 'inventory-dms'],
  ]);
  assert.ok(document.querySelector('[aria-label="新会话"]'));
  assert.ok(document.querySelector('[aria-label="插件管理"]'));
  assert.ok(document.querySelector('[data-slot="sidebar.workspaces"]'));
  assert.ok(document.querySelector('[data-slot="sidebar.settings"]'));
});

test('local prototypes appear only in a confirmed test environment; production keeps unmapped business entries disabled', async (t) => {
  const cases = [
    ['test', navigationIdentity, true],
    [
      'production',
      {
        ...navigationIdentity,
        status: { ...navigationIdentity.status, environment: 'production' },
      },
      false,
    ],
    [
      'pending',
      {
        state: 'pending',
        scope: null,
        status: { ...navigationIdentity.status, environment: 'test' },
      },
      false,
    ],
    ['observation-error', { ...navigationIdentity, error: 'identity unavailable' }, false],
    [
      'unknown-environment',
      { ...navigationIdentity, status: { ...navigationIdentity.status, environment: undefined } },
      false,
    ],
  ];
  for (const [name, identity, visible] of cases)
    await t.test(name, async (t) => {
      await mountNavigation(t, {
        pages: [
          'plan-region-category',
          'gea-regional-plan',
          'inventory-dms',
          'inventory-orderworkbench',
        ],
        account: { getSnapshot: () => identity, subscribe: () => () => {} },
        businessNavigation: {
          read: async () => ({
            agents: [
              { id: 'category', agentCode: '04', agentName: '品类计划Agent', businessDomain: null },
              {
                id: 'regional',
                agentCode: 'area_plan',
                agentName: '区域计划Agent',
                businessDomain: null,
              },
              { id: 'order', agentCode: 'order', agentName: '订单管理Agent', businessDomain: null },
            ],
            domains: { kind: 'available', items: [] },
          }),
        },
      });
      assert.equal(
        Boolean(document.querySelector('[data-gea-menu-group="local-prototypes"]')),
        visible,
      );
      for (const page of ['plan-region-category', 'gea-regional-plan', 'inventory-dms'])
        assert.equal(
          Boolean(document.querySelector(`[data-gea-business-entry="${page}"]`)),
          visible,
        );
      if (name === 'production') {
        assert.equal(document.querySelector('[data-gea-business-entry="category"]').disabled, true);
        assert.equal(document.querySelector('[data-gea-business-entry="regional"]').disabled, true);
        const order = document.querySelector(
          '[data-gea-business-entry="inventory-orderworkbench"]',
        );
        assert.equal(order.disabled, false);
        assert.equal(order.closest('[data-gea-menu-group]').dataset.geaMenuGroup, 'orders');
      }
    });
});

test('empty and failed catalogs offer retry, successful catalogs have no permanent refresh button', async (t) => {
  let response = { agents: [], domains: { kind: 'available', items: [] } };
  let reads = 0;
  await mountNavigation(t, {
    businessNavigation: {
      read: async () => {
        reads++;
        return response;
      },
    },
  });
  assert.match(document.body.textContent, /暂未获取到可用应用，可刷新或联系管理员/);
  assert.match(document.body.textContent, /原因暂无法确定/);
  assert.doesNotMatch(document.body.textContent, /无权限/);
  const refresh = () => document.querySelector('[aria-label="刷新业务应用"]');
  response = { agents: marketAgents, domains: { kind: 'available', items: [] } };
  await React.act(async () => refresh().click());
  assert.ok(document.querySelector('[data-gea-business-entry="gea-proof"]'));
  assert.equal(refresh(), null);
  assert.equal(reads, 2);
});

test('failed catalog retry never restores an unauthorized static business menu', async (t) => {
  let reads = 0;
  await mountNavigation(t, {
    businessNavigation: {
      read: async () => {
        reads++;
        throw Error('HTTP 403: permission denied');
      },
    },
  });
  await React.act(async () => document.querySelector('[aria-label="刷新业务应用"]').click());
  assert.match(document.body.textContent, /业务应用读取失败.*HTTP 403/);
  assert.equal(document.querySelector('[data-gea-business-entry="gea-proof"]'), null);
  assert.equal(document.querySelector('[data-gea-business-entry="inventory-dealer"]'), null);
  assert.ok(document.querySelector('[aria-label="插件管理"]'));
  assert.ok(document.querySelector('[data-slot="sidebar.workspaces"]'));
  assert.equal(reads, 2);
});

test('identity transitions abort prior catalog reads, ignore late results, and preserve saved Sessions and drafts', async (t) => {
  let identity = navigationIdentity;
  const listeners = new Set();
  const requests = [];
  const session = Object.freeze({ id: 'session-kept', cwd: '/kept', draft: 'Core draft stays' });
  const saved = { version: 2, page: 'gea-proof', selections: [], views: [] };
  const { dom, root } = await mountNavigation(t, {
    pages: [],
    account: {
      getSnapshot: () => identity,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    businessNavigation: {
      read: (signal) => {
        const result = Promise.withResolvers();
        requests.push({ signal, result });
        return result.promise;
      },
    },
    memory: {
      getSnapshot: () => saved,
      set: () => assert.fail('catalog must not rewrite page associations'),
    },
    navigation: {
      sessions: {
        list: {
          getSnapshot: () => ({
            phase: 'ready',
            ids: [session.id],
            byId: { [session.id]: session },
          }),
        },
      },
    },
  });
  dom.window.localStorage.setItem('sales-plan-draft', 'saved local adjustments');
  const publish = async (next) =>
    React.act(async () => {
      identity = next;
      for (const listener of listeners) listener();
    });
  await React.act(async () =>
    requests[0].result.resolve({
      agents: marketAgents,
      domains: {
        kind: 'available',
        items: [{ value: 'inventory', text: '旧身份分类', description: null }],
      },
    }),
  );
  assert.ok(document.querySelector('[data-gea-business-entry="inventory-aqkc"]'));
  assert.equal(document.querySelector('[aria-label="刷新业务应用"]'), null);
  await publish({ ...identity, scope: 'intermediate-tenant:environment:user' });
  assert.equal(requests[0].signal.aborted, true);
  await publish({
    ...identity,
    scope: 'new-tenant:new-environment:new-user',
    subject: 'new-user',
    status: { ...identity.status, environment: 'production' },
  });
  assert.equal(requests[1].signal.aborted, true);
  assert.equal(document.querySelector('[data-gea-business-entry="gea-proof"]'), null);
  await React.act(async () =>
    requests[1].result.resolve({
      agents: [{ ...marketAgents[0], agentCode: 'late-unknown', agentName: '迟到旧应用' }],
      domains: {
        kind: 'available',
        items: [{ value: 'inventory', text: '迟到旧分类', description: null }],
      },
    }),
  );
  assert.doesNotMatch(document.body.textContent, /迟到旧分类|迟到旧应用/);
  await React.act(async () =>
    requests[2].result.resolve({
      agents: [marketAgents[2]],
      domains: { kind: 'unavailable', message: 'dictionary offline' },
    }),
  );
  assert.ok(document.querySelector('[data-gea-business-entry="inventory-fc"]'));
  assert.equal(document.querySelector('[data-gea-business-entry="gea-proof"]'), null);
  await publish({
    state: 'confirmed',
    scope: null,
    status: { ...identity.status, authenticated: false, user: null },
  });
  assert.equal(requests[2].signal.aborted, true);
  assert.equal(document.querySelector('[data-gea-business-entry="inventory-fc"]'), null);
  assert.match(document.body.textContent, /请先登录 GEA/);
  assert.doesNotMatch(document.body.textContent, /本地原型/);
  assert.equal(dom.window.localStorage.getItem('sales-plan-draft'), 'saved local adjustments');
  assert.deepEqual(session, { id: 'session-kept', cwd: '/kept', draft: 'Core draft stays' });
  assert.deepEqual(saved, { version: 2, page: 'gea-proof', selections: [], views: [] });
  await publish(navigationIdentity);
  assert.equal(requests.length, 4);
  await React.act(async () => root.unmount());
  assert.equal(requests[3].signal.aborted, true);
});

test('removing the directory provider cancels its read and a replacement cannot receive late previous results', async (t) => {
  const delayed = Promise.withResolvers();
  let signal;
  const { replaceBusinessNavigation } = await mountNavigation(t, {
    businessNavigation: {
      read: (pending) => {
        signal = pending;
        return delayed.promise;
      },
    },
  });
  await React.act(async () => replaceBusinessNavigation(undefined));
  assert.equal(signal.aborted, true);
  assert.match(document.body.textContent, /业务应用服务暂不可用/);
  await React.act(async () =>
    delayed.resolve({ agents: marketAgents, domains: { kind: 'available', items: [] } }),
  );
  assert.equal(document.querySelector('[data-gea-business-entry="gea-proof"]'), null);
  await React.act(async () =>
    replaceBusinessNavigation({
      read: async () => ({
        agents: [marketAgents[1]],
        domains: { kind: 'available', items: [] },
      }),
    }),
  );
  assert.ok(document.querySelector('[data-gea-business-entry="gea-proof"]'));
  assert.equal(document.querySelector('[data-gea-business-entry="inventory-fc"]'), null);
});

test('missing, invalid and unsupported dictionary icons fall back without losing market entries', async (t) => {
  const descriptions = [
    null,
    '',
    'ordinary text',
    'not-an-icon',
    'mdi:unknown',
    'lucide:unsupported',
    '__proto__',
    'toString',
  ];
  await mountNavigation(t, {
    businessNavigation: {
      read: async () => ({
        agents: descriptions.map((_, index) => ({
          id: 'icon-agent-' + index,
          agentCode: 'future-' + index,
          agentName: '图标应用' + index,
          businessDomain: 'icon-' + index,
        })),
        domains: {
          kind: 'available',
          items: descriptions.map((description, index) => ({
            value: 'icon-' + index,
            text: '图标分类' + index,
            description,
          })),
        },
      }),
    },
  });
  const groups = [...document.querySelectorAll('[data-gea-menu-group^="domain:"]')];
  assert.equal(groups.length, descriptions.length);
  for (const group of groups) {
    assert.ok(group.querySelector('svg.lucide-layout-grid'));
    assert.equal(group.querySelector('[data-gea-business-entry]').disabled, true);
  }
});
