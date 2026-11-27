import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const dir = new URL('../prototypes/inventory-orderfulfillment/sales-window/', import.meta.url);
const html = await readFile(new URL('window.html', dir), 'utf8');
const scripts =
  (await readFile(new URL('order-editor.js', dir), 'utf8')) +
  '\n' +
  (await readFile(new URL('window.js', dir), 'utf8'));
const flush = () => new Promise((r) => setImmediate(r));
async function fixture({
  id = 'first',
  quantity = 84,
  version = 'v1',
  canAct = true,
  unknown = false,
  readAfterSubmitFails = false,
  priorOrderSubmission = false,
} = {}) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: `https://fixture.invalid/window/${id}?view=process`,
  });
  const state = {
    status: 'pending',
    version,
    csrf: 'csrf',
    permissions: { canAct },
    editor: { editable: true, canSubmit: true, omsModificationAvailable: true },
    snapshot: {
      executionOrderNo: 'EXEC1',
      dmsOrderNo: 'DMS1',
      deliveryDate: '2026-11-21',
      satisfactionRate: 99,
      lines: [{ sku: 'SKU1', name: '商品', quantity, orderMultiple: 42, minimumOrderQuantity: 5 }],
    },
  };
  const sent = [],
    reads = [];
  if (priorOrderSubmission)
    state.editor = {
      editable: false,
      canSubmit: false,
      omsModificationAvailable: false,
      submission: { status: 'submitted', label: '已提交' },
      reason: '该执行单已有提交成功记录，请打开OMS最新版本的任务继续修改。',
    };
  dom.window.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      sent.push({ url, body });
      state.status = unknown ? 'processing' : 'resolved';
      state.version = 'resolved-version';
      state.editor = {
        editable: false,
        canSubmit: false,
        modificationState: unknown ? 'unknown' : 'succeeded',
        submittedOrder: { deliveryDate: body.draft.deliveryDate, lines: body.draft.lines },
        reason: unknown ? '修改结果未确认' : '修改已成功',
      };
      state.orderRefresh = {
        status: unknown ? 'blocked' : 'waiting',
        message: unknown ? '上次修改结果未确认' : '正在等待OMS最新订单',
      };
      return {
        ok: true,
        json: async () => ({
          status: unknown ? 'unknown' : 'accepted',
          orderModified: !unknown,
          refreshRequired: !unknown,
        }),
      };
    }
    reads.push(url);
    if (readAfterSubmitFails && sent.length) throw Error('读取最新状态失败');
    return { ok: true, json: async () => structuredClone(state) };
  };
  dom.window.eval(scripts);
  await flush();
  return { dom, state, sent, reads };
}
const button = (f, text) =>
  [...f.dom.window.document.querySelectorAll('#orderEditor button')].find(
    (b) => b.textContent === text,
  );

test('a different old card displays the order-level submitted marker without sending another modification', async () => {
  const f = await fixture({ id: 'another-card', priorOrderSubmission: true });
  try {
    assert.equal(f.state.status, 'pending');
    assert.match(
      f.dom.window.document.querySelector('.editor-submission-status').textContent,
      /已提交/,
    );
    assert.equal(button(f, '提交'), undefined);
    assert.equal(f.sent.length, 0);
  } finally {
    f.dom.window.close();
  }
});
async function submit(f, quantity, date) {
  const q = f.dom.window.document.querySelector('#orderEditor input[type="number"]');
  q.value = String(quantity);
  q.dispatchEvent(new f.dom.window.Event('change'));
  const d = f.dom.window.document.querySelector('#orderEditor input[type="date"]');
  d.value = date;
  d.dispatchEvent(new f.dom.window.Event('change'));
  button(f, '提交').click();
  const confirm = [...f.dom.window.document.querySelectorAll('[role="dialog"] button')].find(
    (b) => b.textContent === '确认',
  );
  confirm.click();
  confirm.click();
  await flush();
  await flush();
}
test('success shows submitted values and refresh is GET-only until a new authorized order is available', async () => {
  const f = await fixture();
  try {
    await submit(f, 126, '2026-11-22');
    assert.equal(f.sent.length, 1);
    assert.match(
      f.dom.window.document.querySelector('.editor-submission-status').textContent,
      /已提交/,
    );
    assert.match(
      f.dom.window.document.querySelector('.editor-refresh-panel').textContent,
      /126 箱.*2026-11-22/,
    );
    assert.equal(button(f, '继续修改数量和交期'), undefined);
    button(f, '刷新最新订单').click();
    await flush();
    assert.equal(f.sent.length, 1);
    f.state.orderRefresh = {
      status: 'ready',
      message: '已收到最新订单',
      entryUrl: 'https://fixture.invalid/entry?reference=new',
      latestOrder: { quantity: 126, deliveryDate: '2026-11-22' },
    };
    button(f, '刷新最新订单').click();
    await flush();
    assert.equal(button(f, '继续修改数量和交期').disabled, false);
    assert.equal(f.sent.length, 1);
    assert.match(
      f.dom.window.document.querySelector('.editor-refresh-panel').textContent,
      /OMS最新订单：126 箱.*2026-11-22/,
    );
    assert.ok(f.reads.every((url) => url.includes('/data?')));
  } finally {
    f.dom.window.close();
  }
});
test('a separate fresh order window starts a new edit with its new version and latest quantity', async () => {
  const first = await fixture(),
    second = await fixture({ id: 'second', quantity: 126, version: 'v2' });
  try {
    await submit(first, 126, '2026-11-22');
    await submit(second, 168, '2026-11-23');
    assert.equal(first.sent.length, 1);
    assert.equal(second.sent.length, 1);
    assert.ok(first.sent[0].url.includes('/window/first/modify'));
    assert.ok(second.sent[0].url.includes('/window/second/modify'));
    assert.equal(first.sent[0].body.expectedVersion, 'v1');
    assert.equal(second.sent[0].body.expectedVersion, 'v2');
    assert.equal(second.sent[0].body.draft.lines[0].quantity, 168);
    assert.equal(second.sent[0].body.draft.deliveryDate, '2026-11-23');
  } finally {
    first.dom.window.close();
    second.dom.window.close();
  }
});
test('unknown results do not expose a second submit and refresh cannot replay a write', async () => {
  const f = await fixture({ unknown: true });
  try {
    await submit(f, 126, '2026-11-22');
    assert.equal(f.sent.length, 1);
    assert.equal(f.dom.window.document.querySelector('.editor-submission-status'), null);
    assert.equal(button(f, '提交'), undefined);
    assert.equal(button(f, '继续修改数量和交期'), undefined);
    button(f, '刷新最新订单').click();
    await flush();
    assert.equal(f.sent.length, 1);
    assert.match(
      f.dom.window.document.querySelector('.editor-refresh-panel').textContent,
      /结果未确认/,
    );
  } finally {
    f.dom.window.close();
  }
});

test('a confirmed submission stays marked and cannot be submitted again when the following GET fails', async () => {
  const f = await fixture({ readAfterSubmitFails: true });
  try {
    await submit(f, 126, '2026-11-22');
    assert.equal(f.sent.length, 1);
    assert.match(
      f.dom.window.document.querySelector('.editor-submission-status').textContent,
      /已提交/,
    );
    assert.match(
      f.dom.window.document.querySelector('.editor-refresh-panel').textContent,
      /已提交成功.*读取失败/,
    );
    assert.equal(button(f, '提交'), undefined);
    button(f, '刷新最新订单').click();
    await flush();
    assert.equal(f.sent.length, 1);
  } finally {
    f.dom.window.close();
  }
});
