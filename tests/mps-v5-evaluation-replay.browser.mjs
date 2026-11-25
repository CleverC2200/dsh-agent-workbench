import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import {
  mpsPageWithExactProductPeriod as mpsPage,
  openMpsProductDetails,
} from './helpers/mps-page.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';
import {
  workflowStep,
  openCategoryCalculation,
  selectAdjustmentReason,
} from './helpers/mps-edit.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const codes = ['A', 'B', 'STILL'];
const months = ['2026-12', '2027-01', '2027-02'];
const entries = [
  ['郑州', 'A', 60],
  ['郑州', 'B', 40],
  ['郑州', 'STILL', 100],
  ['华东', 'B', 9000],
  ['郑州', 'Z', 8000],
];
const evidence = process.env.MPS07_EVIDENCE_DIR;
const upload = (frame, label, text) =>
  frame.getByLabel(label, { exact: true }).setInputFiles({
    name: 'V5回放.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(text),
  });
async function download(page, frame, button, name) {
  const pending = page.waitForEvent('download');
  await frame.getByRole('button', { name: button, exact: true }).click();
  const file = await pending;
  if (evidence) await file.saveAs(`${evidence}/${name}-${file.suggestedFilename()}`);
  const text = await mpsDownloadText(await file.path());
  const book = XLSX.read(text, { type: 'string', raw: true });
  return { text, rows: XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' }) };
}

test('V5同一12月版本从同步产品到第7步，源明细、页面和实际下载对账并保留原草稿', async (t) => {
  if (evidence) await mkdir(evidence, { recursive: true });
  const { page, frame, calls } = await mpsPage(
    t,
    config,
    ({ queryId, parameters }) => {
      const sourceId =
        Object.keys(config.queries).find(
          (id) => config.queries[id].pagination?.countQuery === queryId,
        ) ?? queryId;
      let rows = [];
      if (sourceId === 'products.detail')
        rows = [...codes, 'Z', 'VIRTUAL'].map((code) => ({
          stat_period: parameters.month,
          target_base: code === 'VIRTUAL' ? 'ODM' : '郑州',
          material_code: code,
          material_name: `产品${code}`,
          responsible_item: code === 'Z' ? '粽子' : '点心',
          product_item: code === 'STILL' ? '其他' : '包点',
          product_item_name: '组',
          series: '系列',
          source_rows: 1,
        }));
      if (queryId === 'facts.shipment-latest') rows = [{ latest_date: '2026-11-23' }];
      if (sourceId === 'facts.shipment')
        rows = ['B', 'STILL'].map((code) => ({
          belong_base: '郑州',
          material_code: code,
          material_name: `产品${code}`,
          series: '系列',
          product_item: code === 'STILL' ? '其他' : '包点',
          month_order_qty: null,
          shipped: code === 'B' ? 1000 : 0,
          prepped: 0,
          unprepped: 0,
          daily3: 0,
          average: 0,
          raw_average: 0,
          open: code === 'B' ? 1000 : 500,
          inbound: 0,
          source_days: 23,
          duplicate_days: 0,
          transfer_date: '2026-11-23',
          transfer_rows: 1,
          transfer_in_plan_v1: 0,
          transfer_in_plan_adj: null,
          transfer_out_plan_v1: 0,
          transfer_out_plan_adj: null,
        }));
      if (queryId.startsWith('facts.history'))
        rows = entries.map(([base, code, quantity]) => ({
          'agents_scm_cust_deliv_daily_di.belong_base': base,
          'agents_scm_cust_deliv_daily_di.material_code': code,
          'agents_scm_cust_deliv_daily_di.act_dl_qty_total':
            queryId === 'facts.history' && code === 'A' ? 0 : quantity,
        }));
      if (queryId.startsWith('facts.plan-quantity'))
        rows = entries.map(([belong_base, material_code, quantity]) => ({
          belong_base,
          material_code,
          plan_qty_total: quantity,
          known_plan_qty_total: quantity,
          source_plan_qty_total: quantity,
          source_rows: 1,
          missing_rows: 0,
          duplicate_rows: 0,
        }));
      if (queryId.startsWith('category-history.'))
        rows = parameters.months.flatMap((stat_month) =>
          entries.map(([belong_base, dimension_value, quantity]) => ({
            dimension_type: '基地+产品',
            stat_month,
            belong_base,
            dimension_value,
            dimension_act_dl_qty: quantity,
            last_year_dimension_act_dl_qty: quantity,
            last_month_dimension_act_dl_qty: quantity,
            base_fiscal_act_dl_qty: quantity * 12,
            base_fiscal_month_count: 12,
            base_fiscal_quantity_month_count: 12,
            national_dimension_fiscal_act_dl_qty: 999999,
            fiscal_year: `${Number(stat_month.slice(0, 4)) - (Number(stat_month.slice(4)) < 7 ? 1 : 0)}财年`,
            source_rows: 1,
          })),
        );
      if (queryId.startsWith('annual-pool.'))
        rows = ['2026-11', ...months, '2027-03'].flatMap((stat_month) =>
          entries.map(([belong_base, material_code, demand_qty]) => ({
            stat_month,
            belong_base,
            material_code,
            sub_category: '旧分类',
            demand_qty,
            source_rows: 1,
            missing_qty: 0,
            duplicate_rows: 0,
          })),
        );
      if (sourceId === 'transfers.detail')
        rows = codes.map((material_code) => ({
          stat_period: '2026-11',
          target_base: '郑州',
          material_code,
          transfer_tag: material_code === 'B' ? 'ODM代工品' : '自产',
          transfer_direction: '',
        }));
      return {
        rows: queryId.endsWith('.count')
          ? [{ total: rows.length }]
          : rows.map((row) => ({
              ...Object.fromEntries(
                (config.queries[queryId].columns ?? []).map((field) => [field, null]),
              ),
              ...row,
            })),
        returnedColumns: config.queries[queryId].columns,
        configVersion: 'v5-integrated-replay',
        totalRowCount: rows.length,
        offset: parameters.offset ?? 0,
        hasMorePages: false,
      };
    },
    { time: '2026-11-24T12:00:00+08:00' },
  );
  await expect
    .poll(() => page.evaluate(() => window.readView()?.localDrafts?.drafts[0]?.productPeriod))
    .toEqual({ targetMonth: '2026-11', adoptedMonth: '2026-11' });
  const original = await page.evaluate(() => window.readView().localDrafts);
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-12');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  const selected = await frame.getByLabel('评估版本选择').inputValue();
  const products = await openMpsProductDetails(frame);
  await expect(products).toContainText('产品STILL');
  await expect(products).not.toContainText('产品Z');
  await expect(products).not.toContainText('ODM');
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n' +
      entries
        .map(
          ([base, code, quantity]) =>
            `2026-12,${base},${code},产品${code},点心,系列,${code === 'STILL' ? '其他' : '包点'},${quantity},${quantity}`,
        )
        .join('\n'),
  );
  await frame.getByRole('button', { name: '读取三年同比源值', exact: true }).click();
  await expect(frame.getByRole('button', { name: '读取三年同比源值', exact: true })).toBeEnabled();
  await frame.getByRole('button', { name: '读取去年发运占比源值', exact: true }).click();
  await expect(frame.getByText('全年历史读取中…')).toHaveCount(0);
  const sources = await download(page, frame, '下载大类池内源明细', '01-sources');
  assert.doesNotMatch(sources.text, /华东|粽子|9000|8000/);
  assert.match(sources.text, /999999/);
  await workflowStep(frame, '本月预估发货');
  await frame.getByLabel('数据截止日', { exact: true }).fill('2026-11-23');
  await frame.getByRole('button', { name: '同步实际发货', exact: true }).click();
  await expect(frame.getByRole('button', { name: '下载明细', exact: true })).toBeEnabled();
  const shipment = await download(page, frame, '下载明细', '02-shipment');
  assert.equal(shipment.rows.find((row) => row.产品编码 === 'A').整月预估发货, '0');
  assert.equal(shipment.rows.find((row) => row.产品编码 === 'B').整月预估发货, '1000');
  assert.doesNotMatch(shipment.text, /ODM|供给标签|华东|VIRTUAL/);
  await workflowStep(frame, '需求确认');
  await openCategoryCalculation(frame);
  const category = await download(page, frame, '下载测算明细', '01-category');
  assert.equal(
    category.rows.find((row) => row.月份.startsWith('2026-12')).本月有效预估发货,
    '1000',
  );
  assert.doesNotMatch(category.text, /999999|9000|8000|ODM/);
  await workflowStep(frame, '需求加工与收敛');
  const demand = await download(page, frame, '下载当前范围需求', '03-demand');
  const annual = demand.rows.filter((row) => row.粒度 === '财年历史');
  assert.deepEqual(
    annual.map((row) => [row.产品编码, row.计算用历史数量, row.历史占比, row.销售提报占比]),
    [
      ['A', '60', '0', '0.3'],
      ['B', '40', '0.5', '0.2'],
      ['STILL', '100', '0.5', '0.5'],
    ],
  );
  assert.doesNotMatch(demand.text, /ODM|供给标签|华东|VIRTUAL|粽子/);
  const leaf = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  for (const code of codes) {
    await leaf.getByLabel('搜索当前步骤', { exact: true }).fill(code);
    await leaf.getByRole('button', { name: '调整', exact: true }).click();
    for (const month of [...months, '2027-03'])
      await leaf
        .getByLabel(`点心 ${code === 'STILL' ? '其他' : '包点'} ${code} 郑州 ${month} 需求数量`, {
          exact: true,
        })
        .fill(code === 'B' ? '30' : '0');
    await selectAdjustmentReason(leaf, '固定回放确认量');
    await leaf.getByRole('button', { name: '保存调整', exact: true }).click();
  }
  await leaf.getByLabel('搜索当前步骤', { exact: true }).fill('');
  await workflowStep(frame, '主数据对应关系');
  await expect(
    frame.getByRole('region', { name: '单品与候选产线', exact: true }),
  ).not.toContainText('华东');
  await workflowStep(frame, '约束与配置');
  const constraints = frame.getByRole('region', { name: '约束与配置', exact: true });
  await constraints.getByRole('button', { name: '调整', exact: true }).click();
  for (const code of codes) {
    await constraints.getByLabel(`郑州 ${code} 补充目标周转天数`, { exact: true }).fill('0');
    for (const month of months) {
      for (const title of ['既有生产入库', '既有在途入库', '既有调入', '既有调出'])
        await frame.getByLabel(`郑州 ${code} ${month} ${title}`, { exact: true }).fill('0');
      await frame
        .getByLabel(`郑州 ${code} ${month} 既有计划来源`, { exact: true })
        .fill('固定源明细已核对');
      await frame
        .getByLabel(`郑州 ${code} ${month} 既有计划确认原因`, { exact: true })
        .fill('确认无期间进出');
    }
  }
  await constraints.getByRole('button', { name: '保存调整', exact: true }).click();
  await workflowStep(frame, '产能评估与缺口');
  await frame.getByRole('button', { name: '执行评估', exact: true }).click();
  await expect(frame.getByRole('button', { name: '重新评估', exact: true })).toBeEnabled();
  const capacity = await download(page, frame, '导出求解结果', '06-capacity');
  await expect(frame.getByRole('heading', { name: 'ODM默认计划到货', exact: true })).toBeVisible();
  const odm = await download(page, frame, '导出ODM默认计划到货', '06-odm');
  assert.deepEqual(
    odm.rows.map((row) => Number(row['默认计划到货量（件）'])),
    [30, 30, 30],
  );
  await workflowStep(frame, '产销存报告');
  const report = await download(page, frame, '导出产销存结果', '07-report');
  assert.deepEqual(capacity.rows, report.rows);
  assert.deepEqual(
    report.rows
      .filter((row) => row.产品编码 === 'STILL')
      .map((row) => [row.期初库存, row.实际期末库存]),
    [
      ['500', '500'],
      ['500', '500'],
      ['500', '500'],
    ],
  );
  assert.deepEqual(
    report.rows
      .filter((row) => row.产品编码 === 'B')
      .map((row) => [
        row.需求已满足量,
        row.ODM默认计划到货量,
        row.内部实际排产量,
        row.实际期末库存,
      ]),
    [
      ['30', '30', '0', '0'],
      ['30', '30', '0', '0'],
      ['30', '30', '0', '0'],
    ],
  );
  assert.ok(report.rows.every((row) => row.基地 === '郑州' && codes.includes(row.产品编码)));
  assert.equal(await frame.getByLabel('评估版本选择').inputValue(), selected);
  const final = await page
    .waitForFunction((id) => {
      const state = window.readView()?.localDrafts;
      return state?.selected === id ? state : null;
    }, selected)
    .then((snapshot) => snapshot.jsonValue());
  for (const old of original.drafts)
    assert.deepEqual(
      final.drafts.find((row) => row.id === old.id),
      old,
    );
  assert.equal(await page.evaluate(() => window.peerDraft), '历史草稿，请保留。');
  if (evidence) {
    await writeFile(
      `${evidence}/replay-result.json`,
      JSON.stringify(
        {
          selected,
          original,
          final,
          calls,
          category: category.rows,
          annual,
          report: report.rows,
          odm: odm.rows,
        },
        null,
        2,
      ),
    );
    await page.screenshot({ path: `${evidence}/07-report.png`, fullPage: true });
  }
});
