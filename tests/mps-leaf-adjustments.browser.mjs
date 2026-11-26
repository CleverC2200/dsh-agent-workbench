import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsDownloadText } from './helpers/mps-download.mjs';
import { authorPage } from './helpers/author-page.mjs';
import { workflowExportRows } from './helpers/mps-workflow-export.mjs';

test('仅基地SKU编辑，原因点选、历史上层归档、四月参考与页面恢复保全', async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  let frame = page.frameLocator('iframe');
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,物料组名称,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列甲,G1,物料组甲,,\n华东,A,产品甲,汤圆,系列甲,G1,物料组甲,,',
    ),
  });
  const month = await frame.getByLabel('评估月份选择').inputValue();
  const actions = frame.locator('.dc-adjustment-actions');
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '提报.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n${month},郑州,A,产品甲,汤圆,系列甲,G1,60,60\n${month},华东,A,产品甲,汤圆,系列甲,G1,40,40`,
    ),
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = window.readView()?.localDrafts;
        return s?.drafts.find((d) => d.id === s.selected)?.inputs.products?.rows.length;
      }),
    )
    .toBe(2);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = window.readView()?.localDrafts;
        return s?.drafts.find((d) => d.id === s.selected)?.inputs.report?.rows.length;
      }),
    )
    .toBe(2);
  await page.evaluate(async (month) => {
    const seed = window.readView();
    const draft = seed.localDrafts.drafts.find((row) => row.id === seed.localDrafts.selected);
    const audit = { systemValue: null, reason: '历史原因原文', at: '2026-11-01T00:00:00.000Z' };
    const next = new Date(`${month}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    draft.adjustments.quantities = [
      {
        kind: 'base-sku',
        month,
        category: '汤圆',
        group: 'G1',
        base: '郑州',
        code: 'A',
        quantity: 50,
        ...audit,
      },
      {
        kind: 'base-sku',
        month,
        category: '汤圆',
        group: 'G1',
        base: '华东',
        code: 'A',
        quantity: 40,
        ...audit,
      },
      {
        kind: 'group',
        month: next.toISOString().slice(0, 7),
        category: '汤圆',
        group: 'G1',
        quantity: 120,
        ...audit,
      },
    ];
    draft.adjustments.categoryDemand = [{ month, category: '汤圆', quantity: 130, ...audit }];
    await window.openAuthor('mps', 1200, seed);
  }, month);
  frame = page.frameLocator('iframe');
  const category = frame.getByRole('region', { name: '大类预估需求数量', exact: true });
  await expect(category.getByRole('button', { name: '调整', exact: true })).toHaveCount(0);
  await expect(frame.getByRole('region', { name: '历史上层修正冲突', exact: true })).toBeVisible();
  await expect(category).toContainText('90');
  const calculation = frame.getByRole('region', { name: '逐月测算', exact: true });
  const help = calculation.locator('[popover]');
  const explanation = calculation.getByRole('button', { name: '口径说明', exact: true });
  const title = calculation.getByText('逐月测算依据', { exact: true });
  const downloadCalculation = calculation.getByRole('button', {
    name: '下载测算明细',
    exact: true,
  });
  await expect(calculation.locator('table')).toBeHidden();
  await expect(downloadCalculation).toBeHidden();
  await title.press('Enter');
  await expect(calculation.locator('table')).toBeVisible();
  const header = await title.boundingBox();
  const action = await downloadCalculation.boundingBox();
  assert.ok(Math.abs(header.y + header.height / 2 - action.y - action.height / 2) <= 2);
  await expect(help).toBeHidden();
  await expect(calculation.locator('thead')).not.toContainText('本月预估发货 × 环比');
  await explanation.press('Enter');
  await expect(help).toBeVisible();
  await expect(help).toContainText('M+4仅作库存参考');
  await expect(help).toContainText('本月预估发货 × 环比');
  await explanation.press('Escape');
  await expect(help).toBeHidden();
  const download = page.waitForEvent('download');
  await downloadCalculation.click();
  const csv = await mpsDownloadText(await (await download).path());
  const book = XLSX.read(csv, { type: 'string', raw: true });
  const categoryRows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
  const effectiveCategory = categoryRows.find((row) => row['月份'] === `${month}（M+1）`);
  assert.equal(Number(effectiveCategory['大类预估需求数量']), 90);
  assert.equal(effectiveCategory['调整原因'], '');
  assert.equal(effectiveCategory['调整时间'], '');
  assert.equal(effectiveCategory['需求数量来源'], '基地SKU汇总，调整原因和时间见逐叶子明细');
  assert.equal(categoryRows.find((row) => row !== effectiveCategory)['需求数量来源'], '系统测算');
  const unarchived = await page.evaluate(() => {
    const state = window.readView().localDrafts;
    return state.drafts.find((draft) => draft.id === state.selected).adjustments.categoryDemand;
  });
  assert.deepEqual(unarchived, [
    {
      month,
      category: '汤圆',
      quantity: 130,
      systemValue: null,
      reason: '历史原因原文',
      at: '2026-11-01T00:00:00.000Z',
    },
  ]);
  await frame.getByRole('button', { name: '归档历史上层修正', exact: true }).click();
  const history = frame.getByRole('region', { name: '大类调整记录', exact: true });
  await expect(history).toContainText('130');
  await expect(history).toContainText('历史原因原文');
  await expect(history).toContainText('2026-11-01T00:00:00.000Z');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await frame.getByLabel('搜索当前步骤', { exact: true }).fill('产品甲');
  await actions.getByRole('button', { name: '调整', exact: true }).click();
  const field = view.getByLabel(`汤圆 G1 A 郑州 ${month} 需求数量`, { exact: true });
  await field.fill('55');
  await actions.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect(actions.getByRole('alert')).toContainText('请选择');
  await actions.getByLabel('批量调整原因', { exact: true }).selectOption('其他');
  await actions.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect(actions.getByRole('alert')).toContainText('说明');
  await actions.getByLabel('其他原因说明', { exact: true }).fill('合同调整复核');
  await actions.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect(actions.getByRole('button', { name: '保存调整', exact: true })).toHaveCount(0);
  const rows = await workflowExportRows(frame);
  assert.equal(
    Number(
      rows.find(
        (row) => row['月份'] === month && row['基地'] === '郑州' && row['产品编码'] === 'A',
      )['需求数量'],
    ),
    55,
  );
  assert.equal(
    Number(
      rows.find(
        (row) => row['月份'] === month && row['基地'] === '华东' && row['产品编码'] === 'A',
      )['需求数量'],
    ),
    40,
  );
  assert.equal(
    rows.find((row) => row['月份'] === month && row['基地'] === '郑州' && row['产品编码'] === 'A')[
      '调整原因'
    ],
    '其他：合同调整复核',
  );
  const fourth = new Date(`${month}-01T00:00:00Z`);
  fourth.setUTCMonth(fourth.getUTCMonth() + 3);
  const referenceMonth = fourth.toISOString().slice(0, 7);
  await actions.getByRole('button', { name: '调整', exact: true }).click();
  await view.getByLabel(`汤圆 G1 A 郑州 ${referenceMonth} 需求数量`, { exact: true }).fill('7');
  await actions.getByLabel('批量调整原因', { exact: true }).selectOption('销售变化');
  await actions.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect(actions.getByRole('button', { name: '保存调整', exact: true })).toHaveCount(0);
  const reference = await workflowExportRows(frame);
  assert.equal(
    Number(
      reference.find(
        (row) =>
          row['月份'] === referenceMonth && row['基地'] === '郑州' && row['产品编码'] === 'A',
      )['需求数量'],
    ),
    7,
  );
  const table = frame.getByRole('table', { name: '加工后的需求明细', exact: true });
  await actions.getByRole('button', { name: '调整', exact: true }).click();
  await view.getByLabel(`汤圆 G1 A 郑州 ${month} 需求数量`, { exact: true }).fill('999');
  await actions.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(
    Number(
      (await workflowExportRows(frame)).find(
        (row) => row['月份'] === month && row['基地'] === '郑州' && row['产品编码'] === 'A',
      )['需求数量'],
    ),
    55,
  );
  await frame.getByLabel('需求层级视角', { exact: true }).selectOption('national');
  await expect(table.locator('tbody tr').first()).toContainText('95');
  await expect(
    table.getByRole('columnheader', {
      name: `M+4 ${referenceMonth} 库存参考（可调整）`,
      exact: true,
    }),
  ).toBeVisible();
  const width = await table
    .locator('..')
    .evaluate((element) => ({ viewport: element.clientWidth, content: element.scrollWidth }));
  assert.ok(width.content > width.viewport, JSON.stringify(width));
  const pageWidth = await frame.locator('body').evaluate((element) => ({
    viewport: element.clientWidth,
    content: element.scrollWidth,
  }));
  assert.ok(pageWidth.content <= pageWidth.viewport + 1, JSON.stringify(pageWidth));
  if (process.env.MPS06_EVIDENCE_DIR)
    await page.screenshot({ path: `${process.env.MPS06_EVIDENCE_DIR}/leaf-national.png` });
  const saved = await page.evaluate(() => window.readView());
  const draft = saved.localDrafts.drafts.find((row) => row.id === saved.localDrafts.selected);
  assert.equal(draft.adjustments.categoryDemand.length, 0);
  assert.ok(
    draft.adjustments.history.some(
      (row) =>
        row.action === 'archive' &&
        row.value === 130 &&
        row.reason === '历史原因原文' &&
        row.at === '2026-11-01T00:00:00.000Z',
    ),
  );
  assert.ok(draft.adjustments.history.some((row) => row.reason === '其他：合同调整复核'));
  await page.evaluate(async (seed) => window.openAuthor('mps', 1200, seed), saved);
  const restored = await page.evaluate(() => window.readView());
  assert.deepEqual(restored.localDrafts, saved.localDrafts);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  await expect(frame.getByRole('region', { name: '大类预估需求数量', exact: true })).toContainText(
    '95',
  );
});
