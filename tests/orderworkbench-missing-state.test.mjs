import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWorkbenchMetrics, workbenchMetricMissingReason } from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import { workbenchPresentation } from '../prototypes/inventory-orderworkbench/live-presentation.mjs';
import { workbenchCellMissingReason } from '../prototypes/inventory-orderworkbench/missing-reasons.mjs';

const period = (start, end, sections = []) => {
  const p = {start, end, sections};
  p.metrics = computeWorkbenchMetrics(p);
  return p;
};
const month = () => period('2026-11-01', '2026-11-02', [
  {id:'orders', status:'ready', rows:[{base:'郑州', demand:100, shortage:4, invalid:0}]},
  {id:'changes', status:'ready', rows:[{kind:'1', numerator:2, denominator:100, invalid:0}]},
]);

test('week without completed dates has a calendar explanation, not a loading explanation', () => {
  const p = period('2026-11-02','2026-11-02');
  assert.equal(p.metrics['作废率'].loading, false);
  assert.equal(p.metrics['作废率'].emptyPeriod, true);
  assert.match(p.metrics['作废率'].missingReason, /尚无已结束日期/);
  const loading = period('2026-11-01','2026-11-02', [{id:'changes',status:'loading',rows:[]}]);
  assert.match(loading.metrics['作废率'].missingReason, /未加载完成/);
  const failed = period('2026-11-01','2026-11-02', [{id:'changes',status:'error',code:'DENIED',rows:[]}]);
  assert.match(failed.metrics['作废率'].missingReason, /读取未成功.*DENIED/);
  const empty = period('2026-11-01','2026-11-02', [{id:'changes',status:'ready',rows:[]}]);
  assert.match(empty.metrics['作废率'].missingReason, /查询结果无记录/);
});

test('top values and period comparisons use month while the footer retains an empty current week', () => {
  const m = month();
  const w = period('2026-11-02','2026-11-02');
  const view = workbenchPresentation({selected:'week',complete:false,periods:{month:m,week:w,previousMonth:m,yearMonth:m}});
  const card = view.cards.find(x=>x.key==='作废率');
  assert.equal(card.value,'2.00');
  assert.equal(card.comparison[0],'+0.00%');
  assert.equal(card.comparison[2],'—');
  assert.match(card.comparisonNotes[2],/尚无已结束日期/);
  assert.equal(card.footer,'本周作废率 —');
  assert.match(card.footerNote,/尚无已结束日期/);
});

test('top hover reasons do not accidentally filter global source rows by an absent dimension label', () => {
  const m = month();
  m.sections[0].rows[0].demand = null;
  const reason = workbenchCellMissingReason({periods:{month:m}}, {header:'订单满足率'});
  assert.match(reason,/demand/);
  assert.doesNotMatch(reason,/查询结果无记录/);
  assert.match(workbenchCellMissingReason({periods:{}}, {row:['未映射'],header:'基地',dimension:'base-performance'}),/belong_base.*该组有库存/);
  assert.match(workbenchMetricMissingReason({start:'2026-11-03',end:'2026-11-02',sections:[]},'准交率'),/尚无已结束日期/);
});
