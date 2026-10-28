import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
const code = (
  await build({
    entryPoints: ['business/shared/use-dashboard-insight.ts'],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react'],
    plugins: [
      {
        name: 'insight-channel',
        setup(builder) {
          builder.onResolve({ filter: /channel\.js$/ }, () => ({
            path: 'insight-channel',
            namespace: 'insight-test',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'insight-test' }, () => ({
            contents:
              'export const ready = Promise.resolve(); export const call = (...args) => globalThis.__insightCall(...args);',
            loader: 'js',
          }));
        },
      },
    ],
    // Only the page channel is replaced; the actual hook runs through React effects.
  })
).outputFiles[0].text;
const module = { exports: {} };
new Function('module', 'exports', 'require', code)(
  module,
  module.exports,
  createRequire(import.meta.url),
);
const { useDashboardInsight } = module.exports;
test('changed evidence cancels old insight and ignores late responses after scope changes', async (t) => {
  const dom = new JSDOM('<div id="root"></div>');
  const oldWindow = globalThis.window,
    oldDocument = globalThis.document;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const requests = [];
  globalThis.__insightCall = (method, data, options) =>
    new Promise((resolve) => requests.push({ method, data, options, resolve }));
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(() => root.unmount());
    dom.window.close();
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
    delete globalThis.__insightCall;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });
  function View({ base }) {
    const state = useDashboardInsight({ base }, true);
    return React.createElement('p', null, state.answer ?? state.status);
  }
  await act(() => root.render(React.createElement(View, { base: '郑州' })));
  await act(() => new Promise((resolve) => setTimeout(resolve, 550)));
  assert.equal(requests.length, 1);
  await act(() => root.render(React.createElement(View, { base: '华东' })));
  assert.equal(requests[0].options.signal.aborted, true);
  await act(() => new Promise((resolve) => setTimeout(resolve, 550)));
  assert.equal(requests.length, 2);
  await act(async () => {
    requests[1].resolve({ answer: '华东洞察' });
  });
  await act(async () => {
    requests[0].resolve({ answer: '旧郑州洞察' });
  });
  assert.equal(document.querySelector('p').textContent, '华东洞察');
  await act(() => window.dispatchEvent(new window.Event('gea-session-changing')));
  assert.equal(document.querySelector('p').textContent, 'loading');
});
