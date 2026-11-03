import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
const built = await build({
  stdin: {
    contents: "export {readCurrentShortage} from './business/shared/current-shortage.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { readCurrentShortage } = await import(
  'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
);
const config = JSON.parse(await fs.readFile('business/inventory-qll/sql.config.json', 'utf8'));
const rows = Array.from({ length: 56 }, (_, i) => ({
  snapshot_date: '2026-11-01',
  location_type: '分仓',
  location_code: 'W' + Math.floor(i / 2),
  location_name: '仓' + Math.floor(i / 2),
  base: i % 2 ? '郑州' : '遂平',
  warehouse_code: 'W' + Math.floor(i / 2),
  demand: 1,
  allocated: 1,
  remaining: 0,
  available: 0,
  shortage: 0,
  invalid: 0,
}));
function execute(truncate = false) {
  const calls = [];
  const run = async (_, call) => {
    calls.push(call);
    if (['summary.snapshot', 'summary.bootstrap'].includes(call.queryId)) return { rows: [] };
    if (call.queryId.endsWith('.count')) return { rows: [{ total: 56 }] };
    const { offset, page_size } = call.values;
    const page = rows.slice(offset, offset + page_size - (truncate && offset === 0 ? 1 : 0));
    return { rows: page.map((row) => ({ ...row, page_row_present: 1, page_scope_total: 56 })) };
  };
  return { run, calls };
}
test('current-order location aggregates read all 56 rows across the gateway 50-row boundary', async () => {
  const { run, calls } = execute();
  const result = await readCurrentShortage(
    config,
    'current-shortage.locations',
    {},
    { execute: run },
  );
  assert.equal(result.total, 56);
  assert.equal(result.rows.length, 56);
  assert.deepEqual(
    calls
      .filter(
        (c) =>
          !c.queryId.endsWith('.count') &&
          !['summary.snapshot', 'summary.bootstrap'].includes(c.queryId),
      )
      .map((c) => c.values.offset),
    [0, 50],
  );
});
test('current-order collections reject a truncated page instead of accepting partial totals', async () => {
  const { run } = execute(true);
  await assert.rejects(
    readCurrentShortage(config, 'current-shortage.locations', {}, { execute: run }),
    /不完整|INCOMPLETE|原子分页|分页/,
  );
});
