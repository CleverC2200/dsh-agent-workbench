import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const source = new URL('../prototypes/inventory-orderfulfillment/sales-window/', import.meta.url);
const html = await readFile(new URL('window.html', source), 'utf8'),
  editor = await readFile(new URL('order-editor.js', source), 'utf8');
const tick = () => new Promise((resolve) => setTimeout(resolve, 350));
function setup({
  badPrice = false,
  canAct = true,
  missingRules = true,
  invalidRules = false,
  initialPrice = null,
  previewError = null,
} = {}) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'https://fixture.invalid/window/test?view=process',
  });
  const calls = [],
    previews = [];
  const state = {
    status: 'pending',
    permissions: { canAct },
    notice: 'SAP未返回该商品的价格，请联系业务核实。',
    editor: {
      editable: true,
      canSubmit: true,
      omsModificationAvailable: true,
      catalogAvailable: true,
      inventoryRecalculationAvailable: true,
      priceRecalculationAvailable: true,
      packagingValidationAvailable: true,
      vehicleRulesAvailable: true,
      vehicleOptions: [
        { value: '8.6米', label: '8.6米' },
        { value: '6.8米', label: '6.8米' },
      ],
    },
    snapshot: {
      executionOrderNo: 'E1',
      vehicleType: '8.6米',
      deliveryDate: '2026-11-25',
      priceStatus: initialPrice === null ? 'PRICE_MISSING' : 'READY',
      satisfactionRate: 100,
      lines: [
        {
          sku: 'BAD',
          name: '原商品',
          quantity: 40,
          unitPrice: initialPrice,
          priceStatus: initialPrice === null ? 'PRICE_MISSING' : 'READY',
          shortage: 0,
          ...(missingRules ? {} : { orderMultiple: 40, minimumOrderQuantity: 10 }),
          ...(invalidRules ? { orderMultiple: 'invalid' } : {}),
        },
      ],
    },
    onLookupProducts: async () => [
      {
        sku: 'NEW',
        name: '替代商品',
        quantity: 0,
        minimumOrderQuantity: 10,
        orderMultiple: 40,
        unit: 'CS',
        unitsPerCase: 1,
        packagingStatus: 'READY',
        priceStatus: 'READY',
        unitPrice: 128,
        shortage: 0,
      },
    ],
    onInventoryRecalculate: async (draft) => {
      previews.push(structuredClone(draft));
      if (previewError) throw Error(previewError);
      return {
        satisfactionRate: 100,
        inventoryHash: 'a'.repeat(64),
        pricesReady: !badPrice,
        priceMessage: badPrice ? 'SAP查价超时，请稍后重试。' : '',
        lines: draft.lines.map((line) => ({
          ...line,
          availableQuantity: 1000,
          shortage: 0,
          priceStatus: badPrice ? 'SAP_PRICE_TIMEOUT' : 'READY',
          unitPrice: badPrice ? null : 128,
          priceMessage: badPrice ? 'SAP查价超时，请稍后重试。' : '',
        })),
      };
    },
    onConfirm: async (draft) => {
      calls.push(structuredClone(draft));
    },
  };
  dom.window.eval(editor);
  dom.window.OrderShortageEditor.mount(dom.window.document, state);
  const document = dom.window.document;
  const button = (label) =>
    [...document.querySelectorAll('#orderEditor button')].find((b) => b.textContent === label);
  return { dom, document, state, calls, previews, button };
}
async function replace(f) {
  f.document.querySelector('.editor-remove').click();
  [...f.document.querySelectorAll('[aria-label="确认删除商品"] button')]
    .find((button) => button.textContent === '确认删除')
    .click();
  f.button('+ 商品').click();
  await new Promise((resolve) => setImmediate(resolve));
  f.document.querySelector('[aria-label="NEW 增加"]').click();
  f.button('完成选品').click();
  await tick();
}

