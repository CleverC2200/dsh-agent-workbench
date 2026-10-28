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
  './fc-submission-persistence':
    'export const persistAndSubmitFc=async(w,s,signal,submit,ack)=>{const f=globalThis.dmsFixture;f.persistenceCalls++;const r=await submit();ack(r);if(f.archiveFail){f.pendingArchive={kind:"submission",warehouseCode:w,entityId:s.aiPreOrderCode};f.archiveReceipt=r;throw Error("回执归档待核对");}return r;}; export const verifyFcReceiptArchive=async()=>{const f=globalThis.dmsFixture;f.archiveChecks=(f.archiveChecks??0)+1;f.pendingArchive=null;return f.archiveReceipt;};',
  './fc-storage-client':
    'export const fcPersistence={pendingReceipts:()=>globalThis.dmsFixture?.pendingArchive?[globalThis.dmsFixture.pendingArchive]:[]};',
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
  '../native/memory-storage':
    'export const memoryStorage={getItem:k=>k.includes("order-draft")?JSON.stringify({quantities:{},reasons:{SKU1:"分仓复核"},dirty:true}):null,setItem:()=>{}};',
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
    persistenceCalls: 0,
    preflightError: '签名密钥未配置',
    call: async (method, payload) => {
      if (method === 'branch-dms-open') {
        globalThis.dmsFixture.navigationCalls = (globalThis.dmsFixture.navigationCalls ?? 0) + 1;
        if (globalThis.dmsFixture.navigationFail) throw Error('跳转失败');
        return { requested: true };
      }
      if (payload.operation === 'preflight') {
        if (globalThis.dmsFixture.preflightError) throw Error(globalThis.dmsFixture.preflightError);
        return { ready: true, scope: 'local-configuration' };
      }
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
    assert.equal(calls.length, 0);
    assert.equal(globalThis.dmsFixture.persistenceCalls, 0);
    assert.match(document.body.textContent, /签名密钥未配置/);
    globalThis.dmsFixture.preflightError = '';
    await click('确认暂存至DMS');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'branch-dms');
    assert.equal(calls[0].payload.warehouseCode, 'W1');
    assert.equal(calls[0].payload.order.customerCode, 'C1');
    assert.equal(calls[0].payload.order.orderModel, 'cg');
    assert.equal(calls[0].payload.order.orderRemarks, 'SKU1: 3；分仓复核');
    assert.equal(Object.hasOwn(calls[0].payload.order, 'remarks'), false);
    assert.deepEqual(calls[0].payload.order.itemList, [{ productCode: 'SKU1', quantity: 3 }]);
    assert.match(document.body.textContent, /DMS结果未知/);
    assert.doesNotMatch(document.body.textContent, /DMS订单号：DMS1/);
    fail = false;
    globalThis.dmsFixture.archiveFail = true;
    await click('确认暂存至DMS');
    assert.equal(calls[1].payload.order.aiPreOrderCode, calls[0].payload.order.aiPreOrderCode);
    assert.match(document.body.textContent, /DMS订单号：DMS1/);
    assert.equal(document.querySelector('[aria-label="SKU1实际补货量"]').disabled, true);
    assert.equal(document.querySelector('[aria-label="SKU1调整原因"]').disabled, true);
    const nextBatch = [...document.querySelectorAll('button')].find(
      (b) => b.textContent === '重新读取，准备下一批',
    );
    assert.equal(nextBatch.disabled, true);
    assert.match(document.body.textContent, /DMS已收单，回执归档待核对/);
    globalThis.dmsFixture.archiveFail = false;
    await click('核对回执归档（W1）');
    assert.equal(calls.length, 2);
    assert.equal(globalThis.dmsFixture.archiveChecks, 1);
    assert.equal(nextBatch.disabled, false);
    const firstBatch = calls[1].payload.order.aiPreOrderCode;
    globalThis.dmsFixture.rows = [{ ...rows[0], stock_date: '2026-10-24' }];
    await click('重新读取，准备下一批');
    assert.doesNotMatch(document.body.textContent, /DMS订单号：DMS1/);
    await click('确认暂存至DMS');
    assert.equal(globalThis.dmsFixture.navigationCalls, 1);
    assert.notEqual(calls[2].payload.order.aiPreOrderCode, firstBatch);
    assert.deepEqual(calls[2].payload.order.itemList, calls[1].payload.order.itemList);
    await click('重新读取，准备下一批');
    await click('确认暂存至DMS');
    assert.equal(calls[3].payload.order.aiPreOrderCode, calls[2].payload.order.aiPreOrderCode);

    const sentBeforeNavigation = calls.length;
    globalThis.dmsFixture.navigationFail = true;
    await click('进入DMS订单管理');
    assert.equal(calls.length, sentBeforeNavigation);
    assert.match(document.body.textContent, /DMS订单号：DMS1/);
    globalThis.dmsFixture.navigationFail = false;
    await click('进入DMS订单管理');
    assert.equal(calls.length, sentBeforeNavigation);

    globalThis.dmsFixture.rows = [...rows, { ...rows[0], warehouse_code: 'W2', sku: 'SKU2' }];
    await click('重新读取，准备下一批');
    const selectWarehouse = async (value) =>
      act(async () => {
        const select = document.querySelector('[aria-label="导出补货分仓"]');
        select.value = value;
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
    const fillCustomer = async () =>
      act(async () => {
        for (const label of ['客户编码', '收货地址编码', '提货点编码']) {
          const field = document.querySelector(`[aria-label="${label}"]`);
          Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(
            field,
            'W1-VALUE',
          );
          field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        }
      });
    await selectWarehouse('W1');
    await fillCustomer();
    await selectWarehouse('W2');
    for (const label of ['客户编码', '收货地址编码', '提货点编码'])
      assert.equal(document.querySelector(`[aria-label="${label}"]`).value, '');
    await fillCustomer();
    let release;
    globalThis.dmsFixture.call = async (_method, payload) => {
      if (payload.operation === 'preflight') return { ready: true, scope: 'local-configuration' };
      return new Promise((resolve) => {
        release = () =>
          resolve({ orderCode: 'LATE', aiPreOrderCode: payload.order.aiPreOrderCode });
      });
    };
    await click('确认暂存至DMS');
    assert.equal(typeof release, 'function');
    assert.equal(document.querySelector('[aria-label="导出补货分仓"]').disabled, true);
    assert.equal(document.querySelector('[aria-label="SKU2实际补货量"]').disabled, true);
    assert.equal(document.querySelector('[aria-label="SKU2调整原因"]').disabled, true);
    await act(async () => {
      window.dispatchEvent(new dom.window.Event('gea-session-changing'));
      release();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.doesNotMatch(document.body.textContent, /DMS订单号：LATE|DMS已返回订单号：LATE/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.dmsFixture;
  }
});
