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
  permissions: { canAct: true },
  snapshot: {
    orderNo: 'LOCAL-TEST',
    customer: '样例客户',
    satisfactionRate: 95,
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
  assert.equal(card.header.title.content, '订单待确认');
  const layout = card.body.elements[1];
  assert.equal(layout.flex_mode, 'stretch');
  assert.deepEqual(
    layout.columns.map((column) => column.weight),
    [4, 1],
  );
  assert.deepEqual(
    layout.columns[1].elements.map((button) => button.text.content),
    ['订单处理', '暂缓发货'],
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
    assert.equal(fields.length, 6);
    for (const field of fields) {
      assert.equal(field.tag, 'markdown');
      assert.match(field.content, /^<font color='grey'>.*<\/font>$/);
    }
    assert.match(fields[1].content, /\[MOCK-COLOR\]\(https:\/\/applink\.feishu\.cn\//);
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
    const submit = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === '提交',
    );
    submit.click();
    const confirm = [...document.querySelectorAll('[role="dialog"] button')].find(
      (button) => button.textContent === '确认',
    );
    assert.equal(confirm.disabled, true);
    assert.match(document.querySelector('[role="dialog"]').textContent, /未完整提供|未接入|草稿/);
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
      assert.equal(document.getElementById('confirmationMain').hidden, true);
      assert.equal(document.getElementById('orderEditor').hidden, false);
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
    assert.equal(dom.window.document.title, '订单明细');
    assert.equal(dom.window.document.getElementById('orderEditor').dataset.page, 'details');
    assert.equal(dom.window.document.querySelectorAll('input[type="number"]').length, 0);
    assert.match(dom.window.document.getElementById('orderEditor').textContent, /缺货商品/);
    const process = [...dom.window.document.querySelectorAll('#orderEditor button')].find(
      (button) => button.textContent === '订单处理',
    );
    process.click();
    assert.equal(dom.window.document.getElementById('orderEditor').dataset.page, 'order');
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
  const details = layout.columns[0].elements[1].content;
  assert.match(details, /view%3Ddetails/);
  const urls = layout.columns[1].elements.map(
    (button) => new URL(new URL(button.behaviors[0].default_url).searchParams.get('url')),
  );
  assert.deepEqual(
    urls.map((url) => url.searchParams.get('view')),
    ['process', 'defer'],
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
      assert.equal(dom.window.document.title, '订单明细');
      assert.equal(dom.window.document.getElementById('orderEditor').dataset.page, 'details');
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
      'process',
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
      assert.equal(dom.window.document.title, '订单明细');
      assert.equal(dom.window.document.getElementById('submit').hidden, true);
      assert.equal(dom.window.document.getElementById('orderEditor').dataset.page, 'details');
      assert.equal(dom.window.document.getElementById('cancel').textContent, '返回');
      assert.match(dom.window.document.getElementById('orderEditor').textContent, /指定销售/);
      dom.window.document.getElementById('submit').click();
      assert.equal(requests.length, 1);
    } finally {
      dom.window.close();
    }
  }
});

test('unified processing prioritizes credit and routes the exact 90 percent boundary despite partial shortage', () => {
  for (const [rate, credit, expected] of [
    [90, undefined, 'order'],
    [95, undefined, 'order'],
    [89.9, undefined, 'catalog'],
    [null, undefined, 'catalog'],
    [100, { status: 'insufficient', shortfall: 200 }, 'credit'],
  ]) {
    const state = fixture();
    state.snapshot.satisfactionRate = rate;
    state.snapshot.credit = credit;
    const { dom, view, document } = component(state);
    try {
      assert.equal(view.getPage(), expected);
      if (expected === 'credit') {
        assert.match(document.getElementById('orderEditor').textContent, /确认额度已补充/);
        assert.equal(document.querySelector('.editor-credit-panel .editor-primary').disabled, true);
        assert.equal(state.snapshot.credit.status, 'insufficient');
      }
      const card = salesConfirmationCard(
        { rate, credit, lines: [{ rawShortage: 5 }] },
        { entryUrl: 'https://fixture.invalid/entry?reference=opaque' },
      );
      assert.equal(card.header.title.content, '订单待确认');
      assert.doesNotMatch(JSON.stringify(card), /确认发货|订单待处理/);
      const action = card.body.elements[1].columns[1].elements[0];
      assert.equal(action.text.content, credit ? '额度已补充' : '订单处理');
      assert.equal(
        new URL(new URL(action.behaviors[0].default_url).searchParams.get('url')).searchParams.get(
          'view',
        ),
        'process',
      );
    } finally {
      dom.window.close();
    }
  }
});

test('execution and DMS identifiers remain distinct and absent source fields are never fabricated', () => {
  const state = fixture();
  Object.assign(state.snapshot, {
    executionOrderNo: 'EXEC-001',
    dmsOrderNo: 'DMS-009',
    deliveryDate: '2026-11-10',
  });
  state.view = 'details';
  const { dom, document } = component(state);
  try {
    const text = document.querySelector('.editor-basic-info').textContent;
    assert.match(text, /执行单号EXEC-001/);
    assert.match(text, /DMS订单号DMS-009/);
    assert.match(text, /订单交货日期2026-11-10/);
    assert.equal(document.querySelectorAll('#orderEditor input[type="number"]').length, 0);
    assert.match(
      document.querySelector('.editor-order-rules').textContent,
      /起订量：—.*订货倍数：—/,
    );
    assert.deepEqual(
      { ...dom.window.OrderShortageEditor.identifiers({ orderNo: 'LEGACY-DMS' }) },
      { execution: '—', dms: 'LEGACY-DMS' },
    );
  } finally {
    dom.window.close();
  }
});

