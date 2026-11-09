import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
const output = await build({
  entryPoints: [
    'business/inventory-fc/source/inventory-light-plugins/src/pages/fc-current-orders-data.ts',
  ],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'query-boundary',
      setup(api) {
        api.onResolve({ filter: /shared\/agent-query$/ }, () => ({
          path: 'query',
          namespace: 'fixture',
        }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents:
            'export const createAgentQueries=()=>({read:(...args)=>globalThis.orderExportRead(...args)});',
        }));
      },
    },
  ],
});
const { readOrderExport, orderKey } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
const filters = {
  warehouse_code: 'A110',
  warehouse_search_pattern: null,
  customer_code: null,
  search_pattern: null,
  shortage_only: false,
};
const line = (order, sku, demand) => ({
  warehouse_code: 'A110',
  order_no: order,
  customer_code: 'C1',
  sku,
  material_name: '产品' + sku,
  ordered: demand,
  demand,
  allocated: 0,
  shipped: 0,
  remaining: demand,
  shortage: 0,
  order_status: '正常',
});
function fixture(groups) {
  const orders = groups.map((lines) => ({
    ...lines[0],
    sku: undefined,
    material_name: undefined,
    warehouse_name: '沈阳分仓',
    customer_name: '测试客户',
    requested_at: null,
    created_at: '2026-11-06',
    satisfaction: null,
    sku_count: lines.length,
    ...Object.fromEntries(
      ['ordered', 'demand', 'allocated', 'shipped', 'remaining', 'shortage'].map((k) => [
        k,
        lines.reduce((s, r) => s + r[k], 0),
      ]),
    ),
  }));
  const calls = [];
  globalThis.orderExportRead = async (id, values, options) => {
    options.signal.throwIfAborted();
    calls.push({ id, values });
    const all = id.endsWith('.page')
      ? orders
      : groups
          .flat()
          .filter(
            (r) =>
              r.order_no === values.order_no &&
              r.customer_code === values.customer_code &&
              r.warehouse_code === values.warehouse_code,
          );
    const page = all.slice(values.offset, values.offset + values.page_size);
    return {
      rows: page.length
        ? page.map((r) => ({ ...r, page_scope_total: all.length, page_row_present: 1 }))
        : [{ page_scope_total: 0, page_row_present: null }],
      configVersion: 'fixed',
      returnedColumns: config.queries[id].resultColumns,
      rejectedColumns: [],
    };
  };
  return { orders, calls };
}
const signal = () => new AbortController().signal;
test('six orders and sixteen SKU lines export 931 pieces without opening order rows', async () => {
  let n = 0;
  const groups = [3, 3, 3, 3, 2, 2].map((count, i) =>
    Array.from({ length: count }, () => {
      n++;
      return line('O' + i, 'SKU' + n, n === 16 ? 181 : 50);
    }),
  );
  const { calls } = fixture(groups);
  const result = await readOrderExport(
    config,
    filters,
    { kind: 'all', excluded: new Set() },
    signal(),
  );
  assert.equal(result.orderCount, 6);
  assert.equal(result.lineCount, 16);
  assert.equal(result.rows.length, 17);
  assert.equal(
    result.rows.slice(1).reduce((n, r) => n + r[8], 0),
    931,
  );
  assert.ok(calls.every((c) => c.values.warehouse_code === 'A110'));
  assert.equal(calls.filter((c) => c.id.endsWith('.lines')).length, 6);
});
test('selected orders and select-all exclusions export only those complete order lines', async () => {
  const { orders } = fixture([
    [line('O1', 'SKU1', 2), line('O1', 'SKU2', 3)],
    [line('O2', 'SKU3', 4)],
  ]);
  const selected = await readOrderExport(
    config,
    filters,
    { kind: 'selected', keys: new Set([orderKey(orders[0])]) },
    signal(),
  );
  assert.equal(selected.orderCount, 1);
  assert.equal(selected.lineCount, 2);
  assert.ok(selected.rows.slice(1).every((r) => r[2] === 'O1'));
  const excluded = await readOrderExport(
    config,
    filters,
    { kind: 'all', excluded: new Set([orderKey(orders[0])]) },
    signal(),
  );
  assert.equal(excluded.orderCount, 1);
  assert.equal(excluded.rows[1][2], 'O2');
});
test('exports all order and SKU pages including a fifty-plus-line order', async () => {
  const groups = Array.from({ length: 52 }, (_, i) =>
    Array.from({ length: i === 0 ? 53 : 1 }, (_, j) => line('O' + i, 'SKU' + j, 1)),
  );
  const { calls } = fixture(groups);
  const result = await readOrderExport(
    config,
    filters,
    { kind: 'all', excluded: new Set() },
    signal(),
  );
  assert.equal(result.orderCount, 52);
  assert.equal(result.lineCount, 104);
  assert.ok(calls.some((c) => c.id.endsWith('.page') && c.values.offset === 50));
  assert.ok(
    calls.some(
      (c) => c.id.endsWith('.lines') && c.values.order_no === 'O0' && c.values.offset === 50,
    ),
  );
});
test('permission errors, stale selected orders, changed totals and cancellation never return a partial workbook', async () => {
  const { orders } = fixture([[line('O1', 'SKU1', 3)]]);
  const read = globalThis.orderExportRead;
  globalThis.orderExportRead = async (id, ...args) => {
    if (id.endsWith('.lines')) throw Error('ROW_SCOPE_DENIED');
    return read(id, ...args);
  };
  await assert.rejects(
    readOrderExport(config, filters, { kind: 'all', excluded: new Set() }, signal()),
    /ROW_SCOPE_DENIED/,
  );
  globalThis.orderExportRead = read;
  await assert.rejects(
    readOrderExport(config, filters, { kind: 'selected', keys: new Set(['missing']) }, signal()),
    /所选订单已变化/,
  );
  orders[0].demand = 4;
  await assert.rejects(
    readOrderExport(config, filters, { kind: 'all', excluded: new Set() }, signal()),
    /订单数量/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readOrderExport(config, filters, { kind: 'all', excluded: new Set() }, controller.signal),
    { name: 'AbortError' },
  );
});
