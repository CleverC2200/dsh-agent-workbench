import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addOperationsQueries,
  operationsDatasets,
  operationsPacketDatasets,
  operationsPacketSize,
} from '../business/inventory-orderfulfillment/operations-queries.mjs';
import {
  createOperationsReader,
  operationsValues,
} from '../prototypes/inventory-orderfulfillment/operations-data.mjs';
import { makeRequest } from '../business/shared/configured-query-client.mjs';
import { bucketOrderAges } from '../prototypes/inventory-orderfulfillment/operations-model.mjs';
import { operationPackets } from './helpers/operations-packets.mjs';

const config = addOperationsQueries({ agentId: 'inventory-orderfulfillment', queries: {} });
const filters = {
  month: '2026-11-01',
  today: '2026-11-25',
  plan_end: '2026-12-01',
  basis: '销售口径',
  base: null,
  region: null,
  province: null,
  sales_group: null,
};
const response = (id, rows, extra = {}) => ({
  rows,
  returnedColumns: config.queries[id].resultColumns,
  rejectedColumns: [],
  configVersion: 'v1',
  ...extra,
});

test('dashboard complete reads use 200-row batches and only boundary counts while retaining stable keys', async () => {
  const rows = Array.from({ length: 601 }, (_, index) => ({
    ...Object.fromEntries(operationsDatasets['plan.sku'].columns.map((key) => [key, null])),
    base: '郑州',
    sku: String(index),
    material_name: 'SKU',
  }));
  const calls = [];
  const fallback = structuredClone(config);
  delete fallback.queries['operations.plan.sku.packets'];
  const reader = createOperationsReader(fallback, async (_request, options) => {
    calls.push(options);
    return response(
      options.queryId,
      options.queryId.endsWith('.count')
        ? [{ total: rows.length }]
        : rows.slice(options.values.offset, options.values.offset + options.values.page_size),
    );
  });
  const result = await reader('plan.sku', filters, { complete: true });
  assert.equal(result.rows.length, 601);
  assert.equal(result.size, undefined);
  assert.equal(calls.filter((call) => call.queryId.endsWith('.count')).length, 2);
  assert.ok(
    calls
      .filter((call) => !call.queryId.endsWith('.count'))
      .every((call) => call.values.page_size === 200),
  );
  assert.equal(new Set(result.rows.map((row) => row.sku)).size, 601);
  assert.equal(calls.length, 7);
  calls.length = 0;
  const paged = [];
  for (let page = 1; page <= Math.ceil(rows.length / 50); page++) {
    const result = await reader('plan.sku', filters, { page });
    paged.push(...result.rows);
  }
  assert.equal(calls.length, 39);
  assert.deepEqual(result.rows, paged);
});

test('packed complete reads use one statement and reject missing, duplicate, oversized and denied inputs', async () => {
  const columns = operationsDatasets['plan.sku'].columns;
  const rows = Array.from({ length: operationsPacketSize * 2 + 89 }, (_, index) =>
    Object.fromEntries(
      columns.map((key) => [
        key,
        key === 'base'
          ? '郑州'
          : key === 'sku'
            ? String(index)
            : key === 'material_name'
              ? '水饺：测试\n商品'
              : null,
      ]),
    ),
  );
  const id = 'operations.plan.sku.packets',
    packets = operationPackets(rows, columns),
    calls = [];
  const read = (payload) =>
    createOperationsReader(config, async (_request, options) => {
      calls.push(options.queryId);
      return response(id, payload);
    });
  const result = await read(packets)('plan.sku', filters, { complete: true });
  assert.deepEqual(result.rows, rows);
  assert.deepEqual(calls, [id]);
  for (const incomplete of [
    packets.slice(1),
    [packets[0], packets[0], ...packets.slice(1)],
    packets.map((p) => ({ ...p, packet_scope_total: '30001' })),
  ])
    await assert.rejects(read(incomplete)('plan.sku', filters, { complete: true }), /不完整/);
  const denied = createOperationsReader(config, async () =>
    response(id, packets, { rejectedColumns: ['material_name'] }),
  );
  await assert.rejects(denied('plan.sku', filters, { complete: true }), /授权|PERMISSION/);
});
test('the largest supported order-detail read fits a 50-result-row configured transport without losing any records', async () => {
  const dataset = operationsDatasets['orders.facts'];
  const rows = Array.from({ length: 30000 }, (_, index) =>
    Object.fromEntries(
      dataset.columns.map((key) => [
        key,
        key === 'executeorderno'
          ? 'E' + index
          : key === 'executeorderlineno'
            ? '1'
            : key === 'cust_name'
              ? '中文客户'
              : null,
      ]),
    ),
  );
  const packets = operationPackets(rows, dataset.columns);
  const reader = createOperationsReader(config, async () =>
    response('operations.orders.facts.packets', packets.slice(0, 50)),
  );
  const result = await reader('orders.facts', filters, { complete: true });
  assert.deepEqual(result.rows, rows);
  assert.equal(result.rows.length, 30000);
  const incomplete = createOperationsReader(config, async () =>
    response('operations.orders.facts.packets', packets.slice(0, -1)),
  );
  await assert.rejects(incomplete('orders.facts', filters, { complete: true }), /不完整/);
});

