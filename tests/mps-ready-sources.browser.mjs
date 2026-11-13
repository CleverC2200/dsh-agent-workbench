import {
  beginAdjustment,
  saveAdjustment,
  adjustCategory,
  openCategoryCalculation,
} from './helpers/mps-edit.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, copyFile } from 'node:fs/promises';
import * as XLSX from 'xlsx-republish';
import { expect } from '@playwright/test';
import { mpsPage } from './helpers/mps-page.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const record = (id, values) => ({
  ...Object.fromEntries(config.queries[id].columns.map((key) => [key, null])),
  ...values,
});
const products = [
  record('products.detail', {
    product_item: 'G',
    product_item_name: '物料组甲',
    material_code: '',
    material_name: '物料组甲',
    source_rows: 1,
  }),
  ...['A', 'B'].map((code) =>
    record('products.detail', {
      product_item: 'G',
      product_item_name: '物料组甲',
      material_code: code,
      material_name: '产品' + code,
      sub_category: '汤圆',
      series: '系列甲',
      responsible_item: '汤圆',
      source_rows: 1,
      replacement_material_code: null,
      replacement_product: null,
    }),
  ),
];
function fixture({ queryId, parameters }) {
  let rows = [];
  if (queryId.startsWith('products.')) rows = products;
  if (queryId.startsWith('facts.report'))
    rows = ['A', 'B'].map((code, index) =>
      record('facts.report', {
        belong_base: '郑州',
        material_code: code,
        plannum_total: index ? 30 : 10,
        allnum_total: index ? 60 : 20,
      }),
    );
  if (queryId.startsWith('facts.plan-quantity'))
    rows = ['A', 'B'].map((material_code, index) =>
      record('facts.plan-quantity', {
        belong_base: '郑州',
        material_code,
        plan_qty_total: index ? 30 : 10,
        known_plan_qty_total: index ? 30 : 10,
        source_plan_qty_total: index ? 30 : 10,
        source_date_start: '20260101',
        source_date_end: '20261231',
        source_rows: 1,
        missing_rows: 0,
        duplicate_rows: 0,
      }),
    );
  if (queryId === 'facts.history' || queryId === 'facts.history-annual')
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
  if (queryId.startsWith('annual-pool.'))
    rows = ['2026-11', '2026-12', '2027-01'].map((stat_month, index) =>
      record('annual-pool.detail', {
        belong_base: '全国',
        sub_category: '汤圆',
        stat_month,
        source_rows: 1,
        missing_qty: 0,
        duplicate_rows: 0,
        demand_qty: 100 * (index + 1),
      }),
    );
  if (queryId.startsWith('plan-rate.'))
    rows = ['大类+物料组', '物料组+产品', '基地+产品'].map((dimension_type, index) =>
      record('plan-rate.detail', {
        dimension_type,
        stat_month: parameters.months[0],
        belong_base: index === 2 ? '郑州' : null,
        category_name: index === 0 ? '汤圆' : null,
        material_group_name: index !== 2 ? '物料组甲' : null,
        material_code: index ? 'A' : null,
        product_name: index ? '产品A' : null,
        dimension_allnum: 25,
        parent_allnum: 100,
        dimension_rate: '0.250000000000',
      }),
    );
  if (queryId.startsWith('category-history.'))
    rows = parameters.months.map((month) =>
      record('category-history.detail', {
        dimension_type: '基地+大类',
        stat_month: month,
        belong_base: '郑州',
        dimension_value: '汤圆',
        dimension_act_dl_qty: 100,
        last_year_dimension_act_dl_qty: 90,
        last_month_dimension_act_dl_qty: 80,
        national_dimension_fiscal_act_dl_qty: 1000,
        fiscal_year: month.slice(0, 4),
        source_rows: 1,
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

test('product replacement fields retain source columns and explain combined history without base names', async (t) => {
  const { frame } = await mpsPage(t, config, (query) => {
    const result = fixture(query);
    if (query.queryId.startsWith('products.'))
      result.rows = result.rows.map((row) =>
        row.material_code === 'A'
          ? { ...row, replacement_material_code: 'REPLACE', replacement_product: '源替换品' }
          : row,
      );
    return result;
  });
  const section = frame.getByRole('region', { name: '产品明细', exact: true });
  await expect(section.getByRole('columnheader', { name: '基地名称', exact: true })).toHaveCount(0);
  await expect(section).not.toContainText('源标签：汤圆');
  await expect(section.getByRole('button', { name: /^查看源字段/ })).toHaveCount(0);
  await expect(
    section.getByRole('columnheader', { name: '物料组名称', exact: true }),
  ).toBeVisible();
  const parent = section.locator('tbody tr').filter({
    has: frame.getByRole('button', { name: '查看物料组 G 的2个SKU', exact: true }),
  });
  await expect(parent).toContainText('汤圆');
  await section.getByRole('button', { name: '查看物料组 G 的2个SKU', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '产品源字段与物料组SKU', exact: true });
  await expect(dialog).toContainText('源替换物料编码');
  await expect(dialog).toContainText('REPLACE');
  await expect(dialog).toContainText('产品A');
  await expect(dialog).toContainText('产品B');
  await expect(dialog).toContainText(
    '替换物料编码、替换品名称分别读取源表的替换编码及替换品名称。',
  );
  await expect(dialog).toContainText('历史合计量＝同基地当前SKU自身历史量＋替换品历史量×替换系数');
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  const child = section
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: 'A', exact: true }) });
  await expect(child.locator('td').nth(6)).toHaveText('REPLACE');
  await expect(child.locator('td').nth(7)).toHaveText('源替换品');
});

test('historical shares reuse the existing computation while final category demand remains unavailable', async (t) => {
  const { page, frame } = await mpsPage(t, config, fixture);
  await version(frame);
  const region = frame.getByRole('region', { name: '系统派生口径参数' });
  const card = region
    .locator('section')
    .filter({ has: frame.getByRole('heading', { name: '去年发运占比', exact: true }) });
  await expect(card).toContainText('2 / 2 条可计算');
  await card.getByRole('button', { name: '预览', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '去年发运占比 · 源值核对', exact: true });
  await expect(dialog).toContainText('100.00%');
  await expect(dialog.getByRole('columnheader', { name: '物料组编码', exact: true })).toBeVisible();
  await expect(dialog).toContainText('50.00%');
  const waiting = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载源值', exact: true }).click();
  const csv = await mpsDownloadText(await (await waiting).path());
  assert.match(csv, /,1,0\.5,/);
  assert.doesNotMatch(csv, /\d+\.\d+%/);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(
    frame
      .getByRole('region', { name: '大类预估需求数量', exact: true })
      .getByRole('columnheader', { name: /M\+4.*库存参考/ }),
  ).toBeVisible();
});

