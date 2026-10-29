import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const output = await build({
  entryPoints: ['business/shared/grouped-order-overview.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readGroupedOrderOverview } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
const config = JSON.parse(await readFile('business/inventory-qll/sql.config.json', 'utf8'));
const fields = config.queries[config.overviewOrderGroups.queryId].resultColumns;
const row = (type, quantity, rate) => ({
  ...Object.fromEntries(fields.map((key) => [key, null])),
  pickup_type: type,
  row_count: 2,
  ordered: quantity,
  fulfillment_rate: rate,
});

test('one request retains separate factory/branch aggregates and binds the date range', async () => {
  const calls = [];
  const parts = await readGroupedOrderOverview(config, '2026-10-31', {
    execute: async (_request, call) => {
      calls.push(call);
      return { configVersion: 'v1', rows: [row('工厂', 120, 0.9), row('分仓', 30, 0.8)] };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].values.start, '2026-10-01');
  assert.equal(calls[0].values.end_exclusive, '2026-11-01');
  assert.equal(calls[0].values.pickup_type_mode, 'all');
  assert.equal(parts['factory-overview'].summary.ordered, 120);
  assert.equal(parts['branch-overview'].summary.fulfillment_rate, 0.8);
  assert.equal(parts['branch-overview'].configVersion, 'v1');
});

test('an absent pickup group is empty, without suppressing the other group', async () => {
  const parts = await readGroupedOrderOverview(config, '2026-10-28', {
    execute: async () => ({ configVersion: 'v1', rows: [row('分仓', 30, null)] }),
  });
  assert.equal(parts['factory-overview'].total, 0);
  assert.equal(parts['factory-overview'].summary, null);
  assert.equal(parts['branch-overview'].summary.ordered, 30);
  assert.equal(parts['branch-overview'].summary.fulfillment_rate, null);
});

test('duplicate groups and denied reads fail without a retry', async () => {
  await assert.rejects(
    readGroupedOrderOverview(config, '2026-10-28', {
      execute: async () => ({ rows: [row('工厂', 1, 1), row('工厂', 2, 1)] }),
    }),
    { code: 'INVALID_SUMMARY' },
  );
  let calls = 0;
  await assert.rejects(
    readGroupedOrderOverview(config, '2026-10-28', {
      execute: async () => {
        calls++;
        throw Object.assign(Error('denied'), { code: 'ROW_SCOPE_DENIED' });
      },
    }),
    { code: 'ROW_SCOPE_DENIED' },
  );
  assert.equal(calls, 1);
});

test('the landing reader shares one grouped request and isolates its failure from current orders', async () => {
  const bundle = await build({
    entryPoints: ['business/shared/configured-overview.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
  });
  const { readConfiguredOverview } = await import(
    'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
  );
  for (const denied of [false, true]) {
    const calls = [];
    const parts = await readConfiguredOverview(config, '2026-10-28', '', {
      viewIds: ['factory-overview', 'branch-overview'],
      execute: async (_request, call) => {
        calls.push(call.queryId);
        if (call.queryId === config.overviewOrderGroups.queryId) {
          if (denied) throw Object.assign(Error('denied'), { code: 'ROW_SCOPE_DENIED' });
          return { configVersion: 'v1', rows: [row('工厂', 120, 0.9), row('分仓', 30, 0.8)] };
        }
        return { configVersion: 'v1', rows: [] };
      },
    });
    assert.equal(calls.filter((id) => id === config.overviewOrderGroups.queryId).length, 1);
    assert.ok(!calls.includes('orders.summary'));
    assert.ok(parts['current-shortage']);
    assert.equal(parts['current-shortage'].error, undefined);
    if (denied) {
      assert.equal(parts['factory-overview'].error, 'denied');
      assert.equal(parts['branch-overview'].error, 'denied');
    } else {
      assert.equal(parts['factory-overview'].summary.ordered, 120);
      assert.equal(parts['branch-overview'].summary.ordered, 30);
    }
  }
});
