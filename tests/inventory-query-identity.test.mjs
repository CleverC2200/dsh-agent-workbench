import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

test('a late old-identity metadata read cannot replace the active reader batch', async (t) => {
  const previous = globalThis.window;
  globalThis.window = new EventTarget();
  t.after(() => {
    globalThis.window = previous;
  });
  const built = await build({
    entryPoints: ['business/shared/agent-query.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  const { createAgentQueries } = await import(
    'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
  );
  const cfg = {
    schemaVersion: 1,
    templates: {},
    agentId: 'inventory-fc',
    dailySummary: { snapshotQueryId: 'snapshot' },
    queries: {
      snapshot: {
        parameterSpec: {},
        request: { sql: 'SELECT 1 AS batch_id', parameters: {} },
        resultColumns: ['batch_id', 'business_date', 'stock_date', 'target_month'],
      },
    },
  };
  let finishOld,
    reads = 0;
  const row = (batch_id) => ({
    batch_id,
    business_date: '2026-11-06',
    stock_date: '2026-11-05',
    target_month: '2026-11-01',
  });
  const execute = async () => {
    reads++;
    if (reads === 1)
      return new Promise((resolve) => {
        finishOld = resolve;
      });
    return { rows: [row('20261106110000000000')] };
  };
  const reader = createAgentQueries(cfg, execute);
  const old = reader.snapshot();
  const rejected = assert.rejects(old, { code: 'IDENTITY_CHANGED' });
  while (!finishOld) await new Promise(setImmediate);
  window.dispatchEvent(new Event('gea-identity-changed'));
  assert.equal((await reader.snapshot()).batchId, '20261106110000000000');
  finishOld({ rows: [row('20261106100000000000')] });
  await rejected;
  assert.equal((await reader.snapshot()).batchId, '20261106110000000000');
});
