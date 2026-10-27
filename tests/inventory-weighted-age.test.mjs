import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const output = await build({
  entryPoints: ['business/shared/inventory-age.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { inventoryAverageAge, companyAverageAge } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
const group = (quantity, average) => ({
  age_weight_qty: quantity,
  weighted_age_sum: quantity * average,
});
test('combines raw batch weights across unequal pools, retaining zero-day inventory', () => {
  assert.equal(inventoryAverageAge(group(999, 10), group(1, 1033)), 11.023);
  assert.equal(inventoryAverageAge(group(90, 0), group(10, 100)), 10);
  assert.equal(inventoryAverageAge({ age_weight_qty: '10', weighted_age_sum: '155' }), 15.5);
});
test('unknown, invalid or missing weights never fall back to maxima or zero', () => {
  for (const value of [
    undefined,
    null,
    {},
    { max_age: 1033 },
    group(0, 10),
    group(-1, 10),
    { age_weight_qty: 100, weighted_age_sum: null },
    { age_weight_qty: '', weighted_age_sum: 0 },
  ]) {
    assert.equal(inventoryAverageAge(value), null);
  }
  assert.equal(inventoryAverageAge(group(100, 20), undefined), null);
  assert.equal(inventoryAverageAge(group(100, 0)), 0);
  assert.equal(inventoryAverageAge(group(100, 20), group(0, 0)), 20);
});
test('full-chain combines only same-snapshot base and branch facts', () => {
  const base = { snapshotDate: '2026-10-26', summary: group(900, 10) };
  const branch = { snapshotDate: '2026-10-26', summary: group(100, 50) };
  assert.equal(companyAverageAge(base, branch), 14);
  assert.equal(companyAverageAge(base, { ...branch, snapshotDate: '2026-10-25' }), null);
  assert.equal(companyAverageAge(base, { ...branch, summary: { total_qty: 100 } }), null);
});
