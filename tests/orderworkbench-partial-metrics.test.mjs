import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWorkbenchMetrics,
  metricDelta,
  metricCalculationVersion,
  reusableWorkbenchFacts,
  compatibleWorkbenchFacts,
} from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import {
  workbenchPresentation,
  workbenchEvidence,
} from '../prototypes/inventory-orderworkbench/live-presentation.mjs';
import { workbenchQueries } from '../business/inventory-orderworkbench/queries.mjs';

const make = () => ({
  start: '2026-10-01',
  end: '2026-10-30',
  sections: [
    {
      id: 'changes',
      status: 'ready',
      rows: ['1', '2'].map((kind) => ({
        kind,
        numerator: null,
        denominator: kind === '2' ? 100 : null,
        unknown_quantity: 20,
        records: 100,
        invalid: 20,
        sample_numerator: kind === '1' ? 0 : 4,
        sample_denominator: 80,
        sample_records: 80,
      })),
    },
    {
      id: 'orders',
      status: 'ready',
      rows: [
        {
          base: '郑州',
          sku: 'a',
          item: '水饺',
          demand: 1000,
          shortage: 300,
          invalid: 4,
          records: 10,
          missing_ship_date: 3,
          sample_demand: 100,
          sample_shortage: 10,
          sample_records: 6,
        },
      ],
    },
    {
      id: 'ontime',
      status: 'ready',
      rows: [
        {
          base: '郑州',
          sku: 'a',
          item: '水饺',
          customer: 'c',
          order_no: 'a',
          ontime: 1,
          invalid: 0,
        },
        {
          base: '郑州',
          sku: 'b',
          item: '水饺',
          customer: 'c',
          order_no: 'a',
          ontime: 1,
          invalid: 0,
        },
        {
          base: '郑州',
          sku: 'c',
          item: '水饺',
          customer: 'c',
          order_no: 'b',
          ontime: null,
          invalid: 1,
        },
      ],
    },
    { id: 'stock', status: 'ready', rows: [] },
    { id: 'ages', status: 'ready', rows: [] },
  ],
});

test('historical cache retries failed sources and invalidates earlier query versions', () => {
  const facts = {
    complete: true,
    attributionVersion: 2,
    metricCalculationVersion,
    periods: { week: { sections: [{ id: 'changes', status: 'ready', rows: [] }] } },
  };
  assert.equal(reusableWorkbenchFacts(facts), true);
  facts.periods.week.sections[0].status = 'error';
  assert.equal(compatibleWorkbenchFacts(facts), true);
  assert.equal(reusableWorkbenchFacts(facts), false);
  facts.periods.week.sections[0].status = 'loading';
  assert.equal(reusableWorkbenchFacts(facts), false);
  facts.periods.week.sections[0].status = 'ready';
  facts.metricCalculationVersion--;
  assert.equal(compatibleWorkbenchFacts(facts), false);
  assert.equal(reusableWorkbenchFacts(facts), false);
});

