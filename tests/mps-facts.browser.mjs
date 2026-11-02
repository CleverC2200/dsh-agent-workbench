import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { mpsPage } from './helpers/mps-page.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';
const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const plan = '';
const shipment = 'agents_scm_cust_deliv_daily_di.';

test('reported plan details include matched product dimensions and region without a diagnostic column', async (t) => {
  const records = [
    {
      region_name: '直营渠道销售',
      belong_base: '华东',
      material_code: '10000008',
      material_name: '小小汤圆',
      sub_category: '汤圆',
      series: '3.9g汤圆',
      product_item: '102018',
      product_item_name: '小小汤圆组',
      plannum_total: 450,
      allnum_total: 450,
    },
    {
      region_name: null,
      belong_base: '华东',
      material_code: 'UNMATCHED',
      plannum_total: 0,
      allnum_total: 1,
    },
  ];
  const { page, frame } = await mpsPage(t, config, (query) =>
    fixture(query, query.queryId.startsWith('facts.report') ? records : undefined),
  );
  const report = frame.getByRole('region', { name: '计划提报数据', exact: true });
  await expect(report.getByText('业务来源', { exact: true })).toBeVisible();
  await report.getByRole('button', { name: '预览当前明细', exact: true }).click();
  const preview = frame.getByRole('dialog');
  await expect(preview.getByRole('columnheader', { name: '大区', exact: true })).toBeVisible();
  await expect(
    preview.getByRole('columnheader', { name: '物料组名称', exact: true }),
  ).toBeVisible();
  const matched = preview.getByRole('row').filter({ hasText: '10000008' });
  await expect(matched).toContainText('直营渠道销售');
  await expect(matched).toContainText('小小汤圆组');
  await expect(matched).toContainText('3.9g汤圆');
  const missing = preview.getByRole('row').filter({ hasText: 'UNMATCHED' });
  await expect(missing).toContainText('UNMATCHED');
  await expect(preview.getByRole('columnheader', { name: '维度说明', exact: true })).toHaveCount(0);
  const pending = page.waitForEvent('download');
  await preview.getByRole('button', { name: '下载明细', exact: true }).click();
  const csv = await mpsDownloadText(await (await pending).path());
  assert.match(
    csv,
    /月份,大区,基地,产品编码,产品名称,大类,系列,物料组,物料组名称,月初数量,纠偏数量/,
  );
  assert(!csv.includes('维度说明'));
  assert.match(csv, /直营渠道销售,华东,10000008,小小汤圆,汤圆,3.9g汤圆,102018,小小汤圆组/);
});

