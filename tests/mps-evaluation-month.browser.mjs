import { seedLeafQuantities } from './helpers/mps-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { authorPage } from './helpers/author-page.mjs';
import { mpsPageWithExactProductPeriod as mpsPage } from './helpers/mps-page.mjs';
import { workflowExportRows } from './helpers/mps-workflow-export.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const record = (id, values) => ({
  ...Object.fromEntries(config.queries[id].columns.map((name) => [name, null])),
  ...values,
});
function source({ queryId, parameters }) {
  let rows = [];
  if (queryId.startsWith('products.'))
    rows = [
      record('products.detail', {
        stat_period: parameters.month,
        material_code: 'A',
        material_name: '产品A',
        sub_category: '旧大类',
        responsible_item: '汤圆',
        series: '系列甲',
        product_item: 'G',
        product_item_name: '物料组甲',
        target_base: '郑州',
        source_rows: 1,
      }),
    ];
  if (queryId === 'facts.report' || queryId === 'facts.report.count')
    rows = [
      record('facts.report', {
        belong_base: '郑州',
        material_code: 'A',
        material_name: '产品A',
        sub_category: '汤圆',
        series: '系列甲',
        product_item: 'G',
        product_item_name: '物料组甲',
        plannum_total: parameters.month === '2027-01-01' ? 91 : 11,
        allnum_total: parameters.month === '2027-01-01' ? 92 : 12,
      }),
    ];
  if (queryId.startsWith('forecast.'))
    rows = [
      record('forecast.detail', {
        stat_month: parameters.months[0],
        belong_base: '郑州',
        material_code: 'A',
        material_name: '产品A',
        current_month_forecast_qty: 201,
        next_month_forecast_qty: 202,
        source_rows: 1,
      }),
    ];
  const count = queryId.endsWith('.count');
  return {
    rows: count ? [{ total: rows.length }] : rows,
    returnedColumns: count ? ['total'] : config.queries[queryId].columns,
    rejectedColumns: [],
    configVersion: 'evaluation-month-fixture',
    totalRowCount: rows.length,
    offset: parameters.offset ?? 0,
    hasMorePages: false,
  };
}

function completeSystemSource(query) {
  const { queryId, parameters } = query;
  const response = source(query);
  let rows;
  if (queryId === 'facts.report' || queryId === 'facts.report.count')
    rows = [
      record('facts.report', {
        belong_base: '郑州',
        material_code: 'A',
        material_name: '产品A',
        sub_category: '汤圆',
        series: '系列甲',
        product_item: 'G',
        product_item_name: '物料组甲',
        plannum_total: parameters.month === '2026-11-01' ? 150 : 250,
        allnum_total: parameters.month === '2026-11-01' ? 150 : 250,
      }),
    ];
  if (queryId === 'facts.history' || queryId === 'facts.history-annual')
    rows = [
      record(queryId, {
        'agents_scm_cust_deliv_daily_di.belong_base': '郑州',
        'agents_scm_cust_deliv_daily_di.material_code': 'A',
        'agents_scm_cust_deliv_daily_di.material_name': '产品A',
        'agents_scm_cust_deliv_daily_di.product_categ_name': '汤圆',
        'agents_scm_cust_deliv_daily_di.material_group_name': '物料组甲',
        'agents_scm_cust_deliv_daily_di.act_dl_qty_total': 100,
      }),
    ];
  if (queryId.startsWith('facts.plan-quantity'))
    rows = [
      record('facts.plan-quantity', {
        belong_base: '郑州',
        material_code: 'A',
        plan_qty_total: 125,
        known_plan_qty_total: 125,
        source_plan_qty_total: 125,
        source_date_start: '20260701',
        source_date_end: '20270131',
        source_rows: 1,
        missing_rows: 0,
        duplicate_rows: 0,
      }),
    ];
  if (queryId.startsWith('category-history.'))
    rows = parameters.months.map((month) =>
      record('category-history.detail', {
        dimension_type: '基地+产品',
        stat_month: month,
        belong_base: '郑州',
        dimension_value: 'A',
        dimension_act_dl_qty: 100,
        last_year_dimension_act_dl_qty: 100,
        last_month_dimension_act_dl_qty: 100,
        base_fiscal_act_dl_qty: 1200,
        base_fiscal_month_count: 12,
        base_fiscal_quantity_month_count: 12,
        national_dimension_fiscal_act_dl_qty: 1200,
        fiscal_year: `${Number(month.slice(0, 4)) - (Number(month.slice(4)) < 7 ? 1 : 0)}财年`,
        source_rows: 1,
      }),
    );
  if (queryId.startsWith('annual-pool.'))
    rows = ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'].map((month) =>
      record('annual-pool.detail', {
        belong_base: '郑州',
        material_code: 'A',
        sub_category: '汤圆',
        stat_month: month,
        source_rows: 1,
        missing_qty: 0,
        duplicate_rows: 0,
        demand_qty: 100,
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
        dimension_allnum: 100,
        parent_allnum: 100,
        dimension_rate: 1,
      }),
    );
  return rows
    ? {
        ...response,
        rows: queryId.endsWith('.count') ? [{ total: rows.length }] : rows,
        totalRowCount: rows.length,
        dataStatus: 'ok',
        warnings: [],
      }
    : response;
}

