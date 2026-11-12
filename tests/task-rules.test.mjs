import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, merge } from '../src/detection-backend.mjs';
const task = {
  id: 'test',
  metric: '周转天数',
  scope: '品类',
  description: '偏离目标±20%预警，空值也算正常',
};
const rule = {
  sourceType: 'task',
  taskQuote: task.description,
  kind: 'range',
  min: 8,
  max: 12,
  severe: null,
  nullPolicy: 'healthy',
};
const row = (value, status = '健康') => ({
  scope: '品类',
  objectKey: 'A',
  objectName: 'A',
  value,
  status,
  unit: '天',
  period: '2026-11',
  cutoff: '2026-11-11',
  evidence: '查询成功，原始值见结果',
  rule: { ...rule },
  ...(value === null ? { dataStatus: 'queried-null' } : {}),
});
const check = (r, t = task) => validate({ complete: true, results: [r] }, t);
test('识别跨逗号的空值判定并保留查询成功约束', () => {
  const description = '查询成功但返回空值时，该对象视为正常，继续检测其他对象';
  const result = row(null);
  result.rule.taskQuote = description;
  assert.equal(check(result, { ...task, description })[0].value, null);
  delete result.dataStatus;
  assert.throws(() => check(result, { ...task, description }), /查询成功返回空值/);
});
test('任务双侧阈值无需指标库编号版本或严重等级', () => {
  for (const n of [8, 10, 12]) assert.equal(check(row(n))[0].status, '健康');
  for (const n of [7, 13]) assert.equal(check(row(n, '预警'))[0].status, '预警');
  assert.throws(() => check(row(13, '严重')));
});
test('明确空值正常允许null但不替换成0', () => {
  const x = check(row(null))[0];
  assert.equal(x.value, null);
  assert.match(x.analysis, /空值按任务规则/);
});
test('未授权、否定、缺值及查询失败不可当健康', () => {
  for (const d of ['继续计算', '空值不能算正常']) {
    const r = row(null);
    r.rule.taskQuote = d;
    assert.throws(() => check(r, { ...task, description: d }));
  }
  const r = row(null);
  delete r.dataStatus;
  assert.throws(() => check(r));
  assert.throws(() => check(row(undefined)));
  assert.throws(() => validate({ complete: false, error: '工具失败', results: [row(null)] }, task));
});
test('空值恢复原事件并保留空值说明', () => {
  const state = { events: [] };
  const r1 = { id: 'r1', at: '2026-11-11', created: 0, updated: 0, recovered: 0 };
  merge(state, task, check(row(13, '预警')), r1);
  const x = row(null);
  x.cutoff = '2026-11-12';
  const r2 = { id: 'r2', at: '2026-11-12', created: 0, updated: 0, recovered: 0 };
  merge(state, task, check(x), r2);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].eventStatus, '已恢复');
  assert.equal(state.events[0].value, null);
  assert.match(state.events[0].metric, /空值/);
  assert.equal(r2.recovered, 1);
});
test('单侧任务阈值可不设严重等级', () => {
  const r = row(15, '预警');
  r.rule = {
    sourceType: 'task',
    taskQuote: '大于11天预警',
    healthy: 11,
    healthyOperator: 'lte',
    direction: 'lower',
    severe: null,
  };
  assert.equal(check(r, { ...task, description: '大于11天预警' })[0].status, '预警');
});
