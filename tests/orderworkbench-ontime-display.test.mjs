import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWorkbenchMetrics } from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import { workbenchPresentation } from '../prototypes/inventory-orderworkbench/live-presentation.mjs';

function present(onTime, late, pending) {
  const rows = Array.from({ length: onTime + late + pending }, (_, i) => ({
    order_no: 'E' + i,
    customer: 'C',
    base: '郑州',
    sku: 'S',
    item: '水饺',
    ontime: i < onTime ? 1 : i < onTime + late ? 0 : null,
    invalid: i >= onTime + late ? 1 : 0,
  }));
  const period = { sections: [{ id: 'ontime', status: 'ready', rows }] };
  period.metrics = computeWorkbenchMetrics(period);
  const view = workbenchPresentation({
    selected: 'week',
    complete: true,
    periods: { month: period, week: period },
    directors: { rows: [] },
    customers: { rows: [] },
  });
  return {
    period,
    view,
    card: view.cards.find((r) => r.key === '准交率'),
    cell: view.performance['base-performance'].week[0][4],
  };
}

test('confirmed on-time numerator uses the entire shipped denominator without hiding missing orders', () => {
  const { period, card, cell } = present(3479, 3, 11);
  assert.equal(period.metrics['准交率'].value, (100 * 3479) / 3493);
  assert.equal(period.metrics['准交率'].sample.value, (100 * 3479) / 3482);
  assert.deepEqual(period.metrics['准交率'].counts, {
    onTime: 3479,
    total: 3493,
    known: 3482,
    pending: 11,
  });
  assert.equal(card.value, '99.60');
  assert.equal(card.unit, '%');
  assert.equal(card.status, '健康');
  assert.equal(card.footer, '本周准交率 99.60%（11张缺失数据未计准交）');
  assert.equal(cell.text, '99.60%');
  assert.equal(cell.raw, (100 * 3479) / 3493);
  for (const note of [card.coverageNote, card.footerNote, cell.title]) {
    assert.match(note, /缺失数据11张保留在分母，暂不计入准交数/);
    assert.doesNotMatch(note, /待核/);
  }
});
test('month card uses confirmed count and all shipped executions', () => {
  const { card } = present(11070, 35, 28);
  assert.equal(card.value, '99.43');
});
test('raw values determine health and no confirmed successes means zero confirmed rate', () => {
  const { card, cell } = present(197, 3, 0);
  assert.equal(card.value, '98.50');
  assert.equal(card.status, '预警');
  assert.equal(cell.raw, 98.5);
  const missing = present(0, 0, 11);
  assert.equal(missing.card.value, '0.00');
  assert.equal(missing.period.metrics['准交率'].counts.pending, 11);
  assert.match(missing.card.coverageNote, /未将其认定为已确认逾期/);
});
test('fully assessed rates retain decimals and sample success never replaces full denominator', () => {
  assert.equal(present(3479, 3, 0).card.value, '99.91');
  assert.equal(present(3482, 0, 0).card.value, '100.00');
  const { card, period } = present(98, 0, 2);
  assert.equal(period.metrics['准交率'].sample.value, 100);
  assert.equal(card.value, '98.00');
  assert.equal(card.status, '预警');
});
