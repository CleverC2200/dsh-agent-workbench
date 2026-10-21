import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const { outputFiles } = await build({
  stdin: {
    contents:
      "export {readCurrentShortage,currentShortageSum} from './business/shared/current-shortage.ts'",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readCurrentShortage, currentShortageSum } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
const fields = config.queries['current-shortage.detail'].resultColumns;
const row = (index, total = 11) =>
  Object.fromEntries(
    fields.map((k) => [
      k,
      {
        sku: 'S' + index,
        location_type: '分仓',
        location_code: 'A020',
        base: '遂平',
        invalid: 0,
        demand: 10,
        allocated: 2,
        remaining: 8,
        available: 3,
        shortage: 5,
        page_scope_total: total,
        page_row_present: 1,
      }[k] ?? null,
    ]),
  );
test('current shortage pages bind ten rows and fresh offsets with same-statement totals', async () => {
  const calls = [];
  const execute = async (request, options) => {
    calls.push({ request, options });
    const offset = options.values.offset;
    return {
      rows:
        offset === 0
          ? Array.from({ length: 10 }, (_, i) => row(i))
          : offset === 10
            ? [row(10)]
            : [{ ...row(0), page_row_present: null }],
      returnedColumns: fields,
      rejectedColumns: [],
    };
  };
  for (const page of [1, 2, 3]) {
    const result = await readCurrentShortage(
      config,
      'current-shortage.detail',
      { warehouse_code: 'A020' },
      { page, execute },
    );
    assert.equal(result.total, 11);
    assert.equal(result.rows.length, [10, 1, 0][page - 1]);
  }
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((c) => c.request.parameters.gea_p5),
    [0, 10, 20],
  );
  assert.ok(
    calls.every(
      (c) => c.request.parameters.gea_p4 === 10 && c.request.parameters.gea_p2 === 'A020',
    ),
  );
  assert.ok(calls.every((c) => !('consumerCode' in c.options.values)));
});
test('permission failures and invalid scope never become zero shortage', async () => {
  await assert.rejects(
    readCurrentShortage(
      config,
      'current-shortage.summary',
      {},
      {
        execute: async () => ({ success: false, errorCode: 'ROW_SCOPE_DENIED', message: 'denied' }),
      },
    ),
    { code: 'ROW_SCOPE_DENIED' },
  );
  await assert.rejects(
    readCurrentShortage(
      config,
      'current-shortage.detail',
      {},
      {
        execute: async () => ({
          rows: [{ ...row(0, 1), invalid: 1 }],
          returnedColumns: fields,
          rejectedColumns: [],
        }),
      },
    ),
    { code: 'CURRENT_SHORTAGE_INCOMPLETE' },
  );
  assert.equal(currentShortageSum(undefined, 'shortage'), null);
  assert.equal(currentShortageSum([{ location_type: '分仓', shortage: 0 }], 'shortage', '分仓'), 0);
  assert.equal(
    currentShortageSum([{ location_type: '分仓', shortage: null }], 'shortage', '分仓'),
    null,
  );
});
test('query cancellation is preserved before any transport call', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    readCurrentShortage(
      config,
      'current-shortage.summary',
      {},
      {
        signal: controller.signal,
        execute: async () => {
          calls++;
        },
      },
    ),
    { name: 'AbortError' },
  );
  assert.equal(calls, 0);
});
