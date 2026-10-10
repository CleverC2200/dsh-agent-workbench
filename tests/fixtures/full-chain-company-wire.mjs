/** Synthetic external GEA service responses. This file is never part of a page build. */
const snapshot = '2026-09-30';
export const companyGrant = {
  trusted: true,
  principalId: 'fixture-company',
  gatewayScopeRef: 'fixture-grant',
  allowedBases: ['华东'],
  allowedBranches: ['上海分仓'],
  allowedCustomerIds: ['C1'],
};
const base = Array.from({ length: 105 }, (_, i) => ({
  snapshot_date: snapshot,
  base_name: '华东',
  category: '饺子',
  sku: `MOCK-${String(i + 1).padStart(3, '0')}`,
  current_qty: i + 1,
  target_qty: i === 0 ? null : 20,
  planned_daily_qty: 2,
  external_demand_30d: 30,
  transfer_out_30d: null,
}));
const branch = [1, 2].map((i) => ({
  snapshot_date: snapshot,
  branch: '上海分仓',
  category: '饺子',
  sku: `MOCK-${String(i).padStart(3, '0')}`,
  current_qty: 50,
  available_qty: i === 1 ? 15 : 0,
  target_qty: 30,
  planned_daily_qty: 3,
  external_demand_30d: 60,
}));
const history = [
  {
    snapshot_date: '2026-09-28',
    layer: 'base',
    object: '华东',
    category: '饺子',
    sku: 'MOCK-001',
    qty: 10,
  },
  {
    snapshot_date: snapshot,
    layer: 'base',
    object: '华东',
    category: '饺子',
    sku: 'MOCK-001',
    qty: 0,
  },
  {
    snapshot_date: '2026-08-01',
    layer: 'base',
    object: '华东',
    category: '饺子',
    sku: 'MOCK-001',
    qty: 9000,
  },
  {
    snapshot_date: snapshot,
    layer: 'branch',
    object: '上海分仓',
    category: '饺子',
    sku: 'MOCK-001',
    qty: 15,
  },
];
const aging = [
  {
    snapshot_date: '2026-09-28',
    layer: 'base',
    object: '华东',
    category: '饺子',
    sku: 'MOCK-001',
    average_age: 44,
  },
  {
    snapshot_date: snapshot,
    layer: 'base',
    object: '华东',
    category: '饺子',
    sku: 'MOCK-001',
    average_age: null,
  },
];

/** Former reception literals retained at the public calculator, including customer units. */
export function syntheticDomainData() {
  return {
    baseInventory: base.map((x) => ({
      snapshotDate: x.snapshot_date,
      base: x.base_name,
      category: x.category,
      sku: x.sku,
      currentQty: x.current_qty,
      targetQty: x.target_qty,
      plannedDailyQty: x.planned_daily_qty,
      externalDemand30d: x.external_demand_30d,
      confirmedTransferOut30d: null,
    })),
    branchInventory: branch.map((x) => ({
      snapshotDate: x.snapshot_date,
      base: null,
      branch: x.branch,
      category: x.category,
      sku: x.sku,
      currentQty: x.current_qty,
      availableQty: x.available_qty,
      targetQty: x.target_qty,
      plannedDailyQty: x.planned_daily_qty,
      externalDemand30d: x.external_demand_30d,
    })),
    customerInventory: [
      {
        snapshotDate: snapshot,
        sku: 'MOCK-001',
        customerId: 'C1',
        customer: '授权模拟客户',
        branch: null,
        category: '饺子',
        currentQty: 100,
        targetQty: null,
        sales30d: 300,
        sourceConflict: false,
      },
      {
        snapshotDate: snapshot,
        sku: 'MOCK-001',
        customerId: 'C2',
        customer: '范围外模拟客户',
        branch: null,
        category: '饺子',
        currentQty: 999,
        targetQty: null,
        sales30d: 300,
        sourceConflict: false,
      },
    ],
    customerPlanInventory: [
      { snapshotDate: snapshot, customerId: 'C1', stockQty: 0, inTransitQty: 0 },
    ],
    agingBatches: [
      {
        snapshotDate: snapshot,
        category: '饺子',
        sku: 'MOCK-001',
        layer: 'customer',
        objectId: 'C1',
        objectName: '授权模拟客户',
        batch: 'mock-batch',
        qty: 100,
        ageDays: 44,
        dailyVelocity: 10,
        source: 'OFFLINE_FIXED_INPUT',
      },
    ],
    orders: [],
    pendingOrders: [],
    activeCustomerIds30d: ['C1', 'C2'],
    inventoryTrend: [],
  };
}

