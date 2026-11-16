import test from 'node:test';
import assert from 'node:assert/strict';
import {
  warningMetricInfo,
  warningMetricContext,
  warningMetricNames,
} from '../business/shared/warning-metrics.mjs';

test('branch inventory gap uses the registered signed net formula and exclusions without local configuration', () => {
  const metric = warningMetricInfo('分仓库存差额');
  assert.equal(metric.status, 'available');
  assert.match(metric.formula, /保留正负/);
  assert.match(metric.exclusions, /A540/);
  assert.match(metric.exclusions, /同目标月份与版本/);
  assert.equal(metric.unit, '件');
  assert.equal(metric.recordId, 'reczz28NZgtX5bEU');
  assert.equal(metric.version, 'rev:1445');
});
test('missing business thresholds stay unconfigured rather than inventing a healthy threshold', () => {
  const metric = warningMetricInfo('分仓库存差额');
  assert.equal(metric.rulesStatus, 'unconfigured');
  assert.match(metric.measureRules, /任务说明中明确判断规则/);
  assert.doesNotMatch(metric.measureRules, /健康.*[<>≤≥]\s*0/);
});
test('exact names and unique aliases resolve to the same registered metric', () => {
  assert.equal(warningMetricInfo(' 分仓库存差额\n').name, '分仓库存差额');
  assert.equal(warningMetricInfo('分仓超存储量').name, '分仓库存差额');
  assert.ok(warningMetricNames.includes('分仓库存差额'));
});
test('the execution context includes the same formula, exclusions and provenance shown in the dialog', () => {
  const metric = warningMetricInfo('分仓库存差额');
  const context = warningMetricContext(metric);
  assert.equal(context.formula, metric.formula);
  assert.equal(context.exclusions, metric.exclusions);
  assert.equal(context.sourceUrl, metric.sourceUrl);
  assert.equal(context.rulesStatus, 'unconfigured');
});
test('unregistered and ambiguous definitions are never silently replaced by a similar metric', () => {
  assert.equal(warningMetricInfo('不存在的库存指标').status, 'unavailable');
  const metric = warningMetricInfo('当前库存');
  if (metric.variants) assert.match(metric.message, /不同口径/);
});

test('the authenticated warning metric endpoint returns the bundled definition without a per-machine catalog file', async () => {
  const { installDetection } = await import('../src/detection-backend.mjs');
  const cleanups = [];
  const service = await installDetection({
    effect(fn) {
      const cleanup = fn();
      if (cleanup) cleanups.push(cleanup);
    },
    connection: {
      fetch: { register: () => () => {} },
      createSharedFetchHandler: () => ({
        fetch: async (request) => {
          const path = new URL(request.url).pathname;
          if (path.endsWith('/warning/storage'))
            return Response.json({
              ok: true,
              value: { tasks: [], runs: [], events: [], revision: 'r1' },
            });
          if (path.endsWith('/status'))
            return Response.json({
              ok: true,
              value: {
                authenticated: true,
                environment: 'test',
                user: { id: 'u', username: 'tester', tenantId: 0 },
              },
            });
          throw Error('Unexpected request ' + path);
        },
      }),
    },
  });
  try {
    const result = await service.api({ op: 'metric', metric: '分仓库存差额' });
    assert.equal(result.status, 'available');
    assert.match(result.formula, /保留正负/);
    assert.match(result.exclusions, /A540/);
  } finally {
    for (const cleanup of cleanups.reverse()) cleanup();
  }
});
