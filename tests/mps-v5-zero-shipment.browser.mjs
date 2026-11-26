import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsPageWithExactProductPeriod as mpsPage } from './helpers/mps-page.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';
import { openCategoryCalculation, workflowStep } from './helpers/mps-edit.mjs';
import { workflowExportRows } from './helpers/mps-workflow-export.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const stock = (code, date, changes = {}) => ({
  data_month: '2026-11-01',
  the_date: date,
  belong_base: '郑州',
  material_code: code,
  material_name: `产品${code}`,
  series: '系列',
  product_item: '组',
  total_sales_qty: 0,
  allocated_qty: 0,
  ordered_qty: 0,
  month_order_qty: null,
  avg_30d_send: 0,
  begin_stock: 500,
  produce_in_qty: 0,
  transfer_in_plan_v1: 7,
  transfer_in_plan_adj: null,
  transfer_out_plan_v1: 2,
  transfer_out_plan_adj: null,
  ...changes,
});
const records = [
  stock('PACE', '2026-11-21', { total_sales_qty: 30, allocated_qty: 20, ordered_qty: 10 }),
  stock('PACE', '2026-11-23', {
    total_sales_qty: null,
    allocated_qty: 20,
    ordered_qty: 10,
    avg_30d_send: null,
  }),
  stock('KNOWN', '2026-11-19', { total_sales_qty: 1000 }),
  stock('KNOWN', '2026-11-23', { total_sales_qty: null }),
  stock('DUP', '2026-11-23'),
  stock('DUP', '2026-11-23', { total_sales_qty: 9 }),
];
const dailyPlan = (material_code, the_date, ship_qty) => ({
  belong_base: '郑州',
  material_code,
  the_date,
  in_qty: 0,
  ship_qty,
  transfer_in_plan_v1: 7,
  transfer_in_plan_adj: null,
  transfer_out_plan_v1: 2,
  transfer_out_plan_adj: null,
});
const dailyPlans = [
  ...records.map(({ material_code, the_date, total_sales_qty }) =>
    dailyPlan(
      material_code,
      the_date,
      material_code === 'PACE' && total_sales_qty ? 35 : (total_sales_qty ?? 0),
    ),
  ),
  dailyPlan('PLAN_ONLY', '2026-11-23', 450),
  dailyPlan('OUTSIDE_POOL', '2026-11-23', 900),
];
function shipmentSql(query) {
  return JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        `import json,sqlite3,sys
x=json.load(sys.stdin)
db=sqlite3.connect(':memory:')
db.row_factory=sqlite3.Row
for table,rows in x['tables'].items():
  cols=list(rows[0])
  db.execute('CREATE TABLE '+table+' ('+','.join(cols)+')')
  db.executemany('INSERT INTO '+table+' VALUES ('+','.join('?' for _ in cols)+')',[[r[c] for c in cols] for r in rows])
print(json.dumps([dict(r) for r in db.execute(x['sql'],x['parameters'])]))`,
      ],
      {
        input: JSON.stringify({
          tables: {
            agents_scm_stock_detail_d: records,
            agents_ads_scm_base_sku_daily_plan_detail_d: dailyPlans,
          },
          sql: config.queries[query.queryId].request.sql,
          parameters: {
            ...query.parameters,
            gea_p98: query.parameters.page_size,
            gea_p99: query.parameters.offset,
          },
        }),
        encoding: 'utf8',
      },
    ),
  );
}
async function download(page, frame) {
  const pending = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载明细', exact: true }).click();
  const file = await pending;
  if (process.env.MPS03_EVIDENCE_DIR)
    await file.saveAs(`${process.env.MPS03_EVIDENCE_DIR}/shipment.xlsx`);
  const book = XLSX.read(await mpsDownloadText(await file.path()), { type: 'string', raw: true });
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
}
test('成功查询的缺日报和缺发货指标补0，近三天30件除3；重复和失败仍待核，库存和计划保持来源值', async (t) => {
  let failed = false;
  const { page, frame } = await mpsPage(
    t,
    config,
    (query) => {
      if (failed && query.queryId === 'facts.shipment') throw Error('发货源读取失败');
      let rows = [];
      if (query.queryId === 'facts.shipment-latest') rows = [{ latest_date: '2026-11-23' }];
      if (['facts.shipment', 'facts.shipment.count'].includes(query.queryId))
        rows = shipmentSql(query);
      const prefix = 'agents_scm_cust_deliv_daily_di.';
      if (['facts.history', 'facts.history-annual'].includes(query.queryId))
        rows = ['KNOWN', 'MISSING'].map((code) => ({
          [prefix + 'belong_base']: '郑州',
          [prefix + 'material_code']: code,
          [prefix + 'material_name']: `产品${code}`,
          [prefix + 'product_categ_name']: '水饺',
          [prefix + 'material_group_name']: '组',
          [prefix + 'act_dl_qty_total']: 100,
          [prefix + 'act_dl_qty_all_total']: 100,
        }));
      if (query.queryId.startsWith('facts.plan-quantity'))
        rows = ['KNOWN', 'MISSING'].map((material_code) => ({
          belong_base: '郑州',
          material_code,
          plan_qty_total: 100,
          known_plan_qty_total: 100,
          source_plan_qty_total: 100,
          source_rows: 1,
          missing_rows: 0,
          duplicate_rows: 0,
        }));
      if (query.queryId.startsWith('category-history.'))
        rows = query.parameters.months.map((stat_month) => ({
          dimension_type: '基地+产品',
          stat_month,
          belong_base: '郑州',
          dimension_value: 'KNOWN',
          dimension_act_dl_qty: 100,
          last_year_dimension_act_dl_qty: 100,
          last_month_dimension_act_dl_qty: 100,
          national_dimension_fiscal_act_dl_qty: 999999,
          base_fiscal_act_dl_qty: 1000,
          fiscal_year: `${Number(stat_month.slice(0, 4)) - (Number(stat_month.slice(4)) < 7 ? 1 : 0)}财年`,
          source_rows: 1,
        }));
      if (!query.queryId.endsWith('.count'))
        rows = rows.map((row) => ({
          ...Object.fromEntries(
            config.queries[query.queryId].columns.map((column) => [column, null]),
          ),
          ...row,
        }));
      return {
        rows:
          query.queryId.endsWith('.count') && query.queryId !== 'facts.shipment.count'
            ? [{ total: rows.length }]
            : rows,
        returnedColumns: config.queries[query.queryId].columns,
        configVersion: 'v5-zero-shipment',
        totalRowCount: rows.length,
        offset: query.parameters.offset ?? 0,
        hasMorePages: false,
      };
    },
    { time: '2026-11-24T12:00:00+08:00' },
  );
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-12');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n' +
        ['PACE', 'KNOWN', 'MISSING', 'DUP', 'PLAN_ONLY']
          .map(
            (code) =>
              `郑州,${code},产品${code},${['PACE', 'DUP', 'PLAN_ONLY'].includes(code) ? '点心' : '水饺'},系列,组,,`,
          )
          .join('\n'),
    ),
  });
  await expect(frame.getByRole('region', { name: '产品明细', exact: true })).toContainText(
    '产品MISSING',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(frame.getByRole('button', { name: '同步实际发货', exact: true })).toBeEnabled();
  await expect(frame.getByRole('button', { name: '下载明细', exact: true })).toBeEnabled();
  const rows = await download(page, frame);
  const pace = rows.find((row) => row.产品编码 === 'PACE');
  assert.equal(pace.本月已发货, '35');
  assert.equal(pace['近三日日均发货'], '10');
  assert.equal(pace.已备, '20');
  assert.equal(pace.未备, '10');
  assert.equal(pace['月初 1 号库存'], '500');
  assert.equal(pace.调入计划, '7');
  const known = rows.find((row) => row.产品编码 === 'KNOWN');
  assert.equal(known.整月预估发货, '1000');
  assert.equal(known['月初 1 号库存'], '500');
  const missing = rows.find((row) => row.产品编码 === 'MISSING');
  assert.equal(missing.整月预估发货, '0');
  assert.equal(missing['月初 1 号库存'], '0');
  for (const field of ['本月生产入库', '剩余天数入库']) assert.equal(missing[field], '', field);
  assert.equal(missing.调入计划, '0');
  assert.equal(missing.调出计划, '0');
  assert.equal(missing.预计月末结存, '0');
  const duplicate = rows.find((row) => row.产品编码 === 'DUP');
  assert.equal(duplicate.整月预估发货, '');
  assert.match(duplicate.预估待补原因, /重复/);
  const planOnly = rows.find((row) => row.产品编码 === 'PLAN_ONLY');
  assert.equal(planOnly.产品名称, '产品PLAN_ONLY');
  assert.equal(planOnly.本月已发货, '450');
  assert.equal(planOnly.已备, '0');
  assert.equal(planOnly['月初 1 号库存'], '0');
  assert.equal(planOnly.本月生产入库, '');
  assert.equal(planOnly.调入计划, '7');
  assert.equal(planOnly.调出计划, '2');
  assert.ok(!rows.some((row) => row.产品编码 === 'OUTSIDE_POOL'));
  if (process.env.MPS03_EVIDENCE_DIR)
    await writeFile(
      `${process.env.MPS03_EVIDENCE_DIR}/shipment-result.json`,
      JSON.stringify(rows, null, 2),
    );
  await workflowStep(frame, '需求确认');
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '提报.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n' +
        ['KNOWN', 'MISSING']
          .map((code) => `2026-12,郑州,${code},产品${code},水饺,系列,组,500,500`)
          .join('\n'),
    ),
  });
  await frame.getByRole('button', { name: '读取三年同比源值', exact: true }).click();
  await expect(frame.getByRole('button', { name: '读取三年同比源值', exact: true })).toBeEnabled();
  await frame.getByRole('button', { name: '读取去年发运占比源值', exact: true }).click();
  await expect(frame.getByText('全年历史读取中…')).toHaveCount(0);
  await openCategoryCalculation(frame);
  const pending = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载测算明细', exact: true }).click();
  const calculationDownload = await pending;
  if (process.env.MPS03_EVIDENCE_DIR)
    await calculationDownload.saveAs(`${process.env.MPS03_EVIDENCE_DIR}/category.xlsx`);
  const book = XLSX.read(await mpsDownloadText(await calculationDownload.path()), {
    type: 'string',
    raw: true,
  });
  const category = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
  assert.equal(
    category.find((row) => row.大类 === '水饺' && row.月份.startsWith('2026-12')).本月有效预估发货,
    '1000',
  );
  await workflowStep(frame, '需求加工与收敛');
  const demand = await workflowExportRows(frame);
  const missingDemand = demand.find((row) => row.产品编码 === 'MISSING' && row.月份 === '2026-12');
  assert.ok(Number(missingDemand.需求数量) > 0, JSON.stringify(missingDemand));
  if (process.env.MPS03_EVIDENCE_DIR)
    await writeFile(
      `${process.env.MPS03_EVIDENCE_DIR}/demand-result.json`,
      JSON.stringify(demand, null, 2),
    );
  if (process.env.MPS03_EVIDENCE_DIR)
    await page.screenshot({
      path: `${process.env.MPS03_EVIDENCE_DIR}/same-evaluation-demand.png`,
      fullPage: true,
    });
  await workflowStep(frame, '本月预估发货');
  failed = true;
  await frame.getByLabel('数据截止日', { exact: true }).fill('2026-11-22');
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(
    frame.getByRole('region', { name: '发货本地核对' }).getByRole('alert'),
  ).toContainText('数据读取失败');
});
