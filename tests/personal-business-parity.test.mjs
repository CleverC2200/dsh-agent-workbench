import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const source = 'business/inventory-personal/source/inventory-light-plugins/src/personal/data.ts';
const original = resolve(
  '../../../../.scratch/plugin-split-migration/evidence/26/original-source-snapshot/inventory-light-plugins/src/personal/data.ts',
);
async function loader(entry) {
  const output = await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'business-input-fixture',
        setup(api) {
          api.onResolve(
            {
              filter:
                /aqkc-report$|fc-engine$|(?:mock|live)-input$|(?:host-read|\.\.\/data)$|query-error\.js$/,
            },
            (args) => ({ path: args.path, namespace: 'fixture' }),
          );
          api.onResolve({ filter: /daily-report$/ }, () => ({
            path: resolve(
              '../../../../.scratch/plugin-split-migration/evidence/26/original-source-snapshot/aqkc/web/src/lib/daily-report.ts',
            ),
          }));
          api.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
            contents:
              path.endsWith('aqkc-report') || /\/(?:mock|live)-input$/.test(path)
                ? 'export const loadDailyReportInput=async()=>structuredClone(globalThis.personalBusiness.daily);export const clearFacts=()=>{};export const clearReadCache=()=>{};export const catalog=async()=>({warehouses:globalThis.personalBusiness.warehouses});export const load=async({warehouseId})=>{const value=globalThis.personalBusiness.snapshots[warehouseId];if(value.error)throw Error(value.error);return structuredClone(value)};'
                : path.endsWith('fc-engine')
                  ? 'export const clearFacts=()=>{};export const catalog=async()=>({warehouses:globalThis.personalBusiness.warehouses});export const load=async({warehouseId})=>{const value=globalThis.personalBusiness.snapshots[warehouseId];if(value.error)throw Error(value.error);return structuredClone(value)};'
                  : path.endsWith('query-error.js')
                    ? 'export const DATA_PERMISSION_MESSAGE="当前账号暂无数据权限";'
                    : 'export const clearReadCache=()=>{};',
          }));
        },
      },
    ],
  });
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(output.outputFiles[0].text).toString('base64') +
      '#' +
      encodeURIComponent(entry)
  );
}
const before = await loader(original),
  after = await loader(source);
const base = {
  generatedAt: '2026-09-20',
  localPreview: false,
  failedSources: [],
  targetMonth: '2026-09',
  targetVersion: '月初',
  targetRule: 'current',
  pendingSnapshot: '2026-09-20',
  stock: [
    {
      base: '华东',
      material: 'A',
      name: '夹具商品',
      category: '火锅料',
      inventory: 100,
      target: 150,
      demand: 10,
      shipment30: 30,
      snapshot: '2026-09-20',
    },
  ],
  age: [
    {
      base: '华东',
      material: 'A',
      name: '夹具商品',
      category: '火锅料',
      inventory: 100,
      bands: [100, 0, 0, 0, 0],
      natural7: 0,
      natural14: 0,
      weightedAge: 2000,
      invalidQuantity: false,
      snapshot: '2026-09-20',
    },
  ],
  pending: [{ base: '华东', material: 'A', quantity: 30, shortage: 20, allocated: 10 }],
  fulfillment: [],
};
const branch = {
  metrics: {
    inventoryQty: 20,
    averageAgeDays: 50,
    shortageQty: 5,
    stagnantQty: 0,
  },
  inventory: [
    {
      sku: 'A',
      quantity: 20,
      category: '火锅料',
      productName: '夹具商品',
      batches: [{ quantity: 20, ageDays: 50, productionDate: '2026-08-01' }],
    },
  ],
  replenishments: [
    {
      sku: 'A',
      category: '火锅料',
      productName: '夹具商品',
      shortageQty: 5,
      targetInventoryQty: 30,
      availableQty: 20,
      recommendedQty: 10,
      openTransferQty: 0,
      reason: '原计算夹具',
    },
  ],
  snapshotTime: '2026-09-20',
};
for (const mode of ['complete', 'partial', 'denied-columns', 'failed-branch']) {
  test(`personal preserves fixed business rules apart from the explicit age metric for ${mode}`, async () => {
    const daily = structuredClone(base),
      snapshot = structuredClone(branch);
    if (mode === 'partial') {
      daily.stock[0].target = null;
      daily.stock[0].shipment30 = null;
    }
    if (mode === 'denied-columns') {
      daily.permissionGaps = ['stock', 'age'];
      snapshot.permissionGaps = ['inventory'];
    }
    if (mode === 'failed-branch') snapshot.error = 'fixture source unavailable';
    globalThis.personalBusiness = {
      daily,
      warehouses: [{ id: 'one', name: '夹具分仓' }],
      snapshots: { one: snapshot },
    };
    try {
      const prior = await before.loadPersonal(() => {}),
        current = await after.loadPersonal(() => {});
      // Exempt only the newly wired over30 field; assert its value independently below.
      const originalFields = (result) => ({
        ...result,
        objects: result.objects.map(({ over30: _over30, ...fields }) => fields),
      });
      assert.deepEqual(originalFields(current), originalFields(prior));
      assert.equal(current.objects[0].over30, mode === 'denied-columns' ? null : 0);
      assert.equal(current.objects[1].over30, prior.objects[1].over30);
      assert.equal(current.objects.length, 2);
      if (mode === 'denied-columns') assert.equal(current.objects[0].inventory, null);
      if (mode === 'failed-branch') assert.equal(current.objects[1].inventory, null);
    } finally {
      delete globalThis.personalBusiness;
    }
  });
}

test('a cancelled aggregate cannot publish or return late branch facts', async () => {
  globalThis.personalBusiness = {
    daily: structuredClone(base),
    warehouses: [],
    snapshots: {},
  };
  const controller = new AbortController();
  controller.abort();
  let publications = 0;
  try {
    await assert.rejects(
      after.loadPersonal(() => publications++, controller.signal),
      { name: 'AbortError' },
    );
    assert.equal(publications, 0);
  } finally {
    delete globalThis.personalBusiness;
  }
});
