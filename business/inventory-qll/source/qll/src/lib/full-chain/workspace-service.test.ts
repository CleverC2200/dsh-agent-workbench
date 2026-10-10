import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFullChainWorkspace as computeWorkspace } from 'dsh-agent-manage/inventory-compute/full-chain-workspace-service';
import type {
  BuildWorkspaceRequest,
  FullChainData,
} from 'dsh-agent-manage/inventory-compute/full-chain-types';

type FullChainDataAdapter = { load: (request: BuildWorkspaceRequest) => Promise<FullChainData> };
async function buildFullChainWorkspace(
  request: BuildWorkspaceRequest & { adapter: FullChainDataAdapter },
) {
  return computeWorkspace(await request.adapter.load(request), request);
}
const adapter: FullChainDataAdapter = {
  async load() {
    return {
      baseInventory: [
        {
          snapshotDate: '2026-09-01',
          base: '华东基地',
          category: '水饺',
          sku: 'A',
          currentQty: 100,
          targetQty: 80,
          externalDemand30d: 300,
          confirmedTransferOut30d: 60,
        },
      ],
      branchInventory: [
        {
          snapshotDate: '2026-09-03',
          base: '华东基地',
          branch: '杭州分仓',
          category: '水饺',
          sku: 'A',
          currentQty: 50,
          targetQty: 70,
          externalDemand30d: 150,
        },
      ],
      customerInventory: [
        {
          snapshotDate: '2026-08-31',
          customerId: 'C1',
          customer: '甲经销商',
          branch: '杭州分仓',
          category: '水饺',
          sku: 'A',
          currentQty: 30,
          targetQty: 25,
          sales30d: 60,
          sourceConflict: true,
        },
      ],
      agingBatches: [
        {
          snapshotDate: '2026-09-02',
          layer: 'base',
          objectName: '华东基地',
          category: '水饺',
          sku: 'A',
          batch: 'B1',
          qty: 40,
          ageDays: 58,
          dailyVelocity: 2,
        },
        {
          snapshotDate: '2026-09-03',
          layer: 'branch',
          objectName: '杭州分仓',
          category: '水饺',
          sku: 'A',
          batch: 'B2',
          qty: 20,
          ageDays: 91,
          dailyVelocity: 1,
        },
        {
          snapshotDate: '2026-08-31',
          layer: 'customer',
          objectName: '甲经销商',
          category: '水饺',
          sku: 'A',
          batch: 'B3',
          qty: 10,
          ageDays: 121,
          dailyVelocity: 0.5,
        },
      ],
      orders: [
        {
          snapshotDate: '2026-09-02',
          month: '2026-09',
          pickupType: 'factory',
          orderQty: 100,
          demandQty: 100,
          shortageQty: 10,
          shippedQty: 90,
          affectedOrders: 2,
        },
        {
          snapshotDate: '2026-09-02',
          month: '2026-09',
          pickupType: 'branch',
          orderQty: 50,
          demandQty: 50,
          shortageQty: 10,
          shippedQty: 40,
          affectedOrders: 3,
        },
      ],
      pendingOrders: [
        { snapshotDate: '2026-09-03', branch: '杭州分仓', demandQty: 25, allocatedQty: 20 },
      ],
      activeCustomerIds30d: ['C1', 'C2', 'C3', 'C4'],
      inventoryTrend: [
        { snapshotDate: '2026-09-01', layer: 'base', qty: 100 },
        { snapshotDate: '2026-09-03', layer: 'branch', qty: 50 },
      ],
    };
  },
};

