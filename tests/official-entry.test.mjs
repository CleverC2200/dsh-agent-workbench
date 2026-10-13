import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['src/workbench.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { WorkbenchController } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
);

test('opening an existing static page selects its official panel without login, model or Session creation', async () => {
  let selected;
  const workbench = new WorkbenchController({
    panel: (id) => {
      selected = id;
    },
    create: () => {
      throw Error('Static presentation must not create a Session');
    },
    beginNavigation: () => new AbortController().signal,
  });
  workbench.register({ id: 'existing-html', label: 'Existing HTML' });
  assert.equal(await workbench.open('existing-html'), true);
  assert.equal(selected, 'existing-html');
});

test('removed pages cannot be reopened and a disposed workbench does not navigate', async () => {
  const selected = [];
  const workbench = new WorkbenchController({ panel: (id) => selected.push(id) });
  const remove = workbench.register({ id: 'native-page', label: 'Native page' });
  assert.equal(await workbench.open('native-page'), true);
  remove();
  await assert.rejects(workbench.open('native-page'), /Unknown workbench page/);
  workbench.dispose();
  assert.equal(await workbench.open('native-page'), false);
  assert.deepEqual(selected, ['native-page']);
});

test('a static Document occupies the real main Conversation and returning to it reopens only its associated native Session', async () => {
  const visible = [];
  const workbench = new WorkbenchController({
    panel: (id) => visible.push(['panel', id]),
    document: (id) => visible.push(['document', id]),
  });
  const remove = workbench.registerFrame({
    id: 'static-document',
    kind: 'html',
    src: '/static.html',
  });
  await workbench.open('static-document');
  assert.equal(workbench.getSnapshot().selectedDocument.id, 'static-document');
  assert.deepEqual(
    visible,
    [['document', undefined]],
    'static presentation selects the real Conversation without inventing a Session',
  );
  workbench.associateSession('static-document', {
    sessionId: 'actual-native-session',
    preset: 'original',
    ownerScope: 'principal-a',
  });
  workbench.leaveDocument();
  await workbench.open('static-document');
  assert.equal(workbench.getSnapshot().selection.sessionId, 'actual-native-session');
  assert.deepEqual(visible.at(-1), ['document', 'actual-native-session']);
  remove();
  assert.equal(workbench.getSnapshot().selectedDocument, undefined);
  await assert.rejects(workbench.open('static-document'), /Unknown workbench page/);
});
