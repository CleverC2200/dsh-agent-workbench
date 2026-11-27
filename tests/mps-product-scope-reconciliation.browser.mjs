import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsPageWithExactProductPeriod as mpsPage } from './helpers/mps-page.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const product = (code, base, category = '点心') => ({
  ...Object.fromEntries(config.queries['products.detail'].columns.map((field) => [field, null])),
  stat_period: '2026-11',
  target_base: base,
  material_code: code,
  material_name: `产品${code}`,
  sub_category: '旧大类',
  responsible_item: category,
  series: '系列',
  product_item: 'G',
  product_item_name: '物料组',
  source_rows: 1,
});
const products = [
  product('A', '甲'),
  product('B', '乙'),
  product('A', '甲', '冲突大类'),
  product('NOBASE', ''),
];
function fixture({ queryId, parameters }) {
  const rows = queryId === 'products.detail' || queryId === 'products.count' ? products : [];
  const count = queryId.endsWith('.count');
  const offset = parameters.offset ?? 0;
  const size = parameters.page_size ?? 200;
  return {
    rows: count ? [{ total: rows.length }] : rows.slice(offset, offset + size),
    returnedColumns: count ? ['total'] : config.queries[queryId].columns,
    configVersion: 'product-scope-fixture',
    totalRowCount: rows.length,
    offset,
    hasMorePages: offset + size < rows.length,
  };
}
async function downloadRows(page, section) {
  const pending = page.waitForEvent('download');
  await section.getByRole('button', { name: '下载产品范围对账CSV', exact: true }).click();
  const download = await pending;
  assert.match(download.suggestedFilename(), /\.csv$/);
  assert.notEqual((await readFile(await download.path())).subarray(0, 2).toString(), 'PK');
  const csv = await mpsDownloadText(await download.path());
  const workbook = XLSX.read(csv, { type: 'string', raw: true });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
}

test('第3步隐藏产品范围对账，第4步展示和下载源清单覆盖、冲突及缺项', async (t) => {
  const { page, frame } = await mpsPage(t, config, fixture);
  await page.clock.setFixedTime(new Date('2026-11-15T12:00:00+08:00'));
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-11');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await expect(frame.getByRole('region', { name: '产品明细', exact: true })).toContainText('产品B');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const section = frame.getByRole('region', { name: '产品范围对账', exact: true });
  await expect(section).toHaveCount(0);
  await frame.locator('.ap-page-tab').filter({ hasText: '主数据对应关系' }).click();
  await expect(section.getByRole('table')).toContainText('大类冲突');
  await expect(section).not.toContainText(/实际参与 \d+ 个基地 SKU|筛选结果/);
  const rows = await downloadRows(page, section);
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.SKU === 'B')['对账结果'], '已覆盖');
  assert.match(rows.find((row) => row.SKU === 'A')['缺项或处理原因'], /大类冲突/);
  assert.equal(rows.find((row) => row.SKU === 'NOBASE')['对账结果'], '主数据缺项');
  assert.ok(
    rows.every((row) => row['覆盖声明'] === '实际参与范围' && row['源统计期'] === '2026-11'),
  );
  assert.ok(rows.every((row) => /全国基地范围/.test(row['缺少的覆盖证明'])));
  await section.getByLabel('对账基地', { exact: true }).selectOption('乙');
  assert.deepEqual(
    (await downloadRows(page, section)).map((row) => row.SKU),
    ['B'],
  );
  await section.getByLabel('搜索对账基地或SKU', { exact: true }).fill('无匹配SKU');
  await expect(
    section.getByRole('button', { name: '下载产品范围对账CSV', exact: true }),
  ).toBeDisabled();
});

