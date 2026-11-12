import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhitelistStore } from '../src/detection-whitelist.mjs';

test('all warning state reads and writes use the authenticated whitelist bridge', async () => {
  const calls = [];
  const ctx = {
    connection: {
      createSharedFetchHandler() {
        return {
          fetch: async (req) => {
            assert.equal(new URL(req.url).pathname, '/api/gea-proof/warning/storage');
            const body = await req.json();
            calls.push(body);
            return Response.json({
              ok: true,
              value:
                body.operation === 'load'
                  ? { tasks: [], runs: [], events: [], revision: 'r1' }
                  : { saved: true, revision: 'r2' },
            });
          },
        };
      },
    },
  };
  const store = createWhitelistStore(ctx);
  await assert.rejects(store.save({}), /先.*读取/);
  const state = await store.load();
  await store.save(state);
  await store.save(state);
  assert.equal(calls[1].expectedRevision, 'r1');
  assert.equal(calls[2].expectedRevision, 'r2');
});
test('authorization and unknown save failures do not fall back to local state', async () => {
  const ctx = {
    connection: {
      createSharedFetchHandler() {
        return {
          fetch: async () =>
            Response.json(
              { ok: false, error: { code: 'DENIED', message: '禁止访问' } },
              { status: 403 },
            ),
        };
      },
    },
  };
  await assert.rejects(createWhitelistStore(ctx).load(), { code: 'DENIED', message: '禁止访问' });
});
