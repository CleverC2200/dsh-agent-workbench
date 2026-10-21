import assert from 'node:assert/strict';
import test from 'node:test';
import {
  customerLoadFailure,
  customerLoadLocales,
} from '../prototypes/inventory-customer/load-state.js';
import { customerMetricDefinitions } from '../prototypes/inventory-customer/metric-definitions.js';
import { readFile } from 'node:fs/promises';
import {
  mapCustomerInventoryRows,
  parseDeliveryCities,
  summarizeCustomerInventory,
  structureStatus,
  customerInventoryStatus,
  largeDateStatus,
  buildCustomerHierarchy,
  completeCustomerPath,
} from '../prototypes/inventory-customer/customer-inventory-model.js';

test('customer hierarchy and incomplete paths follow the latest loaded rows', () => {
  assert.deepEqual(buildCustomerHierarchy([]), []);
  const tree = buildCustomerHierarchy([
    { region: '大区A', province: '省区A', cities: ['城市A', '城市B'] },
    { region: '大区A', province: '省区A', cities: ['城市A'] },
  ]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].children[0].children.length, 2);
  assert.deepEqual(completeCustomerPath('region', [], tree), ['大区A']);
  assert.deepEqual(completeCustomerPath('province', [], tree), ['大区A', '省区A']);
  assert.deepEqual(completeCustomerPath('city', ['大区A', '省区A', '城市B'], tree), [
    '大区A',
    '省区A',
    '城市B',
  ]);
});

const source = await readFile(
  new URL('../prototypes/inventory-customer/data-source.js', import.meta.url),
  'utf8',
);

test('inventory loading copy distinguishes permission, resource, session and query failures in both locales', () => {
  for (const [message, expected] of [
    ['AGENT_ACCESS_DENIED', 'denied'],
    ['DATA_PERMISSION_DENIED', 'dataDenied'],
    ['PAGE_REFERENCE_LOGIN_REQUIRED', 'login'],
    ['PAGE_AGENT_MISSING', 'resource'],
    ['FIELD_NOT_PUBLISHED', 'resource'],
    ['PAGE_AGENT_SESSION_MISMATCH', 'session'],
    ['SESSION_EXPIRED', 'session'],
    ['network unavailable', 'query'],
  ]) {
    assert.equal(customerLoadFailure(Error(message)), expected);
  }
  assert.deepEqual(
    Object.keys(customerLoadLocales.zh).sort(),
    Object.keys(customerLoadLocales.en).sort(),
  );
});

test('metric dialogs separate formulas, state rules and data caveats', () => {
  assert.equal(Object.keys(customerMetricDefinitions).length, 6);
  for (const metric of Object.values(customerMetricDefinitions)) {
    assert.ok(metric.formula.length > 0);
    assert.ok(metric.rules.length > 0);
    assert.ok(metric.notes.length > 0);
    assert.ok(metric.formula.every((line) => line.includes('＝')));
    assert.ok(metric.formula.every((line) => !/待确认|待核验|当前取数|缺失/.test(line)));
  }
  for (const name of ['value', 'quantity', 'freshness']) {
    assert.match(customerMetricDefinitions[name].rules[0], /^缺失：/);
  }
  assert.equal(customerMetricDefinitions.structure.rules.length, 3);
  assert.ok(customerMetricDefinitions.largeDate.rules.some((line) => line.includes('≥ 5%')));
});

test('unscored structure explains negative sales, missing inputs and zero denominators', () => {
  const base = {
    snapshot_date: '2026-10-18',
    cust_code: 'C',
    cust_name: '客户',
    sku_rows: 2,
    stock_coverage: 2,
    sales_coverage: 2,
    stock_qty: 10,
    sales_qty_30days: 5,
  };
  const negative = mapCustomerInventoryRows([{ ...base, structure_negative_sales: 1 }]).rows;
  assert.equal(
    summarizeCustomerInventory(negative).structureMessage,
    '销量存在负值，结构分暂不计算',
  );
  const missing = mapCustomerInventoryRows([{ ...base, sales_coverage: 1 }]).rows;
  assert.match(summarizeCustomerInventory(missing).structureMessage, /SKU销量数据缺失/);
  const zero = mapCustomerInventoryRows([{ ...base, sales_qty_30days: 0 }]).rows;
  assert.match(summarizeCustomerInventory(zero).structureMessage, /近30日销量为0/);
  assert.match(
    summarizeCustomerInventory([...negative, { structureScore: 90 }]).structureMessage,
    /1家客户未评分/,
  );
});

