import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const config = JSON.parse(await readFile('business/inventory-apsplan/sql.config.json', 'utf8'));
const output = await build({
  entryPoints: ['business/shared/workspace-query.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readWorkspaceQuery } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
function transport(name, values) {
  const calls = [];
  return {
    calls,
    execute: async (_, call) => {
      calls.push(call);
      const query = config.queries[call.queryId];
      const rows = call.queryId.endsWith('.count')
        ? [{ total: values.length }]
        : values.map((value) =>
            Object.fromEntries(query.resultColumns.map((key) => [key, value[key] ?? null])),
          );
      return {
        rows,
        returnedColumns: query.resultColumns,
        rejectedColumns: [],
        configVersion: 'same-installed-config',
      };
    },
  };
}
test('APS can read existing warehouse inventory without assigning a branch name to a production base', async () => {
  const io = transport('branch', [
    {
      warehouse: 'W1',
      name: '分仓一',
      base: null,
      category: '饺子',
      inventory: 12,
      available: 0,
      records: 1,
      source_date: '2026-10-18',
    },
  ]);
  const rows = await readWorkspaceQuery(
    config,
    'branch',
    { start: '2026-10-01', end: '2026-10-19', summary: true },
    io,
  );
  assert.equal(rows[0].inventory, 12);
  assert.equal(rows[0].available, 0);
  assert.equal(rows[0].base, null);
  assert.equal(config.workspaceUnavailable.branch, undefined);
  assert.ok(io.calls.every((call) => call.values.end_exclusive === '2026-10-20'));
  assert.ok(io.calls.every((call) => call.queryId !== 'source.stock-date'));
});
test('APS monthly operations retain amount and flow separately and keep source zeros', async () => {
  const io = transport('operations', [
    { metric_group: '费用', metric: '运输费', month: '202610', value: 0, records: 1 },
  ]);
  const rows = await readWorkspaceQuery(
    config,
    'operations',
    { start: '2026-09-01', end: '2026-10-19', summary: true },
    io,
  );
  assert.equal(rows[0].value, 0);
  assert.equal(rows[0].metric_group, '费用');
  assert.equal(config.workspaceUnavailable.operations, undefined);
  assert.ok(
    io.calls.every(
      (call) =>
        call.values.start_month === '202609' && call.values.end_month_exclusive === '202611',
    ),
  );
});
test('APS branch source failures stay visible rather than becoming an empty successful source', async () => {
  await assert.rejects(
    readWorkspaceQuery(
      config,
      'branch',
      { start: '2026-10-01', end: '2026-10-19' },
      {
        execute: async () => {
          throw Object.assign(Error('denied'), { code: 'NO_RETURN_COLUMN_ALLOWED' });
        },
      },
    ),
    (error) => error.code === 'NO_RETURN_COLUMN_ALLOWED',
  );
});
