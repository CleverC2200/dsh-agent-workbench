import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { authorPage } from './helpers/author-page.mjs';
import { mpsPage } from './helpers/mps-page.mjs';
import { readFile } from 'node:fs/promises';
import { workflowExportRows } from './helpers/mps-workflow-export.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const emptySource = ({ queryId }) => ({
  rows: queryId.endsWith('.count') ? [{ total: 0 }] : [],
  returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
  rejectedColumns: [],
  configVersion: 'navigation-fixture',
});

const selectStep = (frame, title) =>
  frame.locator('.ap-page-tab').filter({ hasText: title }).click();

async function navigationPage(t, connected = false, width = 1200) {
  const source = connected ? await mpsPage(t, config, emptySource) : null;
  const page = source?.page ?? (await authorPage(t));
  if (!connected) await page.evaluate((width) => window.openAuthor('mps', width), width);
  const frame = page.frameLocator('iframe');
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列甲,物料组甲,,\n郑州,B,产品乙,水饺,系列乙,物料组乙,,',
    ),
  });
  const selected = await frame.getByLabel('评估版本选择').locator('option:checked').textContent();
  const month = selected.match(/\d{4}-\d{2}/)[0];
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '提报.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n${month},郑州,A,产品甲,汤圆,系列甲,物料组甲,100,100\n${month},郑州,B,产品乙,水饺,系列乙,物料组乙,200,200`,
    ),
  });
  return { page, frame, calls: source?.calls, month };
}

test('窄屏加工表切步返回恢复横向位置，新版本从起点浏览', async (t) => {
  const { frame } = await navigationPage(t, false, 720);
  await selectStep(frame, '需求加工与收敛');
  const area = frame.getByRole('region', { name: '加工后的需求横向滚动区', exact: true });
  await expect(area.getByRole('columnheader')).toHaveText([
    '全国 / 基地 / 大类 / 物料组 / SKU',
    /本月预估发货（可调整）/,
    /计划提报/,
    /M\+1 .*需求（可调整）/,
    /M\+2 .*需求（可调整）/,
    /M\+3 .*需求（可调整）/,
    /M\+4 .*库存参考（可调整）/,
  ]);
  const total = area.getByRole('row').filter({ hasText: '全国合计' });
  await expect(total.getByRole('cell').nth(0)).toContainText('系统预估');
  await expect(total.getByRole('cell').nth(1)).toHaveText('300');
  const base = area.getByRole('row').filter({ hasText: '基地 · 郑州' });
  await expect(base.getByRole('cell').nth(0)).toContainText('系统预估');
  await expect(base.getByRole('cell').nth(1)).toHaveText('300');
  const left = await area.evaluate((element) => {
    element.scrollLeft = 200;
    return element.scrollLeft;
  });
  assert.ok(left > 0);
  await selectStep(frame, '约束与配置');
  await selectStep(frame, '需求加工与收敛');
  await expect.poll(() => area.evaluate((element) => element.scrollLeft)).toBe(left);
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本' });
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await expect.poll(() => area.evaluate((element) => element.scrollLeft)).toBe(0);
});

test('同版本返回步骤保留独立筛选、层级展开和滚动位置', async (t) => {
  const { frame } = await navigationPage(t);
  await selectStep(frame, '需求加工与收敛');
  const search = frame.getByLabel('搜索当前步骤', { exact: true });
  const base = frame.getByRole('button', { name: '基地 · 郑州', exact: true });
  await base.press('Enter');
  await expect(base).toHaveAttribute('aria-expanded', 'true');
  await search.fill('产品甲');
  const disclosure = frame.getByText('来源诊断与缺项清单', { exact: true });
  await disclosure.click();
  const scroll = await frame.locator('.ap-board-body').evaluate((element) => {
    element.scrollTop = 280;
    return element.scrollTop;
  });
  assert.ok(scroll > 0);
  await selectStep(frame, '产能评估与缺口');
  await expect(search).toHaveValue('');
  await search.fill('产品乙');
  await selectStep(frame, '需求确认');
  await selectStep(frame, '需求加工与收敛');
  await expect(search).toHaveValue('产品甲');
  await expect(base).toHaveAttribute('aria-expanded', 'true');
  await expect(disclosure.locator('..')).toHaveAttribute('open', '');
  await expect
    .poll(() => frame.locator('.ap-board-body').evaluate((element) => element.scrollTop))
    .toBe(scroll);
  await selectStep(frame, '产能评估与缺口');
  await expect(search).toHaveValue('产品乙');
});

test('返回同一计算实例不追加查询，上游输入更新后读取新结果且新版本不继承筛选', async (t) => {
  const { page, frame, calls, month } = await navigationPage(t, true);
  await selectStep(frame, '需求加工与收敛');
  const search = frame.getByLabel('搜索当前步骤', { exact: true });
  await search.fill('产品甲');
  const initial = await workflowExportRows(frame);
  assert.equal(Number(initial.find((row) => row['产品编码'] === 'A')['提报数量']), 100);
  const workflow = await frame.locator('.wf-page').elementHandle();
  const before = calls.length;
  await selectStep(frame, '需求确认');
  assert.equal(await workflow.evaluate((element) => element.isConnected), true);
  await selectStep(frame, '需求加工与收敛');
  await expect(search).toHaveValue('产品甲');
  assert.equal(calls.length, before);
  await selectStep(frame, '需求确认');
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '更新提报.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n${month},郑州,A,产品甲,汤圆,系列甲,物料组甲,350,350`,
    ),
  });
  await selectStep(frame, '需求加工与收敛');
  await expect(search).toHaveValue('产品甲');
  const updated = await workflowExportRows(frame);
  assert.equal(Number(updated.find((row) => row['产品编码'] === 'A')['提报数量']), 350);
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本' });
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await expect(search).toHaveValue('');
  assert.equal(await frame.locator('.ap-board-body').evaluate((element) => element.scrollTop), 0);
  assert.equal(await page.evaluate(() => window.peerDraft), '历史草稿，请保留。');
});
