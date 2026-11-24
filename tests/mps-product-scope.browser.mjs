import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsPage } from './helpers/mps-page.mjs';
import { workflowStep } from './helpers/mps-edit.mjs';
import { workflowExportRows } from './helpers/mps-workflow-export.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const prefix = 'agents_scm_cust_deliv_daily_di.';
const history = [
  ['甲', 'A', 60],
  ['甲', 'B', 40],
  ['甲', 'OLD', 20],
  ['甲', 'OUT', 5],
  ['乙', 'OUT', 9],
  ['甲', 'ZERO', 0],
];
async function upload(frame, label, text) {
  await frame.getByLabel(label, { exact: true }).setInputFiles({
    name: '范围验证.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(text),
  });
}
async function downloadRows(page, button) {
  const pending = page.waitForEvent('download');
  await button.click();
  const text = await mpsDownloadText(await (await pending).path());
  const book = XLSX.read(text, { type: 'string', raw: true });
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
}

test('三类池外报告保留双来源和池外老品，基地筛选同步且池内SKU继续计算', async (t) => {
  const { page, frame } = await mpsPage(t, config, ({ queryId, parameters }) => {
    const rows =
      queryId === 'facts.history-annual'
        ? history.map(([base, code, quantity]) => ({
            ...Object.fromEntries(config.queries[queryId].columns.map((column) => [column, null])),
            [prefix + 'belong_base']: base,
            [prefix + 'material_code']: code,
            [prefix + 'act_dl_qty_total']: quantity,
          }))
        : [];
    return {
      rows: queryId.endsWith('.count') ? [{ total: 0 }] : rows,
      returnedColumns: config.queries[queryId].columns,
      configVersion: 'product-scope-v1-fixture',
      totalRowCount: rows.length,
      offset: parameters.offset ?? 0,
      hasMorePages: false,
    };
  });
  await page.clock.install({ time: new Date('2026-11-17T12:00:00+08:00') });
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-12');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n甲,A,产品A,点心,系列,包点,OLD,老品\n甲,B,产品B,点心,系列,包点,A,产品A',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,甲,A,产品A,点心,系列,包点,30,30\n2026-12,甲,B,产品B,点心,系列,包点,70,70\n2026-12,甲,OLD,老品,点心,系列,包点,10,10\n2026-12,甲,OUT,池外,点心,系列,包点,8,8',
  );
  await frame.getByRole('button', { name: '读取去年发运占比源值', exact: true }).click();
  await expect(frame.getByText('全年历史读取中…')).toHaveCount(0);
  await workflowStep(frame, '需求加工与收敛');
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  const report = view.getByRole('region', { name: '产品范围与池外异常', exact: true });
  await expect(report).toBeVisible();
  await report.getByRole('button', { name: '总异常清单（4项）', exact: true }).click();
  const scroll = report.getByRole('region', { name: '总异常清单明细，可横向滚动', exact: true });
  await scroll.focus();
  await scroll.press('ArrowRight');
  await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  const total = await downloadRows(
    page,
    report.getByRole('button', { name: '下载当前池外异常明细', exact: true }),
  );
  assert.equal(total.length, 4);
  assert.ok(total.every((row) => !['A', 'B'].includes(row.SKU)));
  assert.match(total.find((row) => row.SKU === 'OLD').来源, /历史发货.*销售提报/);
  const out = total.find((row) => row.基地 === '甲' && row.SKU === 'OUT');
  assert.match(out.来源, /历史发货/);
  assert.match(out.来源, /销售提报/);
  await report.getByRole('button', { name: '历史有发货SKU（3条）', exact: true }).click();
  assert.equal(
    (
      await downloadRows(
        page,
        report.getByRole('button', { name: '下载当前池外异常明细', exact: true }),
      )
    ).length,
    3,
  );
  await report.getByRole('button', { name: '销售提报SKU（2条）', exact: true }).click();
  const sales = await downloadRows(
    page,
    report.getByRole('button', { name: '下载当前池外异常明细', exact: true }),
  );
  assert.equal(sales.find((row) => row.SKU === 'OUT').原始值, '8');
  await report.getByRole('button', { name: '其他（1条）', exact: true }).click();
  await expect(report.getByRole('table')).toContainText('真实零发货');
  await report.getByRole('button', { name: '总异常清单（4项）', exact: true }).click();
  await view.getByLabel('基地筛选', { exact: true }).selectOption('甲');
  await expect(report.getByRole('table').locator('tbody tr')).toHaveCount(3);
  const filtered = await downloadRows(
    page,
    report.getByRole('button', { name: '下载当前池外异常明细', exact: true }),
  );
  assert.equal(filtered.length, 3);
  assert.ok(filtered.every((row) => row.基地 === '甲'));
  const demand = await workflowExportRows(frame);
  assert.ok(
    demand.some(
      (row) => row.产品编码 === 'A' && row.月份 === '2026-12' && row.上一财年发货参考量 === '60',
    ),
  );
  assert.ok(
    demand.some(
      (row) => row.产品编码 === 'B' && row.月份 === '2026-12' && row.上一财年发货参考量 === '100',
    ),
  );
  if (process.env.MPS_SCOPE_SCREENSHOT)
    await page.screenshot({ path: process.env.MPS_SCOPE_SCREENSHOT, fullPage: true });
  await workflowStep(frame, '产销存报告');
  await expect(
    frame
      .getByRole('region', { name: '产销存报告', exact: true })
      .getByRole('region', { name: '产品范围与池外异常', exact: true }),
  ).toBeVisible();
});