const trustedAccess = {
  principalId: 'u-1',
  trusted: true as const,
  allowedBases: ['华东基地'],
  allowedBranches: ['杭州分仓'],
  allowedCustomerIds: ['C1'],
};
test('current order card never substitutes monthly orders and age auxiliary uses over 30 days', async () => {
  const request = {
    access: trustedAccess,
    scope: 'company' as const,
    filters: {},
    now: new Date('2026-09-10'),
    adapter,
  };
  const all = await buildFullChainWorkspace(request);
  assert.equal(all.orderExecution?.orderQty, 150);
  assert.equal(all.orderExecution?.currentOrderQty, null);
  assert.equal(all.orderExecution?.currentBranchOrderQty, 25);
  assert.equal(all.aging.over30ByLayer?.base, 40);
  const branch = await buildFullChainWorkspace({ ...request, filters: { branch: '杭州分仓' } });
  assert.equal(branch.orderExecution?.currentOrderQty, 25);
});
test('fulfillment uses shipments over orders, not one minus shortage over demand', async () => {
  const ws = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: {},
    now: new Date('2026-09-10'),
    adapter: {
      load: async (request) => {
        const data = await adapter.load(request);
        return {
          ...data,
          orders: [
            { ...data.orders[0]!, orderQty: 200, demandQty: 100, shortageQty: 10, shippedQty: 80 },
          ],
        };
      },
    },
  });
  assert.equal(ws.kpis.fulfillment.current, 40);
  assert.equal(ws.fulfillment.national.rate, 40);
  assert.equal(ws.kpis.fulfillment.target, null);
});
test('over-shipped source scope does not become a healthy fulfillment rate', async () => {
  const ws = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: {},
    now: new Date('2026-09-10'),
    adapter: {
      load: async (request) => {
        const data = await adapter.load(request);
        return { ...data, orders: [{ ...data.orders[0]!, orderQty: 100, shippedQty: 105 }] };
      },
    },
  });
  assert.equal(ws.kpis.fulfillment.current, null);
  assert.ok(ws.evidence.dataNotes?.some((note) => note.includes('发货量超过订单量')));
});

test('latest-data evidence discloses per-layer dates and scopes unknown customer quantities', async () => {
  const request = {
    access: trustedAccess,
    scope: 'all-channel' as const,
    filters: {},
    now: new Date('2026-09-10'),
    adapter: {
      load: async (request: Parameters<FullChainDataAdapter['load']>[0]) => {
        const data = await adapter.load(request);
        data.customerInventory[0]!.statisticDate = '2026-09-10';
        return {
          ...data,
          customerQuantityGaps: [
            { customerId: 'C1', sku: 'MISSING', category: '水饺' },
            { customerId: 'OUTSIDE', sku: 'HIDDEN', category: '水饺' },
          ],
        };
      },
    },
  };
  const ws = await buildFullChainWorkspace(request);
  assert.equal(ws.freshness.byDomain.baseInventory, '2026-09-01');
  assert.equal(ws.freshness.byDomain.branchInventory, '2026-09-03');
  assert.equal(ws.freshness.byDomain.customerStatistics, '2026-09-10');
  assert.equal(ws.freshness.byDomain.customerOldestUpload, '2026-08-31');
  assert.ok(ws.evidence.dataNotes?.some((note) => note.includes('1 条库存数量缺失')));
  assert.ok(ws.evidence.dataNotes?.some((note) => note.includes('历史未标记')));
  const company = await buildFullChainWorkspace({ ...request, scope: 'company' });
  assert.equal(company.kpis.inventoryLevel.current, ws.kpis.inventoryLevel.current);
  assert.ok(!company.evidence.dataNotes?.some((note) => note.includes('库存数量缺失')));
});

test('a source-provided zero base target remains comparable in the workspace and detail', async () => {
  const data = await adapter.load({
    access: trustedAccess,
    scope: 'company',
    filters: {},
    now: new Date('2026-09-10'),
  });
  data.baseInventory[0]!.targetQty = 0;
  const request = {
    access: trustedAccess,
    scope: 'company' as const,
    filters: { base: '华东基地', sku: 'A' },
    now: new Date('2026-09-10'),
    adapter: { load: async () => data },
  };
  const ws = await buildFullChainWorkspace(request);
  assert.equal(ws.kpis.inventoryLevel.target, 0);
  assert.equal(ws.structure[0]!.targetQty, 0);
  assert.equal(ws.structure[0]!.differenceQty, 100);
  data.baseInventory[0]!.targetQty = null;
  const missing = await buildFullChainWorkspace(request);
  assert.equal(missing.kpis.inventoryLevel.target, null);
  assert.equal(missing.structure[0]!.differenceQty, null);
});

