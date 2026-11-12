import test from 'node:test';
import assert from 'node:assert/strict';
import { installDetection } from '../src/detection-backend.mjs';
test('warning Host starts without local PG credentials and reports unavailable whitelist requests', async () => {
  const cleanups = [];
  let route;
  let requests = 0;
  const ctx = {
    effect(fn) {
      const cleanup = fn();
      if (cleanup) cleanups.push(cleanup);
    },
    connection: {
      fetch: {
        register(value) {
          route = value;
          return () => {};
        },
      },
      createSharedFetchHandler() {
        return {
          fetch: async () => {
            requests++;
            return Response.json(
              { ok: false, error: { message: '白名单未连接' } },
              { status: 503 },
            );
          },
        };
      },
    },
  };
  try {
    await installDetection(ctx);
    assert.equal(requests, 0);
    const r = await route.fetch(
      new Request('http://host/api/agent-workbench/detection', {
        method: 'POST',
        body: JSON.stringify({ op: 'list' }),
      }),
    );
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /白名单未连接/);
  } finally {
    for (const f of cleanups.reverse()) f();
  }
});