function fixture({ queryId, parameters }, records) {
  if (!queryId.startsWith('facts.'))
    return {
      rows: queryId.endsWith('.count') ? [{ total: 0 }] : [],
      returnedColumns: config.queries[queryId].columns,
      configVersion: 'v1',
    };
  const report = queryId.startsWith('facts.report');
  const prefix = report ? plan : shipment;
  const supplied = records ?? [
    Object.fromEntries(
      config.queries[report ? 'facts.report' : queryId].columns.map((field) => [
        field,
        field === prefix + 'belong_base'
          ? '基地甲'
          : field === prefix + 'material_code'
            ? '001'
            : field === plan + 'plannum_total'
              ? 10
              : field === plan + 'allnum_total'
                ? 20
                : field === shipment + 'act_dl_qty_total'
                  ? 7
                  : field === shipment + 'act_dl_qty_all_total'
                    ? 9
                    : field === shipment + 'income_excl_tax_local_total'
                      ? null
                      : '源维度',
      ]),
    ),
  ];
  const rows = supplied.map((row) => ({
    ...Object.fromEntries(
      config.queries[report ? 'facts.report' : queryId].columns.map((field) => [field, null]),
    ),
    ...row,
  }));
  return {
    rows: queryId.endsWith('.count')
      ? [{ total: rows.length }]
      : rows.slice(parameters.offset, parameters.offset + parameters.page_size),
    returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
    rejectedColumns: [],
    configVersion: 'v1',
    totalRowCount: rows.length,
    offset: parameters.offset,
    hasMorePages: parameters.offset + parameters.page_size < rows.length,
    dataStatus: report ? 'ok' : 'partial',
    warnings: report ? [] : [{ code: 'METRIC_VALUE_UNAVAILABLE' }],
  };
}
test('confirmed monthly versions and shipment measures populate independently while forecast source reads an empty published collection', async (t) => {
  const { page, frame, calls } = await mpsPage(t, config, fixture);
  const report = frame.getByRole('region', { name: '计划提报数据', exact: true });
  const history = frame.getByRole('region', { name: '历史同期发货', exact: true });
  await expect(report.getByText('业务来源', { exact: true })).toBeVisible();
  await expect(history).toContainText('发货数量：7件；含赠品数量：9件；不含税收入：未提供');
  await report.getByText('口径与统计说明', { exact: true }).click();
  await expect(report).toContainText('数量合计10件');
  await report.getByLabel('提报口径').selectOption('adjust');
  await expect(report).toContainText('数量合计20件');
  await expect(report).not.toContainText('数量合计30件');
  await history.getByRole('button', { name: '预览当前明细', exact: true }).click();
  const preview = frame.getByRole('dialog');
  await expect(preview).toContainText('含赠品数量');
  await expect(preview).toContainText('不含税收入');
  await expect(preview.getByRole('cell', { name: '-', exact: true }).first()).toBeVisible();
  const previewDownload = page.waitForEvent('download');
  await preview.getByRole('button', { name: '下载明细', exact: true }).click();
  const previewCsv = await mpsDownloadText(await (await previewDownload).path());
  assert.match(previewCsv, /数量,含赠品数量,不含税收入/);
  assert.match(previewCsv, /,7,9,\r?\n?$/);
  await preview.getByRole('button', { name: '关闭弹窗' }).click();
  const downloaded = page.waitForEvent('download');
  await history.getByRole('button', { name: '导出当前明细' }).click();
  const csv = await mpsDownloadText(await (await downloaded).path());
  assert.match(csv, /数量,含赠品数量,不含税收入/);
  assert.match(csv, /,7,9,\r?\n?$/);
  assert.equal(previewCsv, csv);
  await report.getByRole('button', { name: '预览当前明细', exact: true }).click();
  const reportDownload = page.waitForEvent('download');
  await frame.getByRole('dialog').getByRole('button', { name: '下载明细', exact: true }).click();
  const reportCsv = await mpsDownloadText(await (await reportDownload).path());
  assert.match(reportCsv, /月初数量,纠偏数量/);
  assert.match(reportCsv, /,10,20\r?\n?$/);
  await frame.getByRole('dialog').getByRole('button', { name: '关闭弹窗' }).click();
  await expect(
    frame
      .getByRole('region', { name: '模型双期预测' })
      .getByRole('button', { name: '同步', exact: true }),
  ).toBeEnabled();
  assert(!calls.some((call) => /stock|inventory/.test(call.queryId)));
});
test('full fact paging keeps zero and missing base distinct, without a failed shipment blocking plans', async (t) => {
  const records = Array.from({ length: 201 }, (_, index) => ({
    [plan + 'cust_code']: 'C' + index,
    [plan + 'belong_base']: index === 200 ? null : '基地甲',
    [plan + 'material_code']: String(index).padStart(5, '0'),
    [plan + 'plannum_total']: index === 200 ? null : 0,
    [plan + 'allnum_total']: index === 200 ? null : 2,
  }));
  const { frame, calls } = await mpsPage(t, config, (query) => {
    if (query.queryId === 'facts.history') throw Error('AGENT_ACCESS_DENIED');
    return fixture(query, query.queryId.startsWith('facts.report') ? records : undefined);
  });
  const report = frame.getByRole('region', { name: '计划提报数据', exact: true });
  await expect(report.getByText('业务来源', { exact: true })).toBeVisible();
  await report.getByText('口径与统计说明', { exact: true }).click();
  await expect(report).toContainText('当前期间201条，数量合计未提供，缺失数量1条');
  await expect(
    frame.getByRole('region', { name: '历史同期发货' }).getByRole('alert'),
  ).toContainText('当前账号暂无数据权限');
  assert.deepEqual(
    calls
      .filter(
        (call) =>
          call.queryId === 'facts.report' &&
          call.parameters.month ===
            calls.find((read) => read.queryId === 'facts.report').parameters.month,
      )
      .map((call) => call.parameters.offset),
    [0, 200],
  );
  await report.getByRole('button', { name: '预览当前明细' }).click();
  await expect(frame.getByRole('dialog').locator('tbody tr').first()).toContainText('0');
});
test('refreshing facts keeps an uploaded annual plan marked as a local file', async (t) => {
  const { frame, calls } = await mpsPage(t, config, fixture);
  const report = frame.getByRole('region', { name: '计划提报数据', exact: true });
  await expect(report.getByText('业务来源', { exact: true })).toBeVisible();
  const annual = frame.getByRole('region', { name: '年度销售计划', exact: true });
  await frame.getByLabel('选择年度计划CSV', { exact: true }).setInputFiles({
    name: '年度计划.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('月份,大类,数量\n2026-10,汤圆,123'),
  });
  await expect(annual.getByText('本地文件', { exact: true })).toBeVisible();
  const before = calls.filter((call) => call.queryId === 'facts.report').length;
  await report.getByRole('button', { name: '同步', exact: true }).click();
  await expect
    .poll(() => calls.filter((call) => call.queryId === 'facts.report').length)
    .toBe(before + 1);
  await expect(report.getByRole('button', { name: '同步', exact: true })).toBeEnabled();
  await expect(annual.getByText('本地文件', { exact: true })).toBeVisible();
  await expect(annual.getByText('业务数据 · 源数量', { exact: true })).toHaveCount(0);
});
test('truncated facts are rejected and a late historical period cannot overwrite the selected year', async (t) => {
  const now = new Date();
  const initialHistoryMonth = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  let historyCalls = 0;
  const { frame } = await mpsPage(t, config, async (query) => {
    if (query.queryId === 'facts.report.count') return { ...fixture(query), rows: [{ total: 2 }] };
    if (
      query.queryId === 'facts.history' &&
      query.parameters.month === initialHistoryMonth &&
      ++historyCalls === 1
    )
      await pending;
    return fixture(query);
  });
  await expect(
    frame.getByRole('region', { name: '计划提报数据' }).getByRole('alert'),
  ).toContainText('分页与计数不一致');
  const history = frame.getByRole('region', { name: '历史同期发货' });
  await expect.poll(() => historyCalls).toBe(1);
  await history.getByLabel('历史同期').selectOption('2');
  await expect(history.getByText('业务来源', { exact: true })).toBeVisible();
  release();
  await expect(history.getByLabel('历史同期')).toHaveValue('2');
  await expect(history).toContainText('发货数量：7件');
  await history.getByRole('button', { name: '预览当前明细' }).click();
  await expect(frame.getByRole('dialog')).toContainText(String(new Date().getFullYear() - 2));
});

