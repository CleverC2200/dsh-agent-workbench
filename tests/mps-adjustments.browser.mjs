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
  const products = () => frame.getByRole('region', { name: '产品明细', exact: true });
  await expect(products().getByRole('cell', { name: '恢复产品', exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(
        () => window.readView()?.localDrafts?.drafts?.[0]?.inputs?.products?.rows?.[0]?.产品名称,
      ),
    )
    .toBe('恢复产品');
  await page.locator('iframe').evaluate((element) => element.setAttribute('src', element.src));
  frame = page.frameLocator('iframe');
  await expect(products().getByRole('cell', { name: '恢复产品', exact: true })).toBeVisible();
  const saved = await page.evaluate(() => window.readView().localDrafts);
  assert.equal(saved.format, 1);
  assert.deepEqual(Object.keys(saved.drafts[0].inputs), ['products']);
  await page.evaluate(() => window.unassociate());
  await expect(products().getByRole('cell', { name: '恢复产品', exact: true })).toHaveCount(0);
});

test('MPS category override records a reason and time, survives reload and undo restores the system value', async (t) => {
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
  const month = await frame.getByLabel('评估版本选择').locator('option:checked').textContent();
  const period = month.match(/\d{4}-\d{2}/)[0];
  await frame.getByRole('button', { name: `调整 汤圆 ${period}`, exact: true }).click();
  const form = frame.getByRole('group', { name: '大类需求调整' });
  await form.getByLabel('调整需求数量').fill('120');
  await form.getByLabel('调整原因').fill('客户已确认增量');
  await form.getByRole('button', { name: '应用大类调整' }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          window.readView()?.localDrafts?.drafts?.[0]?.adjustments?.categoryDemand?.[0]?.quantity,
      ),
    )
    .toBe(120);
  await page.locator('iframe').evaluate((element) => element.setAttribute('src', element.src));
  await frame.getByText('查看系统值、调整与缺项说明', { exact: true }).click();
  await expect(
    frame
      .getByRole('region', { name: '逐月测算', exact: true })
      .getByRole('row')
      .filter({ hasText: '客户已确认增量' }),
  ).toContainText('120');
  const edit = await page.evaluate(
    () => window.readView().localDrafts.drafts[0].adjustments.categoryDemand[0],
  );
  assert.equal(edit.reason, '客户已确认增量');
  assert.match(edit.at, /^\d{4}-\d{2}-\d{2}T/);
  await frame.getByRole('button', { name: `撤销 汤圆 ${period}`, exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        () => window.readView()?.localDrafts?.drafts?.[0]?.adjustments?.categoryDemand?.length,
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
  await expect(frame.getByRole('button', { name: '保存调整', exact: true })).toBeDisabled();
});

test('MPS shipment local overrides and remaining intake survive a business-source switch and Document replacement', async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await dialog.getByLabel('评估月份', { exact: true }).fill('2026-10');
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
    name: '发货.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库\n2026-09,郑州,A,产品A,汤圆,系列,组,220,10,10,10,100,200,80',
    ),
  });
  const table = frame.getByRole('table', { name: '本月预估发货明细' });
  await frame.getByRole('button', { name: '展开 郑州', exact: true }).click();
  const forecast = table.getByLabel('郑州 A 整月预估发货', { exact: true });
  await forecast.fill('301');
  await forecast.press('Enter');
  const remaining = table.getByLabel('郑州 剩余天数入库', { exact: true });
  await remaining.fill('11');
  await remaining.press('Enter');
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
  await frame.getByRole('button', { name: '展开 郑州', exact: true }).click();
  await expect(forecast).toHaveValue('301');
  await expect(remaining).toHaveValue('11');
  await expect(
    table.getByRole('button', { name: '郑州 A 剩余天数入库 计算过程', exact: true }),
  ).toHaveText('11');
});
