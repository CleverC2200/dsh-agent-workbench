import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameProgress } from '../business/shared/frame-progress.js';
import { startDashboardTiming } from '../business/shared/dashboard-timing.js';

test('progress bursts paint once; cancellation and final results discard queued partials', () => {
  const frames = new Map();
  let next = 0;
  const scheduler = {
    requestAnimationFrame: (callback) => {
      frames.set(++next, callback);
      return next;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  const output = [];
  const controller = new AbortController();
  const progress = createFrameProgress((value) => output.push(value), controller.signal, scheduler);
  for (let section = 1; section <= 30; section++) progress.push({ section });
  assert.equal(frames.size, 1);
  const paint = [...frames.values()][0];
  frames.clear();
  paint();
  assert.deepEqual(output, [{ section: 30 }]);
  progress.push({ section: 'stale' });
  const late = [...frames.values()][0];
  controller.abort();
  late();
  progress.push({ section: 'after identity change' });
  assert.equal(frames.size, 0);
  assert.deepEqual(output, [{ section: 30 }]);
  const final = createFrameProgress((value) => output.push(value), undefined, scheduler);
  final.push('partial');
  final.cancel();
  output.push('complete');
  assert.equal(frames.size, 0);
  assert.deepEqual(output.at(-1), 'complete');
});

test('dashboard timings retain bounded local phase durations and distinguish cancellation', () => {
  const controller = new AbortController();
  const first = startDashboardTiming('fixture', controller.signal);
  first.mark('orders-ready');
  first.mark('orders-ready');
  controller.abort();
  first.finish();
  const second = startDashboardTiming('fixture');
  second.mark('orders-ready');
  second.finish();
  for (const phase of ['orders-ready', 'cancelled', 'complete']) {
    const name = `dashboard:fixture:${phase}`;
    const entries = performance.getEntriesByName(name);
    assert.equal(entries.length, 1);
    assert.ok(entries[0].duration >= 0);
    performance.clearMeasures(name);
  }
});
