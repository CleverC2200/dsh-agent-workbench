import { mountCustomerPrototype } from './application.js';
import { loadCustomerInventory } from './data-source.js';
import { ready, publish, reportElements } from '../../business/shared/channel.js';

let snapshot;
let inventorySnapshot;
let authorizationScope;
let unregister = () => {};
let attached = true;
let publication = 0;
let publishing = false;
function syncStatus(message) {
  const status = document.getElementById('prototype-sync-status');
  if (status) status.textContent = message;
}
async function readAuthorizationScope() {
  try {
    const response = await fetch('/api/gea-html/identity', { cache: 'no-store' });
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
      current = publication;
      const value = snapshot;
      try {
        // One in-flight context prevents older transport requests from overwriting newer facts.
        await publish(value);
        if (!attached) return;
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
    syncStatus('正在读取最新客户库存…');
    const inventory = await loadCustomerInventory();
    if (!inventory.rows.length) throw Error('当前授权范围没有客户库存数据');
    authorizationScope = await readAuthorizationScope();
    inventorySnapshot = inventory.snapshot;
    syncStatus('');
    mountCustomerPrototype(report, inventory);
  })
  .catch((error) => {
    document.getElementById('app').textContent = `客户库存读取失败：${error.message}，请重新进入。`;
  });
window.addEventListener('gea-session-changed', () => {
  attached = true;
  if (snapshot) report(snapshot);
});
window.addEventListener('gea-identity-changed', () => {
  attached = false;
  publication++;
  unregister();
  syncStatus('页面连接已变化，请重新进入。');
});
window.addEventListener(
  'pagehide',
  () => {
    attached = false;
    publication++;
    unregister();
  },
  { once: true },
);
