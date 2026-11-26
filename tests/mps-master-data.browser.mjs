import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import {
  mpsPageWithExactProductPeriod as mpsPage,
  openMpsProductDetails,
} from './helpers/mps-page.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';
const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const product = Object.fromEntries(
  config.queries['products.detail'].columns.map((key) => [key, null]),
);
Object.assign(product, {
  material_code: '001',
  material_name: '源产品甲',
  target_base: '郑州',
  responsible_item: '汤圆',
  product_item: '101005',
  source_rows: 1,
});
const annual = {
  belong_base: '郑州',
  material_code: '001',
  sub_category: '汤圆',
  stat_month: '2026年10月',
  source_rows: 1,
  missing_qty: 0,
  duplicate_rows: 0,
  demand_qty: 100,
  update_time: null,
};
const livePage = (t, execute) => mpsPage(t, config, execute, { time: '2026-11-15T12:00:00+08:00' });
function fixture({ queryId, parameters }) {
  let rows;
  if (queryId.startsWith('products.prices'))
    rows = queryId.endsWith('.count') ? [{ total: 0 }] : [];
  else if (queryId.endsWith('.count')) rows = [{ total: 1 }];
  else if (queryId === 'products.detail') rows = [{ ...product, stat_period: parameters.month }];
  else if (queryId === 'annual-pool.detail') rows = [annual];
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
  const products = await openMpsProductDetails(frame);
  await expect(products).toContainText('源产品甲');
  await expect(products.locator('.dc-demo')).toHaveCount(0);
  await expect(products.locator('tbody tr').first().locator('td').nth(3)).toHaveText('-');
  const annualTable = frame.getByRole('region', { name: '年度销售计划', exact: true });
  await annualTable.getByText('年度销售计划（分月）', { exact: true }).click();
  await expect(annualTable).toContainText('100');
  await expect(annualTable.getByRole('columnheader', { name: '全年合计' })).toBeVisible();
  assert(calls.some((call) => call.queryId === 'annual-pool.detail'));
  await expect(frame.getByLabel('产品数据来源', { exact: true })).toHaveCount(0);
  await expect(products).not.toContainText('演示数据');
  await frame.locator('.ap-page-tab').filter({ hasText: '主数据对应关系' }).click();
  await frame.getByRole('button', { name: '查看源表', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '月主计划数据源', exact: true });
  for (const [kind, name] of Object.entries({
    products: '产品清单',
    annual: '年度需求',
    tunnels: '隧道产能',
    sku_capacity: 'SKU隧道产能',
    transfers: '调拨方向',
  })) {
    await dialog.getByRole('tab', { name, exact: true }).click();
    await expect(dialog).toContainText('共1条');
    await expect.poll(() => calls.some((call) => call.queryId === kind + '.detail')).toBe(true);
  }
  await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
});
test('MPS product sync restores a locally deleted product and keeps edits when the source fails', async (t) => {
  const records = [
    { ...product, material_code: '001', material_name: '产品甲' },
    { ...product, material_code: '002', material_name: '产品乙' },
  ];
  let unavailable = false;
  const { frame, calls } = await livePage(t, (query) => {
    if (query.queryId === 'products.count')
      return { ...fixture(query), rows: [{ total: records.length }] };
    if (query.queryId === 'products.detail') {
      if (unavailable) throw Error('GEA SQL 查询服务暂时不可用');
      return {
        ...fixture(query),
        rows: records.map((row) => ({ ...row, stat_period: query.parameters.month })),
      };
    }
    return fixture(query);
  });
  const section = await openMpsProductDetails(frame);
  await expect(section.getByRole('button', { name: '删除 001', exact: true })).toBeVisible();
  await section.getByRole('button', { name: '删除 001', exact: true }).click();
  await expect(section.locator('tbody tr')).toHaveCount(1);
  await section.getByRole('button', { name: '同步产品', exact: true }).click();
  await expect(section.locator('tbody tr')).toHaveCount(2);
  assert.deepEqual(
    calls.filter((call) => call.queryId === 'products.detail').map((call) => call.parameters),
    [
      { month: '2026-11', page_size: 5000, offset: 0 },
      { month: '2026-11', page_size: 5000, offset: 0 },
    ],
  );
  await section.getByRole('button', { name: '删除 001', exact: true }).click();
  unavailable = true;
  await section.getByRole('button', { name: '同步产品', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('数据读取失败');
  await expect(section.locator('tbody tr')).toHaveCount(1);
  await expect(section.getByRole('button', { name: '删除 002', exact: true })).toBeVisible();
  await expect(section.getByRole('button', { name: '同步产品', exact: true })).toBeEnabled();
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
        rows: [
          {
            ...product,
            stat_period: query.parameters.month,
            material_name: current === 1 ? '过期产品' : '新版产品',
          },
        ],
      };
    }
    return fixture(query);
  });
  const products = await openMpsProductDetails(frame);
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
  await expect(frame.getByLabel('评估月份选择')).toHaveValue('2027-01');
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame
    .getByRole('dialog', { name: '新建评估版本', exact: true })
    .getByRole('button', { name: '取消', exact: true })
    .click();
  await expect(products.locator('tbody tr')).toHaveCount(1);
  await expect(products).toContainText('新版产品');
  await expect(products).not.toContainText('过期产品');
});
test('MPS derives national annual quantities from in-pool bases, preserves zero and blocks duplicate source quantities', async (t) => {
  const records = [
    annual,
    { ...annual, belong_base: '华东', stat_month: 'Oct-26', demand_qty: 200 },
    { ...annual, sub_category: '饺子', demand_qty: 0 },
    { ...annual, sub_category: '饼类', duplicate_rows: 2, demand_qty: 999 },
    ...Array.from({ length: 26 }, (_, index) => ({
      ...annual,
      sub_category: `其他大类${index}`,
      demand_qty: 1,
    })),
  ].map((row) => ({ ...row, material_code: '001-' + row.sub_category }));
  const { page, frame } = await livePage(t, (query) => {
    if (query.queryId === 'products.count')
      return { ...fixture(query), rows: [{ total: records.length }] };
    if (query.queryId === 'products.detail')
      return {
        ...fixture(query),
        rows: records.map((row) => ({
          ...product,
          stat_period: query.parameters.month,
          target_base: row.belong_base,
          material_code: row.material_code,
          material_name: '产品' + row.sub_category,
          responsible_item: row.sub_category,
        })),
      };
    const exported = records
      .filter((row) => row.belong_base === query.parameters.base)
      .map((row) => ({
        ...Object.fromEntries(
          config.queries['annual.export'].columns.map((column) => [column, null]),
        ),
        ...row,
        material_code: row.material_code,
        material_name: '产品' + row.sub_category,
        demand_qty: row.duplicate_rows ? null : row.demand_qty,
      }));
    if (query.queryId === 'annual.export.count')
      return { ...fixture(query), rows: [{ total: exported.length }] };
    if (query.queryId === 'annual.export')
      return {
        ...fixture(query),
        rows: exported,
        returnedColumns: config.queries['annual.export'].columns,
      };
    if (query.queryId === 'annual-pool.count')
      return { ...fixture(query), rows: [{ total: records.length }] };
    if (query.queryId === 'annual-pool.detail') return { ...fixture(query), rows: records };
    return fixture(query);
  });
  const section = frame.getByRole('region', { name: '年度销售计划', exact: true });
  await section.getByText('年度销售计划（分月）', { exact: true }).click();
  await expect(section.getByLabel('年度需求基地')).toHaveValue('全国');
  await expect(
    section
      .locator('tbody tr')
      .filter({ has: frame.getByRole('cell', { name: '汤圆', exact: true }) }),
  ).toContainText('300');
  const zero = section
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: '饺子', exact: true }) });
  await expect(zero.locator('details summary').first()).toHaveText('0');
  const duplicate = section
    .locator('tbody tr')
    .filter({ has: frame.getByRole('cell', { name: '饼类', exact: true }) });
  await expect(duplicate).not.toContainText('999');
  await duplicate.locator('details summary').first().click();
  await expect(duplicate).toContainText('数量缺失');
  const downloaded = page.waitForEvent('download');
  await section.getByRole('button', { name: '下载年度SKU模板', exact: true }).click();
  const csv = await mpsDownloadText(await (await downloaded).path());
  assert.match(csv, /基地,大类,老大类,物料组编码,物料组名称,物料编码,物料名称,2026-07/);
  assert.match(csv, /001-汤圆,产品汤圆/);
  assert.match(csv, /郑州/);
  assert.match(csv, /华东/);
  const scroll = section.locator('.dc-table-scroll');
  await expect
    .poll(() =>
      scroll.evaluate((element) => {
        element.scrollTop = 120;
        const header = element.querySelector('thead').getBoundingClientRect();
        return (
          element.scrollTop > 0 && Math.abs(header.top - element.getBoundingClientRect().top) < 2
        );
      }),
    )
    .toBe(true);
  await section.getByLabel('年度需求基地').selectOption('华东');
  await expect(section.locator('tbody tr')).toHaveCount(29);
  await expect(
    section
      .locator('tbody tr')
      .filter({ has: frame.getByRole('cell', { name: '汤圆', exact: true }) }),
  ).toContainText('200');
  await expect(section).not.toContainText('100');
});

