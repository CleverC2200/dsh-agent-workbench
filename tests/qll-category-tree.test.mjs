import { sourceDetailConfig } from './fixtures/source-detail-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const config = sourceDetailConfig(
  JSON.parse(await readFile('business/inventory-qll/sql.config.json', 'utf8')),
);
const output = await build({
  entryPoints: ['business/shared/qll-category-tree.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { categorySummary, categoryTreeReader, treeRatio } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);

test('company categories combine quantities and weights without adding channel stock or averaging layer means', () => {
  const row = (inventory, age_qty, age_sum) => ({
    node_key: '汤圆',
    inventory,
    age_qty,
    age_sum,
    overaged: 0,
    risk_rank: 8,
  });
  const result = categorySummary('汤圆', {
    base: [row(100, 100, 1000)],
    branch: [row(900, 900, 27000)],
    customer: [row(500, 500, 50000)],
  });
  assert.equal(result.inventory, 1000);
  assert.equal(result.customer_inventory, 500);
  assert.equal(treeRatio(result.age_sum, result.age_qty), 28);
  assert.equal(categorySummary('汤圆', { base: [row(100, 100, 1000)] }).inventory, null);
  assert.equal(categorySummary('汤圆', { base: [row(100, 100, 1000)], branch: [] }).inventory, 100);
});
test('company category turnover combines base and branch quantities and movement before dividing', () => {
  const result = categorySummary('汤圆', {
    base: [{ node_key: '汤圆', inventory: 100, turnover_qty: 100, daily: 10 }],
    branch: [{ node_key: '汤圆', inventory: 900, turnover_qty: 900, daily: 30 }],
    customer: [{ node_key: '汤圆', inventory: 500, turnover_qty: 500, daily: 100 }],
  });
  assert.equal(result.turnover_qty, 1000);
  assert.equal(result.daily, 40);
  assert.equal(treeRatio(result.turnover_qty, result.daily), 25);
  const unavailable = categorySummary('汤圆', {
    base: [{ node_key: '汤圆', turnover_qty: 100, daily: 10 }],
  });
  assert.equal(treeRatio(unavailable.turnover_qty, unavailable.daily), null);
});
test('leaf requests use exact parents, bound search/risk, ten visible rows and an eleventh lookahead', async () => {
  const calls = [];
  const read = categoryTreeReader(config, async (request, options) => {
    calls.push(options);
    const columns = config.queries[options.queryId].resultColumns;
    return {
      rows: Array.from({ length: 11 }, (_, i) =>
        Object.fromEntries(columns.map((c) => [c, c === 'node_key' ? String(i) : null])),
      ),
      returnedColumns: columns,
      rejectedColumns: [],
      configVersion: 'test',
    };
  });
  const result = await read(
    'base',
    {
      date: '2026-11-01',
      snapshot: '2026-10-31',
      level: 'sku',
      category: '汤圆',
      organization: '郑州',
      page: 2,
      search: '100%',
      risk: '1',
    },
    new AbortController().signal,
  );
  assert.equal(result.rows.length, 10);
  assert.equal(result.hasNext, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(
    Object.fromEntries(
      [
        'parent_category',
        'parent_organization',
        'tree_search',
        'tree_risk',
        'offset',
        'page_size',
        'stock_month',
        'order_start',
        'order_end_exclusive',
      ].map((k) => [k, calls[0].values[k]]),
    ),
    {
      parent_category: '汤圆',
      parent_organization: '郑州',
      tree_search: '%100\\%%',
      tree_risk: '1',
      offset: 10,
      page_size: 11,
      stock_month: '2026-10-01',
      order_start: '2026-11-01',
      order_end_exclusive: '2026-11-02',
    },
  );
});
test('hierarchy uses distinct branch codes and province keys, aggregates before leaf risk filtering', () => {
  const branch = config.queries['category-tree.branch'].request.sql;
  const customer = config.queries['category-tree.customer'].request.sql;
  assert.match(branch, /b\.warehouse_classify = '20'/);
  assert.match(branch, /r\.warehouseid AS organization/);
  assert.match(customer, /r\.province AS organization/);
  for (const layer of ['base', 'branch', 'customer']) {
    const sql = config.queries[`category-tree.${layer}`].request.sql;
    assert.match(sql, /HAVING \(:gea_p9100 <> 'sku'/);
    assert.match(sql, /LIMIT :gea_p9105 OFFSET :gea_p9106$/);
    assert.doesNotMatch(sql, /OVER\s*\(/i);
  }
});

test('category snapshots reuse the card read and keep base and branch dates independent', async () => {
  const calls = [];
  const execute = async (_request, options) => {
    calls.push(options);
    const columns = config.queries[options.queryId].resultColumns;
    if (options.queryId === 'overview.quick-stock') {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        rows: ['基地', '分仓'].map((location_type, i) => ({
          ...Object.fromEntries(columns.map((c) => [c, 0])),
          location_type,
          snapshot_date: i ? '2026-10-30' : '2026-10-31',
        })),
        returnedColumns: columns,
        rejectedColumns: [],
        configVersion: 'test',
      };
    }
    return { rows: [], returnedColumns: columns, rejectedColumns: [], configVersion: 'test' };
  };
  const read = categoryTreeReader(config, execute);
  const [base, branch] = await Promise.all(
    ['base', 'branch'].map((layer) =>
      read(layer, { date: '2026-11-01', level: 'category' }, new AbortController().signal),
    ),
  );
  assert.equal(base.snapshot, '2026-10-31');
  assert.equal(branch.snapshot, '2026-10-30');
  assert.equal(calls.filter((c) => c.queryId === 'overview.quick-stock').length, 1);
  assert.equal(
    calls.some((c) => c.queryId.startsWith('source.')),
    false,
  );
  assert.equal(
    calls.find((c) => c.queryId === 'category-tree.base').values.stock_date,
    '2026-10-31',
  );
  assert.equal(
    calls.find((c) => c.queryId === 'category-tree.branch').values.stat_date,
    '2026-10-30',
  );
});

test('branch category requests actual movement through the requested day without moving stock age forward', async () => {
  let values;
  const read = categoryTreeReader(config, async (_request, options) => {
    values = options.values;
    return {
      rows: [],
      returnedColumns: config.queries[options.queryId].resultColumns,
      rejectedColumns: [],
      configVersion: 'test',
    };
  });
  await read(
    'branch',
    { date: '2026-11-05', snapshot: '2026-11-04', level: 'category' },
    new AbortController().signal,
  );
  assert.equal(values.stat_date, '2026-11-04');
  assert.equal(values.batch_rolling_start, '20261007');
  assert.equal(values.batch_end_exclusive, '20261106');
});

test('base SKU drilldown stays on its authorized materialized rows instead of entering the raw order pool', async () => {
  const daily = JSON.parse(await readFile('business/inventory-qll/sql.config.json', 'utf8'));
  const calls = [];
  const read = categoryTreeReader(daily, async (_request, options) => {
    calls.push(options);
    const columns = daily.queries[options.queryId].resultColumns;
    if (options.queryId === 'summary.bootstrap')
      return {
        rows: [
          {
            batch_id: 'batch',
            business_date: '2026-11-05',
            stock_date: '2026-11-04',
            target_month: '2026-11-01',
          },
        ],
        returnedColumns: columns,
        rejectedColumns: [],
        configVersion: 'fixed',
      };
    if (options.queryId === 'snapshot.calendar.target_versions')
      return {
        rows: [{ month: '2026-11-01', inventory_version: '月初' }],
        returnedColumns: columns,
        rejectedColumns: [],
        configVersion: 'fixed',
      };
    assert.equal(
      options.queryId,
      'snapshot.category-tree.base',
      'drilldown must retain the summary route',
    );
    return {
      rows: [Object.fromEntries(columns.map((c) => [c, c === 'node_key' ? 'SKU' : null]))],
      returnedColumns: columns,
      rejectedColumns: [],
      configVersion: 'fixed',
    };
  });
  const result = await read(
    'base',
    {
      date: '2026-11-05',
      snapshot: '2026-11-04',
      level: 'sku',
      category: '馄饨',
      organization: '华南',
    },
    new AbortController().signal,
  );
  assert.equal(result.rows.length, 1);
  const values = calls.at(-1).values;
  assert.equal(values.bases_enabled, true);
  assert.deepEqual(values.bases, ['华南']);
  assert.equal(values.order_bases_enabled, false);
});

test('latest published company snapshot keeps a later as-of read out of raw permission scopes', async () => {
  const daily = JSON.parse(await readFile('business/inventory-qll/sql.config.json', 'utf8'));
  delete daily.dailySummary.bundle;
  const calls = [];
  const read = categoryTreeReader(daily, async (_request, options) => {
    calls.push(options);
    const columns = daily.queries[options.queryId].resultColumns;
    if (options.queryId === 'summary.snapshot')
      return {
        rows: [
          {
            batch_id: 'inventory_20261106194224000000',
            business_date: '2026-11-06',
            stock_date: '2026-11-06',
            target_month: '2026-11-01',
          },
        ],
        returnedColumns: columns,
        rejectedColumns: [],
        configVersion: 'fixed',
      };
    if (options.queryId === 'snapshot.overview.quick-stock')
      return {
        rows: [
          {
            location_type: '基地',
            snapshot_date: '2026-11-06',
            row_count: 1,
            total_qty: 100,
            available_qty: 80,
            pack_unit_qty: 1,
            freeze_qty: 0,
          },
        ],
        returnedColumns: columns,
        rejectedColumns: [],
        configVersion: 'fixed',
      };
    if (options.queryId === 'snapshot.calendar.target_versions')
      return {
        rows: [{ month: '2026-11-01', inventory_version: '月初' }],
        returnedColumns: columns,
        rejectedColumns: [],
        configVersion: 'fixed',
      };
    assert.equal(
      options.queryId,
      'snapshot.category-tree.base',
      'a covered stock batch must not query raw orders at a different cutoff',
    );
    return {
      rows: [
        Object.fromEntries(
          columns.map((c) => [c, c === 'node_key' ? '汤圆' : c === 'inventory' ? 100 : null]),
        ),
      ],
      returnedColumns: columns,
      rejectedColumns: [],
      configVersion: 'fixed',
    };
  });
  const result = await read(
    'base',
    { date: '2026-11-09', level: 'category' },
    new AbortController().signal,
  );
  assert.equal(result.rows[0].inventory, 100);
  assert.equal(result.readDate, '2026-11-06');
  const values = calls.at(-1).values;
  assert.equal(values.stock_date, '2026-11-06');
  assert.equal(values.order_end_exclusive, '2026-11-07');
  assert.equal(values.shipment_end_exclusive, '20261107');
  assert.equal(values.rolling_start, '20261008');
  assert.equal(values.inventory_version, '月初');
});
