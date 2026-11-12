import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const output = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';
      import {createWorkflow} from './static/mps/source/workflow-view.js';
      import {readRelations} from './static/mps/source/relations.js';
      const Workflow=createWorkflow(React,()=>{},{});
      const root=createRoot(document.getElementById('root'));
      const draft={id:'test',name:'测试',month:'2026-12',pull:'monthly',productSource:'local-file',
        products:[{基地:'甲',产品编码:'A',产品名称:'A',大类:'点心',系列:'系列',物料组:'包点'}]};
      const scopeKey=JSON.stringify([draft.id,draft.month,1]);
      window.completed=[];
      window.show=async(state='ready')=>{
        const config=JSON.parse(document.getElementById('agent-sql-config').textContent);
        const result=await readRelations(config,async(_request,{queryId})=>({rows:queryId.endsWith('.count')?[{total:0}]:[],returnedColumns:config.queries[queryId].columns,rejectedColumns:[],configVersion:'v1'}),draft.month);
        const relations={...result,scopeKey,...(state==='busy'?{busy:true}:state==='error'?{error:'刷新失败'}:state==='scope'?{scopeKey:'old'}:state==='config'?{configSignature:'old'}:state==='incomplete'?{sources:{}}:state==='unversioned'?{configVersion:undefined}:state==='version'?{configVersion:'old'}:{})};
        const input=state==='preparing'?{...draft,reportRead:{periods:{'2027-02':{status:'loading'}}}}:draft;
        root.render(React.createElement(Workflow,{step:'capacity',draft:input,scopeGeneration:1,relations,update(){},setEvaluation:value=>window.completed.push(value)}));
      };`,
  },
  plugins: [await mpsComputePlugin(process.env.MPS_MANAGE_SOURCE)],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
});

test('评估复用当前完整关系，刷新、范围或配置变化后重新读取', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const calls = [];
  let held = false,
    release = () => {};
  t.after(() => release());
  await page.exposeFunction('query', async ({ queryId }) => {
    calls.push(queryId);
    if (held && queryId === 'unit-weights.count')
      await new Promise((resolve) => {
        release = resolve;
      });
    return {
      rows: queryId.endsWith('.count') ? [{ total: 0 }] : [],
      returnedColumns: config.queries[queryId].columns,
      rejectedColumns: [],
      configVersion: 'v1',
    };
  });
  await page.route('https://mps.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<script id="agent-sql-config" type="application/json">${JSON.stringify(config)}</script><div id="root"></div>`,
    }),
  );
  await page.goto('https://mps.test/');
  await page.addScriptTag({ content: output.outputFiles[0].text });
  await page.evaluate(() => {
    window.addEventListener('message', (event) => {
      if (event.data?.type !== 'ready') return;
      const pair = new MessageChannel();
      const pending = new Map();
      window.cancelled = [];
      pair.port1.onmessage = async ({ data }) => {
        if (data.type === 'cancel') {
          window.cancelled.push(pending.get(data.id));
          return;
        }
        if (data.type !== 'request') return;
        pending.set(data.id, data.parameters.queryId);
        pair.port1.postMessage({
          type: 'response',
          id: data.id,
          result: await window.query(data.parameters),
        });
      };
      window.postMessage(
        { protocol: 'gea-html-v2', type: 'connect', context: { session: 'test', plugin: 'mps' } },
        '*',
        [pair.port2],
      );
    });
    window.postMessage({ protocol: 'gea-html-v2', type: 'ready' }, '*');
  });
  await page.evaluate(() => window.show('preparing'));
  await expect(page.getByRole('button', { name: '输入准备中…', exact: true })).toBeDisabled();
  assert.equal(calls.length, 0);
  for (const state of ['ready', 'busy', 'error', 'scope', 'config', 'incomplete', 'unversioned']) {
    await page.evaluate((state) => window.show(state), state);
    await expect(page.getByRole('button', { name: '执行评估', exact: true })).toBeEnabled();
    const before = calls.length;
    const completed = await page.evaluate(() => window.completed.length);
    await page.getByRole('button', { name: '执行评估', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.completed.length)).toBe(completed + 1);
    const relations = calls
      .slice(before)
      .filter((id) => /^(products|sku_capacity|tunnels|transfers)\./.test(id));
    assert.equal(relations.length, state === 'ready' ? 0 : 8, state);
  }
  const results = await page.evaluate(() => window.completed.map((item) => item.result));
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
  await page.evaluate(() => window.show('version'));
  await page.getByRole('button', { name: '执行评估', exact: true }).click();
  await expect(page.getByText('关系来源与件吨系数配置版本不一致，请重新读取')).toBeVisible();
  assert.equal(await page.evaluate(() => window.completed.length), results.length);
  await page.evaluate(() => window.show('ready'));
  await expect(page.getByRole('button', { name: '执行评估', exact: true })).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event('gea-session-changed')));
  held = true;
  const before = calls.length;
  await page.getByRole('button', { name: '执行评估', exact: true }).click();
  await expect.poll(() => calls.slice(before).includes('unit-weights.count')).toBe(true);
  await page.evaluate(() => window.show('error'));
  await expect
    .poll(() =>
      page.evaluate(() => window.cancelled.filter((id) => id === 'unit-weights.count').length),
    )
    .toBe(1);
  release();
});
