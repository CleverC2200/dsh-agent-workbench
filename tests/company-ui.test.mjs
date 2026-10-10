import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { zh } from '../src/company/locales.ts';
import { readFileSync } from 'node:fs';
import { SlotCore } from '../../../official-latest-standard/packages/client/ui-slots/lib/index.js';
const require = createRequire(import.meta.url);
const bundle = await build({
  stdin: {
    contents:
      "export {mountCompanyUI} from './src/company/ui.tsx';export {WorkbenchController} from './src/workbench.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  loader: { '.png': 'dataurl', '.css': 'text' },
});
const module = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(
  module,
  module.exports,
  require,
);
const { mountCompanyUI, WorkbenchController } = module.exports;
function fixture(account, panels = [{ options: { id: 'plugins', label: () => '插件管理' } }]) {
  const entries = [],
    calls = [];
  const panelEntries = () => Array.isArray(panels) ? panels : panels.entriesOfSlot('sidebar.panellist');
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
        !Array.isArray(panels) ? panels.entries(name) : name === 'sidebar.panellist'
          ? panels
          : [
              { options: { key: 'gea-proof' } },
              { options: { key: 'inventory-fc' } },
              { options: { key: 'plugins' } },
              ...entries.filter((entry) => entry.options.name === 'main'),
            ],
      entriesOfSlot: name => !Array.isArray(panels) ? panels.entriesOfSlot(name) : ctx.slots.entries(name),
      subscribe: (name, listener) => Array.isArray(panels) ? () => {} : panels.subscribe(name, listener),
      inject: (_name, fn) => fn(),
      register: (options, component) => {
        entries.push({ options, component });
        return () => {};
      },
    },
    inject: (_names, fn) => {
      if (account) fn({ ...ctx, businessAccount: account });
    },
    effect: () => {},
  };
  const workbench = new WorkbenchController({
    panel: (id) => calls.push(['page', id]),
    document: (id) => calls.push(['document', id]),
    hasPanel: (id) => ctx.slots.entries('main').some((entry) => entry.options.key === id),
  });
  mountCompanyUI(ctx, workbench, () =>
    React.createElement('div', { 'data-resource-selection': true }, 'resource-selection-fixture'),
  );
  const renderSlot = (name, props = {}, options = {}) => {
    if (name === 'sidebar.panellist') {
      const entry = panelEntries().find(row => row.options.id === options.only);
      return entry?.component ? React.createElement(entry.component, props) : React.createElement('svg', {
        'data-public-panel-icon': options.only, 'data-active': props.active,
      });
    }
    if (name === 'sidebar.toggle.badge' && !Array.isArray(panels)) {
      const entry = panels.entriesOfSlot(name)[0];
      return entry ? React.createElement(entry.component, props) : null;
    }
    const entry = entries.find((entry) => entry.options.name === name);
    return React.createElement(
      'div',
      { 'data-slot': name },
      entry ? React.createElement(entry.component, props) : name,
    );
  };
  return { ctx, entries, calls, workbench, renderSlot };
}
test('formal sidebar renders original button/icon hierarchy and the actual workspace/settings seats without details redesign', () => {
  const { entries, renderSlot } = fixture();
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
    '产销协同',
    '计划管理',
    '库存管理',
    '订单管理',
    '分仓库存',
    '产能评估(待设计)',
  ])
    assert.ok(markup.includes(text), text);
  assert.ok(markup.includes('sidebar.workspaces'));
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
  const button = dom.window.document.querySelector('.gea-formal-new-session');
  assert.ok(button, 'AI workbench uses the original card class rather than drawer-tab styling');
  assert.equal(button.querySelector('svg').getAttribute('viewBox'), '0 0 16 16');
  assert.ok(button.querySelector('.gea-formal-new-session-label'));
  assert.equal(
    dom.window.document.querySelector('.gea-owned-sidebar-toggle svg').getAttribute('viewBox'),
    '0 0 16 16',
  );
  dom.window.close();
});
test('formal account contribution renders the GEA read-only avatar and signed-out label', () => {
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
  assert.ok(markup.includes('未登录'));
  assert.ok(markup.includes('gea-user-avatar'));
  assert.ok(!markup.includes('workbench-avatar'));
});
test('actual owned anchors constrain the bell and put the browser after both drawer headers', (t) => {
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
  assert.ok(
    siblings.indexOf(document.querySelector('.gea-drawer-workspace')) < siblings.indexOf(browser),
  );
});
test('formal business navigation retains Workbench and the registered public Plugins label', () => {
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
  assert.ok(markup.includes('>工作台</span>'));
  assert.ok(!markup.includes('>plugins</span>'));
  const dom = new JSDOM(markup);
  const entryButton = dom.window.document.querySelector('.gea-plugin-entry');
  assert.equal(entryButton.textContent, '插件管理');
  assert.equal(dom.window.document.querySelectorAll('.gea-plugin-entry').length, 1);
  assert.ok(
    !dom.window.document.querySelector('.gea-shell-plugin-group').textContent.includes('插件管理'),
  );
  assert.equal(entryButton.previousElementSibling.classList.contains('gea-new-session'), true);
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
test('formal Home retains its original hero and native Workspace/Agent/composer contract without Home resource redesign', () => {
  const { entries } = fixture();
  const entry = entries.find((e) => e.options.name === 'main.conversation');
  const markup = renderToStaticMarkup(
    React.createElement(entry.component, {
      useSession: () => undefined,
      useConversation: () => undefined,
      useSessions: (fn) => fn({ byId: {} }),
      renderFactorySlot: (...args) => nativeFactory(...args, undefined),
    }),
  );
  for (const text of [
    '思念企业 AI 协作伙伴',
    '让 AI 进入工作流程',
    'gea-home-title',
    'gea-home-logo',
    'conversation.hero.workspace',
    'conversation.hero.agentPreset',
    'data-native-content="embedded"',
  ])
    assert.ok(markup.includes(text), text);
  assert.ok(
    !markup.includes('data-resource-selection'),
    'resource selection belongs to the retained Workbench module',
  );
});
test('selected native Session keeps formal welcome inside native views while preserving the official Session seat', (t) => {
  const { entries } = fixture();
  const entry = entries.find((row) => row.options.name === 'main.conversation');
  const session = { blank: true, running: false, promptAttempted: false, openState: 'open' };
  const markup = renderToStaticMarkup(
    React.createElement(entry.component, {
      sessionId: 'selected-native-session',
      useSession: (selector) => selector(session),
      useConversation: (selector) => selector({ activeTargets: new Set() }),
      useSessions: (selector) =>
        selector({ byId: { 'selected-native-session': { cwd: '/native/project' } } }),
      renderFactorySlot: (...args) => nativeFactory(...args, 'selected-native-session'),
    }),
  );
  const dom = new JSDOM(markup);
  t.after(() => dom.window.close());
  const document = dom.window.document;
  assert.ok(document.querySelector('[data-native-flow] .gea-home-hero'));
  assert.equal(document.querySelector('[data-root-controls] .gea-home-hero'), null);
  assert.ok(
    document.querySelector('[data-native-flow] .gea-native-selectors'),
    'Workspace and Agent controls share the content position before the native composer',
  );
  assert.equal(
    document.querySelector('[data-root-controls] .gea-native-selectors'),
    null,
    'selected-session controls do not sit after the composer in root width controls',
  );
  assert.ok(
    document.querySelector('.gea-native-history[hidden]'),
    'only the proven blank transcript is hidden; its actual Session seat remains mounted',
  );
  assert.ok(document.querySelector('[data-native-flow] [data-native-seat="conversation.session"]'));
});
test('blank-session controls inherit the official composer width and pass their actual picker anchor', (t) => {
  const { entries } = fixture();
  const entry = entries.find((row) => row.options.name === 'main.conversation');
  let pickerProps;
  const shares = {
    t: (key) => key,
    sessionId: 'blank',
    useWorkspaces: (selector) => selector({ items: [] }),
    selectWorkspace: () => {},
    renderSlot: (name, props) => {
      if (name === 'conversation.hero.workspace') pickerProps = props;
      return React.createElement('article', { 'data-native-seat': name });
    },
  };
  const markup = renderToStaticMarkup(
    React.createElement(entry.component, {
      sessionId: 'blank',
      useSession: (selector) => selector({ blank: true }),
      useConversation: (selector) => selector({ activeTargets: new Set() }),
      useSessions: (selector) => selector({ phase: 'ready', ids: [], byId: {} }),
      renderFactorySlot: (_name, _options, extension) =>
        React.createElement(extension.slots.views, shares),
    }),
  );
  const dom = new JSDOM(
    '<style>' + readFileSync('src/company/layout.css', 'utf8') + '</style>' + markup,
  );
  t.after(() => dom.window.close());
  const style = dom.window.getComputedStyle(
    dom.window.document.querySelector('.gea-native-selectors'),
  );
  assert.ok(
    style.width.includes('--dsh-composer-side-clearance'),
    'same inherited side clearance as the resident native card',
  );
  assert.ok(
    style.maxWidth.includes('--dsh-composer-card-max-width'),
    'same inherited width cap as the resident native card',
  );
  assert.equal(style.marginLeft, 'auto');
  assert.equal(style.marginRight, 'auto');
  assert.ok(pickerProps.anchorRef, 'the public picker receives the actual owned trigger ref');
});
test('retained Workbench directory reads current official workspace facts and provides native Conversation plus resource selection', () => {
  const { entries } = fixture();
  const entry = entries.find((row) => row.options.name === 'agent-workbench.directory');
  const markup = renderToStaticMarkup(
    React.createElement(entry.component, {
      sessionId: 'current',
      useSessions: (selector) => selector({ byId: { current: { cwd: '/native/project' } } }),
    }),
  );
  assert.ok(markup.includes('已接入页面'));
  assert.ok(markup.includes('原生对话'));
  assert.ok(markup.includes('data-resource-selection'));
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
  assert.equal(core.entriesOfSlot('main.conversation')[0].options.priority, -20);
  assert.equal(core.entriesOfSlot('sidebar').length, 1);
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
    status: { authenticated: true, user: { name: 'Fixture User' } },
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
  const { entries } = fixture();
  const entry = entries.find((row) => row.options.name === 'main.conversation');
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
      React.createElement(entry.component, {
        sessionId: 'blank',
        useSession: (selector) => selector({ blank: true }),
        useConversation: (selector) => selector({ activeTargets: new Set() }),
        useSessions: (selector) => selector({ phase: 'ready', ids: [], byId: {} }),
        renderFactorySlot: (_name, _options, extension) =>
          React.createElement(extension.slots.views, shares),
      }),
    ),
  );
  const trigger = document.querySelector('.gea-formal-workspace');
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
  await render('agent-workbench');
  assert.equal(drawer(), 'workspace');
  await render('gea-inbox');
  assert.equal(
    drawer(),
    'function',
    'a directory/notification arrival opens the business navigation',
  );
  await act(async () => document.querySelector('[aria-controls="gea-panel-workspace"]').click());
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
  const entry = entries.find((row) => row.options.name === 'main.conversation');
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
  assert.ok(document.querySelector('.gea-company-main'));
});


