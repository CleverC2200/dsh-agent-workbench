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

test('ready and shortage cards share grey metadata and notes while preserving order hyperlinks', () => {
  for (const rate of [70, 100]) {
    const card = salesConfirmationCard(
      { orderNo: 'MOCK-COLOR', customer: '样例客户', rate, quantity: '30 箱' },
      {
        preview: true,
        entryUrl: 'https://fixture.invalid/entry?reference=opaque',
      },
    );
    const fields = card.body.elements[1].columns[0].elements;
    assert.equal(fields.length, 4);
    for (const field of fields) {
      assert.equal(field.tag, 'markdown');
      assert.match(field.content, /^<font color='grey'>.*<\/font>$/);
    }
    assert.match(fields[0].content, /\[MOCK-COLOR\]\(https:\/\/applink\.feishu\.cn\//);
    assert.match(card.body.elements.at(-1).content, /^<font color='grey'>本地样例预览/);
  }
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

test('catalog category and search filters preserve the draft when returning to the order', () => {
  const state = fixture();
  state.snapshot.lines[0].category = '水饺';
  state.snapshot.lines[0].subCategory = '猪肉水饺';
  state.snapshot.lines[1] = {
    ...state.snapshot.lines[1],
    quantity: 5,
    category: '云吞',
    subCategory: '鲜肉云吞',
  };
  const { dom, document, view } = component(state);
  const click = (text) =>
    [...document.querySelectorAll('button')].find((button) => button.textContent === text).click();
  try {
    document.querySelector('button[aria-label="A 增加"]').click();
    click('+ 商品');
    click('云吞');
    click('鲜肉云吞');
    assert.equal(document.querySelector('[data-sku="A"]'), null);
    assert.ok(document.querySelector('[data-sku="B"]'));
    const search = document.querySelector('input[aria-label="商品搜索"]');
    search.value = '不存在';
    search.dispatchEvent(new dom.window.Event('input'));
    assert.match(document.querySelector('.editor-products').textContent, /没有匹配/);
    search.value = '';
    search.dispatchEvent(new dom.window.Event('input'));
    click('全部');
    assert.equal(document.querySelector('input[aria-label="A 数量"]').value, '11');
    click('完成选品');
    assert.equal(view.getPage(), 'order');
    assert.equal(view.getDraft()[0].quantity, 11);
    assert.equal(state.snapshot.lines[0].quantity, 10);
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

test('slow loading shows a neutral shell and reveals only the requested page after data arrives', async () => {
  for (const view of ['details', 'edit']) {
    const dom = new JSDOM(html, {
      runScripts: 'outside-only',
      url: 'https://fixture.invalid/window/test?view=' + view,
    });
    try {
      let deliver;
      dom.window.fetch = () =>
        new Promise((resolve) => {
          deliver = resolve;
        });
      dom.window.eval(editor + '\n' + controller);
      const document = dom.window.document;
      assert.equal(document.title, '正在加载订单');
      assert.equal(document.getElementById('windowLoading').hidden, false);
      assert.equal(document.getElementById('confirmationMain').hidden, true);
      assert.equal(document.getElementById('orderEditor').hidden, true);
      deliver({ ok: true, json: async () => fixture() });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(document.getElementById('windowLoading').hidden, true);
      assert.equal(document.title, view === 'details' ? '订单明细' : '订单提交');
      assert.equal(document.getElementById('confirmationMain').hidden, view === 'edit');
      assert.equal(document.getElementById('orderEditor').hidden, view !== 'edit');
    } finally {
      dom.window.close();
    }
  }
});

test('shortage order number opens read-only details instead of the editor', async () => {
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
    assert.equal(dom.window.document.getElementById('title').textContent, '订单明细');
    assert.equal(dom.window.document.getElementById('orderEditor').hidden, true);
    assert.equal(dom.window.document.querySelectorAll('input[type="number"]').length, 0);
    assert.match(dom.window.document.getElementById('items').textContent, /缺货商品/);
    const process = dom.window.document.getElementById('process');
    assert.equal(process.hidden, false);
    assert.equal(new URL(process.href).searchParams.get('view'), 'edit');
    assert.equal(new URL(process.href).pathname, '/window/test');
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/data\?includeRelated=false/);
    assert.doesNotMatch(requests[0].url, /mode=|view=/);
    assert.equal(requests[0].options.credentials, 'same-origin');
    assert.equal(dom.window.document.getElementById('submit').hidden, true);
  } finally {
    dom.window.close();
  }
});

test('Workbench view selection opens the editor without sending the view to the data endpoint', async () => {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/window/test?view=edit&mode=details',
  });
  try {
    const requests = [];
    dom.window.fetch = async (url) => {
      requests.push(url);
      return { ok: true, json: async () => fixture() };
    };
    dom.window.eval(editor + '\n' + controller);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(dom.window.document.querySelector('#orderEditor h1').textContent, '订单提交');
    assert.equal(dom.window.document.getElementById('orderEditor').hidden, false);
    assert.equal(dom.window.document.getElementById('confirmationMain').hidden, true);
    assert.doesNotMatch(requests[0], /mode=|view=/);
  } finally {
    dom.window.close();
  }
});

test('generic trusted entry lets the Workbench template choose each view', () => {
  const card = salesConfirmationCard(
    { orderNo: 'A', rate: 70 },
    {
      entryUrl: 'https://fixture.invalid/entry?reference=opaque',
    },
  );
  const layout = card.body.elements[1];
  const details = layout.columns[0].elements[0].content;
  assert.match(details, /view%3Ddetails/);
  const urls = layout.columns[1].elements.map(
    (button) => new URL(new URL(button.behaviors[0].default_url).searchParams.get('url')),
  );
  assert.deepEqual(
    urls.map((url) => url.searchParams.get('view')),
    ['defer', 'edit'],
  );
  assert.ok(
    urls.every(
      (url) =>
        url.origin === 'https://fixture.invalid' && url.searchParams.get('reference') === 'opaque',
    ),
  );
  for (const entryUrl of [
    'javascript:alert(1)',
    'https://user:pass@fixture.invalid',
    'https://fixture.invalid/#edit',
  ])
    assert.throws(() => salesConfirmationCard({ rate: 70 }, { entryUrl }));
});

test('unknown views default to read-only details and view parameters cannot grant processing', async () => {
  for (const [view, canAct] of [
    ['future-page', true],
    ['edit', false],
  ]) {
    const dom = new JSDOM(html, {
      runScripts: 'outside-only',
      url: 'https://fixture.invalid/window/test?view=' + view,
    });
    try {
      dom.window.fetch = async () => ({
        ok: true,
        json: async () => ({ ...fixture(), permissions: { canAct } }),
      });
      dom.window.eval(editor + '\n' + controller);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(dom.window.document.getElementById('title').textContent, '订单明细');
      assert.equal(dom.window.document.getElementById('orderEditor').hidden, true);
      assert.equal(dom.window.document.getElementById('submit').hidden, true);
      if (!canAct) assert.equal(dom.window.document.getElementById('process').hidden, true);
    } finally {
      dom.window.close();
    }
  }
});

test('order list asks for authorized related data and keeps its page links in Workbench', async () => {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/window/test?view=list',
  });
  try {
    const requests = [];
    dom.window.fetch = async (url) => {
      requests.push(url);
      return {
        ok: true,
        json: async () => ({
          ...fixture(),
          related: {
            items: [
              {
                snapshot: fixture().snapshot,
                status: 'pending',
                entryUrl: 'https://fixture.invalid/entry?reference=opaque',
              },
            ],
            total: 1,
          },
        }),
      };
    };
    dom.window.eval(editor + '\n' + controller);
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(requests[0], /includeRelated=true/);
    const links = [...dom.window.document.querySelectorAll('#items a')];
    assert.equal(
      new URL(links.find((link) => link.textContent === 'LOCAL-TEST').href).searchParams.get(
        'view',
      ),
      'details',
    );
    assert.equal(
      new URL(links.find((link) => link.textContent === '订单处理').href).searchParams.get('view'),
      'edit',
    );
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
    assert.equal(dom.window.document.title, '订单加载失败');
    assert.equal(dom.window.document.getElementById('windowLoading').hidden, true);
    assert.equal(dom.window.document.getElementById('confirmationMain').hidden, false);
    assert.equal(dom.window.document.getElementById('submit').hidden, true);
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
    assert.equal(manifest.presentationApiVersion, 2);
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

test('shared recipients see read-only details and return without submitting or editing', async () => {
  for (const mode of ['confirm', 'defer', 'details']) {
    const dom = new JSDOM(html, {
      runScripts: 'outside-only',
      url: 'https://fixture.invalid/window/test?mode=' + mode,
    });
    try {
      const requests = [];
      const state = fixture();
      state.previewOnly = false;
      state.permissions = { canAct: false };
      dom.window.fetch = async (url) => {
        requests.push(url);
        return { ok: true, json: async () => state };
      };
      dom.window.eval(editor + '\n' + controller);
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(dom.window.document.getElementById('title').textContent, '订单明细');
      assert.equal(dom.window.document.getElementById('submit').hidden, true);
      assert.equal(dom.window.document.getElementById('orderEditor').hidden, true);
      assert.equal(dom.window.document.getElementById('cancel').textContent, '返回');
      assert.match(dom.window.document.getElementById('notice').textContent, /指定销售/);
      dom.window.document.getElementById('submit').click();
      assert.equal(requests.length, 1);
    } finally {
      dom.window.close();
    }
  }
});
