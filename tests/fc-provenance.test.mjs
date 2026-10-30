import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const b = await build({
  entryPoints: ['business/shared/fc-provenance.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { fcSubmissionProvenance } = await import(
  'data:text/javascript;base64,' + Buffer.from(b.outputFiles[0].text).toString('base64')
);
const plan = { warehouseCode: '001', month: '2026-10', sku: 'S1', outboundQty: 31, transferQty: 0 };
const cycle = { days: 7, rules: [] };
const input = {
  warehouse: '001',
  asOf: '2026-10-26',
  plans: [plan],
  ...cycle,
  stored: {
    '001': {
      plans: { revision: '4', value: { plans: [plan] } },
      cycles: { revision: '2', value: cycle },
    },
  },
  rows: [
    { sku: 'S1', stock_date: '2026-10-25', inventory_qty: 5, available_qty: 4, recommended_qty: 6 },
  ],
};
test('binds the exact loaded versions and fingerprints actual calculation inputs', async () => {
  const r = await fcSubmissionProvenance(input);
  assert.equal(r.planRevision, '4');
  assert.equal(r.cycleRevision, '2');
  assert.match(r.snapshotVersion, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(r.calculationContext.stockDates, ['2026-10-25']);
  const changed = await fcSubmissionProvenance({
    ...input,
    rows: [{ ...input.rows[0], available_qty: 3 }],
  });
  assert.notEqual(r.snapshotVersion, changed.snapshotVersion);
});
test('unsaved plan or cycle edit cannot claim the loaded version', async () => {
  const r = await fcSubmissionProvenance({
    ...input,
    plans: [{ ...plan, outboundQty: 62 }],
    days: 14,
  });
  assert.equal(r.planRevision, '0');
  assert.equal(r.cycleRevision, '0');
  assert.equal(r.calculationContext.planSource, 'human-trial');
  assert.equal(r.calculationContext.cycleSource, 'page-trial');
});
test('BI and untouched defaults are explicit; another warehouse rule is not attributed here', async () => {
  const r = await fcSubmissionProvenance({
    ...input,
    plans: [],
    stored: {},
    days: 14,
    rules: [{ level: 'sku', object: 'S1', days: 14, from: '', to: '' }],
    cycleWarehouse: 'OTHER',
  });
  assert.equal(r.calculationContext.planSource, 'BI');
  assert.equal(r.calculationContext.cycleSource, 'default');
  assert.deepEqual(r.calculationContext.cycle, { days: 7, rules: [] });
});
test('row order does not change the content identity', async () => {
  const rows = [...input.rows, { ...input.rows[0], sku: 'S2' }];
  assert.equal(
    (await fcSubmissionProvenance({ ...input, rows })).snapshotVersion,
    (await fcSubmissionProvenance({ ...input, rows: rows.toReversed() })).snapshotVersion,
  );
});

test('numeric database strings and numbers produce the same evidence identity', async () => {
  const a = await fcSubmissionProvenance(input);
  const b = await fcSubmissionProvenance({
    ...input,
    rows: [{ ...input.rows[0], available_qty: '4.000', recommended_qty: '6' }],
  });
  assert.equal(a.snapshotVersion, b.snapshotVersion);
  assert.equal(b.calculationContext.evidence[0].recommended_qty, 6);
});
