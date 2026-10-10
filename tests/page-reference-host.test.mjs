import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/page-interaction/host.ts';
import { temporaryReferenceStorage } from './helpers/reference-storage.mjs';

const input = {
  sessionId: 'session-test',
  page: '页面',
  label: '行',
  surface: 'fixture',
  text: '数量：1',
  targets: [],
  capturedAt: 'fixture',
};
async function host(t, authorize, authorizeRead = () => {}) {
  const { facility } = await temporaryReferenceStorage(t);
  const routes = new Map();
  const disposals = [];
  const scope = {
    storageDomain: facility,
    effect(fn) {
      const dispose = fn();
      if (dispose) disposals.push(dispose);
    },
    connection: {
      fetch: {
        register(options) {
          routes.set(options.path, options.fetch);
          return () => {};
        },
      },
    },
    tools: { register: () => () => {} },
    systemPrompt: { section: () => () => {} },
  };
  const clear = apply(
    { ...scope, on: () => () => {}, inject: (_services, install) => install(scope) },
    {
      authorize: (value) => {
        authorize(value);
        return 'fixture-principal';
      },
      authorizeRead,
    },
  );
  return {
    clear,
    request: (request) => routes.get('/api/page-interaction/reference')(request),
    read: (value) =>
      routes.get('/api/page-interaction/reference/read')({ json: async () => value }),
    payload: async () => ({
      ...input,
      ...(await (await routes.get('/api/page-interaction/binding')()).json()),
    }),
    dispose: async () => {
      for (const dispose of disposals.reverse()) await dispose();
    },
  };
}

test('clearing references invalidates a POST already parsing, while a new authorized POST can succeed', async (t) => {
  const subject = await host(t, () => {});
  const saved = await subject.payload();
  const body = Promise.withResolvers();
  const pending = subject.request({ json: () => body.promise });
  subject.clear();
  body.resolve(saved);
  assert.equal((await pending).status, 400);
  assert.equal(
    (await subject.request({ json: async () => saved })).status,
    400,
    'a POST arriving only after clear cannot reuse the old generation',
  );
  const freshPayload = await subject.payload();
  const fresh = await subject.request({ json: async () => freshPayload });
  assert.equal(fresh.status, 200);
  assert.match((await fresh.json()).id, /^R[a-f0-9]{12}$/);
  await subject.dispose();
});

test('authorization runs on the parsed POST and teardown prevents a late commit', async (t) => {
  let authorized = false;
  const subject = await host(t, (value) => {
    assert.equal(value.sessionId, input.sessionId);
    if (!authorized) throw Error('DENIED');
  });
  const saved = await subject.payload();
  assert.equal((await subject.request({ json: async () => saved })).status, 400);
  authorized = true;
  const body = Promise.withResolvers();
  const pending = subject.request({ json: () => body.promise });
  await subject.dispose();
  body.resolve(saved);
  assert.equal((await pending).status, 400);
});

test('one authorized POST freezes the capture; a cleared identity rejects later writes', async (t) => {
  let authorized = true;
  const subject = await host(t, () => {
    if (!authorized) throw Error('LEASE_EXPIRED');
  });
  const payload = await subject.payload();
  const receipt = await (await subject.request({ json: async () => payload })).json();
  assert.match(receipt.id, /^R[a-f0-9]{12}$/);
  authorized = false;
  assert.equal((await subject.request({ json: async () => payload })).status, 400);
  authorized = true;
  const body = Promise.withResolvers();
  const pending = subject.request({ json: () => body.promise });
  subject.clear();
  body.resolve(payload);
  assert.equal(
    (await pending).status,
    400,
    'identity clear during body parsing invalidates the save',
  );
  const current = await subject.payload();
  assert.equal(
    (await subject.request({ json: async () => payload })).status,
    400,
    'a stale generation cannot write after clear',
  );
  assert.equal((await subject.request({ json: async () => current })).status, 200);
  await subject.dispose();
});

test('public reference reads share the current owner and identity gate without exposing the principal', async (t) => {
  let allowed = true;
  const subject = await host(
    t,
    () => {},
    (snapshot) => {
      assert.equal(snapshot.principal, 'fixture-principal');
      if (!allowed) throw Error('PAGE_REFERENCE_ACCESS_DENIED');
    },
  );
  const receipt = await (
    await subject.request({ json: async () => await subject.payload() })
  ).json();
  const value = { sessionId: input.sessionId, id: receipt.id };
  const response = await subject.read(value);
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.text, '数量：1');
  assert.equal('principal' in snapshot, false);
  assert.equal((await subject.read({ ...value, sessionId: 'session-other' })).status, 404);
  allowed = false;
  assert.equal((await subject.read(value)).status, 403);
  await subject.dispose();
});
