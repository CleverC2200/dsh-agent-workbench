import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

const rows = [{ warehouse_code: 'W1', warehouse_name: '分仓', sku: 'SKU1', recommended_qty: 3 }];
const mocks = {
  '../../../../../shared/configured-facts-page': 'export const ConfiguredFactsPage=()=>null;',
  '../../../../../shared/current-shortage-list': 'export const CurrentShortageList=()=>null;',
  '../channel.js': 'export const call=(...args)=>globalThis.dmsFixture.call(...args);',
  '../fc-feedback': 'export const dmsWorkbookRows=x=>x;',
  '../native/context': 'export const updateContext=()=>{};',
  '../../../../../shared/original-business-list':
    'import React from "react"; export const OriginalBusinessList=p=>React.createElement("div",null,p.toolbarActions);',
  '../dsh-ui/controls':
    'import React from "react"; export const Modal=p=>p.visible?React.createElement("div",null,p.children):null; export const DataPagination=()=>null;',
  '../dsh-ui/workbook': 'export const downloadWorkbook=()=>{}; export const readWorkbook=()=>{};',
  '../native/memory-storage': 'export const memoryStorage={getItem:()=>null,setItem:()=>{}};',
  '../../../fc/src/lib/planning':
    'export const IMPORT_FIELDS=[]; export const defaultPlanTemplateMonth=()=>"2026-11"; export const currentPlanningMonth=()=>"2026-10"; export const nextMonth=()=>"2026-11";',
  './fc-workflow':
    'export const summarizeFcRows=()=>({}); export const validateFcSubmission=()=>{}; export const applyFcPlan=x=>x; export const planKey=x=>x.sku; export const rowKey=x=>x.sku; export const quantity=x=>Number(x??0); export const readFcActionRows=async()=>globalThis.dmsFixture.rows; export const validateFcImport=()=>[];',
};
await mkdir('.scratch', { recursive: true });
const compiled = await build({
  entryPoints: [
    'business/inventory-fc/source/inventory-light-plugins/src/pages/configured-fc-list.tsx',
  ],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  external: ['react', 'zod'],
  plugins: [
    {
      name: 'fixture',
      setup(api) {
        api.onResolve({ filter: /.*/ }, (a) =>
          mocks[a.path] ? { path: a.path, namespace: 'fixture' } : undefined,
        );
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({
          contents: mocks[a.path],
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
await writeFile('.scratch/fc-dms.mjs', compiled.outputFiles[0].text);
const { FcConfiguredList, FcWorkflowProvider } = await import(
  pathToFileURL(resolve('.scratch/fc-dms.mjs'))
);
test('branch confirmation sends documented order, retains draft on failure, and displays receipt only after acknowledgement', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const calls = [];
  let fail = true;
  globalThis.dmsFixture = {
    rows,
    call: async (method, payload) => {
      calls.push({ method, payload });
      if (fail) throw Error('DMS结果未知');
      return { orderCode: 'DMS1', aiPreOrderCode: payload.order.aiPreOrderCode };
    },
  };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const click = async (text) => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent === text);
    assert.ok(button, text);
    await act(async () => {
      button.click();
      await new Promise((r) => setTimeout(r, 20));
    });
  };
  try {
    await act(async () =>
      root.render(
        React.createElement(
          FcWorkflowProvider,
          null,
          React.createElement(FcConfiguredList, {
            columns: [],
            view: { title: '补货' },
            actionScope: { viewId: 'replenishment', input: { asOf: '2026-10-23' } },
          }),
        ),
      ),
    );
    await click('提交');
    await click('确认暂存至DMS');
    assert.equal(calls.length, 0);
    for (const [label, value] of [
      ['客户编码', 'C1'],
      ['收货地址编码', 'A1'],
      ['提货点编码', 'P1'],
    ]) {
      const input = document.querySelector(`[aria-label="${label}"]`);
      // React's tracked input setter must observe a native edit.
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(
          input,
          value,
        );
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
    }
    await click('确认暂存至DMS');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'branch-dms');
    assert.equal(calls[0].payload.order.customerCode, 'C1');
    assert.deepEqual(calls[0].payload.order.itemList, [{ productCode: 'SKU1', quantity: 3 }]);
    assert.match(document.body.textContent, /DMS结果未知/);
    assert.doesNotMatch(document.body.textContent, /DMS订单号：DMS1/);
    fail = false;
    await click('确认暂存至DMS');
    assert.equal(calls[1].payload.order.aiPreOrderCode, calls[0].payload.order.aiPreOrderCode);
    assert.match(document.body.textContent, /DMS订单号：DMS1/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.dmsFixture;
  }
});