test('negative customer inventory preserves book balances without negative turnover or partial freshness', () => {
  const input = {
    snapshot_date: '2026-10-17',
    cust_code: 'C1',
    cust_name: '负库存客户',
    stock_qty: -100,
    stock_amt: -20000,
    sales_qty_30days: 30,
    normal_stock_qty: -100,
    sku_rows: 1,
    stock_coverage: 1,
    value_coverage: 1,
    sales_coverage: 1,
    normal_coverage: 1,
  };
  const negative = mapCustomerInventoryRows([input]).rows[0];
  assert.equal(negative.quantity, -100);
  assert.equal(negative.value, -2);
  assert.equal(negative.turnover, null);
  const summary = summarizeCustomerInventory([
    negative,
    { ...negative, quantity: 50, value: 1, normalRatio: 100 },
  ]);
  assert.equal(summary.quantity, -50);
  assert.equal(summary.anomalous, true);
  assert.equal(summary.turnover, null);
  assert.equal(summary.normalRatio, null);
  assert.equal(summary.targetValue, null);
  assert.equal(summary.largeDateQty, null);
});

test('customer summary preserves missing coverage and weights valid normal stock', () => {
  const row = {
    quantity: 100,
    value: 1,
    sales30: 50,
    normalRatio: 80,
    inTransit: 0,
    turnover: 60,
    targetQty: null,
    targetValue: null,
  };
  const summary = summarizeCustomerInventory([row, { ...row, quantity: 300, normalRatio: 100 }]);
  assert.equal(summary.normalRatio, null);
  assert.equal(summary.turnover, 120);
  const partial = summarizeCustomerInventory([row, { ...row, quantity: null }]);
  assert.equal(partial.quantity, 100);
  assert.equal(partial.missingQuantityCount, 1);
  assert.equal(summarizeCustomerInventory([]).totalValue, null);
});

test('headquarters retains totals when an individual customer is negative or missing', () => {
  const row = {
    quantity: 200,
    value: 4,
    sales30: 100,
    normalRatio: 100,
    inTransit: 0,
    turnover: 60,
  };
  const result = summarizeCustomerInventory([
    row,
    { ...row, quantity: -20, value: -1, normalRatio: null, turnover: null },
    { ...row, quantity: null, value: null, sales30: null, normalRatio: null, turnover: null },
  ]);
  assert.equal(result.quantity, 180);
  assert.equal(result.totalValue, 3);
  assert.equal(result.anomalous, false);
  assert.equal(result.abnormalCustomerCount, 1);
  assert.equal(result.normalRatio, null);
  assert.equal(result.turnover, 60);
});
const application = await readFile(
  new URL('../prototypes/inventory-customer/application.js', import.meta.url),
  'utf8',
);

test('customer inventory maps complete source facts and explicit derived metrics', () => {
  const result = mapCustomerInventoryRows([
    {
      snapshot_date: '2026-10-17',
      cust_code: 'C1',
      cust_name: '客户一',
      region_name: '华中',
      province_name: '河南',
      stock_qty: '300',
      stock_amt: '60000',
      sales_qty_30days: '150',
      in_transit_qty: '30',
      transit_coverage: '3',
      structure_score: '90',
      normal_stock_qty: '270',
      large_date_qty: '30',
      large_date_coverage: '3',
      no_sales_sku: '2',
      sku_rows: '3',
      stock_coverage: '3',
      value_coverage: '3',
      sales_coverage: '3',
      normal_coverage: '3',
      dealer_receive_addr: JSON.stringify([
        { cust_name: '客户一（郑州市金水区）卸货地' },
        { cust_name: '客户一（洛阳市涧西区）卸货地' },
        { cust_name: '客户一（郑州市二七区）卸货地' },
      ]),
    },
  ]);
  assert.equal(result.snapshot, '2026-10-17');
  assert.deepEqual(
    {
      quantity: result.rows[0].quantity,
      value: result.rows[0].value,
      targetValue: result.rows[0].targetValue,
      targetQty: result.rows[0].targetQty,
      normalRatio: result.rows[0].normalRatio,
      turnover: result.rows[0].turnover,
    },
    { quantity: 300, value: 6, targetValue: null, targetQty: null, normalRatio: 90, turnover: 66 },
  );
  assert.equal(result.rows[0].largeDateQty, 30);
  assert.equal(result.rows[0].largeDateRatio, 10);
  assert.equal(result.rows[0].largeDateEstimated, false);
  assert.equal(result.rows[0].structureScore, 90);
  assert.deepEqual(result.rows[0].cities, ['洛阳市', '郑州市']);
});

