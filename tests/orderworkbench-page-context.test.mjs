import test from 'node:test';
import assert from 'node:assert/strict';
import { orderPageContext } from '../prototypes/inventory-orderworkbench/page-context.mjs';
import { metricNames } from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import { orderPageHost } from './helpers/order-page-host.mjs';

function snapshot(value = 2) {
  const rule = '当前代码统一指标口径及缺失值规则。'.repeat(80);
  const periods = Object.fromEntries(
    ['month', 'week', 'previousMonth', 'previousWeek', 'yearMonth', 'yearWeek'].map((name, i) => [
      name,
      {
        start: '2026-11-01',
        endExclusive: '2026-11-16',
        inventoryEndExclusive: '2026-11-16',
        sourceDates: { stock: '2026-11-15' },
        metrics: Object.fromEntries(
          metricNames.map((key, j) => [
            key,
            {
              value: name === 'yearMonth' && key === '改单率' ? null : value + i + j,
              numerator: 10 + i + j,
              denominator: 500 + i,
              pending: i,
              unit: '%',
              target: '<2%',
              status: '预警',
              formula: rule,
              note: rule,
              sample: { known: 20, total: 21, coverage: 20 / 21, unit: '候选明细' },
              missingReason: name === 'yearMonth' && key === '改单率' ? '未采集' : null,
              dataUnavailable: name === 'yearMonth' && key === '改单率',
            },
          ]),
        ),
      },
    ]),
  );
  return {
    pageId: 'inventory-orderworkbench',
    source: 'gea-governed-sql',
    mock: false,
    consumerCode: 'order',
    period: { label: '2026年11月 · 第三周' },
    reportDate: '2026-11-23T00:00:00Z',
    filters: { base: '', dimension: 'base-performance' },
    metrics: metricNames.map((key) => ({
      key,
      value: `${value}%`,
      target: '<2%',
      status: '预警',
      formula: rule,
      note: rule,
    })),
    evidence: {
      source: 'gea-governed-sql',
      metricCalculationVersion: 'current',
      readAt: '2026-11-23T00:00:00Z',
      base: '',
      selected: 'week',
      complete: true,
      periods,
      metricContracts: Object.fromEntries(
        metricNames.map((key) => [key, { formula: rule, version: 'current' }]),
      ),
    },
    dimension: {
      report: { rows: Array.from({ length: 100 }, (_, index) => ({ index, description: rule })) },
    },
    events: [],
    tasks: [],
  };
}

test('oversized report reaches the real Host and Agent tool without dropping any metric period quantities', async (t) => {
  const host = await orderPageHost();
  t.after(host.dispose);
  const raw = snapshot();
  const original = structuredClone(raw);
  assert.ok(JSON.stringify(raw).length > 100000);
  const rejected = await host.sync(raw);
  assert.match(JSON.stringify(rejected), /PAGE_CONTEXT_TOO_LARGE/);
  const context = orderPageContext(raw);
  assert.ok(JSON.stringify(context).length < 100000);
  assert.equal(context.contextProjection.detailsSummarized, true);
  assert.deepEqual(raw, original);
  assert.equal((await host.sync(context)).status, 200);
  const answer = JSON.parse(await host.read());
  for (const [name, period] of Object.entries(raw.evidence.periods)) {
    for (const key of metricNames) {
      const actual = answer.context.evidence.periods[name].metrics[key];
      for (const field of ['value', 'numerator', 'denominator', 'pending', 'missingReason'])
        assert.equal(actual[field], period.metrics[key][field], `${name}/${key}/${field}`);
    }
  }
  assert.equal(answer.context.metrics.length, 6);
  assert.deepEqual(answer.context.period, raw.period);
  assert.equal(host.observed.length, 1);
  const fresh = orderPageContext(snapshot(3));
  assert.equal((await host.sync(fresh)).status, 200);
  const updated = JSON.parse(await host.read());
  assert.equal(updated.context.metrics[0].value, '3%');
  assert.equal(updated.context.evidence.periods.month.metrics[metricNames[0]].value, 3);
});

test('ordinary reports preserve all dimension rows and store current formula only once', () => {
  const raw = snapshot();
  raw.dimension.report.rows = [{ base: '郑州', quantity: 123 }];
  const context = orderPageContext(raw);
  assert.deepEqual(context.dimension, raw.dimension);
  assert.deepEqual(context.evidence.metricContracts, raw.evidence.metricContracts);
  assert.equal(context.contextProjection.detailsSummarized, undefined);
  assert.equal(context.evidence.periods.yearMonth.metrics['改单率'].value, null);
});