test('实际提报池外项即使缺占比仍出现在产销存报告和下载', async (t) => {
  const { page, frame } = await mpsPage(
    t,
    config,
    ({ queryId, parameters }) => {
      const record = (fields) => ({
        ...Object.fromEntries(config.queries[queryId].columns.map((column) => [column, null])),
        ...fields,
      });
      const rows =
        queryId === 'facts.report'
          ? [
              record({
                belong_base: '甲',
                material_code: 'OUT',
                sub_category: '点心',
                plannum_total: 8,
                allnum_total: 9,
              }),
            ]
          : queryId === 'facts.history-annual'
            ? [
                record({
                  [prefix + 'belong_base']: '甲',
                  [prefix + 'material_code']: 'OUT',
                  [prefix + 'product_categ_name']: '点心',
                  [prefix + 'act_dl_qty_total']: 5,
                }),
              ]
            : queryId.endsWith('.count')
              ? [{ total: queryId === 'facts.report.count' ? 1 : 0 }]
              : [];
      return {
        rows,
        returnedColumns: config.queries[queryId].columns,
        configVersion: 'product-scope-live-source-fixture',
        totalRowCount: rows.length,
        offset: parameters.offset ?? 0,
        hasMorePages: false,
      };
    },
    { time: '2026-11-18T13:30:00+08:00' },
  );
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n甲,A,产品A,点心,系列,包点,OLD,老品',
  );
  await frame.getByRole('button', { name: '读取去年发运占比源值', exact: true }).click();
  await expect(frame.getByText('全年历史读取中…')).toHaveCount(0);
  const bell = frame.getByRole('button', { name: '池外销售提报，1 条', exact: true });
  await bell.click();
  const warning = frame.getByRole('dialog', { name: '池外销售提报', exact: true });
  await expect(warning.getByRole('cell', { name: 'OUT', exact: true })).toBeVisible();
  await warning.getByRole('button', { name: '关闭弹窗' }).click();
  await workflowStep(frame, '产销存报告');
  await expect(bell).toHaveCount(0);
  const report = frame
    .getByRole('region', { name: '产销存报告', exact: true })
    .getByRole('region', { name: '产品范围与池外异常', exact: true });
  await expect(
    report.getByRole('button', { name: '历史有发货SKU（1条）', exact: true }),
  ).toBeVisible();
  await expect(
    report.getByRole('button', { name: '销售提报SKU（1条）', exact: true }),
  ).toBeVisible();
  const downloaded = await downloadRows(
    page,
    report.getByRole('button', { name: '下载当前池外异常明细', exact: true }),
  );
  assert.equal(downloaded.length, 1);
  assert.equal(downloaded[0].来源, '历史发货；销售提报');
});
