import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['src/page-session-core.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { withReadyPageSession } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
);

function host(refresh, initialCwd) {
  const row = { cwd: initialCwd };
  let released = 0;
  return {
    row,
    released: () => released,
    sessions: {
      list: { getSnapshot: () => ({ byId: { session: row } }) },
      refresh: () => refresh(row),
      retain: () => ({
        sessionId: 'session',
        ready: Promise.resolve(),
        binding: { session: { projections: { faceOf: () => ({ getSnapshot: () => 'mps' }) } } },
        release: () => released++,
      }),
    },
  };
}

test('a Host-created Session refreshes missing workspace metadata before page association', async () => {
  const ctx = host(async (row) => {
    row.cwd = '/owned/workspace';
  });
  let accepted;
  await withReadyPageSession(
    ctx,
    'session',
    new AbortController().signal,
    ({ projection }) => {
      accepted = projection;
    },
    { preset: 'mps', cwd: '/owned/workspace' },
  );
  assert.deepEqual(accepted, { sessionId: 'session', preset: 'mps', cwd: '/owned/workspace' });
  assert.equal(ctx.released(), 1);
});

test('cancelled metadata refresh cannot associate the page and still releases the Session', async () => {
  const controller = new AbortController();
  const ctx = host(async (row) => {
    row.cwd = '/owned/workspace';
    controller.abort();
  });
  await assert.rejects(
    withReadyPageSession(ctx, 'session', controller.signal, () => {
      assert.fail('cancelled page cannot be associated');
    }),
    { name: 'AbortError' },
  );
  assert.equal(ctx.released(), 1);
});

test('known workspace metadata keeps the existing mismatch protection', async () => {
  const ctx = host(() => assert.fail('known metadata does not need a refresh'), '/other/workspace');
  await assert.rejects(
    withReadyPageSession(
      ctx,
      'session',
      new AbortController().signal,
      () => {
        assert.fail('another workspace cannot be associated');
      },
      { preset: 'mps', cwd: '/owned/workspace' },
    ),
    /PAGE_SESSION_RECOVERY_MISMATCH/,
  );
  assert.equal(ctx.released(), 1);
});
