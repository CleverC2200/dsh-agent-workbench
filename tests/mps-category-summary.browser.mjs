import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { authorPage } from './helpers/author-page.mjs';
import { openCategoryCalculation } from './helpers/mps-edit.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

test('category monthly totals retain missing inputs and follow the same filter as calculations and downloads', async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const creation = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await creation.getByLabel('评估月份', { exact: true }).fill('2026-12');
  await creation.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '大类.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,甲产品,甲类,系列,组,,\n郑州,B,乙产品,乙类,系列,组,,\n郑州,C,丙产品,丙类,系列,组,,',
    ),
  });
  const matrix = frame.getByRole('region', { name: '大类预估需求数量', exact: true });
  const total = () => matrix.getByRole('row').filter({ hasText: /^(合计|当前范围合计)/ });
  await expect(total()).toHaveCount(1);
  await expect(total().locator('.dc-demand-amount')).toHaveText(['待补', '待补', '待补', '待补']);
  await expect(total()).not.toContainText('0');
  await matrix.getByRole('button', { name: '调整', exact: true }).click();
  await matrix.getByLabel('甲类 2026-12 需求数量', { exact: true }).fill('10.4');
  await matrix.getByLabel('乙类 2026-12 需求数量', { exact: true }).fill('5.4');
  await matrix.getByLabel('甲类 2027-01 需求数量', { exact: true }).fill('0');
  await matrix.getByLabel('乙类 2027-01 需求数量', { exact: true }).fill('7');
  await matrix.getByLabel('批量调整原因', { exact: true }).fill('合计核对');
  await matrix.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect(total().locator('.dc-demand-amount')).toHaveText(['16', '7', '待补', '待补']);
  await expect(total().getByRole('cell').nth(1)).toContainText('已知小计 · 1项待补');
  await openCategoryCalculation(frame);
  const calculation = frame.getByRole('region', { name: '逐月测算', exact: true });
  await expect(calculation.locator('tbody tr')).toHaveCount(12);
  await matrix.getByLabel('大类筛选', { exact: true }).selectOption('乙类');
  await expect(matrix.locator('tbody tr')).toHaveCount(2);
  await expect(total().locator('.dc-demand-amount')).toHaveText(['5', '7', '待补', '待补']);
  await expect(total().getByRole('cell').nth(1)).not.toContainText('待补');
  await expect(calculation.locator('tbody tr')).toHaveCount(4);
  await expect(calculation.locator('tbody tr td:first-child')).toHaveText([
    '乙类',
    '乙类',
    '乙类',
    '乙类',
  ]);
  await expect(calculation).toContainText('2 / 4 项可计算');
  const downloading = page.waitForEvent('download');
  await calculation.getByRole('button', { name: '下载测算明细', exact: true }).click();
  const csv = await mpsDownloadText(await (await downloading).path());
  assert.match(csv, /乙类/);
  assert.doesNotMatch(csv, /甲类|丙类/);
  await matrix.getByRole('button', { name: '调整', exact: true }).click();
  await expect(matrix.getByRole('textbox', { name: /需求数量$/ })).toHaveCount(4);
  await matrix.getByLabel('乙类 2026-12 需求数量', { exact: true }).fill('25');
  await matrix.getByLabel('批量调整原因', { exact: true }).fill('筛选内更新');
  await matrix.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect(total().locator('.dc-demand-amount').first()).toHaveText('25');
  await matrix.getByLabel('大类筛选', { exact: true }).selectOption('');
  await expect(total().locator('.dc-demand-amount').first()).toHaveText('35');
  await expect(calculation.locator('tbody tr')).toHaveCount(12);
  if (process.env.MPS03_EVIDENCE_DIR) {
    await matrix.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.MPS03_EVIDENCE_DIR}/category-summary.png` });
  }
});
