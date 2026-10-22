import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { mpsPage } from './helpers/mps-page.mjs';
const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const product = Object.fromEntries(
  config.queries['products.detail'].columns.map((key) => [key, null]),
);
Object.assign(product, {
  material_code: '',
  material_name: '源产品甲',
  product_item: '101005',
  source_rows: 1,
});
const annual = {
  belong_base: '全国',
  sub_category: '汤圆',
  stat_month: '2026年10月',
  source_rows: 1,
  missing_qty: 0,
  duplicate_rows: 0,
  demand_qty: 100,
  update_time: null,
};
const livePage = (t, execute) => mpsPage(t, config, execute);
function fixture({ queryId, parameters }) {
  let rows;
  if (queryId.endsWith('.count')) rows = [{ total: 1 }];
  else if (queryId === 'products.detail') rows = [product];
  else if (queryId === 'annual.summary') rows = [annual];
  else
    rows = [
      Object.fromEntries(
        config.queries[queryId].columns.map((key) => [key, key === 'source_rows' ? 1 : '源字段']),
      ),
    ];
  if (parameters.offset > 0) rows = [];
  return {
    rows,
    returnedColumns: Object.keys(rows[0] ?? {}),
    rejectedColumns: [],
    configVersion: 'fixture-v1',
  };
}
test('MPS reads governed products and annual demand, preserves missing dimensions and queries every source by name', async (t) => {
  const { frame, calls } = await livePage(t, fixture);
  const products = frame.getByRole('region', { name: '产品明细', exact: true });
  await expect(products).toContainText('源产品甲');
  await expect(products.locator('.dc-demo')).toHaveCount(0);
  await expect(products.locator('tbody tr').first().locator('td').first()).toHaveText('—');
  const annualTable = frame.getByRole('region', { name: '年度销售计划', exact: true });
  await expect(annualTable).toContainText('100');
  await expect(annualTable).toContainText('源数量');
  assert(calls.some((call) => call.queryId === 'annual.summary'));
  await frame.getByRole('button', { name: '数据源', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '月主计划数据源', exact: true });
  for (const [kind, name] of Object.entries({
    products: '产品清单',
    annual: '年度需求',
    tunnels: '隧道产能',
    sku_capacity: '产线SKU产能',
    transfers: '调拨方向',
  })) {
    await dialog.getByRole('tab', { name, exact: true }).click();
    await expect(dialog).toContainText('共1条');
    await expect.poll(() => calls.some((call) => call.queryId === kind + '.detail')).toBe(true);
  }
  await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await frame.getByLabel('产品数据来源', { exact: true }).selectOption('demo');
  await expect(products).toContainText('演示数据');
  await expect(products.locator('tbody tr')).toHaveCount(15);
});
test('MPS denies without falling back to samples and discards a late response after switching versions', async (t) => {
  let deny = true,
    release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const { frame, calls } = await livePage(t, async (query) => {
    if (query.queryId === 'products.detail') {
      if (deny) throw Error('AGENT_ACCESS_DENIED');
      await pending;
    }
    return fixture(query);
  });
  const products = frame.getByRole('region', { name: '产品明细', exact: true });
  await expect(products.getByRole('alert')).toBeVisible();
  await expect(products.locator('tbody tr')).toHaveCount(0);
  deny = false;
  await products.getByRole('button', { name: '同步产品', exact: true }).click();
  await expect
    .poll(() => calls.filter((call) => call.queryId === 'products.detail').length)
    .toBe(2);
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const version = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await version.getByLabel('评估月份', { exact: true }).fill('2027-01');
  await version.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('产品数据来源', { exact: true }).selectOption('demo');
  release();
  await expect(products.locator('tbody tr')).toHaveCount(15);
  await expect(frame.getByLabel('评估版本选择').locator('option:checked')).toContainText('2027-01');
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame
    .getByRole('dialog', { name: '新建评估版本', exact: true })
    .getByRole('button', { name: '取消', exact: true })
    .click();
  await expect(products.locator('tbody tr')).toHaveCount(15);
  await expect(products).not.toContainText('源产品甲');
});
test('MPS keeps national and base annual quantities separate, preserves zero and blocks duplicate source quantities', async (t) => {
  const records = [
    annual,
    { ...annual, belong_base: '华东', stat_month: 'Oct-26', demand_qty: 200 },
    { ...annual, sub_category: '饺子', demand_qty: 0 },
    { ...annual, sub_category: '饼类', duplicate_rows: 2, demand_qty: 999 },
  ];
  const { page, frame } = await livePage(t, (query) => {
    if (query.queryId === 'annual.summary.count')
      return { ...fixture(query), rows: [{ total: records.length }] };
    if (query.queryId === 'annual.summary') return { ...fixture(query), rows: records };
    return fixture(query);
  });
  const section = frame.getByRole('region', { name: '年度销售计划', exact: true });
  await expect(section.getByLabel('年度需求基地')).toHaveValue('全国');
  await expect(
    section
      .locator('tbody tr')
      .filter({ has: frame.getByRole('cell', { name: '汤圆', exact: true }) }),
  ).toContainText('100');
  await expect(section).not.toContainText('300');
  const zero = section
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: '饺子', exact: true }) });
  await expect(zero.locator('details summary').first()).toHaveText('0');
  const duplicate = section
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: '饼类', exact: true }) });
  await expect(duplicate).not.toContainText('999');
  await duplicate.locator('details summary').first().click();
  await expect(duplicate).toContainText('源粒度重复');
  const downloaded = page.waitForEvent('download');
  await section.getByRole('button', { name: '下载', exact: true }).click();
  const csv = await readFile(await (await downloaded).path(), 'utf8');
  assert.match(csv, /基地,月份,大类,数量,源月份,源记录数,缺失数量,重复记录数/);
  assert.match(csv, /全国,2026-10,汤圆,100,2026年10月/);
  assert.match(csv, /华东,2026-10,汤圆,200,Oct-26/);
  await section.getByLabel('年度需求基地').selectOption('华东');
  await expect(section.locator('tbody tr')).toHaveCount(1);
  await expect(section).toContainText('200');
  await expect(section).not.toContainText('100');
});
