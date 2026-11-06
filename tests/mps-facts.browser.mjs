import { expectWorkflowExportValue } from './helpers/mps-workflow-export.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { mpsPage } from './helpers/mps-page.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';
const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const plan = '';
const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
const previousYearMonth = String(Number(currentMonth.slice(0, 4)) - 1) + currentMonth.slice(4);
const shipment = 'agents_scm_cust_deliv_daily_di.';

const rate = (month, code, amount, extra = {}) => ({
  dimension_type: '基地+产品',
  stat_month: month.replace('-', ''),
  belong_base: '基地甲',
  material_code: code,
  dimension_allnum: amount,
  ...extra,
});
async function assessment(frame, month = '2026-10', codes = ['001']) {
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill(month);
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '期间核对.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n' +
        codes.map((code) => '基地甲,' + code + ',产品' + code + ',汤圆,系列甲,组甲,,').join('\n'),
    ),
  });
}

test('reported plan details use current product mapping and retain source dimensions for audit', async (t) => {
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
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '产品映射.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,物料组名称,老品编码,老品名称\n华东,10000008,小小汤圆,汤圆,3.9g汤圆,102018,小小汤圆组,,',
    ),
  });
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
  if (queryId.startsWith('plan-rate.')) {
    const supplied =
      records ??
      parameters.months.flatMap((month) =>
        ['001', '002'].map((code) => ({
          dimension_type: '基地+产品',
          stat_month: month,
          belong_base: '基地甲',
          category_name: null,
          material_group_name: null,
          material_code: code,
          product_name: '产品' + code,
          dimension_allnum: 10,
          parent_allnum: 20,
          dimension_rate: '0.5',
        })),
      );
    const rows = supplied.map((row) => ({
      ...Object.fromEntries(config.queries['plan-rate.detail'].columns.map((key) => [key, null])),
      ...row,
    }));
    return {
      rows: queryId.endsWith('.count')
        ? [{ total: rows.length }]
        : rows.slice(parameters.offset, parameters.offset + parameters.page_size),
      returnedColumns: config.queries[queryId].columns,
      configVersion: 'v1',
    };
  }
  if (queryId.startsWith('facts.plan-quantity'))
    return {
      rows: queryId.endsWith('.count') ? [{ total: 0 }] : [],
      returnedColumns: config.queries[queryId].columns,
      configVersion: 'v1',
    };
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
  assert.match(previewCsv, /,7,9,/);
  await preview.getByRole('button', { name: '关闭弹窗' }).click();
  const downloaded = page.waitForEvent('download');
  await history.getByRole('button', { name: '导出当前明细' }).click();
  const csv = await mpsDownloadText(await (await downloaded).path());
  assert.match(csv, /数量,含赠品数量,不含税收入/);
  assert.match(csv, /,7,9,/);
  assert.equal(previewCsv, csv);
  await report.getByRole('button', { name: '预览当前明细', exact: true }).click();
  const reportDownload = page.waitForEvent('download');
  await frame.getByRole('dialog').getByRole('button', { name: '下载明细', exact: true }).click();
  const reportCsv = await mpsDownloadText(await (await reportDownload).path());
  assert.match(reportCsv, /月初数量,纠偏数量/);
  assert.match(reportCsv, /,10,20,/);
  await frame.getByRole('dialog').getByRole('button', { name: '关闭弹窗' }).click();
  await expect(
    frame
      .getByRole('region', { name: '模型双期预测' })
      .getByRole('button', { name: '同步', exact: true }),
  ).toBeEnabled();
  assert(calls.some((call) => call.queryId === 'inventory-targets.count'));
  assert(
    calls
      .filter((call) => /stock|inventory/.test(call.queryId))
      .every((call) =>
        ['inventory-targets.detail', 'inventory-targets.count'].includes(call.queryId),
      ),
  );
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
      .filter((call) => call.queryId === 'facts.report' && call.parameters.month === currentMonth)

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
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  let historyCalls = 0;
  const { frame } = await mpsPage(t, config, async (query) => {
    if (query.queryId === 'facts.report.count') return { ...fixture(query), rows: [{ total: 2 }] };
    if (
      query.queryId === 'facts.history' &&
      query.parameters.month === previousYearMonth &&
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

test('monthly shipment denial does not replace the independently read previous fiscal year', async (t) => {
  let deniedMonth = '';
  const { frame, calls } = await mpsPage(t, config, (query) => {
    if (query.queryId === 'facts.history' && query.parameters.month === deniedMonth)
      throw Error('AGENT_ACCESS_DENIED');
    return fixture(query);
  });
  await assessment(frame);
  const history = frame.getByRole('region', { name: '历史同期发货', exact: true });
  await expect(history).toContainText('发货数量：7件');
  deniedMonth = '2025-10-01';
  await history.getByRole('button', { name: '同步', exact: true }).click();
  await expect(history.getByRole('alert')).toContainText('暂无数据权限');
  await expect(frame.getByRole('region', { name: '系统派生口径参数' })).toContainText(
    '1 / 1 条可计算',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  await expectWorkflowExportValue(frame, '基地甲 001 2026-10 上一财年发货数量 计算过程', '7');
  assert(
    calls.some(
      (call) =>
        call.queryId === 'facts.history-annual' &&
        call.parameters.start === '2025-07-01' &&
        call.parameters.end === '2026-06-30',
    ),
  );
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

test('processing uses fully paged sales-plan rates and one complete fiscal year for every target month', async (t) => {
  const { page, frame, calls } = await mpsPage(t, config, (query) => {
    if (query.queryId.startsWith('plan-rate.'))
      return fixture(
        query,
        query.parameters.months.flatMap((month) =>
          Array.from({ length: 201 }, (_, i) =>
            rate(month, i ? 'outside-' + i : '001', month.endsWith('10') ? 37.5 : 10),
          ),
        ),
      );
    if (query.queryId === 'facts.history-annual')
      return fixture(
        query,
        Array.from({ length: 201 }, (_, i) => ({
          [shipment + 'belong_base']: '基地甲',
          [shipment + 'material_code']: i ? 'outside-' + i : '001',
          [shipment + 'act_dl_qty_total']: 12.25,
        })),
      );
    return fixture(query);
  });
  await assessment(frame);
  await expect(frame.getByRole('region', { name: '系统派生口径参数' })).toContainText(
    '1 / 1 条可计算',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  await expectWorkflowExportValue(frame, '基地甲 001 2026-11 提报数量 计算过程', '38');
  for (const month of ['2026-10', '2026-11', '2026-12'])
    await expectWorkflowExportValue(
      frame,
      '基地甲 001 ' + month + ' 上一财年发货数量 计算过程',
      '12',
    );
  for (const queryId of ['plan-rate.detail', 'facts.history-annual']) {
    const reads = calls.filter((call) => call.queryId === queryId);
    assert(reads.some((call) => call.parameters.offset === 0));
    assert(reads.some((call) => call.parameters.offset === 200));
    assert(reads.every((call) => call.parameters.page_size === 200));
  }
  const pending = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载需求拆分', exact: true }).click();
  const csv = await mpsDownloadText(await (await pending).path());
  assert(csv.includes('37.5'));
  assert(csv.includes('12.25'));
});

test('an annual-source denial is visible for its complete fiscal scope while sales-plan quantities remain available', async (t) => {
  const { frame } = await mpsPage(t, config, (query) => {
    if (query.queryId === 'facts.history-annual') throw Error('AGENT_ACCESS_DENIED');
    return fixture(query);
  });
  await assessment(frame);
  await expect(frame.getByRole('region', { name: '销售提报占比', exact: true })).toContainText(
    '2 条源记录',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  for (const month of ['2026-10', '2026-11', '2026-12']) {
    await expectWorkflowExportValue(frame, '基地甲 001 ' + month + ' 提报数量 计算过程', '10');
    await expectWorkflowExportValue(
      frame,
      '基地甲 001 ' + month + ' 上一财年发货数量 计算过程',
      '—',
    );
  }
  const diagnostics = frame.getByRole('region', { name: '逐期来源诊断', exact: true });
  await expect(
    diagnostics.getByRole('row').filter({ hasText: '上一财年发货' }).filter({ hasText: '2026-11' }),
  ).toContainText('暂无数据权限');
});

test('source diagnostics use current plan-rate rows and full-year history for coverage and exports', async (t) => {
  const { page, frame } = await mpsPage(t, config, (query) => {
    if (query.queryId.startsWith('plan-rate.'))
      return fixture(
        query,
        query.parameters.months.flatMap((month) =>
          month.endsWith('12')
            ? []
            : [
                rate(month, '001', 0),
                rate(month, '002', null),
                rate(month, '001', 5, { belong_base: null }),
                rate(month, 'OUTSIDE', 9),
              ],
        ),
      );
    const result = fixture(query);
    if (query.queryId === 'facts.history-annual') {
      result.dataStatus = 'ok';
      result.warnings = [];
    }
    return result;
  });
  await assessment(frame, '2026-10', ['001', '002']);
  await expect(frame.getByRole('region', { name: '销售提报占比', exact: true })).toContainText(
    '4 条源记录',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  const diagnostics = frame.getByRole('region', { name: '逐期来源诊断', exact: true });
  const row = (source, month) =>
    diagnostics
      .getByRole('row')
      .filter({ hasText: source })
      .filter({ has: frame.getByRole('cell', { name: new RegExp('^' + month) }) });
  await expect(row('销售提报占比', '2026-10').getByRole('cell')).toHaveText([
    '销售提报占比',
    '2026-10',
    '成功有记录',
    '4',
    '2',
    '1/2',
    '1',
    '1',
    '1',
    '—',
    '明细',
  ]);
  await expect(row('销售提报占比', '2026-12')).toContainText('成功空集');
  await expect(row('上一财年发货', '2026-11')).toContainText('2025-07-01至2026-06-30');
  const download = page.waitForEvent('download');
  await diagnostics.getByRole('button', { name: '导出来源诊断', exact: true }).click();
  const csv = await mpsDownloadText(await (await download).path());
  assert.match(csv, /销售提报占比,2026-12,成功空集,0,0,0\/2,0,0,0/);
  await row('销售提报占比', '2026-10').getByRole('button', { name: '明细', exact: true }).click();
  const dialog = frame.getByRole('dialog');
  await expect(dialog).toContainText('OUTSIDE');
  await expect(dialog).toContainText('缺业务键');
  await expect(dialog).toContainText('当前维度计划量');
});

test('source detail joins product classifications and shows matched rows before missing-base records without inventing a base', async (t) => {
  const { page, frame } = await mpsPage(t, config, (query) =>
    fixture(
      query,
      query.queryId.startsWith('plan-rate.')
        ? query.parameters.months.flatMap((month) => [
            rate(month, '001', 0, { belong_base: null }),
            rate(month, '001', 42),
          ])
        : undefined,
    ),
  );
  await assessment(frame);
  await expect(frame.getByRole('region', { name: '销售提报占比', exact: true })).toContainText(
    '2 条源记录',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  await frame
    .getByRole('region', { name: '逐期来源诊断', exact: true })
    .getByRole('row')
    .filter({ hasText: '销售提报占比' })
    .filter({ hasText: '2026-10' })
    .getByRole('button', { name: '明细', exact: true })
    .click();
  const dialog = frame.getByRole('dialog');
  const rows = dialog.getByRole('table', { name: '来源明细', exact: true }).getByRole('row');
  await expect(rows.nth(1)).toContainText('基地甲');
  for (const value of ['产品001', '汤圆', '系列甲', '组甲', '42'])
    await expect(rows.nth(1)).toContainText(value);
  await expect(rows.nth(2)).toContainText('源数据缺基地');
  await expect(rows.nth(2)).toContainText('缺业务键');
  await expect(rows.nth(2)).not.toContainText('基地甲');
  await expect(dialog.getByRole('columnheader', { name: '大区', exact: true })).toHaveCount(0);
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载明细', exact: true }).click();
  const csv = await mpsDownloadText(await (await pending).path());
  assert.match(csv, /产品001,汤圆,系列甲,组甲/);
  assert.match(csv, /缺基地/);
});

test('batched plan loading and separate fiscal-year failure or partial emptiness remain distinct', async (t) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  t.after(() => release());
  const { frame, contexts } = await mpsPage(t, config, async (query) => {
    if (query.queryId === 'plan-rate.detail') await pending;
    if (query.queryId === 'facts.history-annual') {
      if (query.parameters.start === '2025-07-01') throw Error('AGENT_ACCESS_DENIED');
      return fixture(query, []);
    }
    return fixture(query);
  });
  await assessment(frame, '2027-06');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  const diagnostics = frame.getByRole('region', { name: '逐期来源诊断', exact: true });
  const row = (source, month) =>
    diagnostics
      .getByRole('row')
      .filter({ hasText: source })
      .filter({ has: frame.getByRole('cell', { name: new RegExp('^' + month) }) });
  await expect(row('销售提报占比', '2027-07')).toContainText('读取中');
  await expect(row('上一财年发货', '2027-06')).toContainText('暂无数据权限');
  await expect(row('上一财年发货', '2027-07')).toContainText('未读取');
  await expect(row('上一财年发货', '2027-07').getByRole('cell').nth(3)).toHaveText('—');
  await expect
    .poll(() => Object.keys(contexts.at(-1)?.parts ?? {}).sort())
    .toEqual(['navigation', 'process']);
  release();
  await expect(row('销售提报占比', '2027-07')).toContainText('成功空集');
});

test('a document without configured sources shows six unread periods without inventing empty successes', async (t) => {
  const { frame } = await mpsPage(t, null, () => {
    throw Error('UNEXPECTED_SOURCE_READ');
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
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
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  const diagnostics = frame.getByRole('region', { name: '逐期来源诊断', exact: true });
  const october = diagnostics
    .getByRole('row')
    .filter({ hasText: '上一财年发货' })
    .filter({ hasText: '2026-10' });
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
  assert.match(csv, /上一财年发货,2026-10.*成功有记录,3,3,2\/3,1,0,0/);
  assert.match(csv, /METRIC_VALUE_UNAVAILABLE/);
  assert.match(csv, /不含税收入未提供/);
  const exportedOctober = csv.split(/\r?\n/).find((row) => row.startsWith('上一财年发货,2026-10'));
  assert.equal([...exportedOctober.matchAll(/不含税收入未提供/g)].length, 1);
  assert.equal([...exportedOctober.matchAll(/来源字段缺项保留/g)].length, 1);
});
