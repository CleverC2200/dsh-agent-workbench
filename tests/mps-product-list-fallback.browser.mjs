import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { mpsPage, openMpsProductDetails } from './helpers/mps-page.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';
import { workflowStep } from './helpers/mps-edit.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const product = (month, code = 'A') => ({
  ...Object.fromEntries(config.queries['products.detail'].columns.map((field) => [field, null])),
  stat_period: month + '-26',
  target_base: '西南',
  material_code: code,
  material_name: '产品' + code,
  responsible_item: '点心',
  series: '系列',
  product_item: 'G',
  product_item_name: '组',
  source_rows: 1,
});

test('产品清单回退贯通新建评估、锁月浏览、恢复与主动重选，旧草稿保全', async (t) => {
  let filled = false;
  let failed = false;
  const { page, frame, calls } = await mpsPage(
    t,
    config,
    ({ queryId, parameters }) => {
      if (failed && queryId.startsWith('products.')) throw Error('产品清单查询失败');
      const adopted = filled && parameters.month >= '2026-12' ? parameters.month : '2026-11';
      const rows =
        queryId === 'products.period'
          ? [{ month: adopted }]
          : ['products.detail', 'products.count'].includes(queryId)
            ? parameters.month === '2026-11'
              ? [product('2026-11')]
              : filled && parameters.month >= '2026-12'
                ? [product(parameters.month, 'B')]
                : []
            : [];
      const offset = parameters.offset ?? 0;
      return {
        rows: queryId.endsWith('.count')
          ? [{ total: rows.length }]
          : rows.slice(offset, offset + (parameters.page_size ?? 5000)),
        returnedColumns: config.queries[queryId].columns ?? ['total'],
        configVersion: 'fallback-ui',
        totalRowCount: rows.length,
        offset,
        hasMorePages: false,
      };
    },
    { time: '2026-11-24T12:00:00+08:00' },
  );
  const products = await openMpsProductDetails(frame);
  await expect(products).toContainText('产品A');
  await page.evaluate(async () => {
    const legacy = structuredClone(window.readView());
    delete legacy.localDrafts.drafts[0].productPeriod;
    await window.openAuthor('mps', 1200, legacy);
  });
  await openMpsProductDetails(frame);
  await expect(products).toContainText('产品A');
  const old = await page.evaluate(() => structuredClone(window.readView().localDrafts.drafts[0]));
  assert.equal(Object.hasOwn(old, 'productPeriod'), false);
  const create = async (month, reference) => {
    await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
    await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill(month);
    if (reference)
      await frame
        .getByRole('dialog')
        .getByLabel('参考版本', { exact: true })
        .selectOption(reference);
    await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
    await expect(products).toContainText('产品A');
    await expect(products).toContainText(`目标 ${month}，实际采用 2026-11`);
  };
  await create('2026-12');
  await create('2027-01', 'local-2');
  await expect
    .poll(() => page.evaluate(() => window.readView().localDrafts.drafts.at(-1).productPeriod))
    .toEqual({ targetMonth: '2027-01', adoptedMonth: '2026-11' });
  await workflowStep(frame, '主数据对应关系');
  const scope = frame.getByRole('region', { name: '产品范围对账', exact: true });
  await expect(scope).toContainText('产品清单采用 2026-11（目标 2027-01）');
  await expect(scope).not.toContainText('未证明同期间');
  await workflowStep(frame, '需求确认');
  filled = true;
  await openMpsProductDetails(frame);
  await frame.getByRole('button', { name: '查看源表', exact: true }).click();
  const source = frame.getByRole('dialog', { name: '月主计划数据源', exact: true });
  await expect(source).toContainText('评估目标 2027-01，实际采用 2026-11');
  await expect(source).not.toContainText('统计月 2026-11');
  await source.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(source).toContainText('产品A');
  await expect(source).not.toContainText('产品B');
  const pendingDownload = page.waitForEvent('download');
  await source.getByRole('button', { name: '下载当前页', exact: true }).click();
  const download = await pendingDownload;
  assert.equal(download.suggestedFilename(), '产品清单-2026-11-第1页.xlsx');
  assert.match(await mpsDownloadText(await download.path()), /2026-11-26/);
  await source.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  const before = calls.filter(
    (call) => call.queryId === 'products.period' && call.parameters.month === '2027-01',
  ).length;
  await page.evaluate(async () =>
    window.openAuthor('mps', 1200, structuredClone(window.readView())),
  );
  await openMpsProductDetails(frame);
  await expect(products).toContainText('产品A');
  assert.equal(
    calls.filter(
      (call) => call.queryId === 'products.period' && call.parameters.month === '2027-01',
    ).length,
    before,
  );
  const monthField = products.getByLabel('产品统计期', { exact: true });
  const monthPanel = products.locator('.mps-month-panel');
  await monthField.press('ArrowDown');
  await expect(monthPanel).toBeVisible();
  await expect(
    monthPanel.getByRole('button', { name: '1月', exact: true, pressed: true }),
  ).toBeVisible();
  await expect(monthPanel).toContainText('2027年');
  await monthPanel.getByRole('button', { name: '上一年', exact: true }).click();
  await monthPanel.getByRole('button', { name: '12月', exact: true }).click();
  await expect(monthPanel).toBeHidden();
  await expect(monthField).toHaveValue('2026-12');
  await frame.getByRole('button', { name: '查看源表', exact: true }).click();
  await expect(source).toContainText('预览目标 2026-12');
  await expect(source).toContainText('评估已采用 2026-11');
  await expect(source).toContainText('产品B');
  await source.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await products.getByRole('button', { name: '同步产品', exact: true }).click();
  await expect(products).toContainText('产品B');
  await expect(products.getByLabel('产品统计期', { exact: true })).toHaveValue('2026-12');
  await expect(products).not.toContainText('目标 2026-12，实际采用 2026-12');
  failed = true;
  await products.getByLabel('产品统计期', { exact: true }).fill('2026-10');
  await products.getByRole('button', { name: '同步产品', exact: true }).click();
  await expect(products.getByRole('alert')).toContainText('数据读取失败');
  await expect(products).toContainText('产品B');
  await expect(products).toContainText('待同步 2026-10，当前显示上次同步的清单');
  assert.deepEqual(await page.evaluate(() => window.readView().localDrafts.drafts[0]), old);
  assert.equal(await page.evaluate(() => window.peerDraft), '历史草稿，请保留。');
});

