import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const out = await build({
  stdin: {
    contents:
      "export {resolveFcDataDay} from './business/shared/fc-data-day'; export {readConfiguredFacts} from './business/shared/configured-facts'; export {refreshConfiguredQueries} from './business/shared/query-cache';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { resolveFcDataDay, readConfiguredFacts, refreshConfiguredQueries } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
);
const production = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
function fixture() {
  const config = structuredClone(production);
  delete config.dailySummary.bundle;
  const calls = [];
  let day = '2026-11-05';
  const execute = async (_request, options) => {
    calls.push({ id: options.queryId, values: options.values });
    const q = config.queries[options.queryId];
    const row = Object.fromEntries(q.resultColumns.map((key) => [key, 0]));
    if (options.queryId === 'summary.snapshot')
      Object.assign(row, {
        batch_id: 'batch-' + day,
        business_date: day,
        stock_date: '2026-11-04',
        target_month: '2026-11-01',
      });
    else if (options.queryId === 'snapshot.source.branch-stock-date')
      Object.assign(row, {
        day: '2026-11-04',
        row_count: 1,
        total_qty: 80,
        available_qty: 70,
        pack_unit_qty: 10,
        freeze_qty: 0,
      });
    else
      Object.assign(row, {
        row_count: 1,
        warehouse_count: 1,
        warehouse_code: 'A110',
        warehouse_name: '测试分仓',
        sku: 'SKU1',
        material_name: '产品1',
        stock_date: '2026-11-04',
        page_scope_total: 1,
        page_row_present: 1,
        recommended_qty: 32,
        known_preparing: 12,
        known_in_transit: 27,
      });
    return {
      rows: [row],
      configVersion: 'fixed',
      returnedColumns: q.resultColumns,
      rejectedColumns: [],
    };
  };
  return {
    config,
    calls,
    execute,
    setDay: (value) => {
      day = value;
    },
  };
}
const input = {
  asOf: '2026-11-06',
  page: 1,
  pageSize: 10,
  cycleDays: 7,
  filters: {},
  replenishment: { neededOnly: false, businessOnly: false, positiveActualKeys: [] },
};
test('late daily sync cannot blank replenishment after midnight; every branch calculation uses one batch day', async () => {
  const f = fixture();
  await assert.rejects(
    readConfiguredFacts(f.config, 'replenishment', input, {
      execute: f.execute,
      summaryOnly: true,
    }),
    (e) => e.code === 'SUMMARY_SCOPE_NOT_COVERED',
  );
  const date = await resolveFcDataDay(f.config, input.asOf, { execute: f.execute });
  assert.equal(date, '2026-11-05');
  const summary = await readConfiguredFacts(
    f.config,
    'replenishment',
    { ...input, asOf: date },
    { execute: f.execute, summaryOnly: true },
  );
  const list = await readConfiguredFacts(
    f.config,
    'replenishment',
    { ...input, asOf: date },
    { execute: f.execute, detailsOnly: true },
  );
  assert.equal(summary.status, 'available');
  assert.equal(summary.summary.recommended_qty, 32);
  assert.equal(summary.summary.known_preparing, 12);
  assert.equal(summary.summary.known_in_transit, 27);
  assert.equal(list.status, 'available');
  assert.equal(list.rows[0].sku, 'SKU1');
  assert.equal(
    f.calls.filter((c) => c.id === 'summary.snapshot').length,
    1,
    'date resolution must reuse the existing daily snapshot read',
  );
  assert.ok(
    f.calls
      .filter((c) => c.id.startsWith('snapshot-default.replenishment'))
      .every((c) => c.values.as_of === undefined || c.values.as_of === '2026-11-05'),
  );
  assert.ok(
    f.calls.every((c) => !c.id.startsWith('replenishment.')),
    'never use raw source as a fallback',
  );
});
test('explicit refresh advances the batch day and month rollover keeps the prior complete planning calendar', async () => {
  const f = fixture();
  f.setDay('2026-11-30');
  assert.equal(
    await resolveFcDataDay(f.config, '2026-12-01', { execute: f.execute }),
    '2026-11-30',
  );
  f.setDay('2026-12-01');
  refreshConfiguredQueries();
  assert.equal(
    await resolveFcDataDay(f.config, '2026-12-01', { execute: f.execute }),
    '2026-12-01',
  );
});
test('denied metadata and future-dated batches are not replaced with another source', async () => {
  const f = fixture();
  f.setDay('2026-11-07');
  await assert.rejects(
    resolveFcDataDay(f.config, '2026-11-06', { execute: f.execute }),
    /晚于当前/,
  );
  const denied = async () => {
    throw Object.assign(Error('denied'), { code: 'ROW_SCOPE_DENIED' });
  };
  await assert.rejects(resolveFcDataDay(f.config, '2026-11-06', { execute: denied }), /denied/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    resolveFcDataDay(f.config, '2026-11-06', { execute: f.execute, signal: controller.signal }),
    { name: 'AbortError' },
  );
});
