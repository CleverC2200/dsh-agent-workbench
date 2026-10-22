import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function load(entry, plugins = []) {
  const manage = {
    name: 'manage-public-source',
    setup(api) {
      api.onResolve({ filter: /^dsh-agent-manage\/inventory-compute\/[a-z-]+$/ }, ({ path }) => ({
        path: resolve('../dsh-agent-manage/src/' + path.split('/').slice(1).join('/') + '.ts'),
      }));
    },
  };
  const r = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [manage, ...plugins],
  });
  return import(
    'data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64')
  );
}
const config = JSON.parse(await readFile('business/inventory-aqkc/sql.config.json', 'utf8'));
const { readConfiguredStock } = await load(
  'business/inventory-aqkc/source/inventory-light-plugins/src/configured-stock.ts',
);
const { makeRequest } = await import('../business/shared/configured-query-client.mjs');
const { deriveMetrics } = await load('../dsh-agent-manage/src/aps-compute/metrics.ts');
function fixture(calendar) {
  const calls = [];
  const execute = async (_, call) => {
    calls.push(call);
    const columns = config.queries[call.queryId].resultColumns;
    const row = Object.fromEntries(columns.map((c) => [c, null]));
    let rows;
    if (call.queryId === 'calendar.target_versions.count') rows = [{ total: calendar.length }];
    else if (call.queryId === 'calendar.target_versions') rows = calendar;
    else if (call.queryId === 'source.stock-date') rows = [{ day: '2026-10-14' }];
    else if (call.queryId === 'page.base-stock.count') rows = [{ total: 1 }];
    else
      rows = [
        {
          ...row,
          base: '郑州',
          sku: 'stock-only',
          inventory: '0',
          stock_source_rows: 1,
          target_source_rows: 0,
          category: '粽子',
          stock_avg_30d_sale: '3',
          month: call.values.month,
          stock_date: call.values.stock_date,
        },
      ];
    return { rows, returnedColumns: columns, rejectedColumns: [], configVersion: 'same' };
  };
  return { execute, calls };
}

test('base page selects the original month-start priority, retains stock-only zeros and source daily averages', async () => {
  const io = fixture([
    { month: '2026-10-01', inventory_version: '滚动' },
    { month: '2026-10-01', inventory_version: '月初' },
  ]);
  const rows = await readConfiguredStock(
    { name: 'workbench-safety-stock-rows' },
    { ...io, now: new Date('2026-10-15T01:00:00Z') },
  );
  const read = io.calls.find((c) => c.queryId === 'page.base-stock');
  assert.equal(read.values.inventory_version, '月初');
  assert.equal(read.values.page_size, 200);
  assert.equal(rows[0]['safety_stock.current_inventory'], '0');
  assert.equal(rows[0]['safety_stock.observed_daily_sales'], '3');
  assert.equal(rows[0]['safety_stock.last_30d_shipment_quantity'], null);
  assert.equal(rows[0]['safety_stock.source'], 'ai-db-stock-only');
  assert.equal(rows[0]['safety_stock.final_target_inventory'], null);
});

test('day-21 next-month targets use the current inventory snapshot instead of requesting a future stock day', async () => {
  const io = fixture([
    { month: '2026-10-01', inventory_version: '月初' },
    { month: '2026-11-01', inventory_version: '滚动' },
  ]);
  await readConfiguredStock(
    { name: 'workbench-safety-stock-rows' },
    { ...io, now: new Date('2026-10-23T01:00:00Z') },
  );
  const read = io.calls.find((c) => c.queryId === 'page.base-stock');
  assert.equal(read.values.month, '2026-11-01');
  assert.equal(read.values.stock_month, '2026-10-01');
  assert.equal(read.values.stock_date, '2026-10-14');
  assert.doesNotThrow(() => makeRequest(config, read.queryId, read.values));
  assert.throws(
    () => makeRequest(config, read.queryId, { ...read.values, stock_month: '2026-11-01' }),
    { code: 'INVALID_PERIOD' },
  );
});

test('a version calendar does not load stock details or pretend database visibility proves GEA publication', async () => {
  const io = fixture([{ month: '2026-10-01', inventory_version: '月初' }]);
  const rows = await readConfiguredStock(
    { name: 'workbench-scope' },
    { ...io, now: new Date('2026-10-15T01:00:00Z') },
  );
  assert.equal(rows.length, 1);
  assert.ok(io.calls.every((c) => c.queryId.startsWith('calendar.')));
  assert.equal(rows[0].trusted, undefined);
});

