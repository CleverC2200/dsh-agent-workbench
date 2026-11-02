import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reportPeriods,
  computeWorkbenchMetrics,
  workbenchMetricMissingReason,
} from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import { workbenchEvidence } from '../prototypes/inventory-orderworkbench/live-presentation.mjs';

test('Monday T-1 window is complete without completed dates, not loading or a claim that source tables are empty', () => {
  const specs = reportPeriods('2026-11-02', '2026-11-09', new Date('2026-11-02T07:25:11Z'));
  assert.equal(specs.week.start, specs.week.end);
  const period = { ...specs.week, sections: [] };
  period.metrics = computeWorkbenchMetrics(period);
  for (const metric of Object.values(period.metrics)) {
    assert.equal(metric.value, null);
    assert.match(metric.missingReason, /T-1.*未发起空区间查询/);
    assert.equal(metric.note, metric.missingReason);
    assert.doesNotMatch(metric.missingReason, /尚未完成读取/);
  }
  const evidence = workbenchEvidence({
    source: 'gea-governed-sql',
    complete: true,
    periods: { week: period },
  });
  assert.equal(evidence.complete, true);
  assert.deepEqual(evidence.pendingPeriods, []);
  assert.equal(evidence.periods.week.orderWindow.state, 'no-completed-days');
  const saved = structuredClone(period);
  saved.metrics['作废率'].note = '所选周期及授权范围内无来源数据';
  const restored = workbenchEvidence({ complete: true, periods: { week: saved } });
  assert.match(restored.periods.week.metrics['作废率'].note, /T-1/);
  assert.equal(saved.metrics['作废率'].note, '所选周期及授权范围内无来源数据');
  const next = reportPeriods('2026-11-02', '2026-11-09', new Date('2026-11-03T07:25:11Z'));
  assert.equal(next.week.end, '2026-11-03');
});

test('unloaded, denied and empty successful reads retain different reasons', () => {
  assert.match(workbenchMetricMissingReason(undefined, '订单满足率'), /尚未完成读取/);
  const range = { start: '2026-11-01', end: '2026-11-02' };
  assert.match(
    workbenchMetricMissingReason(
      { ...range, sections: [{ id: 'orders', status: 'error', code: 'DENIED', rows: [] }] },
      '订单满足率',
    ),
    /DENIED/,
  );
  assert.match(
    workbenchMetricMissingReason(
      { ...range, sections: [{ id: 'orders', status: 'ready', rows: [] }] },
      '订单满足率',
    ),
    /当前授权.*无记录.*不代表整张表为空/,
  );
});
