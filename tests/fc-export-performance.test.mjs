import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
const calls = [];
let mode = 'stable',
  attempt = 0;
globalThis.document = {
  getElementById: (id) =>
    id === 'agent-sql-direct'
      ? {
          textContent: JSON.stringify({ path: '/api/agents/inventory-fc/query', token: 'fixture' }),
        }
      : null,
};
globalThis.fetch = async (_url, init) => {
  const { queryId, parameters: values } = JSON.parse(init.body);
  calls.push({ queryId, values });
  const q = config.queries[queryId];
  if (values.offset === 0) attempt++;
  if (mode === 'denied')
    return new Response(JSON.stringify({ message: 'ROW_SCOPE_DENIED', code: 'ROW_SCOPE_DENIED' }), {
      status: 403,
    });
  let rows;
  if (queryId.startsWith('source.')) rows = [{ day: '2026-10-28' }];
  else {
    const total =
      mode === 'changing' || (mode === 'recover' && attempt === 1 && values.offset > 0)
        ? 2472
        : mode === 'recover' && attempt > 1
          ? 2472
          : mode === 'small'
            ? 150
            : 2471;
    const actualTotal = mode === 'changing' && values.offset === 0 ? 2471 : total;
    rows = Array.from(
      { length: Math.max(0, Math.min(values.page_size, total - values.offset)) },
      (_, i) => ({
        ...Object.fromEntries(q.resultColumns.map((k) => [k, null])),
        warehouse_code: 'A020',
        sku: String(values.offset + i),
        warehouse_name: '长沙',
        material_name: '商品',
        stat_month: '202610',
        month_out_plan: 310,
        period_next_out: 600,
        page_scope_total: actualTotal,
        page_row_present: 1,
      }),
    );
  }
  return new Response(
    JSON.stringify({
      rows,
      configVersion: 'same-config',
      returnedColumns: q.resultColumns,
      rejectedColumns: [],
    }),
  );
};
await mkdir('.scratch', { recursive: true });
await build({
  entryPoints: ['business/inventory-fc/source/inventory-light-plugins/src/pages/fc-workflow.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: '.scratch/fc-export-performance.mjs',
  external: ['zod'],
});
const { readFcActionRows } = await import(
  pathToFileURL(resolve('.scratch/fc-export-performance.mjs'))
);
test('full plan export uses bounded lightweight reads rather than scanning aging and shipment facts fifty times', async () => {
  const rows = await readFcActionRows(
    { config, viewId: 'plan', input: { asOf: '2026-10-28', filters: {} } },
    new AbortController().signal,
  );
  assert.equal(rows.length, 2471);
  assert.equal(new Set(rows.map((r) => r.sku)).size, 2471);
  const pages = calls.filter((c) => !c.queryId.startsWith('source.'));
  assert.ok(pages.length <= 13, `expected at most 13 bounded requests; got ${pages.length}`);
  for (const page of pages) {
    assert.ok(page.values.page_size <= 200);
    assert.doesNotMatch(
      config.queries[page.queryId].request.sql,
      /agents_scm_cust_deliv_daily_di|inventory_batch_ages/,
    );
  }
});

test('a changed source count discards the prefix and restarts the entire collection once', async () => {
  calls.length = 0;
  attempt = 0;
  mode = 'recover';
  const rows = await readFcActionRows(
    { config, viewId: 'plan', input: { asOf: '2026-10-28', filters: { warehouse_code: 'A020' } } },
    new AbortController().signal,
  );
  assert.equal(rows.length, 2472);
  assert.equal(new Set(rows.map((r) => r.sku)).size, 2472);
  assert.equal(attempt, 2);
  assert.ok(
    calls.every(
      (c) => c.values.warehouse_code === 'A020' && c.values.warehouse_code_mode === 'equal',
    ),
  );
});
test('permission denial does not retry or return a partial download', async () => {
  calls.length = 0;
  attempt = 0;
  mode = 'denied';
  await assert.rejects(
    readFcActionRows(
      { config, viewId: 'plan', input: { asOf: '2026-10-28', filters: {} } },
      new AbortController().signal,
    ),
    { code: 'ROW_SCOPE_DENIED' },
  );
  assert.equal(calls.length, 1);
});
test('continually changing source fails after one bounded restart', async () => {
  calls.length = 0;
  attempt = 0;
  mode = 'changing';
  await assert.rejects(
    readFcActionRows(
      { config, viewId: 'plan', input: { asOf: '2026-10-28', filters: {} } },
      new AbortController().signal,
    ),
    { code: 'SOURCE_CHANGED' },
  );
  assert.equal(attempt, 2);
});

test('replenishment confirmation reads 200 rows per batch and reports complete progress', async () => {
  calls.length = 0;
  mode = 'stable';
  const progress = [];
  const rows = await readFcActionRows(
    { config, viewId: 'replenishment', input: { asOf: '2026-10-28', filters: {} } },
    new AbortController().signal,
    (loaded, total) => progress.push([loaded, total]),
  );
  assert.equal(rows.length, 2471);
  assert.equal(new Set(rows.map((r) => r.sku)).size, 2471);
  const pages = calls.filter((c) => c.queryId.includes('atomic'));
  assert.equal(pages.length, 13);
  assert.ok(pages.every((c) => c.values.page_size === 200));
  assert.deepEqual(progress[0], [200, 2471]);
  assert.deepEqual(progress.at(-1), [2471, 2471]);
  assert.ok(progress.every((p, i) => i === 0 || p[0] > progress[i - 1][0]));
});

test('confirmation within the transport limit reads all rows in a single detail request', async () => {
  calls.length = 0;
  mode = 'small';
  const rows = await readFcActionRows(
    {
      config,
      viewId: 'replenishment',
      input: { asOf: '2026-10-28', filters: { warehouse_code: 'A020' } },
    },
    new AbortController().signal,
  );
  assert.equal(rows.length, 150);
  const pages = calls.filter((c) => c.queryId.includes('atomic'));
  assert.equal(pages.length, 1);
  assert.equal(pages[0].values.page_size, 200);
  assert.equal(pages[0].values.warehouse_code, 'A020');
});

test('template download preserves fuzzy warehouse filter with exact submission scope', async () => {
  calls.length = 0;
  mode = 'small';
  await readFcActionRows(
    {
      config,
      viewId: 'plan',
      input: {
        asOf: '2026-10-28',
        filters: {
          warehouse_code: 'A020',
          warehouse_search: ' 长沙%_ ',
        },
      },
    },
    new AbortController().signal,
  );
  assert.ok(calls.length > 0);
  for (const call of calls) {
    assert.equal(call.values.warehouse_code, 'A020');
    assert.equal(call.values.warehouse_search_pattern, '%长沙\\%\\_%');
  }
});
