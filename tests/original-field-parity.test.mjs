import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const configs = Object.fromEntries(
  await Promise.all(
    ['fc', 'qll', 'aqkc', 'dealer'].map(async (a) => [
      a,
      JSON.parse(await readFile(`business/inventory-${a}/sql.config.json`, 'utf8')),
    ]),
  ),
);
const view = (a, id) => configs[a].sourceViews.views.find((v) => v.id === id);
const fields = (a, id) => view(a, id).columns.map((c) => c.field);
test('the 37 replenishment business columns retain their order with explicit new-source labels', async () => {
  const original = JSON.parse(await readFile('tests/fixtures/original-fc-columns.json', 'utf8'));
  const actual = view('fc', 'replenishment').columns.map((c) => c.label);
  assert.deepEqual(
    actual.slice(2, 39),
    original.map(
      ([field, label]) =>
        ({
          forecastTurnoverDays: '测算可供天数',
          preparingQty: '当前待收货需求',
          safetyDays: '目标覆盖天数',
          forecastDailyShipment: '次月日均出货计划（件）',
          planSourceLabel: '取数来源',
          currentOutboundQty: '源月出货计划',
          currentTransferQty: '源月调拨计划',
          transferPendingQty: '当前调拨备单',
          transferShippedQty: '当前调拨在途',
          safetyStockGapQty: '目标库存差异量',
        })[field] ?? label,
    ),
  );
});
test('dealer source values are displayed, including tag, specification, sales amount and normal inventory', () => {
  for (const id of ['sku-stock', 'shortage-stock', 'expiry'])
    for (const field of [
      'tag',
      'specification',
      'product_series',
      'sales30_amount',
      'normal_inventory',
      'sales7_daily',
      'sales30_daily',
      'stock_days',
    ]) {
      const c = view('dealer', id).columns.find((c) => c.field === field);
      assert.ok(c, `${id}/${field}`);
      assert.notEqual(c.unavailable, true);
    }
  for (const id of ['customer-stock', 'category-stock'])
    assert.ok(fields('dealer', id).includes('normal_inventory'));
});
test('full-chain keeps target days, share, snapshot, layer and source age distinct', () => {
  for (const id of ['category', 'organization'])
    for (const f of [
      'matched_target_days',
      'inventory_share_pct',
      'warehouse_age',
      'health_date',
      'stock_date',
      'layer_label',
    ])
      assert.ok(fields('qll', id).includes(f));
  assert.equal(
    view('qll', 'fulfillment-path').columns.find((c) => c.field === 'fulfillment_rate').format,
    'percent',
  );
  for (const id of ['factory-overview', 'branch-overview'])
    assert.ok(configs.qll.overviewViewIds.includes(id));
});
test('base age original columns map to batch measures and retain the average/max distinction', () => {
  const v = view('aqkc', 'age-structure');
  const columns = Object.fromEntries(v.columns.map((c) => [c.field, c]));
  const expected = {
    average_age: 'average_age',
    max_age: 'max_age',
    missing_age0_30: 'age0_30',
    missing_age31_40: 'age31_40',
    missing_age41_60: 'age41_60',
    missing_age60: 'age60_plus',
    missing_future7: 'future7',
    missing_future14: 'future14',
  };
  const returned = configs.aqkc.queries[v.queryId].resultColumns;
  for (const [field, measure] of Object.entries(expected)) {
    assert.equal(columns[field].valueField, measure);
    assert.notEqual(columns[field].unavailable, true);
    assert.ok(returned.includes(measure), measure);
  }
  assert.equal(columns.average_age.label, '平均货龄（天）');
  assert.equal(columns.max_age.label, '最大货龄（天）');
  assert.ok(fields('aqkc', 'health').includes('warehouseid'));
});
test('real count columns may not accidentally be hidden as missing source columns', () => {
  for (const [a, c] of Object.entries(configs))
    for (const v of c.sourceViews.views) {
      const returned = c.queries[v.queryId]?.resultColumns ?? [];
      for (const col of v.columns)
        if (returned.includes(col.field))
          assert.notEqual(col.unavailable, true, `${a}/${v.id}/${col.field}`);
    }
});
test('the full APS dashboard is directly reachable and preserves its production observation', async () => {
  const s = await readFile('business/inventory-apsplan/source/app/workbench-app.tsx', 'utf8');
  assert.match(s, /aria-label="产销工作区"/);
  assert.match(s, />\s*产销协同看板\s*<\/button>/);
  assert.match(s, /productionOutputObservation\(productionSection\.rows\)/);
  assert.match(s, /value: formatNumber\(productionObservation\.value\)/);
  assert.match(s, /status: '有效范围'/);
});
