import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const { outputFiles } = await build({
  entryPoints: ['src/page-runtime.ts'],
  bundle: true,
  packages: 'external',
  write: false,
  platform: 'node',
  format: 'cjs',
});
const module = { exports: {} };
new Function('require', 'module', 'exports', outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports,
);
const { PageRuntime } = module.exports;
test('page request context uses the existing owner and stops with page or identity release', async () => {
  const routes = new Map(),
    disposers = [],
    identity = new AbortController();
  const ctx = {
    connection: {
      fetch: {
        register: (route) => {
          routes.set(route.path, route);
          return () => routes.delete(route.path);
        },
      },
    },
    sessionController: { resolveAgent: async (id) => ({ agent: { id } }) },
    effect: (action) => {
      const dispose = action();
      if (typeof dispose === 'function') disposers.push(dispose);
    },
    on: () => () => {},
    inject: () => () => {},
  };
  const pages = new PageRuntime(ctx);
  pages.registerBusinessPage(
    {
      id: 'sales',
      kind: 'native',
      label: 'Sales',
      resourceId: 'sales',
      catalog: { surface: 'sales' },
    },
    async () => ({
      signal: identity.signal,
      referenceScope: 'test-user',
      access: {},
      allowsEffect: () => true,
      release: () => {},
    }),
  );
  const call = async (value) => {
    const res = await routes
      .get('/api/agent-workbench/page')
      .fetch(new Request('http://local/page', { method: 'POST', body: JSON.stringify(value) }));
    return res.json();
  };
  const one = 'session-10000000-0000-4000-8000-000000000001',
    two = 'session-10000000-0000-4000-8000-000000000002';
  const first = await call({
    operation: 'open',
    pageId: 'sales',
    resourceId: 'sales',
    sessionId: one,
  });
  const second = await call({
    operation: 'open',
    pageId: 'sales',
    resourceId: 'sales',
    sessionId: two,
  });
  assert.equal(pages.requestContext(first.owner).sessionId, one);
  assert.equal(pages.requestContext(second.owner).sessionId, two);
  assert.throws(() => pages.requestContext(two), /PAGE_OWNER_RELEASED/);
  const signal = pages.requestContext(first.owner).signal;
  await call({ operation: 'close', owner: first.owner });
  assert.equal(signal.aborted, true);
  assert.throws(() => pages.requestContext(first.owner), /PAGE_OWNER_RELEASED/);
  const remaining = pages.requestContext(second.owner).signal;
  identity.abort();
  assert.equal(remaining.aborted, true);
  assert.throws(() => pages.requestContext(second.owner), /PAGE_OWNER_RELEASED/);
  for (const dispose of disposers.reverse()) dispose();
});
