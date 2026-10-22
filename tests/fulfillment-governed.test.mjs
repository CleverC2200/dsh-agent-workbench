import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createFulfillmentReader,
  visibleResult,
  createLoadOwner,
  shanghaiToday,
  plannedShippingDays,
} from '../prototypes/inventory-orderfulfillment/live-model.mjs';
import { makeRequest } from '../business/shared/configured-query-client.mjs';

test('planned shipping days use current-month corrected plans on every snapshot day and preserve unknowns', () => {
  const row = {
    source_rows: 1,
    stock_date: '2026-10-20',
    month_days: 31,
    available_qty: 100,
    main_plan_initial: 310,
    bp_plan_initial: 0,
    transfer_plan_initial: 620,
    main_plan_adjusted: 620,
    bp_plan_adjusted: 0,
    transfer_plan_adjusted: 0,
  };
  assert.equal(plannedShippingDays(row), 100 / 30);
  assert.equal(plannedShippingDays({ ...row, stock_date: '2026-10-10' }), 100 / 30);
  assert.equal(plannedShippingDays({ ...row, stock_date: '2026-10-21' }), 100 / 30);
  assert.equal(
    plannedShippingDays({
      ...row,
      stock_date: '2026-10-31',
      next_month_sales_plan: 300,
      next_month_out_plan: 600,
    }),
    100 / 30,
  );
  assert.equal(plannedShippingDays({ ...row, available_qty: 0 }), 0);
  for (const change of [
    { source_rows: 2 },
    { available_qty: null },
    { main_plan_adjusted: null, main_plan_initial: null },
    { month_days: 30 },
    { main_plan_adjusted: 0, main_plan_initial: 0, transfer_plan_initial: 0 },
  ])
    assert.equal(plannedShippingDays({ ...row, ...change }), null);
  assert.equal(
    plannedShippingDays(
      visibleResult({
        rows: [row],
        returnedColumns: Object.keys(row),
        rejectedColumns: ['available_qty'],
      }).rows[0],
    ),
    null,
  );
});

const config = JSON.parse(
  await readFile(
    new URL('../business/inventory-orderfulfillment/sql.config.json', import.meta.url),
    'utf8',
  ),
);
const filters = {
  start: '2026-10-20',
  end_exclusive: '2026-10-21',
  base: null,
  region: null,
  province: null,
  sales_group: null,
  channel: null,
  customer: null,
  order: null,
  sku: null,
  carrier: null,
};
test('complete inputs use bounded concurrent pages without repeated per-page counts and keep all consistency guards', async () => {
  for (const fault of ['none', 'count', 'permission', 'short', 'config']) {
    let counts = 0,
      dataCalls = 0,
      running = 0,
      peak = 0;
    const reader = createFulfillmentReader(config, async (_request, options) => {
      if (options.queryId.endsWith('.count'))
        return {
          rows: [{ total: ++counts === 3 && fault === 'count' ? 871 : 870 }],
          configVersion: 'v1',
        };
      const offset = options.values.offset;
      running++;
      peak = Math.max(peak, running);
      dataCalls++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      const size = Math.min(200, 870 - offset) - (fault === 'short' && offset === 200 ? 1 : 0);
      const rows = Array.from({ length: size }, (_, i) => ({
        cust_order_no: 'O' + (offset + i),
        executeorderno: 'E' + (offset + i),
        executeorderlineno: '1',
      }));
      return {
        rows,
        configVersion: fault === 'config' && offset === 200 ? 'v2' : 'v1',
        returnedColumns:
          fault === 'permission' && offset === 200
            ? ['cust_order_no']
            : ['cust_order_no', 'executeorderno', 'executeorderlineno'],
        rejectedColumns: [],
      };
    });
    if (fault === 'none') {
      const result = await reader.all('orders.facts', filters);
      assert.equal(result.rows.length, 870);
      assert.equal(result.rows[200].cust_order_no, 'O200');
      assert.equal(counts, 3);
      assert.equal(dataCalls, 5);
      assert.ok(peak > 1 && peak <= 4);
    } else await assert.rejects(reader.all('orders.facts', filters));
  }
});