test('a ready zero branch target remains comparable, unlike a missing target', async () => {
  const ws = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: { branch: '杭州分仓', sku: 'A' },
    now: new Date('2026-09-10'),
    adapter: {
      load: async (request) => {
        const data = await adapter.load(request);
        data.branchInventory[0]!.targetQty = 0;
        return data;
      },
    },
  });
  assert.equal(ws.structure[0]!.targetQty, 0);
  assert.equal(ws.structure[0]!.differenceQty, 50);
});
test('company aging excludes negative batches consistently and discloses the exclusion', async () => {
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: {},
    now: new Date('2026-09-08'),
    adapter: {
      load: async (request) => {
        const data = await adapter.load(request);
        return {
          ...data,
          agingBatches: [
            ...data.agingBatches,
            { ...data.agingBatches[0]!, batch: 'negative', qty: -1 },
          ],
        };
      },
    },
  });
  assert.equal(result.kpis.aging.current, 69);
  assert.match(result.kpis.aging.explanation, /已排除 1 批负库存/);
  assert.equal(result.trends.aging.find((row) => row.layer === 'base')!.averageAge, 58);
  assert.equal(result.aging.projections.day7.byLayer.base, 26);
  assert.equal(
    result.agingDetails!.find((row) => row.layer === 'base')!.values.currentQty,
    39,
    'The actual inventory total must retain the negative source batch',
  );
  assert.equal(result.agingDetails!.find((row) => row.layer === 'base')!.values.averageAgeDays, 58);
});

test('empty batches without velocity do not block forecasts for valid stocked batches', async () => {
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: {},
    now: new Date('2026-09-08'),
    adapter: {
      load: async (request) => {
        const data = await adapter.load(request);
        return {
          ...data,
          agingBatches: [
            ...data.agingBatches,
            {
              ...data.agingBatches[1]!,
              sku: 'empty',
              batch: 'empty',
              qty: 0,
              ageDays: null,
              dailyVelocity: null,
            },
          ],
        };
      },
    },
  });
  assert.equal(result.aging.projections.day7.byLayer.branch, 13);
  assert.equal(result.agingDetails!.find((row) => row.layer === 'branch')!.values.day7, 13);
});

test('structure aging excludes company negative batches but preserves customer validation and actual stock', async () => {
  for (const layer of ['base', 'branch', 'customer'] as const) {
    for (const filters of [{}, { sku: 'A' }]) {
      const result = await buildFullChainWorkspace({
        access: trustedAccess,
        scope: 'all-channel',
        filters,
        now: new Date('2026-09-08'),
        adapter: {
          load: async (request) => {
            const data = await adapter.load(request);
            const batch = data.agingBatches.find((row) => row.layer === layer)!;
            return {
              ...data,
              agingBatches: [...data.agingBatches, { ...batch, batch: 'negative', qty: -1 }],
            };
          },
        },
      });
      const rows = result.structure.filter((row) => row.layer === layer);
      assert.ok(rows.length > 0);
      for (const row of rows) {
        assert.ok(row.currentQty > 0, 'Preserve actual stock, do not remove the affected object');
        assert.equal(row.averageAgeDays, layer === 'customer' ? null : layer === 'base' ? 58 : 91);
        assert.equal(row.bigDateQty, layer === 'customer' ? null : layer === 'base' ? 0 : 20);
      }
    }
  }
});

test('aging tree retains warehouses, age bands and FIFO forecasts at SKU grain', async () => {
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: { month: '2026-09', branch: '杭州分仓', category: '水饺' },
    now: new Date('2026-09-05'),
    adapter,
  });
  const layer = result.agingDetails!.find((row) => row.layer === 'branch')!;
  const warehouse = layer.children![0]!;
  const sku = warehouse.children![0]!.children![0]!;
  assert.equal(warehouse.label, '杭州分仓');
  assert.equal(sku.values.currentQty, 20);
  assert.equal(sku.values.age60Plus, 20);
  assert.equal(sku.values.day7, 13);
  assert.equal(sku.values.day14, 6);
  assert.equal(sku.values.dailyVelocity, 1);
  assert.equal(sku.values.riskQty, 20);
});