test('minimum quantity and ordering multiple govern draft input, increments and removal without changing the snapshot', () => {
  const state = fixture();
  state.snapshot.lines = [
    {
      sku: 'MOQ',
      name: '规则商品',
      quantity: 100,
      shortage: 5,
      minimumOrderQuantity: 100,
      orderMultiple: 10,
      unitPrice: 16.5,
    },
  ];
  const { dom, document, view } = component(state);
  const input = document.querySelector('input[aria-label="MOQ 数量"]');
  try {
    input.value = '95';
    input.dispatchEvent(new dom.window.Event('change'));
    assert.equal(view.getDraft()[0].quantity, 100);
    assert.match(input.validationMessage, /起订量/);
    input.value = '105';
    input.dispatchEvent(new dom.window.Event('change'));
    assert.equal(view.getDraft()[0].quantity, 100);
    assert.match(input.validationMessage, /整数倍/);
    document.querySelector('[aria-label="MOQ 增加"]').click();
    assert.equal(view.getDraft()[0].quantity, 110);
    document.querySelector('[aria-label="MOQ 减少"]').click();
    document.querySelector('[aria-label="MOQ 减少"]').click();
    assert.equal(view.getDraft()[0].quantity, 0);
    document.querySelector('[aria-label="MOQ 增加"]').click();
    assert.equal(view.getDraft()[0].quantity, 100);
    assert.equal(state.snapshot.lines[0].quantity, 100);
  } finally {
    dom.window.close();
  }
});

test('recommendations stay empty without trusted data and only Use merges supplied recommendations into the draft', () => {
  const state = fixture();
  state.snapshot.lines = [state.snapshot.lines[0]];
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/window/test',
  });
  dom.window.eval(editor);
  const document = dom.window.document;
  const click = (label) =>
    [...document.querySelectorAll('#orderEditor button')]
      .find((button) => button.textContent === label)
      .click();
  try {
    dom.window.OrderShortageEditor.mount(document, { ...state, editor: { editable: true } });
    click('+ 商品');
    click('推荐');
    assert.match(document.querySelector('[aria-label="推荐商品"]').textContent, /暂无推荐商品/);
    const view = dom.window.OrderShortageEditor.mount(document, {
      ...state,
      editor: {
        editable: true,
        recommendationsAvailable: true,
        recommendations: [
          { sku: 'REC-001', name: '后台推荐样例', minimumOrderQuantity: 20, orderMultiple: 10 },
        ],
      },
    });
    click('+ 商品');
    click('推荐');
    document.querySelector('[aria-label="REC-001 增加"]').click();
    assert.equal(view.getDraft().length, 1);
    click('返回');
    assert.equal(view.getDraft().length, 1);
    click('推荐');
    click('使用');
    assert.equal(view.getPage(), 'order');
    assert.equal(view.getDraft().find((line) => line.sku === 'REC-001').quantity, 20);
    assert.equal(state.snapshot.lines.length, 1);
  } finally {
    dom.window.close();
  }
});

test('unchanged qualified order submits only the existing sales decision after a second confirmation', async () => {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/window/test?view=process',
  });
  const state = fixture();
  state.previewOnly = false;
  state.version = 'v-test';
  state.csrf = 'csrf-test';
  state.permissions = { canAct: true };
  state.snapshot.lines = [state.snapshot.lines[0]];
  const actions = [];
  dom.window.fetch = async (url, options = {}) => {
    if (url.endsWith('/action')) {
      actions.push({ body: JSON.parse(options.body), headers: options.headers });
      state.status = 'resolved';
      return { ok: true, json: async () => ({ status: 'accepted' }) };
    }
    return { ok: true, json: async () => structuredClone(state) };
  };
  try {
    dom.window.eval(editor + '\n' + controller);
    await new Promise((resolve) => setImmediate(resolve));
    [...dom.window.document.querySelectorAll('#orderEditor button')]
      .find((button) => button.textContent === '提交')
      .click();
    assert.equal(actions.length, 0);
    const confirm = [...dom.window.document.querySelectorAll('[role="dialog"] button')].find(
      (button) => button.textContent === '确认',
    );
    assert.equal(confirm.disabled, false);
    confirm.click();
    confirm.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(actions.length, 1);
    assert.equal(actions[0].body.actionId, 'confirm_shipment');
    assert.equal(actions[0].body.expectedVersion, 'v-test');
    assert.equal(actions[0].headers['X-CSRF-Token'], 'csrf-test');
    assert.ok(actions[0].body.nonce);
    assert.equal(dom.window.document.getElementById('orderEditor').dataset.page, 'details');
  } finally {
    dom.window.close();
  }
});

test('deferral date stays within the existing one-to-seven-day decision contract', async () => {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/window/test?view=defer',
  });
  const state = fixture();
  state.previewOnly = false;
  state.csrf = 'csrf';
  state.version = 'v';
  state.permissions = { canAct: true };
  const actions = [];
  dom.window.fetch = async (url, options = {}) => {
    if (url.endsWith('/action')) {
      actions.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ status: 'accepted' }) };
    }
    return { ok: true, json: async () => structuredClone(state) };
  };
  try {
    dom.window.eval(editor + '\n' + controller);
    await new Promise((resolve) => setImmediate(resolve));
    const date = dom.window.document.getElementById('days'),
      submit = dom.window.document.getElementById('submit');
    assert.equal(date.type, 'date');
    assert.equal(submit.disabled, true);
    date.value = date.min;
    date.dispatchEvent(new dom.window.Event('change'));
    assert.equal(submit.disabled, false);
    submit.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(actions.length, 1);
    assert.equal(actions[0].actionId, 'defer_shipment');
    assert.equal(actions[0].input.deferDays, 1);
  } finally {
    dom.window.close();
  }
});
