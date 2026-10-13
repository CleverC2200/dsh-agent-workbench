import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
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

test('the actual shared SQL reader preserves a missing-dataset failure across the page transport', async () => {
  const output = await build({
    entryPoints: ['business/shared/sql-reader.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'missing-dataset-transport',
        setup(api) {
          api.onResolve({ filter: /channel\.js$/ }, () => ({
            path: 'transport',
            namespace: 'fixture',
          }));
          api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents:
              'export async function call() { throw Error("GEA SQL 查询失败（RESOURCE_NOT_IN_DATASET）：数据表不在当前租户启用数据集范围内"); }',
          }));
        },
      },
    ],
  });
  const reader = await import(
    'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
  );
  await assert.rejects(
    reader.executeGeaSqlPage('SELECT * FROM agents_scm_cust_inventory_daily'),
    (error) => {
      assert.match(error.message, /当前环境.*数据源/);
      assert.match(error.cause.message, /RESOURCE_NOT_IN_DATASET/);
      return true;
    },
  );
});