test('source checks read allnum planned pieces for the same explicit window in both evaluation modes', async (t) => {
  const { frame, calls } = await mpsPage(t, config, fixture);
  await version(frame, '2026-11');
  const section = frame.getByRole('region', { name: '大类基础指标源值核对', exact: true });
  await expect(section.getByLabel('源值核对截止月份')).toHaveValue('2026-09');
  await expect(section.getByLabel('源值核对截止月份')).toHaveAttribute('readonly', '');
  await expect(section).toContainText('2026-07 至 2026-09');
  const row = section
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: '汤圆', exact: true }) });
  await expect(row).toContainText('100.00%');
  await expect(row.locator('td').nth(1)).toHaveText('40');
  await expect(row.locator('td').nth(2)).toHaveText('120');
  await expect(row.locator('td').nth(3)).toHaveText('120');
  for (const month of ['2026-07-01', '2026-08-01', '2026-09-01'])
    assert(
      calls.some(
        (call) => call.queryId === 'facts.plan-quantity' && call.parameters.month === month,
      ),
    );
  await frame.getByLabel('提报口径', { exact: true }).selectOption('adjust');
  await expect(section.getByLabel('源值核对截止月份')).toHaveValue('2026-10');
  await expect(row.locator('td').nth(3)).toHaveText('120');
  await expect(row).toContainText('100.00%');
  await expect(section).toContainText('期初使用评估月前4至前2月');
});

test('missing recent plans preserve the independent annual estimate and disclose the monthly dependency', async (t) => {
  const { frame } = await mpsPage(t, config, (query) => {
    const result = fixture(query);
    return query.queryId === 'facts.plan-quantity'
      ? { ...result, rows: [], totalRowCount: 0, hasMorePages: false }
      : result;
  });
  await version(frame, '2026-11');
  const basic = frame.getByRole('region', { name: '大类基础指标源值核对', exact: true });
  const row = basic.locator('tbody tr').first();
  await expect(row.locator('td').nth(2)).toHaveText('120');
  await expect(row.locator('td').nth(5)).toHaveText('400');
  await expect(row.locator('td').nth(6)).toHaveText('-');
  await openCategoryCalculation(frame);
  const calculation = frame.getByRole('region', { name: '逐月测算', exact: true });
  await expect(
    frame
      .getByRole('region', { name: '大类预估需求数量', exact: true })
      .locator('.dc-demand-amount')
      .first(),
  ).toHaveAttribute('title', /2026-07至2026-09 计划量缺失或不完整/);
  await expect(calculation.locator('tbody tr').first().locator('td').nth(6)).toHaveText('40');
});

test('nationwide source checks accept base-free plan quantities while retaining missing-code, duplicate and missing-quantity anomalies', async (t) => {
  let invalid = false;
  const { page, frame } = await mpsPage(t, config, (query) => {
    const result = fixture(query);
    if (query.queryId === 'facts.plan-quantity.count' && invalid)
      return { ...result, rows: [{ total: 3 }] };
    if (query.queryId !== 'facts.plan-quantity') return result;
    result.rows.forEach((row, index) => {
      row.belong_base = '';
      row.plan_qty_total = invalid ? null : index ? 0 : 20;
      row.known_plan_qty_total = index ? 0 : 20;
      row.source_plan_qty_total = index ? 0 : 20;
      row.duplicate_rows = invalid && !index ? 2 : 0;
      row.source_rows = invalid && !index ? 2 : 1;
      row.missing_rows = invalid && index ? 1 : 0;
    });
    if (invalid)
      result.rows.push(
        record('facts.plan-quantity', {
          belong_base: '',
          material_code: '',
          plan_qty_total: 5,
          known_plan_qty_total: 5,
          source_plan_qty_total: 5,
          source_rows: 1,
          duplicate_rows: 0,
          missing_rows: 0,
        }),
      );
    return { ...result, totalRowCount: result.rows.length };
  });
  await version(frame, '2026-11');
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '有基地产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列甲,G,,\n郑州,B,产品乙,汤圆,系列甲,G,,',
    ),
  });
  const source = frame.getByRole('region', { name: '大类基础指标源值核对', exact: true });
  const category = source.locator('tbody tr').filter({
    has: frame.getByRole('cell', { name: '汤圆', exact: true }),
  });
  await expect(category.locator('td').nth(3)).toHaveText('60');
  await expect(category.locator('td').nth(6)).toHaveText('200.00%');
  await expect(category).not.toContainText('缺基地');
  const exportRows = async (name) => {
    const pending = page.waitForEvent('download');
    await source.getByRole('button', { name, exact: true }).click();
    const text = await mpsDownloadText(await (await pending).path());
    const book = XLSX.read(text, { type: 'string', raw: true });
    return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  };
  const checks = await exportRows('下载源值核对');
  assert.equal(checks.length, 3);
  assert(checks.every((row) => row['计划源数量'] === '20' && row['核对比值'] === '2'));
  const valid = (await exportRows('下载完整来源明细')).filter((row) => row['来源'] === '计划量');
  assert.equal(valid.length, 6);
  assert(valid.every((row) => !row['基地'] && !row['缺项原因']));
  assert.equal(valid.filter((row) => row['产品编码'] === 'B' && row['计划数量'] === '0').length, 3);
  invalid = true;
  await source.getByRole('button', { name: '读取三月源值', exact: true }).click();
  await expect(category.locator('td').nth(6)).toHaveText('-');
  await expect(category).toContainText('计划来源六维业务键重复');
  await expect(category).toContainText('计划数量缺失');
  const incomplete = (await exportRows('下载完整来源明细')).filter(
    (row) => row['来源'] === '计划量',
  );
  assert.equal(incomplete.length, 9);
  assert.equal(
    incomplete.filter(
      (row) =>
        !row['产品编码'] && row['原因'] === '不在当前产品池' && row['缺项原因'] === '缺物料编码',
    ).length,
    3,
  );
  assert.equal(
    incomplete.filter(
      (row) => row['产品编码'] === 'A' && !row['计划数量'] && row['重复键条数'] === '2',
    ).length,
    3,
  );
  assert.equal(
    incomplete.filter(
      (row) => row['产品编码'] === 'B' && !row['计划数量'] && row['缺数量条数'] === '1',
    ).length,
    3,
  );
});

