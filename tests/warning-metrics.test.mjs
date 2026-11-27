import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import catalog from '../business/shared/warning-metric-catalog.json' with { type: 'json' };
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
  assert.equal(metric.row, 106);
  assert.equal(metric.version, 'V0.6');
  assert.equal(metric.source, '产销协同数据指标_核心指标问数V0.6.xlsx');
});
test('missing business thresholds stay unconfigured rather than inventing a healthy threshold', () => {
  const metric = warningMetricInfo('分仓库存差额');
  assert.equal(metric.rulesStatus, 'unconfigured');
  assert.match(metric.measureRules, /未提供明确任务规则/);
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
  assert.equal(context.module, metric.module);
  assert.equal(context.row, metric.row);
  assert.equal(context.selectionName, metric.selectionName);
  assert.equal(context.rulesStatus, 'unconfigured');
});
test('the existing current-stock selection has a fixed company-stock definition', () => {
  const metric = warningMetricInfo('当前库存');
  assert.equal(metric.status, 'available');
  assert.equal(metric.row, 42);
  assert.equal(metric.module, '全链路库存工作台, 分仓库存');
  assert.match(metric.definition, /不含客户\/渠道库存/);
  assert.doesNotMatch(metric.exclusions, /OEM/);
  assert.equal(warningMetricInfo('实物库存').row, 42);
  assert.equal(warningMetricInfo('库存量').row, 20);
});

test('base-specific current stock keeps its own exclusions as a separate fixed selection', () => {
  const metric = warningMetricInfo('当前库存（基地库存）');
  assert.equal(metric.status, 'available');
  assert.equal(metric.row, 157);
  assert.match(metric.exclusions, /OEM成品仓/);
  assert.match(metric.exclusions, /19开头/);
  assert.equal(warningMetricContext(metric).row, 157);
});

test('every selectable workbook record resolves without a second module choice', () => {
  assert.equal(warningMetricNames.length, 161);
  assert.equal(new Set(warningMetricNames).size, 161);
  for (const name of warningMetricNames) {
    const metric = warningMetricInfo(name);
    assert.equal(metric.status, 'available', name);
    assert.equal(metric.selectionName, name);
    assert.equal(metric.version, 'V0.6');
  }
});

test('module-specific fulfillment definitions preserve the workbook filters', () => {
  assert.equal(warningMetricInfo('订单满足率').row, 5);
  const branch = warningMetricInfo('订单满足率（分仓库存）');
  assert.equal(branch.row, 8);
  assert.match(branch.exclusions, /订单类别为分仓/);
  assert.equal(warningMetricInfo('订单满足率（订单工作台）').row, 9);
});

test('blank, none and pending-confirmation bands do not become configured rules', () => {
  for (const name of ['当前库存', '已开订单缺货量', '基地展望周转天数（产销协同工作台）'])
    assert.equal(warningMetricInfo(name).rulesStatus, 'unconfigured', name);
  const fulfillment = warningMetricInfo('订单满足率');
  assert.equal(fulfillment.rulesStatus, 'configured');
  assert.match(fulfillment.measureRules, /x>95%/);
});

test('unregistered definitions are not replaced by a similar registered name', () => {
  assert.equal(warningMetricInfo('不存在的库存指标').status, 'unavailable');
});

test('production host and warning UI bundle every definition rather than referencing a machine file', async () => {
  for (const [entry, platform] of [
    ['src/host.ts', 'node'],
    ['business/inventory-apsplan/source/app/monitor-management.js', 'browser'],
  ]) {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      packages: 'external',
      platform,
      format: 'esm',
      write: false,
      metafile: true,
    });
    assert.ok(
      Object.keys(result.metafile.inputs).includes('business/shared/warning-metric-catalog.json'),
    );
    const emitted = result.outputFiles[0].text;
    for (const record of catalog.records)
      assert.ok(emitted.includes(record.recordId), entry + ': ' + record.selectionName);
    for (const output of Object.values(result.metafile.outputs))
      assert.ok(
        output.imports.every(
          (dependency) => !/warning-metrics|warning-metric-catalog|\.xlsx/.test(dependency.path),
        ),
      );
  }
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
          if (path === '/api/gea-html/identity')
            return Response.json({
              status: {
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
    const stock = await service.api({ op: 'metric', metric: '当前库存' });
    assert.equal(stock.status, 'available');
    assert.equal(stock.row, 42);
    assert.equal(stock.version, 'V0.6');
  } finally {
    for (const cleanup of cleanups.reverse()) cleanup();
  }
});
