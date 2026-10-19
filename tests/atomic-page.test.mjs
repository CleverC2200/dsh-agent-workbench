import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const bundled = await build({
  entryPoints: ['business/shared/configured-facts.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readConfiguredFacts } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
);
const config = JSON.parse(await readFile('business/inventory-dealer/sql.config.json', 'utf8'));
function io(total = 25, edit = () => {}) {
  const calls = [];
  return {
    calls,
    execute: async (_, call) => {
      calls.push(call);
      const columns = config.queries[call.queryId].resultColumns;
      let rows = call.queryId.endsWith('.atomic')
        ? Array.from({ length: Math.min(10, Math.max(0, total - call.values.offset)) }, (_, i) => ({
            ...Object.fromEntries(columns.map((k) => [k, null])),
            sku: String(call.values.offset + i),
            page_row_present: 1,
            page_scope_total: total,
          }))
        : [Object.fromEntries(columns.map((k) => [k, null]))];
      if (!rows.length)
        rows = [
          {
            ...Object.fromEntries(columns.map((k) => [k, null])),
            page_scope_total: total,
            page_row_present: null,
          },
        ];
      const r = { rows, returnedColumns: columns, rejectedColumns: [], configVersion: 'same' };
      edit(call, r);
      return r;
    },
  };
}
test('actual configured customer pages return fresh ten rows and total in one statement', async () => {
  const x = io();
  for (const page of [1, 2, 4]) {
    const r = await readConfiguredFacts(
      config,
      'customer-plan',
      { asOf: '2026-09-30', customer: 'A', page },
      x,
    );
    assert.equal(r.total, 25);
    assert.equal(r.rows.length, page === 4 ? 0 : 10);
    assert.equal(r.consistency, 'single_statement_page');
    assert.ok(r.rows.every((r) => !('page_scope_total' in r)));
  }
  const pages = x.calls.filter((c) => c.queryId.endsWith('.atomic'));
  assert.deepEqual(
    pages.map((c) => c.values.offset),
    [0, 10, 30],
  );
  assert.ok(pages.every((c) => c.values.page_size === 10 && c.values.customer === 'A'));
  assert.ok(!x.calls.some((c) => c.queryId.endsWith('.count')));
});
test('atomic empty scope is zero, never a fake detail row', async () => {
  const r = await readConfiguredFacts(
    config,
    'customer-plan',
    { asOf: '2026-09-30', customer: 'A' },
    io(0),
  );
  assert.equal(r.total, 0);
  assert.deepEqual(r.rows, []);
});
test('atomic incomplete data, denied columns and wrong sentinel fail without fallback', async () => {
  for (const mode of ['short', 'denied', 'sentinel']) {
    const x = io(25, (c, r) => {
      if (!c.queryId.endsWith('.atomic')) return;
      if (mode === 'short') r.rows.pop();
      if (mode === 'denied') r.rejectedColumns = ['page_scope_total'];
      if (mode === 'sentinel') r.rows[0].page_row_present = null;
    });
    await assert.rejects(
      readConfiguredFacts(config, 'customer-plan', { asOf: '2026-09-30', customer: 'A' }, x),
    );
    assert.equal(x.calls.filter((c) => c.queryId.endsWith('.atomic')).length, 1);
    assert.ok(!x.calls.some((c) => c.queryId.endsWith('.count')));
  }
});
