import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({
  entryPoints: ['src/business-conversation.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { startInventoryConversation } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
);
function fixture() {
  const calls = [],
    controller = new AbortController();
  let identity = {
    state: 'confirmed',
    scope: 'owner-a',
    subject: 'subject-a',
    status: { authenticated: true },
  };
  const input = {
    signal: controller.signal,
    cwd: '/user/workspace',
    question: '帮我分析遂平基地的安全库存',
    account: { getSnapshot: () => identity },
    workbench: {
      getSnapshot: () => ({ pages: [{ id: 'inventory-aqkc' }] }),
      open: async (page) => {
        calls.push(['page', page]);
      },
    },
    associate: async (...args) => {
      calls.push(['associate', args[0], args[1], args[3]]);
    },
    host: {
      fetch: async (_url, options) => {
        calls.push(['resource', JSON.parse(options.body)]);
        return Response.json({ preset: 'gea-html-inventory-aqkc' });
      },
      workspace: async (path) => {
        calls.push(['workspace', path]);
        return { workspaceId: 'workspace', path };
      },
      create: async (options) => {
        calls.push(['create', options]);
        return 'new-business';
      },
      select: async (...args) => {
        calls.push(['select', ...args]);
      },
      open: async (id, skill, signal, beforeOpen, draft) => {
        calls.push(['draft', draft, skill]);
        await beforeOpen?.({
          sessionId: id,
          preset: 'gea-html-inventory-aqkc',
          cwd: '/user/workspace',
        });
        signal.throwIfAborted();
        calls.push(['native', id]);
      },
    },
  };
  return {
    input,
    calls,
    controller,
    identity: (value) => {
      identity = value;
    },
  };
}
test('explicit inventory entry copies the question, creates a fresh selected Session, and associates before navigating', async () => {
  const f = fixture();
  await startInventoryConversation(f.input);
  assert.deepEqual(f.calls, [
    ['resource', { id: 'gea-html-inventory-aqkc', cwd: '/user/workspace' }],
    ['workspace', '/user/workspace'],
    ['create', { workspaceId: 'workspace' }],
    ['select', 'new-business', 'gea-html-inventory-aqkc'],
    ['draft', '帮我分析遂平基地的安全库存', undefined],
    [
      'associate',
      'inventory-aqkc',
      'new-business',
      { preset: 'gea-html-inventory-aqkc', cwd: '/user/workspace', subject: 'subject-a' },
    ],
    ['native', 'new-business'],
    ['page', 'inventory-aqkc'],
  ]);
});
test('missing login or page rejects before selecting resources or creating a Session', async () => {
  const f = fixture();
  f.identity({ state: 'confirmed', scope: 'signed-out', status: { authenticated: false } });
  await assert.rejects(startInventoryConversation(f.input), /GEA_LOGIN_REQUIRED/);
  assert.deepEqual(f.calls, []);
  f.input.workbench.getSnapshot = () => ({ pages: [] });
  await assert.rejects(startInventoryConversation(f.input), /PAGE_INTERPRETER_UNAVAILABLE/);
});
test('identity changes during creation retain the created Session but prevent association and navigation', async () => {
  const f = fixture();
  f.input.host.select = async () =>
    f.identity({
      state: 'confirmed',
      scope: 'owner-b',
      subject: 'subject-b',
      status: { authenticated: true },
    });
  await assert.rejects(startInventoryConversation(f.input), /PAGE_IDENTITY_CHANGED/);
  assert.equal(
    f.calls.some((call) => ['native', 'page', 'associate'].includes(call[0])),
    false,
  );
});
test('cancellation and resource disablement never navigate or choose an alternate preset', async () => {
  const f = fixture();
  f.input.host.fetch = async () => {
    f.controller.abort();
    return Response.json({ preset: 'gea-html-inventory-aqkc' });
  };
  await assert.rejects(startInventoryConversation(f.input));
  assert.deepEqual(f.calls, []);
  const g = fixture();
  g.input.host.fetch = async () => Response.json({ error: 'RESOURCE_DISABLED' }, { status: 403 });
  await assert.rejects(startInventoryConversation(g.input), /RESOURCE_DISABLED/);
  assert.deepEqual(g.calls, []);
});
test('a wrong actual preset or occupied destination draft retains errors and blocks page navigation', async () => {
  const f = fixture();
  f.input.host.open = async (id, _skill, _signal, beforeOpen) =>
    beforeOpen?.({ sessionId: id, preset: 'standard' });
  await assert.rejects(startInventoryConversation(f.input), /PAGE_SESSION_PRESET_UNAVAILABLE/);
  assert.equal(
    f.calls.some((call) => ['native', 'page', 'associate'].includes(call[0])),
    false,
  );
  const g = fixture();
  g.input.host.open = async () => {
    throw Error('RESOURCE_DRAFT_CHANGED');
  };
  await assert.rejects(startInventoryConversation(g.input), /RESOURCE_DRAFT_CHANGED/);
  assert.equal(
    g.calls.some((call) => ['native', 'page', 'associate'].includes(call[0])),
    false,
  );
});
