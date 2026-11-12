import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { expect } from '@playwright/test';
import { mpsPage } from './helpers/mps-page.mjs';
import * as XLSX from 'xlsx-republish';
import { mpsDownloadText } from './helpers/mps-download.mjs';
const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const execute =
  (sources = {}) =>
  ({ queryId, parameters }) => {
    const rows = (
      sources[
        Object.keys(config.queries).find(
          (key) => config.queries[key].pagination?.countQuery === queryId,
        ) ?? queryId
      ] ?? []
    ).map((row) => ({
      ...Object.fromEntries((config.queries[queryId]?.columns ?? []).map((key) => [key, null])),
      ...row,
    }));
    return {
      rows: queryId.endsWith('.count')
        ? [{ total: rows.length }]
        : rows.slice(parameters.offset, parameters.offset + parameters.page_size),
      returnedColumns: config.queries[queryId]?.columns,
      configVersion: 'price-amount-v1',
    };
  };
const products = ['A', 'B'].map((code) => ({
  material_code: code,
  material_name: `产品${code}`,
  sub_category: '汤圆',
  series: '系列甲',
  product_item: 'G',
  product_item_name: '组甲',
  source_rows: 1,
}));

test('重复日报快照按SKU展示源单价并下载，缺价留空且不改变产品行数', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('CREATE TABLE agents_scm_cust_jxc_ai_daliy_d (material_code TEXT, cif_price TEXT)');
  const insert = db.prepare('INSERT INTO agents_scm_cust_jxc_ai_daliy_d VALUES (?, ?)');
  for (const row of [
    ['A', '12.345600'],
    ['A', '12.345600'],
    ['B', null],
    ['B', null],
  ])
    insert.run(...row);
  const respond = execute({ 'products.detail': products });
  const { page, frame } = await mpsPage(t, config, (query) => {
    if (!query.queryId.startsWith('products.prices')) return respond(query);
    const definition = config.queries[query.queryId];
    return {
      rows: db
        .prepare(definition.request.sql)
        .all(
          query.queryId.endsWith('.count')
            ? {}
            : { gea_p98: query.parameters.page_size, gea_p99: query.parameters.offset },
        ),
      returnedColumns: definition.columns,
      configVersion: 'price-snapshot-v1',
    };
  });
  const section = frame.getByRole('region', { name: '产品明细', exact: true });
  await expect(section).toContainText('2 个产品');
  await expect(
    section.getByRole('columnheader', { name: '未税到岸单价', exact: true }),
  ).toBeVisible();
  await expect(section.locator('tbody tr')).toHaveCount(2);
  await expect(section.locator('tbody tr').first()).toContainText('12.345600');
  const download = page.waitForEvent('download');
  await section.getByRole('button', { name: '下载', exact: true }).click();
  const productPath = await (await download).path();
  const csv = await mpsDownloadText(productPath);
  assert.match(csv, /未税到岸单价/);
  assert.match(csv, /12\.345600/);
  assert(!csv.includes('产品B,汤圆,,G,组甲,,,0'));
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '产品关系.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await readFile(productPath),
  });
  await expect(section).toContainText('产品关系.xlsx');
  await expect(section).toContainText('2 个产品');
  await expect(section.getByRole('alert')).toHaveCount(0);
});