test('history failures stay bound to the read period after switching historical years', async (t) => {
  let deniedMonth = '';
  const { frame } = await mpsPage(t, config, (query) => {
    if (query.queryId === 'facts.history' && query.parameters.month === deniedMonth)
      throw Error('AGENT_ACCESS_DENIED');
    return fixture(query);
  });
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-10');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '期间核对.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n基地甲,001,产品甲,汤圆,系列甲,组甲,,',
    ),
  });
  const history = frame.getByRole('region', { name: '历史同期发货', exact: true });
  await expect(history).toContainText('发货数量：7件');
  deniedMonth = '2025-10-01';
  await history.getByRole('button', { name: '同步', exact: true }).click();
  await expect(history.getByRole('alert')).toContainText('暂无数据权限');
  await history.getByLabel('历史同期').selectOption('2');
  await expect(history).toContainText('2024-10');
  await expect(history.getByRole('button', { name: '同步', exact: true })).toBeEnabled();
  await expect(history.getByRole('alert')).toHaveCount(0);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const quantity = frame.getByRole('button', {
    name: '基地甲 001 2026-10 历史发货数量 计算过程',
    exact: true,
  });
  await expect(quantity).toHaveText('—');
  await quantity.click();
  await expect(frame.getByRole('dialog')).toContainText('暂无数据权限');
  await frame.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  deniedMonth = '';
  await history.getByLabel('历史同期').selectOption('1');
  await expect(history).toContainText('2025-10');
  await expect(history.getByRole('button', { name: '同步', exact: true })).toBeEnabled();
  deniedMonth = '2024-10-01';
  await history.getByLabel('历史同期').selectOption('2');
  await expect(history.getByRole('alert')).toContainText('暂无数据权限');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await expect(quantity).toHaveText('7');
});

