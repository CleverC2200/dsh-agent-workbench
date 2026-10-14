import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
const { outputFiles } = await build({
  entryPoints: ['src/inventory-entry.tsx'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
});
const module = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(
  module,
  module.exports,
  createRequire(import.meta.url),
);
const { mountInventoryEntry } = module.exports;

for (const mode of ['draft', 'latest-question', 'cancelled'])
  test(`inventory dock ${mode} borrows the current question and retains source Session, draft and default`, async (t) => {
    const dom = new JSDOM('<div id="root"></div>');
    const saved = new Map(
      ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'].map((key) => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key),
      ]),
    );
    for (const [key, value] of Object.entries({
      window: dom.window,
      document: dom.window.document,
      navigator: dom.window.navigator,
      IS_REACT_ACT_ENVIRONMENT: true,
    }))
      Object.defineProperty(globalThis, key, { value, configurable: true });
    const { createRoot } = await import('react-dom/client');
    const root = createRoot(document.getElementById('root'));
    const dispose = [],
      calls = [],
      navigation = new AbortController();
    let component, options, release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const original = {
      preset: 'custom-user-preset',
      draft: mode === 'draft' ? '遂平基地的大日期库存风险' : '',
      default: 'custom-user-preset',
      history: ['old question'],
    };
    const before = JSON.stringify(original);
    const ctx = {
      inject: (_names, fn) =>
        fn({
          businessAccount: {
            getSnapshot: () => ({
              state: 'confirmed',
              scope: 'owner',
              subject: 'user',
              status: { authenticated: true },
            }),
          },
          effect: (fn) => dispose.push(fn()),
        }),
      effect: (fn) => dispose.push(fn()),
      layout: { beginNavigation: () => navigation.signal },
      slots: {
        inject: (_slot, fn) => fn(),
        register: (o, c) => {
          options = o;
          component = c;
          return () => {};
        },
      },
    };
    const snapshot = { pages: [{ id: 'inventory-aqkc' }] };
    const workbench = {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      open: async (page) => calls.push(['page', page]),
    };
    const host = {
      question: async (id) => {
        calls.push(['question', id]);
        return '帮我分析遂平基地的安全库存';
      },
      fetch: async () => Response.json({ preset: 'gea-html-inventory-aqkc' }),
      workspace: async (path) => ({ workspaceId: 'workspace', path }),
      create: async (value) => {
        calls.push(['create', value]);
        await pending;
        return 'fresh';
      },
      select: async (id, preset) => calls.push(['select', id, preset]),
      open: async (id, _skill, signal, beforeOpen, draft) => {
        await beforeOpen?.({ sessionId: id, preset: 'gea-html-inventory-aqkc', cwd: '/workspace' });
        signal.throwIfAborted();
        calls.push(['draft', draft]);
        calls.push(['native', id]);
      },
    };
    mountInventoryEntry(
      ctx,
      workbench,
      () => host,
      async () => {
        calls.push(['associate']);
      },
      (key) => key,
    );
    t.after(async () => {
      await React.act(() => root.unmount());
      for (const cleanup of dispose.reverse()) cleanup?.();
      dom.window.close();
      for (const [key, descriptor] of saved)
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
    });
    assert.equal(options.name, 'conversation.input.dock');
    assert.equal(options.id, 'gea-inventory-entry');
    await React.act(() =>
      root.render(
        React.createElement(component, {
          sessionId: 'original',
          useInput: (fn) => fn({ draft: original.draft }),
          useSessions: (fn) => fn({ byId: { original: { cwd: '/workspace' } } }),
          useProjection: () => original.preset,
        }),
      ),
    );
    const button = document.querySelector('button');
    await React.act(async () => {
      button.click();
      button.click();
    });
    assert.equal(button.disabled, true);
    assert.equal(calls.filter((call) => call[0] === 'create').length, 1);
    if (mode === 'cancelled') navigation.abort();
    await React.act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(JSON.stringify(original), before);
    if (mode === 'cancelled') {
      assert.equal(
        calls.some((call) => ['native', 'page', 'associate'].includes(call[0])),
        false,
      );
    } else {
      assert.deepEqual(
        calls.find((call) => call[0] === 'draft'),
        ['draft', mode === 'draft' ? original.draft : '帮我分析遂平基地的安全库存'],
      );
      assert.equal(calls.filter((call) => call[0] === 'question').length, mode === 'draft' ? 0 : 1);
      assert.deepEqual(
        calls.find((call) => call[0] === 'create'),
        ['create', { workspaceId: 'workspace' }],
      );
    }
  });