test('partial rates use independently validated quantities and show exact candidate coverage', () => {
  const p = make();
  const m = computeWorkbenchMetrics(p);
  assert.equal(m['作废率'].value, 0);
  assert.equal(m['改单率'].value, 4);
  assert.equal(m['改单率'].sample, undefined);
  assert.equal(m['改单率'].provisional, true);
  assert.match(m['改单率'].note, /不代表完整改单率/);
  assert.equal(m['订单满足率'].value, 90);
  assert.equal(m['订单满足率'].sample.coverage, 60);
  assert.equal(m['准交率'].value, 50);
  assert.equal(m['准交率'].sample.value, 100);
  assert.deepEqual([m['准交率'].sample.known, m['准交率'].sample.total], [1, 2]);
  assert.match(m['准交率'].coverageNote, /不是全量指标/);
});
test('one invalid split verdict excludes the whole original order, not only its SKU', () => {
  const p = make();
  p.sections[2].rows[1].invalid = 1;
  assert.equal(computeWorkbenchMetrics(p)['准交率'].value, 0);
});
test('all-unknown, absent sample fields, query errors and zero denominators do not become zero rates', () => {
  const p = make();
  p.sections[0].rows.forEach((r) => {
    r.sample_records = 0;
    r.sample_denominator = 0;
    r.denominator = 0;
  });
  delete p.sections[1].rows[0].sample_demand;
  const m = computeWorkbenchMetrics(p);
  assert.equal(m['作废率'].value, null);
  assert.equal(m['改单率'].value, null);
  assert.equal(m['订单满足率'].value, null);
  p.sections[0].status = 'error';
  p.sections[0].code = 'FIELD_NOT_PUBLISHED';
  assert.match(computeWorkbenchMetrics(p)['作废率'].missingReason, /FIELD_NOT_PUBLISHED/);
  p.metrics = computeWorkbenchMetrics(p);
  const presentation = workbenchPresentation({
    selected: 'week',
    complete: true,
    periods: Object.fromEntries(
      ['week', 'month', 'previousWeek', 'previousMonth', 'yearWeek', 'yearMonth'].map((key) => [
        key,
        p,
      ]),
    ),
  });
  assert.equal(presentation.cards[0].status, '查询失败');
});
test('cards show metric health while footers, tooltips, tables and comparisons retain sample scope', () => {
  const p = make();
  p.metrics = computeWorkbenchMetrics(p);
  const previous = make();
  previous.sections[1].rows[0].sample_shortage = 20;
  previous.metrics = computeWorkbenchMetrics(previous);
  const facts = {
    selected: 'month',
    complete: true,
    periods: {
      month: p,
      week: p,
      previousMonth: previous,
      previousWeek: previous,
      yearMonth: previous,
      yearWeek: previous,
    },
    directors: { rows: [] },
    customers: { rows: [] },
  };
  const result = workbenchPresentation(facts);
  assert.equal(result.cards[0].status, '健康');
  assert.equal(result.cards[1].status, '预警');
  assert.equal(result.cards[1].value, '4.00');
  assert.equal(result.cards[1].footer, '本周改单率 4.00%（暂算）');
  assert.match(result.cards[1].coverageNote, /全量有效商品数量100/);
  assert.doesNotMatch(result.cards[1].footer, /下限|区间/);
  assert.equal(p.metrics['改单率'].provisional, true);
  assert.equal(result.cards[2].status, '预警');
  assert.match(result.cards[0].footer, /可判定样本/);
  assert.match(result.cards[0].coverageNote, /覆盖80.0%/);
  p.metrics['作废率'].value = 11;
  assert.equal(workbenchPresentation(facts).cards[0].status, '严重');
  assert.match(result.cards[2].comparison[0], /10.00%\*/);
  assert.match(result.cards[2].comparisonNotes[0], /不代表全量/);
  assert.match(result.performance['base-performance'].month[0][1].text, /\*/);
  assert.match(result.performance['base-performance'].month[0][1].title, /6\/10/);
  assert.match(JSON.stringify(workbenchEvidence(facts)), /可判定样本/);
  assert.equal(metricDelta(p.metrics, {}, '作废率'), '—');
});
test('SQL only includes complete period-assigned source product groups and individually valid source orders', () => {
  assert.match(
    workbenchQueries.orders.sql,
    /m.invalid=0 THEN m.demand ELSE 0 END\) AS sample_demand/,
  );
  assert.match(workbenchQueries.changes.sql, /invalid_cancel=0 THEN cancel_numerator ELSE 0/);
  assert.match(workbenchQueries.changes.sql, /invalid_change=0 THEN change_denominator ELSE 0/);
});

test('amendment card uses the full denominator for the audited creation week', () => {
  const period = make();
  period.sections[0].rows[1] = {
    kind: '2',
    numerator: null,
    denominator: 3059039,
    records: 55197,
    invalid: 49269,
    sample_numerator: 4187,
    sample_denominator: 288799,
    sample_records: 5928,
    unknown_quantity: 2773254,
  };
  period.metrics = computeWorkbenchMetrics(period);
  const metric = period.metrics['改单率'];
  assert.ok(Math.abs(metric.value - (4187 / 3059039) * 100) < 1e-12);
  assert.equal(metric.sample, undefined);
  const facts = {
    metricCalculationVersion,
    selected: 'week',
    complete: true,
    periods: { month: period, week: period },
  };
  const card = workbenchPresentation(facts).cards.find((card) => card.key === '改单率');
  assert.equal(card.value, '0.14');
  assert.equal(card.status, '健康');
  assert.equal(card.footer, '本周改单率 0.14%（暂算）');
  assert.match(card.coverageNote, /4187.*3059039.*49269/);
  const evidence = workbenchEvidence(facts).periods.week.metrics['改单率'];
  assert.equal(evidence.provisional, true);
  assert.equal(evidence.population.denominator, 3059039);
  assert.match(evidence.note, /不代表完整改单率/);
});

test('old amendment evidence cannot publish its order-count rate under the quantity contract', () => {
  const period = make();
  period.metrics = computeWorkbenchMetrics(period);
  period.metrics['改单率'].sample = { known: 25, total: 26, unit: '张' };
  const evidence = workbenchEvidence({
    metricCalculationVersion: 26,
    selected: 'month',
    periods: { month: period },
  });
  assert.equal(evidence.periods.month.metrics['改单率'].value, null);
  assert.match(evidence.periods.month.metrics['改单率'].note, /快照版本已过期/);
  assert.equal(evidence.periods.month.metrics['改单率'].numerator, undefined);
  assert.equal(evidence.periods.month.metrics['改单率'].sample, undefined);
  assert.equal(evidence.periods.month.metrics['改单率'].population, undefined);
});