test('页头版本跟随月份并显示短名，可新建月份跨年顺延', async (t) => {
  const page = await authorPage(t, { time: '2026-11-30T12:00:00+08:00' });
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  const month = frame.getByRole('combobox', { name: '评估月份选择', exact: true });
  await expect(month).toBeVisible();
  await expect(month.locator(':scope > option:enabled')).toHaveText([
    '2026-11',
    '2026-12',
    '2027-01',
  ]);
  await expect(month).toHaveValue('2026-11');
  await month.selectOption('2027-01');
  await expect(month).toHaveValue('2027-01');
  await expect(month.locator(':scope > option:enabled')).toHaveText([
    '2026-11',
    '2026-12',
    '2027-01',
  ]);
  const versions = frame.getByRole('combobox', { name: '评估版本选择', exact: true });
  await expect(versions.locator('option')).toHaveText(['第2版']);
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const newVersion = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await newVersion.getByLabel('评估月份', { exact: true }).fill('2027-01');
  const fullName = '1月滚动评估 · DEV 下市品验收';
  await newVersion.getByLabel('版本名称', { exact: true }).fill(fullName);
  await newVersion.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await expect(versions.locator('option')).toHaveText(['第2版', 'DEV 下市品验收']);
  assert.ok((await versions.boundingBox()).width <= 136);
  await expect
    .poll(() => page.evaluate(() => window.readView()?.localDrafts?.drafts.at(-1)?.name))
    .toBe(fullName);
  await versions.selectOption('local-2');
  await expect(month).toHaveValue('2027-01');
  for (const [date, expected] of [
    ['2026-12-01', ['2026-12', '2027-01', '2027-02']],
    ['2027-01-01', ['2027-01', '2027-02', '2027-03']],
  ]) {
    await month.focus();
    await page.clock.setFixedTime(new Date(`${date}T12:00:00+08:00`));
    await month.press('Escape');
    await expect(month.locator(':scope > option:enabled')).toHaveText(expected);
    await month.focus();
    await expect(month.locator(':scope > option:enabled')).toHaveText(expected);
    await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
    const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
    const input = dialog.getByLabel('评估月份', { exact: true });
    await input.fill(expected[0]);
    await dialog.getByRole('button', { name: '打开月份选择', exact: true }).click();
    const panel = dialog.locator('.mps-month-panel');
    for (const year of new Set(expected.map((period) => period.slice(0, 4)))) {
      if (year !== expected[0].slice(0, 4))
        await panel.getByRole('button', { name: '下一年' }).click();
      await expect(panel.locator('.mps-month-options > button:enabled')).toHaveText(
        expected
          .filter((period) => period.startsWith(year))
          .map((period) => `${Number(period.slice(5))}月`),
      );
    }
    await input.press('Escape');
    await input.fill('2027-04');
    await expect(dialog.getByRole('button', { name: '创建本地版本', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
  }
  await month.selectOption('2026-11');
  await expect(versions.locator('option')).toHaveText(['第1版']);
});

test('月份切换贯通取数、需求计算和下载，保留历史版本、修正历史与Core草稿', async (t) => {
  const { page, frame, calls } = await mpsPage(t, config, source, {
    time: '2026-11-17T12:00:00+08:00',
  });
  await frame.getByLabel('评估月份选择', { exact: true }).selectOption('2026-11');
  const report = frame.getByRole('region', { name: '计划提报数据', exact: true });
  await expect(report).toContainText('数量合计11件');
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '十一月本地提报.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-11,郑州,A,产品A,汤圆,系列甲,G,123,124',
    ),
  });
  await expect(report).toContainText('数量合计123件');
  const legacy = await page.evaluate(async () => {
    const seed = structuredClone(window.readView());
    const saved = structuredClone(seed.localDrafts.drafts[0]);
    saved.id = 'legacy-october';
    saved.name = '十月历史草稿';
    saved.month = '2026-10';
    saved.adjustments.history.push({
      kind: 'quantities',
      key: '历史明细',
      action: 'undo',
      systemValue: 8,
      value: 8,
      reason: '历史修正已撤销',
      at: '2026-10-16T00:00:00.000Z',
    });
    seed.localDrafts.drafts.push(saved);
    await window.openAuthor('mps', 1200, seed);
    return saved;
  });
  const before = calls.length;
  await frame.getByLabel('评估月份选择', { exact: true }).selectOption('2027-01');
  await expect(report).toContainText('数量合计91件');
  await expect
    .poll(() =>
      calls
        .slice(before)
        .some((call) => call.queryId === 'facts.report' && call.parameters.month === '2027-01-01'),
    )
    .toBe(true);
  await expect
    .poll(() =>
      calls
        .slice(before)
        .some(
          (call) =>
            call.queryId === 'forecast.detail' && call.parameters.months.includes('2027-01'),
        ),
    )
    .toBe(true);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const rows = await workflowExportRows(frame);
  const january = rows.find((row) => row['月份'] === '2027-01');
  assert.ok(january);
  assert.equal(Number(january['模型预测数量']), 201);
  assert.ok(rows.every((row) => row['评估月份'] === '2027-01'));
  assert.deepEqual(
    [...new Set(rows.map((row) => row['月份']))],
    ['2027-01', '2027-02', '2027-03', '2027-04'],
  );
  await seedLeafQuantities(frame, [
    {
      month: '2027-01',
      category: '汤圆',
      group: 'G',
      base: '郑州',
      code: 'A',
      quantity: 91,
      systemValue: null,
    },
  ]);
  await expect(frame.getByRole('button', { name: '基地 · 郑州', exact: true })).toBeVisible();
  const validJanuary = await workflowExportRows(frame);
  assert.equal(
    validJanuary.find((row) => row.月份 === '2027-01' && row.产品编码 === 'A').需求数量,
    '91',
  );
  await frame.getByRole('button', { name: '页面说明', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await frame.getByRole('button', { name: '导出核对底稿', exact: true }).click();
  const downloaded = await downloading;
  assert.match(downloaded.suggestedFilename(), /^MPS-2027-01-/);
  const exported = JSON.parse(await mpsDownloadText(await downloaded.path()));
  assert.equal(exported.draft.month, '2027-01');
  assert.equal(exported.draft.report.find((row) => row['月份'] === '2027-01')['月初数量'], 91);
  await frame.getByRole('button', { name: '页面说明', exact: true }).click();
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  await frame.getByLabel('评估月份选择', { exact: true }).selectOption('2026-11');
  await expect(report).toContainText('数量合计123件');
  await seedLeafQuantities(frame, [
    {
      month: '2026-11',
      category: '汤圆',
      group: 'G',
      base: '郑州',
      code: 'A',
      quantity: 123,
      systemValue: null,
    },
  ]);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await expect(frame.getByRole('button', { name: '基地 · 郑州', exact: true })).toBeVisible();
  const validNovember = await workflowExportRows(frame);
  assert.equal(
    validNovember.find((row) => row.月份 === '2026-11' && row.产品编码 === 'A').需求数量,
    '123',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  await frame.getByLabel('评估月份选择', { exact: true }).selectOption('2027-01');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await expect(frame.getByRole('button', { name: '基地 · 郑州', exact: true })).toBeVisible();
  const restoredJanuary = await workflowExportRows(frame);
  assert.equal(
    restoredJanuary.find((row) => row.月份 === '2027-01' && row.产品编码 === 'A').需求数量,
    '91',
  );
  assert.ok(restoredJanuary.every((row) => row.评估月份 === '2027-01'));
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  const month = frame.getByLabel('评估月份选择', { exact: true });
  await expect(month.locator('optgroup[label="已保存月份"] option')).toHaveText(['2026-10']);
  await month.selectOption('2026-10');
  await expect(month).toHaveValue('2026-10');
  await expect(frame.getByLabel('评估版本选择').locator('option')).toHaveText(['十月历史草稿']);
  await expect(month.locator(':scope > option:enabled')).toHaveText([
    '2026-11',
    '2026-12',
    '2027-01',
  ]);
  assert.deepEqual(
    await page.evaluate(() =>
      window.readView().localDrafts.drafts.find((row) => row.id === 'legacy-october'),
    ),
    legacy,
  );
  assert.equal(await page.evaluate(() => window.peerDraft), '历史草稿，请保留。');
});

test('两个评估月的完整来源驱动系统有效需求，期间切换与回切不复用结果', async (t) => {
  const { page, frame, calls } = await mpsPage(t, config, completeSystemSource, {
    time: '2026-11-17T12:00:00+08:00',
  });
  const results = [];
  for (const [month, previous, cutoff, expected] of [
    ['2026-11', '2026-10', '2026-10-31', 110],
    ['2027-01', '2026-12', '2026-12-31', 150],
    ['2026-11', '2026-10', '2026-10-31', 110],
  ]) {
    const before = results.length ? calls.length : 0;
    await page.clock.setFixedTime(
      new Date(month === '2027-01' ? '2026-12-31T14:00:00+08:00' : '2026-11-17T12:00:00+08:00'),
    );
    await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
    await frame.getByLabel('评估月份选择', { exact: true }).selectOption(month);
    await expect(frame.getByRole('region', { name: '计划提报数据', exact: true })).toContainText(
      `数量合计${month === '2026-11' ? 150 : 250}件`,
    );
    await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
    await frame.getByLabel('数据截止日').fill(cutoff);
    await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
      name: `${previous}-有效发货输入.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库\n${previous},郑州,A,产品A,汤圆,系列甲,G,100,0,0,1,200,0,0`,
      ),
    });
    await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
    await expect(frame.getByRole('table', { name: '大类需求总表', exact: true })).toContainText(
      String(expected),
    );
    const rows = await workflowExportRows(frame);
    const demand = rows.filter((row) => row.产品编码 === 'A');
    assert.equal(demand.length, 4);
    assert.deepEqual(
      demand.map((row) => Number(row.系统SKU需求)),
      [expected, 100, 100, 100],
    );
    assert.deepEqual(
      demand.map((row) => Number(row.需求数量)),
      [expected, 100, 100, 100],
    );
    assert.ok(
      demand.every((row) => row.评估月份 === month && row.数量调整状态 === '系统拆分或占比调整'),
    );
    const monthCalls = calls.slice(before);
    assert.ok(
      monthCalls.some(
        (call) => call.queryId === 'facts.report' && call.parameters.month === `${month}-01`,
      ),
    );
    const recent =
      month === '2026-11'
        ? ['2026-07-01', '2026-08-01', '2026-09-01']
        : ['2026-09-01', '2026-10-01', '2026-11-01'];
    assert.deepEqual(
      [
        ...new Set(
          monthCalls
            .filter((call) => call.queryId === 'facts.plan-quantity')
            .map((call) => call.parameters.month),
        ),
      ].sort(),
      recent,
    );
    const historical = [1, 2, 3].map(
      (year) => `${Number(month.slice(0, 4)) - year}${month.slice(5)}`,
    );
    for (const period of historical)
      assert.ok(
        monthCalls.some(
          (call) =>
            call.queryId === 'category-history.detail' && call.parameters.months.includes(period),
        ),
      );

    const saved = await page.evaluate(() => {
      const state = window.readView().localDrafts;
      return state.drafts.find((draft) => draft.id === state.selected);
    });
    assert.deepEqual(saved.adjustments.quantities, []);
    assert.deepEqual(saved.adjustments.categoryDemand, []);
    assert.deepEqual(saved.adjustments.shares, []);
    results.push({
      month,
      reportPeriod: `${month}-01`,
      recent,
      historical,
      systemDemand: demand.map((row) => Number(row.系统SKU需求)),
      effectiveDemand: demand.map((row) => Number(row.需求数量)),
    });
  }
  console.log('MPS_SYSTEM_MONTH_RESULTS', JSON.stringify(results));
});
