import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { mountReferenceStorage } from './helpers/reference-storage.mjs';

const core = resolve('../../official-latest-standard');
const requireCore = createRequire(resolve(core, 'packages/api/session-controller/package.json'));
const artifact = {
  '@deepseek-ai/dsh-tools': 'packages/core/tools',
  '@deepseek-ai/dsh-system-prompt': 'packages/core/system-prompt',
  '@deepseek-ai/dsh-llm': 'packages/llm/llm',
  '@deepseek-ai/dsh-session-projection': 'packages/session/session-projection',
  '@deepseek-ai/dsh-session-query': 'packages/session-query/session-query',
  '@deepseek-ai/dsh-api-session-controller': 'packages/api/session-controller',
  '@deepseek-ai/dsh-agent-preset-registry': 'packages/preset/agent-preset-registry',
  '@deepseek-ai/dsh-typert-registry': 'packages/typert/registry',
};
const load = (name) =>
  import(
    pathToFileURL(
      artifact[name] ? resolve(core, artifact[name], 'lib/index.js') : requireCore.resolve(name),
    ).href
  );
const { Context } = await load('@deepseek-ai/cordis');
const {
  default: SessionStore,
  SessionId,
  SESSION_FORMAT_VERSION,
} = await load('@deepseek-ai/dsh-session');
const { default: Agents } = await load('@deepseek-ai/dsh-agent');
const { default: Tools } = await load('@deepseek-ai/dsh-tools');
const { default: SystemPrompt } = await load('@deepseek-ai/dsh-system-prompt');
const { default: Llm, LlmAdapter } = await load('@deepseek-ai/dsh-llm');
const { default: Projections } = await load('@deepseek-ai/dsh-session-projection');
const { default: Query } = await load('@deepseek-ai/dsh-session-query');
const { default: Typert } = await load('@deepseek-ai/dsh-typert-registry');
const { default: SessionController } = await load('@deepseek-ai/dsh-api-session-controller');
const { agentPresetProjectionDefinition } = await load('@deepseek-ai/dsh-agent-preset-registry');
const { default: Persistence } = await import(
  pathToFileURL(resolve(core, 'packages/session/session-persistence-jsonl/lib/index.js')).href
);
const { default: Loop } = await import(
  pathToFileURL(resolve(core, 'packages/core/agent-loop/lib/index.js')).href
);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((done) => setImmediate(done));

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'workbench-cold-session-'));
  const cwd = join(root, 'workspace');
  await mkdir(cwd);
  const ctx = new Context(),
    routes = new Map(),
    gate = deferred(),
    started = deferred();
  await mountReferenceStorage(ctx, join(root, 'reference-storage'));
  let mounts = 0,
    authorizations = 0,
    modelRequests = 0;
  const followAbort = new AbortController();
  t.after(async () => {
    gate.resolve();
    followAbort.abort();
    await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  });
  await ctx.plugin(Typert);
  await ctx.plugin(Persistence, { root: join(root, 'sessions'), compression: 'none' });
  await ctx.plugin(Llm);
  await ctx.plugin(SessionStore);
  await ctx.plugin(Projections);
  new Query(ctx);
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(Tools);
  await ctx.plugin(Agents);
  await ctx.plugin(Loop, { agents: [] });
  ctx.llm.registerAdapter(
    ['fixture'],
    new (class extends LlmAdapter {
      async *generate() {
        modelRequests++;
        if (modelRequests < 0) yield undefined;
        throw Error('Unexpected model request');
      }
      async listModels() {
        return [{ id: 'fixture-model' }];
      }
    })(),
  );
  ctx.sessionProjections.register(agentPresetProjectionDefinition);
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'fixture', model: 'fixture-model' }),
    saveSelection: async () => {},
  });
  ctx.provide('fileUploads', {
    registerAgentResolver: () => () => {},
    resolve: () => undefined,
    bindPrompt: () => ({ commit() {}, [Symbol.dispose]() {} }),
    retirePrompt() {},
  });
  ctx.provide('agentPresets', {
    resolve: async (id) => ({ id }),
    mount: async (_scope, id) => {
      assert.equal(id, 'cold-page-preset');
      mounts++;
      started.resolve();
      await gate.promise;
    },
  });
  const controller = new SessionController(ctx, { nativeOpen: false });
  const id = SessionId('session-11111111-1111-4111-8111-111111111111');
  const header = {
    version: SESSION_FORMAT_VERSION,
    id,
    createdAt: 1,
    cwd,
    isSeeded: false,
    agentPreset: 'cold-page-preset',
  };
  const writer = await ctx.sessionPersistence.create(header);
  await writer.append([
    { type: 'agent-preset/selected', seq: 0, time: 1, data: { agentPreset: 'cold-page-preset' } },
  ]);
  await writer.flush();
  await writer.close();
  assert.ok(await ctx.sessionPersistence.stat(id), 'the real persisted cold header exists');
  const observation = await ctx.sessionQuery.observeSession(id);
  assert.equal(observation.header.id, id);
  observation[Symbol.dispose]();
  let heldWriter;
  if (options.writerHeld) heldWriter = await ctx.sessionPersistence.open(id, 'write');
  assert.equal(ctx.agents.get(id), undefined);
  const iterator = controller
    .follow({ address: { kind: 'session', sessionId: id } }, followAbort.signal)
    [Symbol.asyncIterator]();
  const snapshot = await iterator.next();
  assert.equal(snapshot.value.type, 'snapshot');
  const waiting = iterator.next();
  waiting.catch(() => {});
  if (!options.writerHeld) await started.promise;
  assert.equal(
    ctx.agents.get(id),
    undefined,
    'history snapshot is ready while actual preset setup is gated',
  );
  const compiled = join(root, 'page-runtime.mjs');
  await build({
    entryPoints: ['src/html-pages.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: compiled,
    plugins: [
      {
        name: 'official-tools',
        setup(api) {
          api.onResolve({ filter: /^@deepseek-ai\/dsh-tools$/ }, () => ({
            path: pathToFileURL(resolve(core, 'packages/core/tools/lib/index.js')).href,
            external: true,
          }));
        },
      },
    ],
  });
  const { HtmlPages } = await import(pathToFileURL(compiled).href);
  ctx.provide('connection', {
    fetch: {
      register: (route) => {
        routes.set(route.path, route);
        return () => routes.delete(route.path);
      },
    },
  });
  const pages = new HtmlPages(ctx, '', async () => '<picker-fixture>');
  let grantReleases = 0;
  const unregister = pages.registerBusinessPage(
    {
      id: 'inventory-test',
      kind: 'html',
      label: 'Cold page',
      resourceId: 'test-resource',
      catalog: { surface: 'gea-html-inventory-test', tool: 'gea_plugin_page_apply' },
    },
    async (_session, _resource, signal) => {
      signal.throwIfAborted();
      authorizations++;
      return {
        signal: new AbortController().signal,
        access: { mode: 'offline' },
        allowsEffect: () => true,
        release() {
          grantReleases++;
        },
      };
    },
  );
  const open = (signal, sessionId = id) =>
    routes.get('/api/agent-workbench/page').fetch(
      new Request('https://fixture.test/api/agent-workbench/page', {
        method: 'POST',
        signal,
        body: JSON.stringify({
          operation: 'open',
          pageId: 'inventory-test',
          sessionId,
          resourceId: 'test-resource',
        }),
      }),
    );
  const call = async (operation, owner) => {
    const response = await routes.get('/api/agent-workbench/page').fetch(
      new Request('https://fixture.test/api/agent-workbench/page', {
        method: 'POST',
        body: JSON.stringify({ operation, owner }),
      }),
    );
    return { status: response.status, value: await response.json() };
  };
  return {
    ctx,
    controller,
    id,
    cwd,
    gate,
    open,
    call,
    unregister,
    heldWriter,
    followAbort,
    counts: () => ({ mounts, authorizations, modelRequests }),
    releases: () => grantReleases,
  };
}

