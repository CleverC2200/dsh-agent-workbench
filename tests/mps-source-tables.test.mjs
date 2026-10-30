import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createQueryClient, makeRequest } from '../business/shared/configured-query-client.mjs';
const savedWindow = globalThis.window;
globalThis.window = { addEventListener() {}, parent: { postMessage() {} } };
const {
  forecastRows,
  forecastDimensions,
  deliveryRows,
  deliveryColumns,
  sourceTableParameters,
  planRateRows,
} = await import('../static/mps/source/source-tables.js');
if (savedWindow === undefined) delete globalThis.window;
else globalThis.window = savedWindow;
const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const forecast = (extra = {}) => ({
  stat_month: '2026-12',
  belong_base: '基地甲',
  material_code: '001',
  material_name: '产品甲',
  current_month_forecast_qty: '0.000',
  next_month_forecast_qty: null,
  source_rows: 1,
  ...extra,
});

test('forecast fixes one source batch across a year boundary, preserves zero and missing, and never sums horizons', () => {
  const rows = forecastRows([forecast()], '2026-12');
  assert.deepEqual(
    rows.map((r) => [r['月份'], r['数量'], r['预测批次']]),
    [
      ['2026-12', 0, '2026-12'],
      ['2027-01', '', '2026-12'],
    ],
  );
  assert.equal(rows[1]['缺项原因'], '预测数量缺失');
  assert.equal(rows[0]['源当月预测数量'], '0.000');
  assert.throws(() => forecastRows([forecast({ stat_month: '2026-11' })], '2026-12'), /批次/);
  assert.throws(
    () => forecastRows([forecast({ current_month_forecast_qty: 'NaN' })], '2026-12'),
    /数值/,
  );
  assert.throws(
    () =>
      forecastRows([forecast({ current_month_forecast_qty: '999999999999999.999' })], '2026-12'),
    /精度/,
  );
});
test('group aggregates retain source counts while conflicting group summaries stay unavailable', () => {
  const same = forecastRows([forecast({ source_rows: 2 })], '2026-12');
  assert.equal(same[0]['数量'], 0);
  assert.equal(same[0]['源记录数'], 2);
  assert.equal(same[1]['数量'], '');
  const conflicting = forecastRows(
    [forecast(), forecast({ material_name: '另一名称', current_month_forecast_qty: 8 })],
    '2026-12',
  );
  assert(conflicting.every((r) => r['数量'] === ''));
  assert.equal(conflicting[2]['源当月预测数量'], 8);
  assert(forecastRows([forecast({ belong_base: null })], '2026-12').every((r) => r['数量'] === ''));
  assert(
    forecastRows([forecast({ belong_base: '   ' })], '2026-12').every((r) => r['数量'] === ''),
  );
  const products = [{ 基地: '', 产品编码: '10001', 大类: '汤圆', 系列: '系列甲', 物料组: '001' }];
  assert.equal(forecastDimensions(same, products)[0]['大类'], '汤圆');
  assert.equal(forecastDimensions(same, [{ ...products[0], 物料组: '1' }])[0]['大类'], '');
  assert.equal(
    forecastDimensions(same, [...products, { ...products[0], 大类: '饺子' }])[0]['大类'],
    '',
  );
});
test('delivery keeps separate source ratios, precise decimals, nulls and duplicate evidence without recalculation', () => {
  const raw = Object.fromEntries(Object.keys(deliveryColumns).map((k) => [k, null]));
  Object.assign(raw, {
    dimension_type: '业务原值',
    stat_month: 'Dec-26',
    belong_base: '基地甲',
    dimension_value: '001',
    dimension_act_dl_qty: '0.000000',
    national_dimension_fiscal_act_dl_qty: '123456789012345678901.123456',
    dimension_act_dl_qty_rate: '0.000000000001',
    year_on_year_rate: '-0.125000000000',
    source_rows: 2,
  });
  const [row] = deliveryRows([raw], '2026-12');
  assert.equal(row['月发货数量'], '0.000000');
  assert.equal(row['全国维度财年发货数量'], raw.national_dimension_fiscal_act_dl_qty);
  assert.equal(row['同比增长率'], '-0.125000000000');
  assert.equal(row['环比增长率'], '');
  assert.equal(row['粒度状态'], '业务键重复，仅保留源值');
  assert.throws(() => deliveryRows([raw], '2027-01'), /月份/);
});
test('new table queries bind month parameters and read all pages with required columns and unchanged counts', async () => {
  const columns = config.queries['forecast.detail'].columns;
  const records = Array.from({ length: 201 }, (_, i) =>
    forecast({ material_code: String(i).padStart(3, '0') }),
  );
  const calls = [];
  let truncate = false;
  const client = createQueryClient(config, async (_request, { queryId, values }) => {
    calls.push([queryId, values]);
    return {
      rows: queryId.endsWith('.count')
        ? [{ total: records.length }]
        : records.slice(values.offset, values.offset + (truncate ? 1 : values.page_size)),
      returnedColumns: queryId.endsWith('.count') ? ['total'] : columns,
      configVersion: 'one',
    };
  });
  const options = {
    keyFields: config.queries['forecast.detail'].grain,
    requiredColumns: columns,
  };
  const result = await client.readAll(
    'forecast.detail',
    {
      ...sourceTableParameters('forecast', '2026-12'),
      page_size: 200,
      offset: 0,
    },
    options,
  );
  assert.equal(forecastRows(result.rows, '2026-12').length, 402);
  assert.deepEqual(
    calls.filter(([id]) => id.endsWith('.detail')).map(([, values]) => values.offset),
    [0, 200],
  );
  truncate = true;
  await assert.rejects(
    client.readAll(
      'forecast.detail',
      {
        ...sourceTableParameters('forecast', '2026-12'),
        page_size: 200,
        offset: 0,
      },
      options,
    ),
    /分页与计数/,
  );
  const request = makeRequest(config, 'delivery.detail', {
    ...sourceTableParameters('delivery', '2026-12'),
    page_size: 200,
    offset: 0,
  });
  assert.deepEqual(request.parameters.gea_p1, ['2026-12', 'Dec-26', '2026年12月', '202612']);
  const forecastRequest = makeRequest(config, 'forecast.detail', {
    ...sourceTableParameters('forecast', '2026-12'),
    page_size: 200,
    offset: 0,
  });
  assert(forecastRequest.parameters.gea_p1.includes('2026-12'));
  assert(forecastRequest.parameters.gea_p1.includes('2026/12'));
  assert(forecastRequest.parameters.gea_p1.includes('2026/12/1'));
  assert.match(forecastRequest.sql, /stat_month IN \(:gea_p1\)/);
  assert.match(request.sql, /FROM agents_scm_base_dimension_delivery_mi/);
  assert(!request.sql.includes('2026-12'));
});