test('three-year cards read complete historical periods and disclose the valid years of the mean', async (t) => {
  const { frame, calls } = await mpsPage(t, config, fixture);
  await version(frame);
  await frame.getByRole('button', { name: '读取三年同比源值', exact: true }).click();
  const region = frame.getByRole('region', { name: '系统派生口径参数' });
  const card = region
    .locator('section')
    .filter({ has: frame.getByRole('heading', { name: '三年同比', exact: true }) });
  await expect(card).toContainText('8 / 8 项可计算');
  await card.getByRole('button', { name: '预览', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '三年同比 · 源值核对', exact: true });
  for (const year of [2023, 2024, 2025]) {
    await expect(dialog).toContainText(year + '-10');
    assert(
      calls.some(
        (call) =>
          call.queryId === 'category-history.detail' &&
          call.parameters.months.includes(year + '10'),
      ),
    );
  }
  await expect(dialog).toContainText('1.1111111111111112');
  await expect(dialog).toContainText('等权平均');
  await expect(dialog).toContainText('2025、2024、2023（3年）');
  await expect(dialog).toContainText('2022-10');
  await expect(dialog).toContainText('3/3组 · 三年齐备');
  for (const label of ['分子年月', '分母年月', '分子数量', '分母数量', '参与平均', '排除原因'])
    await expect(dialog.getByRole('columnheader', { name: label, exact: true })).toBeVisible();
});

test('three-year yoy preview and downloads contain only yoy values and their basis', async (t) => {
  const { page, frame } = await mpsPage(t, config, fixture);
  await version(frame);
  const card = frame.locator('section.dc-parameter').filter({
    has: frame.getByRole('heading', { name: '三年同比', exact: true }),
  });
  await expect(card).toContainText('8 / 8 项可计算');
  await card.getByRole('button', { name: '预览', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '三年同比 · 源值核对', exact: true });
  for (const label of [
    '三年环比系数',
    '三年月占比',
    '上月发货数量',
    '环比增长率',
    '月发货占财年比例',
  ])
    await expect(dialog.getByRole('columnheader', { name: label, exact: true })).toHaveCount(0);
  await expect(
    dialog.getByRole('columnheader', { name: '同比有效年份', exact: true }),
  ).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载源值', exact: true }).click();
  const csv = await mpsDownloadText(await (await downloaded).path());
  assert.match(csv, /上年同期发货数量/);
  assert.doesNotMatch(csv, /上月|环比|财年/);
});

test('mom and monthly-share previews keep their own basis, filters, pagination and downloads', async (t) => {
  const scopedConfig = structuredClone(config);
  scopedConfig.queries['category-history.detail'].grain.push('belong_base');
  const { page, frame } = await mpsPage(t, scopedConfig, (query) => {
    const result = fixture(query);
    if (query.queryId === 'category-history.detail') {
      result.rows = result.rows.flatMap((row) => [
        row,
        {
          ...row,
          belong_base: '乙',
          dimension_act_dl_qty: 200,
          last_month_dimension_act_dl_qty: 50,
        },
      ]);
      result.totalRowCount = result.rows.length;
    }
    if (query.queryId === 'category-history.count') {
      result.rows[0].total *= 2;
      result.totalRowCount *= 2;
    }
    return result;
  });
  await version(frame);
  for (const [name, coefficient, basisLabel, expected, displayed, omitted] of [
    ['三年环比', '三年环比系数', '环比系数', 1.25, '1.25', /同比|占比|财年/],
    ['三年该月占比', '三年月占比', '月占比', 0.1, '10.00%', /同比|环比|上月/],
  ]) {
    const card = frame.locator('section.dc-parameter').filter({
      has: frame.getByRole('heading', { name, exact: true }),
    });
    await expect(card).toContainText('原值已读取');
    await card.getByRole('button', { name: '预览', exact: true }).click();
    const dialog = frame.getByRole('dialog', { name: name + ' · 源值核对', exact: true });
    if (name === '三年该月占比')
      await expect(dialog.getByLabel('历史指标基地', { exact: true })).toHaveValue('郑州');
    await dialog.getByLabel('历史指标基地', { exact: true }).selectOption('');
    await expect(dialog.getByRole('columnheader', { name: '同比系数', exact: true })).toHaveCount(
      0,
    );
    const headers = await dialog.getByRole('columnheader').allTextContents();
    assert.doesNotMatch(headers.join(','), omitted);
    const sourceTable = dialog.getByRole('table').filter({
      has: frame.getByRole('columnheader', { name: '维度类型', exact: true }),
    });
    await expect(sourceTable.locator('tbody tr')).toHaveCount(25);
    await dialog.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(sourceTable.locator('tbody tr')).toHaveCount(23);
    const allDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: '下载源值', exact: true }).click();
    const allBook = XLSX.read(await readFile(await (await allDownload).path()), { type: 'buffer' });
    assert.equal(XLSX.utils.sheet_to_json(allBook.Sheets[allBook.SheetNames[0]]).length, 48);
    await dialog.getByLabel('历史指标基地', { exact: true }).selectOption('郑州');
    await expect(dialog).toContainText('共24条，第1页');
    const summary = dialog.getByRole('table').filter({
      has: frame.getByRole('columnheader', { name: coefficient, exact: true }),
    });
    await expect(summary.locator('tbody tr').first()).toContainText(displayed);
    const basis = dialog.getByRole('table').filter({
      has: frame.getByRole('columnheader', { name: basisLabel, exact: true }),
    });
    await expect(basis.locator('tbody tr').first()).toContainText(String(expected));
    const resultDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: '下载指标结果', exact: true }).click();
    const resultCsv = await mpsDownloadText(await (await resultDownload).path());
    assert.match(resultCsv, new RegExp(String(expected)));
    assert.doesNotMatch(resultCsv, omitted);
    const basisDownload = page.waitForEvent('download');
    await dialog
      .getByRole('button', {
        name: name === '三年环比' ? '下载环比分子分母' : '下载月占比分子分母',
        exact: true,
      })
      .click();
    const basisBook = XLSX.read(await readFile(await (await basisDownload).path()), {
      type: 'buffer',
    });
    const basisRows = XLSX.utils.sheet_to_json(basisBook.Sheets[basisBook.SheetNames[0]]);
    assert.equal(basisRows.length, 24);
    assert.equal(basisRows[0]['分子数量'], 100);
    assert.equal(basisRows[0]['分母数量'], name === '三年环比' ? 80 : 1000);
    assert.equal(basisRows[0][basisLabel], expected);
    const sourceDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: '下载源值', exact: true }).click();
    const csv = await mpsDownloadText(await (await sourceDownload).path());
    assert.match(csv, /郑州/);
    assert.doesNotMatch(csv, /乙/);
    assert.doesNotMatch(csv, omitted);
    await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
  }
});

