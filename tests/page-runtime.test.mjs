import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { temporaryReferenceStorage } from './helpers/reference-storage.mjs';
import { configuredPageHtml, configuredWire } from './fixtures/configured-page.mjs';
import { personalFixtureHtml } from './fixtures/personal-page-html.mjs';
const core = resolve('../../official-latest-standard'),
  official = (path) => pathToFileURL(resolve(core, path)).href;
const { Context } = await import(official('vendor/cordis/lib/index.js'));
const { default: Tools } = await import(official('packages/core/tools/lib/index.js'));
const { default: SystemPrompt } = await import(
  official('packages/core/system-prompt/lib/index.js')
);
const { default: Agents } = await import(official('packages/core/agent/lib/index.js'));
const { createScope } = await import(official('packages/core/scope/lib/index.js'));
const {
  default: Sessions,
  Session,
  SessionId,
} = await import(official('packages/core/session/lib/index.js'));
const { default: Projections } = await import(
  official('packages/session/session-projection/lib/index.js')
);
const { default: Query } = await import(
  official('packages/session-query/session-query/lib/index.js')
);
const { default: Typert } = await import(official('packages/typert/registry/lib/index.js'));
const { default: SessionController } = await import(
  official('packages/api/session-controller/lib/index.js')
);
await mkdir('.scratch', { recursive: true });
const result = await build({
  entryPoints: ['src/html-pages.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'official-tools',
      setup(builder) {
        builder.onResolve({ filter: /^@deepseek-ai\/dsh-tools$/ }, () => ({
          path: official('packages/core/tools/lib/index.js'),
          external: true,
        }));
      },
    },
  ],
});
await writeFile('.scratch/page-runtime.mjs', result.outputFiles[0].text);
const { HtmlPages } = await import(pathToFileURL(resolve('.scratch/page-runtime.mjs')).href);
async function mount(t, kind = 'html', viewOnly = false, enabled = true) {
  const ctx = new Context(),
    routes = new Map();
  await temporaryReferenceStorage(t, ctx);
  ctx.provide('connection', {
    fetch: {
      register(route) {
        routes.set(route.path, route);
        return () => routes.delete(route.path);
      },
    },
  });
  await ctx.plugin(SystemPrompt, {});
  await ctx.plugin(Typert);
  await ctx.plugin(Sessions);
  await ctx.plugin(Projections);
  new Query(ctx);
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
  new SessionController(ctx, { nativeOpen: false });
  await ctx.plugin(Tools);
  await ctx.plugin(Agents);
  const registerSession = async (id) => {
    const agent = { id, session: Session.create(id) };
    await ctx.plugin(
      Object.assign(
        (inner) => {
          agent.ctx = createScope(inner, agent).ctx;
        },
        { inject: ['tools', 'systemPrompt'] },
      ),
    );
    await ctx.agents.register(agent);
    return agent;
  };
  const id = SessionId('session-11111111-1111-4111-8111-111111111111');
  const agent = await registerSession(id);
  let pages;
  await ctx.plugin(
    Object.assign(
      (inner) => {
        pages = new HtmlPages(inner, '', async () => '<picker-fixture>');
      },
      { inject: ['connection', 'tools', 'agents'] },
    ),
  );
  const identity = new AbortController();
  const observations = [];
  let releases = 0;
  let referenceScope = 'fixture-principal';
  const grant = {
    signal: identity.signal,
    get referenceScope() {
      return referenceScope;
    },
    access: { mode: 'test' },
    observe: (context) => observations.push(context),
    allowsEffect: (effect) => enabled && (effect === 'view' || (!viewOnly && effect === 'draft')),
    release: () => {
      releases++;
    },
    readSql: async () => ({ rows: [[7]] }),
  };
  pages.registerBusinessPage(
    {
      id: kind === 'html' ? 'inventory-test' : 'gea-proof',
      pluginId: 'inventory-test',
      label: 'Test',
      kind,
      resourceId: 'test-resource',
      catalog: {
        surface: kind === 'html' ? 'gea-html-inventory-test' : 'gea-workbench',
        tool: kind === 'html' ? 'gea_plugin_page_apply' : 'gea_workbench_apply',
      },
    },
    async () => grant,
  );
  const call = async (operation, input = {}) => {
    const response = await routes.get('/api/agent-workbench/page').fetch(
      new Request('https://local/api/agent-workbench/page', {
        method: 'POST',
        body: JSON.stringify({ operation, ...input }),
      }),
    );
    return { status: response.status, value: await response.json() };
  };
  t.after(() => ctx.fiber.dispose());
  const open = (input = {}) =>
    call('open', {
      pageId: kind === 'html' ? 'inventory-test' : 'gea-proof',
      sessionId: id,
      resourceId: 'test-resource',
      ...input,
    });
  const execute = (name, args, signal = new AbortController().signal) =>
    ctx.tools.execute({ callId: crypto.randomUUID(), name, arguments: args, agent, signal });
  const reference = async (input) => {
    const binding = await routes.get('/api/page-interaction/binding').fetch();
    const { generation } = await binding.json();
    const response = await routes.get('/api/page-interaction/reference').fetch(
      new Request('https://local/api/page-interaction/reference', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: id,
          page: 'Original page',
          label: 'Chosen',
          text: 'chosen original content',
          targets: [],
          capturedAt: 'fixture',
          generation,
          ...input,
        }),
      }),
    );
    return { status: response.status, value: await response.json() };
  };
  const readReference = async (referenceId, sessionId = id) => {
    const response = await routes.get('/api/page-interaction/reference/read').fetch(
      new Request('https://local/api/page-interaction/reference/read', {
        method: 'POST',
        body: JSON.stringify({ sessionId, id: referenceId }),
      }),
    );
    return { status: response.status, value: await response.json() };
  };
  return {
    call,
    grant,
    open,
    identity,
    observations,
    id,
    releases: () => releases,
    execute,
    reference,
    readReference,
    registerSession,
    generation: async () =>
      (await (await routes.get('/api/page-interaction/binding').fetch()).json()).generation,
    changeReferenceScope: (value) => {
      referenceScope = value;
    },
  };
}
const readDealerMock = await configuredWire('dealer');

