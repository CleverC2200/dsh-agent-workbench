import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(
  await readFile(new URL('../business/inventory-dealer/sql.config.json', import.meta.url)),
);
const bundle = await build({
  stdin: {
    contents:
      "export * from './prototypes/inventory-customer/sku-source.js'; export { refreshConfiguredQueries } from './business/shared/query-cache.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readCustomerSkus, customerSkuPresentation, refreshConfiguredQueries } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const inventory = { snapshot: '2026-10-30', rows: [{ code: 'A' }, { code: 'B' }] };
const atomic = config.queries['dealer.stock.detail.atomic'];
function source({ customer = 'A', total = 11, negative = false } = {}) {
  const calls = [];
  const execute = async (request, options) => {
    calls.push({ request, options });
    if (options.queryId === 'source.dealer-stock-date') return { rows: [{ day: '2026-10-29' }] };
    const offset = request.parameters.gea_p10;
    const rows = Array.from({ length: Math.min(10, Math.max(0, total - offset)) }, (_, index) => ({
      ...Object.fromEntries(atomic.resultColumns.map((column) => [column, null])),
      customer,
      sku: 'SKU' + (index + offset),
      inventory: negative ? -3 : 0,
      page_scope_total: total,
      page_row_present: 1,
    }));
    return { rows, returnedColumns: atomic.resultColumns };
  };
  return { execute, calls };
}

test('paging shares a successful scoped date read and reuses completed pages without mutable aliases', async () => {
  const fixture = source();
  const first = await readCustomerSkus(inventory, ['A'], { page: 1 }, fixture);
  await readCustomerSkus(inventory, ['A'], { page: 2 }, fixture);
  first.rows[0].inventory = 999;
  const returned = await readCustomerSkus(inventory, ['A'], { page: 1 }, fixture);
  assert.equal(returned.rows[0].inventory, 0);
  assert.equal(fixture.calls.length, 3, 'one date read and two detail reads, instead of six');
  assert.equal(
    fixture.calls.filter((call) => call.options.queryId === 'source.dealer-stock-date').length,
    1,
  );
  const controller = new AbortController();
  controller.abort(Error('page closed'));
  await assert.rejects(
    readCustomerSkus(inventory, ['A'], { page: 1 }, { ...fixture, signal: controller.signal }),
    /page closed/,
  );
});

test('reordered scopes reuse pages and an aborted read cannot poison a newer filter request', async () => {
  const fixture = source({ total: 1 });
  await readCustomerSkus(inventory, ['A', 'B'], { page: 1 }, fixture);
  await readCustomerSkus(inventory, ['B', 'A'], { page: 1 }, fixture);
  assert.equal(fixture.calls.length, 2);
  let finishOld,
    dates = 0;
  const retry = {
    execute: (request, options) => {
      if (options.queryId === 'source.dealer-stock-date' && dates++ === 0)
        return new Promise((resolve) => {
          finishOld = resolve;
        });
      return fixture.execute(request, options);
    },
  };
  const controller = new AbortController();
  const old = readCustomerSkus(
    inventory,
    ['A'],
    { page: 1 },
    { ...retry, signal: controller.signal },
  );
  const rejected = assert.rejects(old, /filter changed/);
  while (!finishOld) await new Promise((resolve) => setImmediate(resolve));
  controller.abort(Error('filter changed'));
  const fresh = await readCustomerSkus(inventory, ['A'], { page: 1 }, retry);
  finishOld({ rows: [{ day: '2026-10-29' }] });
  await rejected;
  const calls = fixture.calls.length;
  assert.deepEqual(await readCustomerSkus(inventory, ['A'], { page: 1 }, retry), fresh);
  assert.equal(fixture.calls.length, calls);
});

test('cached SKU pages remain separate for filters, customer scope, inventory owner and refresh', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const fixture = source({ total: 1 });
  await readCustomerSkus(inventory, ['A'], { page: 1 }, fixture);
  await readCustomerSkus(inventory, ['A'], { page: 1, filters: { category: '水饺' } }, fixture);
  assert.equal(
    fixture.calls.length,
    3,
    'different filter reads detail but retains the same scoped date',
  );
  await readCustomerSkus(inventory, ['A', 'B'], { page: 1 }, fixture);
  assert.equal(fixture.calls.length, 5, 'a changed customer scope resolves its own date');
  await readCustomerSkus({ ...inventory }, ['A'], { page: 1 }, fixture);
  assert.equal(fixture.calls.length, 7);
  now++;
  refreshConfiguredQueries();
  await readCustomerSkus(inventory, ['A'], { page: 1 }, fixture);
  assert.equal(fixture.calls.length, 9, 'manual refresh bypasses both cached date and page');
  now += 20 * 60 * 1000;
  await readCustomerSkus(inventory, ['A'], { page: 1 }, fixture);
  assert.equal(fixture.calls.length, 11, 'expiry is fixed and is not extended by cache hits');
});

test('only six completed SKU pages are retained and failed date reads remain retryable', async () => {
  const fixture = source({ total: 80 });
  for (let page = 1; page <= 7; page++) await readCustomerSkus(inventory, ['A'], { page }, fixture);
  await readCustomerSkus(inventory, ['A'], { page: 1 }, fixture);
  assert.equal(fixture.calls.length, 9);
  let failed = true;
  const retry = {
    execute: async (...args) => {
      if (failed) throw Error('temporary read failure');
      return fixture.execute(...args);
    },
  };
  await assert.rejects(
    readCustomerSkus(inventory, ['A'], { page: 1 }, retry),
    /temporary read failure/,
  );
  failed = false;
  const result = await readCustomerSkus(inventory, ['A'], { page: 1 }, retry);
  assert.equal(result.rows.length, 10);
});

test('four concurrent cold SKU scopes reach the controlled transport without nesting the shared scheduler', async (t) => {
  const bundled = await build({
    entryPoints: ['prototypes/inventory-customer/sku-source.js'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'controlled-transport',
        setup(api) {
          api.onLoad({ filter: /[\\/]shared[\\/]channel\.js$/ }, () => ({
            contents:
              'export const call = (...args) => globalThis.customerSkuTransport(...args); export const ready = Promise.resolve();',
            loader: 'js',
          }));
        },
      },
    ],
  });
  const module = await import(
    'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
  );
  const codes = ['A', 'B', 'C', 'D'];
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(Error('SKU queue stalled')), 1000);
  t.after(() => {
    clearTimeout(deadline);
    delete globalThis.customerSkuTransport;
  });
  let calls = 0;
  globalThis.customerSkuTransport = async (method, request, { signal }) => {
    signal.throwIfAborted();
    assert.equal(method, 'sql');
    assert.equal(request.pageNo, 1);
    assert.equal(request.pageSize, 200);
    calls++;
    if (request.sql.startsWith('SELECT MAX')) return { rows: [{ day: '2026-10-29' }] };
    return {
      rows: [
        {
          ...Object.fromEntries(atomic.resultColumns.map((column) => [column, null])),
          customer: request.parameters.list_1_0,
          sku: 'SKU',
          inventory: 1,
          page_scope_total: 1,
          page_row_present: 1,
        },
      ],
      returnedColumns: atomic.resultColumns,
    };
  };
  const owner = { snapshot: inventory.snapshot, rows: codes.map((code) => ({ code })) };
  const results = await Promise.all(
    codes.map((code) =>
      module.readCustomerSkus(owner, [code], { page: 1 }, { signal: controller.signal }),
    ),
  );
  assert.deepEqual(
    results.map((result) => result.rows[0].customer),
    codes,
  );
  assert.equal(calls, 8);
});

