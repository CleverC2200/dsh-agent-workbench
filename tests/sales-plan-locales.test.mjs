import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('sales plan overview has a display label in both supported languages', () => {
  const en = JSON.parse(
    readFileSync(new URL('../src/workbench/original/en-US.json', import.meta.url), 'utf8'),
  );
  const zh = JSON.parse(
    readFileSync(new URL('../src/workbench/original/zh-CN.json', import.meta.url), 'utf8'),
  );
  const find = (value) =>
    value &&
    typeof value === 'object' &&
    (value.scopeTotals?.overview || Object.values(value).map(find).find(Boolean));
  assert.equal(find(en), 'Plan overview');
  assert.equal(find(zh), '计划概览');
});

test('sales plan error fallbacks explain recovery without diagnostic references or client implementation details', () => {
  for (const locale of ['zh-CN', 'en-US']) {
    const copy = JSON.parse(
      readFileSync(new URL(`../src/workbench/original/${locale}.json`, import.meta.url), 'utf8'),
    ).assistantSurface.regionalApproval;
    const submit = copy.liveSubmit.errors;
    const action = copy.liveAction.errors;
    for (const text of [
      submit.configuration,
      submit.permission,
      submit.conflict,
      submit.rateLimited,
      submit.serviceUnavailable,
      submit.retryExhausted,
      action.rateLimited,
    ]) {
      assert.doesNotMatch(
        text,
        /错误编号|幂等键|AionCore|伪造|未提前更新本地状态|调用预算|error reference|idempotency key|fabricate|local state|call budget|retry round|call round/i,
      );
    }
    assert.match(submit.configuration, /管理员|administrator/i);
    assert.match(submit.permission, /权限|permission/i);
    assert.match(submit.conflict, /刷新|refresh/i);
    assert.match(submit.rateLimited, /稍后|later/i);
    assert.match(action.rateLimited, /重试|retry/i);
    assert.match(submit.serviceUnavailable, /核对|check/i);
    assert.match(submit.retryExhausted, /核对|check/i);
  }
});
