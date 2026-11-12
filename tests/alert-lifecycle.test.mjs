import assert from 'node:assert/strict';
import { cron, validate, merge, canonicalize } from '../src/detection-backend.mjs';
assert.equal(cron({ frequency: 'workdays', time: '09:30' }), '0 30 9 ? * MON-FRI');
assert.equal(cron({ frequency: 'weekly', time: '08:00', days: ['1', '5'] }), '0 0 8 ? * MON,FRI');
assert.throws(() => cron({ frequency: 'monthly', monthday: '31' }));
const t = { id: 't1', metric: '订单满足率', scope: '品类' };
const row = {
  scope: '品类',
  objectKey: 'c1',
  objectName: '水饺',
  value: 92,
  unit: '%',
  period: '2026-11',
  cutoff: '2026-11-05 08:00',
  status: '预警',
  evidence: 'fixture query',
  rule: {
    id: 'r',
    version: 'v1',
    source: 'fixture rule',
    direction: 'higher',
    healthyOperator: 'gte',
    healthy: 95,
    severe: 90,
  },
};
assert.throws(() => validate({ complete: false, results: [row] }, t));
assert.throws(() => validate({ complete: true, results: [{ ...row, scope: '基地' }] }, t));
assert.throws(() => validate({ complete: true, results: [{ ...row, status: '健康' }] }, t));
const state = { events: [] };
const run = () => ({
  id: Math.random() + '',
  at: new Date().toISOString(),
  created: 0,
  updated: 0,
  recovered: 0,
});
merge(state, t, validate({ complete: true, results: [row] }, t), run());
const id = state.events[0].id;
merge(state, t, [row], run());
assert.equal(state.events[0].hits, 1);
merge(state, t, [{ ...row, cutoff: '2026-11-06 08:00' }], run());
assert.equal(state.events[0].hits, 2);
assert.equal(state.events[0].id, id);
merge(state, t, [{ ...row, value: 97, status: '健康', cutoff: '2026-11-07 08:00' }], run());
assert.equal(state.events[0].eventStatus, '已恢复');
merge(state, t, [{ ...row, cutoff: '2026-11-08 08:00' }], run());
assert.equal(state.events.length, 1);
assert.equal(state.events[0].id, id);
state.events[0].eventStatus = '已关闭';
state.events[0].pendingClose = false;
merge(state, t, [{ ...row, cutoff: '2026-11-09 08:00' }], run());
assert.equal(state.events.length, 2);
assert.notEqual(state.events[0].id, id);
console.log(
  'PASS scope validation, rule validation, schedules, dedup, unchanged cutoff, recovery, recurrence',
);

assert.equal(
  validate(
    {
      complete: true,
      rule: { ...row.rule, healthyOperator: 'gt' },
      results: [{ ...row, rule: undefined, value: 95, status: '预警' }],
    },
    t,
  )[0].status,
  '预警',
);
assert.throws(() =>
  validate(
    {
      complete: true,
      rule: { ...row.rule, healthyOperator: 'gt' },
      results: [{ ...row, rule: undefined, value: 95, status: '健康' }],
    },
    t,
  ),
);
console.log('PASS common rule and strict 95 percent boundary');

const keys = { events: [] };
merge(keys, t, [row], run());
merge(
  keys,
  t,
  [{ ...row, rule: { ...row.rule, id: 'different-ai-label' }, cutoff: '2026-11-06' }],
  run(),
);
assert.equal(keys.events.length, 1);
console.log('PASS model rule label variation does not duplicate events');

const duplicateState = {
  events: [
    {
      ...keys.events[0],
      id: 'old',
      metricName: t.metric,
      scopeType: t.scope,
      first: '2026-11-05T01:00:00Z',
      history: [{ runId: 'r1', at: '2026-11-05T01:00:00Z', cutoff: '2026-11-04', status: '预警' }],
    },
    {
      ...keys.events[0],
      id: 'new',
      metricName: t.metric,
      scopeType: t.scope,
      first: '2026-11-05T02:00:00Z',
      history: [
        { runId: 'r2', at: '2026-11-05T02:00:00Z', cutoff: '2026-11-04（T+1）', status: '预警' },
      ],
    },
  ],
};
canonicalize(duplicateState);
assert.equal(duplicateState.events.filter((e) => e.eventStatus === '活跃').length, 1);
assert.equal(duplicateState.events[0].history.length, 2);
assert.equal(duplicateState.events[0].hits, 1);
console.log('PASS historical duplicate merge and cutoff annotation normalization');

const quotedTask = {
  ...t,
  description: '订单满足率大于等于0%为健康，低于0%为预警，不设置严重线。',
};
const quotedResult = () => ({
  complete: true,
  results: [
    {
      ...row,
      value: 98.99,
      status: '健康',
      rule: {
        source: 'task',
        taskQuote: quotedTask.description,
        direction: 'higher',
        healthy: 0,
        healthyOperator: 'gte',
        severe: null,
      },
    },
  ],
});
assert.equal(validate(quotedResult(), quotedTask)[0].rule.id, 'task:' + t.id);
const unverifiedQuote = quotedResult();
unverifiedQuote.results[0].rule.taskQuote = '未授权的阈值';
assert.throws(() => validate(unverifiedQuote, quotedTask), /任务规则缺少原文依据/);
console.log('PASS task source alias retains exact quote and threshold validation');
