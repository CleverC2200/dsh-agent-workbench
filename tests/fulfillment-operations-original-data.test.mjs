import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichOriginalData } from '../prototypes/inventory-orderfulfillment/operations-original-data.mjs';
import { readFile } from 'node:fs/promises';
import {
  operationsCustomerGroups,
  knownOrderPlanSummary,
  bindPendingBreakdowns,
} from '../prototypes/inventory-orderfulfillment/operations-original-aggregation.mjs';
test('independently complete rate groups draw without claiming a complete global distribution', () => {
  const order = (base, quantity) => ({
    base,
    pickup: base,
    region: base,
    province: base,
    group: base,
    date: '2026-11-25 12:00:00',
    custType: 'jxs',
    attr: '工厂',
    reasonFlags: {},
    合计: { qty: quantity, occupied: 8, unprepared: 2 },
  });
  const data = { orderDetail: [order('完整基地', 10), order('缺值基地', NaN)], liveCharts: [] };
  bindPendingBreakdowns(data, () => ({}), '2026-11-25');
  assert.ok(data.liveCharts.includes('c_base_rate'));
  assert.ok(data.liveCharts.includes('c_rate_dist'));
  assert.ok(data.liveCharts.includes('c_un_pk'));
  assert.ok(data.liveCharts.includes('c_un_org'));
  assert.ok(!data.liveCharts.includes('c_item_unopen'));
  assert.equal(data.baseRate['完整基地'].rate80_90, 10);
  assert.ok(Number.isNaN(data.baseRate['缺值基地'].rate80_90));
  assert.ok(Number.isNaN(data.rate90above.qtyRatio));
  const unnamed = { orderDetail: [order('', 10)], liveCharts: [] };
  bindPendingBreakdowns(unnamed, () => ({}), '2026-11-25');
  assert.equal(unnamed.baseRate['归属未知'].rate80_90, 10);
});

