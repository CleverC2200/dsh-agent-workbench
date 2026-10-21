import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const html = await readFile(
  new URL('../prototypes/inventory-orderfulfillment/presentation.html', import.meta.url),
  'utf8',
);

test('governed binding preserves the authored layout, filters, metric cards and table columns', async () => {
  const original = new JSDOM(html);
  const built = new JSDOM(
    await readFile(
      new URL('../lib/business/inventory-orderfulfillment/index.html', import.meta.url),
      'utf8',
    ),
  );
  try {
    const source = original.window.document,
      target = built.window.document;
    const signature = (document) =>
      [...document.querySelector('#fulfillmentView').children].map((node) => [
        node.tagName,
        node.className,
        node.id,
      ]);
    assert.deepEqual(signature(target), signature(source));
    assert.deepEqual(
      [...target.querySelectorAll('thead')].map((head) => head.textContent),
      [...source.querySelectorAll('thead')].map((head) => head.textContent),
    );
    assert.deepEqual(
      [
        ...target.querySelectorAll(
          '.fulfillment-toolbar select,.delivery-order-searches input,.delivery-order-searches select',
        ),
      ].map((node) => node.id),
      [
        ...source.querySelectorAll(
          '.fulfillment-toolbar select,.delivery-order-searches input,.delivery-order-searches select',
        ),
      ].map((node) => node.id),
    );
    assert.equal(
      target.querySelectorAll('.metric').length,
      source.querySelectorAll('.metric').length,
    );
    assert.equal(
      target.querySelectorAll('.metric-unit').length,
      source.querySelectorAll('.metric-unit').length,
    );
    assert.equal(target.querySelector('.live-filters'), null);
    const entry = await readFile(
      new URL('../prototypes/inventory-orderfulfillment/live-entry.js', import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(entry, /root\.replaceChildren|createElement\(['"]form/);
  } finally {
    original.window.close();
    built.window.close();
  }
});

test('packaged fulfillment Agent exposes the complete ordered Skill set and prompt provenance', async () => {
  const root = new URL('../lib/business/inventory-orderfulfillment/', import.meta.url);
  const load = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
  const manifest = await load('plugin.json');
  const profile = await load('prompt.json');
  assert.equal(profile.skills.length, 8);
  for (const [index, name] of profile.skills.entries()) {
    const skill = await readFile(new URL(manifest.skills[index], root), 'utf8');
    assert.ok(skill.includes(`name: ${name}`));
  }
  const source = await load('SOURCE.json');
  for (const file of source.files) await readFile(new URL(file.path, root));
  assert.deepEqual((await load('mcp.json')).capabilities, ['governed-sql-read']);
  assert.equal((await load('capability.json')).data.consumerCode, 'order01');
  assert.equal(manifest.gea.consumerCode, 'order01');
  assert.equal(manifest.sqlConfig, 'sql.config.json');
});

test('fulfillment questions use the existing public Core draft insertion contract', async () => {
  const entry = await readFile(
    new URL('../prototypes/inventory-orderfulfillment/live-entry.js', import.meta.url),
    'utf8',
  );
  assert.match(entry, /import \{ quotePage \} from '\.\.\/\.\.\/src\/page-interaction\/quote\.ts'/);
  assert.match(entry, /await quotePage\(/);
  assert.match(entry, /gea-identity-changed/);
  assert.doesNotMatch(entry, /call\('conversation'|localStorage|appendMessage/);
});

test('fulfillment sample keeps all three views without importing Workbench or external execution', () => {
  const { window } = new JSDOM(html);
  try {
    const doc = window.document;
    for (const id of [
      'deliveryDimensionPanel',
      'warehouseDimensionPanel',
      'itemDimensionPanel',
      'deliveryOrderDetailRows',
      'salesConfirmOverlay',
      'confirmationHistoryOverlay',
    ]) {
      assert.ok(doc.getElementById(id), id);
    }
    assert.equal(doc.getElementById('workbenchView'), null);
    assert.equal(doc.querySelector('script[src]'), null);
    assert.equal(doc.querySelector('[data-page="workbench"]'), null);
    assert.equal(doc.getElementById('assistant'), null);
    assert.equal(doc.getElementById('messages'), null);
    assert.equal(doc.getElementById('questionInput'), null);
    assert.ok(doc.querySelectorAll('[data-fulfillment-question]').length > 0);
    assert.equal(doc.querySelectorAll('.orders tr[data-order-row]').length, 17);
    const scripts = [...doc.scripts].map((script) => script.textContent).join('\n');
    assert.doesNotMatch(scripts, /localStorage|fetch\(|reportAnswerFor|renderWorkbench/);
    assert.doesNotMatch(scripts, /function (showPage|answerFor|appendMessage|send)\(/);
  } finally {
    window.close();
  }
});
