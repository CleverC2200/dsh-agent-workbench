import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
test('new whole-workspace queries withdraw old warnings while current failures still publish', async () => {
  const require = createRequire(resolve('package.json')),
    React = require('react'),
    { JSDOM } = require('jsdom');
  const dom = new JSDOM('<div id="app"></div>');
  const saved = new Map(
    ['window', 'document', 'Event', 'CustomEvent', 'IS_REACT_ACT_ENVIRONMENT'].map((k) => [
      k,
      Object.getOwnPropertyDescriptor(globalThis, k),
    ]),
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const ui = resolve('business/inventory-qll/source/inventory-light-plugins/src');
  const result = await build({
    stdin: {
      contents: `import '${ui}/native/entry.tsx';export {pageContext,clearContext} from '${ui}/native/context.ts';`,
      loader: 'ts',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    loader: { '.css': 'empty', '.module.css': 'empty' },
    format: 'esm',
    platform: 'node',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    plugins: [
      {
        name: 'business-fixtures',
        setup(b) {
          b.onResolve({ filter: /^@business-|channel\.js$|qll-engine$/ }, (a) => ({
            path: a.path,
            namespace: 'fixture',
          }));
          b.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({
            contents:
              a.path === '@business-page'
                ? 'export default function Page(){return null}'
                : a.path === '@business-style'
                  ? ''
                  : a.path.endsWith('channel.js')
                    ? 'export const ready=Promise.resolve();export const reportElements=()=>()=>{};export const action=()=>{};export const publish=async()=>{};'
                    : 'export const load=async()=>({fixture:true});export const clearFacts=()=>{};export const loadDetails=async()=>({});export const loadTrend=async()=>({});export const loadHistory=async()=>({});',
          }));
        },
      },
    ],
  });
  await mkdir('.runtime', { recursive: true });
  const file = resolve('.runtime/chain-warning-lifecycle.mjs');
  await writeFile(file, result.outputFiles[0].text);
  let api;
  try {
    await React.act(async () => {
      api = await import(pathToFileURL(file));
      await Promise.resolve();
    });
    const warn = (message) =>
      window.dispatchEvent(new CustomEvent('gea-query-warning', { detail: { message } }));
    await React.act(async () => warn('channel denied'));
    assert.match(document.getElementById('app').textContent, /当前账号的数据权限未就绪/);
    assert.equal(api.pageContext().parts.queryFailure.message, 'channel denied');
    await React.act(async () =>
      window.fetch('/api/workspace?scope=company&month=2026-09&part=current&sku=10007014'),
    );
    assert.equal(document.querySelector('[role=alert]'), null);
    assert.equal(api.pageContext().parts.queryFailure, undefined);
    await React.act(async () => warn('new company failure'));
    assert.equal(api.pageContext().parts.queryFailure.message, 'new company failure');
    assert.match(document.getElementById('app').textContent, /部分数据读取失败/);
    await React.act(async () => window.fetch('/api/workspace?scope=company&sku=another-object'));
    assert.equal(
      api.pageContext().parts.queryFailure.message,
      'new company failure',
      'object reads do not clear page failures',
    );
    assert.match(document.getElementById('app').textContent, /部分数据读取失败/);
    await React.act(async () => window.fetch('/api/workspace?scope=all-channel&part=current'));
    assert.equal(api.pageContext().parts.queryFailure, undefined);
    await React.act(async () => window.dispatchEvent(new Event('gea-identity-changed')));
  } finally {
    api?.clearContext();
    dom.window.close();
    for (const [k, v] of saved)
      if (v) Object.defineProperty(globalThis, k, v);
      else delete globalThis[k];
  }
});