test('customer grouping matches all 100 quantity and document-count groups in the user original HTML', async () => {
  const html = await readFile(
    new URL('../prototypes/inventory-orderfulfillment/delivery-operations.html', import.meta.url),
    'utf8',
  );
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].at(-1)[1];
  const start = script.indexOf('const D = ') + 10;
  const data = JSON.parse(
    script.slice(start, script.indexOf('\n', start)).trim().replace(/;$/, ''),
  );
  const orders = data.orderDetail.filter((row) => row.custType !== '合计');
  let checked = 0;
  for (const pickup of data.unopenPickup.filter((row) => row.pickup !== '合计'))
    for (const [field, types] of Object.entries(operationsCustomerGroups)) {
      const rows = orders.filter(
        (row) => row.pickup === pickup.pickup && types.includes(row.custType),
      );
      assert.equal(
        rows.reduce((sum, row) => sum + row['合计'].qty, 0),
        pickup[field].qty,
      );
      assert.equal(new Set(rows.map((row) => row.doc)).size, pickup[field].orders);
      checked++;
    }
  assert.equal(checked, 100);
  let reasonGroups = 0;
  for (const pickup of data.unopenPickupReason.filter((row) => row.pickup !== '合计'))
    for (const [field, reason] of [
      ['notdue', '未到交期开单时间'],
      ['unmarked', ''],
    ]) {
      const selected = orders.filter(
        (row) => row.pickup === pickup.pickup && row.reason === reason,
      );
      assert.equal(
        selected.reduce((sum, row) => sum + row['合计'].qty, 0),
        pickup[field].qty,
      );
      assert.equal(new Set(selected.map((row) => row.doc)).size, pickup[field].orders);
      reasonGroups++;
    }
  const customerLabel = {
    jxs: '经销商',
    kajxs: '经销商',
    dc: '直营',
    kamd: '直营',
    nbkhwl: '调拨',
    nbkh: '分拨',
    hwkh: '出口',
  };
  const attrs = new Map(
    data.unopenPickup.filter((row) => row.pickup !== '合计').map((row) => [row.pickup, row.attr]),
  );
  for (const customer of data.unopenCustReason.filter((row) => row.custType !== '合计')) {
    const selected = orders.filter(
      (row) =>
        customerLabel[row.custType] === customer.custType &&
        attrs.get(row.pickup) === customer.attr &&
        row.reason === '缺货',
    );
    assert.equal(
      selected.reduce((sum, row) => sum + row['合计'].qty, 0),
      customer.lack.qty,
    );
    assert.equal(new Set(selected.map((row) => row.doc)).size, customer.lack.orders);
    reasonGroups++;
  }
  assert.equal(reasonGroups, 48);
  const plan = data.dailyItem.find((row) => row.metric === '纠偏计划');
  const ordered = data.dailyItem.find((row) => row.metric === '累计报单量');
  const progress = data.dailyItem.find((row) => row.metric === '报单进度');
  for (let index = 0; index < 7; index++)
    assert.ok(Math.abs(progress.vals[index] - ordered.vals[index] / plan.vals[index]) < 1e-12);
});
const stock = {
  base: '郑州',
  sku: 'S1',
  material_name: '测试商品',
  item: '水饺',
  series: '系列',
  stock_date: '2026-11-24',
  source_rows: 1,
  unopened_qty: 20,
  stock_qty: 100,
  available_qty: 80,
  over60_source_qty: 4,
  main_plan_initial: 50,
  bp_plan_initial: 10,
  main_plan_adjusted: 60,
  bp_plan_adjusted: 0,
  transfer_plan_initial: 20,
  transfer_plan_adjusted: 0,
  sales_shipped: 30,
  transfer_shipped: 5,
  month_days: 30,
};
test('unique authorized product dictionary fills blank attributes without replacing known or conflicting execution values', () => {
  const product = { sku: 'S1', item: '水饺', series: '系列', snapshot_date: '2026-11-26' };
  const run = (attributes, dictionary = product, item = '') => {
    const data = fresh();
    enrichOriginalData(
      data,
      cache({
        'stock.sku': [{ ...stock, item, series: '' }],
        'sku.attributes': attributes,
        'product.attributes': [dictionary],
      }),
      template,
      '2026-11-26',
    );
    return data.sku.find((row) => row.code === 'S1');
  };
  const filled = run([]);
  assert.equal(filled.item, '水饺');
  assert.equal(filled.series, '系列');
  assert.equal(filled.productAttributeSnapshot, '2026-11-26');
  assert.deepEqual(filled.attributeBindings, ['product.item', 'product.series']);
  assert.equal(run([], product, '已知品项').item, '已知品项');
  assert.equal(run([{ base: '其他基地', sku: 'S1', item: '汤圆', series: '其他系列' }]).item, '');
  assert.equal(run([{ base: '其他基地', sku: 'S1', item: null, series: null }]).series, '');
  assert.equal(run([], { ...product, item: null }).item, '');
  assert.equal(run([], { ...product, sku: 'OTHER' }).series, '');
  const waiting = fresh();
  enrichOriginalData(
    waiting,
    cache({
      'stock.sku': [{ ...stock, item: '', series: '' }],
      'product.attributes': [product],
    }),
    template,
    '2026-11-26',
  );
  assert.equal(waiting.sku[0].item, '');
});
test('material master fills only SKUs absent from the completed primary dictionary and never bypasses conflicts or invents a snapshot date', () => {
  const master = { sku: 'S1', item: '水饺', series: '主数据系列' };
  const run = (extra = {}) => {
    const data = fresh();
    enrichOriginalData(
      data,
      cache({
        'stock.sku': [{ ...stock, item: '', series: '' }],
        'sku.attributes': [],
        'product.attributes': [],
        'product.master.attributes': [master],
        ...extra,
      }),
      template,
      '2026-11-26',
    );
    return data.sku[0];
  };
  const filled = run();
  assert.equal(filled.item, '水饺');
  assert.equal(filled.series, '主数据系列');
  assert.equal(filled.productAttributeSource, 'agents_dim_material_prod_sales_info_d');
  assert.equal(filled.productAttributeSnapshot, undefined);
  assert.equal(filled.stockDate, stock.stock_date);
  const oemOnly = run({
    'stock.sku': [],
    'supply.oem.stock': [
      {
        base: '郑州',
        sku: 'S1',
        material_name: 'OEM商品',
        snapshot_date: '20261125',
        source_rows: 1,
        known_quantities: 1,
        quantity: 8,
        negative_rows: 0,
      },
    ],
  });
  assert.equal(oemOnly.item, '水饺');
  assert.equal(oemOnly.series, '主数据系列');
  assert.equal(oemOnly.odmStock, 8);
  assert.deepEqual(filled.attributeBindings, ['productMaster.item', 'productMaster.series']);
  assert.equal(run({ 'product.attributes': [{ sku: 'S1', item: null, series: null }] }).item, '');
  assert.equal(
    run({ 'product.attributes': [{ sku: 'S1', item: '汤圆', series: '主字典系列' }] }).series,
    '主字典系列',
  );
  assert.equal(
    run({ 'sku.attributes': [{ base: '其他基地', sku: 'S1', item: '汤圆', series: null }] }).item,
    '',
  );
  assert.equal(run({ 'product.master.attributes': [{ ...master, sku: 'OTHER' }] }).series, '');
  const waiting = fresh();
  enrichOriginalData(
    waiting,
    cache({
      'stock.sku': [{ ...stock, item: '', series: '' }],
      'sku.attributes': [],
      'product.master.attributes': [master],
    }),
    template,
    '2026-11-26',
  );
  assert.equal(waiting.sku[0].item, '');
});
const template = (name) =>
  name === 'warehouse'
    ? { total: {}, sales: {}, dc: {} }
    : name === 'orderDetail'
      ? { 合计: {} }
      : {};
