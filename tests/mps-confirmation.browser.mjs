import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { authorPage } from './helpers/author-page.mjs';

async function confirmation(t) {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('heading', { name: '需求确认', exact: true })).toBeVisible();
  return { page, frame };
}

async function createVersion(frame, month) {
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await dialog.getByLabel('评估月份', { exact: true }).fill(month);
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
}

test('MPS opens demo products with unconnected business sources and keeps seven business steps separate from formal save', async (t) => {
  const { page, frame } = await confirmation(t);
  await frame.getByRole('button', { name: '页面说明', exact: true }).click();
  await expect(frame.getByRole('dialog', { name: '页面说明', exact: true })).toContainText(
    '刷新或切换对话会清除本页内存输入',
  );
  await frame.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await expect(frame.getByRole('button', { name: '保存调整', exact: true })).toBeDisabled();
  await expect(frame.locator('.ap-page-tab')).toHaveCount(7);
  await expect(
    frame.getByRole('region', { name: '计划提报数据' }).getByText('未接入', { exact: true }),
  ).toBeVisible();
  await expect(frame.getByRole('region', { name: '系统派生口径参数' })).toBeVisible();
  await expect(frame.getByRole('heading', { name: '大类预估需求数量', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => window.peerDraft), '历史草稿，请保留。');
  for (const label of [
    '本月预估发货',
    '需求加工与收敛',
    '主数据对应关系',
    '约束与配置',
    '产能评估与缺口',
    '产销存报告',
  ]) {
    await frame.locator('.ap-page-tab').filter({ hasText: label }).click();
    await expect(frame.getByRole('button', { name: 'Studio / 人物设置', exact: true })).toHaveCount(
      0,
    );
    await expect(frame.getByText('AI 助手设置', { exact: true })).toHaveCount(0);
  }
});

test('MPS product relationships stay in their local month draft and can be edited without claiming historical inheritance', async (t) => {
  const { frame } = await confirmation(t);
  await createVersion(frame, '2026-12');
  await expect(frame.getByLabel('评估版本选择').locator('option:checked')).toContainText('2026-12');
  const products = frame.getByRole('region', { name: '产品明细' });
  await products.getByRole('button', { name: '新增产品', exact: true }).click();
  const editor = frame.getByRole('dialog', { name: '新增产品', exact: true });
  for (const [label, value] of Object.entries({
    基地名称: '郑州',
    产品编码: 'P1',
    产品名称: '新品',
    大类: '汤圆',
    系列: '系列甲',
    物料组: '物料组乙',
    对应老品编码: 'OLD1',
    老品名称: '老品',
  }))
    await editor.getByLabel(label, { exact: true }).fill(value);
  await editor.getByRole('button', { name: '新增', exact: true }).click();
  await expect(products.getByRole('cell', { name: 'P1', exact: true })).toBeVisible();
  await expect(products).toContainText('历史继承规则待确认');
  await frame.getByLabel('评估版本选择').selectOption('local-1');
  await expect(products.getByRole('cell', { name: 'P1', exact: true })).toHaveCount(0);
  await frame.getByLabel('评估版本选择').selectOption('local-2');
  await expect(products.getByRole('cell', { name: 'P1', exact: true })).toBeVisible();
  await products.getByRole('button', { name: '编辑 P1', exact: true }).click();
  const editing = frame.getByRole('dialog', { name: '修改产品', exact: true });
  await editing.getByLabel('产品名称', { exact: true }).fill('新版名称');
  await editing.getByRole('button', { name: '保存', exact: true }).click();
  await expect(products.getByRole('cell', { name: '新版名称', exact: true })).toBeVisible();
  await frame.getByRole('button', { name: '本月预估发货', exact: false }).first().click();
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  await expect(products.getByRole('cell', { name: 'P1', exact: true })).toBeVisible();
  await products.getByRole('button', { name: '删除 P1', exact: true }).click();
  await expect(products.getByRole('cell', { name: 'P1', exact: true })).toHaveCount(0);
});

const headers = '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量';
const reportCsv =
  headers +
  '\n2026-12,郑州,P1,产品一,汤圆,系列甲,组甲,10,12\n2026-12,郑州,P1,产品一,汤圆,系列甲,组甲,5,0\n2026-12,华东,P2,产品二,汤圆,系列甲,组乙,0,\n2026-11,华南,P3,其他月份,饺子,系列乙,组丙,999,999';
async function upload(frame, label, text) {
  await frame
    .getByLabel(label, { exact: true })
    .setInputFiles({ name: '核对.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
}

test('MPS reads CSV atomically and uses the same selected-period rows for coverage, totals, preview and export', async (t) => {
  const { page, frame } = await confirmation(t);
  await createVersion(frame, '2026-12');
  const source = frame.getByRole('region', { name: '计划提报数据' });
  await upload(frame, '选择计划提报CSV', reportCsv);
  await expect(source).toContainText('已读取4条');
  await expect(source.getByRole('button', { name: '基地 2', exact: true })).toBeVisible();
  await expect(source.getByRole('button', { name: '大类 1', exact: true })).toBeVisible();
  await expect(source.getByRole('button', { name: '系列 1', exact: true })).toBeVisible();
  await expect(source.getByRole('button', { name: '产品 2', exact: true })).toBeVisible();
  await expect(source).toContainText('当前期间3条，数量合计15件，缺失数量0条');
  await source.getByRole('button', { name: '基地 2', exact: true }).click();
  await expect(source.getByRole('row').filter({ hasText: '郑州' }).last()).toContainText('15');
  await expect(source).toContainText('公式：同一基地的有效数量相加');
  await frame.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  const download = page.waitForEvent('download');
  await source.getByRole('button', { name: '导出当前明细', exact: true }).click();
  const file = await download;
  const chunks = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  assert.match(csv, /2026-12,郑州,P1/);
  assert.doesNotMatch(csv, /999/);
  await source.getByLabel('提报口径').selectOption('adjust');
  await expect(source).toContainText('当前期间3条，数量合计12件，缺失数量1条');
  await upload(frame, '选择计划提报CSV', headers + '\n2026-12,郑州,P4,坏数据,汤圆,系列,组,abc,10');
  await expect(source.getByRole('alert')).toContainText('第2行');
  await expect(source).toContainText('当前期间3条，数量合计12件，缺失数量1条');
  await source.getByRole('button', { name: '预览当前明细', exact: true }).click();
  await expect(source.getByRole('cell', { name: '0', exact: true }).first()).toBeVisible();
  await expect(source.getByRole('cell', { name: '未提供', exact: true })).toBeVisible();
});

test('MPS forecast crosses the year and historical periods do not borrow other rows; CSV export escapes spreadsheet formulas', async (t) => {
  const { page, frame } = await confirmation(t);
  await createVersion(frame, '2026-12');
  const columns = '月份,基地,产品编码,产品名称,大类,系列,物料组,数量';
  await upload(
    frame,
    '选择模型预测CSV',
    columns + '\n2026-12,郑州,F1,=1+1,汤圆,系列甲,组甲,7\n2027-01,华东,F2,一月,饺子,系列乙,组乙,9',
  );
  const forecast = frame.getByRole('region', { name: '模型双期预测' });
  const monthly = frame.getByRole('region', { name: '逐月测算', exact: true });
  await expect(monthly.getByRole('cell', { name: '2026-12（M+1）', exact: true })).toHaveCount(8);
  await expect(monthly.getByRole('cell', { name: '2027-01（M+2）', exact: true })).toHaveCount(8);
  await expect(forecast).toContainText('当前期间1条，数量合计7件');
  const download = page.waitForEvent('download');
  await forecast.getByRole('button', { name: '导出当前明细', exact: true }).click();
  const chunks = [];
  for await (const chunk of await (await download).createReadStream()) chunks.push(chunk);
  assert.match(Buffer.concat(chunks).toString('utf8'), /'=1\+1/);
  await forecast.getByLabel('预测期间').selectOption('2');
  await expect(forecast).toContainText('核对期间 2027-01');
  await expect(forecast).toContainText('当前期间1条，数量合计9件');
  await upload(
    frame,
    '选择历史发货CSV',
    columns + '\n2025-12,郑州,H1,去年,汤圆,系列,组,0\n2024-12,华东,H2,前年,饺子,系列,组,11',
  );
  const history = frame.getByRole('region', { name: '历史同期发货' });
  await expect(history).toContainText('当前期间1条，数量合计0件，缺失数量0条');
  await history.getByLabel('历史同期').selectOption('2');
  await expect(history).toContainText('当前期间1条，数量合计11件');
  await history.getByLabel('历史同期').selectOption('3');
  await expect(history).toContainText('当前期间无已读取记录');
  await expect(history.getByRole('button', { name: '导出当前明细', exact: true })).toBeDisabled();
});

test('MPS annual grid retains July to June and unresolved business calculations stay empty with reasons', async (t) => {
  const { frame } = await confirmation(t);
  await createVersion(frame, '2026-12');
  const annual = frame.getByRole('region', { name: '年度销售计划' });
  await expect(annual.getByRole('columnheader', { name: '2026-07', exact: true })).toBeVisible();
  await expect(annual.getByRole('columnheader', { name: '2027-06', exact: true })).toHaveCount(1);
  await upload(
    frame,
    '选择年度计划CSV',
    '月份,大类,数量\n2026-07,汤圆,0\n2026-08,汤圆,20\n2026-09,汤圆,30',
  );
  await expect(annual).toContainText('分母为0');
  await expect(annual).toContainText('50%');
  await expect(
    frame.getByRole('region', { name: '系统派生口径参数' }).locator('section'),
  ).toHaveCount(5);
  const results = frame.getByRole('region', { name: '大类预估需求数量' });
  await expect(results.getByRole('row')).toHaveCount(9);
  await expect(results).toContainText('测算口径待确认');
  await expect(results.getByRole('cell', { name: '待定', exact: true })).toHaveCount(32);
});

test('MPS bounds large previews without silently dropping rows and rejects an oversized replacement as a whole', async (t) => {
  const { frame } = await confirmation(t);
  const products = frame.getByRole('region', { name: '产品明细' });
  const columns = '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称';
  const rows = Array.from(
    { length: 26 },
    (_, index) => `郑州,P${index},产品${index},汤圆,系列,组,,`,
  );
  await upload(frame, '选择产品关系CSV', columns + '\n' + rows.join('\n'));
  await expect(products.getByText('演示数据', { exact: true })).toHaveCount(0);
  await expect(products.getByRole('row')).toHaveCount(26);
  await expect(products).toContainText('共26条，每页25条，第1页');
  await products.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(products.getByRole('cell', { name: 'P25', exact: true })).toBeVisible();
  await expect(products.getByRole('row')).toHaveCount(2);
  await upload(
    frame,
    '选择产品关系CSV',
    columns +
      '\n' +
      Array.from({ length: 10001 }, (_, index) => `郑州,Q${index},产品,汤圆,系列,组,,`).join('\n'),
  );
  await expect(products.getByRole('alert')).toContainText('超过10000条上限');
  await expect(products.getByRole('cell', { name: 'P25', exact: true })).toBeVisible();
});

test('MPS preserves missing dimensions and signed local quantities instead of inventing business coverage', async (t) => {
  const { page, frame } = await confirmation(t);
  await createVersion(frame, '2026-12');
  await upload(
    frame,
    '选择计划提报CSV',
    headers + '\n2026-12,郑州,P1,缺字段,汤圆,,组甲,-2,\n2026-12,,P2,未定基地,汤圆,系列甲,,5,7',
  );
  const source = frame.getByRole('region', { name: '计划提报数据' });
  await expect(source).toContainText('当前期间2条，数量合计3件，缺失数量0条');
  await expect(source.getByRole('button', { name: '基地 1', exact: true })).toBeVisible();
  await expect(source).toContainText('基地缺失1条');
  await expect(source).toContainText('系列缺失1条');
  await source.getByRole('button', { name: '预览当前明细', exact: true }).click();
  await expect(source.getByRole('cell', { name: '-2', exact: true })).toBeVisible();
  await expect(source.getByRole('cell', { name: '未提供', exact: true })).toHaveCount(3);
  await frame.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await source.locator('summary').filter({ hasText: '口径与统计说明' }).click();
  const downloading = page.waitForEvent('download');
  await source.getByRole('button', { name: '导出全部已读明细', exact: true }).click();
  const chunks = [];
  for await (const chunk of await (await downloading).createReadStream()) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  assert.match(csv, /组甲,-2,/);
  assert.doesNotMatch(csv, /'-2/);
  await upload(frame, '选择计划提报CSV', csv);
  await expect(source.getByRole('alert')).toHaveCount(0);
  await expect(source).toContainText('当前期间2条，数量合计3件');
  await upload(frame, '选择计划提报CSV', headers + '\n2026-12,郑州,P1,无数量,汤圆,系列,组,,');
  await expect(source).toContainText('当前期间1条，数量合计未提供，缺失数量1条');
});

test('MPS opens the prototype product card with its fifteen labeled samples and edits products in a dialog', async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  const products = frame.getByRole('region', { name: '产品明细' });
  await expect(products.getByRole('row')).toHaveCount(16);
  await expect(products.getByText('演示数据', { exact: true })).toBeVisible();
  await expect(products.getByRole('cell', { name: '10002791', exact: true }).first()).toBeVisible();
  await expect(products.getByRole('cell', { name: '10009002', exact: true })).toBeVisible();
  await expect(products.getByRole('columnheader', { name: '基地名称', exact: true })).toBeVisible();
  await expect(
    products.getByRole('columnheader', { name: '对应老品编码', exact: true }),
  ).toBeVisible();
  await expect(products.getByLabel('产品名称', { exact: true })).toHaveCount(0);
  await products.getByRole('button', { name: '新增产品', exact: true }).click();
  const editor = frame.getByRole('dialog', { name: '新增产品', exact: true });
  await expect(editor).toBeVisible();
  for (const [label, value] of Object.entries({
    基地名称: '郑州',
    产品编码: 'NEW1',
    产品名称: '新增产品测试',
    大类: '汤圆',
    系列: '系列',
    物料组: '组',
  }))
    await editor.getByLabel(label, { exact: true }).fill(value);
  await editor.getByRole('button', { name: '新增', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(products.getByRole('row')).toHaveCount(17);
  await products.getByRole('button', { name: '编辑 NEW1', exact: true }).click();
  const editing = frame.getByRole('dialog', { name: '修改产品', exact: true });
  await editing.getByLabel('产品名称', { exact: true }).fill('编辑后产品');
  await editing.getByRole('button', { name: '保存', exact: true }).click();
  await expect(products.getByRole('cell', { name: '编辑后产品', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await products.getByRole('button', { name: '下载', exact: true }).click();
  assert.equal((await download).suggestedFilename(), '产品关系-演示数据.csv');
});

test('MPS creates and compares local evaluation versions in dialogs without occupying the product first card', async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('heading', { name: '需求确认', exact: true })).toBeVisible();
  await expect(frame.locator('.dc-page section:visible').first()).toHaveAttribute(
    'aria-label',
    '产品明细',
  );
  await expect(frame.getByRole('button', { name: 'Studio / 人物设置', exact: true })).toHaveCount(
    0,
  );
  await expect(frame.getByRole('button', { name: '新建评估版本', exact: true })).toBeVisible();
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const creation = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await creation.getByLabel('评估月份', { exact: true }).fill('2026-12');
  await creation.getByLabel('版本名称', { exact: true }).fill('十二月核对');
  await creation.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await expect(creation).toHaveCount(0);
  await expect(frame.getByLabel('评估版本选择').locator('option:checked')).toContainText('2026-12');
  await expect(frame.getByLabel('评估版本选择')).toHaveValue('local-2');
  await frame.getByRole('button', { name: '版本对比', exact: true }).click();
  const compare = frame.getByRole('dialog', { name: '版本对比', exact: true });
  await expect(compare).toContainText('仅对比本地内存输入');
  await expect(compare).toContainText('十二月核对');
  await expect(compare).toContainText('15');
  await compare.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await frame.getByRole('button', { name: '页面说明', exact: true }).click();
  await expect(frame.getByRole('dialog', { name: '页面说明', exact: true })).toContainText(
    '刷新或切换对话会清除',
  );
});

test('MPS keeps source review in cards and opens current-period detail with its formula after an upload', async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  const source = frame.getByRole('region', { name: '计划提报数据' });
  await expect(source.locator('input[type="file"]')).toBeHidden();
  await expect(frame.locator('.dc-source-grid > section')).toHaveCount(3);
  await expect(frame.locator('.dc-parameter-grid > section')).toHaveCount(5);
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const creation = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await creation.getByLabel('评估月份', { exact: true }).fill('2026-12');
  await creation.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await upload(frame, '选择计划提报CSV', reportCsv);
  await source.getByRole('button', { name: '基地 2', exact: true }).click();
  const review = frame.getByRole('dialog', { name: '计划提报 · 2026-12 · 基地核对', exact: true });
  await expect(review.getByRole('row').filter({ hasText: '郑州' })).toContainText('15');
  await expect(review).toContainText('公式：同一基地的有效数量相加');
  await review.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await source.getByRole('button', { name: '预览当前明细', exact: true }).click();
  await expect(
    frame.getByRole('dialog', { name: '计划提报 · 2026-12 · 明细核对', exact: true }),
  ).toContainText('物料组');
});
