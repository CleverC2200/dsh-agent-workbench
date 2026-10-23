import test from 'node:test';
import assert from 'node:assert/strict';
import { customerPageContext } from '../prototypes/inventory-customer/page-context.js';
import { keepPageObservation } from '../business/shared/page-observation.js';

test('customer card names, units and low coverage semantics cannot drift to similarly named Cube measures', () => {
  const context = customerPageContext({
    summary: {
      totalValue: 123,
      quantity: 456,
      structureScore: 67,
      normalRatio: 89,
      turnover: 12,
      largeDateQty: 34,
    },
  });
  assert.deepEqual(
    context.metrics.map((m) => [m.label, m.value, m.unit]),
    [
      ['库存价值', 123, '万元'],
      ['库存数量', 456, '箱'],
      ['结构合理性', 67, '分'],
      ['库存新鲜度', 89, '%'],
      ['周转天数', 12, '天'],
      ['大日期情况', 34, '箱'],
    ],
  );
  assert.match(context.metricSemantics.lowCoverageCount, /低于60天.*不是缺失/);
  assert.ok(context.metrics.every((m) => m.definition.length));
});

test('heartbeat reads current ownership each tick and disposes on page exit', async () => {
  const oldWindow = globalThis.window,
    oldInterval = globalThis.setInterval,
    oldClear = globalThis.clearInterval;
  let tick,
    exit,
    cleared = false,
    current = { revision: 1 };
  const sent = [];
  globalThis.window = {
    addEventListener: (_event, fn) => {
      exit = fn;
    },
  };
  globalThis.setInterval = (fn) => {
    tick = fn;
    return 42;
  };
  globalThis.clearInterval = (id) => {
    cleared = id === 42;
  };
  try {
    keepPageObservation(
      () => current,
      async (value) => sent.push(value.revision),
    );
    await tick();
    current = undefined;
    await tick();
    current = { revision: 2 };
    await tick();
    assert.deepEqual(sent, [1, 2]);
    exit();
    assert.equal(cleared, true);
  } finally {
    globalThis.window = oldWindow;
    globalThis.setInterval = oldInterval;
    globalThis.clearInterval = oldClear;
  }
});
