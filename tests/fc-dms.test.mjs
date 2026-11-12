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
  './fc/components/planning-settings': 'export const PlanningTable=()=>null;',
  './fc-planned-page':
    'export const projectFcPlannedRows=rows=>rows;export const sortFcReplenishmentRows=rows=>rows;',
  './fc-batch-details': 'export const FcBatchDetails=()=>null;',
  './fc-transfer-details': 'export const FcTransferDetails=()=>null;',
  './fc/components/warehouse-select': 'export const WarehouseSelect=()=>null;',
  './fc-submission-persistence':
    'export const persistAndSubmitFc=async(w,s,signal,submit,ack)=>{const f=globalThis.dmsFixture;f.lastSnapshot=s;f.persistenceCalls++;const r=await submit();ack(r);if(f.archiveFail){f.pendingArchive={kind:"submission",warehouseCode:w,entityId:s.aiPreOrderCode};f.archiveReceipt=r;throw Error("回执归档待核对");}return r;}; export const verifyFcReceiptArchive=async()=>{const f=globalThis.dmsFixture;f.archiveChecks=(f.archiveChecks??0)+1;f.pendingArchive=null;return f.archiveReceipt;};',
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
    'export const memoryStorage={getItem:k=>k.includes("order-draft")?JSON.stringify({quantities:globalThis.dmsFixture?.quantities??{},reasons:{SKU1:"分仓复核"},dirty:true}):null,setItem:()=>{}};',
  '../../../fc/src/lib/planning':
    'export const IMPORT_FIELDS=[]; export const defaultPlanTemplateMonth=()=>"2026-11"; export const currentPlanningMonth=()=>"2026-10"; export const nextMonth=()=>"2026-11";',
  './fc-workflow':
    'export const summarizeFcRows=()=>({}); export const validateFcSubmission=()=>{}; export const applyFcPlan=x=>x; export const planKey=x=>x.sku; export const rowKey=x=>x.sku; export const quantity=x=>Number(x??0); export const readFcActionRows=async(...args)=>{const f=globalThis.dmsFixture;(f.readScopes??=[]).push(args[0]);return f.read?f.read(...args):f.rows.filter(r=>!r.warehouse_code||r.warehouse_code===args[0].input.filters?.warehouse_code);}; export const validateFcImport=()=>[];',
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
const {
  FcConfiguredList,
  FcWorkflowProvider: WorkflowProvider,
  FcConfirmationDirectory,
} = await import(pathToFileURL(resolve('.scratch/fc-dms.mjs')));
const FcWorkflowProvider = ({ children }) =>
  React.createElement(
    WorkflowProvider,
    null,
    React.createElement(
      FcConfirmationDirectory.Provider,
      {
        value: {
          rows: ['W1', 'W2'].map((warehouse_code) => ({
            warehouse_code,
            warehouse_name: warehouse_code,
          })),
          loading: false,
          error: '',
          retry: () => {},
        },
      },
      children,
    ),
  );
