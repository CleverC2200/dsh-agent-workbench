import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { authorPage } from './helpers/author-page.mjs';
import { mpsPage } from './helpers/mps-page.mjs';
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
        material_code: 'A',
        material_name: '产品A',
        sub_category: '汤圆',
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

test('标题旁月份入口只列实际本月及后两个月，选择后不扩张并跨月跨年顺延', async (t) => {
  const page = await authorPage(t);
  await page.clock.install({ time: new Date('2026-11-30T12:00:00+08:00') });
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  const month = frame.getByRole('combobox', { name: '评估月份选择', exact: true });
  await expect(month).toBeVisible();
  await expect(month.locator('option:enabled')).toHaveText(['2026-11', '2026-12', '2027-01']);
  await expect(month).toHaveValue('2026-11');
  await month.selectOption('2027-01');
  await expect(month).toHaveValue('2027-01');
  await expect(month.locator('option:enabled')).toHaveText(['2026-11', '2026-12', '2027-01']);
  await expect(frame.getByLabel('评估版本选择').locator('option:checked')).toContainText('2027-01');
  for (const [date, expected] of [
    ['2026-12-01', ['2026-12', '2027-01', '2027-02']],
    ['2027-01-01', ['2027-01', '2027-02', '2027-03']],
  ]) {
    await month.focus();
    await page.clock.setSystemTime(new Date(`${date}T12:00:00+08:00`));
    await month.press('ArrowDown');
    await month.press('Escape');
    await expect(month.locator('option:enabled')).toHaveText(expected);
    await month.focus();
    await expect(month.locator('option:enabled')).toHaveText(expected);
    await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
    const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
    const input = dialog.getByLabel('评估月份', { exact: true });
    await expect(input).toHaveAttribute('min', expected[0]);
    await expect(input).toHaveAttribute('max', expected[2]);
    await input.fill('2027-04');
    await expect(dialog.getByRole('button', { name: '创建本地版本', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
  }
  assert.equal(await frame.getByLabel('评估版本选择').locator('option').count(), 2);
});

test('月份切换贯通取数、需求计算和下载，保留历史版本、修正历史与Core草稿', async (t) => {
  const { page, frame, calls } = await mpsPage(t, config, source);
  await page.clock.install({ time: new Date('2026-11-17T12:00:00+08:00') });
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
  await frame.getByRole('button', { name: '页面说明', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await frame.getByRole('button', { name: '导出核对底稿', exact: true }).click();
  const downloaded = await downloading;
  assert.match(downloaded.suggestedFilename(), /^MPS-2027-01-/);
  const exported = JSON.parse(await mpsDownloadText(await downloaded.path()));
  assert.equal(exported.draft.month, '2027-01');
  assert.equal(exported.draft.report.find((row) => row['月份'] === '2027-01')['月初数量'], 91);
  await frame.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  await frame.getByLabel('评估月份选择', { exact: true }).selectOption('2026-11');
  await expect(report).toContainText('数量合计123件');
  await frame.getByLabel('评估版本选择').selectOption('legacy-october');
  await expect(frame.getByLabel('评估月份选择').locator('option:checked')).toHaveText(
    '历史月份 · 2026-10',
  );
  await expect(frame.getByLabel('评估月份选择').locator('option:enabled')).toHaveText([
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