const fresh = () => ({
  baseProgress: [{ base: '郑州' }, { base: '合计' }],
  sku: [],
  liveCharts: [],
});
const cache = (entries) => new Map(Object.entries(entries).map(([key, rows]) => [key, { rows }]));
test('original slots bind DMS initial plan and dated SKU snapshots without relabelling them as assessment plans', () => {
  const data = fresh();
  enrichOriginalData(
    data,
    cache({ 'plan.base': [{ base: '郑州', initial_plan: 100 }], 'stock.sku': [stock] }),
    template,
    '2026-11-25',
  );
  assert.equal(data.baseProgress[1].planDms, 100);
  assert.equal(data.baseProgress[1].planEval, undefined);
  assert.equal(data.baseProgress[1].unopened, 20);
  assert.equal(data.sku[0].planSalesMonth, 70);
  assert.equal(data.sku[0].shipSales, 30);
  assert.equal(data.sku[0].shipDays, 30);
  assert.equal(data.sku[0].stockDate, '2026-11-24');
  const invalid = fresh();
  enrichOriginalData(
    invalid,
    cache({ 'stock.sku': [{ ...stock, source_rows: 2 }] }),
    template,
    '2026-11-25',
  );
  assert.ok(Number.isNaN(invalid.sku[0].shipSales));
  assert.ok(Number.isNaN(invalid.sku[0].shipDays));
});
test('original production slots use ST only and preserve unknown when a source day contains KG', () => {
  const data = fresh();
  enrichOriginalData(
    data,
    cache({
      'stock.sku': [stock],
      'production.future': [
        { factory: '郑州工厂', sku: 'S1', day: '20261125', unit: 'ST', planned_qty: 12 },
        { factory: '郑州工厂', sku: 'S1', day: '20261126', unit: 'KG', planned_qty: 5 },
      ],
    }),
    template,
    '2026-11-25',
  );
  assert.equal(data.sku[0].prodToday, 12);
  assert.ok(Number.isNaN(data.sku[0].prod1));
  assert.equal(data.sku[0].prod2, 0);
});
const line = {
  executeorderno: 'E1',
  executeorderlineno: '1',
  cust_order_no: 'O1',
  cust_code: 'C1',
  material_code: 'S1',
  belong_base: '郑州',
  fromorderno: 'SOURCE1',
  fromorderlineno: '1',
  detailstatus: 10,
  is_stat: '1',
  prapare_order_status: '已开未派',
  packingunitmain: 'CS',
  packingunitconvertrate: 10,
  order_qty: 10,
  adjust_order_qty: 10,
  pack_unitqty: 2,
  qtyallocated: 20,
  qtyshipped: 0,
  delivery_qty: 0,
  warehouseid: 'W1',
  warehouse_name: '仓一',
  director: '负责人',
};
test('item subtotals retain valid quantities inside incomplete orders without assigning unknown categories or filling missing quantities with zero', () => {
  const data = fresh();
  const sources = [
    { ...line, prapare_order_status: '备单中', product_item: '水饺' },
    {
      ...line,
      prapare_order_status: '备单中',
      product_item: '水饺',
      executeorderno: 'E2',
      material_code: 'S2',
      fromorderlineno: '2',
      order_qty: null,
      adjust_order_qty: null,
    },
    {
      ...line,
      prapare_order_status: '备单中',
      product_item: null,
      executeorderno: 'E3',
      material_code: 'S3',
      fromorderlineno: '3',
    },
  ];
  enrichOriginalData(data, cache({ 'orders.facts': sources }), template, '2026-11-27');
  assert.ok(Number.isNaN(data.orderDetail[0]['水饺'].qty));
  const qty = data.itemUnopenCoverage['水饺'].qty;
  assert.equal(qty.covered, 1);
  assert.equal(qty.total, 3);
  assert.equal(qty.unclassified, 1);
  assert.equal(qty.quantity, 10);
  assert.equal(data.itemUnopenCoverage['水饺'].unprepared.quantity, 8);
  assert.equal(data.itemUnopenCoverage['汤圆'].qty.covered, 0);
  assert.ok(data.liveCharts.includes('c_un_item'));
  assert.ok(!data.liveCharts.includes('c_item_unopen'));
  enrichOriginalData(data, cache({}), template, '2026-11-27');
  assert.deepEqual(data.itemUnopenCoverage, {});
});
test('monthly plan data fills missing SKU sales fields only at matching base and SKU without overriding snapshots or interpreting aggregated adjustments', () => {
  const plan = {
    base: '郑州',
    sku: 'S1',
    source_rows: 1,
    initial_plan: 100,
    adjusted_plan: 80,
    shipped: 30,
  };
  const run = (source, stocks = []) => {
    const data = fresh();
    data.sku = [{ pickup: '郑州', code: 'S1' }];
    enrichOriginalData(
      data,
      cache({ 'plan.sku': source, 'stock.sku': stocks }),
      template,
      '2026-11-27',
    );
    return data.sku.find((row) => row.pickup === '郑州' && row.code === 'S1');
  };
  assert.equal(run([plan]).planSalesMonth, 80);
  assert.equal(run([{ ...plan, adjusted_plan: 0 }]).planSalesMonth, 100);
  assert.equal(run([{ ...plan, shipped: 0 }]).shipSales, 0);
  assert.equal(run([{ ...plan, source_rows: 2 }]).planSalesMonth, undefined);
  assert.equal(run([{ ...plan, source_rows: 2 }]).shipSales, 30);
  assert.equal(run([{ ...plan, base: '西南' }]).shipSales, undefined);
  assert.equal(run([plan, plan]).shipSales, undefined);
  assert.equal(run([plan], [{ ...stock, sales_shipped: 12 }]).shipSales, 12);
  assert.ok(Number.isNaN(run([plan], [{ ...stock, source_rows: 2 }]).shipSales));
});
test('warehouse quantities reuse governed unit conversion and reject cross-warehouse SKU allocation', () => {
  const data = fresh();
  enrichOriginalData(data, cache({ 'orders.facts': [line] }), template, '2026-11-25');
  assert.equal(data.warehouse[0].total.openPending, 2);
  assert.equal(data.baseProgress[1].pendingShip, 2);
  const split = fresh();
  enrichOriginalData(
    split,
    cache({
      'orders.facts': [
        line,
        { ...line, executeorderno: 'E2', warehouseid: 'W2', warehouse_name: '仓二' },
      ],
    }),
    template,
    '2026-11-25',
  );
  assert.equal(split.warehouse.length, 2);
  assert.ok(split.warehouse.every((row) => Number.isNaN(row.total.openPending)));
  assert.ok(Number.isNaN(split.baseProgress[1].pendingShip));
});