test('order execution tree separates monthly and cross-month seven-day quantities and deduplicates orders', async () => {
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: { month: '2026-09', branch: '杭州分仓', category: '水饺' },
    now: new Date('2026-09-05'),
    adapter: {
      load: async (request) => {
        const data = await adapter.load(request);
        const order = {
          ...data.orders[1]!,
          objectName: '杭州分仓',
          category: '水饺',
          orderIds: ['O1'],
          affectedOrderIds: ['O1'],
          orderQty: 60,
        };
        return {
          ...data,
          orders: [
            { ...order, sku: 'A' },
            { ...order, sku: 'B', orderQty: 20, demandQty: 20, shortageQty: 5, shippedQty: 15 },
          ],
          orders7d: [{ ...order, month: '2026-08', sku: 'A', orderQty: 90 }],
        };
      },
    },
  });
  assert.equal(result.orderExecution!.orderQty, 80);
  assert.equal(result.orderExecution!.orderCount, 1);
  assert.equal(result.orderExecution!.orderQty7d, 90);
  assert.equal(result.fulfillment.branch.affectedOrders, 1);
  const sku = result.orderDetails![0]!.children![0]!.children![0]!.children![0]!;
  assert.equal(sku.values.orderQty, 60);
  assert.equal(sku.values.preparedQty, null);
});

test('forecast turnover aggregates quantities and daily plan before dividing', async () => {
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: {},
    now: new Date('2026-09-05'),
    adapter: {
      load: async (request) => {
        const data = await adapter.load(request);
        return {
          ...data,
          branchInventory: [
            {
              ...data.branchInventory[0]!,
              sku: 'A',
              targetQty: 100,
              plannedDailyQty: 10,
              forecastInventoryQty: 20,
            },
            {
              ...data.branchInventory[0]!,
              sku: 'B',
              targetQty: 600,
              plannedDailyQty: 20,
              forecastInventoryQty: 100,
            },
          ],
        };
      },
    },
  });
  const row = result.structure.find((row) => row.layer === 'branch')!;
  assert.equal(row.targetTurnoverDays, 23.33);
  assert.equal(row.projectedTurnoverDays, 4);
});

test('pending-only warehouses remain visible without inventing monthly order quantities', async () => {
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: { branch: '杭州分仓', category: '水饺' },
    now: new Date('2026-09-05'),
    adapter: {
      load: async (request) => {
        const data = await adapter.load(request);
        return {
          ...data,
          orders: [],
          orders7d: [],
          pendingOrders: [{ ...data.pendingOrders[0]!, sku: 'A' }],
        };
      },
    },
  });
  const sku = result.orderDetails![0]!.children![0]!.children![0]!.children![0]!;
  assert.equal(sku.label, 'A');
  assert.equal(sku.values.pendingQty, 25);
  assert.equal(sku.values.allocatedQty, 20);
  assert.equal(sku.values.orderQty, null);
  assert.equal(sku.values.preparedQty, null);
});

test('negative forecast stock cannot be hidden by positive stock when aggregating', async () => {
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: {},
    now: new Date('2026-09-05'),
    adapter: {
      load: async (request) => {
        const data = await adapter.load(request);
        return {
          ...data,
          branchInventory: [
            {
              ...data.branchInventory[0]!,
              sku: 'A',
              plannedDailyQty: 10,
              forecastInventoryQty: -20,
            },
            {
              ...data.branchInventory[0]!,
              sku: 'B',
              plannedDailyQty: 20,
              forecastInventoryQty: 100,
            },
          ],
        };
      },
    },
  });
  assert.equal(result.structure.find((row) => row.layer === 'branch')!.projectedTurnoverDays, null);
});

test('incomplete batch age or conflicting SKU speeds never produce a FIFO forecast', async () => {
  for (const missingAge of [true, false]) {
    const result = await buildFullChainWorkspace({
      access: trustedAccess,
      scope: 'company',
      filters: { branch: '杭州分仓' },
      now: new Date('2026-09-05'),
      adapter: {
        load: async (request) => {
          const data = await adapter.load(request);
          const batch = data.agingBatches[1]!;
          return {
            ...data,
            agingBatches: [
              batch,
              { ...batch, batch: 'other', ageDays: missingAge ? null : 95, dailyVelocity: 2 },
            ],
          };
        },
      },
    });
    assert.equal(result.agingDetails![0]!.values.day7, null);
    assert.equal(result.aging.projections.day7.byLayer.branch, null);
  }
});

