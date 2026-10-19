import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const output = await build({
  entryPoints: ['business/shared/configured-facts.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readConfiguredFacts, factMetric } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
const configs = Object.fromEntries(
  await Promise.all(
    ['fc', 'qll', 'dealer'].map(async (id) => [
      id,
      JSON.parse(await readFile(`business/inventory-${id}/sql.config.json`, 'utf8')),
    ]),
  ),
);
for (const config of Object.values(configs))
  for (const q of Object.values(config.queries)) if (q.pagination) delete q.pagination.atomicQuery;
const input = { asOf: '2026-10-15', customer: '20141461' };
function source(config, adapt = () => {}) {
  const calls = [];
  const execute = async (_request, call) => {
    calls.push(call);
    const q = config.queries[call.queryId];
    const result = {
      rows: [Object.fromEntries(q.resultColumns.map((c) => [c, null]))],
      returnedColumns: q.resultColumns,
      rejectedColumns: [],
      configVersion: 'one',
    };
    if (q.resultColumns.includes('total')) result.rows = [{ total: 1 }];
    if (call.queryId === 'source.stock-date') result.rows = [{ day: '2026-10-14' }];
    if (['source.health-date', 'source.branch-stock-date'].includes(call.queryId))
      result.rows = [{ day: '2026-10-15' }];
    await adapt(call, result, calls);
    return result;
  };
  return { execute, calls };
}

test('missing stock or age domains and unselected customer do not query a substitute source', async () => {
  const execute = () => {
    throw Error('must not execute');
  };
  for (const [agent, view] of [['fc', 'inventory']]) {
    const unavailable = structuredClone(configs[agent]);
    unavailable.sourceViews.views.find((v) => v.id === view).queryId = null;
    const result = await readConfiguredFacts(unavailable, view, input, { execute });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.total, null);
  }
  const r = await readConfiguredFacts(configs.dealer, 'orders', { asOf: input.asOf }, { execute });
  assert.equal(r.status, 'select_customer');
  assert.equal(r.total, null);
});

test('FC reads explicit branch orders; dealer reads the exact selected customer without a trusted-identity claim', async () => {
  const fc = source(configs.fc);
  await readConfiguredFacts(configs.fc, 'orders', input, fc);
  const branch = fc.calls.find((c) => c.queryId === 'orders.detail');
  assert.equal(branch.values.pickup_type, '分仓');
  assert.equal(branch.values.pickup_type_mode, 'equal');
  const dealer = source(configs.dealer);
  const result = await readConfiguredFacts(configs.dealer, 'orders', input, dealer);
  const order = dealer.calls.find((c) => c.queryId === 'orders.detail');
  assert.equal(order.values.customer, input.customer);
  assert.equal(order.values.customer_mode, 'equal');
  assert.equal(order.values.end_exclusive, '2026-10-16');
  assert.equal(result.trusted, undefined);
});

test('month cost uses next month, stock reads the available snapshot, health respects its separate date', async () => {
  const io = source(configs.fc);
  await readConfiguredFacts(configs.fc, 'cost', input, io);
  const cost = io.calls.find((c) => c.queryId === 'branch_cost.detail');
  assert.equal(cost.values.start, '202610');
  assert.equal(cost.values.end_exclusive, '202611');
  await readConfiguredFacts(configs.fc, 'base', input, io);
  assert.equal(
    io.calls.find((c) => c.queryId === 'inventory.detail').values.stock_date,
    '2026-10-14',
  );
  await readConfiguredFacts(configs.fc, 'health', input, io);
  assert.equal(io.calls.find((c) => c.queryId === 'health.detail').values.stat_date, '2026-10-15');
});

test('customer monthly plan binds selected customer and date on every ten-row page', async () => {
  const io = source(configs.dealer, (call, result) => {
    if (call.queryId === 'sales_plan.count') result.rows = [{ total: 25 }];
    if (call.queryId === 'sales_plan.detail')
      result.rows = Array.from({ length: 10 }, (_, i) => ({
        ...result.rows[0],
        sku: String(call.values.offset + i),
      }));
  });
  for (const page of [1, 2]) {
    const result = await readConfiguredFacts(
      configs.dealer,
      'customer-plan',
      { asOf: '2026-09-30', customer: 'customer-A', page },
      io,
    );
    assert.equal(result.rows.length, 10);
  }
  const reads = io.calls.filter((c) => c.queryId === 'sales_plan.detail');
  assert.deepEqual(
    reads.map((c) => c.values.offset),
    [0, 10],
  );
  for (const call of reads) {
    assert.equal(call.values.customer, 'customer-A');
    assert.equal(call.values.customer_mode, 'equal');
    assert.equal(call.values.start, '2026-09-01');
    assert.equal(call.values.end_exclusive, '2026-10-01');
    assert.equal(call.values.page_size, 10);
  }
});

test('summary failure leaves the independently validated detail page available, without retry or other sources', async () => {
  const io = source(configs.qll, (call) => {
    if (call.queryId === 'orders.summary')
      throw Object.assign(Error('denied'), {
        code: 'AI_GATEWAY_DATA_PERMISSION_DENIED',
        failure: { reasonCode: 'NO_RETURN_COLUMN_ALLOWED' },
      });
  });
  const result = await readConfiguredFacts(configs.qll, 'orders', input, io);
  assert.equal(result.rows.length, 1);
  assert.equal(result.summary, null);
  assert.equal(result.summaryError.code, 'AI_GATEWAY_DATA_PERMISSION_DENIED');
  assert.equal(result.summaryError.failure.reasonCode, 'NO_RETURN_COLUMN_ALLOWED');
  assert.equal(io.calls.filter((c) => c.queryId === 'orders.summary').length, 1);
  assert.ok(io.calls.every((c) => c.queryId.startsWith('orders.')));
});

test('permission-rejected detail columns are not replaced with null-filled successful rows', async () => {
  const io = source(configs.fc, (call, r) => {
    if (call.queryId === 'transfer_plan.detail') r.rejectedColumns = ['month_out_plan'];
  });
  await assert.rejects(
    readConfiguredFacts(configs.fc, 'plan', input, io),
    (e) => e.code === 'REQUIRED_COLUMN_UNAVAILABLE' && e.rejectedColumns.includes('month_out_plan'),
  );
});

test('changing counts or config version rejects inconsistent pages instead of showing a mixed total', async () => {
  for (const type of ['count', 'config']) {
    const io = source(configs.fc, (call, r, calls) => {
      if (type === 'count' && calls.filter((c) => c.queryId === 'transfer_plan.count').length === 2)
        r.rows = [{ total: 2 }];
      if (type === 'config' && call.queryId === 'transfer_plan.detail') r.configVersion = 'two';
    });
    await assert.rejects(readConfiguredFacts(configs.fc, 'plan', input, io), {
      code: type === 'count' ? 'SOURCE_CHANGED' : 'QUERY_CONFIG_CHANGED',
    });
  }
});

test('invalid dates, future snapshots, unsupported filters and malformed pagination fail closed', async () => {
  const io = source(configs.qll, (call, r) => {
    if (call.queryId === 'source.stock-date') r.rows = [{ day: '2026-11-01' }];
  });
  await assert.rejects(readConfiguredFacts(configs.qll, 'base', input, io), {
    code: 'INVALID_SOURCE_DATE',
  });
  for (const value of [{ asOf: '2026-02-30' }, { page: 0 }, { filters: { principalId: 'fake' } }])
    await assert.rejects(readConfiguredFacts(configs.qll, 'orders', { ...input, ...value }, io));
});

test('zero is known while empty or partial aggregate quantities remain unknown', () => {
  const metric = { field: 'stock', missing: 'missing_stock' };
  assert.equal(factMetric({ stock: '0', missing_stock: 0 }, metric), 0);
  for (const summary of [null, { stock: null }, { stock: '' }, { stock: 40, missing_stock: 1 }])
    assert.equal(factMetric(summary, metric), null);
});

test('customer policy query requires customer scope, with bound SKU and no unscoped policy load', () => {
  const view = configs.dealer.sourceViews.views.find((v) => v.id === 'policies');
  assert.equal(view.requiresCustomer, true);
  const query = configs.dealer.queries[view.queryId];
  assert.match(query.request.sql, /t\.cust_code\s*=\s*:gea_p1/);
  assert.equal(query.parameterSpec.gea_p1.nullable, false);
  assert.equal(query.parameterSpec.gea_p1.name, 'customer');
});

test('new source views do not silently switch to a database when GEA transport is absent', async () => {
  await assert.rejects(readConfiguredFacts(configs.fc, 'plan', input), {
    code: 'PAGE_CHANNEL_UNAVAILABLE',
  });
});

test('every displayed field and source gap is declared in that Agent configuration', () => {
  for (const config of Object.values(configs))
    for (const view of config.sourceViews.views) {
      if (view.queryId) {
        const columns = config.queries[view.queryId].resultColumns;
        assert.ok(
          view.columns.every(
            (c) =>
              columns.includes(c.field) ||
              (c.unavailable === true && c.field.startsWith('missing_')) ||
              (c.context === 'stock_date' && c.field === 'stock_date') ||
              (c.context === 'layer_label' && c.field === 'layer_label' && c.value === '基地'),
          ),
          view.id,
        );
        if (view.summaryId)
          assert.ok(
            view.metrics.every((m) =>
              config.queries[view.summaryId].resultColumns.includes(m.field),
            ),
            view.id,
          );
      }
      assert.ok(
        (view.gapIds ?? []).every((id) => config.fieldGaps.some((g) => g.id === id)),
        view.id,
      );
    }
});

test('default list reads only ten rows and changing page issues a new bounded query', async () => {
  const io = source(configs.qll, (call, result) => {
    if (call.queryId === 'orders.count') result.rows = [{ total: 25 }];
    if (call.queryId === 'orders.detail')
      result.rows = Array.from(
        { length: Math.min(call.values.page_size, 25 - call.values.offset) },
        (_, i) => ({ ...result.rows[0], sku: String(call.values.offset + i) }),
      );
  });
  const first = await readConfiguredFacts(configs.qll, 'orders', input, io);
  const next = await readConfiguredFacts(configs.qll, 'orders', { ...input, page: 2 }, io);
  assert.equal(first.rows.length, 10);
  assert.equal(next.rows.length, 10);
  assert.notEqual(first.rows[0].sku, next.rows[0].sku);
  assert.deepEqual(
    io.calls
      .filter((c) => c.queryId === 'orders.detail')
      .map((c) => [c.values.page_size, c.values.offset]),
    [
      [10, 0],
      [10, 10],
    ],
  );
});

test('literal search does not expand percent, underscore or backslash into unintended matches', async () => {
  const io = source(configs.dealer);
  await readConfiguredFacts(
    configs.dealer,
    'customer',
    { ...input, filters: { search: 'A%_\\B' } },
    io,
  );
  for (const call of io.calls)
    if ('search_pattern' in call.values) assert.equal(call.values.search_pattern, '%A\\%\\_\\\\B%');
});

test('empty filters verify the count again without reading unnecessary detail or summaries', async () => {
  for (const agent of ['fc', 'qll']) {
    const io = source(configs[agent], (call, r) => {
      if (call.queryId === 'inventory.count') r.rows = [{ total: 0 }];
      if (call.queryId === 'inventory.detail') r.rows = [];
    });
    const result = await readConfiguredFacts(
      configs[agent],
      'base',
      { ...input, filters: { sku: 'not-present' } },
      io,
    );
    assert.equal(result.status, 'empty');
    assert.equal(result.total, 0);
    assert.deepEqual(result.rows, []);
    assert.deepEqual(
      io.calls.map((c) => c.queryId),
      ['source.stock-date', 'inventory.count', 'inventory.count'],
    );
  }
});

test('base category and item filters reach both detail and full-scope summaries', async () => {
  for (const agent of ['fc', 'qll']) {
    const io = source(configs[agent]);
    await readConfiguredFacts(
      configs[agent],
      'base',
      { ...input, filters: { base: '郑州', category: '饺子', item: '水饺' } },
      io,
    );
    for (const c of io.calls.filter((c) => c.queryId.startsWith('inventory.'))) {
      assert.deepEqual(c.values.bases, ['郑州']);
      assert.equal(c.values.category_mode, 'equal');
      assert.equal(c.values.category, '饺子');
      assert.equal(c.values.item_mode, 'equal');
      assert.equal(c.values.item, '水饺');
    }
  }
});

test('a zero count is not accepted if the source changes before the confirmation count', async () => {
  const io = source(configs.fc, (call, r, calls) => {
    if (call.queryId === 'inventory.count')
      r.rows = [
        { total: calls.filter((c) => c.queryId === 'inventory.count').length === 1 ? 0 : 1 },
      ];
  });
  await assert.rejects(readConfiguredFacts(configs.fc, 'base', input, io), {
    code: 'SOURCE_CHANGED',
  });
});

test('branch shipment windows retain the whole month plus exactly thirty calendar days across leap and year boundaries', async () => {
  for (const [asOf, start, rolling, end, month] of [
    ['2026-10-31', '20261001', '20261002', '20261101', '20261001'],
    ['2026-01-01', '20251203', '20251203', '20260102', '20260101'],
    ['2028-03-01', '20280201', '20280201', '20280302', '20280301'],
  ]) {
    const io = source(configs.fc);
    await readConfiguredFacts(configs.fc, 'shipments', { asOf }, io);
    const values = io.calls.find((c) => c.queryId === 'branch_shipments.detail').values;
    assert.deepEqual(
      [
        values.shipment_start,
        values.rolling_start,
        values.shipment_end_exclusive,
        values.shipment_month_start,
      ],
      [start, rolling, end, month],
    );
    assert.equal(values.page_size, 10);
  }
});

test('new branch inventory binds its own snapshot and warehouse type', async () => {
  const io = source(configs.fc);
  const r = await readConfiguredFacts(configs.fc, 'branch-stock', input, io);
  assert.equal(r.snapshotDate, '2026-10-15');
  const call = io.calls.find((c) => c.queryId === 'health.detail');
  assert.equal(call.values.warehouse_type, '分仓');
  assert.equal(call.values.warehouse_type_mode, 'equal');
  assert.equal(call.values.stat_date, '2026-10-15');
});
