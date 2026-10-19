import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const out = await build({
  entryPoints: ['business/shared/configured-facts.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readConfiguredFacts } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
);
const config = JSON.parse(await readFile('business/inventory-dealer/sql.config.json', 'utf8'));
const view = config.sourceViews.views.find((v) => v.queryId === 'dealer.stock.customer');
assert.ok(view);
const input = { asOf: '2026-10-19' };
function source(edit = () => {}) {
  const calls = [];
  return {
    calls,
    execute: async (_, o) => {
      calls.push(o);
      const cols = config.queries[o.queryId].resultColumns;
      const r = {
        configVersion: 'v1',
        returnedColumns: cols,
        rows:
          o.queryId === view.snapshotQuery
            ? [{ day: '2026-10-17' }]
            : Array.from({ length: 10 }, (_, i) => ({
                ...Object.fromEntries(cols.map((k) => [k, null])),
                customer: String(o.values.offset + i),
                page_scope_total: 25,
                page_row_present: 1,
              })),
      };
      edit(o, r);
      return r;
    },
  };
}
test('page two keeps the resolved stock date while fetching ten fresh rows through GEA', async () => {
  const io = source();
  const a = await readConfiguredFacts(config, view.id, input, io),
    n = io.calls.length;
  const b = await readConfiguredFacts(
    config,
    view.id,
    { ...input, page: 2, readContext: a.readContext },
    io,
  );
  assert.deepEqual(
    io.calls.slice(n).map((c) => c.queryId),
    ['dealer.stock.customer.atomic'],
  );
  assert.equal(b.rows[0].customer, '10');
  assert.equal(b.rows.length, 10);
  assert.equal(b.snapshotDate, '2026-10-17');
  assert.equal(io.calls.at(-1).values.stat_date, '2026-10-17');
});
test('date/customer/filter changes or a fresh load resolve the snapshot again', async () => {
  for (const change of [
    { asOf: '2026-10-18' },
    { customer: 'A' },
    { filters: { category: '汤圆' } },
    null,
  ]) {
    const io = source();
    const a = await readConfiguredFacts(config, view.id, input, io),
      n = io.calls.length;
    await readConfiguredFacts(
      config,
      view.id,
      { ...input, ...change, readContext: change ? a.readContext : undefined },
      io,
    );
    assert.equal(io.calls[n].queryId, view.snapshotQuery);
  }
});
test('config changes and denied columns reject pinned pages without fallback', async () => {
  for (const mode of ['config', 'denied']) {
    let changed = false;
    const io = source((o, r) => {
      if (changed && o.queryId.endsWith('.atomic')) {
        if (mode === 'config') r.configVersion = 'v2';
        else r.rejectedColumns = ['page_scope_total'];
      }
    });
    const a = await readConfiguredFacts(config, view.id, input, io),
      n = io.calls.length;
    changed = true;
    await assert.rejects(
      readConfiguredFacts(config, view.id, { ...input, page: 2, readContext: a.readContext }, io),
      { code: mode === 'config' ? 'QUERY_CONFIG_CHANGED' : 'REQUIRED_COLUMN_UNAVAILABLE' },
    );
    assert.equal(io.calls.length - n, 1);
  }
});