test('KPI layer auxiliaries use current batches, not a historical trend point', async () => {
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: { month: '2026-09' },
    now: new Date('2026-09-05'),
    adapter: {
      load: async (request) => ({
        ...(await adapter.load(request)),
        agingHistory: [{ snapshotDate: '2026-09-01', layer: 'base', averageAge: 12 }],
      }),
    },
  });
  assert.equal(result.layerMetrics?.base.averageAgeDays, 58);
  assert.equal(result.layerMetrics?.branch.averageAgeDays, 91);
  assert.equal(result.layerMetrics?.base.turnoverDays, 8.33);
  assert.equal(result.layerMetrics?.branch.turnoverDays, 10);
});

test('structure turnover aggregates stock and consumption before division', async () => {
  const result = await buildFullChainWorkspace({
    access: { principalId: 'audit', trusted: true },
    scope: 'company',
    filters: { month: '2026-09' },
    now: new Date('2026-09-05'),
    adapter: {
      load: async (request) => ({
        ...(await adapter.load(request)),
        baseInventory: [],
        branchInventory: [
          {
            snapshotDate: '2026-09-03',
            base: null,
            branch: '长沙',
            category: '水饺',
            sku: 'A',
            currentQty: 100,
            targetQty: 100,
            externalDemand30d: 300,
          },
          {
            snapshotDate: '2026-09-03',
            base: null,
            branch: '长沙',
            category: '水饺',
            sku: 'B',
            currentQty: 900,
            targetQty: 900,
            externalDemand30d: 900,
          },
        ],
      }),
    },
  });
  assert.equal(result.kpis.turnover.current, 25);
  assert.equal(result.structure[0]!.turnoverDays, 25);
});

test('branch drill excludes unrelated layers from KPIs, aging and trends', async () => {
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'all-channel',
    filters: { month: '2026-09', branch: '杭州分仓' },
    now: new Date('2026-09-04'),
    adapter,
  });
  assert.equal(result.kpis.inventoryLevel.current, 50);
  assert.ok(result.structure.every((row) => row.layer === 'branch'));
  assert.ok(result.trends.inventory.every((row) => row.layer === 'branch'));
  assert.equal(result.kpis.aging.current, 91);
  assert.equal(result.fulfillment.national.demandQty, 50);
});

test('missing targets lower confidence and disclose field coverage without fabricating values', async () => {
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: { month: '2026-09' },
    now: new Date('2026-09-04'),
    adapter: {
      load: async (request) => {
        const data = await adapter.load(request);
        return {
          ...data,
          branchInventory: data.branchInventory.map((row) => ({ ...row, targetQty: null })),
        };
      },
    },
  });
  assert.notEqual(result.confidence.level, 'high');
  assert.equal(result.kpis.inventoryLevel.target, null);
  assert.match(result.confidence.summary, /目标.*1\/2/);
});

test('base and customer drill preserve the selected layer without mixing company and observation', async () => {
  const base = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'all-channel',
    filters: { month: '2026-09', base: '华东基地' },
    now: new Date('2026-09-04'),
    adapter,
  });
  assert.equal(base.kpis.inventoryLevel.current, 100);
  assert.equal(base.fulfillment.national.demandQty, 100);
  assert.ok(base.structure.every((row) => row.layer === 'base'));
  const customer = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'all-channel',
    filters: { month: '2026-09', customerId: 'C1' },
    now: new Date('2026-09-04'),
    adapter,
  });
  assert.equal(customer.kpis.inventoryLevel.current, null);
  assert.equal(customer.kpis.inventoryLevel.observedCustomer, 30);
  assert.equal(customer.kpis.orderGap.current, null);
  assert.ok(customer.structure.every((row) => row.layer === 'customer'));
});

