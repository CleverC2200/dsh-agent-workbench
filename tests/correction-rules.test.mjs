import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({
  stdin: {
    contents:
      "export * from './src/workbench/original/workbenches/regionalApproval/models/salesPlanCorrectionModel.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { correctionAdjustments, correctionDecision, correctionLine } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);

test('correction uses a fixed monthly baseline and absolute node decisions including explicit zero', () => {
  const sku = {
    qty: '30',
    amt: '70.37',
    price: '2.3456',
    adjAddQty: '2',
    adjCutQty: '0',
    regionAdjAddQty: '8',
    regionAdjCutQty: '0',
    regionConfirmedQty: '38',
  };
  assert.equal(correctionDecision(sku, 2, 'Y'), '8');
  assert.equal(
    correctionDecision({ ...sku, provinceAdjAddQty: '0', provinceAdjCutQty: '0' }, 2, 'Y'),
    '0',
  );
  assert.deepEqual(correctionLine(sku, '-3'), {
    baseQty: '30',
    qty: '27',
    amount: '63.33',
    delta: '-3',
    deltaAmount: '-7.04',
    addQty: '0',
    cutQty: '3',
    addAmount: '0.00',
    cutAmount: '7.04',
    participates: true,
  });
  assert.throws(() => correctionLine(sku, '-31'));
  assert.equal(correctionLine({ qty: '0', price: '1', amt: '0' }, '0').participates, false);
  assert.equal(correctionLine(sku, '-30').participates, true);
});
test('zero baseline cancellation sends an explicit zero decision instead of silently inheriting the previous addition', () => {
  const detail = {
    currentVersion: { status: 1, planTypeCode: 'Y' },
    skus: [{ skuCode: '123', qty: '0', amt: '0', price: '2', adjAddQty: '8', adjCutQty: '0' }],
  };
  assert.deepEqual(correctionAdjustments(detail, { 123: '0' }), [
    { skuCode: '123', adjustQty: '0' },
  ]);
});
