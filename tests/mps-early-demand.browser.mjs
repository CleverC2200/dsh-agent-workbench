import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import {
  mpsPageWithExactProductPeriod as mpsPage,
  openMpsProductDetails,
} from './helpers/mps-page.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';
import { beginAdjustment, saveAdjustment } from './helpers/mps-edit.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const products = ['郑州', 'ODM'].map((base) => ({
  ...Object.fromEntries(config.queries['products.detail'].columns.map((key) => [key, null])),
  stat_period: '2026-11',
  target_base: base,
  transfer_tag: base === 'ODM' ? 'ODM代工品' : '自产',
  material_code: '001',
  material_name: '产品甲',
  product_item: '组甲',
  responsible_item: '汤圆',
  series: '系列甲',
  source_rows: 1,
}));
const source = ({ queryId }) => ({
  rows:
    queryId === 'products.detail'
      ? products
      : queryId.endsWith('.count')
        ? [{ total: queryId === 'products.count' ? products.length : 0 }]
        : [],
  returnedColumns: config.queries[queryId].columns,
  configVersion: 'early-demand-v5',
});

test('前三步产品详情与业务下载仅保留实际需求基地，不展示供给标签', async (t) => {
  const { page, frame } = await mpsPage(t, config, source);
  const section = await openMpsProductDetails(frame);
  await section.getByRole('button', { name: '查看产品 001 的源字段', exact: true }).click();
  const details = frame.getByRole('dialog', { name: '产品源字段与物料组SKU', exact: true });
  await expect(details).toContainText('郑州');
  await expect(details).not.toContainText('ODM');
  await expect(details.getByRole('columnheader', { name: '调拨标签', exact: true })).toHaveCount(0);
  await details.getByRole('button', { name: '关闭', exact: true }).click();
  const pending = page.waitForEvent('download');
  await section.getByRole('button', { name: '下载产品源字段', exact: true }).click();
  const csv = await mpsDownloadText(await (await pending).path());
  assert.match(csv, /郑州/);
  assert.doesNotMatch(csv, /ODM|调拨标签|自产/);
  await section.getByLabel('搜索产品', { exact: true }).fill('ODM');
  await expect(section.locator('tbody tr')).toHaveCount(0);
});

test('第三步基地筛选不混入供给配置基地，真实基地需求仍可下载', async (t) => {
  const { page, frame } = await mpsPage(t, config, source);
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '真实需求.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,001,产品甲,汤圆,系列甲,组甲,,',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  await beginAdjustment(frame);
  const constraints = frame.getByRole('region', { name: '约束与配置', exact: true });
  await constraints.locator('summary').filter({ hasText: '高级配置：' }).click();
  await constraints.getByRole('button', { name: '新增产能资源', exact: true }).click();
  await constraints.getByLabel('资源1 基地', { exact: true }).fill('ODM');
  await constraints.getByLabel('资源1 名称', { exact: true }).fill('供方');
  await saveAdjustment(frame);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const process = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  const bases = process.getByLabel('基地筛选', { exact: true });
  await expect(bases.locator('option')).toContainText(['全部', '郑州']);
  await expect(bases.locator('option', { hasText: 'ODM' })).toHaveCount(0);
  const pending = page.waitForEvent('download');
  await process.getByRole('button', { name: '下载当前范围需求', exact: true }).click();
  const csv = await mpsDownloadText(await (await pending).path());
  assert.match(csv, /郑州/);
  assert.doesNotMatch(csv, /ODM|供给标签/);
});

test('前三步数据源详情与下载不提供供给字段，后续步骤保留供给来源入口', async (t) => {
  const { page, frame } = await mpsPage(t, config, source);
  for (const step of ['需求确认', '本月预估发货', '需求加工与收敛']) {
    await frame.locator('.ap-page-tab').filter({ hasText: step }).click();
    await frame.getByRole('button', { name: '数据源', exact: true }).click();
    const dialog = frame.getByRole('dialog', { name: '月主计划数据源', exact: true });
    await expect(dialog.getByRole('cell', { name: '郑州', exact: true })).toBeVisible();
    await expect(dialog.getByRole('tab', { name: '调拨方向', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('tab', { name: 'SKU隧道产能', exact: true })).toHaveCount(0);
    await expect(dialog).not.toContainText('ODM');
    const pending = page.waitForEvent('download');
    await dialog.getByRole('button', { name: '下载当前页', exact: true }).click();
    const csv = await mpsDownloadText(await (await pending).path());
    assert.match(csv, /郑州/);
    assert.doesNotMatch(csv, /ODM|调拨品标签|transfer_tag|自产/);
    await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  }
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估与缺口' }).click();
  await frame.getByRole('button', { name: '数据源', exact: true }).click();
  await expect(frame.getByRole('tab', { name: '调拨方向', exact: true })).toBeVisible();
});
