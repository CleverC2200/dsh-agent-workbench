import { mountCustomerPrototype } from './application.js';
import { loadCustomerInventory } from './data-source.js';
import { ready, publish, reportElements } from '../../business/shared/channel.js';
import { customerLoadLocales, customerLoadFailure } from './load-state.js';

let snapshot;
let inventorySnapshot;
let authorizationScope;
let unregister = () => {};
let attached = true;
let publication = 0;
let publishing = false;
let hasData = false;
let loadGeneration = 0;
let loadController;
const copy = customerLoadLocales[document.documentElement.lang.startsWith('en') ? 'en' : 'zh'];
const emptyInventory = () => ({ snapshot: null, rows: [] });
const presentation = mountCustomerPrototype(report, emptyInventory());
let loadState = 'waiting';
function showLoadState(state) {
  loadState = state;
  const status = document.getElementById('customer-load-status');
  if (status) {
    status.textContent = copy[state] ?? '';
    status.hidden = state === 'ready';
    status.dataset.state = state;
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
  snapshot = {
    ...value,
    source: 'gea-governed-sql',
    dataAuthority: 'current-gea-identity',
    authorizationScope,
    inventorySnapshot,
    pageId: 'inventory-customer',
    capturedAt: new Date().toISOString(),
  };
  if (!attached) return;
  unregister();
  publication++;
  syncStatus('页面上下文同步中…');
  if (!publishing) void publishLatest();
}
ready
  .then(async () => {
    clearTimeout(connectionTimer);
    showLoadState('loading');
    const generation = ++loadGeneration;
    loadController = new AbortController();
    const inventory = await loadCustomerInventory({
      signal: AbortSignal.any([loadController.signal, AbortSignal.timeout(90000)]),
    });
    if (!attached || generation !== loadGeneration) return;
    authorizationScope = await readAuthorizationScope();
    if (!attached || generation !== loadGeneration) return;
    inventorySnapshot = inventory.snapshot;
    hasData = true;
    syncStatus('');
    showLoadState(inventory.rows.length ? 'ready' : 'empty');
    presentation.update(inventory);
  })
  .catch((error) => {
    if (attached && !loadController?.signal.aborted) showLoadState(customerLoadFailure(error));
  });
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
  if (snapshot) report(snapshot);
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
