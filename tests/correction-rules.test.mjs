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
const { correctionDecision, correctionLine, correctionConfirmedQuantity } = await import(
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

test('纠偏确认量继承上游追加追减，但本节点显式确认量和零值优先', () => {
  const sku = { qty: '100', price: '8', adjAddQty: '2', adjCutQty: '0' };
  assert.equal(correctionConfirmedQuantity(sku, 1, 'Y', 'region'), '102');
  assert.equal(
    correctionConfirmedQuantity({ ...sku, regionConfirmedQty: '0.000' }, 1, 'Y', 'region'),
    '0',
  );
  assert.equal(
    correctionConfirmedQuantity({ ...sku, regionConfirmedQty: '108.000' }, 2, 'Y', 'province'),
    '108',
  );
  assert.equal(
    correctionConfirmedQuantity({ ...sku, provinceConfirmedQty: '90.000' }, 1, 'Y', 'region'),
    '102',
  );
});
