import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { mpsPage } from './helpers/mps-page.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const emptySource = ({ queryId }) => ({
  rows: queryId.endsWith('.count') ? [{ total: 0 }] : [],
  returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
  rejectedColumns: [],
  configVersion: 'workflow-fixture-v1',
});
async function version(frame, month) {
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await dialog.getByLabel('评估月份', { exact: true }).fill(month);
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
}
async function download(page, view, name) {
  const waiting = page.waitForEvent('download');
  await view.getByRole('button', { name, exact: true }).click();
  const chunks = [];
  for await (const chunk of await (await waiting).createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

test('MPS processing shows current evaluation and missing split dependencies in the same downloadable results', async (t) => {
  const { page, frame } = await mpsPage(t, config, emptySource);
  await version(frame, '2026-10');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await expect(view).toBeVisible();
  await expect(view).toContainText('2026-10');
  await expect(view.getByRole('table', { name: '大类需求', exact: true })).toBeVisible();
  await expect(view.getByRole('table', { name: '基地单品需求拆分', exact: true })).toBeVisible();
  await expect(view).toContainText('未评估');
  const csv = await download(page, view, '下载需求拆分');
  assert.match(csv, /2026-10/);
  assert.match(csv, /未评估|缺|待确认/);
  assert.doesNotMatch(csv, /40%|40\/40\/20|模拟/);
});

async function upload(frame, label, text) {
  await frame
    .getByLabel(label, { exact: true })
    .setInputFiles({ name: '本地核对.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
}

test('MPS local constraints edit the current draft and leave formal writes disabled across versions', async (t) => {
  const { page, frame } = await mpsPage(t, config, emptySource);
  await version(frame, '2026-10');
  await upload(
    frame,
    '选择产品关系CSV',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列甲,组甲,,',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  const view = frame.getByRole('region', { name: '约束与配置', exact: true });
  await expect(view.getByRole('button', { name: '保存正式配置', exact: true })).toBeDisabled();
  await view.getByLabel('郑州 安全天数', { exact: true }).fill('0');
  await expect(view.getByLabel('郑州 安全天数', { exact: true })).toHaveValue('0');
  await view.getByRole('button', { name: '新增本地约束', exact: true }).click();
  await view.getByLabel('约束1 内容', { exact: true }).fill('停线核对');
  await view.getByLabel('约束1 作用对象', { exact: true }).fill('郑州1线');
  await view.getByLabel('约束1 强度', { exact: true }).selectOption('软');
  await view.getByLabel('约束1 生效至', { exact: true }).fill('2026-10-31');
  await expect(view.getByRole('table', { name: '本地约束', exact: true })).toContainText(
    '未参与计算',
  );
  const csv = await download(page, view, '下载本地配置');
  assert.match(csv, /2026-10,郑州,0/);
  assert.match(csv, /停线核对/);
  assert.match(csv, /2026-10-31/);
  await version(frame, '2026-11');
  await expect(view.getByLabel('约束1 内容', { exact: true })).toHaveCount(0);
  await frame.getByLabel('评估版本选择').selectOption('local-2');
  await expect(view.getByLabel('约束1 内容', { exact: true })).toHaveValue('停线核对');
  await view.getByRole('button', { name: '删除约束1', exact: true }).click();
  await expect(view.getByLabel('约束1 内容', { exact: true })).toHaveCount(0);
});

test('MPS capacity and report keep unconfirmed formulas empty and export the current source rows', async (t) => {
  const { page, frame } = await mpsPage(t, config, emptySource);
  await version(frame, '2026-10');
  await upload(
    frame,
    '选择产品关系CSV',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,=1+1,汤圆,系列甲,组甲,,',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估与缺口' }).click();
  const capacity = frame.getByRole('region', { name: '产能评估与缺口', exact: true });
  await expect(capacity.getByRole('table', { name: '产能评估明细', exact: true })).toContainText(
    'A',
  );
  for (const field of ['目标库存', '月产能', '负荷', '主计划', '缺口', '调拨'])
    await expect(
      capacity.getByRole('button', { name: `郑州 A 2026-10 ${field} 计算过程`, exact: true }),
    ).toHaveText('—');
  await capacity.getByLabel('月份筛选', { exact: true }).selectOption('2026-10');
  const capacityCsv = await download(page, capacity, '下载产能评估');
  assert.match(capacityCsv, /'=1\+1/);
  assert.doesNotMatch(capacityCsv, /2026-11/);
  await capacity.getByRole('button', { name: '下一步：产销存报告', exact: true }).click();
  const report = frame.getByRole('region', { name: '产销存报告', exact: true });
  await report.getByLabel('月份筛选', { exact: true }).selectOption('2026-10');
  const reportCsv = await download(page, report, '下载产销存报告');
  assert.equal(reportCsv, capacityCsv);
  await expect(report.getByRole('button', { name: '保存正式报告', exact: true })).toBeDisabled();
});

test('MPS processing rounds source quantities for display and preserves raw values in its download', async (t) => {
  const { page, frame } = await mpsPage(t, config, emptySource);
  await version(frame, '2026-10');
  await upload(
    frame,
    '选择产品关系CSV',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列甲,组甲,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-10,郑州,A,产品甲,汤圆,系列甲,组甲,12.5,0',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await expect(
    view.getByRole('button', { name: '郑州 A 2026-10 提报数量 计算过程', exact: true }),
  ).toHaveText('13');
  const csv = await download(page, view, '下载需求拆分');
  assert(csv.includes('12.5'));
});