test('failed source-check refresh retracts old comparisons instead of leaving an earlier ratio visible', async (t) => {
  let deny = false;
  const { frame } = await mpsPage(t, config, (query) => {
    if (deny && query.queryId === 'facts.plan-quantity') throw Error('SOURCE_READ_DENIED');
    return fixture(query);
  });
  const section = frame.getByRole('region', { name: '大类基础指标源值核对', exact: true });
  await section.getByRole('button', { name: '读取三月源值', exact: true }).click();
  await expect(section).toContainText('100.00%');
  deny = true;
  await section.getByRole('button', { name: '读取三月源值', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('数据读取失败');
  await expect(section).not.toContainText('100.00%');
  const row = section
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: '汤圆', exact: true }) });
  await expect(row.locator('td').nth(2)).toHaveText('120');
  await expect(row.locator('td').nth(3)).toHaveText('-');
});

test('a failed historical year does not hide the two successfully read years', async (t) => {
  const { frame } = await mpsPage(t, config, (query) => {
    if (query.queryId.startsWith('category-history.') && query.parameters.months.includes('202310'))
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
  await expect(dialog).toContainText('共16条');
  await expect(dialog).toContainText('2025、2024（2年）');
});

test('identity reset cancels pending source checks even when the replacement draft reuses local-1', async (t) => {
  let release,
    held = false,
    completed = false;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  t.after(() => release());
  const { page, frame } = await mpsPage(t, config, async (query) => {
    if (!held && query.queryId === 'facts.history' && query.parameters.month === '2026-07-01') {
      held = true;
      await pending;
      completed = true;
    }
    return fixture(query);
  });
  const section = frame.getByRole('region', { name: '大类基础指标源值核对', exact: true });
  await expect.poll(() => held).toBe(true);
  await frame
    .locator('body')
    .evaluate(() => window.dispatchEvent(new Event('gea-identity-changed')));
  release();
  await expect.poll(() => completed).toBe(true);
  await expect(section).toHaveCount(0);
  await page.locator('iframe').evaluate((element) => element.setAttribute('src', element.src));
  await expect(section).toContainText('100.00%');
  await expect(section).not.toContainText('尚未读取核对窗口');
});

test('identity and page lifecycle resets pause sources until the owned view restores', async (t) => {
  const { page, frame, calls } = await mpsPage(t, config, fixture);
  const productsSection = frame.getByRole('region', { name: '产品明细', exact: true });
  await expect(productsSection).toContainText('3 个产品');
  const checks = frame.getByRole('region', { name: '大类基础指标源值核对', exact: true });
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
    await expect(checks).toContainText('100.00%');
    await expect(checks.getByRole('button', { name: '读取三月源值', exact: true })).toBeEnabled();
    const before = new Map(
      sources.map((queryId) => [queryId, calls.filter((call) => call.queryId === queryId).length]),
    );
    await frame.locator('body').evaluate((_element, name) => {
      window.lifecycleSqlStarts = [];
      const send = MessagePort.prototype.postMessage;
      MessagePort.prototype.postMessage = function (message, ...args) {
        if (message?.type === 'request' && message.method === 'sql')
          window.lifecycleSqlStarts.push(message.parameters.queryId);
        return send.call(this, message, ...args);
      };
      window.dispatchEvent(new Event(name));
    }, event);
    await expect(productsSection).toHaveCount(0);
    await frame
      .locator('body')
      .evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
    assert.deepEqual(await frame.locator('body').evaluate(() => window.lifecycleSqlStarts), []);
    await page.locator('iframe').evaluate((element) => element.setAttribute('src', element.src));
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
  await expect(section).toHaveCount(0);
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
  const csv = await mpsDownloadText(await (await waiting).path());
  assert.match(csv, /评估版本,评估月份,源月份/);
  assert.match(csv, /,汤圆,计划数量,40\.75,40,40\.75,40,/);
});

test('entering demand confirmation reads the three-month source check without a separate click', async (t) => {
  const { frame } = await mpsPage(t, config, fixture);
  await version(frame);
  const section = frame.getByRole('region', { name: '大类基础指标源值核对', exact: true });
  const row = section
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: '汤圆', exact: true }) });
  await expect(row.locator('td').nth(2)).toHaveText('120');
});

test('sales plan share card rebuilds three dimensions using current material-group codes', async (t) => {
  const { page, frame, calls } = await mpsPage(t, config, fixture);
  await version(frame);
  const card = frame.getByRole('region', { name: '销售提报占比', exact: true });
  await expect(card).toContainText('3 条源记录');
  await card.getByRole('button', { name: '预览', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '销售提报占比 · 当前物料组核对', exact: true });
  await expect(dialog).toContainText('100.00%');
  await expect(dialog.getByRole('columnheader', { name: '物料组编码', exact: true })).toBeVisible();
  for (const dimension of ['大类+物料组', '物料组+产品', '基地+产品']) {
    await dialog.getByLabel('计划占比维度').selectOption(dimension);
    await expect(dialog.locator('tbody')).toContainText(dimension);
  }
  const waiting = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载源值', exact: true }).click();
  const csv = await mpsDownloadText(await (await waiting).path());
  assert.match(csv, /,G,/);
  assert(!csv.includes('0.250000000000'));
  assert(!csv.includes('25.00%'));
  assert(
    calls.some(
      (call) => call.queryId === 'plan-rate.detail' && call.parameters.months.join() === '202610',
    ),
  );
});

