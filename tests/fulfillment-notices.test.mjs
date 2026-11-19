import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { salesConfirmationCard } from '../prototypes/inventory-orderfulfillment/sales-confirmation-card.mjs';

const source = new URL('../prototypes/inventory-orderfulfillment/sales-window/', import.meta.url);
test('card adapter preserves the backend reason instead of inferring stock readiness', () => {
  const value = {
    orderNo: 'A',
    rate: 99,
    priceStatus: 'PARTIAL',
    notice: 'SAP查价提示客户冻结，请联系业务核实',
  };
  assert.match(JSON.stringify(salesConfirmationCard(value)), /SAP查价提示客户冻结/);
  assert.doesNotMatch(JSON.stringify(salesConfirmationCard(value)), /达到90%/);
  assert.match(
    JSON.stringify(salesConfirmationCard({ ...value, notice: undefined })),
    /价格核验未完成/,
  );
  assert.match(
    JSON.stringify(salesConfirmationCard({ orderNo: 'A', rate: 70 })),
    /70.0%.*未达到90%/,
  );
  assert.match(JSON.stringify(salesConfirmationCard({ orderNo: 'A', rate: null })), /满足率未提供/);
  assert.match(
    JSON.stringify(
      salesConfirmationCard({ orderNo: 'A', credit: { status: 'insufficient', shortfall: 0 } }),
    ),
    /缺口金额需核实/,
  );
});
const html = await readFile(new URL('window.html', source), 'utf8');
const editor = await readFile(new URL('order-editor.js', source), 'utf8');
function render(overrides = {}) {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  dom.window.eval(editor);
  dom.window.OrderShortageEditor.mount(dom.window.document, {
    status: 'pending',
    permissions: { canAct: true },
    editor: { editable: true },
    view: 'process',
    snapshot: {
      satisfactionRate: 100,
      lines: [{ sku: 'A', quantity: 30, shortage: 0, orderMultiple: 30, unitPrice: 157 }],
    },
    ...overrides,
  });
  return dom;
}
test('processing, expiry, decisions and read-only access have distinct truthful notices', () => {
  for (const [status, expected] of [
    ['processing', '正在处理'],
    ['expired', '已失效'],
    ['resolved', '已记录处理结果'],
    ['unknown', '状态待核实'],
  ]) {
    const dom = render({ status });
    try {
      assert.match(
        dom.window.document.querySelector('.editor-warning').textContent,
        new RegExp(expected),
      );
      if (status === 'processing')
        assert.doesNotMatch(
          dom.window.document.getElementById('orderEditor').textContent,
          /已处理，仅展示/,
        );
    } finally {
      dom.window.close();
    }
  }
  const dom = render({ permissions: { canAct: false } });
  try {
    assert.match(dom.window.document.getElementById('orderEditor').textContent, /指定人员/);
  } finally {
    dom.window.close();
  }
});
test('deferred decision without a date never invents a delivery deadline', () => {
  const dom = render({ status: 'resolved', decisions: [{ action_id: 'defer_shipment' }] });
  try {
    const text = dom.window.document.getElementById('orderEditor').textContent;
    assert.match(text, /已记录暂缓决定/);
    assert.match(text, /日期请联系业务核实/);
    assert.doesNotMatch(text, /undefined|null/);
  } finally {
    dom.window.close();
  }
});
test('window displays the backend notice verbatim as text instead of inferring a different cause', () => {
  const notice = 'SAP查价提示客户冻结，请联系业务核实\n<img src=x onerror=alert(1)>';
  const dom = render({ notice });
  try {
    const warning = dom.window.document.querySelector('.editor-warning');
    assert.equal(warning.textContent, notice);
    assert.equal(warning.querySelector('img'), null);
  } finally {
    dom.window.close();
  }
});
test('missing rate and out-of-range rate never appear as a known percentage', () => {
  for (const rate of [null, 120]) {
    const dom = render({
      snapshot: {
        satisfactionRate: rate,
        lines: [{ sku: 'A', quantity: 30, shortage: 0, orderMultiple: 30 }],
      },
    });
    try {
      assert.match(
        dom.window.document.querySelector('.editor-rate').textContent,
        rate === null ? /待核实/ : /数据异常/,
      );
      assert.doesNotMatch(dom.window.document.querySelector('.editor-rate').textContent, /—%|120%/);
    } finally {
      dom.window.close();
    }
  }
});
test('credit warning distinguishes a reported shortfall from an unknown amount and unverified replenishment', () => {
  for (const amount of [undefined, 0, 200]) {
    const dom = render({
      snapshot: { credit: { status: 'insufficient', shortfall: amount }, lines: [] },
    });
    try {
      const text = dom.window.document.getElementById('orderEditor').textContent;
      assert.match(
        text,
        amount === 200
          ? /缺口：200 元/
          : amount === undefined
            ? /具体缺口金额未提供/
            : /缺口金额需核实/,
      );
      assert.match(text, /以后台核验为准/);
      assert.doesNotMatch(text, /不足：0 元|不足：— 元/);
    } finally {
      dom.window.close();
    }
  }
});
test('card and window use the same one-decimal satisfaction display without changing the source value', () => {
  const value = {
    satisfactionRate: 99.00990099009903,
    lines: [{ sku: 'A', quantity: 1212, shortage: 12, orderMultiple: 1 }],
  };
  const dom = render({ snapshot: value });
  try {
    assert.match(dom.window.document.querySelector('.editor-rate').textContent, /99.0%/);
    assert.equal(value.satisfactionRate, 99.00990099009903);
  } finally {
    dom.window.close();
  }
});