test('source previews omit missing-count columns while downloads preserve decimals', async (t) => {
  const { page, frame } = await mpsPage(t, config, (query) => {
    const response = fixture(query);
    if (query.queryId === 'facts.report')
      response.rows = [
        {
          ...response.rows[0],
          [plan + 'cust_code']: 'C1',
          [plan + 'belong_base']: '基地甲',
          [plan + 'material_code']: '001',
          [plan + 'plannum_total']: 12.5,
          [plan + 'allnum_total']: 0,
        },
      ];
    if (query.queryId === 'facts.history')
      response.rows = [
        {
          ...response.rows[0],
          [shipment + 'belong_base']: '基地甲',
          [shipment + 'material_code']: '001',
          [shipment + 'act_dl_qty_total']: 7.5,
          [shipment + 'act_dl_qty_all_total']: 0,
          [shipment + 'income_excl_tax_local_total']: 10.5,
        },
      ];
    return response;
  });
  const history = frame.getByRole('region', { name: '历史同期发货', exact: true });
  await expect(history).toContainText('发货数量：8件；含赠品数量：0件；不含税收入：11元');
  for (const [title, expected] of [
    ['计划提报数据', '13'],
    ['历史同期发货', '8'],
  ]) {
    const section = frame.getByRole('region', { name: title, exact: true });
    await section.getByRole('button', { name: '基地 1', exact: true }).click();
    const dialog = frame.getByRole('dialog');
    await expect(dialog.locator('th')).toHaveText(['名称', '数量合计']);
    await expect(dialog.locator('tbody tr').first().locator('td').nth(1)).toHaveText(expected);
    await expect(dialog).not.toContainText('公式');
    await expect(dialog).not.toContainText('代入');
    await dialog.getByRole('button', { name: '关闭弹窗' }).click();
    await section.getByText('口径与统计说明', { exact: true }).click();
    await expect(section.getByRole('button', { name: '下载CSV模板' })).toHaveCount(0);
    await expect(section).not.toContainText('公式：');
    const download = page.waitForEvent('download');
    await section.getByRole('button', { name: '导出当前明细' }).click();
    const csv = await mpsDownloadText(await (await download).path());
    assert(csv.includes(title === '计划提报数据' ? '12.5' : '7.5,0,10.5'));
  }
});

test('processing fetches every SKU month through governed paging and keeps the first-step period separate', async (t) => {
  const { page, frame, calls } = await mpsPage(t, config, (query) => {
    if (!query.queryId.startsWith('facts.')) return fixture(query);
    const report = query.queryId.startsWith('facts.report');
    const month = Number(query.parameters.month.slice(5, 7));
    return fixture(
      query,
      Array.from({ length: 201 }, (_, index) => ({
        [(report ? '' : shipment) + 'belong_base']: '基地甲',
        [(report ? '' : shipment) + 'material_code']: index === 0 ? '001' : 'other-' + index,
        ...(report
          ? { plannum_total: month === 11 ? 37.5 : 10, allnum_total: month === 11 ? 42.5 : 20 }
          : { [shipment + 'act_dl_qty_total']: month === 11 ? 12.25 : 7 }),
      })),
    );
  });
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-10');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '期间核对.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n基地甲,001,产品甲,汤圆,系列甲,组甲,,',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await expect(
    frame.getByRole('button', {
      name: '基地甲 001 2026-11 提报数量 计算过程',
      exact: true,
    }),
  ).toHaveText('38');
  await expect(
    frame.getByRole('button', {
      name: '基地甲 001 2026-11 历史发货数量 计算过程',
      exact: true,
    }),
  ).toHaveText('12');
  await expect(
    frame.getByRole('button', {
      name: '基地甲 001 2026-12 历史发货数量 计算过程',
      exact: true,
    }),
  ).toHaveText('7');
  for (const [source, year] of [
    ['report', '2026'],
    ['history', '2025'],
  ]) {
    for (const month of ['10', '11', '12']) {
      const reads = calls.filter(
        (call) =>
          call.queryId === 'facts.' + source && call.parameters.month === `${year}-${month}-01`,
      );
      assert(reads.some((call) => call.parameters.offset === 0));
      assert(reads.some((call) => call.parameters.offset === 200));
      assert(reads.every((call) => call.parameters.page_size === 200));
      if (month !== '10')
        assert.deepEqual(
          reads.map((call) => call.parameters.offset),
          [0, 200],
        );
    }
  }
  const pending = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载需求拆分', exact: true }).click();
  const csv = await mpsDownloadText(await (await pending).path());
  const [header, ...rows] = csv
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(','));
  const november = rows.find(
    (row) => row[header.indexOf('月份')] === '2026-11' && row[header.indexOf('产品编码')] === '001',
  );
  assert(november, csv);
  assert(november.includes('37.5'), csv);
  assert(november.includes('12.25'), csv);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  const report = frame.getByRole('region', { name: '计划提报数据', exact: true });
  await report.getByText('口径与统计说明', { exact: true }).click();
  await expect(report).toContainText('当前期间201条');
  await expect(report).not.toContainText('当前期间603条');
});

