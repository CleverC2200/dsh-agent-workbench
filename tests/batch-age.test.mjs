import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const config = JSON.parse(await readFile('business/inventory-aqkc/sql.config.json', 'utf8'));
const built = await build({
  entryPoints: ['business/shared/batch-age.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readBatchAge, batchAgeShare } = await import(
  'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
);
function source(adapt = () => {}) {
  const calls = [];
  const execute = async (_, call) => {
    calls.push(call);
    const columns = config.queries[call.queryId].resultColumns;
    const rows =
      call.queryId === 'source.health-date'
        ? [{ day: '2026-10-22' }]
        : Array.from({ length: 2 }, (_, i) => ({
            ...Object.fromEntries(columns.map((c) => [c, '0'])),
            level: 'S' + i,
            material_code: 'S' + i,
            material_name: null,
            warning: null,
            average_age: '53.5',
            max_age: '60',
            page_scope_total: 12,
            page_row_present: 1,
          }));
    const result = { rows, configVersion: 'v1', returnedColumns: columns, rejectedColumns: [] };
    adapt(call, result);
    return result;
  };
  return { calls, execute };
}
test('batch pages bind snapshot-aligned shipment dates and only the requested server page', async () => {
  const io = source();
  const r = await readBatchAge(
    config,
    {
      asOf: '2026-10-23',
      groupBy: 'sku',
      bases: ['郑州'],
      page: 2,
      pageSize: 10,
      search: 'a%_b',
      sort: { key: 'total_qty', direction: 'desc' },
    },
    io,
  );
  assert.equal(r.total, 12);
  assert.equal(r.rows[0].average_age, 53.5);
  assert.deepEqual(
    io.calls.map((c) => c.queryId),
    ['source.health-date', 'batch-age.atomic'],
  );
  assert.deepEqual(
    [io.calls[1].values.batch_rolling_start, io.calls[1].values.batch_end_exclusive],
    ['20260923', '20261023'],
  );
  assert.equal(io.calls[1].values.offset, 10);
  assert.equal(io.calls[1].values.search_pattern, '%a\\%\\_b%');
  assert.equal(io.calls[1].values.sort_field, 'total_qty');
});
test('denied snapshot stops after one request and changed config cannot mix result rows', async () => {
  const denied = source((_, r) => {
    r.success = false;
    r.failure = { reasonCode: 'ROW_SCOPE_DENIED' };
  });
  await assert.rejects(readBatchAge(config, { asOf: '2026-10-22', groupBy: 'base' }, denied), {
    code: 'ROW_SCOPE_DENIED',
  });
  assert.equal(denied.calls.length, 1);
  const changed = source((c, r) => {
    if (c.queryId === 'batch-age.atomic') r.configVersion = 'v2';
  });
  await assert.rejects(
    readBatchAge(config, { asOf: '2026-10-22', groupBy: 'base' }, changed),
    /QUERY_CONFIG_CHANGED/,
  );
});
test('quantity shares keep zero distinct from unavailable and never use maximum ages as weights', () => {
  assert.equal(batchAgeShare('10', '150'), '10 / 6.7%');
  assert.equal(batchAgeShare(0, 100), '0 / 0.0%');
  assert.equal(batchAgeShare(null, 100), '-');
  assert.equal(batchAgeShare(false, 100), '-');
});