test('calendar and inventory from different config versions cannot be combined', async () => {
  const io = fixture([{ month: '2026-10-01', inventory_version: '月初' }]);
  const execute = async (request, call) => {
    const result = await io.execute(request, call);
    if (call.queryId === 'source.stock-date') result.configVersion = 'changed';
    return result;
  };
  await assert.rejects(
    readConfiguredStock(
      { name: 'workbench-safety-stock-rows' },
      { execute, now: new Date('2026-10-15T01:00:00Z') },
    ),
    { code: 'QUERY_CONFIG_CHANGED' },
  );
});

test('unsupported current-order or batch facts fail without substituting monthly totals', async () => {
  for (const name of [
    'workbench-current-orders',
    'workbench-current-order-skus',
    'workbench-age-structure',
  ])
    await assert.rejects(
      readConfiguredStock(
        { name },
        {
          execute: () => {
            throw Error('must not query');
          },
        },
      ),
      { code: 'SOURCE_NOT_AVAILABLE' },
    );
});

const stockFixture = { rows: [], invalidOrders: 0 };
const cube = await load('business/inventory-aqkc/source/aqkc/web/src/lib/cube-dashboard.ts', [
  {
    name: 'scoped-facts',
    setup(api) {
      api.onResolve({ filter: /inventory-light-plugins\/src\/configured-stock$/ }, (args) =>
        args.importer.endsWith('cube-dashboard.ts')
          ? { path: 'summary', namespace: 'summary-fixture' }
          : undefined,
      );
      api.onLoad({ filter: /.*/, namespace: 'summary-fixture' }, () => ({
        contents:
          'export const readConfiguredStockSummary=(...args)=>globalThis.__stockSummary(...args); export const readConfiguredHealthSummary=async()=>({rows:[],summary:null}); export const readConfiguredStockPage=()=>{throw Error("not used")};',
        loader: 'js',
      }));
      api.onResolve({ filter: /shared\/batch-age$/ }, (args) =>
        args.importer.endsWith('cube-dashboard.ts')
          ? { path: 'batch-age', namespace: 'batch-fixture' }
          : undefined,
      );
      api.onLoad({ filter: /.*/, namespace: 'batch-fixture' }, () => ({
        contents: `export { batchAgeShare } from ${JSON.stringify(new URL('../business/shared/batch-age.ts', import.meta.url).pathname)}; export const readBatchAge=(...args)=>globalThis.__batchAge(...args);`,
        loader: 'js',
        resolveDir: process.cwd(),
      }));
      api.onResolve({ filter: /inventory-light-plugins\/src\/data$/ }, () => ({
        path: 'stock',
        namespace: 'fixture',
      }));
      api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: 'export const queryStock=(query)=>globalThis.__stockAdaptationRead(query);',
        loader: 'js',
      }));
    },
  },
]);
function install(t) {
  const before = new Map(
    ['document', '__stockAdaptationRead', '__stockSummary', '__batchAge'].map((k) => [
      k,
      Object.getOwnPropertyDescriptor(globalThis, k),
    ]),
  );
  globalThis.document = { getElementById: (id) => (id === 'agent-sql-direct' ? {} : null) };
  globalThis.__stockAdaptationRead = async (query) => {
    if (['workbench-safety-stock-rows', 'workbench-scope'].includes(query.name))
      return stockFixture.rows;
    if (query.name === 'workbench-support-by-base')
      return [
        {
          'workbench.domain': 'order',
          'workbench.base': '郑州',
          'workbench.need_quantity': 100,
          'workbench.shortage_quantity': 20,
          'workbench.invalid': stockFixture.invalidOrders,
          'workbench.shipped_order_quantity': 60,
          'workbench.shipped_quantity': 55,
        },
      ];
    if (['workbench-order-structure', 'workbench-order-groups'].includes(query.name))
      return [
        {
          'workbench.base': '郑州',
          'workbench.category': '水饺',
          'workbench.material_code': 'A',
          'workbench.need_quantity': 100,
          'workbench.shortage_quantity': 20,
          'workbench.invalid': stockFixture.invalidOrders,
        },
      ];
    throw Object.assign(Error('not available'), { code: 'SOURCE_NOT_AVAILABLE' });
  };
  const month =
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()).slice(0, 7) +
    '-01';
  stockFixture.invalidOrders = 0;
  globalThis.__batchAge = async () => ({ rows: [], total: 0 });
  globalThis.__stockSummary = async (bases, options) => {
    const present = stockFixture.rows.some((r) => r['safety_stock.current_inventory'] !== null);
    if (options?.structure?.groupBy === 'base')
      return {
        scope: { targetMonth: month, versions: ['月初'] },
        groups: [
          {
            level: '郑州',
            row_count: 3,
            sku_count: 3,
            inventory: present ? 150 : null,
            inventory_count: present ? 2 : 0,
            over60_valid: 10,
            over60_valid_count: 2,
            stock_avg_30d_sale_valid: 5,
            stock_avg_30d_sale_valid_count: 2,
          },
        ],
      };
    return {
      scope: {
        targetMonth: month,
        targetMonthLabel: '2026年10月',
        versions: ['月初'],
        versionLabel: '月初',
        selectionRule: 'fixture',
      },
      day: month.slice(0, 7) + '-14',
      groups: [
        {
          base: '郑州',
          category: '水饺',
          row_count: 2,
          inventory: present ? 100 : null,
          inventory_count: present ? 1 : 0,
          inventory_complete: null,
          target: 100,
          target_count: 2,
          target_complete: 100,
          daily_demand: 15,
          daily_demand_count: 2,
          daily_demand_complete: 15,
          gap_count: present ? 1 : 0,
          gap: present ? 20 : null,
          turn_count: present ? 1 : 0,
          turn_inventory: present ? 100 : null,
          turn_target: present ? 80 : null,
          turn_demand: present ? 10 : null,
          stock_avg_30d_sale_valid: 3,
          stock_avg_30d_sale_valid_count: 1,
          over60_valid: 8,
          over60_valid_count: 1,
          over60_skus: 1,
        },
        {
          base: '郑州',
          category: '粽子',
          row_count: 1,
          inventory: present ? 50 : null,
          inventory_count: present ? 1 : 0,
          inventory_complete: present ? 50 : null,
          target: null,
          target_count: 0,
          target_complete: null,
          daily_demand: null,
          daily_demand_count: 0,
          daily_demand_complete: null,
          gap_count: 0,
          gap: null,
          turn_count: 0,
          turn_inventory: null,
          turn_target: null,
          turn_demand: null,
          stock_avg_30d_sale_valid: 2,
          stock_avg_30d_sale_valid_count: 1,
          over60_valid: 2,
          over60_valid_count: 1,
          over60_skus: 1,
        },
      ].map((r) =>
        options?.structure
          ? { ...r, level: r[options.structure.groupBy], sku_count: r.row_count }
          : r,
      ),
    };
  };
  stockFixture.rows = [
    {
      'safety_stock.base_name': '郑州',
      'safety_stock.material_code': 'A',
      'safety_stock.material_name': 'A',
      'safety_stock.product_categ_name': '水饺',
      'safety_stock.target_month': month,
      'safety_stock.inventory_version': '月初',
      'safety_stock.current_inventory': 100,
      'safety_stock.final_target_inventory': 80,
      'safety_stock.planned_daily_demand': 10,
      'safety_stock.observed_daily_sales': 3,
      'safety_stock.record_count': 1,
    },
    {
      'safety_stock.base_name': '郑州',
      'safety_stock.material_code': 'B',
      'safety_stock.material_name': 'B',
      'safety_stock.product_categ_name': '水饺',
      'safety_stock.target_month': month,
      'safety_stock.inventory_version': '月初',
      'safety_stock.current_inventory': null,
      'safety_stock.final_target_inventory': 20,
      'safety_stock.planned_daily_demand': 5,
      'safety_stock.observed_daily_sales': null,
      'safety_stock.record_count': 1,
    },
    {
      'safety_stock.base_name': '郑州',
      'safety_stock.material_code': 'C',
      'safety_stock.material_name': 'C',
      'safety_stock.product_categ_name': '粽子',
      'safety_stock.target_month': month,
      'safety_stock.inventory_version': '月初',
      'safety_stock.current_inventory': 50,
      'safety_stock.final_target_inventory': null,
      'safety_stock.planned_daily_demand': null,
      'safety_stock.observed_daily_sales': 2,
      'safety_stock.source': 'ai-db-stock-only',
      'safety_stock.record_count': 1,
    },
  ];
  stockFixture.rows[0]['safety_stock.over60_quantity'] = 8;
  stockFixture.rows[2]['safety_stock.over60_quantity'] = 2;
  t.after(() => {
    for (const [key, property] of before)
      property ? Object.defineProperty(globalThis, key, property) : delete globalThis[key];
  });
}