test('published slash and compact source months normalize without merging duplicate forecast business keys', () => {
  const rows = forecastRows([forecast({ stat_month: '2026/12/1' })], '2026-12');
  assert.equal(rows[0]['月份'], '2026-12');
  assert.equal(rows[0]['源批次月份'], '2026/12/1');
  const duplicate = forecastRows([forecast(), forecast({ stat_month: '2026/12/1' })], '2026-12');
  assert(duplicate.every((row) => row['数量'] === '' && row['缺项原因'].includes('重复')));
  const raw = Object.fromEntries(Object.keys(deliveryColumns).map((k) => [k, null]));
  Object.assign(raw, {
    stat_month: '202612',
    dimension_type: '基地+产品',
    belong_base: '甲',
    dimension_value: '001',
    source_rows: 1,
  });
  assert.equal(deliveryRows([raw], '2026-12')[0]['月份'], '2026-12');
  assert.throws(() => forecastRows([forecast({ stat_month: '2026/12/2' })], '2026-12'), /批次/);
});

test('delivery accepts finite small numeric ratios while preserving precise decimal strings', () => {
  const raw = Object.fromEntries(Object.keys(deliveryColumns).map((k) => [k, null]));
  Object.assign(raw, {
    stat_month: '202612',
    dimension_type: '基地+产品',
    belong_base: '甲',
    dimension_value: '001',
    source_rows: 1,
    dimension_act_dl_qty_rate: 1e-7,
    year_on_year_rate: -1e-7,
    month_on_month_rate: '0.000000000001',
  });
  const [row] = deliveryRows([raw], '2026-12');
  assert.equal(row['月发货占财年比例'], 1e-7);
  assert.equal(row['同比增长率'], -1e-7);
  assert.equal(row['环比增长率'], '0.000000000001');
  for (const value of [Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '1e-7'])
    assert.throws(
      () => deliveryRows([{ ...raw, dimension_act_dl_qty_rate: value }], '2026-12'),
      /数值/,
    );
});

test('forecast classification explains missing and ambiguous group members without erasing quantities', () => {
  const rows = forecastRows(
    [forecast({ current_month_forecast_qty: 8, next_month_forecast_qty: null })],
    '2026-12',
  );
  const [missing, missingQuantity] = forecastDimensions(rows, [{ 产品编码: '1' }]);
  assert.equal(missing['数量'], 8);
  assert.equal(missing['大类'], '');
  assert.match(missing['缺项原因'], /未匹配主数据/);
  assert.equal(missingQuantity['数量'], '');
  assert.match(missingQuantity['缺项原因'], /预测数量缺失.*未匹配主数据/);
  const [ambiguous] = forecastDimensions(rows, [
    { 产品编码: '10001', 物料组: '001', 大类: '汤圆' },
    { 产品编码: '10002', 物料组: '001', 大类: '饺子' },
  ]);
  assert.equal(ambiguous['数量'], 8);
  assert.equal(ambiguous['大类'], '');
  assert.match(ambiguous['缺项原因'], /多个源值/);
});

test('plan share parameters use natural current and next month across years', () => {
  assert.deepEqual(sourceTableParameters('plan-rate', '2026-12'), { months: ['202612', '202701'] });
});

test('plan shares preserve nationwide null bases, zero and precise source ratios', () => {
  const row = {
    dimension_type: '大类+物料组',
    stat_month: '202612',
    belong_base: null,
    category_name: '汤圆',
    material_group_name: '物料组甲',
    material_code: null,
    product_name: null,
    dimension_allnum: 0,
    parent_allnum: 100,
    dimension_rate: '0.000000000000',
  };
  const [result] = planRateRows([row], '2026-12');
  assert.equal(result['基地'], '');
  assert.equal(result['月份'], '2026-12');
  assert.equal(result['当前维度计划量'], 0);
  assert.equal(result['计划占比'], '0.000000000000');
  assert.throws(() => planRateRows([{ ...row, stat_month: '202611' }], '2026-12'), /月份/);
});
