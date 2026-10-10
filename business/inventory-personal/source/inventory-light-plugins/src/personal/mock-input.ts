import type { DailyReportInput } from 'dsh-agent-manage/inventory-compute/daily-report';
/** Fixed reception input. This module has no network, workspace or real Consumer access. */
export const dataMode = 'mock';
let lifetime = new AbortController();
export const readSignal = () => lifetime.signal;
export function clearReadCache() {
  lifetime.abort();
  lifetime = new AbortController();
}
export function clearFacts() {}
const snapshot = '2026-10-07';
const stock = (
  base: string,
  material: string,
  inventory: number | null,
  target: number | null,
) => ({
  base,
  material,
  name: '模拟商品 ' + material,
  category: '火锅料',
  inventory,
  target,
  demand: 1,
  shipment30: 0,
  snapshot,
});
const age = (base: string, material: string, bands: (number | null)[], inventory: number) => ({
  base,
  material,
  name: '模拟商品 ' + material,
  category: '火锅料',
  inventory,
  bands,
  weightedAge: inventory * 50,
  invalidQuantity: false,
  snapshot,
});
const daily: DailyReportInput = {
  stock: [
    stock('郑州', 'AGE', 30, 20),
    stock('华东', 'ZERO', 0, 0),
    stock('西南', 'UNKNOWN', 10, null),
    stock('遂平', 'DENIED', 10, 20),
  ],
  age: [
    age('郑州', 'AGE', [0, 0, 10, 20, 0], 30),
    age('华东', 'ZERO', [0, 0, 0, 0, 0], 0),
    age('西南', 'UNKNOWN', [0, null, 0, 0, 0], 10),
  ],
  pending: [],
  fulfillment: [],
  failedSources: [],
  pendingSnapshot: snapshot,
  targetMonth: '2026-10',
  targetVersion: '月初',
  targetRule: 'current',
  generatedAt: snapshot,
  localPreview: false,
};
export async function loadDailyReportInput() {
  return structuredClone(daily);
}
export async function catalog() {
  return {
    warehouses: [
      { id: 'MOCK-BRANCH', name: '模拟分仓' },
      { id: 'MOCK-DENIED', name: '模拟拒权分仓' },
    ],
  };
}
export async function load({ warehouseId }: { warehouseId: string }): Promise<any> {
  if (warehouseId === 'MOCK-DENIED')
    throw Error('当前账号暂无数据权限。模拟拒权，未请求真实服务。');
  return {
    metrics: {
      inventoryQty: 20,
      averageAgeDays: 70,
      shortageQty: 5,
      stagnantQty: 0,
    },
    snapshotTime: snapshot,
    inventory: [
      {
        sku: 'BR',
        productName: '模拟分仓商品',
        category: '火锅料',
        quantity: 20,
        batches: [{ quantity: 20, ageDays: 70 }],
      },
    ],
    replenishments: [
      {
        sku: 'BR',
        productName: '模拟分仓商品',
        category: '火锅料',
        targetInventoryQty: 30,
        availableQty: 20,
        shortageQty: 5,
        openTransferQty: 0,
        recommendedQty: 10,
        reason: '固定模拟输入',
      },
    ],
  };
}