test('matched stock comparisons remain visible with explicit partial coverage instead of blanking the entire base', async (t) => {
  install(t);
  const w = await cube.loadInitialDashboard();
  assert.equal(w.workbench.cards[0].value, '150');
  assert.equal(w.workbench.cards[0].helpers[1].value, '20');
  assert.equal(w.workbench.cards[1].value, '10.0天');
  assert.equal(w.workbench.cards[1].helpers[0].value, '8.0天');
  assert.equal(w.workbench.cards[1].helpers[1].value, '2.0天');
  assert.equal(w.workbench.cards[3].value, '80.0%');
  assert.equal(w.record.riskLevel, 'unknown');
  assert.equal(w.table.rows[0].last30d, '5');
  const tabs = await cube.loadInventoryDashboardTabs(undefined, '郑州', undefined, '品类结构');
  assert.equal(tabs.品类结构.rows.find((r) => r.level === '水饺').current, '100');
  const seasonal = tabs.品类结构.rows.find((r) => r.level === '粽子');
  assert.equal(seasonal.current, '50');
  assert.equal(seasonal.target, '-');
  assert.equal(seasonal.last30d, '2');
});

test('missing all inventory or invalid monthly orders cannot turn into a zero inventory or a 100% fulfillment rate', async (t) => {
  install(t);
  stockFixture.rows.forEach((r) => (r['safety_stock.current_inventory'] = null));
  stockFixture.invalidOrders = 1;
  const w = await cube.loadInitialDashboard();
  assert.equal(w.workbench.cards[0].value, '-');
  assert.equal(w.workbench.cards[3].value, '-');
  const tabs = await cube.loadInventoryDashboardTabs(undefined, '郑州', undefined, '品类结构');
  assert.ok(tabs.品类结构.rows.every((r) => r.current === '-' && r.orderFillRate === '-'));
});

