import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { mpsPage } from './helpers/mps-page.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const record = (id, values) => ({
  ...Object.fromEntries(config.queries[id].columns.map((key) => [key, null])),
  ...values,
});
const products = [
  record('products.detail', {
    product_item: 'G',
    material_code: '',
    material_name: '物料组甲',
    source_rows: 1,
  }),
  ...['A', 'B'].map((code) =>
    record('products.detail', {
      product_item: 'G',
      material_code: code,
      material_name: '产品' + code,
      sub_category: '汤圆',
      series: '系列甲',
      responsible_item: '汤圆',
      source_rows: 1,
      replacement_material_code: code === 'A' ? 'REPLACE' : null,
      replacement_product: code === 'A' ? '源替换品' : null,
    }),
  ),
];
function fixture({ queryId, parameters }) {
  let rows = [];
  if (queryId.startsWith('products.')) rows = products;
  if (queryId === 'facts.report')
    rows = ['A', 'B'].map((code, index) =>
      record(queryId, {
        'agents_sales_plan_demand_m.belong_base': '郑州',
        'agents_sales_plan_demand_m.material_code': code,
        'agents_sales_plan_demand_m.plannum_total': index ? 30 : 10,
        'agents_sales_plan_demand_m.allnum_total': index ? 60 : 20,
      }),
    );
  if (queryId === 'facts.history')
    rows = ['A', 'B'].map((code) =>
      record(queryId, {
        'agents_scm_cust_deliv_daily_di.belong_base': '郑州',
        'agents_scm_cust_deliv_daily_di.material_code': code,
        'agents_scm_cust_deliv_daily_di.material_name': '产品' + code,
        'agents_scm_cust_deliv_daily_di.product_categ_name': '汤圆',
        'agents_scm_cust_deliv_daily_di.material_group_name': '物料组甲',
        'agents_scm_cust_deliv_daily_di.act_dl_qty_total': 20,
        'agents_scm_cust_deliv_daily_di.act_dl_qty_all_total': 21,
      }),
    );
  if (queryId.startsWith('delivery.'))
    rows = [
      record('delivery.detail', {
        dimension_type: '基地+大类',
        stat_month: parameters.months[0].replace('-', ''),
        belong_base: '郑州',
        dimension_value: '汤圆',
        dimension_act_dl_qty: 100,
        last_year_stat_month: '202210',
        last_year_dimension_act_dl_qty: 90,
        year_on_year_rate: '0.111111111111',
        last_month_stat_month: '202309',
        last_month_dimension_act_dl_qty: 80,
        month_on_month_rate: '0.25',
        national_dimension_fiscal_act_dl_qty: 1000,
        dimension_act_dl_qty_rate: '0.1',
        fiscal_year: '源财年',
        source_rows: 1,
      }),
    ];
  const count = queryId.endsWith('.count');
  return {
    rows: count
      ? [{ total: rows.length }]
      : rows.slice(
          parameters.offset ?? 0,
          (parameters.offset ?? 0) + (parameters.page_size ?? 200),
        ),
    returnedColumns: count ? ['total'] : config.queries[queryId].columns,
    rejectedColumns: [],
    configVersion: 'ready-fixture',
    totalRowCount: rows.length,
    offset: parameters.offset ?? 0,
    hasMorePages: (parameters.offset ?? 0) + (parameters.page_size ?? 200) < rows.length,
    dataStatus: queryId === 'facts.history' ? 'partial' : 'ok',
    warnings: queryId === 'facts.history' ? [{ code: 'METRIC_VALUE_UNAVAILABLE' }] : [],
  };
}
async function version(frame, month = '2026-10') {
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await dialog.getByLabel('评估月份', { exact: true }).fill(month);
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
}

test('product replacement fields populate old-product columns and the list omits base names', async (t) => {
  const { frame } = await mpsPage(t, config, fixture);
  const section = frame.getByRole('region', { name: '产品明细', exact: true });
  await expect(section.getByRole('columnheader', { name: '基地名称', exact: true })).toHaveCount(0);
  await expect(section).not.toContainText('源标签：汤圆');
  await expect(section.getByRole('button', { name: /^查看源字段/ })).toHaveCount(0);
  await expect(
    section.getByRole('columnheader', { name: '物料组名称', exact: true }),
  ).toBeVisible();
  const parent = section.locator('tbody tr').filter({ hasText: '物料组甲' });
  await expect(parent).toContainText('汤圆');
  await section.getByRole('button', { name: '查看物料组 G 的2个SKU', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '产品源字段与物料组SKU', exact: true });
  await expect(dialog).toContainText('源替换物料编码');
  await expect(dialog).toContainText('REPLACE');
  await expect(dialog).toContainText('产品A');
  await expect(dialog).toContainText('产品B');
  await expect(dialog).toContainText('对应老品编码、老品名称分别取替换物料编码、替换品');
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  const child = section
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: 'A', exact: true }) });
  await expect(child.locator('td').nth(6)).toHaveText('REPLACE');
  await expect(child.locator('td').nth(7)).toHaveText('源替换品');
});

