import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { directSourceFixture } from './fixtures/configured-page.mjs';

const config = directSourceFixture(
  JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8')),
);
const bundle = await build({
  entryPoints: ['business/shared/configured-facts.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readConfiguredFacts } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

for (const mode of ['tagged', 'empty', 'denied']) {
  test(`aging product label ${mode} preserves the authorized inventory page and total`, async () => {
    const calls = [];
    const execute = async (_request, { queryId }) => {
      calls.push(queryId);
      const query = config.queries[queryId];
      if (queryId === 'source.branch-stock-date')
        return {
          rows: [{ day: '2026-11-04' }],
          returnedColumns: query.resultColumns,
          rejectedColumns: [],
          configVersion: 'fixture',
        };
      assert.equal(queryId, 'batch-age.atomic');
      const row = {
        ...Object.fromEntries(query.resultColumns.map((field) => [field, null])),
        material_code: 'TAGGED',
        total_qty: 10,
        scope_total_qty: 10,
        page_scope_total: 1,
        page_row_present: 1,
        product_tag: mode === 'tagged' ? '即将下市' : null,
      };
      if (mode === 'denied') delete row.product_tag;
      return {
        rows: [row],
        returnedColumns: query.resultColumns.filter(
          (field) => mode !== 'denied' || field !== 'product_tag',
        ),
        rejectedColumns: mode === 'denied' ? [{ outputAlias: 'product_tag' }] : [],
        configVersion: 'fixture',
      };
    };
    const result = await readConfiguredFacts(
      config,
      'inventory',
      { asOf: '2026-11-05' },
      { execute },
    );
    assert.equal(result.status, 'available');
    assert.equal(result.rows[0].total_qty, 10);
    assert.equal(result.total, 1);
    assert.equal(result.tableSummary.total_qty, 10);
    assert.equal(
      result.rows[0].product_tag,
      mode === 'tagged' ? '即将下市' : mode === 'empty' ? null : undefined,
    );
    assert.deepEqual(result.unavailableLabels, mode === 'denied' ? ['product_tag'] : []);
    assert.deepEqual(calls, ['source.branch-stock-date', 'batch-age.atomic']);
  });
}
