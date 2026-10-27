import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { mpsPage } from './helpers/mps-page.mjs';
const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const row = (kind, values) => ({
  ...Object.fromEntries(config.queries[kind + '.detail'].columns.map((c) => [c, null])),
  source_rows: 1,
  ...values,
});
function fixture(records, options = {}) {
  return ({ queryId, parameters }) => {
    const kind = queryId.split('.')[0];
    if (!['forecast', 'delivery'].includes(kind))
      return {
        rows: queryId.endsWith('.count') ? [{ total: 0 }] : [],
        returnedColumns: config.queries[queryId].columns ?? ['total'],
        configVersion: 'v1',
        totalRowCount: 0,
        offset: parameters.offset ?? 0,
        hasMorePages: false,
      };
    if (options.deny?.(kind)) throw Error('AGENT_ACCESS_DENIED');
    const period = kind === 'forecast' ? parameters.month : parameters.months[0];
    const values = records(kind, period).map((row) => ({
      ...row,
      stat_month: kind === 'forecast' ? parameters.source_month : period.replace('-', ''),
    }));
    return {
      rows: queryId.endsWith('.count')
        ? [{ total: values.length }]
        : values.slice(
            parameters.offset,
            parameters.offset + (options.truncated ? 1 : parameters.page_size),
          ),
      returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
      configVersion: 'v1',
    };
  };
}
async function december(frame) {
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-12');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
}
const source = (kind, month) =>
  kind === 'forecast'
    ? [
        row(kind, {
          stat_month: month,
          belong_base: '基地甲',
          material_code: '001',
          material_name: '产品甲',
          current_month_forecast_qty: 0,
          next_month_forecast_qty: 12.5,
        }),
      ]
    : [
        row(kind, {
          stat_month: month,
          dimension_type: '业务大类值',
          belong_base: '基地甲',
          dimension_value: '汤圆',
          dimension_act_dl_qty: '12.000000',
          fiscal_year: '2026/27',
          national_dimension_fiscal_act_dl_qty: '1000.000000',
          dimension_act_dl_qty_rate: '0.012000000000',
          year_on_year_rate: '-0.125000000000',
        }),
        row(kind, {
          stat_month: month,
          dimension_type: '业务产品值',
          belong_base: '基地甲',
          dimension_value: '001',
          product_name: '产品甲',
          dimension_act_dl_qty: '12.000000',
          national_dimension_fiscal_act_dl_qty: '800.000000',
          dimension_act_dl_qty_rate: '0.015000000000',
        }),
      ];
