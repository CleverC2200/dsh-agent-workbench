import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const out = await build({
  entryPoints: ['business/shared/fact-display.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { formatFactValue } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('numeric source decimals stay exact and readable while identifiers retain leading zeros', () => {
  assert.equal(formatFactValue('00100234'), '00100234');
  assert.equal(formatFactValue('9007199254740993.123400', 'decimal'), '9,007,199,254,740,993.1234');
  assert.equal(formatFactValue('0.00001200', 'decimal'), '0.000012');
  assert.equal(formatFactValue('-1200.5000', 'decimal'), '-1,200.5');
  assert.equal(formatFactValue('0.0000', 'decimal'), '0');
  assert.equal(formatFactValue(null, 'decimal'), '-');
  assert.equal(formatFactValue('', 'decimal'), '-');
  assert.equal(formatFactValue('NaN', 'decimal'), '-');
  assert.equal(formatFactValue('0.9700', 'decimal'), '0.97');
  assert.equal(formatFactValue(1e-9, 'decimal'), '0.000000001');
  assert.equal(formatFactValue(1e21, 'decimal'), '1,000,000,000,000,000,000,000');
  assert.equal(formatFactValue(-0, 'decimal'), '0');
});

test('Doris scientific DECIMAL zero is displayed as zero without losing significant digits', () => {
  assert.equal(formatFactValue('0E-8', 'decimal'), '0');
  assert.equal(
    formatFactValue('9.0071992547409931234E+15', 'decimal'),
    '9,007,199,254,740,993.1234',
  );
  assert.equal(formatFactValue('-1.23e-4', 'decimal'), '-0.000123');
  assert.equal(formatFactValue('1e99999', 'decimal'), '-');
  assert.equal(formatFactValue('0', 'percent'), '0%');
  assert.equal(formatFactValue('0.9481', 'percent'), '94.81%');
  assert.equal(formatFactValue('29.25099965', 'decimal2'), '29.25');
});
