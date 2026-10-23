import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import React from 'react';
const require = createRequire(import.meta.url);
const { outputFiles } = await build({
  stdin: {
    contents:
      "export {InlineSkuDetails} from './src/workbench/original/workbenches/regionalApproval/InlineSkuDetails.tsx';export {default as RegionalApprovalWorkbench} from './src/workbench/original/workbenches/regionalApproval/RegionalApprovalWorkbench.tsx';export * from './src/workbench/original/storage.ts';export {WorkbenchHostProvider} from './src/workbench/original/bridge.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  loader: { '.module.css': 'text', '.css': 'text' },
});
const module = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(module, module.exports, require);
const {
  InlineSkuDetails,
  WorkbenchHostProvider,
  RegionalApprovalWorkbench,
  writeAssistantSurfaceState,
  getAssistantSurfaceWorkbenchScope,
} = module.exports;

test('restored unsent SKU input stays exact without replaying the original draft writer', async (t) => {
  const dom = new JSDOM('<main id="root"></main>', { pretendToBeVisual: true });
  const saved = [
    'window',
    'document',
    'navigator',
    'Node',
    'HTMLElement',
    'getComputedStyle',
    'IS_REACT_ACT_ENVIRONMENT',
  ].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['navigator', dom.window.navigator],
    ['Node', dom.window.Node],
    ['HTMLElement', dom.window.HTMLElement],
    ['getComputedStyle', dom.window.getComputedStyle],
    ['IS_REACT_ACT_ENVIRONMENT', true],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const writes = [];
  const sku = {
    skuCode: '10001',
    skuName: 'synthetic SKU',
    productCategName: 'Synthetic category',
    versionId: 'v1',
    qty: '10',
    baseQty: '8',
    price: '2',
    amt: '20',
    amtBase: '16',
    areaConfirmedQty: '10',
  };
  const row = { planId: 'p1', versionId: 'v1', status: 4, planTypeCode: 'Y' };
  const detail = {
    currentVersion: { id: 'v1', planId: 'p1', status: 4, effective: true },
    skus: [sku],
  };
  const host = {
    salesPlan: {
      versionSkus: { invoke: async () => [sku] },
      draft: {
        invoke: async (request) => {
          if (request.draft) writes.push(request);
          return { draft: null };
        },
      },
    },
  };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const { act } = React;
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await act(async () =>
    root.render(
      React.createElement(
        WorkbenchHostProvider,
        { value: host },
        React.createElement(InlineSkuDetails, {
          row,
          detail,
          canEdit: true,
          approvalRole: 'area',
          t: (key) => key,
          initialInputValues: { 10001: '1111.125' },
        }),
      ),
    ),
  );
  assert.equal(document.querySelector('input').value, '1111.125');
  await act(async () => new Promise((resolve) => setTimeout(resolve, 550)));
  assert.equal(
    writes.length,
    0,
    'rehydrating the UI cannot automatically replay an unsent draft save',
  );
});

test('loaded inline SKU values expose the displayed quantities and amounts as read-only evidence without adding writable collection members', async (t) => {
  const dom = new JSDOM('<main id="root"></main>', { pretendToBeVisual: true });
  const names = [
    'window',
    'document',
    'navigator',
    'Node',
    'HTMLElement',
    'getComputedStyle',
    'IS_REACT_ACT_ENVIRONMENT',
  ];
  const saved = names.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['navigator', dom.window.navigator],
    ['Node', dom.window.Node],
    ['HTMLElement', dom.window.HTMLElement],
    ['getComputedStyle', dom.window.getComputedStyle],
    ['IS_REACT_ACT_ENVIRONMENT', true],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const sku = {
    skuCode: '10001',
    productCategName: 'fixture category',
    materialDescription: 'fixture SKU',
    versionId: 'v1',
    qty: '10',
    baseQty: '8',
    price: '2',
    amt: '20',
    amtBase: '16',
    areaConfirmedQty: '10',
  };
  const row = { planId: 'p1', versionId: 'v1', status: 4, planTypeCode: 'Y' };
  const detail = {
    currentVersion: { id: 'v1', planId: 'p1', status: 4, effective: true },
    skus: [sku],
  };
  const writes = [];
  let fields = [],
    collection;
  const host = {
    salesPlan: {
      versionSkus: { invoke: async () => [sku] },
      draft: {
        invoke: async (request) => {
          if (request.draft) writes.push(request);
          return { draft: null };
        },
      },
    },
  };
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await act(async () =>
    root.render(
      React.createElement(
        WorkbenchHostProvider,
        { value: host },
        React.createElement(InlineSkuDetails, {
          row,
          detail,
          canEdit: true,
          approvalRole: 'area',
          t: (key) => key,
          onElementsChange: (next, nextCollection) => {
            fields = next;
            collection = nextCollection;
          },
        }),
      ),
    ),
  );
  const field = (suffix) => fields.find((value) => value.id === 'field:p1:10001:' + suffix);
  assert.equal(field('baseQty')?.value, '8');
  assert.equal(field('baseAmount')?.value, '16');
  assert.equal(field('amount')?.value, '20.00');
  assert.equal(field('description')?.value, 'fixture SKU');
  for (const suffix of ['baseQty', 'baseAmount', 'amount', 'description'])
    assert.equal(field(suffix).editable, false);
  assert.deepEqual(collection.members, ['field:p1:10001:qty']);
  assert.equal(writes.length, 0);
});

test('a readonly category view reports only its displayed SKU and updates when that category changes', async (t) => {
  const dom = new JSDOM('<main id="root"></main>', { pretendToBeVisual: true });
  const names = [
    'window',
    'document',
    'navigator',
    'Node',
    'HTMLElement',
    'getComputedStyle',
    'IS_REACT_ACT_ENVIRONMENT',
  ];
  const saved = names.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['navigator', dom.window.navigator],
    ['Node', dom.window.Node],
    ['HTMLElement', dom.window.HTMLElement],
    ['getComputedStyle', dom.window.getComputedStyle],
    ['IS_REACT_ACT_ENVIRONMENT', true],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const sku = (code, category) => ({
    skuCode: code,
    productCategName: category,
    materialDescription: 'fixture ' + code,
    versionId: 'v1',
    qty: '10',
    baseQty: '8',
    price: '2',
    amt: '20',
    amtBase: '16',
  });
  const skus = [sku('10001', 'category-a'), sku('10002', 'category-b')];
  let fields = [];
  const host = { salesPlan: { versionSkus: { invoke: async () => skus } } };
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const render = (categoryName) =>
    act(async () =>
      root.render(
        React.createElement(
          WorkbenchHostProvider,
          { value: host },
          React.createElement(InlineSkuDetails, {
            row: { planId: 'p1', versionId: 'v1', status: 4, planTypeCode: 'Y' },
            canEdit: false,
            categoryName,
            t: (key) => key,
            onElementsChange: (next) => {
              fields = next;
            },
          }),
        ),
      ),
    );
  await render('category-a');
  assert.ok(document.body.textContent.includes('10001'));
  assert.ok(!document.body.textContent.includes('10002'));
  assert.ok(fields.length > 0);
  assert.ok(fields.every((value) => value.id.includes(':10001:')));
  await render('category-b');
  assert.ok(document.body.textContent.includes('10002'));
  assert.ok(!document.body.textContent.includes('10001'));
  assert.ok(fields.every((value) => value.id.includes(':10002:')));
  assert.ok(fields.every((value) => value.editable === false));
});

test('opening an original plan name publishes the same displayed inline SKU fields without selecting or writing the plan', async (t) => {
  const dom = new JSDOM('<main id="root"></main>', {
    url: 'https://host.example/api/agent-workbench/native',
    pretendToBeVisual: true,
  });
  const names = [
    'window',
    'document',
    'navigator',
    'Node',
    'Element',
    'SVGElement',
    'HTMLElement',
    'getComputedStyle',
    'ResizeObserver',
    'IS_REACT_ACT_ENVIRONMENT',
  ];
  const saved = names.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  dom.window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  });
  const observer = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  dom.window.ResizeObserver = observer;
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['navigator', dom.window.navigator],
    ['Node', dom.window.Node],
    ['Element', dom.window.Element],
    ['SVGElement', dom.window.SVGElement],
    ['HTMLElement', dom.window.HTMLElement],
    ['getComputedStyle', dom.window.getComputedStyle],
    ['ResizeObserver', observer],
    ['IS_REACT_ACT_ENVIRONMENT', true],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  writeAssistantSurfaceState(
    'forecast',
    getAssistantSurfaceWorkbenchScope('fixture-account') + ':regional-approval-state',
    { dimension: 'region', currentStage: 'area' },
  );
  const sku = {
    skuCode: '10001',
    productCategName: 'fixture category',
    materialDescription: 'fixture SKU',
    versionId: 'v1',
    qty: '10',
    baseQty: '8',
    price: '2',
    amt: '20',
    amtBase: '16',
    areaConfirmedQty: '10',
  };
  const plan = {
    planId: 'p1',
    versionId: 'v1',
    orgName: 'fixture-region',
    orgCode: 'ORG',
    dealerName: 'fixture-dealer',
    dealerCode: 'D1',
    periodId: 'period-1',
    periodMonth: '2026-10',
    status: 4,
    planTypeCode: 'Y',
    currentQty: '10',
    currentAmount: '20',
    targetQty: '12',
    targetAmount: '24',
    skuCount: 1,
  };
  const secondSku = {
    ...sku,
    skuCode: '10002',
    productCategName: 'second-category',
    price: '3',
    amt: '30',
    amtBase: '24',
  };
  const detail = {
    currentVersion: { id: 'v1', planId: 'p1', status: 4, effective: true },
    actionContext: { allowedActions: ['SAVE'] },
    skus: [sku, secondSku],
  };
  const page = (records) => ({ records, total: records.length, size: 20, current: 1, pages: 1 });
  const writes = [];
  const contexts = [];
  let catalogue = [];
  let toolCall;
  const results = [];
  const host = {
    salesPlan: {
      periods: {
        invoke: async () =>
          page([
            {
              periodId: 'period-1',
              tenantId: 'fixture-tenant',
              periodMonth: '2026-10',
              planType: 'Y',
              planTypeCode: 'Y',
            },
          ]),
      },
      list: { invoke: async () => page([plan]) },
      versions: { invoke: async () => [] },
      detail: { invoke: async () => detail },
      versionSkus: { invoke: async () => [sku, secondSku] },
      draft: {
        invoke: async (request) => {
          if (request.draft) writes.push(request);
          return { draft: null };
        },
      },
      action: {
        invoke: async (value) => {
          writes.push(value);
          throw Error('actions forbidden');
        },
      },
      submit: {
        invoke: async (value) => {
          writes.push(value);
          throw Error('submit forbidden');
        },
      },
    },
  };
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const translate = (key, values) => values?.name ?? values?.organization ?? key;
  const render = () =>
    act(async () =>
      root.render(
        React.createElement(
          WorkbenchHostProvider,
          { value: host },
          React.createElement(RegionalApprovalWorkbench, {
            stateScope: 'fixture-account',
            approvalStages: ['area'],
            t: translate,
            onContextChange: (value) => contexts.push(value),
            onCatalogChange: (value) => {
              catalogue = value;
            },
            liveActionsEnabled: true,
            toolCall,
            onToolResult: (...value) => results.push(value),
          }),
        ),
      ),
    );
  await render();
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  const button = [...document.querySelectorAll('button')].find(
    (value) => value.textContent === 'fixture-region',
  );
  assert.ok(button, 'the original live plan name must be visible');
  await act(async () => button.click());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  assert.ok(
    document.body.textContent.includes('10001'),
    'the actual inline SKU row must be displayed',
  );
  const context = contexts.at(-1);
  assert.deepEqual(context.expandedPlanIds, ['p1']);
  assert.ok(context.expandedFields.some((value) => value.id === 'field:p1:10001:amount'));
  assert.equal(context.selectedEntities.length, 0);
  const collection = catalogue.find((value) => value.id === 'collection:p1:qty');
  assert.deepEqual(collection.members, ['field:p1:10001:qty', 'field:p1:10002:qty']);
  assert.ok(catalogue.some((value) => value.id === 'field:p1:10001:amount'));
  assert.equal(writes.length, 0);
  toolCall = {
    toolCallId: 'fixture-bulk',
    command: { kind: 'setValue', target: 'collection:p1:qty', value: '3' },
  };
  await render();
  for (let i = 0; i < 20 && !results.length; i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
  assert.deepEqual(
    results[0],
    ['fixture-bulk', true, undefined],
    'only quantity fields determine the actual batch acknowledgement',
  );
  assert.equal(document.querySelector('input[aria-label$="10001"]')?.value, '3');
  assert.equal(document.querySelector('input[aria-label$="10002"]')?.value, '3');
  results.length = 0;
  toolCall = {
    toolCallId: 'fixture-readonly',
    command: { kind: 'setValue', target: 'field:p1:10001:amount', value: '99' },
  };
  await render();
  assert.deepEqual(results[0], ['fixture-readonly', false, 'READ_ONLY_FIELD']);
  assert.equal(document.querySelector('input[aria-label$="10001"]')?.value, '3');
});