test('MPS product details start collapsed, open with the keyboard and keep pagination aligned with filters', async (t) => {
  const records = Array.from({ length: 56 }, (_, index) => ({
    ...product,
    product_item: String(index).padStart(6, '0'),
    material_code: String(index).padStart(6, '0'),
    material_name: `产品${String(index).padStart(2, '0')}`,
  }));
  const { frame } = await livePage(t, (query) => {
    if (query.queryId === 'products.count')
      return { ...fixture(query), rows: [{ total: records.length }] };
    if (query.queryId === 'products.detail')
      return {
        ...fixture(query),
        rows: records.map((row) => ({ ...row, stat_period: query.parameters.month })),
      };
    return fixture(query);
  });
  const section = frame.getByRole('region', { name: '产品明细', exact: true });
  const toggle = section.locator(':scope > details > summary');
  await expect(toggle).toBeVisible();
  await expect(section.locator('table')).toBeHidden();
  await expect(section.getByRole('button', { name: '同步产品', exact: true })).toHaveCount(0);
  await expect(section.getByLabel('搜索产品')).toBeHidden();
  await expect(section.getByRole('button', { name: '下载产品明细', exact: true })).toBeHidden();
  await toggle.press('Enter');
  await expect(section.locator('table')).toBeVisible();
  assert.equal(
    await section.evaluate((card) => {
      const title = card.querySelector('summary').getBoundingClientRect();
      const search = card.querySelector('input[type="search"]').getBoundingClientRect();
      const body = card.querySelector('table').getBoundingClientRect();
      return title.top <= search.top && search.bottom <= title.bottom && title.bottom <= body.top;
    }),
    true,
  );
  await expect(section.locator('tbody tr')).toHaveCount(10);
  await expect(section.getByLabel('每页产品条数')).toHaveValue('10');
  const pager = section.getByRole('navigation', { name: '产品明细分页' });
  await expect(pager).toContainText('第1/6页 · 共56条');
  await expect(pager).not.toContainText('当前隔离版本');
  const layout = await pager.evaluate((nav) => {
    const scroll = nav.parentElement.querySelector('.dc-table-scroll');
    const button = nav.lastElementChild;
    const before = button.getBoundingClientRect().right;
    scroll.scrollLeft = scroll.scrollWidth;
    return {
      tableScrolled: scroll.scrollLeft > 0,
      footerMoved: before !== button.getBoundingClientRect().right,
      rightGap: nav.getBoundingClientRect().right - before,
    };
  });
  assert.deepEqual(layout, { tableScrolled: true, footerMoved: false, rightGap: 16 });
  await section.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(section.locator('tbody tr').first()).toContainText('产品10');
  await expect(pager).toContainText('第2/6页 · 共56条');
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
  await toggle.click();
  await expect(section.locator('table')).toBeHidden();
  await toggle.click();
  await expect(section.locator('tbody tr')).toBeVisible();
  await expect(section.getByLabel('产品数据来源', { exact: true })).toHaveCount(0);
  await expect(section.getByRole('button', { name: 'CSV模板', exact: true })).toHaveCount(0);
});

