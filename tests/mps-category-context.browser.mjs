import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { assertPageRequestSize } from '../src/order-report-request-limit.ts';
import { mpsPage } from './helpers/mps-page.mjs';
import { openCategoryCalculation } from './helpers/mps-edit.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));

test('category context bounds source issues while the page and CSV retain all reasons', async (t) => {
  const count = 12000;
  const { page, frame, contexts } = await mpsPage(t, config, ({ queryId, parameters }) => {
    const total =
      queryId.startsWith('category-history.') && parameters.months.includes('202505') ? count : 0;
    const offset = parameters.offset ?? 0;
    const rows = Array.from(
      {
        length: queryId.endsWith('.count')
          ? 0
          : Math.min(parameters.page_size ?? total, total - offset),
      },
      (_, index) => ({
        ...Object.fromEntries(config.queries[queryId].columns.map((column) => [column, null])),
        dimension_type: '基地+大类',
        stat_month: '202505',
        belong_base: '全国',
        dimension_value: `源汇总${String(offset + index).padStart(5, '0')}`,
        dimension_act_dl_qty: 100,
        national_dimension_fiscal_act_dl_qty: 1200,
        fiscal_year: '2026',
        source_rows: 1,
      }),
    );
    return {
      rows: queryId.endsWith('.count') ? [{ total }] : rows,
      returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
      configVersion: 'category-context-source',
      totalRowCount: total,
      offset,
      hasMorePages: !queryId.endsWith('.count') && offset + rows.length < total,
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
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,甲产品,水饺,系列,组,,',
    ),
  });
  const contextStart = contexts.length;
  await frame.getByRole('button', { name: '读取三年同比源值', exact: true }).click();
  await expect(frame.getByRole('button', { name: '读取三年同比源值', exact: true })).toBeEnabled({
    timeout: 15000,
  });
  await expect
    .poll(() =>
      contexts.slice(contextStart).some((context) => {
        const issues = context.parts?.['category-demand']?.readIssues;
        return (issues?.historicalTotal ?? issues?.historical.length) === count;
      }),
    )
    .toBe(true);
  const published = contexts.slice(contextStart).findLast((context) => {
    const issues = context.parts?.['category-demand']?.readIssues;
    return (issues?.historicalTotal ?? issues?.historical.length) === count;
  });
  assert.doesNotThrow(() =>
    assertPageRequestSize({ operation: 'context', parameters: published }, () => {
      throw Error('context has no workspace size exception');
    }),
  );
  const category = published.parts['category-demand'];
  assert.ok(JSON.stringify(category).length < 60000);
  assert.equal(category.readIssues.historicalTotal, count);
  assert.equal(category.readIssues.historical.length, 10);
  assert.match(
    category.readIssues.historical[0],
    /历史发货 2025-05 源汇总00000 缺可追溯的基地SKU明细/,
  );
  assert.equal(category.month, '2026-12');
  assert.equal(category.rows[0].systemQuantity, null);
  assert.match(category.preview, /上下文.*预览.*完整.*页面.*CSV/);
  const matrix = frame.getByRole('region', { name: '大类预估需求数量', exact: true });
  await expect(
    matrix.getByRole('row').filter({ hasText: '水饺' }).locator('.dc-demand-amount'),
  ).toHaveText(['待补', '待补', '待补', '待补']);
  const sourceDownload = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载大类池内源明细', exact: true }).click();
  const sourceCsv = await mpsDownloadText(await (await sourceDownload).path());
  const book = XLSX.read(sourceCsv, { type: 'string', raw: true });
  const records = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
  assert.equal(records.length, count);
  assert.equal(records[0]['原始来源数量'], '100');
  assert.match(records.at(-1)['缺项原因'], /源汇总11999.*缺可追溯的基地SKU明细/);
  await openCategoryCalculation(frame);
  const calculation = frame.getByRole('region', { name: '逐月测算', exact: true });
  const pageReasons = await matrix.locator('.dc-demand-amount').first().getAttribute('title');
  assert.match(pageReasons, /源汇总11999/);
  assert.ok(pageReasons.length > 32767);
  const downloading = page.waitForEvent('download', { timeout: 10000 });
  await calculation.getByRole('button', { name: '下载测算明细', exact: true }).click();
  const file = await downloading;
  assert.equal(file.suggestedFilename(), '大类逐月测算-2026-12.csv');
  const csv = await mpsDownloadText(await file.path());
  assert.match(csv, /源汇总00000/);
  assert.match(csv, /源汇总11999/);
  const calculationBook = XLSX.read(csv, { type: 'string', raw: true });
  const calculationRows = XLSX.utils.sheet_to_json(
    calculationBook.Sheets[calculationBook.SheetNames[0]],
    { defval: '' },
  );
  assert.equal(calculationRows.length, 4);
  assert.equal(calculationRows[0]['缺项说明'], pageReasons);
  assert.ok(pageReasons.includes(records.map((row) => row['缺项原因']).join('；')));
  const sourceAgain = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载大类池内源明细', exact: true }).click();
  assert.equal(await mpsDownloadText(await (await sourceAgain).path()), sourceCsv);
  t.diagnostic(
    JSON.stringify({
      requestCharacters: JSON.stringify({ operation: 'context', parameters: published }).length,
      categoryCharacters: JSON.stringify(category).length,
      issueTotal: category.readIssues.historicalTotal,
      sourceRows: records.length,
      completeReasonCharacters: pageReasons.length,
      download: file.suggestedFilename(),
    }),
  );
});
