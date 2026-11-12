import test from 'node:test';
import assert from 'node:assert/strict';
import { metricDetailsRequest } from '../prototypes/inventory-orderworkbench/metric-details.mjs';
import { workbenchPresentation } from '../prototypes/inventory-orderworkbench/live-presentation.mjs';
import { metricTarget } from '../prototypes/inventory-orderworkbench/performance-rules.mjs';
import { workbenchCellMissingReason } from '../prototypes/inventory-orderworkbench/missing-reasons.mjs';
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

test('an absent amendment cohort keeps the same unavailable state even when cancellations exist', () => {
  const row = { kind: '1', numerator: 1, denominator: 100, records: 1, invalid: 0 };
  const combined = {
    start: '2025-10-27',
    end: '2025-11-02',
    sections: [{ id: 'changes', status: 'ready', rows: [row] }],
  };
  const independent = { ...combined, sections: [{ id: 'changes', status: 'ready', rows: [] }] };
  for (const p of [combined, independent]) p.metrics = computeWorkbenchMetrics(p);
  const combinedCard = workbenchPresentation({ ...facts, periods: { month: combined } }).cards.find(
    (c) => c.key === '改单率',
  );
  const independentCard = workbenchPresentation({
    ...facts,
    periods: { month: independent },
  }).cards.find((c) => c.key === '改单率');
  assert.equal(combinedCard.value, '—');
  assert.equal(combinedCard.status, '暂无数据');
  assert.equal(combinedCard.status, independentCard.status);
  assert.equal(combinedCard.missingReason, independentCard.missingReason);
});

test('base cross tables and SKU rows use the same base formula while item views retain their own scope', () => {
  const stock = {
    base: '郑州',
    category: '水饺',
    item: '水饺',
    sku: '10004580',
    name: '产品',
    stock_date: '2026-10-31',
    plan_month_offset: 1,
    inventory: 1539,
    sales_plan: 500,
    transfer_plan: 11,
    source_rows: 1,
    invalid: 0,
  };
  const month = {
    start: '2026-10-01',
    end: '2026-11-01',
    sections: [{ id: 'stock', status: 'ready', rows: [stock] }],
  };
  month.metrics = computeWorkbenchMetrics(month);
  const f = { ...facts, selected: 'month', periods: { month, week: month } };
  const view = workbenchPresentation(f);
  assert.equal(view.dimensions['base-category-days'].rows[0][1], '91.34');
  assert.equal(view.skus['水饺'][0].shipDays, '91.34天');
  assert.equal(view.dimensions['category-days'].rows[0][4], '92.34天');
  assert.equal(view.dimensions['category-days'].columns[1], '现库存');
  month.sections[0].rows[0].transfer_plan = null;
  assert.match(
    workbenchCellMissingReason(f, {
      dimension: 'base-category-days',
      header: '水饺',
      row: ['郑州'],
      period: 'month',
    }),
    /未能计算/,
  );
  assert.doesNotMatch(
    workbenchCellMissingReason(f, {
      dimension: 'category-days',
      header: '可发货天数',
      row: ['水饺'],
      period: 'month',
    }),
    /未能计算/,
  );
});