test('cold existing Session page open waits for real Core preset setup and preserves its identity', async (t) => {
  const f = await fixture(t);
  let settled = false;
  const pending = f.open().then((value) => {
    settled = true;
    return value;
  });
  await tick();
  await tick();
  if (settled) {
    const early = await pending;
    console.log('EARLY_PAGE_OPEN', early.status, await early.json());
  }
  assert.equal(
    settled,
    false,
    'page open waits for the public Core resolver, not only the history snapshot',
  );
  assert.equal(f.counts().authorizations, 0);
  f.gate.resolve();
  const response = await pending;
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const result = await f.controller.resolveAgent(f.id);
  assert.equal(result.agent.id, f.id);
  assert.equal(result.agent.session.header.cwd, f.cwd);
  assert.equal(result.agent.session.header.agentPreset, 'cold-page-preset');
  assert.deepEqual(f.counts(), { mounts: 1, authorizations: 1, modelRequests: 0 });
  assert.equal((await f.ctx.sessionPersistence.list()).length, 1);
});

test('concurrent page openings reuse the actual Core promotion and only the latest opening authorizes', async (t) => {
  const f = await fixture(t);
  const first = f.open();
  await tick();
  const second = f.open();
  await tick();
  assert.equal(f.counts().authorizations, 0);
  assert.equal(f.counts().mounts, 1);
  f.gate.resolve();
  const a = await first,
    b = await second;
  assert.equal(a.status, 400);
  assert.match((await a.json()).error, /aborted/i);
  assert.equal(b.status, 200);
  assert.deepEqual(f.counts(), { mounts: 1, authorizations: 1, modelRequests: 0 });
});