test('authoritative large-date quantities preserve anomalies and never fall back to estimates', () => {
  const base = {
    snapshot_date: '2026-10-20',
    cust_code: 'C1',
    cust_name: '客户',
    sku_rows: 1,
    stock_coverage: 1,
    stock_qty: 100,
    large_date_coverage: 1,
    large_date_qty: 20,
    normal_stock_qty: 100,
  };
  const rows = mapCustomerInventoryRows([
    base,
    { ...base, stock_qty: 300, large_date_qty: 30 },
    { ...base, large_date_qty: 101, large_date_invalid_sku: 1 },
    { ...base, large_date_qty: -1, large_date_invalid_sku: 1 },
    { ...base, large_date_qty: null, large_date_coverage: 0 },
    { ...base, stock_qty: -10 },
    { ...base, stock_qty: 0, large_date_qty: 0 },
  ]).rows;
  assert.deepEqual(
    rows.map((row) => row.largeDateQty),
    [20, 30, 101, -1, null, 20, 0],
  );
  assert.equal(rows[0].normalRatio, 80);
  assert.equal(rows[2].largeDateRatio, null);
  assert.equal(rows[2].normalRatio, null);
  assert.match(rows[2].largeDateMessage, /不一致/);
  assert.equal(rows[4].largeDateQty, null);
  const summary = summarizeCustomerInventory(rows);
  assert.equal(summary.largeDateQty, 170);
  assert.equal(summary.largeDateRatio, (170 / 590) * 100);
  assert.equal(summary.largeDateCoverageCount, 6);
  assert.equal(summary.largeDateRatioCoverageCount, 6);
  assert.equal(summary.largeDateInvalidCount, 3);
  assert.equal(rows[6].largeDateRatio, null);
  assert.equal(summary.largeDateEstimated, false);
});

test('delivery-city parsing preserves multi-city membership and rejects malformed values', () => {
  assert.deepEqual(parseDeliveryCities('not-json'), []);
  assert.deepEqual(
    parseDeliveryCities(JSON.stringify([{ cust_name: '客户（南充市西充县）卸货地' }])),
    ['南充市'],
  );
});

