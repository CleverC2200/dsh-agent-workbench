import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsPage } from './helpers/mps-page.mjs';
import { beginAdjustment, saveAdjustment, workflowStep } from './helpers/mps-edit.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const prefix = 'agents_scm_cust_deliv_daily_di.';
let downloadIndex = 0;
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
  await button.click();
  const file = await pending;
  if (process.env.MPS_HISTORY_EXPORT_DIR)
    await file.saveAs(
      `${process.env.MPS_HISTORY_EXPORT_DIR}/${++downloadIndex}-${file.suggestedFilename()}`,
    );
  const text = await mpsDownloadText(await file.path());
  const book = XLSX.read(text, { type: 'string', raw: true });
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
}

test('第三步完整月分类、财年补0与当前范围CSV贯通，并保留原始值和二十四月依据', async (t) => {
  const { page, frame, calls } = await mpsPage(
    t,
    config,
    ({ queryId, parameters }) => {
      const now = new Date('2026-11-17T12:00:00+08:00');
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
    },
    { time: '2026-11-17T12:00:00+08:00' },
  );
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
  for (const level of ['基地汇总', '大类汇总', '物料组汇总'])
    assert.equal(demand.find((row) => row.粒度 === level).计算用历史数量, '120');
  if (process.env.MPS_HISTORY_SCREENSHOT)
    await page.screenshot({ path: process.env.MPS_HISTORY_SCREENSHOT, fullPage: true });
});

test('完整月读取拒绝时报告失败与原因，财年有效数量继续展示且不判新品', async (t) => {
  const { page, frame } = await mpsPage(
    t,
    config,
    ({ queryId, parameters }) => {
      const partial = queryId === 'facts.history' && parameters.month === '2025-11-01';
      if (queryId === 'facts.history' && !partial) throw Error('历史月查询拒绝');
      const rows = queryId === 'facts.history-annual' ? [raw(queryId, '甲', 'A', 25)] : [];
      return {
        rows: queryId.endsWith('.count') ? [{ total: 0 }] : rows,
        returnedColumns: config.queries[queryId].columns,
        configVersion: 'history-failed-fixture',
        totalRowCount: rows.length,
        offset: parameters.offset ?? 0,
        hasMorePages: false,
        ...(partial
          ? {
              dataStatus: 'partial',
              warnings: [
                { code: 'METRIC_VALUE_UNAVAILABLE' },
                { code: 'PARTIAL_HISTORY', message: '部分发货来源字段未返回' },
                { code: 'PARTIAL_HISTORY', message: '部分发货来源字段未返回' },
              ],
            }
          : {}),
      };
    },
    { time: '2026-11-17T12:00:00+08:00' },
  );
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
  await expect(report.getByRole('table').last()).toContainText('实际原因待核');
  await expect(report.getByRole('table').last()).toContainText('部分发货来源字段未返回');
  await expect(report).not.toContainText('[object Object]');
  const rows = await download(
    page,
    report.getByRole('button', { name: '下载当前历史及异常明细', exact: true }),
  );
  assert.equal(rows.find((row) => row.粒度 === '财年历史').计算用历史数量, '25');
  assert.ok(
    rows
      .filter((row) => row.粒度 === '完整历史月' && row.历史期间 !== '2025-11')
      .every((row) => row.来源状态 === '读取失败' && row.原始历史数量 === ''),
  );
  const warning = rows.find((row) => row.粒度 === '完整历史月' && row.历史期间 === '2025-11');
  assert.equal(warning.来源状态, '读取不完整');
  assert.equal(
    warning.原因,
    '部分指标未返回有效值（METRIC_VALUE_UNAVAILABLE）；部分发货来源字段未返回；历史读取失败或不完整',
  );
});

test('历史和需求缺项分页保留全部当前范围的下载记录', async (t) => {
  const { page, frame } = await mpsPage(
    t,
    config,
    ({ queryId }) => ({
      rows: queryId.endsWith('.count') ? [{ total: 0 }] : [],
      returnedColumns: config.queries[queryId].columns,
      configVersion: 'history-pagination-fixture',
      totalRowCount: 0,
      offset: 0,
      hasMorePages: false,
    }),
    { time: '2026-11-17T12:00:00+08:00' },
  );
  const codes = Array.from({ length: 27 }, (_, index) => `SKU-${index + 1}`);
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    [
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称',
      ...codes.map((code) => `郑州,${code},产品${code},点心,系列,包点,,`),
    ].join('\n'),
  );
  await workflowStep(frame, '需求加工与收敛');
  const history = frame.getByRole('region', { name: '历史发货分类与补0', exact: true });
  const annualRows = history
    .getByRole('table', { name: '历史发货分类及财年数量' })
    .locator('tbody tr');
  await expect(annualRows).toHaveCount(25);
  await history.getByRole('button', { name: '财年历史下一页' }).click();
  await expect(annualRows).toHaveCount(2);
  const historical = await download(
    page,
    history.getByRole('button', { name: '下载当前历史及异常明细' }),
  );
  assert.deepEqual(
    new Set(historical.filter((row) => row.粒度 === '财年历史').map((row) => row.产品编码)),
    new Set(codes),
  );
  const issues = frame.getByRole('region', { name: '加工需求缺项报告', exact: true });
  const issueRows = issues.getByRole('table').locator('tbody tr');
  await expect(issueRows).toHaveCount(25);
  await issues.getByRole('button', { name: '缺项报告下一页' }).click();
  await expect(issues.getByRole('status')).toHaveText(/^第2\//);
  const demand = await download(page, frame.getByRole('button', { name: '下载当前范围需求' }));
  assert.deepEqual(
    new Set(demand.filter((row) => row.粒度 === '缺项报告').map((row) => row.产品编码)),
    new Set(codes),
  );

  await workflowStep(frame, '约束与配置');
  const constraints = frame.getByRole('region', { name: '约束与配置', exact: true });
  await constraints.locator('summary').filter({ hasText: '高级配置：' }).click();
  const movements = constraints.getByRole('region', { name: '既有库存变动确认', exact: true });
  const entries = movements.getByRole('table').locator('tbody tr');
  await expect(entries).toHaveCount(25);
  await beginAdjustment(constraints);
  const enterMovement = async (quantity) => {
    const entry = entries.first();
    const input = entry.getByRole('textbox', { name: /既有生产入库$/ });
    const label = await input.getAttribute('aria-label');
    await input.fill(quantity);
    await entry.getByRole('textbox', { name: /既有计划来源$/ }).fill('已确认计划');
    await entry.getByRole('textbox', { name: /既有计划确认原因$/ }).fill('验证跨页草稿');
    return label;
  };
  const firstInput = await enterMovement('10');
  await movements.getByRole('button', { name: '既有库存变动下一页' }).click();
  const secondInput = await enterMovement('20');
  assert.notEqual(firstInput, secondInput);
  await saveAdjustment(constraints);
  await expect(constraints.getByRole('button', { name: '调整', exact: true })).toBeEnabled();
  await expect(movements.getByLabel(secondInput, { exact: true })).toHaveText('20');
  await movements.getByRole('button', { name: '既有库存变动上一页' }).click();
  await expect(movements.getByLabel(firstInput, { exact: true })).toHaveText('10');
});