test('RegionalApproval restores scoped filters and displays unknown customer identity without granting or replaying actions', async (t) => {
  const dom = new JSDOM('<main id="root"></main>', {
    url: 'https://host.example/api/agent-workbench/native',
    pretendToBeVisual: true,
  });
  const names = [
    'window',
    'document',
    'navigator',
    'Node',
    'Element',
    'SVGElement',
    'HTMLElement',
    'getComputedStyle',
    'ResizeObserver',
    'IS_REACT_ACT_ENVIRONMENT',
  ];
  const saved = names.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  dom.window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  });
  const observer = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  dom.window.ResizeObserver = observer;
  for (const [key, value] of [
    ['window', dom.window],
    ['document', dom.window.document],
    ['navigator', dom.window.navigator],
    ['Node', dom.window.Node],
    ['Element', dom.window.Element],
    ['SVGElement', dom.window.SVGElement],
    ['HTMLElement', dom.window.HTMLElement],
    ['getComputedStyle', dom.window.getComputedStyle],
    ['ResizeObserver', observer],
    ['IS_REACT_ACT_ENVIRONMENT', true],
  ])
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const scope = getAssistantSurfaceWorkbenchScope('own-tenant-account');
  const filters = {
    areaCode: 'A-1',
    provinceCode: 'all',
    orgCode: 'all',
    dealerCode: 'all',
    status: '3',
  };
  writeAssistantSurfaceState('forecast', scope + ':regional-approval-state', {
    draftLiveFilters: filters,
    appliedLiveFilters: filters,
    currentStage: 'area',
    dimension: 'customer',
  });
  const reads = [],
    writes = [],
    contexts = [];
  const plan = {
    planId: 'p-null-customer',
    versionId: 'v-null-customer',
    periodId: 'period-1',
    seq: 1,
    planTypeCode: 'Y',
    dealerCode: null,
    dealerName: null,
    areaCode: 'A-1',
    orgCode: null,
    provinceCode: null,
    baseName: null,
    status: 3,
    skuCount: 1,
    targetQty: '12',
    targetAmount: '24',
    currentQty: '10',
    currentAmount: '20',
  };
  const page = (records) => ({ records, total: records.length, size: 20, current: 1, pages: 1 });
  const host = {
    salesPlan: {
      periods: {
        invoke: async () =>
          page([
            {
              periodId: 'period-1',
              tenantId: 'tenant-1',
              periodMonth: '2026-10',
              planType: 'Y',
              planTypeCode: 'Y',
            },
          ]),
      },
      list: {
        invoke: async (query) => {
          reads.push(query);
          return page([plan]);
        },
      },
      versions: { invoke: async () => [] },
      detail: {
        invoke: async () => {
          throw Error('no actual rows');
        },
      },
      action: {
        invoke: async (value) => {
          writes.push(value);
          throw Error('actions forbidden');
        },
      },
      submit: {
        invoke: async (value) => {
          writes.push(value);
          throw Error('submit forbidden');
        },
      },
    },
  };
  const { createRoot } = await import('react-dom/client');
  const { act } = React;
  const root = createRoot(document.getElementById('root'));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const render = () =>
    act(async () =>
      root.render(
        React.createElement(
          WorkbenchHostProvider,
          { value: host },
          React.createElement(RegionalApprovalWorkbench, {
            stateScope: 'own-tenant-account',
            approvalStages: ['area'],
            t: (key) => key,
            onContextChange: (value) => contexts.push(value),
            liveActionsEnabled: false,
          }),
        ),
      ),
    );
  await render();
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  assert.ok(
    reads.some((query) => query.areaCode === 'A-1' && query.status === 3),
    'restored UI filters reach the original public query DTO, not an invented result cache',
  );
  await act(async () => root.render(null));
  reads.length = 0;
  await render();
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  assert.ok(reads.some((query) => query.areaCode === 'A-1' && query.status === 3));
  assert.ok(
    document.body.textContent.includes(
      'common.assistantSurface.regionalApproval.query.unnamedOrganization',
    ),
    document.body.textContent,
  );
  const entity = contexts.at(-1).visibleEntities.find((value) => value.id === plan.planId);
  assert.equal(entity.dealerCode, null);
  assert.equal(entity.organizationKey, plan.planId);
  assert.equal(writes.length, 0);
});
