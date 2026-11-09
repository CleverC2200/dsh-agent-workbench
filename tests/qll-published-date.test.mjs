import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const config = JSON.parse(await readFile('business/inventory-qll/sql.config.json', 'utf8'));
const out = await build({
  stdin: {
    contents:
      "export {qllPublishedDate} from './business/shared/qll-published-date'; export {categoryTreeReader} from './business/shared/qll-category-tree'; export {readConfiguredOverview} from './business/shared/configured-overview';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { qllPublishedDate, categoryTreeReader, readConfiguredOverview } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
);
const metadata = {
  batch_id: 'batch',
  business_date: '2026-11-06',
  stock_date: '2026-11-05',
  target_month: '2026-11-01',
};
function snapshotReply(options, row = metadata) {
  return {
    rows: [row],
    returnedColumns: config.queries[options.queryId].resultColumns,
    rejectedColumns: [],
    configVersion: 'fixed',
  };
}
test('latest publication stays within the requested month; historical reads cannot use future facts', async () => {
  const execute = async (_, o) => snapshotReply(o);
  assert.equal(await qllPublishedDate(config, '2026-11-09', { execute }), '2026-11-06');
  assert.equal(await qllPublishedDate(config, '2026-11-06', { execute }), '2026-11-06');
  assert.equal(await qllPublishedDate(config, '2026-11-04', { execute }), '2026-11-04');
  assert.equal(await qllPublishedDate(config, '2026-10-31', { execute }), '2026-10-31');
  assert.equal(
    await qllPublishedDate({ ...config, agentId: 'inventory-fc' }, '2026-11-09', { execute }),
    '2026-11-09',
  );
});
test('a denied publication is never retried through original resources or replaced with zero', async () => {
  const calls = [];
  const execute = async (_, o) => {
    calls.push(o.queryId);
    throw Object.assign(Error('denied'), { code: 'DATA_PERMISSION_DENIED' });
  };
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      qllPublishedDate(config, '2026-11-09', { execute }),
      (e) => e.code === 'DATA_PERMISSION_DENIED',
    );
  assert.deepEqual(calls, ['summary.bootstrap']);
});
test('snapshot lists preserve genuine zero and unknown target independently', async () => {
  const daily = structuredClone(config);
  delete daily.dailySummary.bundle;
  const execute = async (_, o) => {
    const cols = daily.queries[o.queryId].resultColumns;
    if (o.queryId === 'summary.snapshot') return snapshotReply(o);
    if (o.queryId === 'snapshot.overview.quick-stock')
      return {
        rows: [
          {
            location_type: '基地',
            snapshot_date: '2026-11-05',
            row_count: 2,
            total_qty: 100,
            available_qty: 80,
            pack_unit_qty: 0,
            freeze_qty: 0,
          },
        ],
        returnedColumns: cols,
        rejectedColumns: [],
        configVersion: 'fixed',
      };
    if (o.queryId === 'snapshot.calendar.target_versions')
      return {
        rows: [{ month: '2026-11-01', inventory_version: '月初' }],
        returnedColumns: cols,
        rejectedColumns: [],
        configVersion: 'fixed',
      };
    assert.equal(o.queryId, 'snapshot.category-tree.base');
    return {
      rows: [
        { node_key: 'S0', inventory: 0, target: null, gap: null, daily: 0 },
        { node_key: 'S1', inventory: 100, target: 80, gap: 20, daily: 10 },
      ].map((r) => ({ ...Object.fromEntries(cols.map((c) => [c, null])), ...r })),
      returnedColumns: cols,
      rejectedColumns: [],
      configVersion: 'fixed',
    };
  };
  const result = await categoryTreeReader(daily, execute)(
    'base',
    { date: '2026-11-09', level: 'sku', category: '汤圆', organization: '华南' },
    new AbortController().signal,
  );
  assert.equal(result.readDate, '2026-11-06');
  assert.equal(result.rows[0].inventory, 0);
  assert.equal(result.rows[0].target, null);
  assert.equal(result.rows[0].gap, null);
  assert.equal(result.rows[1].inventory, 100);
  assert.equal(result.rows[1].gap, 20);
});

test('company metadata denial remains an error while an independently authorized channel can load', async () => {
  const calls = [];
  const execute = async (_, o) => {
    calls.push(o.queryId);
    if (o.queryId === 'summary.bootstrap')
      throw Object.assign(Error('company denied'), { code: 'DATA_PERMISSION_DENIED' });
    assert.ok(
      o.queryId === 'source.dealer-stock-date' || o.queryId.startsWith('dealer.stock.'),
      'denied company resources must not be retried',
    );
    const columns = config.queries[o.queryId].resultColumns;
    return {
      rows: [Object.fromEntries(columns.map((c) => [c, c === 'day' ? '2026-11-09' : 1]))],
      returnedColumns: columns,
      rejectedColumns: [],
      configVersion: 'fixed',
    };
  };
  const parts = await readConfiguredOverview(config, '2026-11-09', '', {
    execute,
    viewIds: ['health', 'channel-overview'],
  });
  assert.equal(parts.health.errorCode, 'DATA_PERMISSION_DENIED');
  assert.equal(parts.health.summary, undefined);
  assert.equal(parts['channel-overview'].error, undefined);
  assert.equal(parts['channel-overview'].readDate, '2026-11-09');
  assert.ok(parts['channel-overview'].summary);
  assert.equal(calls.filter((id) => id === 'summary.bootstrap').length, 1);
});