test('existing shortage values and Chinese reasons reach original slots without becoming full-scope totals', () => {
  const data = fresh();
  enrichOriginalData(
    data,
    cache({
      'stock.sku': [stock],
      'shortage.sku': [
        {
          base: '郑州',
          sku: 'S1',
          material_name: '测试商品',
          item: '水饺',
          execution_sku_groups: 1,
          covered_groups: 1,
          duplicate_groups: 0,
          inventory_gap: 7,
          final_gap: 3,
        },
      ],
      'orders.facts': [
        {
          ...line,
          prapare_order_status: '备单中',
          header_addtime: '2026-11-24 12:00:00',
          product_item: '水饺',
          pickup_point_name: '郑州',
          region_name: '华中',
          province_region_name: '河南',
          sales_group_name: '河南一组',
          cust_type: 'jxs',
          timeout_code: '2',
          timeout_name: '缺货',
        },
      ],
    }),
    template,
    '2026-11-25',
  );
  assert.equal(data.sku[0].stock, 100);
  assert.equal(data.sku[0].available, 80);
  assert.equal(data.sku[0].lackToday, -7);
  assert.equal(data.sku[0].shortageCoverage.complete, true);
  assert.equal(data.orderDetail[0].reason, '缺货');
  assert.equal(data.orderDetail[0]['合计'].unprepared, 8);
  assert.equal(data.unopenOrg[0].group, '河南一组');
  assert.equal(data.unopenOrg[0].total.qty, 10);
  assert.equal(data.unopenTime[0].total.orders, 1);
  assert.equal(data.rateCoverage.knownOrders, 1);
  assert.equal(data.rate90above.qty, 0);
  assert.equal(data.sku[0].lackAll, undefined);
});
test('same-day existing batch ages fill the original 40-60 slot while conflicting shortage matches stay unknown', () => {
  const data = fresh();
  enrichOriginalData(
    data,
    cache({
      'stock.sku': [stock],
      'stock.age': [
        {
          base: '郑州',
          sku: 'S1',
          batch_date: '20261124',
          production_date: '2026-10-10',
          quantity: 6,
          batch_rows: 1,
          known_quantities: 1,
          minimum_quantity: 6,
        },
      ],
      'shortage.sku': [
        {
          base: '郑州',
          sku: 'S1',
          material_name: '测试商品',
          item: '水饺',
          execution_sku_groups: 2,
          covered_groups: 1,
          duplicate_groups: 1,
          inventory_gap: 20,
          final_gap: 3,
        },
      ],
    }),
    template,
    '2026-11-25',
  );
  assert.equal(data.sku[0].stock41_60, 6);
  assert.ok(Number.isNaN(data.sku[0].lackToday));
  assert.equal(data.sku[0].stock60p, 4);
});

