import { seedLeafQuantities, seedNoTransferPlans } from './helpers/mps-fixtures.mjs';
import { selectAdjustmentReason } from './helpers/mps-edit.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { authorPage } from './helpers/author-page.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';
import * as XLSX from 'xlsx-republish';
import { readFile } from 'node:fs/promises';
import { mpsPage } from './helpers/mps-page.mjs';
import { beginAdjustment, saveAdjustment } from './helpers/mps-edit.mjs';
import { workflowExportRows } from './helpers/mps-workflow-export.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));

async function skuPage(t, history = false) {
  const source = history
    ? await mpsPage(t, config, ({ queryId }) => {
        const rows =
          queryId === 'facts.history-annual'
            ? [
                ['郑州', 'A', '汤圆', 60],
                ['华东', 'A', '汤圆', 40],
                ['郑州', 'B', '水饺', 20],
              ].map(([base, code, category, quantity]) => ({
                ...Object.fromEntries(
                  config.queries[queryId].columns.map((column) => [column, null]),
                ),
                'agents_scm_cust_deliv_daily_di.belong_base': base,
                'agents_scm_cust_deliv_daily_di.material_code': code,
                'agents_scm_cust_deliv_daily_di.product_categ_name': category,
                'agents_scm_cust_deliv_daily_di.act_dl_qty_total': quantity,
              }))
            : [];
        return {
          rows: queryId.endsWith('.count') ? [{ total: 0 }] : rows,
          returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
          rejectedColumns: [],
          configVersion: 'sku-hierarchy-fixture',
          dataStatus: 'ok',
          warnings: [],
          totalRowCount: rows.length,
          offset: 0,
          hasMorePages: false,
        };
      })
    : null;
  const page = source?.page ?? (await authorPage(t));
  if (!history) await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,物料组名称,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列甲,G1,物料组甲,,\n华东,A,产品甲,汤圆,系列甲,G1,物料组甲,,\n郑州,B,产品乙,水饺,系列乙,G2,物料组乙,,',
    ),
  });
  const selected = await frame.getByLabel('评估版本选择').locator('option:checked').textContent();
  const month = selected.match(/\d{4}-\d{2}/)[0];
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '提报.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n${month},郑州,A,产品甲,汤圆,系列甲,G1,60,60\n${month},华东,A,产品甲,汤圆,系列甲,G1,40,40\n${month},郑州,B,产品乙,水饺,系列乙,G2,20,20`,
    ),
  });
  if (history) {
    await frame.getByRole('button', { name: '读取去年发运占比源值', exact: true }).click();
    await expect(frame.getByText('全年历史读取中…')).toHaveCount(0);
    await seedLeafQuantities(
      frame,
      [
        ['郑州', 'A', '汤圆', 'G1', 60],
        ['华东', 'A', '汤圆', 'G1', 40],
        ['郑州', 'B', '水饺', 'G2', 20],
      ].map(([base, code, category, group, quantity]) => ({
        base,
        code,
        category,
        group,
        month,
        quantity,
        systemValue: null,
      })),
    );
  }
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  return {
    page,
    frame,
    month,
    table: frame.getByRole('table', { name: '加工后的需求明细', exact: true }),
  };
}

test('搜索单品直接展开各基地SKU，下载仅含当前范围，清空恢复原浏览', async (t) => {
  const { page, frame, table } = await skuPage(t);
  const base = table.getByRole('button', { name: '基地 · 郑州', exact: true });
  await expect(base).toHaveAttribute('aria-expanded', 'false');
  await expect(table.getByText('SKU · A 产品甲', { exact: true })).toHaveCount(0);
  const search = frame.getByLabel('搜索当前步骤', { exact: true });
  await search.fill('产品甲');
  await expect(table.getByText('SKU · A 产品甲', { exact: true })).toHaveCount(2);
  await expect(table.getByText('SKU · B 产品乙', { exact: true })).toHaveCount(0);
  await expect(base).toHaveAttribute('aria-expanded', 'true');
  const pending = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载当前范围需求', exact: true }).click();
  const csv = await mpsDownloadText(await (await pending).path());
  const book = XLSX.read(csv, { type: 'string', raw: true });
  const exported = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
  const exportedSkus = exported.filter((row) => row['产品编码']);
  assert.ok(exportedSkus.length > 0);
  assert.ok(exportedSkus.every((row) => row['产品编码'] === 'A'));
  await search.fill('');
  await expect(base).toHaveAttribute('aria-expanded', 'false');
  await expect(table.getByText('SKU · A 产品甲', { exact: true })).toHaveCount(0);
  await base.press('Enter');
  await expect(base).toHaveAttribute('aria-expanded', 'true');
  await search.fill('产品甲');
  await search.fill('');
  await expect(base).toHaveAttribute('aria-expanded', 'true');
  await expect(table.getByRole('button', { name: '郑州 大类 · 汤圆', exact: true })).toBeVisible();
  await expect(table.getByText('SKU · A 产品甲', { exact: true })).toHaveCount(0);
});

