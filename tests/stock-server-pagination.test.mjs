import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const config = JSON.parse(await readFile('business/inventory-aqkc/sql.config.json', 'utf8'));
const bundle = await build({
  entryPoints: ['business/inventory-aqkc/source/inventory-light-plugins/src/configured-stock.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readConfiguredStockPage, readConfiguredStockSummary, startConfiguredStockReadCycle } =
  await import(
    'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
  );
const now = new Date('2026-10-15T01:00:00Z');
function source() {
  const calls = [];
  const execute = async (_, call) => {
    calls.push(call);
    const columns = config.queries[call.queryId].resultColumns;
    let rows;
    if (call.queryId === 'calendar.target_versions.count') rows = [{ total: 1 }];
    else if (call.queryId === 'calendar.target_versions')
      rows = [{ month: '2026-10-01', inventory_version: '月初' }];
    else if (call.queryId === 'source.stock-date') rows = [{ day: '2026-10-14' }];
    else if (call.queryId === 'page.dashboard-groups')
      rows = [
        { ...Object.fromEntries(columns.map((c) => [c, null])), base: '郑州', category: '汤圆' },
      ];
    else if (call.queryId === 'page.sku-detail.count') rows = [{ total: 25 }];
    else if (call.queryId === 'page.sku-detail.atomic')
      rows = Array.from(
        { length: Math.min(call.values.page_size, 25 - call.values.offset) },
        (_, i) => ({
          ...Object.fromEntries(columns.map((c) => [c, null])),
          base: '郑州',
          sku: String(call.values.offset + i),
          inventory: 0,
          stock_source_rows: 1,
          target_source_rows: 0,
          page_scope_total: 25,
          page_row_present: 1,
        }),
      );
    else throw Error('unexpected full-table read ' + call.queryId);
    return { rows, returnedColumns: columns, rejectedColumns: [], configVersion: 'v1' };
  };
  return { calls, execute };
}
test('SKU paging reads ten database rows, then fresh offset rows using the same snapshot scope', async () => {
  const io = source();
  const first = await readConfiguredStockPage({ base: '郑州' }, { ...io, now });
  assert.equal(first.total, 25);
  assert.equal(first.rows.length, 10);
  const boundary = io.calls.length;
  const second = await readConfiguredStockPage(
    { base: '郑州', page: 2, readContext: first.readContext },
    { ...io, now },
  );
  assert.equal(second.rows.length, 10);
  assert.equal(second.rows[0]['safety_stock.material_code'], '10');
  assert.deepEqual(
    io.calls.slice(boundary).map((c) => c.queryId),
    ['page.sku-detail.atomic'],
  );
  assert.deepEqual(
    io.calls
      .filter((c) => c.queryId === 'page.sku-detail.atomic')
      .map((c) => [c.values.page_size, c.values.offset]),
    [
      [10, 0],
      [10, 10],
    ],
  );
  assert.equal(second.rows[0]['safety_stock.current_inventory'], 0);
});
test('search, risk and sort are sent to SQL before paging; literal wildcard input is escaped', async () => {
  const io = source();
  await readConfiguredStockPage(
    {
      base: '郑州',
      category: '未分类',
      query: 'a%_b',
      risks: ['缺失目标'],
      sort: { key: 'current', direction: 'desc' },
    },
    { ...io, now },
  );
  const values = io.calls.find((c) => c.queryId === 'page.sku-detail.atomic').values;
  assert.equal(values.search_pattern, '%a\\%\\_b%');
  assert.equal(values.category_mode, 'missing');
  assert.equal(values.sort_field, 'inventory');
  assert.equal(values.sort_direction, 'desc');
  assert.deepEqual(values.risks, ['缺失目标']);
});
test('changed configuration between page turns cannot mix snapshot and page data', async () => {
  const io = source();
  const first = await readConfiguredStockPage({ base: '郑州' }, { ...io, now });
  let count = 0;
  await assert.rejects(
    readConfiguredStockPage(
      { base: '郑州', page: 2, readContext: first.readContext },
      {
        now,
        execute: async (...args) => {
          count++;
          return { ...(await io.execute(...args)), configVersion: 'v2' };
        },
      },
    ),
    { code: 'QUERY_CONFIG_CHANGED' },
  );
  assert.equal(count, 1);
});
test('partial pages fail rather than presenting a complete-looking count', async () => {
  const io = source();
  await assert.rejects(
    readConfiguredStockPage(
      { base: '郑州' },
      {
        now,
        execute: async (...args) => {
          const r = await io.execute(...args);
          if (args[1].queryId === 'page.sku-detail.atomic') r.rows.pop();
          return r;
        },
      },
    ),
    { code: 'RESULT_INCOMPLETE' },
  );
});

test('missing batch age facts cannot turn an age risk filter into an empty-success page', async () => {
  const io = source();
  for (const risk of ['预警', '正常'])
    await assert.rejects(
      readConfiguredStockPage({ base: '郑州', tab: '货龄结构', risks: [risk] }, { ...io, now }),
      { code: 'FILTER_SOURCE_UNAVAILABLE' },
    );
  assert.equal(io.calls.length, 0);
});

test('independent target calendar and stock date start in the same gateway wave', async () => {
  const io = source();
  let wave = 0,
    pending = [],
    timer;
  const seen = [];
  await readConfiguredStockPage(
    { base: '郑州' },
    {
      now,
      execute: async (...args) => {
        seen.push([args[1].queryId, wave]);
        await new Promise((resolve) => {
          pending.push(resolve);
          if (!timer)
            timer = setImmediate(() => {
              const batch = pending;
              pending = [];
              timer = undefined;
              wave++;
              batch.forEach((f) => f());
            });
        });
        return io.execute(...args);
      },
    },
  );
  assert.equal(
    seen.find(([q]) => q === 'calendar.target_versions')[1],
    seen.find(([q]) => q === 'source.stock-date')[1],
  );
  assert.equal(wave, 2);
});

test('base drill requests reuse only date/version metadata within one refresh cycle', async () => {
  const io = source(),
    cycle = new AbortController();
  startConfiguredStockReadCycle?.(cycle.signal);
  try {
    await readConfiguredStockPage({ base: '郑州' }, { ...io, now });
    const n = io.calls.length;
    await readConfiguredStockPage({ base: '华东' }, { ...io, now });
    assert.deepEqual(
      io.calls.slice(n).map((c) => c.queryId),
      ['page.sku-detail.atomic'],
    );
    assert.deepEqual(io.calls.at(-1).values.bases, ['华东']);
    cycle.abort();
    startConfiguredStockReadCycle?.(new AbortController().signal);
    const next = io.calls.length;
    await readConfiguredStockPage({ base: '华东' }, { ...io, now });
    assert.equal(
      io.calls.slice(next).length,
      3,
      'refresh must resolve both metadata sources again',
    );
  } finally {
    startConfiguredStockReadCycle?.();
  }
});

test('landing summary and a later SKU drill share metadata, never their business rows', async () => {
  const io = source();
  startConfiguredStockReadCycle(new AbortController().signal);
  try {
    await readConfiguredStockSummary(undefined, { ...io, now });
    const n = io.calls.length;
    const page = await readConfiguredStockPage({ base: '郑州' }, { ...io, now });
    assert.equal(page.rows.length, 10);
    assert.deepEqual(
      io.calls.slice(n).map((c) => c.queryId),
      ['page.sku-detail.atomic'],
    );
  } finally {
    startConfiguredStockReadCycle();
  }
});

test('cancelling a drill does not cancel another consumer of the refresh metadata', async () => {
  const io = source(),
    cycle = new AbortController(),
    caller = new AbortController();
  startConfiguredStockReadCycle(cycle.signal);
  const release = [];
  const execute = async (...args) => {
    if (['calendar.target_versions', 'source.stock-date'].includes(args[1].queryId))
      await new Promise((r) => release.push(r));
    return io.execute(...args);
  };
  try {
    const first = readConfiguredStockPage(
      { base: '郑州' },
      { now, execute, signal: caller.signal },
    );
    const aborted = assert.rejects(first, { name: 'AbortError' });
    await new Promise(setImmediate);
    const second = readConfiguredStockPage({ base: '华东' }, { now, execute });
    caller.abort();
    release.forEach((f) => f());
    await aborted;
    assert.equal((await second).rows.length, 10);
    assert.equal(io.calls.filter((c) => c.queryId === 'source.stock-date').length, 1);
    assert.equal(io.calls.filter((c) => c.queryId === 'page.sku-detail.atomic').length, 1);
  } finally {
    cycle.abort();
    startConfiguredStockReadCycle();
  }
});

test('aborted refresh cannot seed its replacement and changed config still rejects a drill', async () => {
  const io = source(),
    cycle = new AbortController();
  startConfiguredStockReadCycle(cycle.signal);
  try {
    await readConfiguredStockPage({ base: '郑州' }, { ...io, now });
    await assert.rejects(
      readConfiguredStockPage(
        { base: '华东' },
        {
          now,
          execute: async (...args) => ({ ...(await io.execute(...args)), configVersion: 'v2' }),
        },
      ),
      { code: 'QUERY_CONFIG_CHANGED' },
    );
    cycle.abort();
    const n = io.calls.length;
    await assert.rejects(readConfiguredStockPage({ base: '华东' }, { ...io, now }), {
      name: 'AbortError',
    });
    assert.equal(io.calls.length, n);
    startConfiguredStockReadCycle(new AbortController().signal);
    await readConfiguredStockPage({ base: '华东' }, { ...io, now });
    assert.equal(io.calls.length - n, 3);
  } finally {
    startConfiguredStockReadCycle();
  }
});

test('base SKU rows publish the actual rolling shipment total and keep a real zero', async () => {
  const io = source();
  const result = await readConfiguredStockPage(
    { base: '郑州' },
    {
      now,
      execute: async (...args) => {
        const result = await io.execute(...args);
        if (args[1].queryId === 'page.sku-detail.atomic')
          result.rows.forEach((row, i) => {
            row.rolling_ship_positive = i === 0 ? 75 : 0;
          });
        return result;
      },
    },
  );
  assert.equal(result.rows[0]['safety_stock.last_30d_shipment_quantity'], 75);
  assert.equal(result.rows[1]['safety_stock.last_30d_shipment_quantity'], 0);
});
