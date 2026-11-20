import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from '../src/detection-backend.mjs';
import { parseDetectionOutput, normalizeDetectionScope } from '../src/detection-output.mjs';
test('scope aliases preserve dimensions', () => {
  assert.equal(normalizeDetectionScope('品类 × 基地'), '品类*基地');
  assert.equal(normalizeDetectionScope('基地'), '基地');
});
test('terminal error takes precedence over earlier JSON', () => {
  assert.throws(
    () =>
      parseDetectionOutput(['{"complete":true}'], {
        kind: 'error',
        error: {
          code: 'GEA_MODEL_INVALID_TOOL_CALL',
          message: 'invalid JSON',
          requestId: 'trace-test',
        },
      }),
    /GEA_MODEL_INVALID_TOOL_CALL.*trace-test/,
  );
  assert.throws(() => parseDetectionOutput(['{"complete":true}', 'unfinished']), /最终回复/);
  assert.deepEqual(parseDetectionOutput(['```json\n{"complete":true}\n```']), { complete: true });
});
test('reads one JSON result fenced inside the final answer and rejects ambiguous results', () => {
  const fence = '```json\n{"complete":true,"results":[]}\n```';
  assert.deepEqual(parseDetectionOutput(['检测结果如下：\n' + fence + '\n检测完成。']), {
    complete: true,
    results: [],
  });
  assert.throws(() => parseDetectionOutput([fence + '\n' + fence]), /有效JSON/);
  assert.throws(() => parseDetectionOutput([fence, '最终未完成']), /有效JSON/);
});
test('replay 38 objects; reject duplicates and wrong scope', () => {
  const { task, response } = JSON.parse(
    readFileSync(new URL('./fixtures/detection-scope-alias.json', import.meta.url), 'utf8'),
  );
  const result = structuredClone(response);
  assert.equal(validate(result, task).length, 38);
  assert.ok(result.results.every((r) => r.scope === task.scope));
  result.results.push(structuredClone(result.results[0]));
  assert.throws(() => validate(result, task), /颗粒度或对象编码/);
  result.results.pop();
  result.results[0].scope = '基地';
  assert.throws(() => validate(result, task), /颗粒度或对象编码/);
});

test('exact task metadata wrapper accepted; altered quote rejected', () => {
  const { task, response } = JSON.parse(
    readFileSync(new URL('./fixtures/detection-scope-alias.json', import.meta.url), 'utf8'),
  );
  task.metric = '基地目标周转天数';
  const result = structuredClone(response);
  for (const r of result.results)
    r.rule.taskQuote = `指标：${task.metric}；检测范围：${task.scope}；任务说明：${task.description}`;
  assert.equal(validate(result, task).length, 38);
  assert.equal(result.results[0].rule.taskQuote, task.description);
  result.results[0].rule.taskQuote =
    '指标：错误指标；检测范围：' + task.scope + '；任务说明：' + task.description;
  assert.throws(() => validate(result, task), /原文依据/);
});

test('derive direction from health comparator; preserve inconsistent original direction', () => {
  const { task, response } = JSON.parse(
    readFileSync(new URL('./fixtures/detection-direction.json', import.meta.url), 'utf8'),
  );
  const rows = validate(response, task);
  assert.equal(rows.length, 6);
  assert.ok(
    rows.every((r) => r.rule.direction === 'higher' && r.rule.originalDirection === 'lower'),
  );
  const bad = structuredClone(response);
  bad.results[0].rule.severe = 110;
  assert.throws(() => validate(bad, task), /阈值顺序/);
});
