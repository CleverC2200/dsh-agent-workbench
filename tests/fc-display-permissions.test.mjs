import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const output = await build({
  entryPoints: ['business/shared/configured-facts.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readConfiguredFacts } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
function fixture(rejected, denial = false) {
  const calls = [];
  return {
    calls,
    execute: async (_, { queryId }) => {
      calls.push(queryId);
      if (queryId === 'source.branch-stock-date')
        return { rows: [{ day: '2026-11-02' }], configVersion: 'v1', returnedColumns: ['day'] };
      if (denial)
        return {
          success: false,
          failure: { reasonCode: 'DATA_PERMISSION_DENIED', stage: 'AUTHORIZE' },
        };
      const fields = config.queries[queryId].resultColumns.filter(
        (field) => !rejected.includes(field),
      );
      const values = {
        warehouse_code: 'A020',
        sku: '10000034',
        page_scope_total: 1,
        page_row_present: 1,
        inventory_qty: 125,
        recommended_qty: 10,
      };
      return {
        rows: [Object.fromEntries(fields.map((field) => [field, values[field] ?? null]))],
        returnedColumns: fields,
        rejectedColumns: rejected.map((outputAlias) => ({
          outputAlias,
          reasonCode: 'RETURN_DENIED',
        })),
        configVersion: 'v1',
      };
    },
  };
}
const input = { asOf: '2026-11-02', page: 1, pageSize: 10 };

test('optional display labels do not discard authorized quantities or invent absent values', async () => {
  const io = fixture(['material_name', 'material_group', 'page_scope_has_material_group']);
  const page = await readConfiguredFacts(config, 'replenishment', input, {
    execute: io.execute,
    detailsOnly: true,
  });
  assert.equal(page.rows[0].inventory_qty, 125);
  assert.equal(page.total, 1);
  assert.equal(page.partial, true);
  assert.deepEqual(
    page.unavailableLabels.sort(),
    ['material_name', 'material_group', 'page_scope_has_material_group'].sort(),
  );
  assert.equal(Object.hasOwn(page.rows[0], 'material_name'), false);
  assert.equal(io.calls.filter((id) => id === 'replenishment.detail.atomic').length, 1);
});

test('quantity and pagination permissions remain mandatory', async () => {
  for (const field of [
    'inventory_qty',
    'warehouse_code',
    'sku',
    'page_scope_total',
    'page_row_present',
  ]) {
    const io = fixture([field]);
    await assert.rejects(
      readConfiguredFacts(config, 'replenishment', input, {
        execute: io.execute,
        detailsOnly: true,
      }),
      { code: 'REQUIRED_COLUMN_UNAVAILABLE' },
    );
  }
});

test('table authorization denial is surfaced once without alternate queries', async () => {
  const io = fixture([], true);
  await assert.rejects(
    readConfiguredFacts(config, 'replenishment', input, { execute: io.execute, detailsOnly: true }),
    { code: 'DATA_PERMISSION_DENIED' },
  );
  assert.deepEqual(io.calls, ['source.branch-stock-date', 'replenishment.detail.atomic']);
});

test('non-display reads retain the complete field contract', async () => {
  const io = fixture(['material_name']);
  await assert.rejects(
    readConfiguredFacts(config, 'replenishment', input, { execute: io.execute }),
    { code: 'REQUIRED_COLUMN_UNAVAILABLE' },
  );
});
