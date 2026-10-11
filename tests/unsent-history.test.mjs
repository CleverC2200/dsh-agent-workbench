import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const built = await build({
  stdin: {
    contents:
      "export {PageUnsentHistory} from './src/company/unsent-history.tsx';export {WorkbenchController} from './src/workbench.ts';export {act,createElement} from 'react';export {createRoot} from 'react-dom/client';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['react', 'react-dom/client'],
  loader: { '.css': 'text' },
});
const module = { exports: {} };
new Function('module', 'exports', 'require', built.outputFiles[0].text)(
  module,
  module.exports,
  require,
);
const { PageUnsentHistory, WorkbenchController, act, createElement, createRoot } = module.exports;
const old = 'session-11111111-1111-4111-8111-111111111147',
  fresh = 'session-22222222-2222-4222-8222-222222222247';
const preset = 'gea-html-inventory-dms',
  cwd = '/original/workspace';
for (const cold of [false, true])
  test(`History displays only official ordinary blank Sessions for this page preset and workspace (${cold ? 'cold metadata' : 'cached metadata'})`, async (t) => {
    const dom = new JSDOM('<div id="root"></div>', {
      url: 'https://fixture.test',
      pretendToBeVisual: true,
    });
    const saved = new Map(
      ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'].map((key) => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key),
      ]),
    );
    for (const [key, value] of [
      ['window', dom.window],
      ['document', dom.window.document],
      ['navigator', dom.window.navigator],
      ['IS_REACT_ACT_ENVIRONMENT', true],
    ])
      Object.defineProperty(globalThis, key, { configurable: true, value });
    const rows = [
      {
        id: old,
        blank: true,
        updatedAt: 1000,
        cwd,
        displayTitle: 'DMS old',
        projectionValues: { agentPreset: preset },
      },
      {
        id: fresh,
        blank: true,
        updatedAt: 2000,
        cwd,
        displayTitle: 'DMS new',
        projectionValues: { agentPreset: preset },
      },
      {
        id: 'wrong-preset',
        blank: true,
        cwd,
        projectionValues: { agentPreset: 'standard' },
      },
      {
        id: 'wrong-cwd',
        blank: true,
        cwd: '/other',
        projectionValues: { agentPreset: preset },
      },
      {
        id: 'child',
        origin: 'subagent',
        blank: true,
        cwd,
        projectionValues: { agentPreset: preset },
      },
      {
        id: 'sent',
        blank: false,
        cwd,
        projectionValues: { agentPreset: preset },
      },
      {
        id: 'unbound-null',
        blank: true,
        cwd,
        projectionValues: { agentPreset: null },
      },
    ];
    if (cold) delete rows[0].projectionValues;
    const reads = [];
    const listeners = new Set();
    let state = {
      phase: 'ready',
      ids: rows.map((row) => row.id),
      byId: Object.fromEntries(rows.map((row) => [row.id, row])),
      projectionsBySession: {},
    };
    const sessions = {
      list: {
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        getSnapshot: () => state,
      },
      refreshProjections: async (id) => {
        reads.push(id);
        assert.equal(id, old);
        await Promise.resolve();
        state = {
          ...state,
          byId: {
            ...state.byId,
            [old]: {
              ...state.byId[old],
              projectionValues: { agentPreset: preset },
            },
          },
        };
        for (const listener of listeners) listener();
      },
    };
    const opens = [];
    const root = createRoot(document.getElementById('root'));
    t.after(async () => {
      await act(async () => root.unmount());
      dom.window.close();
      for (const [key, value] of saved) {
        if (value) Object.defineProperty(globalThis, key, value);
        else delete globalThis[key];
      }
    });
    await act(async () => {
      root.render(
        createElement(PageUnsentHistory, {
          page: { id: 'inventory-dms', resourceId: preset, label: 'DMS' },
          cwd,
          sessions,
          request: async () =>
            Response.json([{ id: preset, enabled: true, installed: true, kind: 'prompt' }]),
          language: 'zh',
          selectedSessionId: fresh,
          onChoose: (...args) => opens.push(args),
        }),
      );
    });
    assert.deepEqual(reads, cold ? [old] : []);
    const buttons = [...document.querySelectorAll('button')];
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].getAttribute('aria-current'), 'true');
    assert.match(buttons[0].textContent, /DMS new/);
    assert.match(buttons[1].textContent, /DMS old/);
    await act(async () => buttons[1].click());
    assert.deepEqual(opens, [[old, preset, cwd]]);
    await act(async () => {
      state = {
        ...state,
        byId: { ...state.byId, [old]: { ...state.byId[old], cwd: '/changed' } },
      };
      for (const listener of listeners) listener();
    });
    assert.equal(document.querySelectorAll('button').length, 1);
  });
test('a cancelled history intent cannot consume a late target or another preset/cwd as the current page', () => {
  const workbench = new WorkbenchController({ panel() {}, document() {} });
  workbench.registerFrame({
    id: 'inventory-dms',
    kind: 'html',
    label: 'DMS',
    resourceId: preset,
  });
  workbench.showHistory('inventory-dms');
  workbench.selectHistorySession('inventory-dms', old, { preset, cwd });
  const requested = workbench.takeHistoryTarget(old);
  assert.deepEqual(requested.expected, { preset, cwd });
  assert.equal(requested.page, 'inventory-dms');
  workbench.cancelHistory();
  assert.equal(requested.signal.aborted, true);
  workbench.showHistory('inventory-dms');
  workbench.selectHistorySession('inventory-dms', old, { preset, cwd });
  assert.equal(workbench.takeHistoryTarget(fresh), undefined);
  workbench.showHistory('inventory-dms');
  workbench.selectHistorySession('inventory-dms', old, { preset, cwd });
  workbench.leaveDocument();
  assert.equal(workbench.takeHistoryTarget(old), undefined);
});
