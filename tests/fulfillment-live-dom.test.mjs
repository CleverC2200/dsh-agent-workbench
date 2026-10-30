import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

const html = await readFile(
  new URL('../lib/business/inventory-orderfulfillment/index.html', import.meta.url),
  'utf8',
);
const config = JSON.parse(
  await readFile(
    new URL('../business/inventory-orderfulfillment/sql.config.json', import.meta.url),
    'utf8',
  ),
);
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await tick();
  }
  assert.fail('page did not settle');
}

test('built live page renders granted records, hides denied fields, and clears facts on identity changes', async (t) => {
  const errors = [],
    contexts = [];
  const console = new VirtualConsole();
  console.on('jsdomError', (error) => errors.push(error.message));
  const injected = html.replace(
    '<head>',
    '<head><script id="agent-sql-config" type="application/json">' +
      JSON.stringify(config).replaceAll('<', '\\u003c') +
      '</script>',
  );
  const dom = new JSDOM(injected, {
    url: 'https://workbench.test/page',
    referrer: 'https://workbench.test/',
    runScripts: 'dangerously',
    virtualConsole: console,
    beforeParse(window) {
      window.structuredClone = structuredClone;
      window.AbortController = AbortController;
      window.AbortSignal = AbortSignal;
    },
  });
  t.after(async () => {
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    await tick();
    dom.window.close();
  });
  const { window } = dom;
  let deny = false;
  let emptyFacts = false;
  const queryIds = [];
  let completeInventory;
  const port = {
    start() {},
    close() {},
    postMessage(message) {
      if (message.type !== 'request') return;
      let result = { ok: true };
      if (message.method === 'context') contexts.push(message.parameters);
      if (message.method === 'sql') {
        const id = message.parameters.queryId;
        queryIds.push(id);
        if (deny)
          result = {
            success: false,
            errorCode: 'RETURN_PERMISSION_DENIED',
            message: 'Denied',
          };
        else if (id.endsWith('.count'))
          result = {
            rows: [{ total: emptyFacts && id === 'orders.facts.count' ? 0 : 1 }],
            configVersion: 'v1',
          };
        else if (id === 'orders.summary')
          result = {
            rows: [
              {
                source_orders: 1,
                source_rows: 1,
                first_created: '2026-10-21',
                latest_created: '2026-10-21',
              },
            ],
            configVersion: 'v1',
          };
        else if (id === 'orders.facts' && emptyFacts) result = { rows: [], configVersion: 'v1' };
        else if (id === 'orders.facts')
          result = {
            rows: [
              {
                cust_order_no: 'AUTHORIZED-01',
                cust_code: 'C01',
                cust_type: 'jxs',
                material_code: 'M1',
                belong_base: '郑州',
                executeorderno: 'E1',
                executeorderlineno: '1',
                fromorderno: 'F1',
                detailstatus: 10,
                is_stat: 1,
                prapare_order_status: '备单中',
                packingunitmain: 'CS',
                packingunitconvertrate: 8,
                order_qty: 100,
                adjust_order_qty: 80,
                qtyallocated: 400,
                pack_unitqty: 50,
                qtyshipped: 160,
                delivery_qty: 20,
                originalqtybak: 100,
              },
            ],
            configVersion: 'v1',
          };
        else if (id === 'orders.open.summary')
          result = {
            rows: [
              { valid_orders: 8, preparing_orders: 5, opened_orders: 3, unclassified_orders: 0 },
            ],
            configVersion: 'v1',
          };
        else if (id === 'sku.detail')
          result = {
            rows: [
              Object.fromEntries(
                config.queries[id].resultColumns.map((key) => [
                  key,
                  key === 'sku' ? 'M1' : key === 'base' ? '郑州' : key === 'source_rows' ? 1 : null,
                ]),
              ),
            ],
            returnedColumns: config.queries[id].resultColumns,
            rejectedColumns: [],
            configVersion: 'v1',
          };
        else if (id === 'execution.trace')
          result = {
            rows: [
              {
                executeorderno: 'E1',
                cust_code: 'C01',
                fromorderno: 'F1',
                source_rows: 2,
                carrier_name: 'GRANTED-CARRIER',
                order_stage: '备单中',
                peidan_status: '备单正常',
              },
            ],
            configVersion: 'v1',
          };
        else if (id === 'shortage.summary')
          result = {
            rows: [
              {
                matched_sku_rows: 4,
                matched_orders: 2,
                final_quantity_coverage: 4,
                after_inventory_coverage: 4,
                after_inventory_short_qty: 23,
                duplicate_sku_rows: 0,
                final_short_qty: 17,
              },
            ],
            configVersion: 'v1',
          };
        else if (id === 'shortage.detail')
          result = {
            rows: [
              {
                order_no: 'AUTHORIZED-01',
                customer_code: 'C01',
                base: '郑州',
                execution_order: 'E1',
                sku: 'M1',
                source_rows: 1,
                after_inventory_short_qty: 23,
                final_short_qty: 17,
              },
            ],
            configVersion: 'v1',
          };
        else if (id === 'trace.summary')
          result = {
            rows: [{ matched_orders: 1, overdue_orders: 0, warning_orders: 0 }],
            configVersion: 'v1',
          };
        else
          result = {
            rows: [
              {
                order_no: 'AUTHORIZED-01',
                customer_code: 'C01',
                customer_name: 'DENIED-CUSTOMER',
                sku: 'M1',
                base: '郑州',
              },
            ],
            returnedColumns: ['order_no', 'customer_code', 'sku', 'base'],
            rejectedColumns: ['customer_name'],
            configVersion: 'v1',
          };
      }
      const respond = () =>
        queueMicrotask(() =>
          port.onmessage?.({
            data: { type: 'response', id: message.id, result },
          }),
        );
      if (!deny && message.method === 'sql' && message.parameters.queryId === 'sku.detail')
        completeInventory = respond;
      else respond();
    },
  };
  const connect = (session) =>
    window.dispatchEvent(
      new window.MessageEvent('message', {
        source: window,
        origin: 'https://workbench.test',
        data: {
          protocol: 'gea-html-v2',
          type: 'connect',
          context: { session, plugin: 'inventory-orderfulfillment' },
        },
        ports: [port],
      }),
    );
  connect('session-a');
  await until(() =>
    window.document
      .querySelector('#deliveryOrderDetailRows')
      ?.textContent.includes('AUTHORIZED-01'),
  );
  assert.ok(!window.document.body.textContent.includes('DENIED-CUSTOMER'));
  assert.ok(!window.document.body.textContent.includes('6,320'));
  await until(() =>
    window.document
      .querySelector('.summary.fulfillment-summary .metric .metric-head strong')
      ?.textContent.startsWith('1'),
  );
  await until(() =>
    window.document
      .querySelector('.summary.fulfillment-summary .metric:nth-child(4) .metric-head strong')
      .textContent.includes('23'),
  );
  const warehouseMetrics = window.document.querySelectorAll('.warehouse-summary > .metric');
  assert.equal(warehouseMetrics[0].querySelector('.metric-head strong').textContent, '0张0件');
  assert.match(
    warehouseMetrics[0].querySelector('[data-breakdown="open-total"]').textContent,
    /未开1 张/,
  );
  assert.equal(
    warehouseMetrics[3].querySelector('.metric-head > span').textContent,
    '已开订单满足率',
  );
  assert.equal(warehouseMetrics[3].querySelector('.metric-head strong').textContent, '—');
  assert.ok(!window.document.querySelector('.delivery-summary').textContent.includes('≥'));
  const charts = window.document.querySelectorAll('svg.delivery-line-chart');
  assert.equal(window.getComputedStyle(charts[0].closest('.dimension-card')).display, 'none');
  assert.equal(charts[1].closest('.dimension-card').hidden, true);
  assert.ok(window.document.querySelector('.item-analysis h3').textContent.includes('正在读取'));
  assert.match(window.document.querySelector('#deliveryOrderDetailRows').textContent, /50.0%/);
  assert.ok(window.document.querySelectorAll('svg.delivery-line-chart circle').length > 0);
  assert.ok(
    !queryIds.some((id) =>
      [
        'orders.detail',
        'orders.quantities',
        'orders.evidence',
        'warehouse.detail',
        'orders.by_base',
        'orders.by_province',
        'orders.by_carrier',
      ].includes(id),
    ),
  );
  await until(() => completeInventory);
  completeInventory();
  await until(
    () =>
      window.document.querySelector('.item-analysis h3').textContent ===
      '当前授权范围的品项库存情况',
  );
  assert.equal(
    window.document.querySelector('.item-analysis h3').textContent,
    '当前授权范围的品项库存情况',
  );
  assert.ok(window.document.querySelector('.item-analysis > p').textContent.includes('1 条'));
  assert.equal(window.document.querySelectorAll('#prototypeStatus').length, 1);
  assert.equal(window.document.querySelector('#salesConfirmOverlay').hidden, true);
  await until(() =>
    window.document.querySelector('#deliveryOrderDetailRows').textContent.includes('50.0%'),
  );
  assert.match(
    window.document.querySelector('.delivery-summary .metric:nth-child(5) strong').textContent,
    /50.0/,
  );
  assert.ok(!window.document.querySelector('#deliveryOrderDetailRows').textContent.includes('400'));
  const baseCells = window.document.querySelector('#deliveryBaseCompareRows tr').cells;
  const customerType = window.document.querySelector('#deliveryOrderDetailRows tr').cells[7];
  assert.equal(customerType.textContent, '经销商');
  assert.equal(customerType.className, 'customer-type-cell');
  assert.match(customerType.title, /原始编码：jxs/);
  assert.equal(baseCells[1].textContent, '郑州');
  assert.equal(baseCells[2].textContent, '1 张');
  assert.equal(baseCells[5].textContent, '1 张');
  assert.equal(baseCells[7].textContent, '50.0%');
  assert.equal(baseCells[8].textContent, '1 张');
  const pager = window.document.querySelector('nav[aria-label="订单明细分页"]');
  assert.match(pager.textContent, /共 1 条/);
  assert.match(pager.textContent, /第 1 \/ 1 页/);
  assert.equal(pager.querySelector('select').value, '20');
  assert.ok([...pager.querySelectorAll('button')].every((button) => button.disabled));
  pager.querySelector('select').value = '50';
  pager.querySelector('select').dispatchEvent(new window.Event('change'));
  assert.equal(
    window.document.querySelectorAll('#deliveryOrderDetailRows .delivery-order-main-row').length,
    1,
  );
  assert.equal(window.document.querySelector('.sales-confirm-trigger').disabled, false);
  window.document.querySelector('.sales-confirm-trigger').click();
  assert.equal(window.document.querySelector('#salesConfirmOverlay').hidden, false);
  assert.match(window.document.querySelector('#salesConfirmOrder').textContent, /AUTHORIZED-01/);
  assert.equal(
    window.document.querySelector('#salesConfirmForm button[type="submit"]').disabled,
    true,
  );
  window.document.querySelector('[data-close-sales-confirm]').click();
  assert.equal(window.document.querySelector('#salesConfirmOverlay').hidden, true);
  window.document.querySelector('.confirmation-status').click();
  assert.equal(window.document.querySelector('#confirmationHistoryOverlay').hidden, false);
  assert.match(
    window.document.querySelector('#confirmationHistoryDetails').textContent,
    /尚未接入真实/,
  );
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(window.document.querySelector('#confirmationHistoryOverlay').hidden, true);
  const baseToggle = window.document.querySelector(
    '#deliveryBaseCompareRows .delivery-order-expander',
  );
  baseToggle.click();
  assert.equal(window.document.querySelector('.delivery-base-compare-detail').hidden, false);
  assert.match(window.document.querySelector('.base-status-detail-table').textContent, /备单中/);
  const regionToggle = window.document.querySelector(
    '#deliveryRegionCompareRows .delivery-order-expander',
  );
  regionToggle.click();
  assert.equal(window.document.querySelector('.delivery-region-compare-detail').hidden, false);
  window.document.querySelector('#deliveryBaseCompareRows tr .compare-drilldown').click();
  assert.equal(
    window.document.querySelector('#deliveryOrderListTab').getAttribute('aria-selected'),
    'true',
  );
  assert.equal(
    window.document.querySelectorAll('#deliveryOrderDetailRows .delivery-order-main-row').length,
    1,
  );
  assert.match(window.document.querySelector('#deliveryOrderDetailRows').textContent, /100 箱/);
  assert.equal(
    window.document.querySelector('#deliveryOrderDetailRows .delivery-order-main-row').cells[7]
      .textContent,
    '经销商',
  );
  assert.equal(
    window.document.querySelector('#deliveryOrderDetailRows .delivery-order-main-row').cells[11]
      .textContent,
    'GRANTED-CARRIER',
  );
  assert.equal(
    window.document.querySelector('#deliveryChannelFilter option:nth-child(2)').value,
    'jxs',
  );
  assert.equal(
    window.document.querySelector('#deliveryChannelFilter option[value="kamd"]').textContent,
    '门店（KA-MD）',
  );
  assert.equal(
    window.document.querySelector('#deliveryChannelFilter option[value="dc"]').textContent,
    '配送中心（KA-DC）',
  );
  assert.equal(
    window.document.querySelector('#deliveryChannelFilter option[value="nbkh"]').textContent,
    '内部客户',
  );
  assert.match(
    window.document.querySelector('#deliveryChannelFilter option[value="skjxs"]').textContent,
    /类型名称待确认/,
  );
  assert.equal(window.document.querySelector('#deliveryChannelFilter option[value="md"]'), null);
  assert.equal(window.document.querySelectorAll('#deliveryChannelFilter option').length, 12);
  assert.ok(window.document.querySelectorAll('svg.delivery-line-chart circle').length > 0);
  assert.match(
    window.document.querySelector('#orderStatusChartDetail').textContent,
    /满足率区间覆盖/,
  );
  assert.match(
    window.document.querySelector('#itemCoordinationTable thead').textContent,
    /基本信息.*销售信息.*生产信息.*库存信息/,
  );
  const inventoryPanel = window.document.querySelector('#itemInventoryPanel');
  const inventoryPager = inventoryPanel.querySelector('.order-pagination');
  assert.ok(inventoryPager, '库存分页必须位于库存面板内部，随面板隐藏');
  assert.equal(inventoryPanel.querySelector('table').nextElementSibling, inventoryPager);
  const orderToolbar = window.document.querySelector('.delivery-order-view-toolbar');
  assert.ok(orderToolbar.contains(window.document.querySelector('#deliveryOrderListTab')));
  assert.ok(orderToolbar.contains(window.document.querySelector('.delivery-order-panel-tools')));
  window.document.querySelector('#deliveryBaseCompareTab').click();
  assert.equal(window.document.querySelector('.delivery-order-panel-tools').hidden, true);
  window.document.querySelector('#deliveryOrderListTab').click();
  assert.equal(window.document.querySelector('.delivery-order-panel-tools').hidden, false);
  assert.match(
    window.document.querySelector('#itemCoordinationPageInfo').textContent,
    /第 1 \/ 1 页/,
  );
  assert.equal(window.document.querySelector('nav[aria-label="产销协同分页"] select').value, '20');
  assert.equal(
    window.document.querySelector('#deliveryRegionCompareRows tr').cells[7].textContent,
    '50.0%',
  );
  const expander = window.document.querySelector('#deliveryOrderDetailRows button');
  expander.click();
  assert.equal(window.document.querySelector('.delivery-order-sku-row').hidden, false);
  assert.match(window.document.querySelector('.delivery-order-sku-table').textContent, /50.0%/);
  await until(() => contexts.some((context) => context.parts?.['orders.facts']?.state === 'ready'));
  port.onmessage({ data: { type: 'identity-changed' } });
  assert.equal(pager.hidden, true);
  assert.ok(
    !window.document
      .querySelector('#deliveryOrderDetailRows')
      .textContent.includes('AUTHORIZED-01'),
  );
  deny = true;
  connect('session-b');
  await until(() => window.document.body.textContent.includes('RETURN_PERMISSION_DENIED'));
  assert.ok(!window.document.body.textContent.includes('AUTHORIZED-01'));
  assert.ok(!window.document.body.textContent.includes('GRANTED-CARRIER'));
  assert.ok(
    !window.document
      .querySelector('#deliveryOrderDetailRows')
      .textContent.includes('AUTHORIZED-01'),
  );
  assert.deepEqual(errors, []);
  deny = false;
  emptyFacts = true;
  connect('session-c');
  await until(() =>
    window.document
      .querySelector('#deliveryOrderDetailRows')
      .textContent.includes('源数据在读取期间发生变化'),
  );
  assert.ok(
    !window.document
      .querySelector('#deliveryOrderDetailRows')
      .textContent.includes('AUTHORIZED-01'),
  );
});
