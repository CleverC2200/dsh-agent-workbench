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
  await expect(products.locator('tbody tr').first().locator('td').first()).toHaveText('-');
  const annualTable = frame.getByRole('region', { name: '年度销售计划', exact: true });
  await annualTable.getByRole('button', { name: '展开年度销售计划' }).click();
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
  await expect(frame.getByLabel('产品数据来源', { exact: true })).toHaveCount(0);
  await expect(products).not.toContainText('演示数据');
});
test('MPS denies without falling back to samples and discards a late response after switching versions', async (t) => {
  let deny = true,
    attempt = 0,
    release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  t.after(() => release());
  const { frame, calls } = await livePage(t, async (query) => {
    if (query.queryId === 'products.detail') {
      if (deny) throw Error('AGENT_ACCESS_DENIED');
      const current = ++attempt;
      if (current === 1) await pending;
      return {
        ...fixture(query),
        rows: [{ ...product, material_name: current === 1 ? '过期产品' : '新版产品' }],
      };
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
  await expect(products).toContainText('新版产品');
  release();
  await expect(products.locator('tbody tr')).toHaveCount(1);
  await expect(frame.getByLabel('评估版本选择').locator('option:checked')).toContainText('2027-01');
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame
    .getByRole('dialog', { name: '新建评估版本', exact: true })
    .getByRole('button', { name: '取消', exact: true })
    .click();
  await expect(products.locator('tbody tr')).toHaveCount(1);
  await expect(products).toContainText('新版产品');
  await expect(products).not.toContainText('过期产品');
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
  await section.getByRole('button', { name: '展开年度销售计划' }).click();
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

test('MPS product details start with ten rows and keep pagination aligned with filters', async (t) => {
  const records = Array.from({ length: 56 }, (_, index) => ({
    ...product,
    product_item: String(index).padStart(6, '0'),
    material_code: String(index).padStart(6, '0'),
    material_name: `产品${String(index).padStart(2, '0')}`,
  }));
  const { frame } = await livePage(t, (query) => {
    if (query.queryId === 'products.count')
      return { ...fixture(query), rows: [{ total: records.length }] };
    if (query.queryId === 'products.detail') return { ...fixture(query), rows: records };
    return fixture(query);
  });
  const section = frame.getByRole('region', { name: '产品明细', exact: true });
  await expect(section.locator('tbody tr')).toHaveCount(10);
  await expect(section.getByLabel('每页产品条数')).toHaveValue('10');
  await section.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(section.locator('tbody tr').first()).toContainText('产品10');
  await section.getByLabel('每页产品条数').selectOption('25');
  await expect(section.locator('tbody tr')).toHaveCount(25);
  await expect(section.locator('tbody tr').first()).toContainText('产品00');
  await section.getByLabel('每页产品条数').selectOption('50');
  await expect(section.locator('tbody tr')).toHaveCount(50);
  await section.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(section.locator('tbody tr')).toHaveCount(6);
  await section.getByLabel('搜索产品').fill('产品55');
  await expect(section.locator('tbody tr')).toHaveCount(1);
  await expect(section.locator('tbody tr')).toContainText('产品55');
  const toggle = section.getByRole('button', { name: '收起产品明细', exact: true });
  await toggle.click();
  await expect(section.locator('table')).toBeHidden();
  await section.getByRole('button', { name: '展开产品明细', exact: true }).click();
  await expect(section.locator('tbody tr')).toBeVisible();
  await expect(section.getByLabel('产品数据来源', { exact: true })).toHaveCount(0);
  await expect(section.getByRole('button', { name: 'CSV模板', exact: true })).toHaveCount(0);
});

test('annual plan starts collapsed and keeps sync beside its detail title without a template', async (t) => {
  const { frame } = await livePage(t, fixture);
  const section = frame.getByRole('region', { name: '年度销售计划', exact: true });
  await expect(section.getByRole('button', { name: '展开年度销售计划' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(section.locator('table')).toBeHidden();
  const sync = section.getByRole('button', { name: '同步数据源', exact: true });
  await expect(sync).toBeVisible();
  await expect(sync.locator('..')).toContainText('年度销售计划 · 分月明细');
  await expect(section.getByRole('button', { name: 'CSV模板', exact: true })).toHaveCount(0);
  await section.getByRole('button', { name: '展开年度销售计划' }).click();
  await expect(section.locator('table')).toBeVisible();
  await expect(section.getByRole('button', { name: '下载', exact: true })).toBeVisible();
});

test('annual explanations show rounded results without numeric substitution and preserve source decimals', async (t) => {
  const { page, frame, contexts } = await livePage(t, fixture);
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const version = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await version.getByLabel('评估月份', { exact: true }).fill('2026-10');
  await version.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择年度计划CSV', { exact: true }).setInputFiles({
    name: '年度小数核对.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,大类,数量\n2026-07,汤圆,12.5\n2026-07,汤圆,12.5\n2026-08,汤圆,12.5\n2026-09,汤圆,',
    ),
  });
  const section = frame.getByRole('region', { name: '年度销售计划', exact: true });
  await section.getByRole('button', { name: '展开年度销售计划' }).click();
  const category = section
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: '汤圆', exact: true }) });
  const july = category.locator('td').nth(1);
  const august = category.locator('td').nth(2);
  const september = category.locator('td').nth(3);
  const total = category.locator('td').last();
  await expect(july.locator('summary').first()).toHaveText('25');
  await expect(august.locator('summary').first()).toHaveText('13');
  await expect(total.locator('summary')).toHaveText('38（已读）');
  await july.locator('summary').first().click();
  await august.locator('summary').last().click();
  await september.locator('summary').first().click();
  await total.locator('summary').click();
  await expect(august).toContainText('结果：-50%');
  await expect(september).toContainText('数量缺失');
  await expect(category).not.toContainText('代入：');
  await expect(category).not.toContainText('12.5');
  await expect
    .poll(
      () =>
        contexts.at(-1)?.parts?.check?.annualSelection?.rows.filter((row) => row['数量'] === '12.5')
          .length,
    )
    .toBe(3);
  const download = page.waitForEvent('download');
  await section.getByRole('button', { name: '下载', exact: true }).click();
  const csv = await readFile(await (await download).path(), 'utf8');
  assert.equal(csv.match(/12\.5/g)?.length, 3);
});
