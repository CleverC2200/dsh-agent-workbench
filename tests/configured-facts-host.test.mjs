import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
const bundle = await build({
  entryPoints: ['business/shared/configured-facts.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readConfiguredFacts } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);

test('independent Host reads use the current installed config rather than a prior call default', async () => {
  const cycles = [];
  const revised = structuredClone(config);
  revised.queries['replenishment.detail'].request.parameters.gea_p2303 = 14;
  for (const active of [config, revised]) {
    const result = await readConfiguredFacts(
      active,
      'replenishment',
      { asOf: '2026-10-23' },
      {
        summaryOnly: true,
        execute: async (request, call) => {
          const query = active.queries[call.queryId];
          const values =
            call.queryId === 'source.branch-stock-date'
              ? { day: '2026-10-22' }
              : { row_count: 1, recommended_qty: 35 };
          if (call.queryId === 'replenishment.summary') cycles.push(request.parameters.gea_p2303);
          return {
            rows: [
              Object.fromEntries(query.resultColumns.map((name) => [name, values[name] ?? 0])),
            ],
            returnedColumns: query.resultColumns,
            rejectedColumns: [],
            configVersion: active === config ? 'first' : 'revised',
          };
        },
      },
    );
    assert.equal(result.summary.recommended_qty, 35);
  }
  assert.deepEqual(cycles, [7, 14]);
});
