import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsPage } from './helpers/mps-page.mjs';
import { adjustCategory } from './helpers/mps-edit.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
async function setup(t, extra = {}) {
  const sources = {
    'products.detail': ['A', 'B'].map((code) => ({
      material_code: code,
      material_name: `产品${code}`,
      sub_category: '汤圆',
      series: '系列',
      product_item: '组',
      product_item_name: '组',
      source_rows: 1,
    })),
    'facts.report': ['A', 'B'].map((code, i) => ({
      belong_base: '郑州',
      material_code: code,
      plannum_total: i ? 40 : 60,
      allnum_total: i ? 40 : 60,
    })),
    'products.prices': [
      { material_code: 'A', cif_price: '2.00' },
      { material_code: 'B', cif_price: '3.00' },
    ],
    'facts.report-amounts': [
      { belong_base: '郑州', material_code: 'A', ycplanamount: '120.00', monthamount: '150.00' },
      { belong_base: '郑州', material_code: 'B', ycplanamount: '160.00', monthamount: '150.00' },
    ],
    'facts.history-annual': ['A', 'B'].map((code, i) => ({
      'agents_scm_cust_deliv_daily_di.belong_base': '郑州',
      'agents_scm_cust_deliv_daily_di.material_code': code,
      'agents_scm_cust_deliv_daily_di.material_name': `产品${code}`,
      'agents_scm_cust_deliv_daily_di.product_categ_name': '汤圆',
      'agents_scm_cust_deliv_daily_di.act_dl_qty_total': i ? 40 : 60,
    })),
    ...extra,
  };
  const result = await mpsPage(t, config, ({ queryId, parameters }) => {
    const sourceId =
      Object.keys(config.queries).find(
        (key) => config.queries[key].pagination?.countQuery === queryId,
      ) ?? queryId;
    const rows = (sources[sourceId] ?? []).map((row) => ({
      ...Object.fromEntries((config.queries[queryId].columns ?? []).map((key) => [key, null])),
      ...row,
      ...(sourceId === 'facts.report-amounts' && parameters.month !== '2026-12-01'
        ? { monthamount: parameters.month === '2027-02-01' ? '17.00' : '13.00' }
        : {}),
    }));
    return {
      rows: queryId.endsWith('.count')
        ? [{ total: rows.length }]
        : rows.slice(
            parameters.offset ?? 0,
            (parameters.offset ?? 0) + (parameters.page_size ?? rows.length),
          ),
      returnedColumns: config.queries[queryId].columns,
      configVersion: 'amount-reconciliation',
      ...(queryId === 'facts.history-annual'
        ? {
            totalRowCount: rows.length,
            offset: parameters.offset,
            hasMorePages: false,
            dataStatus: 'ok',
            warnings: [],
          }
        : {}),
    };
  });
  const { frame } = result;
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await dialog.getByLabel('评估月份', { exact: true }).fill('2026-12');
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await expect(frame.getByRole('region', { name: '产品明细', exact: true })).toContainText(
    '2 个产品',
  );
  await frame
    .getByRole('region', { name: '计划提报数据', exact: true })
    .getByRole('button', { name: '同步', exact: true })
    .click();
  await expect(frame.getByRole('region', { name: '计划提报数据', exact: true })).toContainText(
    /最终计划总金额：[0-9]/,
  );
  await expect(
    frame
      .getByRole('region', { name: '计划提报数据', exact: true })
      .getByRole('button', { name: '同步', exact: true }),
  ).toBeEnabled();
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: 'amount.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,郑州,A,产品A,汤圆,系列,组,60,60\n2026-12,郑州,B,产品B,汤圆,系列,组,40,40',
    ),
  });
  await frame.getByRole('button', { name: '读取去年发运占比源值', exact: true }).click();
  await expect(frame.getByText('全年历史读取中…')).toHaveCount(0);
  await adjustCategory(frame, '汤圆', '2026-12', '100', '金额验收');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  return { ...result, amounts: frame.getByRole('region', { name: '需求金额对比', exact: true }) };
}

test('需求金额按SKU有效量计算，调整、筛选和下载使用同一月份及范围', async (t) => {
  const { page, frame, amounts } = await setup(t);
  await expect(amounts).toBeVisible();
  const total = amounts.getByRole('row').filter({ hasText: '全国' }).first();
  await expect(total).toContainText('280.00');
  await expect(total).toContainText('300.00');
  await expect(total).toContainText('240.00');
  await expect(total).toContainText('-60.00');
  await frame.getByLabel('搜索当前步骤').fill('2026-12');
  const searched = amounts.getByRole('row').filter({ hasText: '当前范围' }).first();
  for (const amount of ['280.00', '300.00', '240.00', '-60.00'])
    await expect(searched).toContainText(amount);
  const monthDownload = page.waitForEvent('download');
  await amounts.getByRole('button', { name: '下载金额对比', exact: true }).click();
  const monthBook = XLSX.read(await readFile(await (await monthDownload).path()), {
    type: 'buffer',
  });
  const monthRow = XLSX.utils.sheet_to_json(monthBook.Sheets[monthBook.SheetNames[0]])[0];
  assert.equal(Number(monthRow['月初计划金额']), 280);
  assert.equal(Number(monthRow['最终计划金额']), 300);
  assert.equal(Number(monthRow['生成需求金额']), 240);
  assert.equal(Number(monthRow['差额']), -60);
  await frame.getByLabel('搜索当前步骤').fill('');
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await view.getByRole('button', { name: '调整', exact: true }).click();
  await view.getByLabel('汤圆 2026-12 需求数量', { exact: true }).fill('120');
  await view.getByLabel('批量调整原因', { exact: true }).fill('SKU有效量对账');
  await view.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect.poll(() => view.getByRole('alert').allTextContents()).toEqual([]);
  await expect(total).toContainText('288.00');
  await expect(total).toContainText('-12.00');
  await frame.getByLabel('搜索当前步骤').fill('产品A');
  await expect(amounts.getByRole('row').filter({ hasText: '当前范围' }).first()).toContainText(
    '144.00',
  );
  const pending = page.waitForEvent('download');
  await amounts.getByRole('button', { name: '下载金额对比', exact: true }).click();
  const book = XLSX.read(await readFile(await (await pending).path()), { type: 'buffer' });
  const exported = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
  assert.equal(Number(exported[0]['生成需求金额']), 144);
  assert.equal(Number(exported[0]['最终计划金额']), 150);
  assert.equal(Number(exported[0]['差额']), -6);
  await frame.getByLabel('搜索当前步骤').fill('');
  for (const [month, final] of [
    ['2027-01', '26.00'],
    ['2027-02', '34.00'],
    ['2026-12', '300.00'],
  ]) {
    await frame.getByLabel('月份筛选', { exact: true }).selectOption(month);
    await expect(amounts.getByRole('row').filter({ hasText: '全国合计' }).first()).toContainText(
      final,
    );
    await expect(amounts).toContainText(month);
  }
  if (process.env.MPS_AMOUNT_SCREENSHOTS) {
    for (const width of [1200, 720]) {
      await page.evaluate((width) => {
        document.getElementById('root').style.width = `${width + 520}px`;
      }, width);
      await amounts.screenshot({
        path: `${process.env.MPS_AMOUNT_SCREENSHOTS}/${width}-amounts.png`,
      });
    }
  }
});