async function mountedDom(t) {
  const dom = new JSDOM('<main id="root"></main>', { pretendToBeVisual: true, url: 'http://localhost' });
  const values = { window: dom.window, document: dom.window.document, Node: dom.window.Node,
    navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: () => { throw Error('Account presentation must not fetch business/model routes'); } };
  const saved = Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
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

test('public official and third-party panel rows keep order, icons, activation, live removal and the collapsed badge', async t => {
  const { root } = await mountedDom(t);
  const core = new SlotCore();
  core.register({ name: 'root', children: { sidebar: { kind: 'single', scope: 'root' } } }, () => null);
  core.register({ name: 'sidebar', children: {
    'sidebar.panellist': { kind: 'list', scope: 'root' },
    'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
  } }, () => null);
  const icon = props => React.createElement('svg', { 'data-actual-icon': true, 'data-active': props.active, 'data-size': props.size });
  core.register({ name: 'sidebar.panellist', id: 'plugins', order: 20, label: () => '插件管理' }, icon);
  const removeSchedule = core.register({ name: 'sidebar.panellist', id: 'schedules', order: 10, label: '定时任务' }, icon);
  core.register({ name: 'sidebar.toggle.badge' }, () => React.createElement('span', { 'data-actual-badge': true }, '3'));
  const { entries, calls, renderSlot, workbench } = fixture(undefined, core);
  workbench.registerFrame({ id: 'fixture-document', kind: 'html', src: '/fixture.html' });
  await workbench.open('fixture-document');
  const sidebar = entries.find(entry => entry.options.name === 'sidebar');
  const render = collapsed => React.act(async () => root.render(React.createElement(sidebar.component, {
    collapsed, width: collapsed ? 56 : 280,
    usePanelInfo: selector => selector({ activePanelId: 'schedules' }), renderSlot,
  })));
  await render(false);
  assert.deepEqual([...document.querySelectorAll('.gea-plugin-entry')].map(button => button.getAttribute('aria-label')), ['定时任务', '插件管理']);
  assert.equal(document.querySelector('[aria-label="定时任务"]').getAttribute('aria-current'), 'page');
  assert.equal(document.querySelector('[aria-label="定时任务"] svg').dataset.active, 'true');
  await React.act(async () => document.querySelector('[aria-label="定时任务"]').click());
  assert.deepEqual(calls.at(-1), ['panel', 'schedules']);
  assert.equal(workbench.getSnapshot().selectedDocument, undefined);
  const removeThird = await React.act(async () => core.register({ name: 'sidebar.panellist', id: 'third-party', order: -1, label: '第三方面板' }, icon));
  assert.equal(document.querySelector('.gea-plugin-entry').getAttribute('aria-label'), '第三方面板');
  await render(true);
  assert.equal(document.querySelector('[aria-label="第三方面板"] svg').dataset.size, '18');
  assert.ok(document.querySelector('.gea-owned-sidebar-toggle [data-actual-badge]'));
  await React.act(async () => document.querySelector('.gea-owned-sidebar-toggle').click());
  assert.deepEqual(calls.at(-1), ['toggle']);
  await React.act(async () => { removeSchedule(); removeThird(); });
  assert.equal(document.querySelector('[aria-label="定时任务"]'), null);
  assert.equal(document.querySelector('[aria-label="第三方面板"]'), null);
});

test('account QR login uses only GEA authority, refresh cancels the old challenge and Host subscription owns success', async t => {
  const { root, dom } = await mountedDom(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  let snapshot = { state: 'confirmed', scope: null, status: { authenticated: false, user: null } };
  const listeners = new Set(), starts = [], polls = [];
  const delayedPoll = Promise.withResolvers();
  const authority = {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    startLogin: async signal => { starts.push(signal); return { loginId: 'challenge-' + starts.length, image: 'data:image/png;base64,AA==', expiresIn: 120 }; },
    pollLogin: (id, signal) => { polls.push({ id, signal }); return delayedPoll.promise; },
  };
  const { entries, calls } = fixture(authority);
  const account = entries.find(row => row.options.name === 'settings.launcher');
  await React.act(async () => root.render(React.createElement(account.component, { wide: true, settingsOpen: false, openSettings: () => {} })));
  const trigger = document.querySelector('[aria-label="账户菜单"]');
  await React.act(async () => trigger.click());
  assert.equal(starts.length, 0);
  await React.act(async () => [...document.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === '登录 GEA').click());
  assert.equal(starts.length, 1);
  assert.ok(document.querySelector('[role="dialog"] img'));
  assert.deepEqual(calls, []);
  await React.act(async () => t.mock.timers.tick(500));
  assert.equal(polls[0].id, 'challenge-1');
  await React.act(async () => [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === '刷新二维码').click());
  assert.equal(starts[0].aborted, true);
  assert.equal(polls[0].signal.aborted, true);
  assert.equal(starts.length, 2);
  await React.act(async () => delayedPoll.resolve(true));
  assert.ok(document.querySelector('[role="dialog"]'), 'old poll cannot close a refreshed challenge');
  await React.act(async () => {
    snapshot = { state: 'confirmed', scope: 'host-authenticated', status: { authenticated: true, user: { name: 'Host User' } } };
    for (const changed of listeners) changed();
  });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(starts[1].aborted, true);
  assert.ok(trigger.textContent.includes('Host User'));
  assert.equal(dom.window.localStorage.length, 0);
});

test('closing and unmounting account QR login abort actual requests and ignore late start responses', async t => {
  const { root, dom } = await mountedDom(t);
  const delayed = Promise.withResolvers(), starts = [];
  const authority = {
    getSnapshot: () => signedOutSnapshot,
    subscribe: () => () => {},
    startLogin: signal => { starts.push(signal); return delayed.promise; },
    pollLogin: () => { throw Error('A cancelled QR must never start polling'); },
  };
  const signedOutSnapshot = { state: 'confirmed', scope: null, status: { authenticated: false, user: null } };
  const { entries } = fixture(authority);
  const account = entries.find(row => row.options.name === 'settings.launcher');
  await React.act(async () => root.render(React.createElement(account.component, { wide: true, settingsOpen: false, openSettings: () => {} })));
  const open = async () => {
    await React.act(async () => document.querySelector('[aria-label="账户菜单"]').click());
    await React.act(async () => [...document.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === '登录 GEA').click());
  };
  await open();
  await React.act(async () => document.querySelector('[role="dialog"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(starts[0].aborted, true);
  await React.act(async () => delayed.resolve({ loginId: 'late', image: 'data:image/png;base64,AA==', expiresIn: 120 }));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  await open();
  await React.act(async () => root.render(null));
  assert.equal(starts[1].aborted, true);
});


test('account QR expiration stops polling and an unavailable GEA authority cannot initiate login', async t => {
  const { root } = await mountedDom(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const unavailable = fixture().entries.find(row => row.options.name === 'settings.launcher');
  await React.act(async () => root.render(React.createElement(unavailable.component, { wide: true, settingsOpen: false, openSettings: () => {} })));
  await React.act(async () => document.querySelector('[aria-label="账户菜单"]').click());
  assert.equal([...document.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === '登录 GEA').disabled, true);
  const signedOut = { state: 'confirmed', scope: null, status: { authenticated: false, user: null } };
  let polls = 0;
  const authority = {
    getSnapshot: () => signedOut, subscribe: () => () => {},
    startLogin: async () => ({ loginId: 'expiring', image: 'data:image/png;base64,AA==', expiresIn: 120 }),
    pollLogin: async () => { polls++; return false; },
  };
  const account = fixture(authority).entries.find(row => row.options.name === 'settings.launcher');
  await React.act(async () => root.render(React.createElement(account.component, { wide: true, settingsOpen: false, openSettings: () => {} })));
  await React.act(async () => document.querySelector('[aria-label="账户菜单"]').click());
  await React.act(async () => [...document.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === '登录 GEA').click());
  await React.act(async () => t.mock.timers.tick(120000));
  assert.ok(document.querySelector('[role="dialog"]').textContent.includes('二维码已过期'));
  assert.equal(document.querySelector('[role="dialog"] img'), null);
  assert.equal(polls, 0);
});


test('a current successful QR poll waits for the latest confirmed Host identity before closing', async t => {
  const { root } = await mountedDom(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  let snapshot = { state: 'confirmed', scope: null, status: { authenticated: false, user: null } };
  const listeners = new Set();
  let polls = 0;
  const authority = {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    startLogin: async () => ({ loginId: 'current', image: 'data:image/png;base64,AA==', expiresIn: 120 }),
    pollLogin: async () => { polls++; return true; },
  };
  const account = fixture(authority).entries.find(row => row.options.name === 'settings.launcher');
  await React.act(async () => root.render(React.createElement(account.component, { wide: true, settingsOpen: false, openSettings: () => {} })));
  await React.act(async () => document.querySelector('[aria-label="账户菜单"]').click());
  await React.act(async () => [...document.querySelectorAll('[role="menuitem"]')].find(button => button.textContent === '登录 GEA').click());
  await React.act(async () => t.mock.timers.tick(500));
  assert.equal(polls, 1);
  assert.ok(document.querySelector('[role="dialog"]'), 'poll=true is not the current Host authentication projection');
  assert.equal(document.querySelector('.gea-account-login-qr').getAttribute('aria-busy'), 'false');
  await React.act(async () => t.mock.timers.tick(1000));
  assert.equal(polls, 1, 'a completed challenge does not busy-poll while awaiting Host identity');
  const publish = next => React.act(async () => { snapshot = next; for (const changed of listeners) changed(); });
  await publish({ state: 'unknown', scope: null, status: { authenticated: true, user: { name: 'Unconfirmed' } } });
  assert.ok(document.querySelector('[role="dialog"]'), 'an unconfirmed identity cannot close the dialog');
  await publish({ state: 'confirmed', error: 'IDENTITY_READ_FAILED', scope: 'stale-host', status: { authenticated: true, user: { name: 'Stale Host User' } } });
  assert.ok(document.querySelector('[role="dialog"]'), 'an observation error cannot turn a cached identity into current login confirmation');
  await publish({ state: 'confirmed', scope: 'current-host', status: { authenticated: true, user: { name: 'Confirmed Host User' } } });
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.ok(document.querySelector('[aria-label="账户菜单"]').textContent.includes('Confirmed Host User'));
});

test('sidebar metadata and icons use the same winning slot projection with shadowed and abdicated owners', async t => {
  const { root } = await mountedDom(t);
  const core = new SlotCore();
  core.register({ name: 'root', children: { sidebar: { kind: 'single', scope: 'root' } } }, () => null);
  core.register({ name: 'sidebar', children: { 'sidebar.panellist': { kind: 'list', scope: 'root' } } }, () => null);
  const icon = owner => () => React.createElement('svg', { 'data-panel-owner': owner });
  core.register({ name: 'sidebar.panellist', id: 'schedules', priority: 10, order: 20, label: '原定时任务' }, icon('original'));
  core.register({ name: 'sidebar.panellist', id: 'plugins', order: 10, label: '插件管理' }, icon('plugins'));
  const removeWinner = core.register({ name: 'sidebar.panellist', id: 'schedules', priority: -10, order: -5, label: '新定时任务' }, icon('winner'));
  core.register({ name: 'sidebar.panellist', id: 'schedules', priority: -20, order: -20, label: '退位定时任务' }, icon('abdicated'));
  const abdicated = core.entries('sidebar.panellist').find(row => row.options.label === '退位定时任务');
  core.reportEntryError('sidebar.panellist', abdicated, Error('fixture owner failed'), { abdicate: true });
  const { ctx, entries, renderSlot } = fixture(undefined, core);
  assert.equal(ctx.slots.entries('sidebar.panellist').length, 4, 'raw ledger retains shadowed and abdicated registrations');
  assert.equal(ctx.slots.entriesOfSlot('sidebar.panellist').length, 2, 'rendered projection elects one non-abdicated owner per id');
  const sidebar = entries.find(row => row.options.name === 'sidebar');
  await React.act(async () => root.render(React.createElement(sidebar.component, {
    collapsed: false, width: 280, usePanelInfo: selector => selector({ activePanelId: 'schedules' }), renderSlot,
  })));
  const rows = () => [...document.querySelectorAll('.gea-plugin-entry')];
  assert.deepEqual(rows().map(row => row.getAttribute('aria-label')), ['新定时任务', '插件管理']);
  assert.equal(rows()[0].querySelector('svg').dataset.panelOwner, 'winner');
  assert.equal(document.querySelectorAll('[aria-label="新定时任务"]').length, 1);
  assert.equal(document.querySelector('[aria-label="原定时任务"]'), null);
  assert.equal(document.querySelector('[aria-label="退位定时任务"]'), null);
  await React.act(async () => removeWinner());
  assert.deepEqual(rows().map(row => row.getAttribute('aria-label')), ['插件管理', '原定时任务']);
  assert.equal(rows()[1].querySelector('svg').dataset.panelOwner, 'original');
  assert.equal(rows()[1].getAttribute('aria-current'), 'page');
});