async function authorCatalog(t, id) {
  const dom = new JSDOM(
    id === 'personal' ? await personalFixtureHtml() : await configuredPageHtml(id),
    {
      url: 'https://host.example/' + id,
      referrer: 'https://host.example/',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    },
  );
  t.after(() => dom.window.close());
  Object.assign(dom.window, {
    AbortController,
    AbortSignal,
    TextEncoder,
    TextDecoder,
    structuredClone,
  });
  dom.window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
    get() {
      return this.textContent;
    },
  });
  dom.window.fetch = () => {
    throw Error('Unexpected real I/O');
  };
  const messages = [];
  dom.window.parent.postMessage = (message) => messages.push(message);
  const port = {
    start() {},
    close() {},
    async postMessage(message) {
      messages.push(message);
      if (message.type === 'request') {
        const result =
          id === 'dealer' && message.method === 'sql'
            ? await readDealerMock(message.parameters)
            : { accepted: true };
        queueMicrotask(() =>
          port.onmessage?.({ data: { type: 'response', id: message.id, result } }),
        );
      }
    },
  };
  for (const script of dom.window.document.querySelectorAll(
    'script:not([type="application/json"])',
  ))
    dom.window.eval(script.textContent);
  dom.window.dispatchEvent(
    new dom.window.MessageEvent('message', {
      source: dom.window.parent,
      origin: 'https://host.example',
      ports: [port],
      data: {
        protocol: 'gea-html-v2',
        type: 'connect',
        context: { session: 'catalog-fixture', plugin: 'inventory-' + id },
      },
    }),
  );
  if (id === 'personal') {
    for (
      let i = 0;
      i < 100 &&
      !messages.some((m) => m.protocol === 'dsh-workbench-view-v1' && m.type === 'ready');
      i++
    )
      await new Promise((done) => setTimeout(done, 10));
    dom.window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        source: dom.window.parent,
        origin: 'https://host.example',
        data: {
          protocol: 'dsh-workbench-view-v1',
          type: 'restore',
          page: 'inventory-personal',
          version: 1,
          channel: 'catalog-view',
          generation: 1,
          state: { version: 1 },
        },
      }),
    );
  }
  let catalog;
  for (let i = 0; i < 100; i++) {
    catalog = messages.filter((m) => m.type === 'catalog').at(-1);
    if (
      catalog?.elements?.some((e) =>
        id === 'dealer'
          ? e.id === 'filter:customer' && e.editable
          : e.id.startsWith('personal:risk:'),
      )
    )
      break;
    await new Promise((done) => setTimeout(done, 10));
  }
  return { dom, catalog, messages };
}
test('the real dealer author catalog accepts its empty all-customers option through the real page route and registry', async (t) => {
  const { catalog } = await authorCatalog(t, 'dealer');
  const filter = catalog?.elements?.find((e) => e.id === 'filter:customer');
  assert.equal(filter?.value, '');
  assert.equal(filter.editable, true);
  assert.equal(
    filter.options,
    undefined,
    'current customer-code input is free text, not a stale customer list',
  );
  const h = await mount(t),
    {
      value: { owner },
    } = await h.open();
  const send = (elements) =>
    h.call('catalog', {
      owner,
      parameters: { catalog: { elements }, pageSource: 'self-report', toolMessages: [] },
    });
  const accepted = await send(JSON.parse(JSON.stringify(catalog.elements)));
  assert.equal(accepted.status, 200, JSON.stringify(accepted.value));
  const strictInvalid = [
    { ...filter, id: '' },
    { ...filter, label: '' },
    { ...filter, actions: [''] },
    { ...filter, members: [''] },
    { ...filter, value: 42 },
    { ...filter, value: 'x'.repeat(201) },
    { ...filter, options: [42] },
    { ...filter, options: ['x'.repeat(121)] },
    { ...filter, options: Array(25).fill('a') },
  ];
  for (const invalid of strictInvalid) {
    const rejected = await send([invalid]);
    assert.equal(rejected.status, 400);
    assert.equal(rejected.value.error, 'INVALID_PAGE_CATALOG');
  }
  assert.equal(
    (await send(JSON.parse(JSON.stringify(catalog.elements)))).status,
    200,
    'strict invalid declarations do not break the valid current author',
  );
});
test('personal actual risk rows use legal matching catalog and DOM targets while original business keys stay intact', async (t) => {
  const { dom, catalog, messages } = await authorCatalog(t, 'personal');
  const context = messages.filter((m) => m.method === 'context').at(-1).parameters;
  const risk = context.parts.personalWorkbench.risks.find(
    (r) => r.id === '["郑州","AGE","60天以上库存"]',
  );
  assert.ok(risk, 'the original business risk key is preserved');
  const target = 'personal:risk:' + createHash('sha256').update(risk.id).digest('hex');
  assert.ok(catalog.elements.some((e) => e.id === target));
  assert.ok(
    dom.window.document.querySelector(`[data-page-target="${target}"]`),
    'the visible row targets exactly the published element',
  );
  const h = await mount(t),
    {
      value: { owner },
    } = await h.open();
  const response = await h.call('catalog', {
    owner,
    parameters: {
      catalog: { elements: JSON.parse(JSON.stringify(catalog.elements)) },
      pageSource: 'self-report',
      toolMessages: [],
    },
  });
  assert.equal(response.status, 200, JSON.stringify(response.value));
});
test('HTML keeps self-reported actions and AG-UI as two real channels on one exact owner', async (t) => {
  const h = await mount(t);
  const {
    value: { owner },
  } = await h.open();
  assert.equal((await h.call('access', { owner })).value.mode, 'test');
  await h.call('context', { owner, parameters: { rows: [{ id: 'A' }] } });
  assert.match((await h.execute('gea_page', { action: 'context' })).value, /"id":"A"/);
  await h.call('register', { owner, parameters: { name: 'refresh', description: 'Refresh' } });
  const invoked = h.execute('gea_page', { action: 'refresh' });
  await new Promise((r) => setTimeout(r, 10));
  const events = (await h.call('events', { owner })).value;
  assert.equal(events[0].name, 'refresh');
  await h.call('reply', { owner, parameters: { id: events[0].id, result: { refreshed: true } } });
  assert.match((await invoked).value, /refreshed/);
  const catalog = {
    elements: [{ id: 'filters', role: 'control', label: 'Filters', actions: ['reset'] }],
  };
  await h.call('catalog', {
    owner,
    parameters: { catalog, pageSource: 'self-report', toolMessages: [] },
  });
  const action = h.execute('gea_plugin_page_apply', {
    kind: 'invoke',
    target: 'filters',
    action: 'reset',
    reason: 'reset',
  });
  await new Promise((r) => setTimeout(r, 10));
  const queued = (
    await h.call('catalog', {
      owner,
      parameters: { catalog, pageSource: 'self-report', toolMessages: [] },
    })
  ).value.events;
  assert.ok(queued.length > 0);
  const toolCallId = queued[0].toolCallId;
  await h.call('catalog', {
    owner,
    parameters: {
      catalog,
      pageSource: 'self-report',
      toolMessages: [
        {
          id: 'result',
          role: 'tool',
          toolCallId,
          content: JSON.stringify({ toolCallId, applied: true }),
        },
      ],
    },
  });
  assert.match((await action).value, /"applied":true/);
});
test('replacement releases old owner and delayed close cannot revoke the new page', async (t) => {
  const h = await mount(t, 'native');
  const old = (await h.open()).value.owner;
  const current = (await h.open()).value.owner;
  assert.equal(h.releases(), 1);
  await h.call('close', { owner: old });
  assert.equal((await h.call('access', { owner: current })).status, 200);
  h.identity.abort();
  assert.equal((await h.call('access', { owner: current })).value.error, 'PAGE_OWNER_RELEASED');
  assert.equal(h.releases(), 2);
});
test('identity revocation cancels a page action and prevents late replies from reviving its owner', async (t) => {
  const h = await mount(t);
  const owner = (await h.open()).value.owner;
  await h.call('register', { owner, parameters: { name: 'filter', description: 'Filter' } });
  const pending = h.execute('gea_page', { action: 'filter' });
  await new Promise((r) => setTimeout(r, 10));
  const events = (await h.call('events', { owner })).value;
  h.identity.abort();
  assert.equal((await pending).isError, true);
  assert.equal(
    (await h.call('reply', { owner, parameters: { id: events[0].id, result: 'late' } })).status,
    400,
  );
});
test('a legacy text success or mismatched JSON receipt never proves a page action applied', async (t) => {
  const h = await mount(t);
  const owner = (await h.open()).value.owner;
  const catalog = {
    elements: [{ id: 'filters', role: 'control', label: 'Filters', actions: ['reset'] }],
  };
  await h.call('catalog', {
    owner,
    parameters: { catalog, pageSource: 'self-report', toolMessages: [] },
  });
  for (const content of ['success', JSON.stringify({ toolCallId: 'forged', applied: true })]) {
    const pending = h.execute('gea_plugin_page_apply', {
      kind: 'invoke',
      target: 'filters',
      action: 'reset',
      reason: 'reset',
    });
    await new Promise((r) => setTimeout(r, 10));
    const events = (
      await h.call('catalog', {
        owner,
        parameters: { catalog, pageSource: 'self-report', toolMessages: [] },
      })
    ).value.events;
    const toolCallId = events[0].toolCallId;
    await h.call('catalog', {
      owner,
      parameters: {
        catalog,
        pageSource: 'self-report',
        toolMessages: [{ id: 'receipt', role: 'tool', toolCallId, content }],
      },
    });
    assert.equal(JSON.parse((await pending).value).applied, false);
  }
});
test('references are bound to their exact owner and cannot claim a Native surface or another Session', async (t) => {
  const h = await mount(t);
  const owner = (await h.open()).value.owner;
  const wrong = await h.reference({ owner, surface: 'gea-workbench' });
  assert.equal(wrong.status, 400);
  const valid = await h.reference({ owner, surface: 'gea-html-inventory-test' });
  assert.equal(valid.status, 200);
  assert.match(
    (await h.execute('page_reference_read', { id: valid.value.id })).value,
    /chosen original content/,
  );
  await h.call('close', { owner });
  assert.match(
    (await h.execute('page_reference_read', { id: valid.value.id })).value,
    /REFERENCE_UNAVAILABLE/,
  );
  assert.equal((await h.reference({ owner, surface: 'gea-html-inventory-test' })).status, 400);
});