test('SKU page reuses dealer presentation and server paging with bound customer and filters', async () => {
  const { execute, calls } = source();
  const result = await readCustomerSkus(
    inventory,
    ['A'],
    { customer: 'A', page: 2, filters: { category: '水饺', sku: "SKU'", search: 'A%' } },
    { execute },
  );
  assert.equal(result.total, 11);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].sku, 'SKU10');
  assert.equal(result.snapshotDate, '2026-10-29');
  assert.equal(
    calls[1].request.sql,
    atomic.request.sql.replaceAll(
      'WHERE t.stat_date',
      'WHERE t.cust_code IN (:list_1_0) AND t.stat_date',
    ),
  );
  assert.equal(calls[1].request.parameters.list_1_0, 'A');
  assert.equal(calls[1].request.parameters.gea_p3, 'A');
  assert.equal(calls[1].request.parameters.gea_p5, '水饺');
  assert.equal(calls[1].request.parameters.gea_p7, "SKU'");
  assert.equal(calls[1].request.parameters.gea_p9, 10);
  assert.equal(calls[1].request.parameters.gea_p10, 10);
  assert.deepEqual(
    customerSkuPresentation.columns.map((column) => column.label),
    [
      'SKU',
      '品类 / 产品系列',
      '标签 / 规格',
      '在仓库存',
      '在途',
      '近7日销量',
      '近30日销量',
      '近30日销售额',
      '统一到岸价',
      '平均货龄',
      '目标库存',
      '正常库存',
      '大日期库存',
      '临期库存',
      '库存金额',
      '库存日期',
      '建议补货',
      '依据 / 缺失',
    ],
  );
});