test('提报金额独立汇总全部分页，产品关联不放大，预览和下载保持decimal精度', async (t) => {
  const registered = structuredClone(config);
  registered.queries['facts.report-amounts'] = {
    grain: ['belong_base', 'material_code'],
    parameterSpec: config.queries['facts.report'].parameterSpec,
    request: { sql: 'SELECT approved_amount_projection' },
    columns: ['belong_base', 'material_code', 'ycplanamount', 'monthamount'],
    pagination: { countQuery: 'facts.report-amounts.count' },
  };
  registered.queries['facts.report-amounts.count'] = {
    parameterSpec: config.queries['facts.report.count'].parameterSpec,
    request: { sql: 'SELECT approved_amount_count' },
  };
  const amountRows = Array.from({ length: 201 }, (_, index) => ({
    belong_base: '基地甲',
    material_code: String(index),
    ycplanamount: index === 0 ? '9007199254740992.01' : '0.01',
    monthamount: index === 0 ? '123.45' : '-0.01',
  }));
  const respond = (query) => {
    const definition = registered.queries[query.queryId];
    const sourceId =
      Object.keys(registered.queries).find(
        (key) => registered.queries[key].pagination?.countQuery === query.queryId,
      ) ?? query.queryId;
    if (sourceId === 'facts.report-amounts')
      return {
        rows: query.queryId.endsWith('.count')
          ? [{ total: amountRows.length }]
          : amountRows.slice(
              query.parameters.offset,
              query.parameters.offset + query.parameters.page_size,
            ),
        returnedColumns: definition.columns,
        configVersion: 'amount-v1',
      };
    return execute({
      'products.detail': [...products, { ...products[0], product_item: 'G2' }],
      'facts.report': Array.from({ length: 31 }, (_, index) => ({
        region_name: `大区${index}`,
        belong_base: '基地甲',
        material_code: 'A',
        plannum_total: 1,
        allnum_total: 2,
      })),
    })(query);
  };
  const { page, frame, calls } = await mpsPage(t, registered, respond);
  const section = frame.getByRole('region', { name: '计划提报数据', exact: true });
  await expect(section).toContainText('月初计划总金额：9007199254740994.01元');
  await expect(section).toContainText('最终计划总金额：121.45元');
  assert(
    calls.some(
      (call) => call.queryId === 'facts.report-amounts' && call.parameters.page_size === 5000,
    ),
  );
  await section.getByRole('button', { name: '预览当前明细' }).click();
  const dialog = frame.getByRole('dialog');
  await expect(dialog).toContainText('月初计划总金额：9007199254740994.01元');
  await expect(dialog).toContainText('最终计划总金额：121.45元');
  await dialog.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(dialog.locator('tbody tr')).toHaveCount(6);
  await expect(dialog).toContainText('最终计划总金额：121.45元');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载明细', exact: true }).click();
  const book = XLSX.read(await readFile(await (await download).path()), { type: 'buffer' });
  const csv = XLSX.utils.sheet_to_csv(book.Sheets['提报金额汇总']);
  assert.match(csv, /9007199254740994\.01/);
  assert.match(csv, /121\.45/);
});

test('金额来源未配置时保留提报数量，明确待补且不将缺项显示为零', async (t) => {
  const missingConfig = structuredClone(config);
  delete missingConfig.queries['facts.report-amounts'];
  const { frame } = await mpsPage(
    t,
    missingConfig,
    execute({
      'facts.report': [
        { belong_base: '基地甲', material_code: 'A', plannum_total: 5, allnum_total: 7 },
      ],
    }),
  );
  const section = frame.getByRole('region', { name: '计划提报数据', exact: true });
  await expect(section).toContainText('金额来源尚未配置');
  await expect(section).toContainText('月初计划总金额：待补');
  await section.getByText('口径与统计说明', { exact: true }).click();
  await expect(section).toContainText('数量合计5件');
});

test('金额缺项显示已知小计，刷新失败后隐藏旧金额且不影响数量读取', async (t) => {
  let denied = false;
  const respond = execute({
    'facts.report': [
      { belong_base: '基地甲', material_code: 'A', plannum_total: 5, allnum_total: 7 },
    ],
    'facts.report-amounts': [
      { belong_base: null, material_code: 'A', ycplanamount: '1.25', monthamount: '2.00' },
      { belong_base: '基地甲', material_code: 'B', ycplanamount: null, monthamount: '2.00' },
    ],
  });
  const { frame } = await mpsPage(t, config, (query) => {
    if (denied && query.queryId.startsWith('facts.report-amounts'))
      throw Error('AGENT_ACCESS_DENIED');
    return respond(query);
  });
  const section = frame.getByRole('region', { name: '计划提报数据', exact: true });
  await expect(section).toContainText('月初计划总金额：待补；最终计划总金额：4.00元');
  await expect(section).toContainText('月初金额缺1条');
  await expect(section).toContainText('已知小计分别为1.25、4.00元');
  await expect(section).toContainText('1条缺基地或产品编码');
  denied = true;
  await section.getByRole('button', { name: '同步', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('当前账号暂无数据权限');
  await expect(section).toContainText('最终计划总金额：待补');
  await expect(section).not.toContainText('4.00元');
  await section.getByText('口径与统计说明', { exact: true }).click();
  await expect(section).toContainText('数量合计5件');
});