test('original age tab uses batch-weighted ages and complete buckets instead of fixed blanks', async (t) => {
  install(t);
  globalThis.__batchAge = async () => ({
    rows: [
      {
        level: '郑州',
        material_code: null,
        material_name: null,
        total_qty: 150,
        age_weight_qty: 150,
        average_age: 25.5,
        age0_30: 100,
        age31_40: 20,
        age41_60: 20,
        age60_plus: 10,
        future7: 5,
        future14: 15,
        daily_movement: 3,
        sku_count: 4,
        warning: '预警',
      },
    ],
    total: 1,
  });
  const tabs = await cube.loadInventoryDashboardTabs(undefined, undefined, undefined, '货龄结构');
  const row = tabs.货龄结构.rows[0];
  assert.equal(row.current, '150');
  assert.equal(row.averageAge, '25.5天');
  assert.equal(row.age0To30, '100 / 66.7%');
  assert.equal(row.age60Plus, '10 / 6.7%');
  assert.equal(row.future7, '5');
  assert.equal(row.future14, '15');
});

const production = (rows) =>
  deriveMetrics({
    start: '2026-10-01',
    end: '2026-10-15',
    granularity: 'month',
    sections: [{ id: 'production', status: 'ready', rows }],
  })['生产计划达成率'];
