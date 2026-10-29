import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { mpsPage } from './helpers/mps-page.mjs';
const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const plan = 'agents_sales_plan_demand_m.';
const shipment = 'agents_scm_cust_deliv_daily_di.';
function fixture({ queryId, parameters }, records) {
  if (!queryId.startsWith('facts.'))
    return {
      rows: queryId.endsWith('.count') ? [{ total: 0 }] : [],
      returnedColumns: config.queries[queryId].columns,
      configVersion: 'v1',
    };
  const report = queryId === 'facts.report';
  const prefix = report ? plan : shipment;
  const rows = records ?? [
    Object.fromEntries(
      config.queries[queryId].columns.map((field) => [
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
  return {
    rows: rows.slice(parameters.offset, parameters.offset + parameters.page_size),
    returnedColumns: config.queries[queryId].columns,
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
  const previewCsv = await readFile(await (await previewDownload).path(), 'utf8');
  assert.match(previewCsv, /数量,含赠品数量,不含税收入/);
  assert.match(previewCsv, /,7,9,\r?\n?$/);
  await preview.getByRole('button', { name: '关闭弹窗' }).click();
  const downloaded = page.waitForEvent('download');
  await history.getByRole('button', { name: '导出当前明细' }).click();
  const csv = await readFile(await (await downloaded).path(), 'utf8');
  assert.match(csv, /数量,含赠品数量,不含税收入/);
  assert.match(csv, /,7,9,\r?\n?$/);
  assert.equal(previewCsv, csv);
  await report.getByRole('button', { name: '预览当前明细', exact: true }).click();
  const reportDownload = page.waitForEvent('download');
  await frame.getByRole('dialog').getByRole('button', { name: '下载明细', exact: true }).click();
  const reportCsv = await readFile(await (await reportDownload).path(), 'utf8');
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
    return fixture(query, query.queryId === 'facts.report' ? records : undefined);
  });
  const report = frame.getByRole('region', { name: '计划提报数据', exact: true });
  await expect(report.getByText('业务来源', { exact: true })).toBeVisible();
  await report.getByText('口径与统计说明', { exact: true }).click();
  await expect(report).toContainText('当前期间201条，数量合计未提供，缺失数量1条');
  await expect(
    frame.getByRole('region', { name: '历史同期发货' }).getByRole('alert'),
  ).toContainText('当前账号暂无数据权限');
  assert.deepEqual(
    calls.filter((call) => call.queryId === 'facts.report').map((call) => call.parameters.offset),
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
    if (query.queryId === 'facts.report')
      return { ...fixture(query), totalRowCount: 2, hasMorePages: false };
    if (query.queryId === 'facts.history' && ++historyCalls === 1) await pending;
    return fixture(query);
  });
  await expect(
    frame.getByRole('region', { name: '计划提报数据' }).getByRole('alert'),
  ).toContainText('未采用不完整结果');
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
    const csv = await readFile(await (await download).path(), 'utf8');
    assert(csv.includes(title === '计划提报数据' ? '12.5' : '7.5,0,10.5'));
  }
});
