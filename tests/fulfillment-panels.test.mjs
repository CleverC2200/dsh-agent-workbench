import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  renderCharts,
  renderCoordination,
  bindPanelControls,
  clearPanels,
} from '../prototypes/inventory-orderfulfillment/live-panels.js';
import { batchAges } from '../prototypes/inventory-orderfulfillment/live-model.mjs';

test('coordination uses granted rows, supports search/base/paging and clears identity-owned data', () => {
  const dom = new JSDOM(
    '<svg class="delivery-line-chart"></svg><svg class="delivery-line-chart"></svg><div id="orderStatusChartDetail"></div><input id="itemCoordinationSearch"><select id="itemCoordinationBase"></select><section id="itemCoordinationPanel"><table id="itemCoordinationTable"><thead></thead><tbody></tbody></table><p class="dimension-note"></p></section><span id="itemCoordinationCount"></span><span id="itemCoordinationPageInfo"></span><button id="itemCoordinationPrev"></button><button id="itemCoordinationNext"></button>',
  );
  const previousDocument = globalThis.document,
    previousOption = globalThis.Option;
  globalThis.document = dom.window.document;
  globalThis.Option = dom.window.Option;
  try {
    bindPanelControls();
    const rows = Array.from({ length: 27 }, (_, i) => ({
      base: i === 26 ? '遂平' : '郑州',
      sku: 'SKU' + i,
      material_name: '产品' + i,
      stock_qty: i,
      main_plan_adjusted: null,
    }));
    renderCoordination({ rows });
    assert.equal(document.querySelectorAll('tbody tr').length, 25);
    document.getElementById('itemCoordinationNext').click();
    assert.equal(document.querySelectorAll('tbody tr').length, 2);
    const search = document.getElementById('itemCoordinationSearch');
    search.value = 'SKU26';
    search.dispatchEvent(new dom.window.Event('input'));
    assert.equal(document.querySelectorAll('tbody tr').length, 1);
    assert.match(document.querySelector('tbody').textContent, /遂平/);
    search.value = '';
    search.dispatchEvent(new dom.window.Event('input'));
    const base = document.getElementById('itemCoordinationBase');
    base.value = '遂平';
    base.dispatchEvent(new dom.window.Event('change'));
    assert.equal(document.querySelectorAll('tbody tr').length, 1);
    const clicks = [];
    renderCharts(
      { nodes: { states: [{ order: 'O1', stage: 'allocation', status: 'warning' }], unknown: 0 } },
      {
        buckets: [1, 0, 0, 0, 0],
        rate_order_ids: [['O1'], [], [], [], []],
        rate_coverage: 1,
        rate_total: 1,
      },
      (ids) => clicks.push(ids),
    );
    document.querySelector('svg circle').dispatchEvent(new dom.window.Event('click'));
    assert.deepEqual(clicks, [['O1']]);
    renderCharts(null, null, (ids) => clicks.push(ids));
    assert.equal(document.querySelectorAll('svg circle').length, 0);
    assert.match(document.getElementById('orderStatusChartDetail').textContent, /未评估/);
    assert.match(document.querySelector('tbody').textContent, /SKU26/);
    clearPanels();
    assert.ok(!document.body.textContent.includes('SKU26'));
    assert.equal(document.querySelectorAll('svg circle').length, 0);
  } finally {
    globalThis.document = previousDocument;
    globalThis.Option = previousOption;
    dom.window.close();
  }
});
test('batch age buckets validate complete dates and quantities without gateway date arithmetic', () => {
  const row = {
    base: '郑州',
    sku: 'S1',
    batch_date: '20261021',
    production_date: '2026-10-21',
    quantity: 10,
    batch_rows: 1,
    known_quantities: 1,
    minimum_quantity: 10,
  };
  assert.equal(batchAges([row])[0].age_lt40, 10);
  assert.equal(batchAges([row], '2026-10-22')[0].age_lt40, 10);
  assert.equal(batchAges([row], '2026-10-23')[0].age_lt40, null);
  const old = { ...row, production_date: '2026-05-01', quantity: 20, minimum_quantity: 20 };
  assert.equal(batchAges([row, old])[0].age_ge120, 20);
  assert.equal(batchAges([{ ...row, production_date: '2026-10-22' }])[0].age_lt40, null);
  assert.equal(batchAges([{ ...row, production_date: '2026-02-30' }])[0].age_lt40, null);
  assert.equal(batchAges([{ ...row, known_quantities: 0 }])[0].age_lt40, null);
  assert.equal(batchAges([{ ...row, minimum_quantity: -1 }])[0].age_lt40, null);
});