test('trash sits outside quantity controls and deletion changes the draft only after explicit confirmation', async () => {
  const f = setup();
  try {
    const trash = f.document.querySelector('.editor-remove');
    assert.equal(trash.parentElement.tagName, 'ARTICLE');
    assert.equal(trash.closest('.editor-product-trading'), null);
    assert.equal(f.dom.window.getComputedStyle(trash).position, 'absolute');
    assert.ok(trash.querySelector('svg'));
    trash.click();
    assert.equal(f.document.querySelector('[aria-label="BAD 数量"]').value, '40');
    let dialog = f.document.querySelector('[aria-label="确认删除商品"]');
    assert.match(dialog.textContent, /原商品.*SKU：BAD/);
    [...dialog.querySelectorAll('button')].find((button) => button.textContent === '取消').click();
    assert.equal(f.document.querySelector('[aria-label="BAD 数量"]').value, '40');
    f.document.querySelector('.editor-remove').click();
    dialog = f.document.querySelector('[aria-label="确认删除商品"]');
    const confirm = dialog.querySelector('button');
    confirm.click();
    confirm.click();
    assert.equal(f.document.querySelector('article[data-sku="BAD"]'), null);
    assert.equal(f.document.querySelector('[aria-label="确认删除商品"]'), null);
    assert.equal(f.calls.length, 0);
    assert.equal(f.state.snapshot.lines[0].quantity, 40);
  } finally {
    f.dom.window.close();
  }
});
test('missing price shows a dash and a short red label, while deletion and date editing remain available', () => {
  const f = setup();
  try {
    const row = f.document.querySelector('article[data-sku="BAD"]');
    assert.equal(row.querySelector('.editor-price strong').textContent, '¥ —');
    const hint = row.querySelector('.editor-price-warning');
    assert.equal(hint.textContent, '暂无价格');
    assert.equal(f.dom.window.getComputedStyle(hint).color, 'rgb(237, 34, 50)');
    assert.equal(f.document.querySelector('[aria-label="BAD 数量"]').disabled, false);
    assert.equal(
      f.document.querySelector('#orderEditor [aria-label="预计交货日期"]').disabled,
      false,
    );
    assert.ok(f.document.querySelector('.editor-remove'));
    assert.ok(!row.querySelector('.editor-price').textContent.includes('价格异常'));
  } finally {
    f.dom.window.close();
  }
});
test('price labels stay on one line without expandable details or business actions', () => {
  const f = setup();
  try {
    const row = f.document.querySelector('article[data-sku="BAD"]');
    const hint = row.querySelector('.editor-price-warning');
    const style = f.dom.window.getComputedStyle(hint);
    assert.equal(style.whiteSpace, 'nowrap');
    assert.equal(style.textOverflow, 'ellipsis');
    assert.equal(f.dom.window.getComputedStyle(row.querySelector('.editor-price')).minWidth, '0');
    assert.equal(hint.textContent, '暂无价格');
    assert.equal(hint.tagName, 'SMALL');
    assert.equal(hint.title, '');
    hint.click();
    assert.equal(row.querySelector('[data-editor-price-detail]'), null);
    assert.equal(hint.hasAttribute('aria-expanded'), false);
    assert.equal(f.calls.length, 0);
  } finally {
    f.dom.window.close();
  }
});
test('deleting the incomplete unpriced original and adding a priced product revalidates the final list and permits one submission', async () => {
  const f = setup();
  try {
    await replace(f);
    assert.ok(f.previews.length > 0);
    assert.deepEqual(f.previews.at(-1).lines, [{ sku: 'NEW', quantity: 40 }]);
    assert.ok(!f.document.querySelector('article[data-sku="BAD"]'));
    assert.equal(f.document.querySelector('[data-editor-price="NEW"]').textContent, '¥ 128');
    f.button('提交').click();
    const confirm = f.document.querySelector('[data-editor-confirm]');
    assert.equal(confirm.disabled, false);
    confirm.click();
    confirm.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.calls[0].lines, [{ sku: 'NEW', quantity: 40 }]);
    assert.equal(f.calls[0].inventoryHash, 'a'.repeat(64));
    assert.equal(f.state.snapshot.lines[0].sku, 'BAD');
  } finally {
    f.dom.window.close();
  }
});

for (const invalidation of ['date-change', 'stock-recheck'])
  test(`inventory invalidation during the confirmation render (${invalidation}) never reads a cleared hash or sends a stale modification`, async () => {
    const f = setup();
    try {
      await replace(f);
      f.button('提交').click();
      const root = f.document.getElementById('orderEditor');
      const replaceChildren = root.replaceChildren;
      root.replaceChildren = function (...children) {
        root.replaceChildren = replaceChildren;
        if (invalidation === 'date-change') {
          const date = root.querySelector('[aria-label="预计交货日期"]');
          date.value = '2026-11-27';
          date.dispatchEvent(new f.dom.window.Event('change'));
        } else root.querySelector('[data-editor-inventory-retry]').click();
        return replaceChildren.apply(this, children);
      };
      f.document.querySelector('[data-editor-confirm]').click();
      await tick();
      assert.equal(f.calls.length, 0);
      assert.doesNotMatch(root.textContent, /Cannot read|inventoryHash|undefined/);
      assert.match(root.textContent, /重新核算|核验已变化/);
      f.button('提交').click();
      f.document.querySelector('[data-editor-confirm]').click();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(f.calls.length, 1);
      assert.equal(
        f.calls[0].deliveryDate,
        invalidation === 'date-change' ? '2026-11-27' : f.state.snapshot.deliveryDate,
      );
      assert.equal(f.calls[0].inventoryHash, 'a'.repeat(64));
    } finally {
      f.dom.window.close();
    }
  });
test('fresh price failure still blocks submission and updates the displayed cause instead of using the old price', async () => {
  const f = setup({ badPrice: true });
  try {
    await replace(f);
    assert.equal(f.document.querySelector('[data-editor-price="NEW"]').textContent, '¥ —');
    assert.equal(
      f.document.querySelector('[data-editor-price-reason="NEW"]').textContent,
      '暂无价格',
    );
    f.button('提交').click();
    assert.equal(f.document.querySelector('[data-editor-confirm]').disabled, true);
    assert.equal(f.calls.length, 0);
  } finally {
    f.dom.window.close();
  }
});

