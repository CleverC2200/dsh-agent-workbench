import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsPage } from './helpers/mps-page.mjs';
import { workflowStep, commitNumber } from './helpers/mps-edit.mjs';
import { seedLeafQuantities } from './helpers/mps-fixtures.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const zeroSource = (base) => ({
  target_month: '2026-12',
  belong_base: base,
  material_code: 'A',
  inventory_version: '月初',
  final_target_inventory: 0,
  avg_daily_planned_demand: 10,
  final_target_turnover_days: 0,
  source_rows: 1,
  final_target_value_count: 1,
  daily_demand_value_count: 1,
  turnover_days_value_count: 1,
  missing_target_rows: 0,
  missing_daily_rows: 0,
  missing_turnover_days_rows: 0,
});
let exportIndex = 0;
async function downloadRows(page, view, name) {
  const pointer = process.env.MPS_TURNOVER_POINTER === '1';
  const button = view.getByRole('button', { name, exact: true });
  exportIndex++;
  const capture = async (stage) => {
    const prefix = process.env.MPS_TURNOVER_POINTER_EVIDENCE;
    if (!prefix) return;
    await writeFile(
      `${prefix}-${exportIndex}-${stage}.json`,
      JSON.stringify(
        {
          name,
          selector: `region[name="约束与配置"] button[name="${name}"]`,
          month: await view.getByLabel('目标明细月份', { exact: true }).inputValue(),
          base: await view.getByLabel('目标明细基地', { exact: true }).inputValue(),
          search: await view.getByLabel('搜索目标单品', { exact: true }).inputValue(),
          disabled: await button.isDisabled(),
          box: await button.boundingBox(),
          text: await view.innerText(),
        },
        null,
        2,
      ),
    );
    await page.screenshot({ path: `${prefix}-${exportIndex}-${stage}.png`, fullPage: true });
  };
  if (pointer) await capture('before');
  const pending = page.waitForEvent('download', { timeout: pointer ? 5000 : 30000 });
  if (pointer) await button.click();
  else await button.press('Enter');
  let file;
  try {
    file = await pending;
  } catch (error) {
    if (pointer) await capture('after-no-download');
    throw error;
  }
  if (process.env.MPS_TURNOVER_EXPORT_DIR)
    await file.saveAs(`${process.env.MPS_TURNOVER_EXPORT_DIR}/${exportIndex}-${name}.csv`);
  const csv = await mpsDownloadText(await file.path());
  const book = XLSX.read(csv.replace(/^\uFEFF/, ''), { type: 'string', raw: true });
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
}

test('周转报告区分有效零、缺失待补和人工补充，筛选后下载与目标库存同步', async (t) => {
  const { page, frame } = await mpsPage(t, config, ({ queryId }) => ({
    rows: queryId.endsWith('.count')
      ? [{ total: queryId.startsWith('inventory-targets.') ? 2 : 0 }]
      : queryId.startsWith('inventory-targets.')
        ? [zeroSource('甲'), zeroSource('乙')]
        : [],
    returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
    configVersion: 'turnover-report-fixture',
  }));
  await page.clock.install({ time: new Date('2026-11-17T12:00:00+08:00') });
  await frame.getByLabel('评估月份选择', { exact: true }).selectOption('2026-12');
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '产品范围.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,物料组名称,老品编码,老品名称\n甲,A,甲零周转,汤圆,系列,组,组名,,\n甲,B,甲待补,汤圆,系列,组,组名,,\n乙,A,乙零周转,汤圆,系列,组,组名,,',
    ),
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = window.readView().localDrafts;
        return (
          state.drafts.find((row) => row.id === state.selected).inputs.products?.rows.length ?? 0
        );
      }),
    )
    .toBe(3);
  await seedLeafQuantities(
    frame,
    ['2026-12', '2027-01', '2027-02'].flatMap((month) =>
      [
        { base: '甲', code: 'A' },
        { base: '甲', code: 'B' },
        { base: '乙', code: 'A' },
      ].map((row) => ({
        ...row,
        month,
        category: '汤圆',
        group: '组',
        quantity: 10,
        systemValue: null,
      })),
    ),
  );
  await workflowStep(frame, '约束与配置');
  const view = frame.getByRole('region', { name: '约束与配置', exact: true });
  await view.getByLabel('目标明细月份', { exact: true }).selectOption('2026-12');
  const report = view.getByRole('table', { name: '周转天数与库存目标报告', exact: true });
  await expect(report).toContainText('有效零周转天数');
  await expect(report).toContainText('周转天数待补');
  await expect(report).toContainText('缺目标记录');
  await expect(view).not.toContainText('临时按0天');
  await expect(view.getByRole('table', { name: '基地安全天数策略', exact: true })).toHaveCount(0);
  let rows = await downloadRows(page, view, '下载周转天数报告');
  assert.equal(rows.length, 3);
  const zero = rows.find((row) => row['基地'] === '甲' && row['产品编码'] === 'A');
  assert.equal(zero['原始周转天数'], '0');
  assert.equal(zero['计算用周转天数'], '0');
  assert.equal(zero['目标期末库存'], '0');
  assert.match(zero['来源'], /源最终目标周转天数.*2026-12.*月初/);
  assert.match(zero['计算依据'], /0天.*目标库存为0.*预测期末库存.*库存收支/);
  await view.getByLabel('目标明细基地', { exact: true }).selectOption('甲');
  await view.getByLabel('搜索目标单品', { exact: true }).fill('B');
  rows = await downloadRows(page, view, '下载周转天数报告');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['基地'], '甲');
  assert.equal(rows[0]['产品编码'], 'B');
  assert.equal(rows[0]['月份'], '2026-12');
  assert.equal(rows[0]['异常类别'], '周转天数待补');
  assert.equal(rows[0]['目标期末库存'], '');
  await commitNumber(view.getByLabel('甲 B 补充目标周转天数', { exact: true }), '15');
  await expect(report).toContainText('周转天数人工补充');
  rows = await downloadRows(page, view, '下载周转天数报告');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['计算用周转天数'], '15');
  assert.equal(rows[0]['人工补充天数'], '15');
  assert.match(rows[0]['原因'], /缺目标记录/);
  assert.match(rows[0]['实际处理'], /人工补充已生效/);
  assert.ok(Math.abs(Number(rows[0]['目标期末库存']) - 150 / 31) < 1e-8);
  if (process.env.MPS_TURNOVER_SCREENSHOT)
    await page.screenshot({ path: process.env.MPS_TURNOVER_SCREENSHOT, fullPage: true });
  const targets = await downloadRows(page, view, '下载目标库存明细');
  assert.equal(targets.length, 1);
  assert.equal(targets[0]['产品编码'], 'B');
  assert.equal(targets[0]['推导目标库存'], rows[0]['目标期末库存']);
  await view.getByLabel('目标明细月份', { exact: true }).selectOption('2027-01');
  rows = await downloadRows(page, view, '下载周转天数报告');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['月份'], '2027-01');
  assert.ok(Math.abs(Number(rows[0]['目标期末库存']) - 150 / 28) < 1e-8);
});
