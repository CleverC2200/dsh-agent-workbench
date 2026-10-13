import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({
  entryPoints: ['src/workbench.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { WorkbenchController } = await import(
  'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
);
const fc = { id: 'inventory-fc', kind: 'html', src: '/fc', resourceId: 'gea-html-inventory-fc' };
const first = {
  sessionId: 'session-00000000-0000-0000-0000-000000000001',
  preset: 'gea-html-inventory-fc',
  ownerScope: 'account-generation-a',
  cwd: '/workspace/current',
  subject: 'subject-a',
};
const second = {
  sessionId: 'session-00000000-0000-0000-0000-000000000002',
  preset: 'gea-html-inventory-qll',
  ownerScope: 'account-generation-a',
  cwd: '/workspace/current',
  subject: 'subject-a',
};
function memory(initial = { version: 2, selections: [], views: [] }) {
  let value = structuredClone(initial);
  return {
    getSnapshot: () => structuredClone(value),
    set: (next) => {
      value = structuredClone(next);
    },
  };
}
function controller(store) {
  const navigated = [];
  const owner = new WorkbenchController(
    { panel: () => {}, document: (id) => navigated.push(id) },
    store,
  );
  owner.registerFrame(fc);
  return { owner, navigated };
}

test('unregistering the History page revokes a pending restore before the same id is registered again', async (t) => {
  const navigated = [];
  const owner = new WorkbenchController({ panel: () => {}, document: (id) => navigated.push(id) });
  t.after(() => owner.dispose());
  const remove = owner.registerFrame(fc);
  owner.showHistory(fc.id);
  owner.selectHistorySession(fc.id, first.sessionId, first);
  const target = owner.takeHistoryTarget(first.sessionId);
  remove();
  owner.registerFrame({ ...fc, src: '/replacement' });
  assert.equal(target.signal.aborted, true);
  await assert.rejects(owner.completeHistory(target), (error) => error.name === 'AbortError');
  assert.deepEqual(navigated, []);
  assert.equal(owner.getSnapshot().selection, undefined);
});

test('removing another page does not revoke the current History restore', async (t) => {
  const { owner, navigated } = controller();
  t.after(() => owner.dispose());
  const removeOther = owner.registerFrame({ id: 'other-page', kind: 'html', src: '/other' });
  owner.showHistory(fc.id);
  owner.selectHistorySession(fc.id, first.sessionId, first);
  const target = owner.takeHistoryTarget(first.sessionId);
  removeOther();
  assert.equal(target.signal.aborted, false);
  owner.associateSession(fc.id, first);
  assert.equal(await owner.completeHistory(target), true);
  assert.deepEqual(navigated, [first.sessionId]);
});

test('a late History completion cannot navigate a replacement registration and a fresh intent still works', async (t) => {
  const navigated = [];
  const owner = new WorkbenchController({ panel: () => {}, document: (id) => navigated.push(id) });
  t.after(() => owner.dispose());
  const remove = owner.registerFrame(fc);
  owner.showHistory(fc.id);
  owner.selectHistorySession(fc.id, first.sessionId, first);
  const stale = owner.takeHistoryTarget(first.sessionId);
  const ready = Promise.withResolvers();
  const completion = ready.promise.then(() => owner.completeHistory(stale));
  remove();
  owner.registerFrame({ ...fc, src: '/replacement' });
  owner.showHistory(fc.id);
  owner.selectHistorySession(fc.id, second.sessionId, second);
  const current = owner.takeHistoryTarget(second.sessionId);
  owner.associateSession(fc.id, second);
  ready.resolve();
  await assert.rejects(completion, (error) => error.name === 'AbortError');
  assert.deepEqual(navigated, []);
  assert.equal(current.signal.aborted, false);
  assert.equal(await owner.completeHistory(current), true);
  assert.deepEqual(navigated, [second.sessionId]);
});

for (const cancel of ['cancelHistory', 'open', 'dispose'])
  test(`a late History completion cannot navigate after ${cancel}`, async (t) => {
    const { owner, navigated } = controller();
    t.after(() => owner.dispose());
    owner.showHistory(fc.id);
    owner.selectHistorySession(fc.id, first.sessionId, first);
    const target = owner.takeHistoryTarget(first.sessionId);
    const ready = Promise.withResolvers();
    const completion = ready.promise.then(() => owner.completeHistory(target));
    if (cancel === 'open') {
      owner.register({ id: 'another-panel' });
      await owner.open('another-panel');
    } else owner[cancel]();
    ready.resolve();
    await assert.rejects(completion, (error) => error.name === 'AbortError');
    assert.deepEqual(navigated, []);
    assert.equal(owner.getSnapshot().selectedDocument, undefined);
  });

test('a saved Native page without a Session restores its Document without navigating Core', async (t) => {
  const store = memory();
  const page = { id: 'gea-proof', kind: 'native', src: '/native', resourceId: 'gea-readonly' };
  const initial = new WorkbenchController({ panel: () => {}, document: () => {} }, store);
  t.after(() => initial.dispose());
  initial.registerFrame(page);
  await initial.open(page.id);
  const navigated = [];
  const restored = new WorkbenchController(
    { panel: () => {}, document: (id) => navigated.push(id) },
    store,
  );
  t.after(() => restored.dispose());
  restored.registerFrame(page);
  assert.equal(restored.getSnapshot().selectedDocument, page);
  assert.deepEqual(restored.getSnapshot().visitedDocuments, [page]);
  assert.equal(restored.getSnapshot().selection, undefined);
  assert.equal(restored.recoveryTarget(), undefined);
  assert.deepEqual(navigated, [], 'presentation recovery must not open or create a Core Session');
  assert.deepEqual(store.getSnapshot().selections, []);
  assert.equal(restored.getSnapshot().restoredWithoutSession, true);
  assert.equal(Object.hasOwn(store.getSnapshot(), 'restoredWithoutSession'), false);
  await restored.open(page.id);
  assert.equal(restored.getSnapshot().restoredWithoutSession, undefined);
});

test('a saved association without an active interpretation cannot restore an unbound Document', (t) => {
  const store = memory({
    version: 2,
    page: fc.id,
    selections: [{ page: fc.id, ...first, active: false }],
    views: [],
  });
  const { owner, navigated } = controller(store);
  t.after(() => owner.dispose());
  assert.equal(owner.getSnapshot().selectedDocument, undefined);
  assert.deepEqual(owner.getSnapshot().visitedDocuments, []);
  assert.equal(owner.recoveryTarget(), undefined);
  assert.deepEqual(owner.selectionFor(fc.id, first.preset, first.ownerScope), first);
  assert.deepEqual(navigated, []);
});

test('unregistering a restored page clears presentation and UI memory before the same id returns', (t) => {
  const page = { id: 'workbench-html-table', kind: 'html', src: '/sample' };
  const controls = { version: 1, keyword: '采购计划', stage: '' };
  const store = memory({
    version: 2,
    page: page.id,
    selections: [],
    views: [{ page: page.id, scope: 'static', state: controls }],
  });
  const navigated = [];
  const owner = new WorkbenchController(
    { panel: () => {}, document: (id) => navigated.push(id) },
    store,
  );
  t.after(() => owner.dispose());
  const remove = owner.registerFrame(page);
  assert.equal(owner.getSnapshot().selectedDocument, page);
  assert.deepEqual(owner.readHtmlViewState(page.id), controls);
  remove();
  owner.registerFrame({ ...page, src: '/replacement' });
  assert.equal(owner.getSnapshot().selectedDocument, undefined);
  assert.deepEqual(owner.getSnapshot().visitedDocuments, []);
  assert.equal(owner.readHtmlViewState(page.id), undefined);
  assert.deepEqual(store.getSnapshot(), { version: 2, selections: [], views: [] });
  assert.deepEqual(navigated, []);
});

test('an unknown saved page or a non-Document registration cannot create a restored Document', (t) => {
  for (const registeredId of ['another-page', 'unknown-page']) {
    const store = memory({ version: 2, page: 'unknown-page', selections: [], views: [] });
    const navigated = [];
    const owner = new WorkbenchController(
      { panel: () => {}, document: (id) => navigated.push(id) },
      store,
    );
    t.after(() => owner.dispose());
    owner.register({ id: registeredId });
    owner.registerFrame(fc);
    assert.equal(owner.getSnapshot().selectedDocument, undefined);
    assert.deepEqual(owner.getSnapshot().visitedDocuments, []);
    assert.equal(owner.recoveryTarget(), undefined);
    assert.deepEqual(navigated, []);
  }
});

test('a fresh presentation restores the same Core Session hint without opening or creating a Session', async () => {
  const store = memory();
  const { owner } = controller(store);
  owner.associateSession(fc.id, first);
  await owner.open(fc.id);
  const restored = controller(store);
  assert.deepEqual(restored.owner.recoveryTarget(), {
    page: fc.id,
    ...first,
    resourceId: fc.resourceId,
  });
  assert.equal(restored.owner.getSnapshot().selectedDocument, undefined);
  assert.deepEqual(
    restored.navigated,
    [],
    'Core must confirm the hinted Session before navigation',
  );
  assert.deepEqual(Object.keys(store.getSnapshot()).sort(), [
    'page',
    'selections',
    'version',
    'views',
  ]);
});

test('two declared interpretations retain separate Session hints and never cross an identity scope', async () => {
  const store = memory();
  const { owner } = controller(store);
  owner.associateSession(fc.id, first);
  owner.associateSession(fc.id, second);
  await owner.open(fc.id);
  const restored = controller(store).owner;
  assert.deepEqual(restored.selectionFor(fc.id, first.preset, first.ownerScope), first);
  assert.deepEqual(restored.selectionFor(fc.id, second.preset, second.ownerScope), second);
  assert.equal(restored.selectionFor(fc.id, first.preset, 'another-generation'), undefined);
  assert.equal(
    restored.selectionFor(fc.id, first.preset, first.ownerScope, '/another/workspace'),
    undefined,
  );
  assert.deepEqual(restored.recoveryTarget(), {
    page: fc.id,
    ...second,
    resourceId: fc.resourceId,
  });
  restored.forgetSession(fc.id);
  assert.equal(restored.selectionFor(fc.id, first.preset, first.ownerScope), undefined);
  assert.equal(restored.recoveryTarget(), undefined);
});

test('only explicit validated UI intent survives browser reconstruction, never result or authority fields', async () => {
  const store = memory();
  const { owner } = controller(store);
  owner.registerFrame({ id: 'workbench-html-table', kind: 'html', src: '/sample' });
  const controls = { version: 1, keyword: '采购计划', stage: '' };
  owner.saveHtmlViewState('workbench-html-table', undefined, controls);
  assert.throws(
    () =>
      owner.saveHtmlViewState('workbench-html-table', undefined, {
        ...controls,
        results: [{ total: 42 }],
      }),
    /INVALID_HTML_VIEW_STATE/,
  );
  const restored = controller(store).owner;
  restored.registerFrame({ id: 'workbench-html-table', kind: 'html', src: '/sample' });
  assert.deepEqual(restored.readHtmlViewState('workbench-html-table'), controls);
  assert.doesNotMatch(
    JSON.stringify(store.getSnapshot()),
    /authenticated|credential|results|total/,
  );
  await owner.open(fc.id);
  owner.leaveDocument();
  assert.equal(controller(store).owner.recoveryTarget(), undefined);
});

test('obsolete or malformed presentation metadata cannot become a Session association', () => {
  for (const value of [
    { version: 1, page: fc.id, selections: [{ page: fc.id, ...first }], views: [] },
    {
      version: 2,
      page: fc.id,
      selections: [{ page: fc.id, ...first, sessionId: 'not-a-session' }],
      views: [],
    },
  ]) {
    const { owner, navigated } = controller(memory(value));
    assert.equal(owner.recoveryTarget(), undefined);
    assert.equal(owner.getSnapshot().selectedDocument, undefined);
    assert.deepEqual(owner.getSnapshot().visitedDocuments, []);
    assert.equal(owner.selectionFor(fc.id, first.preset, first.ownerScope), undefined);
    assert.deepEqual(navigated, []);
  }
});