test('failed combined preview preserves the verified price but blocks submit until a successful retry', async () => {
  const f = setup({ initialPrice: 159, previewError: '库存查询超时，请重新核算' });
  try {
    await tick();
    assert.equal(f.document.querySelector('[data-editor-price="BAD"]').textContent, '¥ 159');
    assert.equal(f.document.querySelector('[data-editor-price-reason="BAD"]').textContent, '');
    assert.equal(f.document.querySelector('[data-editor-amount]').textContent, '¥ 6,360');
    assert.match(f.document.getElementById('orderEditor').textContent, /库存查询超时/);
    f.button('提交').click();
    assert.equal(f.document.querySelector('[data-editor-confirm]').disabled, true);
    assert.equal(f.calls.length, 0);
    [...f.document.querySelectorAll('.editor-confirm-dialog button')]
      .find((button) => button.textContent === '返回')
      .click();
    f.state.onInventoryRecalculate = async (draft) => ({
      satisfactionRate: 100,
      inventoryHash: 'b'.repeat(64),
      pricesReady: true,
      lines: draft.lines.map((line) => ({
        ...line,
        availableQuantity: 1000,
        shortage: 0,
        priceStatus: 'READY',
        unitPrice: 160,
      })),
    });
    f.document.querySelector('[data-editor-inventory-retry]').click();
    await tick();
    assert.equal(f.document.querySelector('[data-editor-price="BAD"]').textContent, '¥ 160');
    f.button('提交').click();
    assert.equal(f.document.querySelector('[data-editor-confirm]').disabled, false);
    f.document.querySelector('[data-editor-confirm]').click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].inventoryHash, 'b'.repeat(64));
  } finally {
    f.dom.window.close();
  }
});

test('a failed preview cannot invent a price for an originally unpriced product', async () => {
  const f = setup({ previewError: '网络中断' });
  try {
    await tick();
    assert.equal(f.document.querySelector('[data-editor-price="BAD"]').textContent, '¥ —');
    assert.equal(
      f.document.querySelector('[data-editor-price-reason="BAD"]').textContent,
      '暂无价格',
    );
    f.button('提交').click();
    assert.equal(f.document.querySelector('[data-editor-confirm]').disabled, true);
    assert.equal(f.calls.length, 0);
  } finally {
    f.dom.window.close();
  }
});
test('changing date after a preview triggers a new validation and whole-pallet quantity remains enforced', async () => {
  const f = setup();
  try {
    await replace(f);
    const before = f.previews.length;
    const date = f.document.querySelector('#orderEditor [aria-label="预计交货日期"]');
    date.value = '2026-11-26';
    date.dispatchEvent(new f.dom.window.Event('change'));
    await tick();
    assert.ok(f.previews.length > before);
    assert.equal(f.previews.at(-1).deliveryDate, '2026-11-26');
    const vehicle = f.document.querySelector('#orderEditor [aria-label="选择车型"]');
    assert.equal(vehicle.disabled, false);
    vehicle.value = '6.8米';
    vehicle.dispatchEvent(new f.dom.window.Event('change'));
    await tick();
    assert.equal(f.previews.at(-1).vehicleType, '6.8米');
    const quantity = f.document.querySelector('[aria-label="NEW 数量"]');
    quantity.value = '41';
    quantity.dispatchEvent(new f.dom.window.Event('input'));
    f.button('提交').click();
    assert.equal(f.document.querySelector('[data-editor-confirm]').disabled, true);
    assert.equal(f.calls.length, 0);
  } finally {
    f.dom.window.close();
  }
});
test('disabled quantity inputs with invalid pallet rules cannot bypass validation when their native validation message is empty', async () => {
  const f = setup({ invalidRules: true });
  try {
    const quantity = f.document.querySelector('[aria-label="BAD 数量"]');
    assert.equal(quantity.disabled, true);
    assert.equal(quantity.getAttribute('aria-invalid'), 'true');
    assert.equal(quantity.validationMessage, '');
    const date = f.document.querySelector('[aria-label="预计交货日期"]');
    date.value = '2026-11-30';
    date.dispatchEvent(new f.dom.window.Event('change'));
    const vehicle = f.document.querySelector('[aria-label="选择车型"]');
    vehicle.value = '6.8米';
    vehicle.dispatchEvent(new f.dom.window.Event('change'));
    await tick();
    f.button('提交').click();
    const confirm = f.document.querySelector('[data-editor-confirm]');
    assert.equal(confirm.disabled, true);
    assert.match(
      f.document.querySelector('[data-editor-dialog-reason]').textContent,
      /每托箱数无效/,
    );
    confirm.disabled = false;
    confirm.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.calls.length, 0);
    assert.equal(f.previews.length, 0);
    assert.doesNotMatch(
      f.document.getElementById('orderEditor').textContent,
      /inventoryHash|undefined/,
    );
  } finally {
    f.dom.window.close();
  }
});
test('read-only users cannot delete or edit the order', () => {
  const f = setup({ canAct: false });
  try {
    assert.equal(f.document.querySelector('.editor-remove'), null);
    assert.equal(f.calls.length, 0);
  } finally {
    f.dom.window.close();
  }
});
