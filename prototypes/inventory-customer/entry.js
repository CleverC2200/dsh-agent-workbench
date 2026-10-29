import { mountCustomerPrototype } from './application.js';
import { loadCustomerInventory } from './data-source.js';
import { ready, publish, reportElements } from '../../business/shared/channel.js';
import { customerLoadLocales, customerLoadFailure } from './load-state.js';
import { keepPageObservation } from '../../business/shared/page-observation.js';
import { customerPageContext } from './page-context.js';
import { showCustomerObservation, customerObservationChange } from './observation.js';
import { customerRegionalValues } from './regional-values.js';

let snapshot;
let inventorySnapshot;
let sourceDates;
let dataCapturedAt;
let observationRows = [];
let priorObservation;
let observationChange = '';
let authorizationScope;
let unregister = () => {};
let attached = true;
let publication = 0;
let publishing = false;
let hasData = false;
let loadGeneration = 0;
let loadController;
const copy = customerLoadLocales[document.documentElement.lang.startsWith('en') ? 'en' : 'zh'];
const emptyInventory = () => ({ snapshot: null, rows: [], missingReason:'系统尚未完成读取：页面连接或数据加载未完成，不能判断为源表缺数据。' });
const presentation = mountCustomerPrototype(report, emptyInventory());
let loadState = 'waiting';
function showLoadState(state, error) {
  loadState = state;
  document.getElementById('root')?.setAttribute('aria-busy', String(state === 'waiting' || state === 'loading'));
  const status = document.getElementById('customer-load-status');
  if (status) {
    status.textContent = copy[state] ?? '';
    status.hidden = state === 'ready';
    status.dataset.state = state;
    const reason=error?String(error?.cause?.message??error?.message??error?.code??'QUERY_FAILED').replace(/(token|authorization|password|secret)\s*[:=]\s*\S+/gi,'$1=[redacted]').slice(0,400):'';
    status.title=reason?`系统读取未成功：${reason}；不是源数据为0。`:'';
    if(error)presentation.update({...emptyInventory(),missingReason:status.title});
  }
}
showLoadState('waiting');
const connectionTimer = setTimeout(() => {
  if (loadState === 'waiting') showLoadState('timeout');
}, 15000);
function syncStatus(message) {
  const status = document.getElementById('prototype-sync-status');
  if (status) status.textContent = message;
}
async function readAuthorizationScope() {
  try {
    const response = await fetch('/api/gea-html/identity', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const identity = await response.json();
    const scope = identity?.customerInventory;
    return scope?.customerInventoryScope?.status === 'granted'
      ? {
          roles: Array.isArray(scope.roles) ? scope.roles : [],
          customerInventoryScope: scope.customerInventoryScope,
        }
      : null;
  } catch {
    // The governed query remains the authority. A presentation-only receipt
    // read must not downgrade or broaden its result when the projection times out.
    return null;
  }
}
async function publishLatest() {
  publishing = true;
  try {
    let current;
    do {
      if (!attached || !hasData || !snapshot) return;
      current = publication;
      const value = snapshot;
      try {
        // One in-flight context prevents older transport requests from overwriting newer facts.
        await publish(value);
        if (!attached || !hasData) return;
        if (current !== publication) continue;
        unregister = reportElements(
          'customer-prototype',
          [
            {
              id: 'prototype:notice',
              role: 'field',
              label: '客户库存',
              value: `GEA受控只读 · 快照 ${inventorySnapshot ?? '未知'}`,
            },
            ...value.rows.map((row) => ({
              id: `customer:${row.code}`,
              role: 'row',
              label: row.name,
              value: `库存 ${row.quantity ?? '未知'} 箱 · ${row.region}`,
            })),
          ],
          undefined,
        );
        syncStatus('');
      } catch (error) {
        if (!attached) return;
        if (current === publication)
          syncStatus(
            `页面上下文同步失败：${error.message.slice(0, 300)}。请重新进入，或调整筛选后重试。`,
          );
      }
    } while (current !== publication);
  } finally {
    publishing = false;
  }
}
function report(value) {
  if (!hasData || !attached) return;
  if (value.capturedAt && value.capturedAt !== dataCapturedAt) return;
  const observation = { at: dataCapturedAt, scope: JSON.stringify([inventorySnapshot, value.summary?.customerCodes]), quantity: value.summary?.largeDateQty };
  if (priorObservation?.at !== observation.at || priorObservation?.scope !== observation.scope)
    observationChange = customerObservationChange(priorObservation, observation);
  priorObservation = observation;
  showCustomerObservation(value, dataCapturedAt, document, observationChange);
  snapshot = {
    ...customerPageContext(value),
    regionalInventoryValues: customerRegionalValues(observationRows, value.summary?.customerCodes).region,
    filteredRegionalInventoryValues: customerRegionalValues(observationRows, value.filteredCustomerCodes).region,
    source: 'gea-governed-sql',
    dataAuthority: 'current-gea-identity',
    authorizationScope,
    inventorySnapshot: sourceDates?.inventory,
    planSnapshot: inventorySnapshot,
    sourceDates,
    primaryTable: 'agents_scm_cust_plan_order_analysis_d',
    pageId: 'inventory-customer',
    capturedAt: dataCapturedAt,
    observationSemantics: 'capturedAt为本次页面数据取回时间，筛选、翻页和上下文上报不刷新；不是数据库不可变快照或Cube查询版本。',
  };
  if (!attached) return;
  unregister();
  publication++;
  syncStatus('');
  if (!publishing) void publishLatest();
}
async function reloadCustomerInventory() {
  const generation = ++loadGeneration;
  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;
  try {
    attached = true;
    clearTimeout(connectionTimer);
    showLoadState('loading');
    void readAuthorizationScope().then((scope) => {
      if (!attached || generation !== loadGeneration) return;
      authorizationScope = scope;
      if (snapshot) report(snapshot);
    });
    const inventory = await loadCustomerInventory({
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]),
      pageSignal: controller.signal,
      onInventory(inventory) {
        if (!attached || generation !== loadGeneration) return;
        inventorySnapshot = inventory.snapshot;
        dataCapturedAt = new Date().toISOString();
        observationRows = inventory.rows;
        sourceDates = { plan: inventory.snapshot, inventory: inventory.inventorySnapshot, organization: inventory.organizationSnapshot };
        hasData = true;
        presentation.update(inventory);
        showLoadState(inventory.rows.length ? 'enriching' : 'empty');
      },
    });
    if (!attached || generation !== loadGeneration) return;
    inventorySnapshot = inventory.snapshot;
    dataCapturedAt = new Date().toISOString();
    observationRows = inventory.rows;
    sourceDates = { plan: inventory.snapshot, inventory: inventory.inventorySnapshot, organization: inventory.organizationSnapshot };
    hasData = true;
    syncStatus('');
    showLoadState(inventory.rows.length ? 'ready' : 'empty');
    presentation.update(inventory);
  } catch (error) {
    if (attached && generation === loadGeneration && !controller.signal.aborted)
      showLoadState(customerLoadFailure(error),error);
  }
}
void ready.then(reloadCustomerInventory);
keepPageObservation(() => attached && hasData && snapshot, () => report(snapshot));
window.addEventListener('customer-render-failed', () => {
  hasData = false;
  loadGeneration++;
  loadController?.abort();
  clearTimeout(connectionTimer);
  snapshot = undefined;
  publication++;
  unregister();
  syncStatus('');
  showLoadState('render');
});
window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.data?.protocol !== 'customer-inventory-status')
    return;
  if (event.data.failed) {
    invalidateInventory();
    showLoadState(
      customerLoadFailure(event.data.error) === 'query'
        ? 'connection'
        : customerLoadFailure(event.data.error),
    );
  }
});
window.addEventListener('gea-session-changed', () => {
  attached = true;
  void reloadCustomerInventory();
});
function invalidateInventory() {
  attached = false;
  hasData = false;
  loadGeneration++;
  loadController?.abort();
  clearTimeout(connectionTimer);
  publication++;
  unregister();
  snapshot = undefined;
  authorizationScope = undefined;
  inventorySnapshot = undefined;
  sourceDates = undefined;
  presentation.update(emptyInventory());
  syncStatus('');
  showLoadState('changed');
}
window.addEventListener('gea-identity-changed', invalidateInventory);
window.addEventListener('gea-session-changing', invalidateInventory);
window.addEventListener(
  'pagehide',
  () => {
    attached = false;
    hasData = false;
    loadGeneration++;
    clearTimeout(connectionTimer);
    loadController?.abort();
    publication++;
    unregister();
  },
  { once: true },
);