test('confirmation hides missing and zero amounts, while retaining positive manual quantities', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.dmsFixture = {
    rows: [
      { warehouse_code: 'W1', sku: 'SKU1', recommended_qty: null },
      { warehouse_code: 'W1', sku: 'EMPTY', recommended_qty: null },
      { warehouse_code: 'W1', sku: 'ZERO', recommended_qty: 0 },
      { warehouse_code: 'W1', sku: 'SKIP', recommended_qty: 10 },
    ],
    quantities: { SKU1: 7, SKIP: 0 },
    call: async () => ({ warehouseCode: 'W1', fields: {}, message: '请核对编码' }),
  };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () =>
      root.render(
        React.createElement(
          FcWorkflowProvider,
          null,
          React.createElement(FcConfiguredList, {
            columns: [],
            view: { title: '补货' },
            actionScope: {
              viewId: 'replenishment',
              input: { asOf: '2026-10-30', filters: { warehouse_code: 'W1' } },
            },
          }),
        ),
      ),
    );
    await act(async () => {
      [...document.querySelectorAll('button')].find((b) => b.textContent === '提交').click();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(
      globalThis.dmsFixture.readScopes[0].input.replenishment?.neededOnly,
      true,
      'confirmation must exclude zero advice before pagination',
    );
    assert.equal(globalThis.dmsFixture.readScopes[0].input.replenishment?.businessOnly, false);
    assert.equal(globalThis.dmsFixture.readScopes[0].viewId, 'replenishment-confirmation');
    const input = document.querySelector('[aria-label="SKU1实际补货量"]');
    assert.ok(input);
    assert.equal(input.disabled, false, 'unknown advice must not disable manual quantity');
    assert.equal(input.readOnly, false);
    assert.equal(input.value, '7');
    for (const sku of ['EMPTY', 'ZERO', 'SKIP'])
      assert.equal(document.querySelector(`[aria-label="${sku}实际补货量"]`), null);
    assert.match(document.body.textContent, /1个SKU/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.dmsFixture;
  }
});
test('branch confirmation sends documented order, retains draft on failure, and displays receipt only after acknowledgement', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const calls = [];
  let fail = true;
  globalThis.dmsFixture = {
    rows: [
      ...rows,
      { warehouse_code: 'W1', sku: null, recommended_qty: null },
      { warehouse_code: 'W1', sku: 'NO_AMOUNT', recommended_qty: null },
      { warehouse_code: 'W1', sku: 'ZERO_AMOUNT', recommended_qty: 0 },
    ],
    persistenceCalls: 0,
    preflightError: '签名密钥未配置',
    call: async (method, payload) => {
      if (payload.operation === 'resolve-target')
        return {
          warehouseCode: payload.warehouseCode,
          fields:
            payload.warehouseCode === 'W2'
              ? { customerCode: 'C2', addressCode: 'A2', pupCode: 'P2' }
              : { customerCode: 'C1', addressCode: 'A1', pupCode: 'P1' },
          addresses: [{ code: payload.warehouseCode === 'W2' ? 'A2' : 'A1', name: '分仓收货地址' }],
          message: '已自动带入',
        };
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
    assert.match(document.body.textContent, /请先选择本次补货的分仓/);
    assert.equal(globalThis.dmsFixture.readScopes, undefined);
    await act(async () => {
      const select = document.querySelector('[aria-label="导出补货分仓"]');
      select.value = 'W1';
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    assert.equal(globalThis.dmsFixture.readScopes[0].input.filters.warehouse_code, 'W1');
    await click('确认暂存至DMS');
    assert.equal(calls.length, 0);
    for (const [label, value] of [
      ['客户编码', 'C1'],
      ['收货地址编码', 'A1'],
      ['提货点编码', 'P1'],
    ]) {
      const input = document.querySelector(`[aria-label="${label}"]`);
      assert.equal(input.value, value);
      assert.equal(input.readOnly, true);
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
    assert.deepEqual(
      globalThis.dmsFixture.lastSnapshot.rows.map((row) => row.sku),
      ['SKU1'],
    );
    assert.equal(document.querySelector('[aria-label="NO_AMOUNT实际补货量"]'), null);
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
    assert.notEqual(calls[3].payload.order.aiPreOrderCode, calls[2].payload.order.aiPreOrderCode);

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
    await selectWarehouse('W1');
    assert.equal(document.querySelector('[aria-label="客户编码"]').value, 'C1');
    await selectWarehouse('W2');
    for (const [label, value] of [
      ['客户编码', 'C2'],
      ['收货地址编码', 'A2'],
      ['提货点编码', 'P2'],
    ]) {
      const input = document.querySelector(`[aria-label="${label}"]`);
      assert.equal(input.value, value);
      assert.equal(input.readOnly, true);
    }
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

test('confirmation opens before a slow read; cancellation, errors and retry never expose partial orders', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const jobs = [];
  globalThis.dmsFixture = {
    rows,
    call: () => {
      throw Error('must not submit while reading');
    },
    read: (scope, signal, progress) =>
      new Promise((resolve, reject) => jobs.push({ scope, signal, progress, resolve, reject })),
  };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const button = (name) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === name);
  const click = (name) =>
    act(async () => {
      assert.ok(button(name), name);
      button(name).click();
    });
  try {
    await act(async () =>
      root.render(
        React.createElement(
          FcWorkflowProvider,
          null,
          React.createElement(FcConfiguredList, {
            columns: [],
            view: { title: '补货' },
            actionScope: {
              viewId: 'replenishment',
              input: { asOf: '2026-10-29', filters: { warehouse_code: 'W1', sku: 'SKU' } },
            },
          }),
        ),
      ),
    );
    await click('提交');
    assert.match(document.body.textContent, /正在读取补货清单，请稍候/);
    assert.ok(button('取消'));
    assert.equal(button('确认暂存至DMS'), undefined);
    assert.deepEqual(jobs[0].scope.input.filters, { warehouse_code: 'W1', sku: 'SKU' });
    await act(async () => jobs[0].progress(100, 301));
    assert.match(document.body.textContent, /100 \/ 301/);
    await click('取消');
    assert.equal(jobs[0].signal.aborted, true);
    await click('提交');
    await act(async () => jobs[0].resolve(rows));
    assert.equal(button('确认暂存至DMS'), undefined);
    await act(async () => jobs[1].reject(Error('读取失败，请重试')));
    assert.match(document.body.textContent, /读取失败，请重试/);
    assert.equal(button('确认暂存至DMS'), undefined);
    await click('重新读取');
    const incomplete = [
      { warehouse_code: 'A230', sku: null, recommended_qty: null },
      { warehouse_code: ' ', sku: 'SKU2', recommended_qty: 5 },
    ];
    await act(async () => jobs[2].resolve([...rows, ...incomplete]));
    assert.equal(
      button('确认暂存至DMS').disabled,
      true,
      'missing automatic routing blocks only DMS submission',
    );
    assert.equal(document.querySelector('[aria-label="SKU1实际补货量"]').disabled, false);
    assert.match(document.body.textContent, /1个SKU/);
    assert.match(document.querySelector('[role="alert"]').textContent, /2条记录缺少分仓或商品编码/);
    const choices = [...document.querySelector('[aria-label="导出补货分仓"]').options];
    assert.deepEqual(
      choices.map((option) => option.value),
      ['', 'W1'],
    );
    await click('取消');
    await click('提交');
    assert.doesNotMatch(document.body.textContent, /2条记录缺少分仓或商品编码/);
    await act(async () => jobs[3].resolve(incomplete));
    assert.equal(button('确认暂存至DMS').disabled, true);
    assert.match(document.body.textContent, /0个SKU/);
    assert.match(document.body.textContent, /2条记录缺少分仓或商品编码/);
    await click('取消');
    await click('提交');
    await act(async () => jobs[4].resolve([{ ...rows[0], warehouse_code: 'W2' }]));
    assert.match(document.body.textContent, /返回数据不属于所选分仓/);
    assert.equal(button('确认暂存至DMS'), undefined);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.dmsFixture;
  }
});

test('named address choices fill readonly codes and stale identity results cannot overwrite them', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let late;
  let masterRequests = 0;
  globalThis.dmsFixture = {
    rows: [...rows, { ...rows[0], warehouse_code: 'W2' }],
    call: async (_method, p) => {
      masterRequests++;
      assert.equal(p.operation, 'resolve-target');
      if (p.warehouseCode === 'W2')
        return new Promise((r) => {
          late = r;
        });
      return {
        warehouseCode: 'W1',
        fields: { customerCode: 'C1', addressCode: p.addressCode || '', pupCode: '02' },
        addresses: [
          { code: 'A1', name: '收货地点一' },
          { code: 'A2', name: '收货地点二' },
        ],
        message: p.addressCode ? '已自动带入' : '请选择收货地址',
      };
    },
  };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const tick = () => new Promise((r) => setTimeout(r, 20));
  try {
    await act(async () =>
      root.render(
        React.createElement(
          FcWorkflowProvider,
          null,
          React.createElement(FcConfiguredList, {
            columns: [],
            view: { title: '补货' },
            actionScope: { viewId: 'replenishment', input: { asOf: '2026-10-29' } },
          }),
        ),
      ),
    );
    await act(async () => {
      [...document.querySelectorAll('button')].find((b) => b.textContent === '提交').click();
      await tick();
    });
    const warehouse = document.querySelector('[aria-label="导出补货分仓"]');
    await act(async () => {
      warehouse.value = 'W1';
      warehouse.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      await tick();
    });
    for (const label of ['客户编码', '收货地址编码', '提货点编码'])
      assert.equal(document.querySelector(`[aria-label="${label}"]`).readOnly, true);
    const address = document.querySelector('[aria-label="收货地址"]');
    assert.equal(address.value, '');
    assert.equal(address.options[2].text, '收货地点二');
    assert.equal(
      [...document.querySelectorAll('button')].find((b) => b.textContent === '确认暂存至DMS')
        .disabled,
      true,
    );
    await act(async () => {
      address.value = 'A2';
      address.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      await tick();
    });
    assert.equal(document.querySelector('[aria-label="收货地址编码"]').value, 'A2');
    assert.equal(document.querySelector('[aria-label="客户编码"]').value, 'C1');
    assert.equal(document.querySelector('[aria-label="提货点编码"]').value, '02');
    const loaded = masterRequests;
    const changeQuantity = async (value) =>
      act(async () => {
        const input = document.querySelector('[aria-label="SKU1实际补货量"]');
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(
          input,
          value,
        );
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        await tick();
      });
    await changeQuantity('0');
    assert.equal(document.querySelector('[aria-label="客户编码"]'), null);
    await changeQuantity('3');
    assert.equal(masterRequests, loaded);
    assert.equal(document.querySelector('[aria-label="收货地址编码"]').value, 'A2');
    await act(async () => {
      warehouse.value = 'W2';
      warehouse.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      await tick();
    });
    assert.equal(document.querySelector('[aria-label="客户编码"]').value, '');
    await act(async () => {
      window.dispatchEvent(new dom.window.Event('gea-session-changing'));
      late({
        warehouseCode: 'W2',
        fields: { customerCode: 'LATE', addressCode: 'A3', pupCode: '03' },
        addresses: [],
        message: '迟到',
      });
      await tick();
    });
    assert.doesNotMatch(document.body.textContent, /LATE|迟到/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.dmsFixture;
  }
});

test('zero replenishment does not read DMS master data or show an order form', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let calls = 0;
  globalThis.dmsFixture = {
    rows: [{ warehouse_code: 'W1', sku: 'ZERO', recommended_qty: 0 }],
    call: async () => {
      calls++;
      throw Error('must not request DMS for an empty order');
    },
  };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () =>
      root.render(
        React.createElement(
          FcWorkflowProvider,
          null,
          React.createElement(FcConfiguredList, {
            columns: [],
            view: { title: '补货' },
            actionScope: {
              viewId: 'replenishment',
              input: { asOf: '2026-11-03', filters: { warehouse_code: 'W1' } },
            },
          }),
        ),
      ),
    );
    await act(async () => {
      [...document.querySelectorAll('button')].find((b) => b.textContent === '提交').click();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(calls, 0);
    assert.equal(document.querySelector('[aria-label="客户编码"]'), null);
    assert.match(document.body.textContent, /当前分仓无需补货/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.dmsFixture;
  }
});

test('direct DMS preflight submits without GEA persistence and keeps feedback beside the action', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const sent = [];
  let succeed = false;
  let finishPreflight;
  let preflightCalls = 0;
  globalThis.dmsFixture = {
    rows,
    persistenceCalls: 0,
    call: async (method, payload) => {
      if (payload.operation === 'resolve-target')
        return {
          warehouseCode: 'W1',
          fields: { customerCode: 'C1', addressCode: 'A1', pupCode: '01' },
          addresses: [{ code: 'A1', name: '分仓收货地' }],
          message: '已自动带入',
        };
      if (payload.operation === 'preflight') {
        preflightCalls++;
        await new Promise((resolve) => {
          finishPreflight = resolve;
        });
        return { ready: true, scope: 'dms-direct' };
      }
      if (payload.operation === 'submit') {
        sent.push(payload);
        if (!succeed) throw Error('DMS连接失败，未取得可确认回执');
        return { orderCode: 'DMS-DIRECT', aiPreOrderCode: payload.order.aiPreOrderCode };
      }
      if (method === 'branch-storage') throw Error('must not write GEA');
      return {};
    },
  };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const button = (label) =>
    [...document.querySelectorAll('button')].find((x) => x.textContent === label);
  try {
    await act(async () =>
      root.render(
        React.createElement(
          FcWorkflowProvider,
          null,
          React.createElement(FcConfiguredList, {
            columns: [],
            view: { title: '补货' },
            actionScope: {
              viewId: 'replenishment',
              input: { asOf: '2026-11-05', filters: { warehouse_code: 'W1' } },
            },
          }),
        ),
      ),
    );
    await act(async () => {
      button('提交').click();
      await new Promise((r) => setTimeout(r, 20));
    });
    await act(async () => {
      const submit = button('确认暂存至DMS');
      submit.click();
      submit.click();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.ok(finishPreflight);
    assert.equal(preflightCalls, 1, 'double click must not start or abort a second submission');
    assert.equal(button('处理中…').disabled, true);
    assert.match(document.querySelector('.fc-workflow-footer').textContent, /正在核对/);
    await act(async () => {
      finishPreflight();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(sent.length, 1, 'a valid direct-DMS preflight must reach DMS without a GEA save');
    assert.equal(globalThis.dmsFixture.persistenceCalls, 0);
    const alert = [...document.querySelectorAll('[role="alert"]')].find((x) =>
      x.textContent.includes('DMS连接失败'),
    );
    assert.ok(
      alert?.closest('.fc-workflow-footer'),
      'submission failure stays in the sticky action footer',
    );
    assert.equal(button('确认暂存至DMS').disabled, false);
    succeed = true;
    await act(async () => {
      button('确认暂存至DMS').click();
      await new Promise((r) => setTimeout(r, 20));
    });
    await act(async () => {
      finishPreflight();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(sent.length, 2);
    assert.equal(
      sent[1].order.aiPreOrderCode,
      sent[0].order.aiPreOrderCode,
      'retry preserves the original attempt',
    );
    assert.equal(globalThis.dmsFixture.persistenceCalls, 0);
    assert.match(document.body.textContent, /DMS订单号：DMS-DIRECT/);
    await act(async () => {
      button('重新读取，准备下一批').click();
      await new Promise((r) => setTimeout(r, 20));
    });
    await act(async () => {
      button('确认暂存至DMS').click();
      await new Promise((r) => setTimeout(r, 20));
    });
    await act(async () => {
      finishPreflight();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.equal(sent.length, 3);
    assert.notEqual(
      sent[2].order.aiPreOrderCode,
      sent[1].order.aiPreOrderCode,
      'same data in a new confirmation round must be a new order',
    );
    assert.deepEqual(sent[2].order.itemList, sent[1].order.itemList);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.dmsFixture;
  }
});
