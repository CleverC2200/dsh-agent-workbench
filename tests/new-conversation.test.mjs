import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/company/new-conversation.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['@deepseek-ai/dsh-client-store'],
});
const module = { exports: {} };
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(
  module,
  module.exports,
  createRequire(import.meta.url),
);
const { createConversationStarter } = module.exports;

function fixture() {
  const calls = [],
    disposers = [];
  let navigation = new AbortController();
  const sessions = {
    phase: 'ready',
    byId: {
      old: {
        id: 'old',
        blank: true,
        updatedAt: 1,
        retainedBy: { mainView: 1 },
        projectionValues: { agentPreset: 'removed-user-preset' },
        draft: 'user draft',
      },
      history: {
        id: 'history',
        blank: false,
        updatedAt: 2,
        retainedBy: {},
        projectionValues: { agentPreset: 'user-preset' },
        messages: ['user message'],
      },
      recent: { id: 'recent', updatedAt: 100, retainedBy: {} },
    },
  };
  const workspaces = {
    phase: 'ready',
    items: [
      { workspaceId: 'current', sessionIds: ['old', 'history'], createdAt: '2026-01-01' },
      { workspaceId: 'recent', sessionIds: ['recent'], createdAt: '2026-01-02' },
    ],
  };
  const ctx = {
    sessions: {
      list: { getSnapshot: () => sessions },
      create: async (input) => {
        calls.push(['create', input]);
        return 'fresh';
      },
    },
    workspaces: {
      list: { getSnapshot: () => workspaces },
      initializeDefault: async () => {
        calls.push(['initialize']);
        return { workspaceId: 'default' };
      },
    },
    layout: {
      beginNavigation() {
        navigation.abort();
        navigation = new AbortController();
        return navigation.signal;
      },
    },
    uiWorkspace: { openSession: (id) => calls.push(['open', id]) },
    effect(fn) {
      disposers.push(fn());
    },
  };
  const original = structuredClone({ sessions, workspaces });
  const starter = createConversationStarter(ctx, () => calls.push(['leaveDocument']));
  return {
    ctx,
    calls,
    sessions,
    workspaces,
    original,
    starter,
    dispose: () => disposers.forEach((dispose) => dispose()),
  };
}

test('fresh creation inherits the current workspace and preserves user presets, history and drafts', async () => {
  const f = fixture();
  await f.starter.start();
  assert.deepEqual(f.calls, [
    ['create', { workspaceId: 'current' }],
    ['leaveDocument'],
    ['open', 'fresh'],
  ]);
  assert.deepEqual({ sessions: f.sessions, workspaces: f.workspaces }, f.original);
  assert.deepEqual(f.starter.state.getSnapshot(), { kind: 'idle' });
});

test('repeated clicks across controls admit one creation while the original result is pending', async () => {
  const f = fixture(),
    result = Promise.withResolvers();
  f.ctx.sessions.create = async (input) => {
    f.calls.push(['create', input]);
    return result.promise;
  };
  const first = f.starter.start();
  await f.starter.start();
  assert.deepEqual(f.calls, [['create', { workspaceId: 'current' }]]);
  result.resolve('fresh');
  await first;
  assert.deepEqual(f.calls.slice(1), [['leaveDocument'], ['open', 'fresh']]);
});

for (const outcome of ['success', 'failure']) {
  test(`later navigation suppresses a late creation ${outcome} without discarding its Session`, async () => {
    const f = fixture(),
      result = Promise.withResolvers();
    f.ctx.sessions.create = () => result.promise;
    const pending = f.starter.start();
    f.ctx.layout.beginNavigation();
    if (outcome === 'success') result.resolve('fresh');
    else result.reject(Error('late failure'));
    await pending;
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.starter.state.getSnapshot(), { kind: 'idle' });
    assert.deepEqual({ sessions: f.sessions, workspaces: f.workspaces }, f.original);
  });
}

test('plugin disposal prevents late navigation and further creation', async () => {
  const f = fixture(),
    result = Promise.withResolvers();
  let creates = 0;
  f.ctx.sessions.create = () => {
    creates++;
    return result.promise;
  };
  const pending = f.starter.start();
  f.dispose();
  result.resolve('fresh');
  await pending;
  await f.starter.start();
  assert.equal(creates, 1);
  assert.deepEqual(f.calls, []);
});

test('an unavailable current default reports the failure without retrying or replacing user data', async () => {
  const f = fixture();
  let attempts = 0;
  f.ctx.sessions.create = async () => {
    attempts++;
    throw Error('Unknown agent preset: user-default');
  };
  await f.starter.start();
  assert.equal(attempts, 1);
  assert.deepEqual(f.starter.state.getSnapshot(), {
    kind: 'failed',
    message: 'Unknown agent preset: user-default',
  });
  assert.deepEqual(f.calls, []);
  assert.deepEqual({ sessions: f.sessions, workspaces: f.workspaces }, f.original);
});

test('without a main Session, creation uses the most recently active workspace from Core', async () => {
  const f = fixture();
  f.sessions.byId.old.retainedBy = {};
  await f.starter.start();
  assert.deepEqual(f.calls[0], ['create', { workspaceId: 'recent' }]);
});

test('first use initializes the workspace through Core and then creates a fresh Session', async () => {
  const f = fixture();
  f.sessions.byId = {};
  f.workspaces.items = [];
  await f.starter.start();
  assert.deepEqual(f.calls, [
    ['initialize'],
    ['create', { workspaceId: 'default' }],
    ['leaveDocument'],
    ['open', 'fresh'],
  ]);
});

test('a late first-use workspace cannot start creation after another navigation', async () => {
  const f = fixture(),
    result = Promise.withResolvers();
  f.sessions.byId = {};
  f.workspaces.items = [];
  f.ctx.workspaces.initializeDefault = () => result.promise;
  const pending = f.starter.start();
  f.ctx.layout.beginNavigation();
  result.resolve({ workspaceId: 'default' });
  await pending;
  assert.deepEqual(f.calls, []);
});

test('unready Core catalogs do not create in a different workspace', async () => {
  const f = fixture();
  f.workspaces.phase = 'loading';
  await f.starter.start();
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.starter.state.getSnapshot(), {
    kind: 'failed',
    message: 'WORKBENCH_WORKSPACE_UNAVAILABLE',
  });
});
