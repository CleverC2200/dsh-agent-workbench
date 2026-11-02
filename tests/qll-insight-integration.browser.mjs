import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const config = JSON.parse(await readFile('business/inventory-qll/sql.config.json', 'utf8'));
const result = await build({
  stdin: {
    contents: `import React from 'react';import{createRoot}from'react-dom/client';import Page from './business/inventory-qll/source/inventory-light-plugins/src/pages/configured-workbench.tsx';createRoot(document.getElementById('app')).render(React.createElement(Page));`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  outfile: 'qll.js',
  platform: 'browser',
  format: 'iife',
  alias: { react: resolve('node_modules/react'), 'react-dom': resolve('node_modules/react-dom') },
  loader: { '.css': 'css', '.module.css': 'local-css' },
  define: { PLUGIN_ID: '"qll"', 'process.env.NODE_ENV': '"test"' },
  plugins: [
    {
      name: 'external-host-boundary',
      setup(api) {
        if (process.env.D100_BASELINE)
          api.onLoad({ filter: /pages\/configured-workbench\.tsx$/ }, async (args) => ({
            contents: await readFile('../../baseline-qll-workbench.tsx', 'utf8'),
            loader: 'tsx',
            resolveDir: resolve(args.path, '..'),
          }));
        api.onResolve({ filter: /channel\.js$/ }, () => ({ path: 'host', namespace: 'fixture' }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: `export const ready=Promise.resolve();export const call=(method,input)=>window.hostCall(method,input);export const setContext=()=>{};export const publish=()=>{};export const action=()=>()=>{};export const reportElements=()=>{};`,
        }));
      },
    },
  ],
});
const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
test('real full-chain page requests model insight and refreshes evidence when channel scope changes', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const calls = [];
  await page.exposeFunction('hostCall', async (method, input) => {
    assert.equal(method, 'insight');
    calls.push(input);
    return {
      answer: '当前公司体系库存和渠道观测按各自来源范围展示，缺失部分保留未知。测试模型返回。',
    };
  });
  await page.route('http://qll.test/**', (route) => {
    if (route.request().method() !== 'POST')
      return route.fulfill({
        contentType: 'text/html',
        body: `<style>${css}</style><div id=app></div><script id="agent-sql-direct" type="application/json">{"path":"/api/agents/inventory-qll/query","token":"fixture"}</script><script>${js}</script>`,
      });
    const { queryId } = route.request().postDataJSON();
    const q = config.queries[queryId];
    assert.ok(q, queryId);
    let rows = [];
    const row = Object.fromEntries(q.resultColumns.map((k) => [k, 0]));
    if (queryId.startsWith('source.')) rows = [{ day: '2026-11-01' }];
    else if (queryId === 'calendar.target_versions')
      rows = [{ month: '2026-11-01', inventory_version: '月初', source_rows: 1 }];
    else if (q.resultColumns.includes('total')) rows = [{ total: 0 }];
    else if (q.resultColumns.includes('row_count'))
      rows = [
        {
          ...row,
          row_count: 1,
          total_qty: 100,
          age_weight_qty: 100,
          weighted_age_sum: 200,
          unknown_age_qty: 0,
        },
      ];
    return route.fulfill({
      json: { rows, returnedColumns: q.resultColumns, rejectedColumns: [], configVersion: 'one' },
    });
  });
  await page.goto('http://qll.test/');
  await expect(page.getByLabel('AI 洞察')).toContainText('测试模型返回。', { timeout: 15000 });
  assert.equal(calls.at(-1).evidence.scope.channelSwitch, false);
  assert.match(calls.at(-1).evidence.scope.primaryBasis, /公司体系/);
  await page.getByLabel('含渠道', { exact: true }).check();
  await expect.poll(() => calls.at(-1)?.evidence.scope.channelSwitch).toBe(true);
  await expect(page.getByLabel('AI 洞察')).toContainText('测试模型返回。');
});
