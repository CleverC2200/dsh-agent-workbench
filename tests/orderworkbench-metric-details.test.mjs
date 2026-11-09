import test from 'node:test';
import assert from 'node:assert/strict';
import { metricDetailsRequest } from '../prototypes/inventory-orderworkbench/metric-details.mjs';
import {
  computeWorkbenchMetrics,
  metricNames,
  metricCalculationVersion,
} from '../prototypes/inventory-orderworkbench/metric-model.mjs';

const period = (start, end) => {
  const p = { start, end, sections: [] };
  p.metrics = computeWorkbenchMetrics(p);
  return p;
};
const facts = {
  metricCalculationVersion,
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

test('on-time handoff publishes exact complete counts and a fixed arrival query without sample reconstruction', () => {
  const rows = [
    { order_no: 'E1', customer: 'C', ontime: 1, invalid: 0 },
    { order_no: 'E1', customer: 'C', ontime: 1, invalid: 0 },
    { order_no: 'E2', customer: 'C', ontime: 0, invalid: 0 },
    { order_no: 'E3', customer: 'C', ontime: null, invalid: 1 },
  ];
  const month = {
    start: '2026-10-01',
    end: '2026-11-01',
    sections: [{ id: 'ontime', status: 'ready', rows }],
  };
  month.metrics = computeWorkbenchMetrics(month);
  const request = metricDetailsRequest({ ...facts, periods: { month } }, '准交率', selection);
  const metric = request.context.evidence.periods.month.metrics['准交率'];
  assert.equal(metric.numerator, 1);
  assert.equal(metric.denominator, 3);
  assert.equal(metric.pending, 1);
  assert.equal(metric.known, 2);
  assert.equal(metric.late, 1);
  assert.equal(metric.value, 100 / 3);
  assert.equal(request.context.metricDetails.queries.summary.tool, 'gea_order_ontime');
  assert.equal(request.context.metricDetails.contract.graceHours.kamd, 18);
  assert.equal(request.context.metricDetails.contract.graceHours.other, 12);
  assert.throws(
    () => metricDetailsRequest({ ...facts, metricCalculationVersion: 9 }, '准交率', selection),
    /口径已更新/,
  );
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

test('amendment handoff rejects old snapshots and carries the same quantity queries as the dashboard', () => {
  assert.throws(
    () => metricDetailsRequest({ ...facts, metricCalculationVersion: 26 }, '改单率', selection),
    /口径已更新/,
  );
  const request = metricDetailsRequest(facts, '改单率', selection);
  const detail = request.context.metricDetails;
  assert.equal(detail.contract.lockPeriod, false);
  assert.equal(detail.contract.changeTimeRequired, false);
  for (const query of Object.values(detail.queries)) {
    assert.equal(query.tool, 'gea_order_amendment');
    assert.equal(query.sql, undefined);
    assert.equal(query.parameters.start, '2026-10-01');
    assert.equal(query.parameters.endExclusive, '2026-10-26');
    assert.equal(query.parameters.base, '');
  }
  assert.match(request.text, /不加锁定期/);
  assert.ok(JSON.stringify(request.context).length < 100000);
});
