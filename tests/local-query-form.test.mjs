import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React from 'react';
import { act } from 'react';
const out = await build({
  entryPoints: ['business/shared/local-query-form.tsx'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  external: ['react'],
  jsx: 'transform',
});
// Resolve React from this repository rather than the data URL.
const source = out.outputFiles[0].text
  .replaceAll('from "react/jsx-runtime"', `from "${import.meta.resolve('react/jsx-runtime')}"`)
  .replaceAll('from "react"', `from "${import.meta.resolve('react')}"`);
const { LocalQueryForm } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);
test('query clicks and Enter work when native submission is blocked; validation and other buttons remain intact', async (t) => {
  const dom = new JSDOM('<div id="root"></div>');
  const originals = new Map(
    ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map((k) => [
      k,
      Object.getOwnPropertyDescriptor(globalThis, k),
    ]),
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(() => root.unmount());
    dom.window.close();
    for (const [k, v] of originals)
      v ? Object.defineProperty(globalThis, k, v) : delete globalThis[k];
  });
  // Model the host refusing native form submission before React receives it.
  document.addEventListener(
    'submit',
    (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  let queries = 0,
    other = 0;
  const render = async (component) =>
    act(() =>
      root.render(
        React.createElement(
          component,
          {
            onSubmit: (e) => {
              e.preventDefault();
              queries++;
            },
          },
          React.createElement('input', {
            name: 'date',
            type: 'date',
            required: true,
            max: '2026-10-19',
            defaultValue: '2026-10-19',
          }),
          React.createElement('button', { id: 'run' }, '查询'),
          React.createElement(
            'button',
            { id: 'other', type: 'button', onClick: () => other++ },
            '选择客户',
          ),
        ),
      ),
    );
  await render('form');
  await act(() => document.querySelector('#run').click());
  assert.equal(queries, 0, 'original submit handler cannot run in this environment');
  await render(LocalQueryForm);
  await act(() => document.querySelector('#run').click());
  assert.equal(queries, 1);
  await act(() => document.querySelector('#other').click());
  assert.equal(other, 1);
  assert.equal(queries, 1);
  const input = document.querySelector('input');
  input.value = '2026-10-20';
  await act(() => document.querySelector('#run').click());
  assert.equal(queries, 1, 'future date must fail validation');
  input.value = '2026-10-19';
  input.focus();
  await act(() =>
    input.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    ),
  );
  assert.equal(queries, 2);
  await act(() =>
    input.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.equal(queries, 2);
});
