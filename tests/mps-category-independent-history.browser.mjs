import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { readFile, writeFile } from 'node:fs/promises';
import { mpsPageWithExactProductPeriod as mpsPage } from './helpers/mps-page.mjs';
import { openCategoryCalculation } from './helpers/mps-edit.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));

for (const scenario of [
  'independent',
  'missing-month',
  'invalid-quantity',
  'fiscal-conflict',
  'inconsistent-overlap',
  'read-failure',
  'aggregate-only',
  'mixed-annual',
  'excluded-overlap',
  'other-category-overlap',
])
  test(`category demand and CSV scope base SKU details; independent monthly populations ${scenario}`, async (t) => {
    const complete = [
      'independent',
      'mixed-annual',
      'excluded-overlap',
      'other-category-overlap',
    ].includes(scenario);
    const { page, frame, calls } = await mpsPage(t, config, ({ queryId, parameters }) => {
      const entries = [
        ['郑州', 'A', 100],
        ['华东', 'A', 9000],
        ['郑州', 'Z', 8000],
      ];
      let rows = [];
      if (queryId.startsWith('products.'))
        rows = [
          ['A', '水饺'],
          ['B', '水饺'],
          ['Z', '粽子'],
          ...(scenario === 'other-category-overlap' ? [['T', '汤圆']] : []),
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
      if (
        queryId.startsWith('category-history.') &&
        scenario === 'read-failure' &&
        parameters.months.at(-1) === '202606'
      )
        throw Error('历史源读取失败测试');
      if (queryId.startsWith('category-history.'))
        rows = parameters.months.flatMap((stat_month) => {
          if (scenario === 'missing-month' && stat_month === '202606') return [];
          const month = Number(stat_month.slice(4));
          const population =
            scenario === 'aggregate-only' ? [] : month === 12 ? [['B', 200]] : [['A', 100]];
          return [
            ...population.map(([code, quantity]) => ['郑州', code, quantity]),
            ['华东', 'A', 9000],
            ['郑州', 'Z', 8000],
            ['', 'A', 7000],
            ...(scenario === 'other-category-overlap'
              ? [['郑州', 'T', parameters.months.at(-1) === '202606' ? 501 : 500]]
              : []),
          ].map(([belong_base, dimension_value, quantity]) => ({
            dimension_type: '基地+产品',
            stat_month,
            belong_base:
              scenario === 'excluded-overlap' &&
              parameters.months.at(-1) === '202606' &&
              belong_base === '郑州'
                ? '郑州基地'
                : belong_base,
            dimension_value,
            dimension_act_dl_qty:
              belong_base === '郑州' &&
              dimension_value === 'A' &&
              stat_month === '202506' &&
              scenario === 'invalid-quantity'
                ? null
                : belong_base === '郑州' &&
                    dimension_value === 'A' &&
                    stat_month === '202501' &&
                    scenario === 'inconsistent-overlap' &&
                    parameters.months.at(-1) === '202606'
                  ? 101
                  : scenario === 'excluded-overlap' &&
                      parameters.months.at(-1) === '202606' &&
                      (belong_base !== '郑州' || dimension_value === 'Z')
                    ? quantity + 1
                    : quantity,
            last_year_dimension_act_dl_qty: null,
            last_month_dimension_act_dl_qty: null,
            base_fiscal_act_dl_qty: null,
            base_fiscal_month_count: 1,
            base_fiscal_quantity_month_count: 1,
            national_dimension_fiscal_act_dl_qty:
              scenario === 'excluded-overlap' && parameters.months.at(-1) === '202606'
                ? 999998
                : 999999,
            fiscal_year:
              stat_month === '202506' && scenario === 'fiscal-conflict'
                ? '不一致财年'
                : `${Number(stat_month.slice(0, 4)) - (month < 7 ? 1 : 0)}财年`,
            source_rows: 1,
          }));
        });
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
      if (queryId.startsWith('annual-pool.') && scenario === 'mixed-annual')
        rows.push(
          ...rows
            .filter((row) => row.belong_base === '郑州' && row.material_code === 'A')
            .map((row) => ({ ...row, belong_base: '', demand_qty: 7000 })),
        );
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
        '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,甲产品,水饺,系列,组,,\n郑州,B,乙产品,水饺,系列,组,,\n郑州,Z,粽子,粽子,系列,组,,' +
          (scenario === 'other-category-overlap' ? '\n郑州,T,汤圆,汤圆,系列,汤圆组,,' : ''),
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
    if (scenario === 'independent') {
      assert(
        calls.some(
          (call) =>
            call.queryId === 'category-history.detail' &&
            call.parameters.months.length === 8 &&
            call.parameters.months.includes('202212'),
        ),
      );
      await frame
        .locator('.dc-parameter')
        .filter({ has: frame.getByRole('heading', { name: '三年同比', exact: true }) })
        .getByRole('button', { name: '预览', exact: true })
        .click();
      const dialog = frame.getByRole('dialog', { name: '三年同比 · 源值核对', exact: true });
      const pending = page.waitForEvent('download');
      await dialog.getByRole('button', { name: '下载同比分子分母', exact: true }).click();
      const text = await mpsDownloadText(await (await pending).path());
      const workbook = XLSX.read(text, { type: 'string', raw: true });
      const records = XLSX.utils
        .sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' })
        .filter((row) => row['目标月份'] === '2026-12');
      assert.equal(records.length, 3);
      assert(
        records.every(
          (row) =>
            Number(row['分子数量']) === 200 &&
            Number(row['分母数量']) === 200 &&
            row['参与平均'] === '是',
        ),
        text,
      );
      await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    }
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
      matrix.getByRole('row').filter({ hasText: '水饺' }).locator('.dc-demand-amount').first(),
    ).toHaveText(complete ? '150' : '待补');
    const sourceDownload = page.waitForEvent('download');
    await frame.getByRole('button', { name: '下载大类池内源明细', exact: true }).click();
    const sourceCsv = await mpsDownloadText(await (await sourceDownload).path());
    if (process.env.MPS02_EVIDENCE_DIR)
      await writeFile(`${process.env.MPS02_EVIDENCE_DIR}/pool-sources-${scenario}.csv`, sourceCsv);
    assert.match(sourceCsv, /原始全国SKU财年量/);
    assert.match(sourceCsv, /999999/);
    assert.match(sourceCsv, /7000/);
    if (scenario === 'excluded-overlap') {
      assert.match(sourceCsv, /7001/);
      assert.match(sourceCsv, /999998/);
    }
    assert.doesNotMatch(sourceCsv, /华东|粽子|9000|8000/);
    const sourceBook = XLSX.read(sourceCsv, { type: 'string', raw: true });
    const sourceRecords = XLSX.utils.sheet_to_json(sourceBook.Sheets[sourceBook.SheetNames[0]], {
      defval: '',
    });
    const december = sourceRecords.find(
      (row) =>
        row['来源'] === '历史发货' &&
        row['月份'] === '2025-12' &&
        row['基地'] === '郑州' &&
        row['产品编码'] === 'B',
    );
    if (complete) assert.equal(Number(december['池内大类财年量']), 1300);
    if (scenario === 'other-category-overlap') {
      const conflicted = sourceRecords.find(
        (row) => row['月份'] === '2024-12' && row['产品编码'] === 'T',
      );
      assert.equal(conflicted['池内大类财年量'], '');
      assert.match(conflicted['财年缺失或冲突月份'], /2025-01/);
    }
    if (scenario === 'missing-month') {
      assert.equal(december['池内大类财年量'], '');
      assert.match(december['财年缺失或冲突月份'], /2026-06/);
    }
    await openCategoryCalculation(frame);
    const calculation = frame.getByRole('region', { name: '逐月测算', exact: true });
    const downloading = page.waitForEvent('download');
    await calculation.getByRole('button', { name: '下载测算明细', exact: true }).click();
    const csv = await mpsDownloadText(await (await downloading).path());
    if (process.env.MPS02_EVIDENCE_DIR)
      await writeFile(
        `${process.env.MPS02_EVIDENCE_DIR}/category-calculation-${scenario}.csv`,
        csv,
      );
    assert.doesNotMatch(csv, /9000|8000|999999|粽子|旧分类/);
    const book = XLSX.read(csv, { type: 'string', raw: true });
    const records = XLSX.utils
      .sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' })
      .filter((row) => row['大类'] === '水饺');
    assert.equal(records.length, 4);
    assert.equal(records[0]['系统需求数量'], complete ? '150' : '', csv);
    if (complete) {
      assert.equal(records[0]['历史平均环比'], '200.00%');
      assert.equal(Number(records[0]['① 环比法']), 200);
      assert.equal(Number(records[0]['② 占比法']), 200);
      assert.equal(Number(records[2]['系统需求数量']), 100);
    }
  });