test('a downstream history denial stays on its own month while other complete periods retain real quantities', async (t) => {
  const { frame, calls } = await mpsPage(t, config, (query) => {
    if (query.queryId === 'facts.history' && query.parameters.month === '2025-11-01')
      throw Error('AGENT_ACCESS_DENIED');
    if (query.queryId.startsWith('facts.report') && query.parameters.month === '2026-12-01')
      return fixture(query, []);
    return fixture(query);
  });
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-10');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '期间核对.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n基地甲,001,产品甲,汤圆,系列甲,组甲,,',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const value = (month, column) =>
    frame.getByRole('button', {
      name: `基地甲 001 ${month} ${column} 计算过程`,
      exact: true,
    });
  await expect(value('2026-12', '历史发货数量')).toHaveText('7');
  await expect(value('2026-10', '提报数量')).toHaveText('10');
  await expect(value('2026-10', '历史发货数量')).toHaveText('7');
  await expect(value('2026-11', '提报数量')).toHaveText('10');
  await expect(value('2026-11', '历史发货数量')).toHaveText('—');
  await expect(value('2026-12', '提报数量')).toHaveText('—');
  await value('2026-11', '历史发货数量').click();
  await expect(frame.getByRole('dialog')).toContainText('暂无数据权限');
  assert(
    calls.some(
      (call) => call.queryId === 'facts.report.count' && call.parameters.month === '2026-12-01',
    ),
  );
});