test('all six base card handoffs retain scope, current components and the current code targets', () => {
  for (const base of ['郑州', '华东', '']) {
    const month = {
      start: '2026-10-01',
      end: '2026-11-01',
      sections: [
        {
          id: 'changes',
          status: 'ready',
          rows: [
            { kind: '1', numerator: 20, denominator: 1000, invalid: 0 },
            { kind: '2', numerator: 30, denominator: 1000, invalid: 0 },
          ],
        },
        { id: 'orders', status: 'ready', rows: [{ demand: 100, shortage: 10, invalid: 0 }] },
        {
          id: 'ontime',
          status: 'ready',
          rows: [{ order_no: 'E', customer: 'C', ontime: 1, invalid: 0 }],
        },
        { id: 'ages', status: 'ready', rows: [{ stock_qty: 100, aged_qty: 5, invalid: 0 }] },
        {
          id: 'stock',
          status: 'ready',
          rows: [
            {
              stock_date: '2026-10-31',
              plan_month_offset: 1,
              inventory: 1000,
              sales_plan: 3000,
              transfer_plan: 1000,
              source_rows: 1,
              invalid: 0,
            },
          ],
        },
      ],
    };
    month.metrics = computeWorkbenchMetrics(month, undefined, {
      turnoverScope: base ? 'base' : 'national',
    });
    const scoped = {
      ...facts,
      base,
      turnoverScope: base ? 'base' : 'national',
      periods: { month, week: month },
    };
    const cards = workbenchPresentation(scoped).cards;
    for (const card of cards) {
      assert.equal(card.target, metricTarget(card.key, base));
      const handoff = metricDetailsRequest(scoped, card.key, selection, card).context;
      assert.equal(handoff.filters.base, base);
      assert.equal(handoff.filters.dimension, base ? 'base' : 'national');
      assert.equal(handoff.metricDetails.contract.scope, base ? 'base' : 'national');
      for (const query of Object.values(handoff.metricDetails.queries))
        assert.equal(query.parameters.base, base);
      assert.equal(handoff.metricDetails.current.value, month.metrics[card.key].value);
      assert.equal(handoff.evidence.periods.month.metrics[card.key].target, card.target);
    }
    assert.equal(cards.find((c) => c.key === '改单率').target, '<2%');
    assert.equal(cards.find((c) => c.key === '准交率').target, '>98.5%');
    assert.equal(cards.find((c) => c.key === '周转天数').value, base ? '8.6' : '10.0');
  }
});

test('Zhengzhou inclusive turnover target is also used by the rendered card', () => {
  const month = {
    start: '2026-10-01',
    end: '2026-11-01',
    sections: [
      {
        id: 'stock',
        status: 'ready',
        rows: [
          {
            stock_date: '2026-10-31',
            plan_month_offset: 1,
            inventory: 1250,
            sales_plan: 3000,
            transfer_plan: 0,
            source_rows: 1,
            invalid: 0,
          },
        ],
      },
    ],
  };
  month.metrics = computeWorkbenchMetrics(month, undefined, { turnoverScope: 'base' });
  for (const [base, status] of [
    ['郑州', '健康'],
    ['华东', '严重'],
    ['', '严重'],
  ]) {
    const card = workbenchPresentation({
      ...facts,
      base,
      periods: { month, week: month },
    }).cards.find((c) => c.key === '周转天数');
    assert.equal(card.value, '12.5');
    assert.equal(card.status, status);
  }
});

test('failed reads are reported consistently and never invent zero on-time counts', () => {
  const month = {
    start: '2026-10-01',
    end: '2026-11-01',
    sections: ['orders', 'changes', 'ontime', 'ages', 'stock'].map((id) => ({
      id,
      status: 'error',
      code: 'RESOURCE_NOT_IN_DATASET',
      rows: [],
    })),
  };
  month.metrics = computeWorkbenchMetrics(month);
  const failed = { ...facts, base: '郑州', periods: { month, week: month } };
  for (const card of workbenchPresentation(failed).cards) {
    const current = metricDetailsRequest(failed, card.key, selection, card).context.metricDetails
      .current;
    assert.equal(current.status, '查询失败');
    assert.equal(current.value, null);
    assert.equal(current.numerator, null);
    assert.equal(current.denominator, null);
    assert.equal(current.pending, null);
    if (card.key === '准交率')
      assert.equal(
        metricDetailsRequest(failed, card.key, selection, card).context.evidence.periods.month
          .metrics[card.key].counts,
        undefined,
      );
  }
});

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
  assert.match(request.context.metricDetails.current.scope, /完整候选执行单分母/);
  assert.equal(request.context.metricDetails.queries.summary.tool, 'gea_order_kpi');
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
    () => metricDetailsRequest({ ...facts, metricCalculationVersion: 27 }, '改单率', selection),
    /口径已更新/,
  );
  const request = metricDetailsRequest(facts, '改单率', selection);
  const detail = request.context.metricDetails;
  assert.equal(detail.contract.dateField, 'lastshipmenttime');
  assert.equal(detail.contract.dateSource, 'agents_scm_order_trace_final_di');
  assert.match(detail.contract.formula, /装车完成/);
  assert.equal(detail.contract.lockPeriod, false);
  assert.equal(detail.contract.changeTimeRequired, false);
  for (const query of Object.values(detail.queries)) {
    assert.equal(query.tool, 'gea_order_kpi');
    assert.equal(query.sql, undefined);
    assert.equal(query.parameters.start, '2026-10-01');
    assert.equal(query.parameters.endExclusive, '2026-10-26');
    assert.equal(query.parameters.base, '');
  }
  assert.equal(detail.contract.lockPeriod, false);
  assert.ok(JSON.stringify(request.context).length < 100000);
});

