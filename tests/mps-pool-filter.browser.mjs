import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsPage } from './helpers/mps-page.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const prefix = 'agents_scm_cust_deliv_daily_di.';
function sourceFixture(periods, products = []) {
  return ({ queryId, parameters }) => {
    if (queryId.startsWith('products.')) {
      const offset = parameters.offset ?? 0;
      return {
        rows: queryId.endsWith('.count')
          ? [{ total: products.length }]
          : products.slice(offset, offset + parameters.page_size),
        returnedColumns: config.queries[queryId].columns,
        configVersion: 'pool-filter-fixture',
        totalRowCount: products.length,
        offset,
        hasMorePages: offset + parameters.page_size < products.length,
      };
    }
    const period = periods.find((row) => row.month === parameters.month?.slice(0, 7));
    const history = queryId === 'facts.history';
    const plan = queryId.startsWith('facts.plan-quantity');
    const records = history
      ? (period?.history.rows ?? [])
      : plan
        ? (period?.report.rows ?? [])
        : [];
    const rows = records.map((row) => ({
      ...Object.fromEntries(config.queries[queryId].columns.map((field) => [field, null])),
      ...(history
        ? Object.fromEntries(
            Object.entries({
              belong_base: row['基地'],
              material_code: row['产品编码'],
              material_name: row['产品名称'],
              product_categ_name: row['大类'],
              material_group_name: row['物料组'],
              act_dl_qty_total: row['数量'],
              act_dl_qty_all_total: row['含赠品数量'] ?? row['数量'],
              income_excl_tax_local_total: row['不含税收入'] ?? null,
            }).map(([field, value]) => [prefix + field, value === '' ? null : (value ?? null)]),
          )
        : {
            belong_base: row['基地'],
            material_code: row['产品编码'],
            plan_qty_total: row['计划数量'],
            known_plan_qty_total: row['已知计划数量'] ?? row['计划数量'],
            source_plan_qty_total: row['源计划数量'] ?? row['计划数量'],
            source_rows: row['源记录数'] ?? 1,
            missing_rows: row['缺数量条数'] ?? 0,
            duplicate_rows: row['重复键条数'] ?? 0,
            source_date_start: row['源日期开始'] ?? null,
            source_date_end: row['源日期结束'] ?? null,
          }),
    }));
    const offset = parameters.offset ?? 0;
    return {
      rows: queryId.endsWith('.count')
        ? [{ total: rows.length }]
        : rows.slice(offset, offset + (parameters.page_size ?? 200)),
      returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
      configVersion: 'pool-filter-fixture',
      totalRowCount: rows.length,
      offset,
      hasMorePages: offset + (parameters.page_size ?? 200) < rows.length,
    };
  };
}
async function openChecks(t, products, periods, rawProducts) {
  const result = await mpsPage(t, config, sourceFixture(periods, rawProducts));
  const { frame } = result;
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-11');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  if (!rawProducts)
    await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
      name: '池外核对产品.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: XLSX.write(
        { SheetNames: ['产品'], Sheets: { 产品: XLSX.utils.json_to_sheet(products) } },
        { type: 'buffer', bookType: 'xlsx' },
      ),
    });
  const section = frame.getByRole('region', { name: '大类基础指标源值核对', exact: true });
  await expect(section.getByRole('button', { name: '下载源值核对', exact: true })).toBeEnabled();
  return { ...result, section };
}
async function downloadRows(page, button) {
  const pending = page.waitForEvent('download');
  await button.click();
  const csv = await mpsDownloadText(await (await pending).path());
  const book = XLSX.read(csv, { type: 'string', raw: true });
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
}

