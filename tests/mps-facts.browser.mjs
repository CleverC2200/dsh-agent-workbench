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
test('confirmed monthly versions and shipment measures populate independently while forecast stays empty', async (t) => {
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
  await expect(preview).toContainText('未提供');
  await preview.getByRole('button', { name: '关闭弹窗' }).click();
  const downloaded = page.waitForEvent('download');
  await history.getByRole('button', { name: '导出当前明细' }).click();
  const csv = await readFile(await (await downloaded).path(), 'utf8');
  assert.match(csv, /数量,含赠品数量,不含税收入/);
  assert.match(csv, /,7,9,\r?\n?$/);
  await expect(
    frame
      .getByRole('region', { name: '模型双期预测' })
      .getByRole('button', { name: '同步', exact: true }),
  ).toBeDisabled();
  assert(!calls.some((call) => /forecast|stock|inventory/.test(call.queryId)));
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