test('order01 queries bind business filters only and expose no transport credentials', () => {
  for (const [id, query] of Object.entries(config.queries)) {
    const values = { ...filters, ...(query.pagination ? { page_size: 20, offset: 0 } : {}) };
    const request = makeRequest(config, id, values);
    assert.ok(request.sql.startsWith('SELECT'));
    assert.doesNotMatch(request.sql, /EXISTS\s*\(|\bSUBSTR\s*\(/i);
    assert.throws(() => makeRequest(config, id, { ...values, consumerCode: 'other' }), /参数/);
    assert.throws(() => makeRequest(config, id, { ...values, start: '2026-10-22' }), /日期/);
    assert.doesNotMatch(
      JSON.stringify(query),
      /100\.100\.1\.75|develop_hr|password|delegationToken/,
    );
  }
});

test('current-user row and field grants determine the result independently for two users', async () => {
  async function readAs(customer, grantName) {
    return createFulfillmentReader(config, async (_request, options) =>
      options.queryId.endsWith('.count')
        ? { rows: [{ total: 1 }], configVersion: 'v1' }
        : {
            rows: [
              {
                order_no: customer + '-order',
                customer_code: customer,
                customer_name: 'private name',
              },
            ],
            returnedColumns: ['order_no', 'customer_code', ...(grantName ? ['customer_name'] : [])],
            rejectedColumns: grantName ? [] : [{ alias: 'customer_name' }],
            configVersion: 'v1',
          },
    ).collection('orders.detail', filters);
  }
  const a = await readAs('A', true),
    b = await readAs('B', false);
  assert.equal(a.rows[0].customer_name, 'private name');
  assert.deepEqual(b.rows, [{ order_no: 'B-order', customer_code: 'B' }]);
  assert.ok(!JSON.stringify(b.rows).includes('A-order'));
  assert.ok(!b.columns.includes('customer_name'));
});

test('permission denial never retries with another Consumer or data source', async () => {
  let calls = 0;
  const reader = createFulfillmentReader(config, async () => {
    calls++;
    return { success: false, errorCode: 'RETURN_PERMISSION_DENIED', message: 'denied' };
  });
  await assert.rejects(
    reader.collection('orders.detail', filters),
    (error) => error.code === 'RETURN_PERMISSION_DENIED',
  );
  assert.equal(calls, 1);
});

test('count changes and config changes reject an incomplete collection', async () => {
  for (const change of ['count', 'config']) {
    let counts = 0;
    const reader = createFulfillmentReader(config, async (_request, options) =>
      options.queryId.endsWith('.count')
        ? {
            rows: [{ total: ++counts === 1 ? 1 : change === 'count' ? 2 : 1 }],
            configVersion: 'v1',
          }
        : { rows: [{ order_no: 'A' }], configVersion: change === 'config' ? 'v2' : 'v1' },
    );
    await assert.rejects(reader.collection('orders.detail', filters), (error) =>
      ['RESULT_INCOMPLETE', 'QUERY_CONFIG_CHANGED'].includes(error.code),
    );
  }
});

test('missing/denied summary fields stay unknown while genuine zero remains zero', async () => {
  assert.deepEqual(
    visibleResult({
      rows: [{ allowed: 0, denied: 99 }],
      returnedColumns: ['allowed', 'denied'],
      rejectedColumns: ['denied'],
    }).rows,
    [{ allowed: 0 }],
  );
  const reader = createFulfillmentReader(config, async () => ({
    rows: [{ source_orders: 0 }],
    returnedColumns: ['source_orders'],
    rejectedColumns: ['source_rows'],
  }));
  const summary = await reader.summary('orders.summary', filters);
  assert.equal(summary.rows[0].source_orders, 0);
  assert.equal(summary.rows[0].source_rows, undefined);
  assert.ok(!summary.columns.includes('source_rows'));
});

test('identity/filter changes invalidate late results and Shanghai dates cross UTC midnight correctly', () => {
  const owner = createLoadOwner(),
    old = owner.begin(),
    current = owner.begin();
  assert.equal(old.current(), false);
  assert.equal(old.signal.aborted, true);
  assert.equal(current.current(), true);
  owner.invalidate();
  assert.equal(current.current(), false);
  assert.equal(shanghaiToday(new Date('2026-10-20T18:00:00Z')), '2026-10-21');
});
