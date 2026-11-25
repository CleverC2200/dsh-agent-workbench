import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsPageWithExactProductPeriod as mpsPage } from './helpers/mps-page.mjs';
import { workflowStep } from './helpers/mps-edit.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const raw = (queryId, code, quantity) => ({
  ...Object.fromEntries(config.queries[queryId].columns.map((column) => [column, null])),
  'agents_scm_cust_deliv_daily_di.belong_base': '四川基地',
  'agents_scm_cust_deliv_daily_di.material_code': code,
  'agents_scm_cust_deliv_daily_di.act_dl_qty_total': quantity,
});
const upload = (frame, label, text) =>
  frame.getByLabel(label, { exact: true }).setInputFiles({
    name: 'V5历史.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(text),
  });
async function download(page, frame) {
  const pending = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载当前范围需求', exact: true }).click();
  const file = await pending;
  if (process.env.MPS_V5_HISTORY_EVIDENCE)
    await file.saveAs(`${process.env.MPS_V5_HISTORY_EVIDENCE}/history-v5.csv`);
  const book = XLSX.read(await mpsDownloadText(await file.path()), {
    type: 'string',
    raw: true,
  });
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {
    defval: '',
  });
}

test('第3步按三月实际归零历史占比并在业务CSV核对同组承接、原始量与提报份额', async (t) => {
  const { page, frame, calls } = await mpsPage(
    t,
    config,
    ({ queryId, parameters }) => {
      const rows =
        queryId === 'facts.history-annual'
          ? ['A', 'B', 'C'].map((code, index) => raw(queryId, code, [60, 40, 100][index]))
          : queryId === 'facts.history'
            ? ['A', 'B', 'C'].map((code) => raw(queryId, code, code === 'A' ? 0 : 1))
            : [];
      return {
        rows: queryId.endsWith('.count') ? [{ total: 0 }] : rows,
        returnedColumns: config.queries[queryId].columns,
        configVersion: 'v5-history',
        totalRowCount: rows.length,
        offset: parameters.offset ?? 0,
        hasMorePages: false,
      };
    },
    { time: '2026-11-24T12:00:00+08:00' },
  );
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-12');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n西南,A,产品A,点心,系列,包点,,\n西南,B,产品B,点心,系列,包点,,\n西南,C,产品C,点心,系列,其他,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,西南,A,产品A,点心,系列,包点,60,60\n2026-12,西南,B,产品B,点心,系列,包点,40,40\n2026-12,西南,C,产品C,点心,系列,其他,100,100',
  );
  await frame.getByRole('button', { name: '读取去年发运占比源值', exact: true }).click();
  await expect(frame.getByText('全年历史读取中…')).toHaveCount(0);
  await expect
    .poll(
      () =>
        new Set(
          calls
            .filter((call) => call.queryId === 'facts.history')
            .map((call) => call.parameters.month),
        ).size,
    )
    .toBe(24);
  await workflowStep(frame, '需求加工与收敛');
  const rows = await download(page, frame);
  const annual = rows.filter((row) => row.粒度 === '财年历史');
  assert.deepEqual(
    annual.map((row) => row.计算用历史数量),
    ['60', '40', '100'],
  );
  assert.deepEqual(
    annual.map((row) => row.历史占比),
    ['0', '0.5', '0.5'],
  );
  assert.deepEqual(
    annual.map((row) => row.销售提报占比),
    ['0.3', '0.2', '0.5'],
  );
  assert.match(annual[0].历史占比处理, /三个月.*归0/);
  assert.match(annual[1].历史占比调整说明, /历史SKU.*承接.*0.6/);
  assert.equal(
    rows.find(
      (row) => row.粒度 === '完整历史月' && row.产品编码 === 'A' && row.历史期间 === '2026-10',
    ).原始历史数量,
    '0',
  );
  assert.equal(
    calls.some(
      (call) => call.queryId === 'facts.history' && call.parameters.month === '2026-11-01',
    ),
    false,
  );
  assert.equal(await page.evaluate(() => window.peerDraft), '历史草稿，请保留。');
});