test('period source diagnostics expose complete totals, current-basis coverage and unmatched evidence in the document and exports', async (t) => {
  const { page, frame } = await mpsPage(t, config, (query) => {
    if (!query.queryId.startsWith('facts.')) return fixture(query);
    const report = query.queryId.startsWith('facts.report');
    const records = report
      ? [
          {
            belong_base: '基地甲',
            material_code: '001',
            material_name: '产品甲',
            region_name: '大区甲',
            plannum_total: 0,
            allnum_total: null,
          },
          { belong_base: '基地甲', material_code: '002', plannum_total: null, allnum_total: 8 },
          { belong_base: null, material_code: '001', plannum_total: 5, allnum_total: 5 },
          { belong_base: '基地乙', material_code: 'OUTSIDE', plannum_total: 9, allnum_total: 9 },
        ]
      : [
          {
            [shipment + 'belong_base']: '基地甲',
            [shipment + 'material_code']: '001',
            [shipment + 'act_dl_qty_total']: 7,
          },
        ];
    const response = fixture(
      query,
      query.parameters.month.endsWith('-12-01') && report ? [] : records,
    );
    response.dataStatus = 'ok';
    response.warnings = [];
    return response;
  });
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-10');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '覆盖核对.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n基地甲,001,产品甲,汤圆,系列甲,组甲,,\n基地甲,002,产品乙,汤圆,系列甲,组甲,,\n,003,产品丙,汤圆,系列甲,组甲,,',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const diagnostics = frame.getByRole('region', { name: '逐期来源诊断', exact: true });
  const row = (source, month) =>
    diagnostics.getByRole('row').filter({ hasText: source }).filter({ hasText: month });
  await expect(diagnostics.getByRole('row')).toHaveCount(7);
  await expect(row('计划提报', '2026-10')).toContainText('成功有记录');
  await expect(row('计划提报', '2026-10').getByRole('cell')).toHaveText([
    '计划提报',
    '2026-10',
    '成功有记录',
    '4',
    '2',
    '1/3',
    '1',
    '1',
    '1',
    '—',
    '明细',
  ]);
  await expect(row('计划提报', '2026-12')).toContainText('成功空集');
  await expect(row('历史发货', '2025-11').getByRole('cell')).toHaveText([
    '历史发货',
    '2025-11',
    '成功有记录',
    '1',
    '1',
    '1/3',
    '0',
    '0',
    '0',
    '—',
    '明细',
  ]);
  const summary = page.waitForEvent('download');
  await diagnostics.getByRole('button', { name: '导出来源诊断', exact: true }).click();
  const csv = await mpsDownloadText(await (await summary).path());
  assert.match(csv, /计划提报,2026-12,成功空集,0,0,0\/3,0,0,0/);
  await row('计划提报', '2026-10').getByRole('button', { name: '明细', exact: true }).click();
  const dialog = frame.getByRole('dialog');
  await expect(dialog).toContainText('OUTSIDE');
  await expect(dialog.getByRole('columnheader', { name: '产品池匹配', exact: true })).toBeVisible();
  const detail = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载明细', exact: true }).click();
  const detailCsv = await mpsDownloadText(await (await detail).path());
  assert.match(detailCsv, /产品池匹配/);
  assert.match(detailCsv, /OUTSIDE/);
  assert.match(detailCsv, /缺业务键/);
  assert.match(detailCsv, /池外/);
  await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  await frame.getByLabel('提报口径', { exact: true }).selectOption('adjust');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await row('计划提报', '2026-10').getByRole('button', { name: '明细', exact: true }).click();
  await expect(frame.getByRole('dialog')).toContainText('纠偏数量');
  await expect(
    frame.getByRole('dialog').getByRole('row').filter({ hasText: '产品甲' }),
  ).toContainText('缺数量');
});

test('period source diagnostics keep loading, failed and partial months distinct from a complete empty result', async (t) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  t.after(() => release());
  const { page, frame } = await mpsPage(t, config, async (query) => {
    if (query.queryId === 'facts.report' && query.parameters.month === '2026-11-01') await pending;
    if (query.queryId === 'facts.history' && query.parameters.month === '2025-11-01')
      throw Error('AGENT_ACCESS_DENIED');
    if (query.queryId === 'facts.history' && query.parameters.month === '2025-12-01')
      return fixture(query, []);
    if (query.queryId.startsWith('facts.report') && query.parameters.month === '2026-12-01')
      return fixture(query, []);
    return fixture(query);
  });
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-10');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const diagnostics = frame.getByRole('region', { name: '逐期来源诊断', exact: true });
  const row = (source, month) =>
    diagnostics.getByRole('row').filter({ hasText: source }).filter({ hasText: month });
  await expect(row('计划提报', '2026-11')).toContainText('读取中');
  await expect(row('计划提报', '2026-11').getByRole('cell').nth(3)).toHaveText('—');
  await expect(row('历史发货', '2025-11')).toContainText('失败');
  await expect(row('历史发货', '2025-11')).toContainText('暂无数据权限');
  await expect(row('历史发货', '2025-11').getByRole('cell').nth(3)).toHaveText('—');
  await expect(row('历史发货', '2025-12')).toContainText('读取不完整');
  await expect(row('历史发货', '2025-12').getByRole('cell').nth(3)).toHaveText('—');
  await expect(row('历史发货', '2025-12').getByRole('cell').nth(2)).not.toHaveText('成功空集');
  release();
  await expect(row('计划提报', '2026-12')).toContainText('成功空集');
  await expect(row('计划提报', '2026-12').getByRole('cell').nth(3)).toHaveText('0');
  await expect(row('计划提报', '2026-11').getByRole('cell').nth(3)).toHaveText('1');
  await expect(row('历史发货', '2025-11')).toContainText('失败');
  const summary = page.waitForEvent('download');
  await diagnostics.getByRole('button', { name: '导出来源诊断', exact: true }).click();
  const csv = await mpsDownloadText(await (await summary).path());
  assert.match(csv, /历史发货,2025-11,失败,,,,,,,.*暂无数据权限/);
  assert.match(csv, /历史发货,2025-12,读取不完整,,0,,0,0,0/);
});

