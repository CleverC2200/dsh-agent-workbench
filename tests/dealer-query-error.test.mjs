import test from 'node:test';
import assert from 'node:assert/strict';
import { sqlQueryError } from '../business/shared/query-error.js';

test('a missing tenant dataset stays an unavailable source, with the original failure preserved', () => {
  const original = Error(
    'GEA SQL 查询失败（RESOURCE_NOT_IN_DATASET）：数据表不在当前租户启用数据集范围内',
  );
  const error = sqlQueryError(original);
  assert.match(error.message, /当前环境.*数据源/);
  assert.match(error.message, /不能判断.*为空/);
  assert.equal(error.cause, original);
  assert.equal(sqlQueryError(error), error);
});