test('confirmed category computation reaches the monthly table and keeps raw downloadable results', async (t) => {
  const { page, frame } = await mpsPage(t, config, (query) => {
    if (!query.queryId.startsWith('annual.summary') && !query.queryId.startsWith('annual-pool.'))
      return fixture(query);
    const rows = [
      ['2026-10', 100],
      ['2026-11', 100],
      ['2026-12', 150],
      ['2027-01', 300],
    ].map(([stat_month, demand_qty]) =>
      record('annual.summary', {
        belong_base: '全国',
        sub_category: '汤圆',
        stat_month,
        demand_qty,
        source_rows: 1,
        missing_qty: 0,
        duplicate_rows: 0,
      }),
    );
    return {
      rows: query.queryId.endsWith('.count') ? [{ total: rows.length }] : rows,
      returnedColumns: query.queryId.endsWith('.count')
        ? ['total']
        : config.queries[query.queryId].columns,
      configVersion: 'category-fixture',
    };
  });
  await version(frame);
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await frame.getByLabel('数据截止日').fill('2026-09-22');
  await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
    name: '环比起点.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库\n2026-09,郑州,A,产品A,汤圆,系列,组,220,10,10,10,100,200,80\n2026-09,郑州,B,产品B,汤圆,系列,组,110,0,0,0,10,20,8',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  const result = frame
    .getByRole('region', { name: '大类预估需求数量', exact: true })
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: '汤圆', exact: true }) });
  await expect(result.locator('td').nth(1).locator('.dc-demand-amount')).toHaveText('171');
  await expect(result.locator('td').nth(2).locator('.dc-demand-amount')).toHaveText('372');
  await expect(result.locator('td').nth(3).locator('.dc-demand-amount')).toHaveText('547');
  await expect(result.locator('td').nth(4).locator('.dc-demand-amount')).toHaveText('1075');
  await openCategoryCalculation(frame);
  const calculation = frame
    .getByRole('region', { name: '逐月测算', exact: true })
    .locator('tbody tr')
    .first();
  const main = frame.locator('.dc-category-demand-main');
  await expect(main.getByRole('columnheader', { name: '大类预估需求数量' })).toHaveCount(0);
  await expect(main.getByRole('columnheader', { name: '操作', exact: true })).toHaveCount(0);
  await expect(calculation.locator('td').nth(2)).toHaveText('125.00%');
  await expect(calculation.locator('td').nth(3)).toHaveText('125.00%');
  await expect(calculation.locator('td').nth(4)).toHaveText('563');
  await expect(calculation.locator('td').nth(5)).toHaveText('10.00%');
  await expect(calculation.locator('td').nth(6)).toHaveText('40');
  await expect(calculation.locator('td').nth(7)).toHaveText('301');
  await expect(main).toContainText('年度环比');
  await expect(main).toContainText('本月预估发货*环比');
  const waiting = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载测算明细', exact: true }).click();
  const downloadPath = await (await waiting).path();
  const book = XLSX.read(await readFile(downloadPath), { type: 'buffer' });
  const exported = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  const [raw] = exported;
  assert.deepEqual(
    exported.map((row) => row['两法平均量']),
    [301.25, 371.5625, 547.34375, 1074.6875],
  );
  assert.deepEqual(
    exported.map((row) => row['大类预估需求数量']),
    [170.625, 371.5625, 547.34375, 1074.6875],
  );
  assert.deepEqual(
    exported.map((row) => row['加权'] ?? null),
    [170.625, '', '', ''],
  );
  assert.equal(raw['① 环比法'], 562.5);
  assert.equal(raw['加权'], 170.625);
  assert.equal(raw['年度环比'], 1.25);
  assert(Math.abs(raw['同期平均占比'] - 0.1) < 1e-12);
  const csv = await mpsDownloadText(downloadPath);
  assert.match(csv, /170\.625/);
  assert.match(csv, /2109\.375/);
  assert.equal(raw['两法平均量'], 301.25);
  assert.equal(raw['销售提报量'], 40);
  assert.equal(raw['销售校正量'], 40);
  assert.equal(raw['统计基月'], '2026-09');
  if (process.env.MPS05_EVIDENCE_DIR) {
    await copyFile(downloadPath, `${process.env.MPS05_EVIDENCE_DIR}/monthly-demand.xlsx`);
    await page.screenshot({ path: `${process.env.MPS05_EVIDENCE_DIR}/monthly-demand.png` });
  }
  await frame.getByLabel('提报口径', { exact: true }).selectOption('adjust');
  await expect(result.locator('td').nth(1).locator('.dc-demand-amount')).toHaveText('191');
  await expect(result.locator('td').nth(3).locator('.dc-demand-amount')).toHaveText('547');
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await beginAdjustment(frame);
  await frame
    .getByRole('table', { name: '本月预估发货明细' })
    .getByLabel('全国合计 整月预估发货', { exact: true })
    .fill('900');
  await saveAdjustment(frame);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  await expect(result.locator('td').nth(1).locator('.dc-demand-amount')).toHaveText('331');
  await expect(result.locator('td').nth(3).locator('.dc-demand-amount')).toHaveText('1075');
  await adjustCategory(frame, '汤圆', '2026-11', '999', '验证环比独立');
  await expect(result.locator('td').nth(2).locator('.dc-demand-amount')).toHaveText('999');
  await expect(result.locator('td').nth(3).locator('.dc-demand-amount')).toHaveText('1075');
  const updatedDownload = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载测算明细', exact: true }).click();
  const updatedPath = await (await updatedDownload).path();
  const updatedBook = XLSX.read(await readFile(updatedPath), { type: 'buffer' });
  const updated = XLSX.utils.sheet_to_json(updatedBook.Sheets[updatedBook.SheetNames[0]]);
  assert.equal(updated[0]['本月有效预估发货'], 900);
  assert.equal(updated[0]['销售提报量'], 80);
  assert.equal(updated[0]['加权'], 331.25);
  assert.equal(updated[1]['大类预估需求数量'], 999);
  assert.equal(updated[2]['① 环比法'], 2109.375);
  if (process.env.MPS05_EVIDENCE_DIR)
    await copyFile(updatedPath, `${process.env.MPS05_EVIDENCE_DIR}/adjusted-demand.xlsx`);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await frame.getByText('预览大类计算过程', { exact: true }).click();
  const preview = frame.getByRole('region', { name: '大类计算过程预览', exact: true });
  await preview.getByLabel('计算月份').selectOption('2026-10');
  const steps = preview.getByRole('table', { name: '大类计算步骤', exact: true });
  await expect(steps.getByRole('row').filter({ hasText: '最终两次平均' })).toContainText('331.25');
  await expect(preview.getByRole('table', { name: '三年历史计算依据', exact: true })).toContainText(
    '2025-10',
  );
  await preview.getByLabel('计算月份').selectOption('2026-11');
  await expect(steps.getByRole('row').filter({ hasText: '有效大类需求' })).toContainText('999');
  await expect(steps.getByRole('row').filter({ hasText: '最终两次平均' })).toContainText('不适用');
  await preview.getByLabel('计算月份').selectOption('2026-12');
  await expect(steps.getByRole('row', { name: /^占比测算量 / })).toContainText('40');
  await expect(steps.getByRole('row', { name: /^两法平均量 / })).toContainText('1074.6875');
  await expect(steps.getByRole('row').filter({ hasText: '系统大类需求' })).toContainText(
    '1074.6875',
  );
  await expect(steps.getByRole('row').filter({ hasText: '最终两次平均' })).toContainText('不适用');
  await preview.getByLabel('计算月份').selectOption('2026-11');
  const traceWaiting = page.waitForEvent('download');
  await preview.getByRole('button', { name: '下载当前计算过程', exact: true }).click();
  const tracePath = await (await traceWaiting).path();
  const traceBook = XLSX.read(await readFile(tracePath), { type: 'buffer', raw: true });
  const trace = XLSX.utils.sheet_to_json(traceBook.Sheets[traceBook.SheetNames[0]]);
  assert.equal(Number(trace.find((row) => row['步骤'] === '有效大类需求')['数值']), 999);
  assert.equal(Number(trace.find((row) => row['步骤'] === '本月有效预估发货')['数值']), 900);
  assert.deepEqual([...new Set(trace.map((row) => row['月份']))], ['2026-11']);
  if (process.env.MPS07_EVIDENCE_DIR) {
    await copyFile(tracePath, `${process.env.MPS07_EVIDENCE_DIR}/calculation.csv`);
    await page.screenshot({ path: `${process.env.MPS07_EVIDENCE_DIR}/calculation.png` });
  }
  const summaryDownload = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载大类需求总表', exact: true }).click();
  const summaryPath = await (await summaryDownload).path();
  const summaryBook = XLSX.read(await readFile(summaryPath), { type: 'buffer' });
  const [summaryRow] = XLSX.utils.sheet_to_json(summaryBook.Sheets[summaryBook.SheetNames[0]]);
  assert.equal(summaryRow['M+1 2026-10 有效需求'], 331.25);
  assert.equal(summaryRow['M+2 2026-11 有效需求'], 999);
  assert.equal(summaryRow['M+3 2026-12 需求'], 1074.6875);
  if (process.env.MPS05_EVIDENCE_DIR)
    await copyFile(summaryPath, `${process.env.MPS05_EVIDENCE_DIR}/processed-demand.csv`);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  await version(frame, '2026-11');
  await expect(result.locator('td').nth(1).locator('.dc-demand-amount')).toHaveText('待补');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await frame.getByText('预览大类计算过程', { exact: true }).click();
  await expect(frame.getByLabel('计算月份')).toHaveValue('2026-11');
  await expect(
    frame
      .getByRole('table', { name: '大类计算步骤', exact: true })
      .getByRole('row', { name: /^本月有效预估发货 / }),
  ).toContainText('待补');
});

