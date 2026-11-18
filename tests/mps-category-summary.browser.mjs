import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mpsPage } from './helpers/mps-page.mjs';
import { openCategoryCalculation, beginAdjustment, saveAdjustment } from './helpers/mps-edit.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));

test('category monthly totals retain missing inputs and real zero, and filters match calculations and downloads', async (t) => {
  const { page, frame } = await mpsPage(t, config, ({ queryId, parameters }) => {
    const products = [
      ['A', '甲类', 100],
      ['B', '乙类', 0],
    ];
    let rows = [];
    if (queryId.startsWith('facts.history'))
      rows = products.map(([code, , quantity]) => ({
        'agents_scm_cust_deliv_daily_di.belong_base': '郑州',
        'agents_scm_cust_deliv_daily_di.material_code': code,
        'agents_scm_cust_deliv_daily_di.act_dl_qty_total': quantity,
      }));
    if (queryId.startsWith('facts.plan-quantity'))
      rows = products.map(([material_code]) => ({
        belong_base: '郑州',
        material_code,
        plan_qty_total: 100,
        known_plan_qty_total: 100,
        source_plan_qty_total: 100,
        source_rows: 1,
        missing_rows: 0,
        duplicate_rows: 0,
      }));
    if (queryId.startsWith('category-history.'))
      rows = parameters.months.flatMap((stat_month) =>
        products.map(([, dimension_value]) => ({
          dimension_type: '基地+大类',
          stat_month,
          belong_base: '郑州',
          dimension_value,
          dimension_act_dl_qty: 100,
          last_year_dimension_act_dl_qty: 100,
          last_month_dimension_act_dl_qty: 100,
          national_dimension_fiscal_act_dl_qty: 1000,
          fiscal_year: stat_month.slice(0, 4),
          source_rows: 1,
        })),
      );
    if (queryId.startsWith('annual-pool.')) rows = [];
    return {
      rows: queryId.endsWith('.count')
        ? [{ total: rows.length }]
        : rows.map((row) => ({
            ...Object.fromEntries(config.queries[queryId].columns.map((column) => [column, null])),
            ...row,
          })),
      returnedColumns: config.queries[queryId].columns,
      configVersion: 'category-summary-source',
      totalRowCount: rows.length,
      offset: 0,
      hasMorePages: false,
      dataStatus: 'ok',
      warnings: [],
    };
  });
  await page.clock.setFixedTime(new Date('2026-11-22T12:00:00+08:00'));
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const creation = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await creation.getByLabel('评估月份', { exact: true }).fill('2026-12');
  await creation.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '大类.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,甲产品,甲类,系列,组,,\n郑州,B,乙产品,乙类,系列,组,,\n郑州,C,丙产品,丙类,系列,组,,',
    ),
  });
  const matrix = frame.getByRole('region', { name: '大类预估需求数量', exact: true });
  const total = () => matrix.getByRole('row').filter({ hasText: /^(合计|当前范围合计)/ });
  await expect(total().locator('.dc-demand-amount')).toHaveText(['待补', '待补', '待补', '待补']);
  await expect(matrix.getByRole('button', { name: '调整', exact: true })).toHaveCount(0);
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '计划.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,郑州,A,甲产品,甲类,系列,组,100,100\n2026-12,郑州,B,乙产品,乙类,系列,组,100,100',
    ),
  });
  await frame.getByRole('button', { name: '读取三年同比源值', exact: true }).click();
  await expect(frame.getByRole('button', { name: '读取三年同比源值', exact: true })).toBeEnabled();
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await frame.getByLabel('数据截止日', { exact: true }).fill('2026-11-22');
  await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
    name: '发货.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库,近30天日均发货\n2026-11,郑州,A,甲产品,甲类,系列,组,100,0,0,0,0,0,0,0\n2026-11,郑州,B,乙产品,乙类,系列,组,0,0,0,0,0,0,0,0',
    ),
  });
  await beginAdjustment(frame);
  await frame.getByLabel('全国合计 整月预估发货', { exact: true }).fill('100');
  await saveAdjustment(frame);
  await expect(frame.getByRole('button', { name: '保存调整', exact: true })).toHaveCount(0);
  await expect(
    frame.getByRole('button', { name: '全国合计 整月预估发货 计算过程', exact: true }),
  ).toHaveText('100');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  await expect(total().locator('.dc-demand-amount')).toHaveText(['100', '100', '待补', '待补']);
  await expect(total().getByRole('cell').nth(1)).toContainText('已知小计 · 1项待补');
  await openCategoryCalculation(frame);
  const calculation = frame.getByRole('region', { name: '逐月测算', exact: true });
  await expect(calculation.locator('tbody tr')).toHaveCount(12);
  await matrix.getByLabel('大类筛选', { exact: true }).selectOption('乙类');
  await expect(total().locator('.dc-demand-amount')).toHaveText(['0', '0', '待补', '待补']);
  await expect(total().getByRole('cell').nth(1)).not.toContainText('待补');
  await expect(calculation.locator('tbody tr')).toHaveCount(4);
  await expect(calculation.locator('tbody tr td:first-child')).toHaveText([
    '乙类',
    '乙类',
    '乙类',
    '乙类',
  ]);
  await expect(calculation).toContainText('2 / 4 项可计算');
  const downloading = page.waitForEvent('download');
  await calculation.getByRole('button', { name: '下载测算明细', exact: true }).click();
  const csv = await mpsDownloadText(await (await downloading).path());
  assert.match(csv, /乙类/);
  assert.doesNotMatch(csv, /甲类|丙类/);
  await matrix.getByLabel('大类筛选', { exact: true }).selectOption('');
  await expect(total().locator('.dc-demand-amount').first()).toHaveText('100');
  await expect(calculation.locator('tbody tr')).toHaveCount(12);
  if (process.env.MPS03_EVIDENCE_DIR)
    await page.screenshot({ path: `${process.env.MPS03_EVIDENCE_DIR}/category-summary.png` });
});