test('operations SQL separates plan basis, current snapshots and production units using registered read-only parameters', () => {
  assert.equal(
    Object.keys(config.queries).length,
    Object.keys(operationsDatasets).length * 2 + operationsPacketDatasets.size,
  );
  for (const [id, query] of Object.entries(config.queries)) {
    const request = makeRequest(
      config,
      id,
      operationsValues(config, id, { ...filters, page_size: 50, offset: 0 }),
    );
    assert.match(request.sql, /^(SELECT|WITH) /);
    assert.doesNotMatch(request.sql, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i);
    assert.ok(query.resultColumns.length > 0);
    assert.doesNotMatch(request.sql, /2026-|hr@|password|73\.3|76\.7/);
    const names = Object.values(query.parameterSpec).map((spec) => spec.name);
    if (id.includes('plan.')) assert.ok(names.includes('month') && names.includes('basis'));
    if (id.includes('orders.') || id.includes('warehouse.')) assert.ok(!names.includes('month'));
    for (const name of ['base', 'region', 'province', 'sales_group'])
      assert.ok(names.includes(name), `${id}: ${name}`);
  }
  const production = config.queries['operations.production.future'].request.sql;
  assert.match(production, /GROUP BY .*p\.measure_unit/);
  assert.match(production, /WHEN '郑州' THEN '3001'/);
  assert.match(production, /p\.data_source='工厂'/);
  assert.match(config.queries['operations.stock.item'].request.sql, /CASE WHEN COUNT\(\*\)=1/);
  assert.match(config.queries['operations.shortage.sku'].request.sql, /source_flag='缺货供应匹配'/);
});

test('complete operations groups retain null quantities and do not turn a denied field into zero', async () => {
  const id = 'operations.plan.base';
  const row = {
    base: '郑州',
    source_rows: 2,
    initial_plan: 100,
    adjusted_plan: 90,
    ordered: null,
    ordered_known: 60,
    shipped: 40,
    ordered_coverage: 1,
  };
  const reader = createOperationsReader(config, async (_request, options) =>
    response(options.queryId, [row]),
  );
  const result = await reader('plan.base', filters);
  assert.equal(result.rows[0].ordered, null);
  assert.equal(result.total, 1);
  const denied = createOperationsReader(config, async () =>
    response(id, [row], { rejectedColumns: ['ordered'] }),
  );
  await assert.rejects(denied('plan.base', filters), /授权|PERMISSION|字段/);
});

test('order age uses Shanghai dates and separately retains missing deadlines and invalid creation dates', () => {
  const rows = bucketOrderAges(
    [
      { created_at: '2026-11-24 23:59:59', need_billing_at: '2026-11-24 23:59:59', orders: 3 },
      { created_at: '2026-11-23 00:00:00', need_billing_at: null, orders: 2 },
      { created_at: '2026-11-20 10:00:00', need_billing_at: '2026-11-25 00:00:00', orders: 4 },
      { created_at: '0001-01-01 00:00:00', need_billing_at: null, orders: 1 },
      { created_at: '2026-11-26 00:00:00', need_billing_at: null, orders: 1 },
    ],
    '2026-11-25',
  );
  assert.deepEqual(rows[0], {
    age_band: '0–2天',
    orders: 5,
    overdue_orders: 3,
    unknown_deadlines: 2,
  });
  assert.deepEqual(rows[1], {
    age_band: '3–5天',
    orders: 4,
    overdue_orders: 0,
    unknown_deadlines: 0,
  });
  assert.deepEqual(rows[2], {
    age_band: '创建时间未知',
    orders: 2,
    overdue_orders: 0,
    unknown_deadlines: 2,
  });
  assert.equal(Object.hasOwn(config.queries, 'operations.orders.reason'), false);
  assert.doesNotMatch(config.queries['operations.orders.age'].request.sql, /DATE_ADD|DATEDIFF/);
});

test('transport truncation is rejected before producing an aggregate', async () => {
  const reader = createOperationsReader(config, async () => ({ rows: [], hasMorePages: true }));
  await assert.rejects(reader('plan.base', filters), /TRANSPORT_INCOMPLETE/);
});

test('server paged details reject changing counts, config versions and duplicate keys', async () => {
  const id = 'operations.orders.pending';
  const row = {
    cust_order_no: 'ORDER-1',
    base: '郑州',
    stage: '备单中',
    created_at: null,
    need_billing_at: null,
    latest_load: '2026-11-25 15:00:00',
  };
  for (const change of ['count', 'version', 'duplicate']) {
    let counts = 0;
    const reader = createOperationsReader(config, async (_request, options) => {
      if (options.queryId.endsWith('.count')) {
        counts++;
        return response(options.queryId, [
          { total: change === 'duplicate' ? 2 : change === 'count' && counts > 1 ? 2 : 1 },
        ]);
      }
      return response(id, change === 'duplicate' ? [row, row] : [row], {
        configVersion: change === 'version' ? 'v2' : 'v1',
      });
    });
    await assert.rejects(reader('orders.pending', filters), /INCOMPLETE|CONFIG_CHANGED|UNSTABLE/);
  }
});

test('operations filters and dataset names cannot introduce SQL, identities or arbitrary sources', async () => {
  const reader = createOperationsReader(config, async () => {
    throw Error('must not execute');
  });
  await assert.rejects(reader('unregistered', filters), /NOT_REGISTERED/);
  await assert.rejects(reader('plan.base', { ...filters, basis: 'OTHER' }), /参数无效/);
  await assert.rejects(reader('plan.base', { ...filters, month: '2026-11-02' }), /日期无效/);
  await assert.rejects(reader('orders.pending', filters, { page: 0 }), /INVALID_OPERATIONS_PAGE/);
});
