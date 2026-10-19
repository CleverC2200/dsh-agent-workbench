import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const output = await build({
  entryPoints: ['business/shared/configured-history.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { historyPoints, readConfiguredHistory } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
const config = JSON.parse(await readFile('business/inventory-qll/sql.config.json', 'utf8'));
test('daily history keeps missing dates and incomplete base quantities null while retaining real zero', () => {
  const result = historyPoints(
    [
      { the_date: '2026-09-28', current_stock: 10, missing_current_stock: 0 },
      { the_date: '2026-09-28', current_stock: 20, missing_current_stock: 1 },
      { the_date: '2026-09-30', current_stock: 0, missing_current_stock: 0 },
    ],
    '2026-09-30',
  );
  assert.equal(result.length, 30);
  assert.equal(result[27].base, null);
  assert.equal(result[28].base, null);
  assert.equal(result[29].base, 0);
});
function source(change = false, total = 101) {
  const calls = [];
  return {
    calls,
    execute: async (_request, call) => {
      calls.push(call);
      assert.equal(call.queryId, 'stock_history.groups.atomic');
      const q = config.queries[call.queryId];
      const rows = Array.from(
        { length: Math.max(0, Math.min(call.values.page_size, total - call.values.offset)) },
        () =>
          Object.fromEntries(
            q.resultColumns.map((key) => [
              key,
              {
                page_scope_total: total,
                page_row_present: 1,
                the_date: '2026-09-30',
                current_stock: 1,
                missing_current_stock: 0,
              }[key] ?? null,
            ]),
          ),
      );
      return {
        rows,
        returnedColumns: q.resultColumns,
        configVersion: change && call.values.offset ? 'changed' : 'stable',
      };
    },
  };
}
test('history consumes all daily aggregates with fresh paging before showing the chart', async () => {
  const io = source();
  const points = await readConfiguredHistory(config, '2026-09-30', io);
  assert.equal(points.at(-1).base, 101);
  assert.deepEqual(
    io.calls.map((call) => [call.values.page_size, call.values.offset]),
    [
      [100, 0],
      [100, 100],
    ],
  );
});
test('changed configuration or an excessive collection rejects the chart instead of showing partial totals', async () => {
  await assert.rejects(
    readConfiguredHistory(config, '2026-09-30', source(true)),
    /历史范围发生变化/,
  );
  await assert.rejects(
    readConfiguredHistory(config, '2026-09-30', source(false, 10001)),
    /历史范围不可完整读取/,
  );
});