test('closing one Session preserves another page cached binding, while identity revocation rejects both', async (t) => {
  const h = await mount(t);
  const other = SessionId('session-22222222-2222-4222-8222-222222222222');
  await h.registerSession(other);
  const ownerA = (await h.open()).value.owner;
  const ownerB = (await h.open({ sessionId: other })).value.owner;
  const generation = await h.generation();
  const captureB = () =>
    h.reference({
      owner: ownerB,
      sessionId: other,
      surface: 'gea-html-inventory-test',
      generation,
    });
  assert.equal((await captureB()).status, 200);
  await h.call('close', { owner: ownerA });
  const kept = await captureB();
  assert.equal(
    kept.status,
    200,
    'B must keep capturing with its existing client binding after A closes',
  );
  assert.equal((await h.readReference(kept.value.id, other)).status, 200);
  assert.equal(
    (await h.reference({ owner: ownerA, surface: 'gea-html-inventory-test', generation })).status,
    400,
  );
  h.identity.abort();
  assert.equal((await captureB()).status, 400);
  assert.equal((await h.readReference(kept.value.id, other)).status, 403);
});

test('a saved reference survives normal page reopen but requires its current view grant and original principal', async (t) => {
  const h = await mount(t),
    owner = (await h.open()).value.owner;
  const receipt = (await h.reference({ owner, surface: 'gea-html-inventory-test' })).value;
  assert.equal((await h.readReference(receipt.id)).value.text, 'chosen original content');
  assert.equal((await h.readReference(receipt.id, 'session-other')).status, 404);
  await h.call('close', { owner });
  assert.equal((await h.readReference(receipt.id)).status, 403);
  await h.open();
  assert.equal((await h.readReference(receipt.id)).value.text, 'chosen original content');
  h.changeReferenceScope('different-environment-tenant-user');
  assert.equal((await h.readReference(receipt.id)).status, 403);
  h.changeReferenceScope('fixture-principal');
  h.identity.abort();
  assert.equal((await h.readReference(receipt.id)).status, 403);
});

