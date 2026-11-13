import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/page-request.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { createPageRequest } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

test('default transport resolves fetch when invoked after page initialization', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const request = createPageRequest();
  const operations = [];
  globalThis.fetch = async (_url, options) => {
    const { operation } = JSON.parse(options.body);
    operations.push(operation);
    return Response.json({ operation });
  };
  const signal = new AbortController().signal;
  assert.deepEqual(await request('open', {}, signal), { operation: 'open' });
  assert.deepEqual(await request('sql', {}, signal), { operation: 'sql' });
  assert.deepEqual(operations, ['open', 'sql']);
});

test('slow SQL leaves control traffic available and cancelled queued reads never start', async () => {
  const started = [],
    pending = [];
  const request = createPageRequest(async (_url, options) => {
    const { operation, id } = JSON.parse(options.body);
    started.push([operation, id]);
    if (operation === 'sql') await new Promise((resolve) => pending.push(resolve));
    return Response.json({ operation, id });
  });
  const controllers = Array.from({ length: 6 }, () => new AbortController());
  const reads = controllers.map((controller, id) => request('sql', { id }, controller.signal));
  const cancelled = assert.rejects(reads[5], { name: 'AbortError' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started.length, 3);
  assert.deepEqual(await request('events', {}, new AbortController().signal), {
    operation: 'events',
  });
  controllers[5].abort();
  await cancelled;
  while (pending.length) {
    pending.splice(0).forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  await Promise.all(reads.slice(0, 5));
  assert.equal(started.filter(([op]) => op === 'sql').length, 5);
  assert.ok(!started.some(([op, id]) => op === 'sql' && id === 5));
});

test('SQL failure releases a shared slot for another page', async () => {
  let release;
  const blocker = new Promise((resolve) => {
    release = resolve;
  });
  const started = [];
  const request = createPageRequest(async (_url, options) => {
    const { id } = JSON.parse(options.body);
    started.push(id);
    if (id === 'failure') return Response.json({ error: 'QUERY_FAILED' }, { status: 400 });
    await blocker;
    return Response.json({ id });
  });
  const signal = new AbortController().signal;
  const failure = assert.rejects(request('sql', { id: 'failure' }, signal), /QUERY_FAILED/);
  const pending = ['first', 'second', 'next'].map((id) => request('sql', { id }, signal));
  await failure;
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(started.includes('next'));
  release();
  await Promise.all(pending);
});