test('完整分页金额包含池外及缺基地，缺价显示已知小计，筛选后报告未归属金额并同步下载', async (t) => {
  const source = [
    { belong_base: '郑州', material_code: 'A', ycplanamount: '120.00', monthamount: '150.00' },
    { belong_base: '郑州', material_code: 'B', ycplanamount: '160.00', monthamount: '150.00' },
    { belong_base: null, material_code: 'A', ycplanamount: '10.00', monthamount: '10.00' },
    ...Array.from({ length: 198 }, (_, index) => ({
      belong_base: '郑州',
      material_code: `池外${index}`,
      ycplanamount: '1.00',
      monthamount: '1.00',
    })),
  ];
  const { page, frame, amounts, calls } = await setup(t, {
    'products.prices': [{ material_code: 'A', cif_price: '2.00' }],
    'facts.report-amounts': source,
  });
  const total = amounts.getByRole('row').filter({ hasText: '全国合计' }).first();
  await expect(total).toContainText('488.00');
  await expect(total).toContainText('508.00');
  await expect(total).toContainText('120.00（已知小计）');
  await expect(total).toContainText('缺价1项');
  await expect(total).toContainText('含缺基地源金额');
  await expect(amounts.getByRole('row').filter({ hasText: '未归类' }).last()).toContainText(
    '198.00',
  );
  assert(
    calls.some(
      (call) => call.queryId === 'facts.report-amounts' && call.parameters.page_size === 5000,
    ),
  );
  await frame.getByLabel('基地筛选', { exact: true }).selectOption('郑州');
  await expect(amounts).toContainText('1条源金额无法归属当前筛选范围');
  await expect(amounts).toContainText('分别为10.00、10.00元');
  await frame.getByLabel('大类筛选', { exact: true }).selectOption('汤圆');
  await expect(amounts).toContainText('199条源金额无法归属当前筛选范围');
  await expect(amounts).toContainText('分别为208.00、208.00元');
  const pending = page.waitForEvent('download');
  await amounts.getByRole('button', { name: '下载金额对比', exact: true }).click();
  const book = XLSX.read(await readFile(await (await pending).path()), { type: 'buffer' });
  const exported = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
  assert.equal(Number(exported[0]['生成需求金额']), 120);
  assert.equal(exported[0]['生成金额完整性'], '待补或已知小计');
  assert.equal(exported[0]['差额'], '');
  assert.equal(Number(exported[0]['未归属当前范围源金额条数']), 199);
});

test('版本切换后的迟到金额响应不覆盖新版本，切回旧版本重新读取对应月份', async (t) => {
  let releaseOld;
  const oldRead = new Promise((resolve) => {
    releaseOld = resolve;
  });
  t.after(() => releaseOld());
  let held = false;
  const { frame } = await mpsPage(t, config, async ({ queryId, parameters }) => {
    const monetary = queryId.startsWith('facts.report-amounts');
    if (queryId === 'facts.report-amounts.count' && parameters.month === '2026-11-01' && !held) {
      held = true;
      await oldRead;
    }
    const rows = monetary
      ? [
          {
            belong_base: '郑州',
            material_code: 'A',
            ycplanamount: '1.00',
            monthamount: parameters.month === '2026-12-01' ? '120.00' : '990.00',
          },
        ]
      : [];
    return {
      rows: queryId.endsWith('.count') ? [{ total: rows.length }] : rows,
      returnedColumns: config.queries[queryId].columns,
      configVersion: 'late-amount',
    };
  });
  await expect.poll(() => held).toBe(true);
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await dialog.getByLabel('评估月份', { exact: true }).fill('2026-12');
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  const source = frame.getByRole('region', { name: '计划提报数据', exact: true });
  await expect(source).toContainText('最终计划总金额：120.00元');
  releaseOld();
  await expect(source).not.toContainText('990.00元');
  await frame.getByLabel('评估版本选择', { exact: true }).selectOption('local-1');
  await expect(source).toContainText('最终计划总金额：990.00元');
  await expect(source).not.toContainText('120.00元');
});
