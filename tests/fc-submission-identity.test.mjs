import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const compiled = await build({
  entryPoints: ['business/shared/fc-submission-identity.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { fcSubmissionIdentity } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const input = {
  warehouseCode: '001',
  month: '2026-10',
  snapshotVersion: 'snapshot-1',
  planRevision: '1',
  cycleRevision: '1',
  consumptionReviewed: true,
  rows: [{ sku: '01', productName: '产品', recommendedQty: 10, actualQty: 10, reason: '' }],
  order: {
    customerCode: 'C1',
    addressCode: 'A1',
    pupCode: '01',
    itemList: [{ productCode: '01', quantity: 10 }],
  },
};
test('same confirmation survives rerender, reload and object key ordering', async () => {
  const first = await fcSubmissionIdentity(input);
  assert.deepEqual(await fcSubmissionIdentity(structuredClone(input)), first);
  const reordered = Object.fromEntries(Object.entries(input).reverse());
  assert.equal((await fcSubmissionIdentity(reordered)).aiPreOrderCode, first.aiPreOrderCode);
});
test('same month and same DMS quantity can form a new batch when snapshot or saved configuration changes', async () => {
  const first = await fcSubmissionIdentity(input);
  for (const patch of [
    { snapshotVersion: 'snapshot-2' },
    { planRevision: '2' },
    { cycleRevision: '2' },
  ]) {
    const next = await fcSubmissionIdentity({ ...input, ...patch });
    assert.notEqual(next.aiPreOrderCode, first.aiPreOrderCode);
    assert.equal(next.legacyAiPreOrderCode, first.legacyAiPreOrderCode);
  }
});
test('confirmation reductions including zero and review status belong to the batch identity', async () => {
  const first = await fcSubmissionIdentity(input);
  for (const patch of [
    { consumptionReviewed: false },
    {
      rows: [
        ...input.rows,
        { sku: '02', productName: '产品2', recommendedQty: 2, actualQty: 0, reason: '已消化' },
      ],
    },
  ])
    assert.notEqual(
      (await fcSubmissionIdentity({ ...input, ...patch })).aiPreOrderCode,
      first.aiPreOrderCode,
    );
});
test('confirmation row ordering does not create a new batch', async () => {
  const rows = [...input.rows, { ...input.rows[0], sku: '02' }];
  assert.equal(
    (await fcSubmissionIdentity({ ...input, rows })).aiPreOrderCode,
    (await fcSubmissionIdentity({ ...input, rows: rows.toReversed() })).aiPreOrderCode,
  );
});