test('SKU scope follows every filtered customer before server paging; an empty scope reads nothing', async () => {
  const fixture = source({ customer: 'B', total: 1 });
  const result = await readCustomerSkus(inventory, ['A', 'B'], { page: 1 }, fixture);
  assert.equal(result.rows[0].customer, 'B');
  for (const call of fixture.calls) {
    assert.match(
      call.request.sql,
      /WHERE t\.cust_code IN \(:list_1_0, :list_1_1\) AND t\.stat_date/,
    );
    assert.equal(call.request.parameters.list_1_0, 'A');
    assert.equal(call.request.parameters.list_1_1, 'B');
    assert.ok(
      !call.request.sql.includes('WHERE t.stat_date'),
      'no stock query may retain an unfiltered date predicate',
    );
    if (call.options.queryId === 'dealer.stock.detail.atomic') {
      assert.equal(
        (call.request.sql.match(/WHERE t\.cust_code IN/g) ?? []).length,
        2,
        'both count and detail receive the customer scope',
      );
    }
  }
  const calls = fixture.calls.length;
  const empty = await readCustomerSkus(inventory, [], { page: 1 }, fixture);
  assert.equal(empty.total, 0);
  assert.equal(fixture.calls.length, calls);
});

test('SKU reads reject customers outside the visible scope and wrong-customer results', async () => {
  const fixture = source({ customer: 'B', total: 1 });
  await assert.rejects(
    readCustomerSkus(inventory, ['A'], { customer: 'B', page: 1 }, fixture),
    /SCOPE_INVALID/,
  );
  assert.equal(fixture.calls.length, 0);
  await assert.rejects(
    readCustomerSkus(inventory, ['A'], { customer: 'A', page: 1 }, fixture),
    /SCOPE_INVALID/,
  );
});

test('SKU reads preserve negative and zero values, reject incomplete pages and propagate denials/cancellation', async () => {
  const fixture = source({ total: 1, negative: true });
  const result = await readCustomerSkus(inventory, ['A'], { customer: 'A', page: 1 }, fixture);
  assert.equal(result.rows[0].inventory, -3);
  await assert.rejects(
    readCustomerSkus(
      inventory,
      ['A'],
      { customer: 'A', page: 1 },
      {
        execute: async () => {
          throw Object.assign(Error('字段拒权'), { code: 'RETURN_PERMISSION_DENIED' });
        },
      },
    ),
    { code: 'RETURN_PERMISSION_DENIED' },
  );
  const controller = new AbortController();
  controller.abort(Error('identity changed'));
  await assert.rejects(
    readCustomerSkus(
      inventory,
      ['A'],
      { customer: 'A', page: 1 },
      { ...fixture, signal: controller.signal },
    ),
    /identity changed/,
  );
  await assert.rejects(
    readCustomerSkus(
      inventory,
      ['A'],
      { customer: 'A', page: 1 },
      {
        execute: async (request, options) =>
          options.queryId === 'source.dealer-stock-date'
            ? { rows: [{ day: '2026-10-29' }] }
            : {
                rows: [
                  {
                    ...Object.fromEntries(atomic.resultColumns.map((column) => [column, null])),
                    page_scope_total: 2,
                    page_row_present: 1,
                  },
                ],
              },
      },
    ),
    { code: 'RESULT_INCOMPLETE' },
  );
});