test('first-step shares reuse the existing computation while final category demand remains unavailable', async (t) => {
  const { page, frame } = await mpsPage(t, config, fixture);
  await version(frame);
  const region = frame.getByRole('region', { name: '系统派生口径参数' });
  const card = region
    .locator('section')
    .filter({ has: frame.getByRole('heading', { name: '销售提报占比', exact: true }) });
  await expect(card).toContainText('2 / 2 条可计算');
  await card.getByRole('button', { name: '预览', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '销售提报占比 · 源值核对', exact: true });
  await expect(dialog).toContainText('25%');
  await expect(dialog).toContainText('75%');
  await expect(dialog).toContainText('50%');
  const waiting = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载源值', exact: true }).click();
  const csv = await readFile(await (await waiting).path(), 'utf8');
  assert.match(csv, /,0\.25,0\.5,/);
  assert.doesNotMatch(csv, /25%/);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(frame.getByRole('region', { name: '大类预估需求数量', exact: true })).toContainText(
    '待定',
  );
});

test('source checks fetch explicit months and use DMS versions while an unrelated missing income does not hide shipment quantities', async (t) => {
  const { frame, calls } = await mpsPage(t, config, fixture);
  await version(frame);
  const section = frame.getByRole('region', { name: '大类基础指标源值核对', exact: true });
  await section.getByLabel('源值核对截止月份').fill('2026-09');
  await section.getByRole('button', { name: '读取三月源值', exact: true }).click();
  const row = section
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: '汤圆', exact: true }) });
  await expect(row).toContainText('100%');
  await expect(row.locator('td').nth(1)).toHaveText('40');
  await expect(row.locator('td').nth(2)).toHaveText('120');
  await expect(row.locator('td').nth(3)).toHaveText('120');
  for (const month of ['2026-07-01', '2026-08-01', '2026-09-01'])
    assert(
      calls.some((call) => call.queryId === 'facts.report' && call.parameters.month === month),
    );
  await frame.getByLabel('提报口径', { exact: true }).selectOption('adjust');
  await expect(row.locator('td').nth(3)).toHaveText('240');
  await expect(row).toContainText('50%');
  await section.getByLabel('源值核对截止月份').fill('2026-08');
  await expect(row.locator('td').nth(2)).toHaveText('-');
  await expect(section).toContainText('不是已确认的预测基期');
});

test('three-year cards read complete historical source periods and display source ratios without computing an unconfirmed mean', async (t) => {
  const { frame, calls } = await mpsPage(t, config, fixture);
  await version(frame);
  await frame.getByRole('button', { name: '读取三年同比源值', exact: true }).click();
  const region = frame.getByRole('region', { name: '系统派生口径参数' });
  const card = region
    .locator('section')
    .filter({ has: frame.getByRole('heading', { name: '三年同比', exact: true }) });
  await expect(card).toContainText('原值已读取');
  await card.getByRole('button', { name: '预览', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '三年同比 · 源值核对', exact: true });
  for (const year of [2023, 2024, 2025]) {
    await expect(dialog).toContainText(year + '-10');
    assert(
      calls.some(
        (call) => call.queryId === 'delivery.detail' && call.parameters.months[0] === year + '-10',
      ),
    );
  }
  await expect(dialog).toContainText('0.111111111111');
  await expect(dialog).toContainText('三年均值未确认');
});

test('failed source-check refresh retracts old comparisons instead of leaving an earlier ratio visible', async (t) => {
  let deny = false;
  const { frame } = await mpsPage(t, config, (query) => {
    if (deny && query.queryId === 'facts.report') throw Error('SOURCE_READ_DENIED');
    return fixture(query);
  });
  const section = frame.getByRole('region', { name: '大类基础指标源值核对', exact: true });
  await section.getByRole('button', { name: '读取三月源值', exact: true }).click();
  await expect(section).toContainText('100%');
  deny = true;
  await section.getByRole('button', { name: '读取三月源值', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('数据读取失败');
  await expect(section).not.toContainText('100%');
  const row = section
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: '汤圆', exact: true }) });
  await expect(row.locator('td').nth(2)).toHaveText('120');
  await expect(row.locator('td').nth(3)).toHaveText('-');
});