export function createCompanyWire() {
  return async (method, payload, options) => {
    options?.signal?.throwIfAborted();
    if (method === 'access') return structuredClone(companyGrant);
    if (method !== 'sql') throw Error('UNEXPECTED_EXTERNAL_OPERATION');
    const name = /full-chain:([A-Z0-9_]+)/.exec(payload.sql)?.[1];
    const p = payload.parameters;
    let rows = [];
    if (name === 'BASE_SQL')
      rows = base.filter(
        (x) =>
          (!p.gea_p4 || x.base_name === p.gea_p4) &&
          (!p.gea_p5 || x.category === p.gea_p5) &&
          (!p.gea_p6 || x.sku === p.gea_p6),
      );
    if (name === 'BRANCH_SQL')
      rows = branch.filter(
        (x) =>
          (!p.gea_p4 || x.branch === p.gea_p4) &&
          (!p.gea_p5 || x.category === p.gea_p5) &&
          (!p.gea_p6 || x.sku === p.gea_p6),
      );
    if (name === 'BRANCH_OUTBOUND_SQL')
      rows = branch
        .filter(
          (x) =>
            (!p.gea_p3 || x.branch === p.gea_p3) &&
            (!p.gea_p4 || x.category === p.gea_p4) &&
            (!p.gea_p5 || x.sku === p.gea_p5),
        )
        .map((x) => ({ ...x, outbound_qty: 60 }));
    const inWindow = (x) =>
      x.snapshot_date <= p.gea_p1 &&
      x.snapshot_date >=
        new Date(Date.parse(p.gea_p1 + 'T00:00:00Z') - 29 * 86400000).toISOString().slice(0, 10);
    const matchesHistory = (x) =>
      inWindow(x) &&
      (!p.gea_p4 || (x.layer === 'base' && x.object === p.gea_p4)) &&
      (!p.gea_p5 || (x.layer === 'branch' && x.object === p.gea_p5)) &&
      (!p.gea_p6 || x.category === p.gea_p6) &&
      (!p.gea_p7 || x.sku === p.gea_p7);
    if (name === 'COMPANY_TREND_SQL')
      rows = history
        .filter(matchesHistory)
        .map(({ snapshot_date, layer, qty }) => ({ snapshot_date, layer, qty }));
    if (name === 'AGING_TREND_SQL')
      rows = aging
        .filter(matchesHistory)
        .map(({ snapshot_date, layer, average_age }) => ({ snapshot_date, layer, average_age }));
    if (
      name === 'ORDER_TREND_SQL' &&
      p.gea_p2 === '2026-09-01' &&
      (!p.gea_p4 || p.gea_p4 === '华东') &&
      !p.gea_p5 &&
      (!p.gea_p6 || p.gea_p6 === '饺子') &&
      (!p.gea_p7 || p.gea_p7 === 'MOCK-001')
    )
      rows = [
        {
          snapshot_date: snapshot,
          month: '2026-09',
          source_order_period: '2026-09-01',
          pickup_type: 'factory',
          demand_qty: 100,
          shortage_qty: 12,
          shipped_qty: 88,
          affected_orders: 1,
        },
      ];
    const start = (payload.pageNo - 1) * payload.pageSize;
    return {
      rows: structuredClone(rows.slice(start, start + payload.pageSize)),
      total: rows.length,
      returnedColumns: [],
      rejectedColumns: [],
    };
  };
}
