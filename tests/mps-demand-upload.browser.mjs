import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { authorPage } from './helpers/author-page.mjs';
import { workflowExportRows } from './helpers/mps-workflow-export.mjs';

const columns = '基地,SKU,月份,修正数量,调整原因,说明';
async function upload(frame, label, text) {
  await frame.getByLabel(label, { exact: true }).setInputFiles({
    name: '需求.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(text),
  });
}
async function draft(page) {
  return page.evaluate(() => {
    const state = window.readView().localDrafts;
    return state.drafts.find((row) => row.id === state.selected);
  });
}
async function setup(t) {
  const page = await authorPage(t);
  page.setDefaultTimeout(10000);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,物料组名称,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,G1,物料组,,\n郑州,B,产品乙,汤圆,系列,G1,物料组,,\n华东,A,产品甲,汤圆,系列,G1,物料组,,',
  );
  const month = (await draft(page)).month;
  await upload(
    frame,
    '选择计划提报CSV',
    `月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n${month},郑州,A,产品甲,汤圆,系列,G1,60,60\n${month},郑州,B,产品乙,汤圆,系列,G1,40,40\n${month},华东,A,产品甲,汤圆,系列,G1,20,20`,
  );
  await expect.poll(async () => (await draft(page)).inputs.report?.rows.length).toBe(3);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  return {
    page,
    frame,
    month,
    view: frame.getByRole('region', { name: '需求加工与收敛', exact: true }),
  };
}

test('CSV预览不写入，点击确认仅改变基地SKU并保留系统依据、历史和第四月参考', async (t) => {
  const { page, frame, month, view } = await setup(t);
  const original = await draft(page);
  const referenceDate = new Date(`${month}-01T00:00:00Z`);
  referenceDate.setUTCMonth(referenceDate.getUTCMonth() + 3);
  const fourth = referenceDate.toISOString().slice(0, 7);
  await upload(
    frame,
    '选择需求修正CSV',
    `${columns}\n郑州,A,${month},55.75,销售变化,\n郑州,A,${fourth},7,其他,第四月库存参考`,
  );
  const preview = frame.getByRole('dialog', { name: '确认需求修正上传', exact: true });
  await expect(preview)
    .toContainText('55.75')
    .catch(async (failure) => {
      t.diagnostic(JSON.stringify(await frame.getByRole('alert').allTextContents()));
      throw failure;
    });
  await expect(preview).toContainText('第四月库存参考');
  assert.deepEqual(await draft(page), original);
  await preview.getByRole('button', { name: '确认应用修正', exact: true }).click();
  await expect(preview).toHaveCount(0);
  const saved = await draft(page);
  assert.equal(saved.adjustments.quantities.length, 2);
  assert.equal(saved.adjustments.quantities[0].quantity, 55.75);
  assert.equal(saved.adjustments.quantities[1].reason, '其他：第四月库存参考');
  assert.equal(saved.adjustments.history.length, 2);
  assert.deepEqual(saved.inputs, original.inputs);
  const rows = await workflowExportRows(frame);
  const selected = rows.find(
    (row) => row['基地'] === '郑州' && row['产品编码'] === 'A' && row['月份'] === month,
  );
  assert.equal(Number(selected['需求数量']), 55.75);
  assert.equal(selected['调整原因'], '销售变化');
  assert.equal(
    Number(
      rows.find(
        (row) => row['基地'] === '郑州' && row['产品编码'] === 'A' && row['月份'] === fourth,
      )['需求数量'],
    ),
    7,
  );
  await view.getByLabel('搜索当前步骤').fill('产品甲');
  await view.getByRole('button', { name: '调整', exact: true }).click();
  await view.getByLabel(`汤圆 G1 A 郑州 ${month} 需求数量`, { exact: true }).fill('');
  await view.getByLabel('批量调整原因', { exact: true }).selectOption('数据纠错');
  await view.getByRole('button', { name: '保存调整', exact: true }).click();
  const undone = await draft(page);
  assert.equal(undone.adjustments.quantities.length, 1);
  assert.equal(undone.adjustments.history.at(-1).action, 'undo');
  assert.equal(undone.adjustments.history[0].reason, '销售变化');
});