// Migrated from GEA's retired html-sessions tests: exercise the owned fetch/tool interface.
test('invalid context is rejected without replacing the current HTML observation', async (t) => {
  const h = await mount(t);
  const owner = (await h.open()).value.owner;
  await h.call('context', { owner, parameters: { warehouse: 'A' } });
  const invalid = await h.call('context', { owner });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.value.error, 'INVALID_PAGE_CONTEXT');
  assert.equal(
    JSON.parse((await h.execute('gea_page', { action: 'context' })).value).context.warehouse,
    'A',
  );
});

test('Native observations reach their business grant without acquiring an HTML action channel', async (t) => {
  const h = await mount(t, 'native');
  const owner = (await h.open()).value.owner;
  assert.equal((await h.call('context', { owner, parameters: { warehouse: 'A' } })).status, 200);
  assert.deepEqual(h.observations, [{ warehouse: 'A' }]);
  assert.equal(
    (await h.call('register', { owner, parameters: { name: 'refresh' } })).value.error,
    'ACTION_NOT_ALLOWED',
  );
  assert.equal((await h.call('events', { owner })).value.error, 'HTML_PAGE_REQUIRED');
});

test('active HTML page requests renew its idle lease while an idle page expires', async (t) => {
  const h = await mount(t);
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  t.after(() => {
    Date.now = originalNow;
  });
  const owner = (await h.open()).value.owner;
  now += 299000;
  assert.equal((await h.call('events', { owner })).status, 200);
  now += 299000;
  assert.equal((await h.call('events', { owner })).status, 200);
  now += 300001;
  assert.equal((await h.call('events', { owner })).value.error, 'PAGE_LEASE_EXPIRED');
});

