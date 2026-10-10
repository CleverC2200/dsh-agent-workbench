import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from './public-build.mjs';
const r = await build({
  entryPoints: [fileURLToPath(new URL('../../app/data/gea-sql.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { readGovernedSql } = await import(
  'data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64')
);
test('uses host SQL delegation without local workspace or credentials', async () => {
  let called;
  const rows = await readGovernedSql(
    async (method, parameters) => {
      called = { method, parameters };
      return { rows: [{ qty: 0 }] };
    },
    'SELECT quantity AS qty FROM approved WHERE day=:gea_p1',
    { gea_p1: '2026-09-22' },
  );
  assert.equal(called.method, 'sql');
  assert.deepEqual(called.parameters.parameters, { gea_p1: '2026-09-22' });
  assert.deepEqual(rows, [{ qty: 0 }]);
});
test('permission denial is not retried and partial columns never become complete KPI data', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      readGovernedSql(
        async () => {
          calls++;
          return {
            success: false,
            failure: { reasonCode: 'RESOURCE_NOT_PUBLISHED', stage: 'VALIDATE' },
          };
        },
        'fixed',
        {},
      ),
    { code: 'RESOURCE_NOT_PUBLISHED' },
  );
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      readGovernedSql(async () => ({ rows: [{}], rejectedColumns: ['denominator'] }), 'fixed', {}),
    { code: 'GEA_RETURN_COLUMNS_REJECTED' },
  );
  await assert.rejects(
    () => readGovernedSql(async () => ({ rows: [], hasMore: true }), 'fixed', {}),
    { code: 'GEA_RESULT_INCOMPLETE' },
  );
});