test('三类池外异常页面和CSV保留双来源，按基地SKU去重并单列池外老品', async (t) => {
  const current = [product('A', '甲'), product('B', '乙')];
  current[0] = { ...current[0], replacement_material_code: 'OLD', replace_num: '2' };
  const prefix = 'agents_scm_cust_deliv_daily_di.';
  const respond = (query) => {
    const { queryId, parameters } = query;
    const result = fixture(query);
    let rows = [];
    if (queryId === 'products.detail' || queryId === 'products.count') rows = current;
    if (queryId === 'facts.history' || queryId === 'facts.history-annual')
      rows = [
        ['甲', 'A', 10],
        ['甲', 'OLD', 3],
        ['甲', 'OUT', 20],
        ['甲', 'ZERO', 0],
        ['乙', 'OLD', 7],
      ].map(([base, code, quantity]) => ({
        ...Object.fromEntries(config.queries[queryId].columns.map((field) => [field, null])),
        [prefix + 'belong_base']: base,
        [prefix + 'material_code']: code,
        [prefix + 'product_categ_name']: '点心',
        [prefix + 'act_dl_qty_total']: quantity,
        [prefix + 'act_dl_qty_all_total']: quantity,
      }));
    if (queryId === 'facts.report' || queryId === 'facts.report.count')
      rows = [
        {
          ...Object.fromEntries(
            config.queries['facts.report'].columns.map((field) => [field, null]),
          ),
          belong_base: '甲',
          material_code: 'OUT',
          plannum_total: 8,
          allnum_total: 8,
        },
      ];
    if (queryId.startsWith('plan-rate.'))
      rows = [
        {
          ...Object.fromEntries(
            config.queries['plan-rate.detail'].columns.map((field) => [field, null]),
          ),
          dimension_type: '基地+产品',
          stat_month: parameters.months[0],
          belong_base: '甲',
          material_code: 'OUT',
          dimension_allnum: 8,
          parent_allnum: 8,
          dimension_rate: '1',
        },
      ];
    if (
      queryId.startsWith('products.') ||
      queryId.startsWith('facts.history') ||
      queryId.startsWith('facts.report') ||
      queryId.startsWith('plan-rate.')
    ) {
      const offset = parameters.offset ?? 0;
      const size = parameters.page_size ?? 200;
      return {
        ...result,
        rows: queryId.endsWith('.count')
          ? [{ total: rows.length }]
          : rows.slice(offset, offset + size),
        totalRowCount: rows.length,
        hasMorePages: offset + size < rows.length,
      };
    }
    return result;
  };
  const { page, frame } = await mpsPage(t, config, respond);
  await page.clock.setFixedTime(new Date('2026-11-15T12:00:00+08:00'));
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-11');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '提报.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-11,甲,OUT,池外产品,点心,系列,G,8,8',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const report = frame.getByRole('region', { name: '产品范围与池外异常', exact: true });
  await expect(
    report.getByRole('button', { name: '销售提报SKU（1条）', exact: true }),
  ).toBeVisible();
  await expect(
    report.getByRole('button', { name: '总异常清单（4项）', exact: true }),
  ).toBeVisible();
  const download = async () => {
    const pending = page.waitForEvent('download');
    await report.getByRole('button', { name: '下载当前池外异常明细', exact: true }).click();
    const file = await pending;
    assert.match(file.suggestedFilename(), /\.csv$/);
    const workbook = XLSX.read(await mpsDownloadText(await file.path()), {
      type: 'string',
      raw: true,
    });
    return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
  };
  const all = await download();
  assert.equal(all.length, 4);
  assert.equal(all.find((row) => row.SKU === 'OUT')['来源'], '历史发货；销售提报');
  assert.match(all.find((row) => row.SKU === 'OUT')['原始值'], /历史发货：20；销售提报：8/);
  assert.match(
    all.find((row) => row.SKU === 'OLD' && row['基地'] === '甲')['原始值'],
    /历史发货：3/,
  );
  for (const [label, size, codes] of [
    ['历史有发货SKU', 3, ['OLD', 'OUT', 'OLD']],
    ['销售提报SKU', 1, ['OUT']],
    ['其他', 1, ['ZERO']],
  ]) {
    await report.getByRole('button', { name: `${label}（${size}条）`, exact: true }).click();
    await expect(report).toContainText(`当前查看${label}，共${size}条`);
    const rows = await download();
    assert.deepEqual(
      rows.map((row) => row.SKU),
      codes,
    );
    for (const row of rows)
      await expect(
        report.getByRole('row').filter({ hasText: row.SKU }).filter({ hasText: row['基地'] }),
      ).toContainText(row['来源']);
  }
});

test('主动排除的基地SKU继续列在对账内，页面和CSV给出首个排除原因', async (t) => {
  const empty = (query) => ({
    ...fixture(query),
    rows: query.queryId.endsWith('.count') ? [{ total: 0 }] : [],
    totalRowCount: 0,
    hasMorePages: false,
  });
  const { page, frame } = await mpsPage(t, config, empty);
  await page.clock.setFixedTime(new Date('2026-10-15T12:00:00+08:00'));
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-10');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,\n郑州,B,产品乙,汤圆,系列,组,,',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await frame.getByLabel('数据截止日', { exact: true }).fill('2026-09-30');
  await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
    name: '部分发货.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库,近30天日均发货\n2026-09,郑州,A,产品甲,汤圆,系列,组,220,10,10,10,100,200,80,0\n2026-09,郑州,B,产品乙,汤圆,系列,组,110,,10,10,,20,8,0',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '主数据对应关系' }).click();
  const section = frame.getByRole('region', { name: '产品范围对账', exact: true });
  const status = section.getByRole('table').getByRole('cell', { name: '主动排除', exact: true });
  await expect(status).toHaveCount(1);
  const rows = await downloadRows(page, section);
  const excluded = rows.find((row) => row.SKU === 'B');
  assert.equal(excluded['对账结果'], '主动排除');
  assert.equal(excluded['实际参与'], '否');
  assert.match(excluded['缺项或处理原因'], /本月有效预估发货待定/);
  await section.getByRole('checkbox', { name: '仅看范围或主数据问题', exact: true }).check();
  assert.deepEqual(
    (await downloadRows(page, section)).map((row) => row.SKU),
    ['B'],
  );
});