test('a document without configured sources shows six unread periods without inventing empty successes', async (t) => {
  const { frame } = await mpsPage(t, null, () => {
    throw Error('UNEXPECTED_SOURCE_READ');
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const diagnostics = frame.getByRole('region', { name: '逐期来源诊断', exact: true });
  await expect(diagnostics.getByRole('row')).toHaveCount(7);
  await expect(diagnostics.getByRole('cell', { name: '未读取', exact: true })).toHaveCount(6);
  for (const row of await diagnostics
    .getByRole('row')
    .all()
    .then((rows) => rows.slice(1))) {
    await expect(row.getByRole('cell').nth(3)).toHaveText('—');
  }
});

test('history diagnostics retain complete quantity coverage when only income is unavailable and export the source warning', async (t) => {
  const { page, frame } = await mpsPage(t, config, (query) => {
    if (!query.queryId.startsWith('facts.history')) return fixture(query);
    const response = fixture(query, [
      {
        [shipment + 'belong_base']: '基地甲',
        [shipment + 'material_code']: '001',
        [shipment + 'act_dl_qty_total']: 0,
      },
      {
        [shipment + 'belong_base']: '基地甲',
        [shipment + 'material_code']: '002',
        [shipment + 'act_dl_qty_total']: 7,
      },
      {
        [shipment + 'belong_base']: '基地甲',
        [shipment + 'material_code']: '003',
        [shipment + 'act_dl_qty_total']: null,
      },
    ]);
    response.warnings = [
      ...Array.from({ length: 13 }, () => ({
        code: 'METRIC_VALUE_UNAVAILABLE',
        message: '不含税收入未提供',
      })),
      { code: 'SOURCE_WARNING', message: '来源字段缺项保留' },
    ];
    return response;
  });
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-10');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '收入缺项核对.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n基地甲,001,产品甲,汤圆,系列甲,组甲,,\n基地甲,002,产品乙,汤圆,系列甲,组甲,,\n基地甲,003,产品丙,汤圆,系列甲,组甲,,',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const diagnostics = frame.getByRole('region', { name: '逐期来源诊断', exact: true });
  const october = diagnostics
    .getByRole('row')
    .filter({ hasText: '历史发货' })
    .filter({ hasText: '2025-10' });
  await expect(october.getByRole('cell').nth(3)).toHaveText('3');
  await expect(october.getByRole('cell').nth(5)).toHaveText('2/3');
  await expect(october.getByRole('cell').nth(6)).toHaveText('1');
  await expect(october).toContainText('部分字段不可用');
  await expect(october).toContainText('不含税收入未提供');
  const reason = await october.getByRole('cell').nth(9).innerText();
  assert.equal([...reason.matchAll(/不含税收入未提供/g)].length, 1);
  assert.equal([...reason.matchAll(/来源字段缺项保留/g)].length, 1);
  await expect(october).not.toContainText('读取不完整');
  await expect(october).not.toContainText('成功空集');
  const download = page.waitForEvent('download');
  await diagnostics.getByRole('button', { name: '导出来源诊断', exact: true }).click();
  const csv = await mpsDownloadText(await (await download).path());
  assert.match(csv, /历史发货,2025-10,成功有记录,3,3,2\/3,1,0,0/);
  assert.match(csv, /METRIC_VALUE_UNAVAILABLE/);
  assert.match(csv, /不含税收入未提供/);
  const exportedOctober = csv.split(/\r?\n/).find((row) => row.startsWith('历史发货,2025-10,'));
  assert.equal([...exportedOctober.matchAll(/不含税收入未提供/g)].length, 1);
  assert.equal([...exportedOctober.matchAll(/来源字段缺项保留/g)].length, 1);
});
