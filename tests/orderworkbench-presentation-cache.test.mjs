import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorkbenchPresentationCache,
  createWorkbenchEvidenceCache,
  createWorkbenchPeriodCacheLifecycle,
} from '../prototypes/inventory-orderworkbench/presentation-cache.mjs';
import { computeWorkbenchMetrics } from '../prototypes/inventory-orderworkbench/metric-model.mjs';

function navigationCache() {
  const reports = new Map();
  let now = 1000;
  const lifecycle = createWorkbenchPeriodCacheLifecycle(reports, {
    maxAge: 20 * 60 * 1000,
    now: () => now,
    reusable: (facts) => facts.complete === true,
  });
  const add = (key, overrides = {}) => {
    const entry = {
      controller: new AbortController(),
      readController: new AbortController(),
      loaded: true,
      finished: now,
      dirty: false,
      facts: { complete: true },
      edits: { risk: '人工内容' },
      persistence: {
        pending: () => false,
        cancel: () => {
          entry.cancelled = true;
        },
      },
      ...overrides,
    };
    reports.set(key, entry);
    return entry;
  };
  return {
    reports,
    lifecycle,
    add,
    advance: (milliseconds) => {
      now += milliseconds;
    },
  };
}

test('ordinary page disconnect and same-Session reconnect preserve completed reports and their presentation identity', () => {
  const { reports, lifecycle, add } = navigationCache();
  lifecycle.resume('orders-session');
  const week = add('week-4'),
    other = add('week-5');
  const originalFacts = week.facts,
    originalPersistence = week.persistence;
  lifecycle.suspend();
  assert.equal(week.readController.signal.aborted, true, 'old channel work is cancelled');
  assert.equal(week.controller.signal.aborted, false, 'the completed cache owner is retained');
  lifecycle.resume('orders-session');
  assert.equal(reports.get('week-4'), week);
  assert.equal(reports.get('week-5'), other);
  assert.equal(week.facts, originalFacts, 'derived WeakMap caches remain reusable');
  assert.equal(
    week.persistence,
    originalPersistence,
    'version ownership is not reconstructed from a stale snapshot',
  );
  assert.equal(week.edits.risk, '人工内容');
});

test('Session replacement, identity invalidation and a missing Session clear retained reports', () => {
  const { reports, lifecycle, add } = navigationCache();
  lifecycle.resume('old');
  const old = add('week');
  lifecycle.suspend();
  lifecycle.resume('new');
  assert.equal(reports.size, 0);
  assert.equal(old.controller.signal.aborted, true);
  assert.equal(old.cancelled, true);
  const current = add('new-week');
  lifecycle.clear();
  assert.equal(current.controller.signal.aborted, true);
  assert.equal(reports.size, 0);
  lifecycle.resume('new');
  const missing = add('week');
  assert.equal(lifecycle.resume(null), false);
  assert.equal(missing.cancelled, true);
  assert.equal(reports.size, 0);
});

test('unfinished, partial, dirty and saving reports are not revived across page reconnects', () => {
  const { reports, lifecycle, add } = navigationCache();
  lifecycle.resume('orders');
  const entries = [
    add('unfinished', { finished: undefined }),
    add('partial', { facts: { complete: false } }),
    add('dirty', { dirty: true }),
    add('saving', { persistence: { pending: () => true, cancel() {} } }),
    add('unloaded', { loaded: false }),
  ];
  const good = add('complete');
  lifecycle.suspend();
  assert.deepEqual([...reports.keys()], ['complete']);
  for (const entry of entries) assert.equal(entry.controller.signal.aborted, true);
  assert.equal(good.controller.signal.aborted, false);
});

test('navigation does not extend the twenty-minute report cache lifetime', () => {
  const { reports, lifecycle, add, advance } = navigationCache();
  lifecycle.resume('orders');
  const entry = add('week');
  advance(19 * 60 * 1000);
  lifecycle.suspend();
  lifecycle.resume('orders');
  assert.equal(reports.get('week'), entry);
  advance(60 * 1000);
  lifecycle.suspend();
  lifecycle.resume('orders');
  assert.equal(reports.size, 0);
  assert.equal(entry.controller.signal.aborted, true);
});

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