test('existing OEM inventory fills only matching same-date SKU slots and does not turn negative batches into usable supply', () => {
  const data = fresh();
  enrichOriginalData(
    data,
    cache({
      'stock.sku': [stock],
      'supply.oem.stock': [
        {
          base: '郑州',
          sku: 'S1',
          material_name: '测试商品',
          snapshot_date: '20261124',
          quantity: 8,
          source_rows: 3,
          known_quantities: 3,
          negative_rows: 1,
        },
      ],
    }),
    template,
    '2026-11-25',
  );
  assert.equal(data.sku[0].odmStock, 8);
  assert.ok(Number.isNaN(data.sku[0].oemStockNonnegative));
  assert.equal(data.sku[0].oemStockEvidence.warehouseClass, '03');
  const old = fresh();
  enrichOriginalData(
    old,
    cache({
      'stock.sku': [stock],
      'supply.oem.stock': [
        {
          base: '郑州',
          sku: 'S1',
          snapshot_date: '20261123',
          quantity: 8,
          source_rows: 1,
          known_quantities: 1,
          negative_rows: 0,
        },
      ],
    }),
    template,
    '2026-11-25',
  );
  assert.ok(Number.isNaN(old.sku[0].odmStock));
});
test('KG production converts through a unique positive tonnes-per-piece factor while PAK and conflicting factors remain unknown', () => {
  const factor = {
    sku: 'S1',
    ton_per_piece: 0.01,
    source_rows: 2,
    known_quantities: 2,
    distinct_factors: 1,
  };
  const production = [
    { factory: '郑州工厂', sku: 'S1', day: '20261125', unit: 'ST', planned_qty: 12 },
    { factory: '郑州工厂', sku: 'S1', day: '20261125', unit: 'KG', planned_qty: 50 },
    { factory: '郑州工厂', sku: 'S1', day: '20261126', unit: 'PAK', planned_qty: 5 },
  ];
  const data = fresh();
  enrichOriginalData(
    data,
    cache({
      'stock.sku': [stock],
      'product.unit.factors': [factor],
      'production.future': production,
    }),
    template,
    '2026-11-25',
  );
  assert.equal(data.sku[0].prodToday, 17);
  assert.ok(Number.isNaN(data.sku[0].prod1));
  const conflict = fresh();
  enrichOriginalData(
    conflict,
    cache({
      'stock.sku': [stock],
      'product.unit.factors': [{ ...factor, distinct_factors: 2 }],
      'production.future': production,
    }),
    template,
    '2026-11-25',
  );
  assert.ok(Number.isNaN(conflict.sku[0].prodToday));
});

test('factory codes connect differently named plants and production-only SKUs to the existing base mapping', () => {
  const data = fresh();
  enrichOriginalData(
    data,
    cache({
      'production.future': [
        {
          factory: '湖州工厂',
          factory_code: '6001',
          sku: 'S-NEW',
          material_name: '新增生产SKU',
          day: '20261125',
          unit: 'ST',
          planned_qty: 12,
        },
      ],
    }),
    template,
    '2026-11-25',
  );
  assert.equal(data.sku[0].pickup, '华东');
  assert.equal(data.sku[0].code, 'S-NEW');
  assert.equal(data.sku[0].prodToday, 12);
  assert.equal(data.sku[0].stock, undefined);
});

test('branch supply retains warehouse grain and does not replace factory stock or reinterpret transfer preparation', () => {
  const data = fresh();
  enrichOriginalData(
    data,
    cache({
      'stock.sku': [stock],
      'supply.branch': [
        {
          warehouse_code: 'W1',
          warehouse: '分仓',
          sku: 'S1',
          base: '郑州',
          inventory: 30,
          available: 20,
          in_transit: 7,
          preparing_source: 9,
          source_rows: 1,
        },
        {
          warehouse_code: 'W2',
          warehouse: '重复仓',
          sku: 'S1',
          base: '郑州',
          inventory: 30,
          available: 20,
          in_transit: 7,
          preparing_source: 9,
          source_rows: 2,
        },
      ],
    }),
    template,
    '2026-11-25',
  );
  assert.equal(data.sku.find((row) => row.pickup === '郑州').stock, 100);
  const branch = data.sku.find((row) => row.supplyWarehouseCode === 'W1');
  assert.equal(branch.stock, 30);
  assert.equal(branch.dcInTransit, 7);
  assert.equal(branch.transferPreparingSourceQty, 9);
  assert.equal(branch.waitDc, undefined);
  assert.ok(Number.isNaN(data.sku.find((row) => row.supplyWarehouseCode === 'W2').dcInTransit));
});

