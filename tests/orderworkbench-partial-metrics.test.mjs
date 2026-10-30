import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWorkbenchMetrics,
  metricDelta,
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
        denominator: null,
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

test('partial rates use independently validated quantities and show exact candidate coverage', () => {
  const p = make();
  const m = computeWorkbenchMetrics(p);
  assert.equal(m['作废率'].value, 0);
  assert.equal(m['改单率'].value, 5);
  assert.equal(m['订单满足率'].value, 90);
  assert.equal(m['订单满足率'].sample.coverage, 60);
  assert.equal(m['准交率'].value, 100);
  assert.deepEqual([m['准交率'].sample.known, m['准交率'].sample.total], [1, 2]);
  assert.match(m['准交率'].coverageNote, /不是全量指标/);
});
test('one invalid split verdict excludes the whole original order, not only its SKU', () => {
  const p = make();
  p.sections[2].rows[1].invalid = 1;
  assert.equal(computeWorkbenchMetrics(p)['准交率'].value, null);
});
test('all-unknown, absent sample fields, query errors and zero denominators do not become zero rates', () => {
  const p = make();
  p.sections[0].rows.forEach((r) => {
    r.sample_records = 0;
    r.sample_denominator = 0;
  });
  delete p.sections[1].rows[0].sample_demand;
  const m = computeWorkbenchMetrics(p);
  assert.equal(m['作废率'].value, null);
  assert.equal(m['改单率'].value, null);
  assert.equal(m['订单满足率'].value, null);
  p.sections[0].status = 'error';
  p.sections[0].code = 'FIELD_NOT_PUBLISHED';
  assert.match(computeWorkbenchMetrics(p)['作废率'].missingReason, /FIELD_NOT_PUBLISHED/);
});
test('cards, six tables, evidence and comparisons expose sample scope without green full-result badges', () => {
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
  assert.match(result.cards[0].status, /样本/);
  assert.notEqual(result.cards[0].status, '健康');
  assert.match(result.cards[2].comparison[0], /10.00pp\*/);
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