test('a failed historical year does not hide the two successfully read years', async (t) => {
  const { frame } = await mpsPage(t, config, (query) => {
    if (query.queryId.startsWith('delivery.') && query.parameters.months[0] === '2023-10')
      throw Error('HISTORICAL_YEAR_UNAVAILABLE');
    return fixture(query);
  });
  await version(frame);
  await frame.getByRole('button', { name: '读取三年同比源值', exact: true }).click();
  const card = frame
    .getByRole('region', { name: '系统派生口径参数' })
    .locator('section')
    .filter({ has: frame.getByRole('heading', { name: '三年同比', exact: true }) });
  await expect(card).toContainText('部分原值已读取');
  await card.getByRole('button', { name: '预览', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '三年同比 · 源值核对', exact: true });
  await expect(dialog).toContainText('2024-10');
  await expect(dialog).toContainText('2025-10');
  await expect(dialog).toContainText('共2条');
});

test('identity reset cancels pending source checks even when the replacement draft reuses local-1', async (t) => {
  let release,
    held = false,
    completed = false;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  t.after(() => release());
  const { frame } = await mpsPage(t, config, async (query) => {
    if (!held && query.queryId === 'facts.history' && query.parameters.month === '2026-07-01') {
      held = true;
      await pending;
      completed = true;
    }
    return fixture(query);
  });
  const section = frame.getByRole('region', { name: '大类基础指标源值核对', exact: true });
  await section.getByLabel('源值核对截止月份').fill('2026-09');
  await section.getByRole('button', { name: '读取三月源值', exact: true }).click();
  await expect.poll(() => held).toBe(true);
  await frame
    .locator('body')
    .evaluate(() => window.dispatchEvent(new Event('gea-identity-changed')));
  release();
  await expect.poll(() => completed).toBe(true);
  await expect(section).toContainText('尚未读取核对窗口');
  await expect(section).not.toContainText('100%');
});

test('identity and page lifecycle resets reload first-page sources when the draft keeps the same id and month', async (t) => {
  const { frame, calls } = await mpsPage(t, config, fixture);
  const productsSection = frame.getByRole('region', { name: '产品明细', exact: true });
  await expect(productsSection).toContainText('3 个产品');
  const sources = [
    'products.detail',
    'annual.summary.count',
    'facts.report',
    'facts.history',
    'forecast.count',
    'delivery.detail',
  ];
  for (const event of ['gea-identity-changed', 'gea-session-changing', 'pagehide']) {
    await expect
      .poll(() => sources.filter((queryId) => !calls.some((call) => call.queryId === queryId)))
      .toEqual([]);
    const before = new Map(
      sources.map((queryId) => [queryId, calls.filter((call) => call.queryId === queryId).length]),
    );
    await frame
      .locator('body')
      .evaluate((_element, name) => window.dispatchEvent(new Event(name)), event);
    await expect(productsSection).toContainText('3 个产品', { timeout: 1500 });
    await expect
      .poll(() => ({
        event,
        missing: sources.filter(
          (queryId) =>
            calls.filter((call) => call.queryId === queryId).length <= before.get(queryId),
        ),
      }))
      .toEqual({ event, missing: [] });
  }
});

test('first-page sources resume when the business channel reconnects after an identity change', async (t) => {
  const { page, frame } = await mpsPage(t, config, fixture);
  const section = frame.getByRole('region', { name: '产品明细', exact: true });
  await expect(section).toContainText('3 个产品');
  await page.evaluate(() => window.mpsPort.postMessage({ type: 'identity-changed' }));
  await expect(section).toContainText('0 个产品');
  await page.evaluate(() =>
    window.mpsPort.postMessage({
      type: 'context',
      context: { session: 'fixture-restored-session', plugin: 'inventory-mps' },
    }),
  );
  await expect(section).toContainText('3 个产品', { timeout: 1500 });
});

test('source-check displays round quantities but its download keeps monthly decimal values and version context', async (t) => {
  const { page, frame } = await mpsPage(t, config, (query) => {
    const result = fixture(query);
    if (query.queryId === 'facts.history')
      result.rows.forEach((row, index) => {
        row['agents_scm_cust_deliv_daily_di.act_dl_qty_total'] = index ? 20.5 : 20.25;
      });
    return result;
  });
  const section = frame.getByRole('region', { name: '大类基础指标源值核对', exact: true });
  await section.getByRole('button', { name: '读取三月源值', exact: true }).click();
  const row = section
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: '汤圆', exact: true }) });
  await expect(row.locator('td').nth(1)).toHaveText('41');
  const waiting = page.waitForEvent('download');
  await section.getByRole('button', { name: '下载源值核对', exact: true }).click();
  const csv = await readFile(await (await waiting).path(), 'utf8');
  assert.match(csv, /评估版本,评估月份,源月份/);
  assert.match(csv, /,汤圆,月初数量,40\.75,40,40\.75,40,/);
});
