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
    assert.equal(owner.selectionFor(fc.id, first.preset, first.ownerScope), undefined);
    assert.deepEqual(navigated, []);
  }
});
