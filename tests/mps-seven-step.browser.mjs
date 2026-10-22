import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { authorPage } from './helpers/author-page.mjs';

test('MPS seven steps share the selected evaluation without legacy simulation controls', async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本' });
  await dialog.getByLabel('评估月份', { exact: true }).fill('2026-12');
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV', { exact: true }).setInputFiles({
    name: '当前评估产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,001,产品甲,汤圆,系列甲,物料组甲,,',
    ),
  });
  const steps = [
    '需求确认',
    '本月预估发货',
    '需求加工与收敛',
    '主数据对应关系',
    '约束与配置',
    '产能评估与缺口',
    '产销存报告',
  ];
  await expect(frame.locator('.ap-page-tab')).toHaveCount(7);
  for (const step of steps) {
    await frame.locator('.ap-page-tab').filter({ hasText: step }).click();
    await expect(frame.getByRole('heading', { name: step, exact: true, level: 1 })).toBeVisible();
    await expect(frame.getByLabel('评估版本选择').locator('option:checked')).toContainText(
      '2026-12',
    );
    await expect(frame.getByText('需求权重', { exact: true })).toHaveCount(0);
    assert(!/模拟|40\/40\/20/.test(await frame.locator('body').innerText()));
  }
  assert.equal(await page.evaluate(() => window.peerDraft), '历史草稿，请保留。');
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  const download = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载产销存报告', exact: true }).click();
  const csv = await readFile(await (await download).path(), 'utf8');
  assert.match(csv, /2026-12/);
  assert.match(csv, /2027-01/);
  assert.match(csv, /2027-02/);
  assert(!csv.includes('2026-10'));
  assert.match(csv, /缺|未|待/);
});

test('MPS shipment closing inventory feeds the same-version assessment and report and is revoked on scope change', async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本' });
  await dialog.getByLabel('评估月份', { exact: true }).fill('2026-10');
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV', { exact: true }).setInputFiles({
    name: '当前评估产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列甲,物料组甲,,',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
    name: '发货核对.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库\n2026-09,郑州,A,产品甲,汤圆,系列甲,物料组甲,220,0,0,10,1000,200,100',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估与缺口' }).click();
  await expect(
    frame.getByRole('button', { name: '郑州 A 2026-10 期初库存 计算过程', exact: true }),
  ).toHaveText('1,000');
  await expect(
    frame.getByRole('button', { name: '郑州 A 2026-11 期初库存 计算过程', exact: true }),
  ).toHaveText('—');
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await frame.getByRole('button', { name: '展开 郑州', exact: true }).click();
  const estimate = frame.getByLabel('郑州 A 整月预估发货', { exact: true });
  await estimate.fill('500');
  await estimate.press('Enter');
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  await expect(
    frame.getByRole('button', { name: '郑州 A 2026-10 期初库存 计算过程', exact: true }),
  ).toHaveText('800');
  await frame.getByLabel('评估版本选择').selectOption('local-1');
  await expect(
    frame.getByRole('button', { name: '郑州 A 2026-10 期初库存 计算过程', exact: true }),
  ).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.peerDraft), '历史草稿，请保留。');
});