test('existing warehouse stock, regional stages, rate bands, item transfer shipments and SKU pending shipments bind at their own grains', () => {
  const data = fresh();
  data.areaProgress = [
    { region: '华中', province: '河南', salesGroup: '河南一组', orderTotal: 60, natShip: 40 },
  ];
  data.dailyItem = [{ metric: '累计发货量', vals: Array(21).fill(NaN) }];
  const org = {
    region_name: '华中',
    province_region_name: '河南',
    sales_group_name: '河南一组',
    header_addtime: '2026-11-24 12:00:00',
    product_item: '水饺',
  };
  enrichOriginalData(
    data,
    cache({
      'stock.sku': [stock],
      'warehouse.stock': [
        { base: '郑州', warehouse_code: 'W1', stock_qty: 800, stock_date: '20261124' },
      ],
      'orders.facts': [
        { ...line, ...org },
        {
          ...line,
          ...org,
          executeorderno: 'E2',
          cust_order_no: 'ORDER2',
          fromorderno: 'SOURCE2',
          material_code: 'S2',
          prapare_order_status: '备单中',
        },
      ],
    }),
    template,
    '2026-11-25',
  );
  assert.equal(data.sku.find((row) => row.code === 'S1').openUnship, 2);
  assert.equal(data.warehouse[0].total.stock, 800);
  assert.equal(data.warehouse[0].stockDate, '20261124');
  assert.equal(data.warehouse[0].total.unopen, 10);
  assert.equal(data.areaProgress[0].unopened, 10);
  assert.equal(data.areaProgress[0].openedUnassigned, 2);
  assert.equal(data.areaProgress[0].rateBelow70, 10);
  assert.equal(data.areaProgress[0].order, 60);
  assert.equal(data.areaProgress[0].ship, 40);
  assert.equal(data.liveCharts.includes('c_reg_prog'), false);
  assert.equal(data.areaProgress[0].unopen, 10);
  assert.equal(data.dailyItem[0].vals[9], 5);
  const split = fresh();
  enrichOriginalData(
    split,
    cache({
      'stock.sku': [stock],
      'orders.facts': [line, { ...line, executeorderno: 'E2', prapare_order_status: '备单中' }],
    }),
    template,
    '2026-11-25',
  );
  assert.ok(Number.isNaN(split.sku[0].openUnship));
  const noStock = fresh();
  enrichOriginalData(noStock, cache({ 'orders.facts': [line] }), template, '2026-11-25');
  assert.equal(noStock.warehouse[0].total.stock, undefined);
});

test('existing SKU attributes fill empty slots by warehouse or base without overwriting known values or resolving conflicting owners', () => {
  const data = fresh();
  enrichOriginalData(
    data,
    cache({
      'stock.sku': [stock],
      'supply.branch': [
        { warehouse_code: 'W1', warehouse: '分仓', sku: 'S1', base: '郑州', source_rows: 1 },
      ],
      'sku.attributes': [
        {
          base: '郑州',
          warehouse_code: 'W1',
          sku: 'S1',
          item: '水饺',
          series: '系列A',
          owner: '张三',
        },
        {
          base: '郑州',
          warehouse_code: 'W2',
          sku: 'S1',
          item: '水饺',
          series: '系列A',
          owner: '李四',
        },
      ],
    }),
    template,
    '2026-11-26',
  );
  const base = data.sku.find((row) => row.pickup === '郑州');
  assert.equal(base.series, '系列');
  assert.equal(base.owner, undefined);
  const branch = data.sku.find((row) => row.supplyWarehouseCode === 'W1');
  assert.equal(branch.owner, '张三');
  assert.equal(branch.item, '水饺');
  assert.equal(branch.series, '系列A');
  const conflict = fresh();
  enrichOriginalData(
    conflict,
    cache({
      'supply.branch': [{ warehouse_code: 'W1', warehouse: '分仓', sku: 'S1', source_rows: 1 }],
      'sku.attributes': [
        {
          base: '郑州',
          warehouse_code: 'W1',
          sku: 'S1',
          item: '水饺',
          series: null,
          owner: '张三',
        },
        {
          base: '华东',
          warehouse_code: 'W1',
          sku: 'S1',
          item: '水饺',
          series: '系列A',
          owner: '李四',
        },
      ],
    }),
    template,
    '2026-11-26',
  );
  assert.equal(conflict.sku[0].item, '水饺');
  assert.equal(conflict.sku[0].owner, undefined);
  assert.equal(conflict.sku[0].series, undefined);
});

