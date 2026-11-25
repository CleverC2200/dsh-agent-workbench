import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsPageWithExactProductPeriod as mpsPage } from './helpers/mps-page.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const codes = ['STILL', 'MOVE', 'RETIRED'];
const months = ['2026-12', '2027-01', '2027-02', '2027-03'];
async function download(page, frame, button) {
  const waiting = page.waitForEvent('download');
  await frame.getByRole('button', { name: button, exact: true }).click();
  const file = await waiting;
  assert.match(file.suggestedFilename(), /\.csv$/);
  if (process.env.MPS05_EVIDENCE_DIR)
    await file.saveAs(`${process.env.MPS05_EVIDENCE_DIR}/${file.suggestedFilename()}`);
  const data = await readFile(await file.path());
  const book = XLSX.read(data.toString('utf8'), { type: 'string', raw: true });
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
}

test('同一评估6/7页及业务CSV逐列核库存，下市日均缺项保留来源并用0消化', async (t) => {
  const { page, frame } = await mpsPage(
    t,
    config,
    ({ queryId, parameters }) => {
      const sourceId =
        Object.keys(config.queries).find(
          (id) => config.queries[id].pagination?.countQuery === queryId,
        ) ?? queryId;
      let rows = [];
      if (queryId === 'facts.shipment-latest') rows = [{ latest_date: '2026-11-30' }];
      if (sourceId === 'facts.shipment')
        rows = codes.map((code) => ({
          belong_base: '郑州',
          material_code: code,
          material_name: code,
          series: '系列',
          product_item: '组',
          month_order_qty: null,
          shipped: 0,
          prepped: 0,
          unprepped: 0,
          daily3: 0,
          average: 0,
          raw_average: code === 'RETIRED' ? null : 0,
          open: 500,
          inbound: 0,
          source_days: 30,
          duplicate_days: 0,
          transfer_date: '2026-11-30',
          transfer_rows: 1,
          transfer_in_plan_v1: 0,
          transfer_in_plan_adj: null,
          transfer_out_plan_v1: 0,
          transfer_out_plan_adj: null,
        }));
      if (sourceId === 'transfers.detail')
        rows = codes.map((code) => ({
          stat_period: '2026-11',
          target_base: '郑州',
          material_code: code,
          transfer_tag: code === 'RETIRED' ? '下市品' : '自产',
          transfer_direction: '',
        }));
      rows = rows.map((row) => ({
        ...Object.fromEntries(
          (config.queries[sourceId].columns ?? []).map((field) => [field, null]),
        ),
        ...row,
      }));
      return {
        rows: queryId.endsWith('.count') ? [{ total: rows.length }] : rows,
        returnedColumns: config.queries[queryId].columns,
        configVersion: 'v5-inventory',
        offset: parameters.offset ?? 0,
        hasMorePages: false,
      };
    },
    { time: '2026-11-24T12:00:00+08:00' },
  );
  const draft = {
    id: 'v5-inventory',
    name: 'V5库存',
    month: '2026-12',
    pull: 'monthly',
    inputs: {
      products: {
        file: '产品.csv',
        rows: codes.map((code) => ({
          基地: '郑州',
          产品编码: code,
          产品名称: code,
          大类: '点心',
          系列: '系列',
          物料组: '组',
        })),
      },
    },
    constraints: {
      safetyDays: [],
      turnoverDays: codes.map((code) => ({ base: '郑州', code, days: 0 })),
      rules: { local: [] },
    },
    adjustments: {
      categoryDemand: [],
      shares: [],
      history: [],
      quantities: months.flatMap((month) =>
        codes.map((code) => ({
          kind: 'base-sku',
          month,
          category: '点心',
          group: '组',
          base: '郑州',
          code,
          quantity: 0,
          systemValue: null,
          reason: '确认无需求',
          at: '2026-11-24T00:00:00.000Z',
        })),
      ),
    },
    inventoryMovements: months.slice(0, 3).flatMap((month, index) =>
      codes.map((code) => ({
        month,
        base: '郑州',
        code,
        productionInbound: code === 'MOVE' ? [20, 5, 0][index] : 0,
        inTransitInbound: code === 'MOVE' ? [15, 0, 0][index] : 0,
        transferIn: code === 'MOVE' ? [7, 0, 0][index] : 0,
        transferOut: code === 'MOVE' ? [2, 10, 0][index] : 0,
        source: '已核对订单',
        reason: '明确零表示无进出',
        at: '2026-11-24T00:00:00.000Z',
      })),
    ),
    shipment: { cutoff: '2026-11-30', activeSource: 'business' },
  };
  await page.evaluate(
    async (draft) =>
      window.openAuthor('mps', 1200, {
        version: 1,
        localDrafts: { format: 1, selected: draft.id, drafts: [draft] },
      }),
    draft,
  );
  const step = (name) => frame.locator('.ap-page-tab').filter({ hasText: name }).click();
  await step('本月预估发货');
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(frame.getByRole('button', { name: '同步实际发货', exact: true })).toBeEnabled();
  await step('产能评估与缺口');
  await frame.getByRole('button', { name: '执行评估', exact: true }).click();
  await expect(frame.getByRole('button', { name: '重新评估', exact: true })).toBeEnabled();
  const capacity = await download(page, frame, '导出求解结果');
  await step('产销存报告');
  const report = await download(page, frame, '导出产销存结果');
  assert.deepEqual(capacity, report);
  const columns = [
    '期初库存',
    '既有生产入库',
    '既有在途入库',
    '既有调入',
    '既有调出',
    '内部实际排产量',
    'ODM默认计划到货量',
    '需求已满足量',
    '实际期末库存',
  ];
  const values = (code) =>
    report
      .filter((row) => row.产品编码 === code)
      .map((row) => columns.map((column) => (row[column] === '' ? '' : Number(row[column]))));
  assert.deepEqual(values('STILL'), [
    [500, 0, 0, 0, 0, 0, 0, 0, 500],
    [500, 0, 0, 0, 0, 0, 0, 0, 500],
    [500, 0, 0, 0, 0, 0, 0, 0, 500],
  ]);
  assert.deepEqual(values('MOVE'), [
    [500, 20, 15, 7, 2, 0, 0, 0, 540],
    [540, 5, 0, 0, 10, 0, 0, 0, 535],
    [535, 0, 0, 0, 0, 0, 0, 0, 535],
  ]);
  const retired = report.filter((row) => row.产品编码 === 'RETIRED');
  assert.equal(retired.length, 3);
  assert.ok(retired.every((row) => Number(row.实际期末库存) === 500));
  assert.ok(retired.every((row) => Number(row.计算用近30天日均发货) === 0));
  assert.ok(retired.every((row) => /avg_30d_send/.test(row.日均来源异常)));
  assert.ok(retired.every((row) => row.原始近30天日均发货 === ''));
  assert.equal(await page.evaluate(() => window.peerDraft), '历史草稿，请保留。');
});
