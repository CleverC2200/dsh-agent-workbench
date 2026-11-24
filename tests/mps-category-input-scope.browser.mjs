import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { readFile, writeFile } from 'node:fs/promises';
import { mpsPage } from './helpers/mps-page.mjs';
import { openCategoryCalculation } from './helpers/mps-edit.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));

for (const aggregateAnnual of [false, true])
  test(`category demand and CSV scope base SKU details; unassignable annual summary ${aggregateAnnual}`, async (t) => {
    const { page, frame } = await mpsPage(t, config, ({ queryId, parameters }) => {
      const entries = [
        ['郑州', 'A', 100],
        ['华东', 'A', 9000],
        ['郑州', 'Z', 8000],
      ];
      let rows = [];
      if (queryId.startsWith('products.'))
        rows = [
          ['A', '水饺'],
          ['Z', '粽子'],
        ].map(([material_code, responsible_item]) => ({
          stat_period: parameters.month ?? '2026-12',
          target_base: '郑州',
          material_code,
          material_name: material_code,
          responsible_item,
          sub_category: responsible_item,
          product_item: '组',
          product_item_name: '组',
          series: '系列',
          source_rows: 1,
        }));
      if (queryId.startsWith('facts.history'))
        rows = entries.map(([base, code, quantity]) => ({
          'agents_scm_cust_deliv_daily_di.belong_base': base,
          'agents_scm_cust_deliv_daily_di.material_code': code,
          'agents_scm_cust_deliv_daily_di.act_dl_qty_total': quantity,
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
            fiscal_year: stat_month.slice(0, 4),
            source_rows: 1,
          })),
        );
      if (queryId.startsWith('annual-pool.'))
        rows = ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'].flatMap((stat_month) =>
          entries.map(([belong_base, material_code, quantity]) => ({
            belong_base,
            material_code,
            sub_category: '旧分类',
            stat_month,
            source_rows: 1,
            missing_qty: 0,
            duplicate_rows: 0,
            demand_qty: quantity,
          })),
        );
      if (aggregateAnnual && queryId.startsWith('annual-pool.'))
        rows = [...Map.groupBy(rows, (row) => row.stat_month).values()].map(([row]) => ({
          ...row,
          belong_base: '全国',
          material_code: null,
          sub_category: '水饺',
        }));
      return {
        rows: queryId.endsWith('.count')
          ? [{ total: rows.length }]
          : rows.map((row) => ({
              ...Object.fromEntries(
                config.queries[queryId].columns.map((column) => [column, null]),
              ),
              ...row,
            })),
        returnedColumns: config.queries[queryId].columns,
        configVersion: 'v5-category-detail',
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
      name: '产品.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,甲产品,水饺,系列,组,,\n郑州,Z,粽子,粽子,系列,组,,',
      ),
    });
    await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
      name: '计划.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,郑州,A,甲产品,水饺,系列,组,100,100',
      ),
    });
    await frame.getByRole('button', { name: '读取三年同比源值', exact: true }).click();
    await expect(
      frame.getByRole('button', { name: '读取三年同比源值', exact: true }),
    ).toBeEnabled();
    await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
    await frame.getByLabel('数据截止日', { exact: true }).fill('2026-11-22');
    await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
      name: '发货.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库,近30天日均发货\n2026-11,郑州,A,甲产品,水饺,系列,组,100,0,0,0,0,0,0,0',
      ),
    });
    await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
    const matrix = frame.getByRole('region', { name: '大类预估需求数量', exact: true });
    await expect(
      matrix.getByRole('row').filter({ hasText: '水饺' }).locator('.dc-demand-amount'),
    ).toHaveText(aggregateAnnual ? ['100', '100', '待补', '待补'] : ['100', '100', '100', '100']);
    const sourceDownload = page.waitForEvent('download');
    await frame.getByRole('button', { name: '下载大类池内源明细', exact: true }).click();
    const sourceCsv = await mpsDownloadText(await (await sourceDownload).path());
    if (process.env.MPS02_EVIDENCE_DIR)
      await writeFile(
        `${process.env.MPS02_EVIDENCE_DIR}/pool-sources-${aggregateAnnual}.csv`,
        sourceCsv,
      );
    assert.match(sourceCsv, /原始全国SKU财年量/);
    assert.match(sourceCsv, /999999/);
    assert.match(sourceCsv, /1200,12,12/);
    assert.doesNotMatch(sourceCsv, /华东|粽子|9000|8000/);
    await openCategoryCalculation(frame);
    const calculation = frame.getByRole('region', { name: '逐月测算', exact: true });
    const downloading = page.waitForEvent('download');
    await calculation.getByRole('button', { name: '下载测算明细', exact: true }).click();
    const csv = await mpsDownloadText(await (await downloading).path());
    if (process.env.MPS02_EVIDENCE_DIR)
      await writeFile(
        `${process.env.MPS02_EVIDENCE_DIR}/category-calculation-${aggregateAnnual}.csv`,
        csv,
      );
    assert.doesNotMatch(csv, /9000|8000|999999|粽子|旧分类/);
    const book = XLSX.read(csv, { type: 'string', raw: true });
    const records = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
    assert.equal(records.length, 4);
    assert(
      records.slice(0, aggregateAnnual ? 2 : 4).every((row) => Number(row['系统需求数量']) === 100),
      csv,
    );
    if (aggregateAnnual) assert.match(csv, /缺可追溯的基地SKU明细/);
  });