test('pending customer segments populate existing slots and do not classify unknown types or partial quantities as zero', () => {
  const data = fresh();
  const common = {
    ...line,
    prapare_order_status: '备单中',
    plant_flag: '工厂',
    pickup_point_name: '郑州',
    header_addtime: '2026-11-25 12:00:00',
  };
  const types = ['jxs', 'kajxs', 'dc', 'kamd', 'nbkhwl', 'nbkh', 'hwkh'];
  const facts = types.map((cust_type, i) => ({
    ...common,
    cust_type,
    executeorderno: 'E' + i,
    cust_order_no: 'O' + i,
    fromorderno: 'SRC' + i,
  }));
  enrichOriginalData(data, cache({ 'orders.facts': facts }), template, '2026-11-26');
  const row = data.unopenPickup[0];
  assert.equal(row.attr, '工厂');
  assert.equal(row.dealer.qty, 20);
  assert.equal(row.direct.qty, 20);
  assert.equal(row.transfer.qty, 10);
  assert.equal(row.dc.qty, 10);
  assert.equal(row.export.qty, 10);
  assert.equal(data.unopenCustReason.find((row) => row.custType === '经销商').total.qty, 20);
  const unknown = fresh();
  enrichOriginalData(
    unknown,
    cache({ 'orders.facts': [{ ...common, cust_type: 'new-code' }] }),
    template,
    '2026-11-26',
  );
  assert.ok(Number.isNaN(unknown.unopenPickup[0].dealer.qty));
  assert.equal(unknown.unopenCustReason[0].custType, 'new-code');
});

test('known pending shipment totals retain the complete warehouse subset without replacing the unknown full total', () => {
  const data = fresh();
  enrichOriginalData(
    data,
    cache({
      'orders.facts': [
        line,
        {
          ...line,
          executeorderno: 'E2',
          cust_order_no: 'O2',
          material_code: 'S2',
          fromorderno: 'SRC2',
          warehouseid: 'W2',
          packingunitmain: 'KG',
        },
      ],
    }),
    template,
    '2026-11-26',
  );
  const total = data.baseProgress.find((row) => row.base === '合计');
  assert.ok(Number.isNaN(total.pendingShip));
  assert.equal(total.pendingShipKnown, 2);
  assert.equal(total.pendingShipCovered, 1);
  assert.equal(total.pendingShipSourceRows, 2);
  assert.ok(data.liveCharts.includes('c_wh_stack'));
  assert.equal(data.liveCharts.includes('c_wh_pie'), false);
});

test('item order progress uses the original corrected-plan denominator and preserves missing or zero plans', () => {
  const data = fresh();
  data.dailyItem = [
    { metric: '纠偏计划', vals: [100, 0, NaN, 50] },
    { metric: '累计报单量', vals: [80, 10, 20, NaN] },
  ];
  enrichOriginalData(data, cache({}), template, '2026-11-26');
  const values = data.dailyItem.find((row) => row.metric === '报单进度').vals;
  assert.equal(values[0], 0.8);
  assert.ok(values.slice(1).every(Number.isNaN));
});

test('known item order subtotals retain source coverage without turning missing quantities into full totals', () => {
  assert.deepEqual(
    knownOrderPlanSummary([
      { source_rows: 3, ordered_coverage: 2, ordered_known: 80 },
      { source_rows: 2, ordered_coverage: 0, ordered_known: null },
    ]),
    { quantity: 80, covered: 2, total: 5 },
  );
  assert.equal(
    knownOrderPlanSummary([{ source_rows: 2, ordered_coverage: 1, ordered_known: null }]),
    null,
  );
  assert.equal(
    knownOrderPlanSummary([{ source_rows: 1, ordered_coverage: 2, ordered_known: 80 }]),
    null,
  );
});