test('a missing page is reported and a different resource or Session cannot acquire its owner', async (t) => {
  const h = await mount(t);
  assert.match((await h.execute('gea_page', { action: 'context' })).value, /不在业务工作台/);
  assert.equal(
    JSON.parse((await h.execute('gea_page', { action: 'context' })).value).code,
    'PAGE_NOT_IN_WORKBENCH',
  );
  assert.equal(
    (await h.open({ resourceId: 'unrelated-plugin' })).value.error,
    'PAGE_RESOURCE_NOT_ALLOWED',
  );
  assert.match(
    (await h.open({ sessionId: 'session-22222222-2222-4222-8222-222222222222' })).value.error,
    /session .* not found/,
  );
  const owner = (await h.open()).value.owner;
  assert.equal((await h.call('access', { owner })).status, 200);
  await h.call('close', { owner });
  assert.equal((await h.call('access', { owner })).value.error, 'PAGE_OWNER_RELEASED');
  assert.equal(
    JSON.parse((await h.execute('gea_page', { action: 'context' })).value).code,
    'PAGE_NOT_IN_WORKBENCH',
  );
});

test('correlated HTML replies resolve only the matching action and cancellation removes queued work', async (t) => {
  const h = await mount(t);
  const owner = (await h.open()).value.owner;
  await h.call('register', { owner, parameters: { name: 'filter', description: 'Filter' } });
  const pending = h.execute('gea_page', {
    action: 'filter',
    parameters: JSON.stringify({ warehouseId: 'A' }),
  });
  await new Promise((resolve) => setImmediate(resolve));
  const [event] = (await h.call('events', { owner })).value;
  assert.deepEqual(event.arguments, { warehouseId: 'A' });
  let settled = false;
  pending.then(() => {
    settled = true;
  });
  await h.call('reply', { owner, parameters: { id: 'unrelated', result: { status: 'wrong' } } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  await h.call('reply', { owner, parameters: { id: event.id, result: { status: 'filtered' } } });
  assert.deepEqual(JSON.parse((await pending).value), { status: 'filtered' });
  const abort = new AbortController();
  const cancelled = h.execute('gea_page', { action: 'filter' }, abort.signal);
  await new Promise((resolve) => setImmediate(resolve));
  abort.abort();
  assert.equal((await cancelled).isError, true);
  assert.deepEqual((await h.call('events', { owner })).value, []);
});

test('an HTML action timeout clears undelivered work', async (t) => {
  const h = await mount(t);
  const owner = (await h.open()).value.owner;
  await h.call('register', { owner, parameters: { name: 'refresh', description: 'Refresh' } });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = h.execute('gea_page', { action: 'refresh' });
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(55000);
  assert.match(JSON.stringify(await pending), /PAGE_ACTION_TIMEOUT/);
  assert.deepEqual((await h.call('events', { owner })).value, []);
});

test('the original regional view-only grant allows its visible module filter through the official page tool', async (t) => {
  const h = await mount(t, 'html', true);
  const {
    value: { owner },
  } = await h.open();
  const catalog = {
    elements: [
      {
        id: 'filter:module',
        role: 'field',
        label: '工作台模块',
        value: 'overview',
        options: ['overview', 'follow', 'category', 'review', 'analysis'],
        editable: true,
        effect: 'view',
      },
    ],
  };
  await h.call('catalog', {
    owner,
    parameters: { catalog, pageSource: 'self-report', toolMessages: [] },
  });
  const action = h.execute('gea_plugin_page_apply', {
    kind: 'setValue',
    target: 'filter:module',
    value: 'follow',
    reason: '查看模拟提报跟催',
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const events = (
    await h.call('catalog', {
      owner,
      parameters: { catalog, pageSource: 'self-report', toolMessages: [] },
    })
  ).value.events;
  if (events.length) {
    const toolCallId = events[0].toolCallId;
    await h.call('catalog', {
      owner,
      parameters: {
        catalog,
        pageSource: 'self-report',
        toolMessages: [
          {
            id: 'regional-view-receipt',
            role: 'tool',
            toolCallId,
            content: JSON.stringify({ toolCallId, applied: true }),
          },
        ],
      },
    });
  }
  assert.match((await action).value, /"applied":true/);
  const protectedCatalog = {
    elements: [
      { id: 'field:draft', role: 'field', label: '普通草稿', editable: true },
      { id: 'field:readonly', role: 'field', label: '只读', effect: 'view' },
      {
        id: 'action:submit',
        role: 'control',
        label: '提交',
        actions: ['invoke'],
        effect: 'submit',
      },
      {
        id: 'action:approve',
        role: 'control',
        label: '审批',
        actions: ['invoke'],
        effect: 'approve',
      },
    ],
  };
  await h.call('catalog', {
    owner,
    parameters: { catalog: protectedCatalog, pageSource: 'self-report', toolMessages: [] },
  });
  for (const [args, error] of [
    [{ kind: 'setValue', target: 'field:draft', value: 'draft' }, 'DATA_ACTION_NOT_ALLOWED'],
    [{ kind: 'setValue', target: 'field:readonly', value: 'readonly' }, 'ELEMENT_NOT_EDITABLE'],
    [
      { kind: 'invoke', target: 'action:submit', action: 'invoke', confirm: true },
      'EFFECT_NOT_ALLOWED',
    ],
    [
      { kind: 'invoke', target: 'action:approve', action: 'invoke', confirm: true },
      'EFFECT_NOT_ALLOWED',
    ],
  ])
    assert.equal(JSON.parse((await h.execute('gea_plugin_page_apply', args)).value).error, error);
  const queued = (
    await h.call('catalog', {
      owner,
      parameters: { catalog: protectedCatalog, pageSource: 'self-report', toolMessages: [] },
    })
  ).value.events;
  assert.deepEqual(queued, []);
});

test('explicit view filters keep the existing public cancellation, rate limit and owner release protections', async (t) => {
  const h = await mount(t, 'html', true),
    owner = (await h.open()).value.owner;
  const catalog = {
    elements: [
      { id: 'filter:module', role: 'field', label: '工作台模块', editable: true, effect: 'view' },
    ],
  };
  await h.call('catalog', {
    owner,
    parameters: { catalog, pageSource: 'self-report', toolMessages: [] },
  });
  for (let index = 0; index < 30; index++) {
    const abort = new AbortController();
    const pending = h.execute(
      'gea_plugin_page_apply',
      { kind: 'setValue', target: 'filter:module', value: 'follow' },
      abort.signal,
    );
    await new Promise((resolve) => setTimeout(resolve, 1));
    abort.abort();
    assert.equal((await pending).isError, true);
  }
  const limited = JSON.parse(
    (
      await h.execute('gea_plugin_page_apply', {
        kind: 'setValue',
        target: 'filter:module',
        value: 'follow',
      })
    ).value,
  );
  assert.equal(limited.error, 'DRAFT_RATE_LIMITED');
  const events = (
    await h.call('catalog', {
      owner,
      parameters: { catalog, pageSource: 'self-report', toolMessages: [] },
    })
  ).value.events;
  assert.deepEqual(events, []);
  await h.call('close', { owner });
  const unavailable = await h.execute('gea_plugin_page_apply', {
    kind: 'setValue',
    target: 'filter:module',
    value: 'follow',
  });
  assert.equal(unavailable.isError, true);
  assert.equal(
    (
      await h.call('catalog', {
        owner,
        parameters: { catalog, pageSource: 'self-report', toolMessages: [] },
      })
    ).status,
    400,
  );
});

test('disabled capability keeps its static owner but rejects page actions and reference capture', async (t) => {
  const h = await mount(t, 'html', true, false);
  const opened = await h.open();
  assert.equal(opened.status, 200);
  const owner = opened.value.owner;
  assert.match(
    JSON.stringify(await h.execute('gea_page', { action: 'context' })),
    /EFFECT_NOT_ALLOWED/,
  );
  assert.match(
    JSON.stringify(await h.execute('gea_page', { action: 'refresh' })),
    /EFFECT_NOT_ALLOWED/,
  );
  const receipt = await h.reference({ owner, surface: 'gea-html-inventory-test' });
  assert.equal(receipt.status, 400);
  assert.match(receipt.value.error, /PAGE_REFERENCE_ACCESS_DENIED/);
});

test('page insight requires an owned view grant and rejects released owners', async (t) => {
  const f = await mount(t);
  const { value: opened } = await f.open();
  const input = { owner: opened.owner, parameters: { evidence: { current: 100 } } };
  assert.notEqual((await f.call('insight', input)).status, 200);
  f.grant.insight = async (data, signal) => {
    signal.throwIfAborted();
    return { answer: String(data.evidence.current) };
  };
  assert.deepEqual((await f.call('insight', input)).value, { answer: '100' });
  await f.call('close', { owner: opened.owner });
  assert.notEqual((await f.call('insight', input)).status, 200);
});