const output = (planned, actual) => ({
  planned,
  actual,
  invalid: 0,
  records: 1,
  source_basis: 'MES_QUANTITY',
  source_date: '20261014',
});
const { coveredStockComparison } = await load(
  '../dsh-agent-manage/src/inventory-compute/covered-stock-comparison.ts',
);
test('coverage uses intersecting SKU cohorts, preserves zero, and never divides unmatched sums', () => {
  const result = coveredStockComparison([
    { inventory: 100, target: 80, demand: 10 },
    { inventory: 1000, target: null, demand: 1000 },
    { inventory: null, target: 500, demand: 50 },
    { inventory: 20, target: 10, demand: null },
  ]);
  assert.equal(result.gap, 30);
  assert.equal(result.gapCovered, 2);
  assert.equal(result.turnover, 10);
  assert.equal(result.targetTurnover, 8);
  assert.equal(result.turnoverCovered, 1);
  assert.ok(result.gapPartial && result.turnoverPartial);
  const zero = coveredStockComparison([{ inventory: 0, target: 0, demand: 5 }]);
  assert.equal(zero.gap, 0);
  assert.equal(zero.turnover, 0);
  assert.equal(zero.turnoverPartial, false);
  assert.equal(coveredStockComparison([{ inventory: 0, target: 0, demand: 0 }]).turnover, null);
  assert.equal(coveredStockComparison([{ inventory: -1, target: 10, demand: 1 }]).gap, null);
});
test('MES production attainment is quantity-weighted and keeps a real zero distinct from missing', () => {
  assert.equal(production([output(100, 20), output(10, 10)]).value, (30 / 110) * 100);
  assert.equal(production([output(100, 0)]).value, 0);
  assert.equal(production([output(100, null)]).value, null);
  assert.equal(production([output(0, 0)]).value, null);
});
test('future schedules, duplicate MES keys and incomplete scopes do not generate production achievements', () => {
  for (const rows of [
    [{ planned: 100, records: 1 }],
    [{ ...output(100, 20), invalid: 1 }],
    [{ ...output(100, 20), source_basis: 'FUTURE_SCHEDULE' }],
    [output(100, 20), { ...output(1, 1), records: null }],
  ])
    assert.equal(production(rows).value, null);
});

const { productHierarchy, sourceDateLabel } = await load(
  'business/inventory-apsplan/source/app/data/product-hierarchy.ts',
);
const { classifiedStockObservation } = await load(
  '../dsh-agent-manage/src/aps-compute/classified-stock.ts',
);
const { metricValues } = await load('../dsh-agent-manage/src/aps-compute/adapter.ts');
const drillData = {
  start: '2026-10-01',
  end: '2026-10-15',
  granularity: 'month',
  sections: [
    {
      id: 'stock',
      status: 'ready',
      rows: [
        {
          base: '华东',
          category: '饺子',
          item: '水饺',
          material: '大馅水饺',
          inventory: 20000,
          source_date: '2026-10-14',
        },
        {
          base: '华东',
          category: null,
          item: '水饺',
          material: null,
          inventory: 3000,
          source_date: '2026-10-14',
        },
        {
          base: '华南',
          category: '粽子',
          item: '端午',
          material: '鲜肉粽',
          inventory: 1000,
          source_date: '20261013',
        },
      ],
    },
    {
      id: 'orders',
      status: 'ready',
      rows: [{ base: '华东', category: '饺子', demand: 100, shortage: 5, invalid: 0 }],
    },
    {
      id: 'orders-products',
      status: 'ready',
      rows: [
        {
          base: '华东',
          category: '饺子',
          item: '水饺',
          material: '大馅水饺',
          demand: 100,
          shortage: 5,
          invalid: 0,
        },
      ],
    },
    {
      id: 'failed',
      status: 'error',
      rows: [{ base: '华东', category: '旧演示品类', item: '旧品项' }],
    },
  ],
};
test('live drill-down uses actual category/item/material hierarchy and base membership, without stale demo names', () => {
  assert.deepEqual(productHierarchy(drillData, '华东'), [
    { name: '饺子', items: [{ name: '水饺', materials: ['大馅水饺'] }] },
  ]);
  assert.deepEqual(productHierarchy(null), []);
  assert.equal(sourceDateLabel(drillData, 'stock'), '2026-10-14');
  assert.equal(sourceDateLabel(drillData, 'failed'), '—');
});
test('classified stock is a labeled observation, not a replacement for complete metrics; dimensions retain their meaning', () => {
  const scope = { base: '华东', category: '饺子', item: '水饺', material: '大馅水饺' };
  assert.deepEqual(classifiedStockObservation(drillData, scope), {
    value: 2,
    matchedRows: 1,
    unknownRows: 1,
  });
  assert.ok(Number.isNaN(metricValues(drillData, scope)['库存量']));
  assert.equal(metricValues(drillData, scope)['订单满足率'], 95);
  assert.equal(classifiedStockObservation(drillData, { base: '华东' }), null);
  assert.equal(classifiedStockObservation(drillData, { category: '水饺' }), null);
  assert.equal(classifiedStockObservation(drillData, { base: '华南', category: '粽子' }), null);
  const bad = structuredClone(drillData);
  bad.sections[0].rows[0].inventory = null;
  assert.equal(classifiedStockObservation(bad, scope), null);
  bad.sections[0].rows[0].inventory = 0;
  assert.equal(classifiedStockObservation(bad, scope).value, 0);
  bad.sections[0].status = 'error';
  assert.equal(classifiedStockObservation(bad, scope), null);
});