test('customer headline uses the full plan snapshot while daily observations stay separate', async () => {
  const result = await buildFullChainWorkspace({
    access: { ...trustedAccess, allowedCustomerIds: undefined },
    scope: 'all-channel',
    filters: { month: '2026-09' },
    now: new Date('2026-09-23'),
    adapter: {
      load: async (request) => ({
        ...(await adapter.load(request)),
        customerPlanInventory: [
          { snapshotDate: '2026-09-23', customerId: 'C1', stockQty: 40, inTransitQty: 5 },
          { snapshotDate: '2026-09-23', customerId: 'C2', stockQty: 60, inTransitQty: 7 },
        ],
      }),
    },
  });
  assert.equal(result.kpis.inventoryLevel.planCustomerTotal, 112);
  assert.equal(result.kpis.inventoryLevel.planCustomerDate, '2026-09-23');
  assert.equal(result.kpis.inventoryLevel.observedCustomer, 30);
  assert.equal(
    result.structure
      .filter((row) => row.layer === 'customer')
      .reduce((sum, row) => sum + row.currentQty, 0),
    30,
  );
});

test('turnover excludes both inventory and demand of consumption-missing records', async () => {
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: { month: '2026-09' },
    now: new Date('2026-09-04'),
    adapter: {
      load: async (request) => {
        const data = await adapter.load(request);
        return {
          ...data,
          branchInventory: [
            ...data.branchInventory,
            { ...data.branchInventory[0]!, sku: 'missing', externalDemand30d: null },
          ],
        };
      },
    },
  });
  assert.equal(result.kpis.turnover.current, 10);
  assert.equal(result.layerMetrics!.branch.turnoverDays, 10);
  assert.equal(
    result.kpis.inventoryLevel.current,
    200,
    'Excluded consumption records remain in inventory totals',
  );
  assert.match(result.kpis.turnover.explanation, /已排除 1 条消耗缺失记录/);
});

test('builds the five KPI workspace with grain-safe formulas', async () => {
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: { month: '2026-09' },
    now: new Date('2026-09-04T08:00:00+08:00'),
    adapter,
  });

  assert.equal(result.contractVersion, 'full-chain-workspace/v1');
  assert.equal(result.scope, 'company');
  assert.equal(result.kpis.inventoryLevel.current, 150);
  assert.equal(result.kpis.inventoryLevel.target, 150);
  assert.equal(result.kpis.turnover.current, 10);
  assert.equal(result.kpis.fulfillment.current, 86.67);
  assert.equal(result.kpis.orderGap.current, 20);
  assert.equal(result.kpis.orderGap.target, 0);
  assert.equal(result.kpis.aging.current, 69);
  assert.equal(result.kpis.aging.unit, '天');
  assert.equal(result.freshness.minDate, '2026-09-01');
  assert.equal(result.freshness.maxDate, '2026-09-03');
  assert.equal(result.coverage.rate, null);
  assert.equal(result.coverage.coveredCustomers, 0);
  assert.equal(result.coverage.activeCustomers, 0);
  assert.equal(result.confidence.level, 'high');
  assert.equal(result.aging.projections.day14.state, 'available');
});

test('all-channel adds customer observation without changing company target', async () => {
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'all-channel',
    filters: { month: '2026-09' },
    now: new Date('2026-09-04T08:00:00+08:00'),
    adapter,
  });

  assert.equal(result.kpis.inventoryLevel.current, 150);
  assert.equal(result.kpis.inventoryLevel.companyCurrent, 150);
  assert.equal(result.kpis.inventoryLevel.observedTotal, 180);
  assert.equal(result.kpis.inventoryLevel.target, 150);
  assert.equal(result.kpis.turnover.current, 10);
  assert.equal(result.kpis.aging.current, 69);
  assert.match(result.confidence.summary, /100\.0%/);
  assert.ok(!result.risks.some((risk) => risk.code.startsWith('CUSTOMER_')));
  assert.ok(
    result.customerObservationRisks.some((risk) => risk.code === 'CUSTOMER_SOURCE_CONFLICT'),
  );
});