test('全国视角逐层汇总大类、物料组和SKU，不重复累计多月或多基地，基地视角可返回', async (t) => {
  const { page, frame, table } = await skuPage(t);
  await expect(frame.getByLabel('需求层级视角', { exact: true })).toBeVisible();
  await frame.getByLabel('需求层级视角', { exact: true }).selectOption('national');
  const total = table.locator('tbody tr').first();
  await expect(total.getByRole('rowheader')).toHaveText('全国合计');
  await expect(total.getByRole('cell').nth(0)).toHaveText('120');
  const category = table.getByRole('button', { name: '全国 大类 · 汤圆', exact: true });
  await expect(category).toHaveAttribute('aria-expanded', 'false');
  await category.press('Enter');
  const group = table.getByRole('button', { name: '全国 物料组 · G1 物料组甲', exact: true });
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await group.press('Enter');
  await expect(table.getByText('SKU · A 产品甲', { exact: true })).toHaveCount(1);
  for (const name of ['大类 · 汤圆', '物料组 · G1 物料组甲', 'SKU · A 产品甲']) {
    const row = table.getByRole('row').filter({ has: frame.getByText(name, { exact: true }) });
    await expect(row.getByRole('cell').nth(0)).toHaveText('100');
  }
  await expect(total.getByRole('cell').nth(0)).toHaveText('120');
  const search = frame.getByLabel('搜索当前步骤', { exact: true });
  await search.fill('产品乙');
  await expect(table.getByText('SKU · B 产品乙', { exact: true })).toBeVisible();
  await expect(total.getByRole('cell').nth(0)).toHaveText('20');
  await search.fill('');
  await expect(category).toHaveAttribute('aria-expanded', 'true');
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await expect(table.getByText('SKU · B 产品乙', { exact: true })).toHaveCount(0);
  if (process.env.MPS06_EVIDENCE_DIR) {
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.MPS06_EVIDENCE_DIR}/national-hierarchy.png` });
  }
  await frame.getByLabel('需求层级视角', { exact: true }).selectOption('base');
  await expect(table.getByRole('button', { name: '基地 · 郑州', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('基地SKU修正后父级读取有效数量，全国汇总与明细下载一致且不挤占其他基地', async (t) => {
  const { frame, table, month } = await skuPage(t, true);
  const base = table.getByRole('button', { name: '基地 · 郑州', exact: true });
  await base.press('Enter');
  await table.getByRole('button', { name: '郑州 大类 · 汤圆', exact: true }).press('Enter');
  await table
    .getByRole('button', { name: '郑州 物料组 · G1 物料组甲', exact: true })
    .press('Enter');
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await beginAdjustment(view);
  await view.getByLabel(`汤圆 G1 A 郑州 ${month} 需求数量`, { exact: true }).fill('50');
  await selectAdjustmentReason(view, '基地SKU数量复核');
  await saveAdjustment(view);
  const demandCell = async (name, expected) => {
    const row = table
      .getByRole('row')
      .filter({ has: frame.getByText(name, { exact: true }) })
      .first();
    const headers = await table.getByRole('columnheader').allTextContents();
    const index = headers.findIndex((header) => header.startsWith(`M+1 ${month} 需求`));
    await expect(row.getByRole('cell').nth(index - 1)).toContainText(expected);
  };
  await demandCell('SKU · A 产品甲', '50');
  await demandCell('物料组 · G1 物料组甲', '50');
  await demandCell('大类 · 汤圆', '50');
  await demandCell('基地 · 郑州', '70');
  await frame.getByLabel('需求层级视角', { exact: true }).selectOption('national');
  await table.getByRole('button', { name: '全国 大类 · 汤圆', exact: true }).press('Enter');
  await table
    .getByRole('button', { name: '全国 物料组 · G1 物料组甲', exact: true })
    .press('Enter');
  await demandCell('SKU · A 产品甲', '90');
  await demandCell('物料组 · G1 物料组甲', '90');
  await demandCell('大类 · 汤圆', '90');
  await demandCell('全国合计', '110');
  const exported = await workflowExportRows(frame);
  const skus = exported.filter((row) => row['月份'] === month && row['产品编码']);
  assert.deepEqual(
    skus
      .filter((row) => row['产品编码'] === 'A')
      .map((row) => Number(row['需求数量']))
      .sort(),
    [40, 50],
  );
  assert.equal(skus.find((row) => row['产品编码'] === 'B')['需求数量'], '20');
  await frame.getByText('数量调整与撤销记录（1）', { exact: true }).click();
  await expect(frame.getByRole('table', { name: '数量调整记录', exact: true })).toContainText(
    '基地SKU数量复核',
  );
});
