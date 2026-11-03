import test from 'node:test';
import assert from 'node:assert/strict';
import { metricDetailsRequest } from '../prototypes/inventory-orderworkbench/metric-details.mjs';
import {
  computeWorkbenchMetrics,
  metricNames,
} from '../prototypes/inventory-orderworkbench/metric-model.mjs';

const period = (start, end) => {
  const p = { start, end, sections: [] };
  p.metrics = computeWorkbenchMetrics(p);
  return p;
};
const facts = {
  source: 'gea-governed-sql',
  complete: true,
  selected: 'week',
  periods: { month: period('2026-10-01', '2026-10-26'), week: period('2026-10-19', '2026-10-26') },
};
const selection = {
  mode: 'week',
  month: '2026-10',
  week: '2026-10-19',
  label: '2026年10月 · 第四周',
};

test('all six cards request the matching detail table with the card month and separate selected week', () => {
  for (const key of metricNames) {
    const request = metricDetailsRequest(facts, key, selection);
    assert.match(request.text, /operations-order-kpi-details skill/);
    assert.match(request.text, /2026-10-01 至 2026-10-25/);
    assert.match(request.text, /本周：2026-10-19 至 2026-10-25/);
    assert.match(request.text, /表格/);
    assert.equal(request.context.metricDetails.primaryPeriod, 'month');
    assert.equal(request.context.metricDetails.metric, key);
    assert.equal(request.context.filters.dimension, 'national');
    assert.equal(request.context.consumerCode, 'order');
    assert.equal(request.context.evidence.periods.month.metrics[key].value, null);
    assert.ok(JSON.stringify(request.context).length < 100000);
  }
});

test('unknown periods and metrics do not invent dates or detail data', () => {
  assert.throws(() => metricDetailsRequest(null, '作废率', selection), /尚未返回/);
  assert.throws(() => metricDetailsRequest(facts, '其他', selection), /未知指标/);
  const r = metricDetailsRequest(
    {
      ...facts,
      periods: {
        month: period('2026-11-01', '2026-11-02'),
        week: period('2026-11-02', '2026-11-02'),
      },
    },
    '作废率',
    selection,
  );
  assert.match(r.text, /本周：尚无已结束日期/);
  assert.match(r.text, /不从汇总编造明细/);
});
