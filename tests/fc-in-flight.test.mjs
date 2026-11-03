import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const out = await build({
  entryPoints: ['business/shared/in-flight-query.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { inFlightQueries } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('overlapping cards and list share a pending read, never a completed or failed result', async () => {
  const shared = inFlightQueries();
  let calls = 0,
    resolve;
  const run = () => {
    calls++;
    return new Promise((r) => (resolve = r));
  };
  const a = shared('same-scope', run),
    b = shared('same-scope', run);
  await new Promise(setImmediate);
  assert.equal(calls, 1);
  resolve({ qty: 5 });
  assert.deepEqual(await Promise.all([a, b]), [{ qty: 5 }, { qty: 5 }]);
  await assert.rejects(
    shared('same-scope', async () => {
      throw Error('denied');
    }),
    /denied/,
  );
  assert.equal(await shared('same-scope', async () => 9), 9);
});
test('leaving one list does not cancel the card; leaving all subscribers cancels the transport', async () => {
  const shared = inFlightQueries();
  let signal, resolve;
  const run = (s) => {
    signal = s;
    return new Promise((r) => (resolve = r));
  };
  const a = new AbortController(),
    b = new AbortController();
  const first = shared('scope', run, a.signal),
    second = shared('scope', run, b.signal);
  await new Promise(setImmediate);
  a.abort();
  await assert.rejects(first, { name: 'AbortError' });
  assert.equal(signal.aborted, false);
  resolve(7);
  assert.equal(await second, 7);
  const c = new AbortController();
  const last = shared('other', run, c.signal);
  await new Promise(setImmediate);
  c.abort();
  await assert.rejects(last, { name: 'AbortError' });
  assert.equal(signal.aborted, true);
  assert.equal(await shared('other', async () => 8), 8);
});
test('different dates, filters, identities and refresh generations do not share a read', async () => {
  const shared = inFlightQueries();
  let calls = 0;
  const read = async () => {
    calls++;
    await new Promise(setImmediate);
    return calls;
  };
  await Promise.all(
    ['date1', 'date2', 'warehouse1', 'warehouse2', 'identity2', 'refresh2'].map((key) =>
      shared(key, read),
    ),
  );
  assert.equal(calls, 6);
});

test('cards and the list share one pending inventory-date read through their actual callers', async () => {
  const out = await build({
    stdin: {
      contents:
        "export {readConfiguredFacts} from './business/shared/configured-facts'; export {readConfiguredOverview} from './business/shared/configured-overview';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  const { readConfiguredFacts, readConfiguredOverview } = await import(
    'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
  );
  const { readFile } = await import('node:fs/promises');
  const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
  const calls = [];
  const execute = async (_, o) => {
    calls.push(o.queryId);
    await new Promise(setImmediate);
    if (o.queryId === 'summary.snapshot') return { configVersion: 'fixture', rows: [] };
    return {
      configVersion: 'fixture',
      rows: [
        Object.fromEntries(
          config.queries[o.queryId].resultColumns.map((k) => [
            k,
            k === 'day' ? '2026-11-01' : k === 'page_row_present' ? null : 0,
          ]),
        ),
      ],
    };
  };
  const [overview, page] = await Promise.all([
    readConfiguredOverview(config, '2026-11-02', '', { viewIds: ['branch-stock'], execute }),
    readConfiguredFacts(
      config,
      'replenishment',
      { asOf: '2026-11-02' },
      { execute, detailsOnly: true },
    ),
  ]);
  assert.equal(overview['branch-stock'].error, undefined);
  assert.equal(page.total, 0);
  assert.equal(calls.filter((id) => id === 'source.branch-stock-date').length, 1);
  const before = calls.length;
  await readConfiguredFacts(
    config,
    'replenishment',
    { asOf: '2026-11-02', readContext: page.readContext, filters: { list_mode: 'urgent' } },
    { execute, detailsOnly: true },
  );
  assert.deepEqual(calls.slice(before), ['replenishment.detail.atomic']);
  const expired = { ...page.readContext, readAt: Date.now() - 21 * 60 * 1000 };
  await readConfiguredFacts(
    config,
    'replenishment',
    { asOf: '2026-11-02', readContext: expired },
    { execute, detailsOnly: true },
  );
  assert.equal(calls.filter((id) => id === 'source.branch-stock-date').length, 2);
});