test('annual plan starts collapsed and puts sync and workbook download in its open toolbar', async (t) => {
  const { frame } = await livePage(t, fixture);
  const section = frame.getByRole('region', { name: '年度销售计划', exact: true });
  await expect(section.locator('details').first()).not.toHaveAttribute('open', '');
  await expect(section.locator('table')).toBeHidden();
  const sync = section.getByRole('button', { name: '同步数据源', exact: true });
  await expect(sync).toBeHidden();
  await expect(section.getByRole('button', { name: 'CSV模板', exact: true })).toHaveCount(0);
  await section.getByText('年度销售计划（分月）', { exact: true }).click();
  await expect(section.locator('table')).toBeVisible();
  await expect(sync).toBeVisible();
  await expect(sync.locator('..')).toContainText('下载年度SKU模板');
  const header = await section.locator('details > summary').first().boundingBox();
  const download = await section
    .getByRole('button', { name: '下载年度SKU模板', exact: true })
    .boundingBox();
  assert.ok(Math.abs(header.y + header.height / 2 - download.y - download.height / 2) <= 2);
  await expect(section.getByRole('button', { name: '下载年度SKU模板', exact: true })).toBeVisible();
});

test('年度计算大页回退，全年预览和工作簿保留计算窗口外月份', async (t) => {
  const june = { ...annual, stat_month: '2027-06', demand_qty: 987 };
  const sql = 'annual-pool.calculation.detail';
  const { page, frame, calls } = await mpsPage(
    t,
    config,
    (query) => {
      const { queryId, parameters } = query;
      if (queryId === sql && parameters.page_size === 10000)
        throw Error('GEA_SQL_RESULT_TOO_LARGE');
      if (queryId === sql) return { ...fixture(query), rows: [annual] };
      if (['annual-pool.count', 'annual.export.count'].includes(queryId))
        return { ...fixture(query), rows: [{ total: 2 }] };
      if (queryId === 'annual-pool.detail') return { ...fixture(query), rows: [annual, june] };
      if (queryId === 'annual.export') {
        const rows = [annual, june].map(({ stat_month, demand_qty }) => ({
          ...Object.fromEntries(config.queries[queryId].columns.map((key) => [key, null])),
          belong_base: '郑州',
          material_code: '001',
          sub_category: '汤圆',
          stat_month,
          demand_qty,
        }));
        rows[0].stat_month = '2026-10';
        return {
          rows,
          returnedColumns: config.queries[queryId].columns,
          configVersion: 'fixture-v1',
        };
      }
      return fixture(query);
    },
    { time: '2026-11-15T12:00:00+08:00', optimizedPaging: true },
  );
  const section = frame.getByRole('region', { name: '年度销售计划', exact: true });
  const exportButton = section.getByRole('button', { name: '下载年度SKU模板' });
  await expect
    .poll(() =>
      calls
        .filter(({ queryId }) => queryId === sql)
        .map(({ parameters }) => [parameters.page_size, parameters.offset]),
    )
    .toEqual([
      [10000, 0],
      [5000, 0],
    ]);
  assert(!calls.some(({ queryId }) => queryId === 'annual-pool.detail'));
  await section.getByText('年度销售计划（分月）', { exact: true }).click();
  await expect(section.getByRole('columnheader', { name: '2027-06' })).toBeVisible();
  await expect(section.getByText('987', { exact: true }).first()).toBeVisible();
  await expect(exportButton).toBeEnabled();
  const pending = page.waitForEvent('download');
  await exportButton.click();
  const book = XLSX.read(await readFile(await (await pending).path()));
  for (const sheet of ['SKU明细', '大类汇总（仅SKU）']) {
    const rows = XLSX.utils.sheet_to_json(book.Sheets[sheet]);
    assert.equal(rows.find((row) => row['大类'] === '汤圆')['2027-06'], 987);
  }
  assert.equal(calls.filter(({ queryId }) => queryId === 'annual-pool.detail').length, 1);
});