test('one forecast batch drives two selectable target months and delivery source ratios remain separate', async (t) => {
  const { page, frame, calls, contexts } = await mpsPage(t, config, fixture(source));
  await december(frame);
  const forecast = frame.getByRole('region', {
    name: '模型双期预测',
    exact: true,
  });
  await expect(forecast.getByText('业务来源', { exact: true })).toBeVisible();
  await forecast.getByText('口径与统计说明', { exact: true }).click();
  await expect(forecast).toContainText('数量合计0（单位待确认）');
  await forecast.getByLabel('预测期间').selectOption('2');
  await expect(forecast).toContainText('核对期间 2027-01');
  await expect(forecast).toContainText('数量合计12.5（单位待确认）');
  const download = page.waitForEvent('download');
  await forecast.getByRole('button', { name: '导出当前明细' }).click();
  const csv = await readFile(await (await download).path(), 'utf8');
  assert.match(
    csv,
    /预测批次,源批次月份,源当月预测数量,源下一月预测数量,源记录数,缺项原因,读取状态/,
  );
  assert(csv.includes('2026-12,2026/12/1,0,12.5,1,产品编码未匹配主数据，分类留空,ready'));
  await expect
    .poll(() => contexts.at(-1)?.parts?.check?.sourceSummaries?.forecast?.missingReasons)
    .toContain('产品编码未匹配主数据，分类留空');
  assert(csv.includes('2027-01,基地甲,001,产品甲,,,,12.5,2026-12,2026/12/1,0,12.5,1,'));
  const allDownload = page.waitForEvent('download');
  await forecast.getByRole('button', { name: '导出全部已读明细', exact: true }).click();
  const allCsv = await readFile(await (await allDownload).path(), 'utf8');
  assert(allCsv.includes('产品编码未匹配主数据，分类留空'));
  assert(allCsv.includes('2026-12,基地甲,001'));
  assert(allCsv.includes('2027-01,基地甲,001'));
  const delivery = frame.getByRole('region', {
    name: '基地多维发货指标',
    exact: true,
  });
  await expect(delivery.getByText('业务来源', { exact: true })).toBeVisible();
  await expect(delivery).toContainText('0.012000000000');
  await expect(delivery).toContainText('-0.125000000000');
  await delivery.getByLabel('发货指标维度').selectOption('业务产品值');
  await expect(delivery.locator('tbody tr')).toHaveCount(1);
  await expect(delivery).toContainText('0.015000000000');
  await expect(delivery).not.toContainText('0.012000000000');
  const checked = calls.filter(
    (c) => c.queryId === 'forecast.detail' && c.parameters.month === '2026-12',
  );
  assert.equal(checked.length, 1);
  assert.equal(checked[0].parameters.source_month, '2026/12/1');
  assert(
    calls.some((c) => c.queryId === 'delivery.detail' && c.parameters.months.includes('202612')),
  );
  assert(!calls.some((c) => c.queryId === 'forecast.detail' && c.parameters.month === '2027-01'));
  await page.locator('iframe').evaluate((el) => {
    el.style.width = '600px';
  });
  await expect
    .poll(() =>
      delivery.evaluate(
        (el) =>
          el.ownerDocument.documentElement.scrollWidth <=
          el.ownerDocument.defaultView.innerWidth + 1,
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      delivery.locator('.dc-table-scroll').evaluate((el) => el.scrollWidth > el.clientWidth),
    )
    .toBe(true);
});
test('all forecast pages are loaded, duplicates do not inflate totals, and a refresh failure invalidates the aggregate', async (t) => {
  let deny = false;
  const { frame, calls } = await mpsPage(
    t,
    config,
    fixture(
      (kind, month) =>
        kind === 'delivery'
          ? []
          : Array.from({ length: 201 }, (_, i) =>
              row(kind, {
                stat_month: month,
                belong_base: '基地甲',
                material_code: String(i).padStart(4, '0'),
                current_month_forecast_qty: 1,
                next_month_forecast_qty: 2,
                source_rows: i === 200 ? 2 : 1,
              }),
            ),
      { deny: (kind) => deny && kind === 'forecast' },
    ),
  );
  const forecast = frame.getByRole('region', {
    name: '模型双期预测',
    exact: true,
  });
  await expect(forecast.getByText('业务来源', { exact: true })).toBeVisible();
  await forecast.getByText('口径与统计说明', { exact: true }).click();
  await expect(forecast).toContainText('当前期间201条，数量合计未提供，缺失数量1条');
  assert(calls.some((c) => c.queryId === 'forecast.detail' && c.parameters.offset === 200));
  deny = true;
  await forecast.getByRole('button', { name: '同步', exact: true }).click();
  await expect(forecast.getByRole('alert')).toContainText('当前账号暂无数据权限');
  await expect(forecast).toContainText('当前读取未成功');
  await expect(forecast).toContainText('数量合计未提供');
});
test('a late delivery period cannot overwrite the newly selected month', async (t) => {
  let release;
  let blocked = false;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const execute = fixture(source);
  const { frame } = await mpsPage(t, config, async (q) => {
    if (q.queryId === 'delivery.detail' && q.parameters.months[0] === '2026-08') {
      blocked = true;
      await pending;
    }
    return execute(q);
  });
  t.after(() => release());
  const delivery = frame.getByRole('region', {
    name: '基地多维发货指标',
    exact: true,
  });
  await expect(delivery.getByText('业务来源', { exact: true })).toBeVisible();
  await delivery.getByLabel('发货指标月份').fill('2026-08');
  await expect.poll(() => blocked).toBe(true);
  await delivery.getByLabel('发货指标月份').fill('2026-09');
  await expect(delivery.getByText('业务来源', { exact: true })).toBeVisible();
  release();
  await expect(delivery.getByLabel('发货指标月份')).toHaveValue('2026-09');
  await expect(delivery.locator('tbody')).toContainText('2026-09');
  await expect(delivery.locator('tbody')).not.toContainText('2026-08');
});

test('forecast context reports unread business data and preserves a local file without claiming a missing table', async (t) => {
  const { frame, contexts } = await mpsPage(
    t,
    config,
    fixture(source, { deny: (kind) => kind === 'forecast' }),
  );
  await december(frame);
  const forecast = frame.getByRole('region', {
    name: '模型双期预测',
    exact: true,
  });
  await expect(forecast.getByRole('alert')).toContainText('当前账号暂无数据权限');
  await expect
    .poll(() => contexts.at(-1)?.parts?.check?.sourceSummaries?.forecast?.businessSource)
    .toBe('not-read');
  await frame.getByLabel('选择模型预测CSV', { exact: true }).setInputFiles({
    name: '预测核对.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,数量\n2026-12,基地甲,001,产品甲,汤圆,系列甲,组甲,7',
    ),
  });
  await expect(forecast.getByText('本地文件', { exact: true })).toBeVisible();
  await expect
    .poll(() => contexts.at(-1)?.parts?.check?.sourceSummaries?.forecast?.localFile)
    .toBe('预测核对.csv');
  assert.equal(contexts.at(-1).parts.check.sourceSummaries.forecast.businessSource, 'not-read');
  assert(
    !contexts.some(
      (context) =>
        context.parts?.check?.sourceSummaries?.forecast?.businessSource === 'table-not-built',
    ),
  );
});
