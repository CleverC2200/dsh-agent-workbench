import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { buildFulfillmentSalesWindow } from '../scripts/build-fulfillment-sales-window.mjs';
import {
  confirmationDraft,
  salesConfirmationCard,
} from '../prototypes/inventory-orderfulfillment/sales-confirmation-card.mjs';

const source = new URL('../prototypes/inventory-orderfulfillment/sales-window/', import.meta.url);
const html = await readFile(new URL('window.html', source), 'utf8');
const editor = await readFile(new URL('order-editor.js', source), 'utf8');
const controller = await readFile(new URL('window.js', source), 'utf8');
const fixture = () => ({
  status: 'pending',
  previewOnly: true,
  snapshot: {
    orderNo: 'LOCAL-TEST',
    customer: '样例客户',
    satisfactionRate: 70,
    lines: [
      { sku: 'A', name: '缺货商品', quantity: 10, shortage: 3 },
      { sku: 'B', name: '未知数量商品' },
    ],
  },
});
function component(state = fixture()) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/window/test?mode=details',
  });
  dom.window.eval(editor);
  const view = dom.window.OrderShortageEditor.mount(dom.window.document, {
    ...state,
    editor: { editable: true },
  });
  return { dom, document: dom.window.document, view };
}

test('card preserves pending-confirmation style and supplies only the two approved shortage actions', () => {
  const card = salesConfirmationCard({ orderNo: 'A', rate: 95, lines: [{ rawShortage: 3 }] });
  assert.equal(card.header.template, 'blue');
  assert.equal(card.header.title.content, '订单待处理');
  const layout = card.body.elements[1];
  assert.equal(layout.flex_mode, 'stretch');
  assert.deepEqual(
    layout.columns.map((column) => column.weight),
    [4, 1],
  );
  assert.deepEqual(
    layout.columns[1].elements.map((button) => button.text.content),
    ['暂缓发货', '订单处理'],
  );
  assert.doesNotMatch(JSON.stringify(card), /查看明细|"tag":"img"|"value":/);
  for (const rate of [null, '', true, undefined])
    assert.equal(confirmationDraft({ rate }).rate, null);
});

test('card links are explicit Host inputs, not copied from order data', () => {
  const order = { rate: 70, urls: { edit: 'https://attacker.invalid' }, mentionOpenId: 'ou_fake' };
  assert.ok(
    salesConfirmationCard(order).body.elements[1].columns[1].elements.every(
      (button) => button.disabled,
    ),
  );
  const urls = {
    edit: 'https://fixture.invalid/entry?mode=details',
    defer: 'https://fixture.invalid/entry?mode=defer',
  };
  const card = salesConfirmationCard(order, { urls });
  assert.ok(
    card.body.elements[1].columns[1].elements.every(
      (button) => button.behaviors[0].type === 'open_url',
    ),
  );
  for (const edit of [
    'javascript:alert(1)',
    'http://fixture.invalid',
    'https://user:pass@fixture.invalid',
    '',
    {},
  ])
    assert.throws(() => salesConfirmationCard(order, { urls: { edit } }));
  assert.throws(() =>
    salesConfirmationCard(order, { urls: { ...urls, edit: 'https://other.invalid' } }),
  );
});

test('draft quantities stay local, unknowns remain unknown, and missing interfaces cannot submit', () => {
  const state = fixture(),
    { dom, document, view } = component(state);
  try {
    const unknown = document.querySelector('input[aria-label="B 数量"]');
    assert.equal(unknown.disabled, true);
    assert.equal(unknown.placeholder, '—');
    document.querySelector('button[aria-label="A 增加"]').click();
    assert.equal(view.getDraft()[0].quantity, 11);
    assert.equal(state.snapshot.lines[0].quantity, 10);
    assert.equal(view.getDraft()[1].quantity, null);
    assert.match(document.body.textContent, /库存不足：原订单缺货 3 箱/);
    assert.doesNotMatch(document.body.textContent, /剩余.*3|— 箱/);
    const submit = [...document.querySelectorAll('button')].find((button) =>
      button.textContent.includes('提交订单'),
    );
    assert.equal(submit.disabled, true);
    assert.match(submit.title, /未接入/);
  } finally {
    dom.window.close();
  }
});

test('ended tasks are read-only and ambiguous SKU snapshots are rejected', () => {
  const state = fixture();
  state.status = 'completed';
  const { dom, document } = component(state);
  assert.equal(document.querySelector('button[aria-label="A 增加"]').disabled, true);
  dom.window.close();
  state.snapshot.lines.push({ ...state.snapshot.lines[0] });
  assert.throws(() => component(state), /数据不完整/);
});

test('existing authorized details mode opens shortage draft without requiring a new backend mode', async () => {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/window/test?mode=details',
  });
  try {
    const requests = [];
    dom.window.fetch = async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => fixture() };
    };
    dom.window.eval(editor + '\n' + controller);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(dom.window.document.querySelector('#orderEditor h1').textContent, '订单提交');
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/data\?mode=details/);
    assert.equal(requests[0].options.credentials, 'same-origin');
    assert.equal(dom.window.document.getElementById('submit').hidden, true);
  } finally {
    dom.window.close();
  }
});

test('authorization denial never renders order data', async () => {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/window/test?mode=details',
  });
  try {
    dom.window.fetch = async () => ({
      ok: false,
      json: async () => ({ message: '无权访问此订单' }),
    });
    dom.window.eval(editor + '\n' + controller);
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(dom.window.document.getElementById('notice').textContent, /无权访问/);
    assert.doesNotMatch(dom.window.document.body.textContent, /样例客户/);
  } finally {
    dom.window.close();
  }
});

test('frontend bundle owns its assets and has reproducible hashes without deploying', async () => {
  const output = await mkdtemp(join(tmpdir(), 'fulfillment-window-'));
  try {
    const manifest = await buildFulfillmentSalesWindow({ output });
    assert.equal(manifest.owner, 'dsh-agent-workbench');
    assert.equal(manifest.deployed, false);
    for (const [name, hash] of Object.entries(manifest.assets))
      assert.equal(
        createHash('sha256')
          .update(await readFile(join(output, name)))
          .digest('hex'),
        hash,
      );
    const page = await readFile(join(output, 'window.html'), 'utf8');
    assert.equal((page.match(/<script /g) || []).length, 1);
    const bundle = await readFile(join(output, 'window.js'), 'utf8');
    assert.match(bundle, /OrderShortageEditor/);
    assert.doesNotMatch(bundle, /fulfillment-shortage-edit|gea-module-system/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