test('the opening plan reads June to August while the adjusted plan reads July to September', async (t) => {
  const { frame, calls } = await mpsPage(t, config, fixture);
  await version(frame);
  let section = frame.getByRole('region', { name: '大类基础指标源值核对', exact: true });
  await expect(section.getByLabel('源值核对截止月份')).toHaveValue('2026-08');
  await expect
    .poll(() =>
      ['2026-06-01', '2026-07-01', '2026-08-01'].every((month) =>
        calls.some((call) => call.queryId === 'facts.history' && call.parameters.month === month),
      ),
    )
    .toBe(true);
  await frame.getByLabel('提报口径', { exact: true }).selectOption('adjust');
  await expect(section.getByLabel('源值核对截止月份')).toHaveValue('2026-09');
  await expect
    .poll(() =>
      calls.some(
        (call) => call.queryId === 'facts.history' && call.parameters.month === '2026-09-01',
      ),
    )
    .toBe(true);
});

test('missing current shipment keeps demand pending and exports the missing source from the real page path', async (t) => {
  const { page, frame } = await mpsPage(t, config, fixture);
  await version(frame);
  await frame.getByLabel('提报口径', { exact: true }).selectOption('adjust');
  await openCategoryCalculation(frame);
  const methods = frame.getByRole('region', { name: '逐月测算', exact: true });
  await expect(methods).toContainText('0 / 4 项可计算');
  const summary = frame.getByRole('region', { name: '大类预估需求数量', exact: true });
  await expect(summary.locator('tbody tr')).toHaveCount(1);
  const cells = await summary.locator('.dc-demand-amount').allTextContents();
  assert.deepEqual(cells, ['待补', '待补', '待补', '待补']);
  const waiting = page.waitForEvent('download');
  await methods.getByRole('button', { name: '下载测算明细', exact: true }).click();
  const csv = await mpsDownloadText(await (await waiting).path());
  assert.match(csv, /2026-10（M\+1）/);
  assert.match(csv, /2027-01（M\+4）/);
  assert.match(csv, /2026-09 本月有效预估发货缺失/);
  assert.doesNotMatch(csv, /NaN|Infinity/);
});

