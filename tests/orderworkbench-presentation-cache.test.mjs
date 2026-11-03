import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorkbenchPresentationCache,
  createWorkbenchEvidenceCache,
} from '../prototypes/inventory-orderworkbench/presentation-cache.mjs';
import { computeWorkbenchMetrics } from '../prototypes/inventory-orderworkbench/metric-model.mjs';

const factsFor = (orders) => {
  const period = {
    start: '2026-10-01',
    end: '2026-10-26',
    sections: [
      { id: 'orders', status: 'ready', rows: orders },
      ...['ontime', 'stock', 'ages', 'changes'].map((id) => ({ id, status: 'ready', rows: [] })),
    ],
  };
  period.metrics = computeWorkbenchMetrics(period);
  return {
    selected: 'week',
    complete: true,
    periods: Object.fromEntries(
      ['month', 'week', 'previousMonth', 'previousWeek', 'yearMonth', 'yearWeek'].map((key) => [
        key,
        period,
      ]),
    ),
    directors: { status: 'ready', rows: [] },
    customers: { rows: [] },
  };
};

test('dimension and evidence caches reuse only the same data snapshot and view options', () => {
  const read = createWorkbenchPresentationCache(),
    evidence = createWorkbenchEvidenceCache();
  const facts = factsFor([{ base: '华东', item: '水饺', demand: 100, shortage: 1, invalid: 0 }]);
  const options = { dimension: 'base-performance' };
  const first = read(facts, options);
  const missingCell = first.performance['base-performance'].month[0][4];
  assert.equal(missingCell.text, '—');
  assert.match(missingCell.title, /源数据|计算|分组/);
  assert.equal(read(facts, { ...options }), first);
  assert.equal(evidence(facts), evidence(facts));
  assert.notEqual(read(facts, { dimension: 'item-performance' }), first);
  assert.notEqual(read(facts, { ...options, skuPages: { 水饺: 1 } }), first);
  const refreshed = factsFor([
    { base: '华东', item: '水饺', demand: 100, shortage: 20, invalid: 0 },
  ]);
  assert.notEqual(read(refreshed, options), first);
  assert.notEqual(evidence(refreshed), evidence(facts));
  assert.equal(
    read(refreshed, options).cards.find((card) => card.key === '订单满足率').value,
    '80.00',
  );
  assert.equal(evidence(null), null);
});

test('dimension grouping scans source rows independently of the number of bases', () => {
  let baseReads = 0;
  const orders = Array.from({ length: 1600 }, (_, index) => ({
    get base() {
      baseReads++;
      return `基地${index % 200}`;
    },
    item: '水饺',
    demand: 100,
    shortage: 1,
    invalid: 0,
  }));
  const facts = factsFor(orders);
  baseReads = 0;
  const read = createWorkbenchPresentationCache();
  const result = read(facts, { dimension: 'base-performance' });
  assert.equal(result.performance['base-performance'].month.length, 201);
  assert.ok(baseReads < orders.length * 30, `unexpected repeated full scans: ${baseReads}`);
  const firstReads = baseReads;
  read(facts, { dimension: 'base-performance' });
  assert.equal(baseReads, firstReads);
});