for (const mode of ['cancel', 'withdraw'])
  test(`a ${mode} during actual Core setup cannot authorize or allocate a late page owner`, async (t) => {
    const f = await fixture(t),
      abort = new AbortController();
    const pending = f.open(abort.signal);
    await tick();
    if (mode === 'cancel') abort.abort();
    else f.unregister();
    f.gate.resolve();
    const response = await pending;
    assert.equal(response.status, 400);
    const result = await response.json();
    assert.ok(result.error);
    assert.equal(result.owner, undefined);
    assert.equal(f.counts().authorizations, 0);
    assert.equal(f.counts().modelRequests, 0);
    assert.equal(
      (await f.controller.resolveAgent(f.id)).agent.id,
      f.id,
      'page cancellation leaves the Core-owned promotion intact',
    );
  });

test('actual preset setup failure keeps the public Core error and never authorizes a replacement Session', async (t) => {
  const f = await fixture(t),
    pending = f.open();
  await tick();
  f.gate.reject(Error('PRESET_SETUP_FAILED'));
  const response = await pending;
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /PRESET_SETUP_FAILED/);
  assert.equal(f.counts().authorizations, 0);
  assert.equal(f.counts().modelRequests, 0);
  assert.equal((await f.ctx.sessionPersistence.list()).length, 1);
});

test('Host teardown of the actual resumed Agent releases its page owner', async (t) => {
  const f = await fixture(t),
    pending = f.open();
  f.gate.resolve();
  const response = await pending,
    owner = (await response.json()).owner;
  assert.equal((await f.call('access', owner)).status, 200);
  await f.ctx.fiber.dispose();
  assert.equal(f.releases(), 1);
});

test('missing persisted Session keeps the official error without creating or authorizing a replacement', async (t) => {
  const f = await fixture(t),
    missing = SessionId('session-22222222-2222-4222-8222-222222222222');
  const expected = await f.controller.resolveAgent(missing);
  assert.equal(expected.error.code, 'session/not-found');
  const response = await f.open(undefined, missing);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, expected.error.message);
  assert.equal(f.counts().authorizations, 0);
  assert.equal(f.counts().modelRequests, 0);
  assert.equal((await f.ctx.sessionPersistence.list()).length, 1);
});

test('a real held JSONL writer keeps the official ownership error and does not authorize a page', async (t) => {
  const f = await fixture(t, { writerHeld: true });
  const expected = await f.controller.resolveAgent(f.id);
  assert.equal(expected.error.code, 'session/writer-held');
  const response = await f.open();
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, expected.error.message);
  assert.equal(f.counts().authorizations, 0);
  assert.equal(f.counts().modelRequests, 0);
  assert.equal((await f.ctx.sessionPersistence.list()).length, 1);
  await f.heldWriter.close();
});

test('releasing the real history follow during promotion does not dispose the Core-owned Agent', async (t) => {
  const f = await fixture(t),
    pending = f.open();
  f.followAbort.abort();
  f.gate.resolve();
  assert.equal((await pending).status, 200);
  assert.equal((await f.controller.resolveAgent(f.id)).agent.id, f.id);
  assert.deepEqual(f.counts(), { mounts: 1, authorizations: 1, modelRequests: 0 });
});