test('direct source reasons fill only literal categories and retain ambiguous multi-reason orders as unknown', () => {
  const common = {
    ...line,
    prapare_order_status: '备单中',
    cust_type: 'jxs',
    pickup_point_name: '郑州',
    header_addtime: '2026-11-25 12:00:00',
  };
  const data = fresh();
  enrichOriginalData(
    data,
    cache({
      'orders.facts': [
        {
          ...common,
          executeorderno: 'E1',
          cust_order_no: 'O1',
          fromorderno: 'SRC1',
          timeout_code: '2',
          timeout_name: '缺货',
        },
        {
          ...common,
          executeorderno: 'E2',
          cust_order_no: 'O2',
          fromorderno: 'SRC2',
          timeout_code: '17',
          timeout_name: '未到交期开单时间',
        },
        {
          ...common,
          executeorderno: 'E3',
          cust_order_no: 'O3',
          fromorderno: 'SRC3',
          timeout_code: null,
          timeout_name: null,
        },
      ],
    }),
    template,
    '2026-11-26',
  );
  assert.equal(data.unopenPickupReason[0].notdue.qty, 10);
  assert.equal(data.unopenPickupReason[0].unmarked.qty, 10);
  assert.equal(data.unopenCustReason[0].lack.qty, 10);
  assert.equal(data.unopenOrg[0].lack.qty, 10);
  assert.ok(Number.isNaN(data.unopenPickupReason[0].customer.qty));
  assert.ok(Number.isNaN(data.unopenPickupReason[0].other.qty));
  const mixed = fresh();
  enrichOriginalData(
    mixed,
    cache({
      'orders.facts': [
        { ...common, executeorderno: 'E1', timeout_name: '缺货', timeout_code: '2' },
        {
          ...common,
          executeorderno: 'E2',
          material_code: 'S2',
          timeout_name: '未到交期开单时间',
          timeout_code: '17',
        },
      ],
    }),
    template,
    '2026-11-26',
  );
  assert.ok(Number.isNaN(mixed.unopenCustReason[0].lack.qty));
  assert.ok(Number.isNaN(mixed.unopenPickupReason[0].notdue.qty));
  const unknown = fresh();
  enrichOriginalData(
    unknown,
    cache({ 'orders.facts': [{ ...common, timeout_code: 'unknown-code', timeout_name: null }] }),
    template,
    '2026-11-26',
  );
  assert.ok(Number.isNaN(unknown.unopenCustReason[0].lack.qty));
  assert.equal(unknown.unopenPickupReason[0].unmarked.qty, 0);
});

test('complete production scope distinguishes confirmed no schedule from uncovered SKUs', () => {
  const data = fresh();
  enrichOriginalData(
    data,
    cache({
      'stock.sku': [stock, { ...stock, sku: 'S2' }],
      'sku.attributes': [
        {
          base: '郑州',
          warehouse_code: 'W1',
          sku: 'S1',
          item: '水饺',
          series: '系列',
          owner: '负责人',
        },
      ],
      'production.future': [],
    }),
    template,
    '2026-11-26',
  );
  const covered = data.sku.find((row) => row.code === 'S1'),
    uncovered = data.sku.find((row) => row.code === 'S2');
  assert.equal(covered.prodToday, 0);
  assert.equal(covered.prod5, 0);
  assert.equal(uncovered.prodToday, undefined);
});

test('current shortage uses inventory coverage independently of final supply coverage and counts only complete order keys', () => {
  const data = fresh();
  enrichOriginalData(
    data,
    cache({
      'shortage.sku': [
        {
          base: '郑州',
          sku: 'S1',
          item: '水饺',
          execution_sku_groups: 2,
          covered_groups: 1,
          inventory_coverage: 2,
          duplicate_groups: 0,
          inventory_gap: 7,
          inventory_orders: 1,
          final_gap: null,
        },
      ],
    }),
    template,
    '2026-11-26',
  );
  assert.equal(data.sku[0].lackToday, -7);
  assert.equal(data.sku[0].lackOrdersToday, 1);
  assert.ok(!Number.isFinite(data.sku[0].lack5d));
  const incomplete = fresh();
  enrichOriginalData(
    incomplete,
    cache({
      'shortage.sku': [
        {
          base: '郑州',
          sku: 'S1',
          execution_sku_groups: 2,
          covered_groups: 2,
          inventory_coverage: 1,
          duplicate_groups: 0,
          inventory_gap: null,
          inventory_orders: 1,
        },
      ],
    }),
    template,
    '2026-11-26',
  );
  assert.ok(Number.isNaN(incomplete.sku[0].lackToday));
  assert.ok(Number.isNaN(incomplete.sku[0].lackOrdersToday));
});

test('warehouse stock uses an unambiguous visible physical pool without assigning its base to an order or summing multiple pools', () => {
  const data = fresh();
  enrichOriginalData(
    data,
    cache({
      'orders.facts': [
        line,
        {
          ...line,
          executeorderno: 'E2',
          cust_order_no: 'O2',
          fromorderno: 'SRC2',
          belong_base: '华南',
        },
      ],
      'warehouse.stock': [
        { base: '华南', warehouse_code: 'W1', stock_qty: 12000, stock_date: '20261125' },
      ],
    }),
    template,
    '2026-11-26',
  );
  assert.equal(data.warehouse[0].base, '郑州');
  assert.equal(data.warehouse[0].total.stock, 12000);
  assert.ok(data.warehouse.every((row) => row.stockShared));
  const ambiguous = fresh();
  enrichOriginalData(
    ambiguous,
    cache({
      'orders.facts': [line],
      'warehouse.stock': [
        { base: '华南', warehouse_code: 'W1', stock_qty: 12000 },
        { base: '华东', warehouse_code: 'W1', stock_qty: 15000 },
      ],
    }),
    template,
    '2026-11-26',
  );
  assert.equal(ambiguous.warehouse[0].total.stock, undefined);
});