test('accuracy identifies zero adjusted plans instead of presenting a generic development placeholder', () => {
  const metrics = deriveMetrics({
    start: '2026-10-01',
    end: '2026-10-15',
    granularity: 'month',
    sections: [
      {
        id: 'demand-accuracy',
        status: 'ready',
        rows: [
          {
            month: '2026-10-01',
            initial_plan: 100,
            adjusted_plan: 0,
            initial_deviation: 30,
            adjusted_deviation: 20,
            actual: 20,
            invalid: 0,
            missing_actual: 0,
          },
        ],
      },
    ],
  });
  assert.equal(metrics['需求预测准确率'].value, null);
  assert.match(metrics['需求预测准确率'].note, /调整计划合计为0/);
  assert.equal(metrics['需求预测达成率'].value, null);
});

const directWorkspaceCalls = [];
const directWorkspace = await load('business/inventory-apsplan/source/app/data/gea-workspace.ts', [
  {
    name: 'direct-workspace-fixture',
    setup(api) {
      api.onResolve({ filter: /shared\/workspace-query$/ }, () => ({
        path: 'read',
        namespace: 'direct-fixture',
      }));
      api.onLoad({ filter: /.*/, namespace: 'direct-fixture' }, () => ({
        contents:
          'export const readWorkspaceQuery=(_config,name,values)=>globalThis.__apsDirectRead(name,values);',
        loader: 'js',
      }));
    },
  },
]);
test('MES production is prioritized with core cards and read for both comparison periods in direct mode', async (t) => {
  const before = new Map(
    ['document', '__apsDirectRead'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  globalThis.document = { getElementById: (id) => (id === 'agent-sql-direct' ? {} : null) };
  globalThis.__apsDirectRead = async (name, values) => {
    directWorkspaceCalls.push({ name, start: values.start });
    return [];
  };
  t.after(() => {
    for (const [key, prop] of before)
      prop ? Object.defineProperty(globalThis, key, prop) : delete globalThis[key];
  });
  const run = directWorkspace.createGeaWorkspace(() => {
    throw Error('no gateway fallback');
  });
  const input = { date: '2026-10-15', granularity: 'month', version: '滚动', orderType: 'M' };
  await run({ ...input, stage: 'primary' });
  assert.deepEqual(
    directWorkspaceCalls.slice(0, 3).map((call) => call.name),
    ['stock', 'orders-month', 'production'],
  );
  directWorkspaceCalls.length = 0;
  await run({ ...input, comparison: true });
  assert.deepEqual(
    directWorkspaceCalls.filter((call) => call.name === 'production').map((call) => call.start),
    ['2026-09-01', '2025-10-01'],
  );
});

test('category dashboard never fetches all SKU rows just to aggregate categories', async (t) => {
  install(t);
  const original = globalThis.__stockAdaptationRead;
  const calls = [];
  globalThis.__stockAdaptationRead = (q) => {
    calls.push(q.name);
    return original(q);
  };
  const tabs = await cube.loadInventoryDashboardTabs(undefined, '郑州', undefined, '品类结构');
  assert.ok(tabs.品类结构.rows.length > 0);
  assert.ok(
    !calls.includes('workbench-safety-stock-rows'),
    'category view unnecessarily reads all SKU details',
  );
  assert.ok(
    !calls.includes('workbench-order-structure'),
    'category view unnecessarily reads order SKU details',
  );
});