test('card target and status are passed from the rendered card without inventing missing targets', () => {
  const card = { target: '<6%', status: '健康' };
  const current = metricDetailsRequest(facts, '作废率', selection, card).context.metricDetails
    .current;
  assert.equal(current.target, '<6%');
  assert.equal(current.status, '健康');
  assert.match(current.periodBasis, /作废记录按canceltime，非作废记录按header_addtime/);
  assert.match(current.cancellationBoundary, /latestsendcardate前7天/);
  assert.equal(
    metricDetailsRequest(facts, '作废率', selection).context.metricDetails.current.target,
    '<6%',
  );
});

test('six card handoffs carry code formulas and measured components without inventing exclusions', () => {
  const month = {
    start: '2026-10-01',
    end: '2026-11-01',
    sections: [
      {
        id: 'changes',
        status: 'ready',
        rows: [
          { kind: '1', numerator: 25, denominator: 1000, invalid: 0 },
          { kind: '2', numerator: 30, denominator: 2000, invalid: 0 },
        ],
      },
      { id: 'orders', status: 'ready', rows: [{ demand: 100, shortage: 8, invalid: 0 }] },
      {
        id: 'ontime',
        status: 'ready',
        rows: [
          { order_no: 'E1', customer: 'C', ontime: 1, invalid: 0 },
          { order_no: 'E2', customer: 'C', ontime: null, invalid: 1 },
        ],
      },
      { id: 'ages', status: 'ready', rows: [{ stock_qty: 100, aged_qty: 6, invalid: 0 }] },
      {
        id: 'stock',
        status: 'ready',
        rows: [
          {
            stock_date: '2026-10-25',
            plan_month_offset: 1,
            source_rows: 1,
            inventory: 100,
            sales_plan: 300,
            transfer_plan: 100,
            invalid: 0,
          },
        ],
      },
    ],
  };
  month.metrics = computeWorkbenchMetrics(month);
  const expected = [
    [25, 1000],
    [30, 2000],
    [92, 100],
    [1, 2],
    [6, 100],
    [100, 10],
  ];
  for (const [index, key] of metricNames.entries()) {
    const { current } = metricDetailsRequest({ ...facts, periods: { month } }, key, selection)
      .context.metricDetails;
    assert.equal(current.value, month.metrics[key].value);
    assert.equal(current.formula, month.metrics[key].note);
    assert.deepEqual([current.numerator, current.denominator], expected[index]);
    assert.equal(current.excluded, null);
    assert.match(current.countMeaning, /不是剔除数/);
    assert.throws(
      () =>
        metricDetailsRequest(
          { ...facts, metricCalculationVersion: 28, periods: { month } },
          key,
          selection,
        ),
      /口径已更新/,
    );
  }
});

test('year comparison handoff retains complete independent month and week ranges', () => {
  const periods = {
    month: period('2026-11-01', '2026-11-12'),
    previousMonth: period('2026-10-01', '2026-10-12'),
    yearMonth: period('2025-11-01', '2025-11-12'),
    week: period('2026-11-09', '2026-11-12'),
    previousWeek: period('2026-11-02', '2026-11-05'),
    yearWeek: period('2025-11-10', '2025-11-13'),
  };
  const request = metricDetailsRequest({ ...facts, periods }, '作废率', selection);
  for (const [kind, keys] of Object.entries({
    month: ['month', 'previousMonth', 'yearMonth'],
    week: ['week', 'previousWeek', 'yearWeek'],
  })) {
    for (const [index, name] of ['current', 'previous', 'year'].entries()) {
      const p = periods[keys[index]];
      assert.deepEqual(request.context.metricDetails.comparisonPeriods[kind][name], {
        start: p.start,
        endExclusive: p.end,
      });
    }
  }
  assert.match(request.text, /先按维度值过滤/);
  assert.match(request.text, /不得阻断其他分组/);
  const absent = metricDetailsRequest(facts, '作废率', selection);
  assert.equal(absent.context.metricDetails.comparisonPeriods.month.year, null);
});