test('产品数据源翻页固定采用月和配置，零源记录与过滤后空清单分别显示', async (t) => {
  let mode = 'available';
  const { page, frame, calls } = await mpsPage(
    t,
    config,
    ({ queryId, parameters }) => {
      const rows =
        queryId === 'products.period'
          ? [{ month: mode === 'none' ? null : mode === 'filtered' ? parameters.month : '2026-11' }]
          : ['products.detail', 'products.count'].includes(queryId)
            ? mode === 'filtered'
              ? [{ ...product(parameters.month, 'Z'), responsible_item: '粽子' }]
              : Array.from({ length: 26 }, (_, index) => product(parameters.month, `A${index}`))
            : [];
      const offset = parameters.offset ?? 0;
      return {
        rows: queryId.endsWith('.count')
          ? [{ total: rows.length }]
          : rows.slice(offset, offset + (parameters.page_size ?? 5000)),
        returnedColumns: config.queries[queryId].columns ?? ['total'],
        configVersion: 'paging-ui',
        totalRowCount: rows.length,
        offset,
        hasMorePages: false,
      };
    },
    { time: '2026-11-24T12:00:00+08:00' },
  );
  const products = await openMpsProductDetails(frame);
  await expect(products).toContainText('产品A0');
  await products.getByLabel('产品统计期', { exact: true }).fill('2027-01');
  await products.getByRole('button', { name: '同步产品', exact: true }).click();
  await expect(products).toContainText('2026-12 至 2027-01 无产品清单');
  const periodCalls = calls.filter((call) => call.queryId === 'products.period').length;
  await frame.getByRole('button', { name: '查看源表', exact: true }).click();
  const source = frame.getByRole('dialog', { name: '月主计划数据源', exact: true });
  await expect(source).toContainText('共26条');
  await source.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(source).toContainText('产品A25');
  const pendingDownload = page.waitForEvent('download');
  await source.getByRole('button', { name: '下载当前页', exact: true }).click();
  const download = await pendingDownload;
  assert.equal(download.suggestedFilename(), '产品清单-2026-11-第2页.xlsx');
  assert.match(await mpsDownloadText(await download.path()), /2026-11-26/);
  assert.equal(calls.filter((call) => call.queryId === 'products.period').length, periodCalls);
  await source.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  mode = 'none';
  await products.getByRole('button', { name: '同步产品', exact: true }).click();
  await expect(products).toContainText('目标 2027-01，无可用产品清单');
  await expect(products.getByRole('alert')).toHaveCount(0);
  await frame.getByRole('button', { name: '查看源表', exact: true }).click();
  await expect(source).toContainText('无可用产品清单');
  await expect(source.getByRole('button', { name: '下载当前页', exact: true })).toBeDisabled();
  await source.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  mode = 'filtered';
  await products.getByRole('button', { name: '同步产品', exact: true }).click();
  await expect(products.getByRole('button', { name: '同步产品', exact: true })).toBeEnabled();
  await expect(products).not.toContainText('无可用产品清单');
  await expect(products).not.toContainText('产品Z');
  await frame.getByRole('button', { name: '查看源表', exact: true }).click();
  await expect(source).toContainText('统计月 2027-01');
  await expect(source).not.toContainText('评估目标 2027-01，实际采用 2027-01');
});

test('新评估首次读取中断后重开仍保存成功采用月份，历史无来源字段保持不变', async (t) => {
  const gate = Promise.withResolvers();
  t.after(() => gate.resolve());
  let delayed = false;
  const { page, frame } = await mpsPage(
    t,
    config,
    async ({ queryId, parameters }) => {
      if (delayed && queryId === 'products.period') await gate.promise;
      const rows =
        queryId === 'products.period'
          ? [{ month: '2026-11' }]
          : ['products.detail', 'products.count'].includes(queryId)
            ? [product('2026-11')]
            : [];
      return {
        rows: queryId.endsWith('.count') ? [{ total: rows.length }] : rows,
        returnedColumns: config.queries[queryId].columns ?? ['total'],
        configVersion: 'pending-ui',
        totalRowCount: rows.length,
        offset: parameters.offset ?? 0,
        hasMorePages: false,
      };
    },
    { time: '2026-11-24T12:00:00+08:00' },
  );
  const products = await openMpsProductDetails(frame);
  await expect(products).toContainText('产品A');
  delayed = true;
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-12');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await expect(products.getByRole('button', { name: '同步中…', exact: true })).toBeDisabled();
  await expect
    .poll(() => page.evaluate(() => window.readView().localDrafts.drafts.at(-1).productPeriod))
    .toBe(null);
  delayed = false;
  await page.evaluate(async () =>
    window.openAuthor('mps', 1200, structuredClone(window.readView())),
  );
  gate.resolve();
  await openMpsProductDetails(frame);
  await expect(products).toContainText('目标 2026-12，实际采用 2026-11');
  await expect
    .poll(() => page.evaluate(() => window.readView().localDrafts.drafts.at(-1).productPeriod))
    .toEqual({ targetMonth: '2026-12', adoptedMonth: '2026-11' });
});