test('annual explanations show rounded results without numeric substitution and preserve source decimals', async (t) => {
  const { page, frame, contexts } = await livePage(t, fixture);
  await frame.locator('body').page().clock.setFixedTime(new Date('2026-10-15T12:00:00+08:00'));
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
  await section.getByText('年度销售计划（分月）', { exact: true }).click();
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
  await expect(august).toContainText('结果：-50.00%');
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
  const csv = await mpsDownloadText(await (await download).path());
  assert.equal(csv.match(/12\.5/g)?.length, 3);
});

test('最新产品源保留同码两基地组合，按基地标签展示并导出原始小数', async (t) => {
  const records = ['郑州', '华东'].map((base, index) => ({
    ...product,
    stat_period: '2026-11',
    target_base: base,
    transfer_tag: index ? '自产' : '新品',
    material_code: '001',
    material_name: '产品甲',
    sub_category: '旧大类',
    responsible_item: '汤圆',
    series: '系列甲',
    net_weight: '8.08000001',
    weight_unit: 'KG',
    measure_unit: '件',
    replace_num: '0.00000000',
  }));
  const { frame, page } = await livePage(t, (query) => {
    if (query.queryId === 'products.count')
      return { ...fixture(query), rows: [{ total: records.length }] };
    if (query.queryId === 'products.detail') return { ...fixture(query), rows: records };
    return fixture(query);
  });
  const section = await openMpsProductDetails(frame);
  await expect(section.locator('tbody tr')).toHaveCount(2);
  await expect(section).toContainText('部分基地新品');
  await section.getByRole('button', { name: '查看产品 001 的源字段', exact: true }).first().click();
  const details = frame.getByRole('dialog', { name: '产品源字段与物料组SKU', exact: true });
  await expect(details).toContainText('8.08000001');
  await expect(details).toContainText('0.00000000');
  await expect(details.locator('table').last().locator('tbody tr')).toHaveCount(2);
  await details.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await section.getByLabel('搜索产品', { exact: true }).fill('华东');
  await expect(section.locator('tbody tr')).toHaveCount(2);
  const download = page.waitForEvent('download');
  await section.getByRole('button', { name: '下载产品明细', exact: true }).click();
  const csv = await mpsDownloadText(await (await download).path(), '产品源字段');
  assert.match(csv, /统计月份/);
  assert.match(csv, /8\.08000001/);
  assert.match(csv, /0\.00000000/);
  assert.match(csv, /华东/);
});