test('latest metric thresholds, risk totals and arithmetic structure rollup', () => {
  assert.deepEqual(
    [80, 79.9, 65, 64.9, null].map((structureScore) => structureStatus({ structureScore })),
    ['healthy', 'attention', 'attention', 'risk', 'unknown'],
  );
  assert.equal(largeDateStatus({ largeDateRatio: 5 }), 'attention');
  const base = {
    quantity: 100,
    value: 2,
    sales30: 50,
    inTransit: 10,
    turnover: 66,
    structureScore: 90,
    largeDateRatio: 0,
    largeDateQty: 0,
  };
  const rows = [
    base,
    { ...base, structureScore: 70, quantity: 500 },
    { ...base, structureScore: 60 },
    { ...base, largeDateRatio: 5 },
    { ...base, quantity: -1 },
    { quantity: null },
  ];
  const summary = summarizeCustomerInventory(rows);
  assert.equal(summary.riskCount, 3);
  assert.equal(summary.highRiskCount, 1);
  assert.equal(summary.attentionCount, 2);
  assert.equal(summary.unknownCount, 1);
  assert.equal(summary.structureScore, 80);
  assert.equal(customerInventoryStatus({ quantity: null }), 'unknown');
  assert.match(source, /SUM\(ABS\(/);
  assert.match(source, /stock_qty \/ \(sales_qty_30days \/ 30\) < 60/);
});

test('missing transit is explicitly estimated, zero transit is formal, zero sales stays unknown', () => {
  const base = {
    snapshot_date: '2026-10-20',
    cust_code: 'C1',
    cust_name: '客户',
    sku_rows: 1,
    stock_coverage: 1,
    sales_coverage: 1,
    stock_qty: 100,
    sales_qty_30days: 300,
  };
  const rows = mapCustomerInventoryRows([
    base,
    { ...base, transit_coverage: 1, in_transit_qty: 0 },
    { ...base, sales_qty_30days: 0 },
    { ...base, transit_coverage: 1, in_transit_qty: -1 },
  ]).rows;
  assert.equal(rows[0].turnover, 10);
  assert.equal(rows[0].turnoverEstimated, true);
  assert.equal(rows[1].turnover, 10);
  assert.equal(rows[1].turnoverEstimated, false);
  assert.equal(rows[2].turnover, null);
  assert.equal(rows[3].turnover, null);
});

test('customer inventory keeps incomplete coverage unknown instead of filling zero', () => {
  const result = mapCustomerInventoryRows([
    {
      snapshot_date: '2026-10-17',
      cust_code: 'C1',
      cust_name: '客户一',
      stock_qty: '10',
      stock_amt: '20',
      sales_qty_30days: '0',
      normal_stock_qty: '8',
      no_sales_sku: '1',
      sku_rows: '2',
      stock_coverage: '1',
      value_coverage: '2',
      sales_coverage: '1',
      normal_coverage: '2',
    },
  ]);
  assert.equal(result.rows[0].quantity, null);
  assert.equal(result.rows[0].sales30, null);
  assert.equal(result.rows[0].turnover, null);
  assert.equal(result.rows[0].targetValue, null);
});

test('customer page and installed resource declarations use the confirmed formal Consumer', async () => {
  const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
  const plugin = await json('../prototypes/inventory-customer/plugin.json');
  const page = await json('../prototypes/inventory-customer/page.json');
  const base = '../../dsh-agent-manage/business-resources/inventory-customer/';
  const mcp = await json(base + 'mcp.json');
  const prompt = await json(base + 'prompt.json');
  const capability = await json(base + 'capability.json');
  assert.equal(plugin.id, 'inventory-customer');
  for (const consumer of [
    plugin.gea.consumerCode,
    page.consumerCode,
    mcp.consumer.consumerCode,
    prompt.consumerCode,
    capability.data.consumerCode,
  ]) {
    assert.equal(consumer, 'customer_inventory');
  }
});

test('customer inventory SQL is fixed to the granted latest snapshot table', () => {
  assert.match(source, /SUM\(big_final_qty\)/);
  assert.match(source, /COUNT\(big_final_qty\)/);
  assert.doesNotMatch(source, /over120_final_qty/);
  assert.match(source, /FROM agents_scm_cust_jxc_ai_daliy_d/);
  assert.match(source, /agents_dim_dealer_data_d/);
  assert.match(source, /SELECT MAX\(stat_date\)/);
  assert.doesNotMatch(source, /\+\s*request|INSERT|UPDATE|DELETE/i);
});

test('customer inventory role views use live hierarchy and expose unavailable sales scope', () => {
  assert.ok(application.includes('\\u6A21\\u62DF\\u67E5\\u770B\\u89D2\\u8272'));
  assert.match(application, /r==="sales"\)return\[\]/);
  assert.ok(
    application.includes(
      '\\u9500\\u552E\\u4EE3\\u8868\\u5BA2\\u6237\\u5F52\\u5C5E\\u5F85\\u63A5\\u5165',
    ),
  );
  assert.doesNotMatch(application, /MJ=\{hq:/);
  assert.doesNotMatch(application, /N\.manager!=="\\u5F20\\u65E0\\u5FCC"/);
});

test('isolated SKU discrepancies do not block customer or city aggregates or imply risk', () => {
  const rows = mapCustomerInventoryRows([
    {
      snapshot_date: '2026-10-18',
      cust_code: 'C1',
      cust_name: '客户',
      sku_rows: 1,
      stock_coverage: 1,
      stock_qty: 1000,
      large_date_coverage: 1,
      large_date_qty: 60,
      large_date_invalid_sku: 1,
    },
  ]).rows;
  assert.equal(rows[0].largeDateRatio, 6);
  assert.equal(rows[0].normalRatio, 94);
  assert.equal(rows[0].largeDateInvalid, false);
  const summary = summarizeCustomerInventory(rows);
  assert.equal(summary.largeDateRatio, 6);
  assert.equal(summary.largeDateSkuIssueCount, 1);
  assert.equal(
    customerInventoryStatus({ ...rows[0], largeDateRatio: 1, structureScore: 90 }),
    'healthy',
  );
});

test('customer Agent manifest registers the page bridge and all five supplied Skills in profile order', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../prototypes/inventory-customer/plugin.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(manifest.skills, [
    'skills/customer/SKILL.md',
    'skills/customer-inventory-age-risk/SKILL.md',
    'skills/customer-inventory-change/SKILL.md',
    'skills/customer-inventory-diagnosis/SKILL.md',
    'skills/customer-overstock-control/SKILL.md',
    'skills/customer-stockout-replenishment/SKILL.md',
  ]);
});
