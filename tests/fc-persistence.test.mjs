import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({
  entryPoints: ['business/shared/fc-persistence.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { FcPersistence } = await import(
  'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
);
const scope = { kind: 'plans', warehouseCode: '001' };
const store = () => {
  const m = new Map();
  return {
    keys: () => [...m.keys()],
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};
test('acknowledged but unverified save survives controller recreation; next operation only verifies', async () => {
  const calls = [],
    storage = store();
  const call = async (_m, r) => {
    calls.push(r);
    return r.operation === 'save'
      ? { status: 'saved-unverified', revision: '1' }
      : { status: 'saved', revision: '1', value: { plans: [] } };
  };
  let client = new FcPersistence(call, storage);
  await assert.rejects(
    () => client.save(scope, '0', { plans: [] }, new AbortController().signal),
    /回读/,
  );
  client = new FcPersistence(call, storage);
  assert.ok(client.pending(scope));
  await assert.rejects(
    () => client.save(scope, '0', { plans: [] }, new AbortController().signal),
    /不会重复写入/,
  );
  await client.verify(scope, new AbortController().signal);
  assert.deepEqual(
    calls.map((x) => x.operation),
    ['save', 'verify'],
  );
  assert.equal(client.pending(scope), false);
});
test('timeout cannot silently create a replacement write and unverified check preserves original intent', async () => {
  const storage = store(),
    calls = [];
  const client = new FcPersistence(async (_m, r) => {
    calls.push(r);
    if (r.operation === 'save') throw Error('timeout');
    return { status: 'unresolved' };
  }, storage);
  await assert.rejects(
    () => client.save(scope, '0', { plans: [] }, new AbortController().signal),
    /timeout/,
  );
  await assert.rejects(() => client.verify(scope, new AbortController().signal), /未重新写入/);
  assert.ok(client.pending(scope));
  assert.equal(calls[1].baseRevision, '0');
});
test('different warehouse pending intents do not collide and oversize stops before any write', async () => {
  const client = new FcPersistence(async () => ({ status: 'unknown' }), store());
  await assert.rejects(() => client.save(scope, '0', {}, new AbortController().signal));
  assert.equal(client.pending({ ...scope, warehouseCode: '002' }), false);
  await assert.rejects(
    () =>
      client.save(
        { ...scope, warehouseCode: '002' },
        '0',
        { text: 'x'.repeat(49000) },
        new AbortController().signal,
      ),
    /48KB/,
  );
  assert.equal(client.pending({ ...scope, warehouseCode: '002' }), false);
});
test('late response after caller cancellation does not clear pending intent or return success', async () => {
  const controller = new AbortController();
  const client = new FcPersistence(async () => {
    controller.abort();
    return { status: 'saved', revision: '1', value: {} };
  }, store());
  await assert.rejects(() => client.save(scope, '0', {}, controller.signal));
  assert.ok(client.pending(scope));
});

test('receipt recovery lists only matching pending receipt intents and survives controller recreation', async () => {
  const storage = store();
  const submission = { kind: 'submission', warehouseCode: '001', entityId: 'BATCH1' };
  let client = new FcPersistence(async () => ({ status: 'saved-unverified' }), storage);
  await assert.rejects(() =>
    client.save(submission, '1', { stage: 'dms-received' }, new AbortController().signal),
  );
  await assert.rejects(() => client.save(scope, '0', { plans: [] }, new AbortController().signal));
  await assert.rejects(() =>
    client.save(
      { ...submission, entityId: 'BATCH2' },
      '0',
      { stage: 'confirmed' },
      new AbortController().signal,
    ),
  );
  storage.setItem('branch-inventory:v1:write-intent:malformed', 'not JSON');
  client = new FcPersistence(async (_method, request) => {
    assert.equal(request.operation, 'verify');
    return { status: 'saved', revision: '2', value: { stage: 'dms-received' } };
  }, storage);
  assert.deepEqual(client.pendingReceipts(), [submission]);
  await client.verify(submission, new AbortController().signal);
  assert.deepEqual(client.pendingReceipts(), []);
  assert.equal(client.pending(scope), true);
});
