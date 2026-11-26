import { openMpsProductDetails } from './helpers/mps-page.mjs';
import { expandShipmentBase } from './helpers/mps-shipment.mjs';
import {
  beginAdjustment,
  saveAdjustment,
  selectAdjustmentReason,
  workflowStep,
} from './helpers/mps-edit.mjs';
import { adjustLeaf } from './helpers/mps-edit.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { authorPage } from './helpers/author-page.mjs';

test('MPS local product inputs recover after Document replacement and release clears the page', async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  let frame = page.frameLocator('iframe');
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '本地产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,物料组名称,老品编码,老品名称\n郑州,A,恢复产品,汤圆,系列,组,组名称,,',
    ),
  });
  let products = await openMpsProductDetails(frame);
  await expect(products.getByRole('cell', { name: '恢复产品', exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(
        () => window.readView()?.localDrafts?.drafts?.[0]?.inputs?.products?.rows?.[0]?.产品名称,
      ),
    )
    .toBe('恢复产品');
  await page.locator('iframe').evaluate((element) => element.setAttribute('src', element.src));
  frame = page.frameLocator('iframe');
  products = await openMpsProductDetails(frame);
  await expect(products.getByRole('cell', { name: '恢复产品', exact: true })).toBeVisible();
  const saved = await page.evaluate(() => window.readView().localDrafts);
  assert.equal(saved.format, 1);
  assert.deepEqual(Object.keys(saved.drafts[0].inputs), ['products']);
  await page.evaluate(() => window.unassociate());
  await expect(products.getByRole('cell', { name: '恢复产品', exact: true })).toHaveCount(0);
});

test('MPS base SKU override records a reason and time, survives reload and undo restores the system value', async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,物料组名称,老品编码,老品名称\n郑州,A,产品,汤圆,系列,组,组名称,,',
    ),
  });
  const period = await frame.getByLabel('评估月份选择').inputValue();
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '叶子提报.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n${period},郑州,A,产品甲,汤圆,系列,组,100,100`,
    ),
  });
  const leaf = { category: '汤圆', group: '组', code: 'A', base: '郑州', month: period };
  await adjustLeaf(frame, leaf, '120.375', '客户已确认增量');
  const matrix = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await expect
    .poll(async () =>
      page.evaluate(
        () => window.readView()?.localDrafts?.drafts?.[0]?.adjustments?.quantities?.[0]?.quantity,
      ),
    )
    .toBe(120.375);
  await page.locator('iframe').evaluate((element) => element.setAttribute('src', element.src));
  await workflowStep(frame, '需求加工与收敛');
  await expect(matrix.getByText(/^数量调整与撤销记录/)).toHaveCount(0);
  await matrix.getByText('当前固定数量', { exact: true }).click();
  await expect(
    frame
      .getByRole('table', { name: '当前固定数量', exact: true })
      .getByRole('row')
      .filter({ hasText: '客户已确认增量' }),
  ).toContainText('120');
  const edit = await page.evaluate(
    () => window.readView().localDrafts.drafts[0].adjustments.quantities[0],
  );
  assert.equal(edit.reason, '其他：客户已确认增量');
  assert.match(edit.at, /^\d{4}-\d{2}-\d{2}T/);
  await matrix.getByLabel('搜索当前步骤', { exact: true }).fill('A');
  const adjust = frame
    .locator('.dc-adjustment-actions')
    .getByRole('button', { name: '调整', exact: true });
  await expect(adjust).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(adjust).toHaveCSS('background-color', 'rgb(223, 23, 50)');
  await adjust.click();
  await expect(matrix.getByLabel(`汤圆 组 A 郑州 ${period} 需求数量`, { exact: true })).toHaveValue(
    '120',
  );
  await frame
    .locator('.dc-adjustment-actions')
    .getByRole('button', { name: '保存调整', exact: true })
    .click();
  assert.equal(
    await page.evaluate(
      () => window.readView().localDrafts.drafts[0].adjustments.quantities[0].quantity,
    ),
    120.375,
  );
  await beginAdjustment(frame);
  await matrix.getByRole('button', { name: `撤销固定数量 汤圆 组 A 郑州 ${period}` }).click();
  await selectAdjustmentReason(frame, '恢复系统值');
  await saveAdjustment(frame);
  await expect
    .poll(async () =>
      page.evaluate(
        () => window.readView()?.localDrafts?.drafts?.[0]?.adjustments?.quantities?.length,
      ),
    )
    .toBe(0);
  const history = await page.evaluate(
    () => window.readView().localDrafts.drafts[0].adjustments.history,
  );
  assert.deepEqual(
    history.map((entry) => entry.action),
    ['set', 'undo'],
  );
  assert.equal(history[1].value, null);
  assert.equal(history[0].reason, '其他：客户已确认增量');
  await expect(matrix.getByText('当前固定数量', { exact: true })).toHaveCount(0);
  await expect(frame.getByRole('button', { name: '保存调整', exact: true })).toHaveCount(0);
  await expect(frame.locator('.dc-page-head').getByText('本地草稿', { exact: true })).toHaveCount(
    0,
  );
});

test('MPS shipment local overrides and remaining intake survive a business-source switch and Document replacement', async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await frame.locator('body').page().clock.setFixedTime(new Date('2026-10-15T12:00:00+08:00'));
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await dialog.getByLabel('评估月份', { exact: true }).fill('2026-10');
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,物料组名称,老品编码,老品名称\n郑州,A,产品A,汤圆,系列,组,组名称,,',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await frame.getByLabel('数据截止日', { exact: true }).fill('2026-09-22');
  await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
    name: '发货.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库\n2026-09,郑州,A,产品A,汤圆,系列,组,220,10,10,10,100,200,80',
    ),
  });
  const table = frame.getByRole('table', { name: '本月预估发货明细' });
  await expect(
    table.getByRole('button', { name: '郑州 整月预估发货 计算过程', exact: true }),
  ).toHaveText('300');
  await expandShipmentBase(frame, '郑州');
  const forecast = table.getByLabel('郑州 A 整月预估发货', { exact: true });
  await beginAdjustment(frame);
  await forecast.fill('301');

  const remaining = table.getByLabel('郑州 剩余天数入库', { exact: true });
  await remaining.fill('11');
  await saveAdjustment(frame);
  await frame.getByLabel('发货数据来源', { exact: true }).selectOption('business');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window
            .readView()
            ?.localDrafts?.drafts?.find(
              (draft) => draft.id === window.readView()?.localDrafts?.selected,
            )?.shipment?.activeSource,
      ),
    )
    .toBe('business');
  await page.locator('iframe').evaluate((element) => element.setAttribute('src', element.src));
  await frame.getByLabel('发货数据来源', { exact: true }).selectOption('local-file');
  await expandShipmentBase(frame, '郑州');
  await expect(
    table.getByRole('button', { name: '郑州 A 整月预估发货 计算过程', exact: true }),
  ).toHaveText('301');
  await expect(
    table.getByRole('button', { name: '郑州 剩余天数入库 计算过程', exact: true }),
  ).toHaveText('11');
  await expect(
    table.getByRole('button', { name: '郑州 A 剩余天数入库 计算过程', exact: true }),
  ).toHaveText('11');
});