test('待定单品异常CSV和四个月部分需求沿公开页面传到后续拆分', async (t) => {
  const { page, frame } = await mpsPage(t, config, (query) => {
    const result = fixture(query);
    if (query.queryId === 'annual-pool.detail') {
      result.rows.push(
        record('annual-pool.detail', {
          belong_base: '全国',
          sub_category: '汤圆',
          stat_month: '2027-02',
          source_rows: 1,
          missing_qty: 0,
          duplicate_rows: 0,
          demand_qty: 400,
        }),
      );
      result.totalRowCount = result.rows.length;
    }
    if (query.queryId === 'annual-pool.count') result.rows[0].total = 4;
    return result;
  });
  await version(frame, '2026-11');
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await frame.getByLabel('数据截止日').fill('2026-10-31');
  await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
    name: '部分待定.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库\n2026-10,郑州,A,产品A,汤圆,系列甲,G,100,0,0,1,100,100,0\n2026-10,郑州,B,产品B,汤圆,系列甲,G,10,,0,1,100,100,0',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  const notice = frame.getByRole('region', { name: '待定单品异常', exact: true });
  await expect(notice).toContainText('参与1条，排除1条');
  const summary = frame.getByRole('region', { name: '大类预估需求数量', exact: true });
  await expect(summary).not.toContainText('待补');
  await expect(summary).toContainText('部分可计算');
  const waiting = page.waitForEvent('download');
  await notice.getByRole('button', { name: '下载待定单品异常CSV', exact: true }).click();
  const exceptionDownload = await waiting;
  assert.match(exceptionDownload.suggestedFilename(), /\.csv$/);
  const exceptionBytes = await readFile(await exceptionDownload.path());
  assert.notEqual(exceptionBytes.subarray(0, 2).toString(), 'PK');
  const csv = exceptionBytes.toString('utf8');
  assert.match(csv, /产品B/);
  assert.match(csv, /已备/);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await expect(frame.getByRole('region', { name: '待定单品异常', exact: true })).toContainText(
    '部分可计算',
  );
  const downstream = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载需求拆分', exact: true }).click();
  const workbook = XLSX.read(await readFile(await (await downstream).path()), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
  const details = rows.filter((row) => row['产品编码']);
  assert.ok(details.length > 0);
  assert.ok(details.every((row) => row['产品编码'] === 'A'));
  assert.ok(
    rows.filter((row) => row['粒度'] === '大类').every((row) => /部分/.test(row['计算范围'])),
  );
});

test('历史占比读取上一完整财年，预览列出当前物料组和全年数量并支持未对应明细', async (t) => {
  const { frame, calls } = await mpsPage(t, config, fixture);
  await version(frame, '2026-11');
  const card = frame
    .locator('section.dc-parameter')
    .filter({ has: frame.getByRole('heading', { name: '去年发运占比', exact: true }) });
  await expect(card).toContainText('2025-07-01至2026-06-30');
  await expect(card).toContainText('条可计算');
  await card.getByRole('button', { name: '预览', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '去年发运占比 · 源值核对', exact: true });
  await expect(
    dialog.getByRole('columnheader', { name: '上一财年发货数量', exact: true }),
  ).toBeVisible();
  const row = dialog
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: 'A', exact: true }) });
  await expect(dialog).toContainText('2025-07-01至2026-06-30');
  await expect(row.getByRole('cell', { name: 'G', exact: true })).toBeVisible();
  await expect(row).toContainText('50.00%');
  assert(
    calls.some(
      (call) =>
        call.queryId === 'facts.history-annual' &&
        call.parameters.start === '2025-07-01' &&
        call.parameters.end === '2026-06-30',
    ),
  );
  await dialog.getByRole('button', { name: /未对应记录/ }).click();
  await expect(dialog.getByRole('columnheader', { name: '未对应原因', exact: true })).toBeVisible();
});

test('三年指标请求未结束时，上一财年占比仍可独立完成读取', async (t) => {
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const { frame } = await mpsPage(t, config, async (query) => {
    if (query.queryId.startsWith('category-history.')) await blocked;
    return fixture(query);
  });
  try {
    const card = frame
      .locator('section.dc-parameter')
      .filter({ has: frame.getByRole('heading', { name: '去年发运占比', exact: true }) });
    await expect(card).toContainText('2 / 2 条可计算');
  } finally {
    release();
  }
});

test('模型双期预测沿用四项统计，明细保留物料组及零数量', async (t) => {
  const { frame } = await mpsPage(t, config, (query) => {
    if (!query.queryId.startsWith('forecast.')) return fixture(query);
    const rows = ['A', 'B'].map((code, index) =>
      record('forecast.detail', {
        stat_month: '2026-11',
        belong_base: '郑州',
        material_code: code,
        material_name: '产品' + code,
        current_month_forecast_qty: index ? 5 : 0,
        next_month_forecast_qty: index ? 7 : 10,
        source_rows: 1,
      }),
    );
    const count = query.queryId.endsWith('.count');
    return {
      rows: count
        ? [{ total: rows.length }]
        : rows.slice(query.parameters.offset, query.parameters.offset + query.parameters.page_size),
      returnedColumns: count ? ['total'] : config.queries[query.queryId].columns,
      configVersion: 'forecast-sku-fixture',
    };
  });
  await version(frame, '2026-11');
  const card = frame.getByRole('region', { name: '模型双期预测', exact: true });
  await expect(card.getByRole('button', { name: '大类 1', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: '系列 1', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: /^物料组/ })).toHaveCount(0);
  await expect(card.getByRole('button', { name: '产品 2', exact: true })).toBeVisible();
  await card.getByRole('button', { name: '预览当前明细', exact: true }).click();
  const dialog = frame.getByRole('dialog');
  const row = dialog
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: 'A', exact: true }) });
  await expect(row).toContainText('汤圆');
  await expect(row).toContainText('系列甲');
  await expect(row.getByRole('cell', { name: 'G', exact: true })).toBeVisible();
  const columns = await dialog.getByRole('columnheader').allTextContents();
  const quantityColumn = columns.findIndex((column) => column.startsWith('数量（'));
  assert(quantityColumn >= 0);
  await expect(row.locator('td').nth(quantityColumn)).toHaveText('0');
});