test('penalizes confidence when any customer aging source is stale', async () => {
  const multiSourceAdapter: FullChainDataAdapter = {
    async load(request) {
      const data = await adapter.load(request);
      const customer = { ...data.customerInventory[0]!, sourceConflict: false };
      const customerAge = data.agingBatches.find((row) => row.layer === 'customer')!;
      return {
        ...data,
        customerInventory: [customer],
        activeCustomerIds30d: ['C1'],
        agingBatches: [
          ...data.agingBatches.filter((row) => row.layer !== 'customer'),
          { ...customerAge, snapshotDate: '2026-09-03', source: '提报' },
          { ...customerAge, snapshotDate: '2026-08-20', source: '文沥' },
        ],
      };
    },
  };
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'all-channel',
    filters: { month: '2026-09' },
    now: new Date('2026-09-04T08:00:00+08:00'),
    adapter: multiSourceAdapter,
  });

  assert.equal(result.coverage.rate, 100);
  assert.equal(result.confidence.level, 'medium');
  assert.match(result.confidence.summary, /库龄新鲜度/);
});

test('applies layer-specific aging and oldest-first future projection', async () => {
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'all-channel',
    filters: { month: '2026-09' },
    now: new Date('2026-09-04T08:00:00+08:00'),
    adapter,
  });

  assert.deepEqual(result.aging.byLayer, { base: 0, branch: 20, customer: 10 });
  assert.deepEqual(result.aging.attentionByLayer, { base: null, branch: 0, customer: 0 });
  assert.deepEqual(result.aging.highRiskByLayer, { base: null, branch: null, customer: 0 });
  assert.equal(result.aging.projections.day7.byLayer.base, 26);
  assert.equal(result.aging.projections.day7.byLayer.branch, 13);
  assert.equal(result.aging.projections.day14.byLayer.base, 12);
  assert.equal(result.aging.projections.day14.byLayer.customer, 3);
});

test('base risk is strictly older than 60 days', async () => {
  const exactThresholdAdapter: FullChainDataAdapter = {
    async load(request) {
      const data = await adapter.load(request);
      return { ...data, agingBatches: [{ ...data.agingBatches[0]!, ageDays: 60 }] };
    },
  };
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: {},
    now: new Date('2026-09-04T08:00:00+08:00'),
    adapter: exactThresholdAdapter,
  });
  assert.equal(result.aging.byLayer.base, 0);
  assert.ok(!result.risks.some((risk) => risk.code === 'BASE_OVER_AGE'));
});

test('empty allowlists deny every layer instead of widening access', async () => {
  const result = await buildFullChainWorkspace({
    access: {
      principalId: 'denied',
      trusted: true,
      allowedBases: [],
      allowedBranches: [],
      allowedCustomerIds: [],
    },
    scope: 'all-channel',
    filters: {},
    now: new Date('2026-09-04T08:00:00+08:00'),
    adapter,
  });
  assert.equal(result.kpis.inventoryLevel.current, null);
  assert.equal(result.kpis.turnover.current, null);
  assert.equal(result.kpis.aging.current, null);
  assert.equal(result.structure.length, 0);
  assert.equal(result.coverage.coveredCustomers, 0);
});

test('pure calculation rejects an untrusted supplied scope', async () => {
  const request = {
    access: trustedAccess,
    scope: 'company' as const,
    filters: {},
    now: new Date('2026-09-04T08:00:00+08:00'),
  };
  const input = await adapter.load(request);
  assert.throws(
    () => computeWorkspace(input, { ...request, access: { ...trustedAccess, trusted: false } }),
    /trusted access context/i,
  );
});

test('only excluded rows never become fabricated zero-day KPIs', async () => {
  const result = await buildFullChainWorkspace({
    access: trustedAccess,
    scope: 'company',
    filters: {},
    now: new Date('2026-09-09'),
    adapter: {
      load: async (request) => {
        const data = await adapter.load(request);
        return {
          ...data,
          baseInventory: data.baseInventory.map((row) => ({ ...row, externalDemand30d: null })),
          branchInventory: data.branchInventory.map((row) => ({ ...row, externalDemand30d: null })),
          agingBatches: data.agingBatches.map((row) => ({ ...row, qty: -1 })),
        };
      },
    },
  });
  assert.equal(result.kpis.turnover.current, null);
  assert.equal(result.layerMetrics!.base.turnoverDays, null);
  assert.equal(result.kpis.aging.current, null);
  assert.equal(result.aging.byLayer.base, null);
  assert.equal(result.agingDetails![0]!.values.day7, null);
  assert.equal(result.kpis.inventoryLevel.current, 150);
});
