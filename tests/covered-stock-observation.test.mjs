import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const output = await build({
  entryPoints: ['../dsh-agent-manage/src/aps-compute/classified-stock.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { stockCoverageObservation } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
const data = (rows, status = 'ready') => ({ sections: [{ id: 'stock', status, rows }] });
const row = (base, records, count, quantity, demand) => ({
  base,
  records,
  covered_shippable_count: count,
  covered_shippable_quantity: quantity,
  covered_shippable_demand: demand,
});
test('matched sums, not group averages, retain partial coverage and zero-demand inventory', () => {
  const d = data([row('A', 5, 2, 80, 10), row('A', 3, 1, 20, 0), row('B', 2, 0, null, null)]);
  assert.deepEqual(stockCoverageObservation(d).shippable, {
    count: 3,
    total: 10,
    quantity: 100,
    demand: 10,
    days: 10,
  });
  assert.equal(stockCoverageObservation(d, 'A').shippable.total, 8);
  assert.equal(stockCoverageObservation(d, 'B').shippable, null);
});
test('missing aggregates, failed source and zero denominator never fabricate days', () => {
  assert.equal(stockCoverageObservation(data([row('A', 2, 1, 0, 0)])).shippable.days, null);
  assert.equal(stockCoverageObservation(data([row('A', 2, 1, null, 2)])).shippable, null);
  assert.equal(stockCoverageObservation(data([row('A', 2, 3, 2, 2)])).shippable, null);
  assert.equal(stockCoverageObservation(data([{ records: 2 }])).shippable, null);
  assert.equal(stockCoverageObservation(data([row('A', 2, 1, 4, 2)], 'error')), null);
  assert.equal(stockCoverageObservation(data([row('A', 2, 1, 0, 3)])).shippable.days, 0);
});