test('同比缺一年时预览按两年计算并列出有效年份', async (t) => {
  const { frame, contexts } = await mpsPage(t, config, (query) => {
    const result = fixture(query);
    if (query.queryId === 'category-history.detail')
      result.rows.forEach((row) => {
        if (row.stat_month.startsWith('2023')) row.last_year_dimension_act_dl_qty = null;
      });
    return result;
  });
  await version(frame, '2026-11');
  const card = frame
    .locator('section.dc-parameter')
    .filter({ has: frame.getByRole('heading', { name: '三年同比', exact: true }) });
  await expect(card).toContainText('8 / 8 项可计算');
  await expect(card).toContainText('按有效年份等权平均');
  await card.getByRole('button', { name: '预览', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '三年同比 · 源值核对', exact: true });
  const table = dialog
    .getByRole('table')
    .filter({ has: frame.getByRole('columnheader', { name: '同比有效年份', exact: true }) });
  const row = table
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: '2026-11', exact: true }) });
  await expect(row).toContainText('2025、2024（2年）');
  await expect(row).toContainText(String(100 / 90));
  await expect
    .poll(() =>
      contexts.some((entry) =>
        entry.parts?.['source-inputs-parameters']?.factors?.some(
          (factor) => factor.month === '2026-11' && factor.yoyYears?.length === 2,
        ),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      contexts.some((entry) => {
        const historical = entry.parts?.['category-demand']?.historical;
        return (
          historical?.some((factor) => factor.month === '2026-11') &&
          historical.every((factor) => !('years' in factor) && !('yoyYears' in factor))
        );
      }),
    )
    .toBe(true);
});

test('basic source anomalies keep known BI quantities and export every row while the plan dataset is denied', async (t) => {
  const currentProducts = [
    ...products,
    ...Array.from({ length: 30 }, (_, index) =>
      record('products.detail', {
        product_item: 'G',
        product_item_name: '物料组甲',
        material_code: `IN-${index + 1}`,
        material_name: `池内产品${index + 1}`,
        sub_category: '汤圆',
        series: '系列甲',
        source_rows: 1,
      }),
    ),
  ];
  const { page, frame } = await mpsPage(t, config, (query) => {
    if (query.queryId.startsWith('facts.plan-quantity'))
      throw Error('AUTHORIZATION_REWRITE：数据表不在当前租户启用数据集范围内');
    if (!query.queryId.startsWith('products.') && query.queryId !== 'facts.history')
      return fixture(query);
    const rows = query.queryId.startsWith('products.')
      ? currentProducts
      : Array.from({ length: 32 }, (_, index) =>
          record('facts.history', {
            'agents_scm_cust_deliv_daily_di.belong_base': '郑州',
            'agents_scm_cust_deliv_daily_di.material_code':
              index === 0 ? 'A' : index < 31 ? `IN-${index}` : 'OUT-31',
            'agents_scm_cust_deliv_daily_di.material_name': `来源产品${index}`,
            'agents_scm_cust_deliv_daily_di.act_dl_qty_total': index === 0 ? 0 : index,
            'agents_scm_cust_deliv_daily_di.act_dl_qty_all_total': index,
          }),
        );
    return {
      rows: query.queryId.endsWith('.count') ? [{ total: rows.length }] : rows,
      returnedColumns: query.queryId.endsWith('.count')
        ? ['total']
        : config.queries[query.queryId].columns,
      configVersion: 'denied-plan-fixture',
      totalRowCount: rows.length,
      offset: 0,
      hasMorePages: false,
      dataStatus: 'ok',
      warnings: [],
    };
  });
  await version(frame);
  const source = frame.getByRole('region', { name: '大类基础指标源值核对', exact: true });
  await expect(source).toContainText('当前租户尚未启用此数据集，请联系管理员启用');
  const category = source
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: '汤圆', exact: true }) });
  await expect(category.locator('td').nth(2)).toHaveText('1,395');
  await source
    .getByRole('button', { name: '查看异常与来源明细（6条异常，共99条）', exact: true })
    .click();
  const dialog = frame.getByRole('dialog', { name: '基础核对异常与来源明细', exact: true });
  await expect(dialog.locator('tbody tr')).toHaveCount(25);
  await expect(dialog).toContainText('2026-06至2026-08');
  await expect(dialog).toContainText('异常6条');
  await expect(dialog.locator('tbody tr').nth(0)).toContainText('读取失败');
  await expect(dialog.locator('tbody tr').nth(3)).toContainText('OUT-31');
  await expect(dialog.locator('tbody tr').nth(3)).toContainText('不在当前产品池');
  await expect(dialog.locator('tbody tr').nth(6).locator('td').nth(3)).toHaveText('A');
  await expect(dialog.locator('tbody tr').nth(7).locator('td').nth(3)).toHaveText('IN-1');
  await dialog.getByRole('button', { name: '下一页来源明细', exact: true }).click();
  await expect(dialog.locator('tbody tr').nth(0).locator('td').nth(3)).toHaveText('IN-19');
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  const pending = page.waitForEvent('download');
  await source.getByRole('button', { name: '下载完整来源明细', exact: true }).click();
  const csv = await mpsDownloadText(await (await pending).path());
  const book = XLSX.read(csv, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  assert.equal(rows.length, 99);
  assert.equal(rows.filter((row) => row['来源'] === '计划量').length, 3);
  assert.equal(rows[0]['产品编码'], 'A');
  assert.equal(rows[1]['产品编码'], 'IN-1');
  assert.equal(
    rows.filter((row) => row['产品编码'] === 'OUT-31' && row['原因'] === '不在当前产品池').length,
    3,
  );
});

test('退出或切换归属时不把默认版本写回旧评估，重新归属后保留所有人工输入', async (t) => {
  const { page, frame } = await mpsPage(t, config, fixture);
  await version(frame, '2026-11');
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '保留.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,原人工产品,汤圆,系列甲,G,,',
    ),
  });
  const productCell = () => frame.getByRole('cell', { name: '原人工产品', exact: true });
  await expect(productCell()).toBeVisible();
  const saved = await page.evaluate(() => window.readView().localDrafts);
  assert.equal(saved.drafts.length, 2);
  for (const event of ['gea-identity-changed', 'gea-session-changing', 'pagehide']) {
    await frame
      .locator('body')
      .evaluate((_el, name) => window.dispatchEvent(new Event(name)), event);
    await expect(productCell()).toHaveCount(0);
    await frame
      .locator('body')
      .evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
    assert.deepEqual(
      await page.evaluate(() => window.readView().localDrafts),
      saved,
      event + ' must not overwrite old ownership',
    );
    await page.locator('iframe').evaluate((element) => element.setAttribute('src', element.src));
    await expect(productCell()).toBeVisible();
    assert.deepEqual(await page.evaluate(() => window.readView().localDrafts), saved);
  }
});