test('来源核对的计数、预览及工作簿保留池外非零BI和计划量，并标明唯一老品归属', async (t) => {
  const { page, frame, section } = await openChecks(
    t,
    [
      {
        基地: '',
        产品编码: 'A',
        产品名称: '新品',
        大类: '汤圆',
        系列: '系列',
        物料组: 'G',
        老品编码: 'OLD',
        老品名称: '老品',
      },
    ],
    [
      {
        month: '2026-07',
        history: {
          rows: [
            { 基地: '郑州', 产品编码: 'A', 数量: 0 },
            { 基地: '郑州', 产品编码: 'OLD', 数量: 3 },
            { 基地: '郑州', 产品编码: 'OUT', 数量: -2418 },
            { 基地: '郑州', 产品编码: 'ZERO', 数量: 0 },
          ],
        },
        report: {
          rows: [
            { 基地: '郑州', 产品编码: 'OUTP', 计划数量: 9 },
            { 基地: '郑州', 产品编码: 'ZERO', 计划数量: 0 },
            { 基地: '郑州', 产品编码: 'OLD', 计划数量: 7 },
          ],
        },
      },
    ],
  );
  const pool = section.getByRole('button', { name: '下载池外待补清单（2条）', exact: true });
  await expect(pool).toBeEnabled();
  const rows = await downloadRows(page, pool);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row['来源'] === 'BI')['数量'], '-2418');
  assert.equal(rows.find((row) => row['来源'] === '计划量')['计划数量'], '9');
  await section
    .getByRole('button', { name: '查看异常与来源明细（2条异常，共5条）', exact: true })
    .click();
  const preview = frame.getByRole('dialog', { name: '基础核对异常与来源明细', exact: true });
  await expect(preview.locator('tbody tr')).toHaveCount(5);
  await expect(preview).toContainText('-2418');
  await expect(preview.getByRole('row').filter({ hasText: 'OUTP' })).toContainText('9');
  await preview.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  const all = await downloadRows(
    page,
    section.getByRole('button', { name: '下载完整来源明细', exact: true }),
  );
  assert.equal(all.length, 5);
  assert(
    all.filter((row) => row['产品编码'] === 'OLD').every((row) => row['当前产品编码'] === 'A'),
  );
});

test(
  '留存底稿经页面源读取、分页预览及下载仍为216条池外记录，计划数量208条均不空白',
  {
    skip: !process.env.MPS_POOL_REPLAY_INPUT && '设置MPS_POOL_REPLAY_INPUT以只读回放留存底稿',
  },
  async (t) => {
    const { draft } = JSON.parse(await readFile(process.env.MPS_POOL_REPLAY_INPUT, 'utf8'));
    const { page, frame, section } = await openChecks(
      t,
      draft.products,
      draft.sourceChecks.periods,
      draft.productRaw,
    );
    const pool = section.getByRole('button', { name: '下载池外待补清单（216条）', exact: true });
    await expect(pool).toBeEnabled({ timeout: 20000 });
    await section
      .getByRole('button', { name: '查看异常与来源明细（216条异常，共16488条）', exact: true })
      .click();
    const preview = frame.getByRole('dialog', { name: '基础核对异常与来源明细', exact: true });
    await expect(preview).toContainText('共16488条，其中异常216条');
    await expect(preview.locator('tbody tr')).toHaveCount(25);
    await expect(preview).toContainText('-2418');
    if (process.env.MPS_POOL_SCREENSHOT)
      await page.screenshot({ path: process.env.MPS_POOL_SCREENSHOT, fullPage: true });
    await preview.getByRole('button', { name: '下一页来源明细', exact: true }).click();
    await expect(preview.locator('tbody tr')).toHaveCount(25);
    await preview.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    const rows = await downloadRows(page, pool);
    const actual = rows.filter((row) => row['来源'] === 'BI');
    const plan = rows.filter((row) => row['来源'] === '计划量');
    assert.equal(rows.length, 216);
    assert.equal(actual.length, 8);
    assert.equal(plan.length, 208);
    assert.equal(actual.find((row) => row['数量'] === '-2418')['产品编码'], '10006933');
    assert(plan.every((row) => row['计划数量'] !== '' && Number(row['计划数量']) !== 0));
    assert.equal(new Set(rows.map((row) => row['产品编码'])).size, 72);
    const details = await downloadRows(
      page,
      section.getByRole('button', { name: '下载完整来源明细', exact: true }),
    );
    assert.equal(details.length, 16488);
    assert.equal(details.filter((row) => row['原因'] === '不在当前产品池').length, 216);
  },
);
