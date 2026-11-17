import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsPage } from './helpers/mps-page.mjs';
import { workflowStep } from './helpers/mps-edit.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const prefix = 'agents_scm_cust_deliv_daily_di.';
const raw = (queryId, base, code, quantity) => ({
  ...Object.fromEntries(config.queries[queryId].columns.map((column) => [column, null])),
  [prefix + 'belong_base']: base,
  [prefix + 'material_code']: code,
  [prefix + 'act_dl_qty_total']: quantity,
});
async function upload(frame, label, text) {
  await frame
    .getByLabel(label, { exact: true })
    .setInputFiles({ name: '历史核对.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
}
async function download(page, button) {
  const pending = page.waitForEvent('download');
  await button.focus();
  await button.press('Enter');
  const text = await mpsDownloadText(await (await pending).path());
  const book = XLSX.read(text, { type: 'string', raw: true });
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
}

test('第三步完整月分类、财年补0与当前范围CSV贯通，并保留原始值和二十四月依据', async (t) => {
  const { page, frame, calls } = await mpsPage(t, config, ({ queryId, parameters }) => {
    const now = new Date();
    now.setUTCDate(1);
    now.setUTCMonth(now.getUTCMonth() - 2);
    const isRecent = parameters.month >= now.toISOString().slice(0, 7) + '-01';
    const rows =
      queryId === 'facts.history-annual'
        ? [
            ['甲', 'A', null],
            ['甲', 'OLD', 30],
            ['甲', 'B', 40],
            ['甲', 'C', 50],
            ['乙', 'D', 90],
          ].map((row) => raw(queryId, ...row))
        : queryId === 'facts.history'
          ? [
              raw(queryId, '甲', 'B', isRecent ? 0 : 9),
              raw(queryId, '甲', 'C', null),
              raw(queryId, '乙', 'D', 1),
            ]
          : [];
    return {
      rows: queryId.endsWith('.count') ? [{ total: 0 }] : rows,
      returnedColumns: config.queries[queryId].columns,
      configVersion: 'history-v1-fixture',
      totalRowCount: rows.length,
      offset: parameters.offset ?? 0,
      hasMorePages: false,
    };
  });
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-12');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n甲,A,产品A,点心,系列,包点,OLD,老品\n甲,B,产品B,点心,系列,包点,,\n甲,C,产品C,点心,系列,包点,,\n乙,D,产品D,点心,系列,包点,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,甲,A,产品A,点心,系列,包点,30,30\n2026-12,甲,B,产品B,点心,系列,包点,70,70\n2026-12,甲,C,产品C,点心,系列,包点,20,20\n2026-12,乙,D,产品D,点心,系列,包点,10,10',
  );
  await frame.getByRole('button', { name: '读取去年发运占比源值', exact: true }).click();
  await expect(frame.getByText('全年历史读取中…')).toHaveCount(0);
  await workflowStep(frame, '需求加工与收敛');
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  const report = view.getByRole('region', { name: '历史发货分类与补0', exact: true });
  await expect(report).toBeVisible();
  await expect(report.getByRole('table').first()).toContainText('疑似新品或重新上市');
  await expect(report.getByRole('table').first()).toContainText('短期断档数据异常');
  await expect(report.getByRole('table').first()).toContainText('来源异常或其他历史异常');
  assert.equal(
    new Set(
      calls.filter((call) => call.queryId === 'facts.history').map((call) => call.parameters.month),
    ).size,
    24,
  );
  await view.getByLabel('基地筛选', { exact: true }).selectOption('甲');
  const history = await download(
    page,
    report.getByRole('button', { name: '下载当前历史及异常明细', exact: true }),
  );
  const a = history.find((row) => row.粒度 === '财年历史' && row.产品编码 === 'A');
  assert.equal(a.计算用历史数量, '30');
  assert.equal(a.自身原始数量, '');
  assert.equal(a.替换品原始数量, '30');
  assert.equal(a.补0状态, '缺失数量补0');
  assert.equal(a.历史分类, '疑似新品或重新上市');
  assert.equal(
    history.filter((row) => row.粒度 === '完整历史月' && row.产品编码 === 'A').length,
    24,
  );
  assert.ok(history.every((row) => row.基地 === '甲'));
  await view.getByLabel('月份筛选', { exact: true }).selectOption('2027-01');
  const demand = await download(
    page,
    view.getByRole('button', { name: '下载当前范围需求', exact: true }),
  );
  assert.equal(
    demand.find((row) => row.粒度 === '基地SKU' && row.产品编码 === 'A').计算用历史数量,
    '30',
  );
  assert.equal(demand.find((row) => row.粒度 === '当前范围合计').计算用历史数量, '120');
  if (process.env.MPS_HISTORY_SCREENSHOT)
    await page.screenshot({ path: process.env.MPS_HISTORY_SCREENSHOT, fullPage: true });
});

test('完整月读取拒绝时报告失败与原因，财年有效数量继续展示且不判新品', async (t) => {
  const { page, frame } = await mpsPage(t, config, ({ queryId, parameters }) => {
    if (queryId === 'facts.history') throw Error('历史月查询拒绝');
    const rows = queryId === 'facts.history-annual' ? [raw(queryId, '甲', 'A', 25)] : [];
    return {
      rows: queryId.endsWith('.count') ? [{ total: 0 }] : rows,
      returnedColumns: config.queries[queryId].columns,
      configVersion: 'history-failed-fixture',
      totalRowCount: rows.length,
      offset: parameters.offset ?? 0,
      hasMorePages: false,
    };
  });
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-12');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n甲,A,产品A,点心,系列,包点,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,甲,A,产品A,点心,系列,包点,30,30',
  );
  await frame.getByRole('button', { name: '读取去年发运占比源值', exact: true }).click();
  await expect(frame.getByText('全年历史读取中…')).toHaveCount(0);
  await workflowStep(frame, '需求加工与收敛');
  const report = frame.getByRole('region', { name: '历史发货分类与补0', exact: true });
  await expect(report.getByRole('table').first()).toContainText('来源异常或其他历史异常');
  await expect(report.getByRole('table').first()).not.toContainText('疑似新品或重新上市');
  await expect(report.getByRole('table').last()).toContainText('读取失败');
  await expect(report.getByRole('table').last()).toContainText('数据读取失败');
  const rows = await download(
    page,
    report.getByRole('button', { name: '下载当前历史及异常明细', exact: true }),
  );
  assert.equal(rows.find((row) => row.粒度 === '财年历史').计算用历史数量, '25');
  assert.ok(
    rows
      .filter((row) => row.粒度 === '完整历史月')
      .every((row) => row.来源状态 === '读取失败' && row.原始历史数量 === ''),
  );
});
