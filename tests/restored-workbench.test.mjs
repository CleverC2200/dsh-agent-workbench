import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const output = await build({
  entryPoints: ['business/shared/configured-overview.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readConfiguredOverview, knownNumber } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
const configs = Object.fromEntries(
  await Promise.all(
    ['fc', 'qll', 'dealer'].map(async (a) => [
      a,
      JSON.parse(await readFile(`business/inventory-${a}/sql.config.json`, 'utf8')),
    ]),
  ),
);
function source(c, adapt = () => {}) {
  const calls = [];
  return {
    calls,
    execute: async (_, call) => {
      calls.push(call);
      const cols = c.queries[call.queryId].resultColumns;
      const r = {
        configVersion: 'v1',
        returnedColumns: cols,
        rows: [Object.fromEntries(cols.map((k) => [k, k === 'row_count' ? 50 : null]))],
      };
      if (cols.includes('total')) r.rows = [{ total: 50 }];
      if (/^source\.(?:stock|health|branch-stock)-date$/.test(call.queryId))
        r.rows = [{ day: '2026-10-14' }];
      if (call.queryId === 'source.dealer-stock-date') r.rows = [{ day: '2026-09-22' }];
      adapt(call, r);
      return r;
    },
  };
}
test('overview uses whole-scope aggregates without count or detail round trips', async () => {
  for (const a of ['fc', 'qll', 'dealer']) {
    const io = source(configs[a]);
    await readConfiguredOverview(configs[a], '2026-10-15', '', io);
    assert.ok(
      io.calls.every((c) =>
        /^overview\.quick-stock$|summary|\.cards$|\.inventory$|source\.(?:(?:dealer-|branch-)?stock|health)-date/.test(
          c.queryId,
        ),
      ),
      io.calls.map((call) => call.queryId).join(', '),
    );
    assert.ok(io.calls.some((c) => c.queryId.endsWith('.summary')));
  }
});
test('dealer selected customer reaches both independent aggregate scopes', async () => {
  const io = source(configs.dealer);
  await readConfiguredOverview(configs.dealer, '2026-10-15', '00123', io);
  assert.deepEqual(io.calls.map((c) => c.queryId).sort(), [
    'dealer.customers.summary',
    'dealer.stock.summary',
    'source.dealer-stock-date',
  ]);
  assert.ok(
    io.calls
      .filter((c) => !c.queryId.startsWith('source.'))
      .every((c) => c.values.customer === '00123'),
  );
  assert.equal(
    io.calls.find((c) => c.queryId === 'dealer.stock.summary').values.stat_date,
    '2026-09-22',
  );
});
test('unknown remains unknown; overview does not fabricate empty numeric values', () => {
  for (const x of [null, undefined, '', ' ', 'bad', NaN]) assert.equal(knownNumber(x), null);
  assert.equal(knownNumber('0'), 0);
});
test('an authorization failure stays local to its domain and is never retried', async () => {
  const io = source(configs.fc, (call) => {
    if (call.queryId === 'orders.summary') throw Error('denied');
  });
  const r = await readConfiguredOverview(configs.fc, '2026-10-15', '', io);
  assert.equal(r.orders.error, 'denied');
  assert.ok(r.replenishment.summary);
  assert.equal(io.calls.filter((c) => c.queryId === 'replenishment.summary').length, 1);
  assert.equal(io.calls.filter((c) => c.queryId === 'orders.summary').length, 1);
});
test('config changes across overview domains reject the combined overview', async () => {
  const io = source(configs.fc, (call, r) => {
    if (call.queryId.startsWith('orders.')) r.configVersion = 'v2';
  });
  await assert.rejects(readConfiguredOverview(configs.fc, '2026-10-15', '', io), {
    code: 'QUERY_CONFIG_CHANGED',
  });
});

test('fulfillment source fraction becomes a percentage exactly once, including zero', async () => {
  const { fulfillmentPercent } = await import(
    'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
  );
  assert.ok(Math.abs(fulfillmentPercent({ fulfillment_rate: '0.9468104' }) - 94.68104) < 1e-10);
  assert.equal(fulfillmentPercent({ fulfillment_rate: '0' }), 0);
  assert.equal(fulfillmentPercent({ fulfillment_rate: null }), null);
});
