import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import * as XLSX from 'xlsx-republish';
import { mpsPage } from './helpers/mps-page.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const emptySource = ({ queryId }) => ({
  rows: queryId.endsWith('.count') ? [{ total: 0 }] : [],
  returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
  rejectedColumns: [],
  configVersion: 'workflow-fixture-v1',
});
const annualFixtures = new WeakMap();
async function workflowPage(t) {
  const state = { rows: [] };
  const result = await mpsPage(t, config, (query) => {
    if (query.queryId !== 'facts.history-annual') return emptySource(query);
    const rows = state.rows.slice(
      query.parameters.offset,
      query.parameters.offset + query.parameters.page_size,
    );
    return {
      rows,
      returnedColumns: config.queries[query.queryId].columns,
      configVersion: 'annual-workflow-fixture',
      totalRowCount: state.rows.length,
      offset: query.parameters.offset,
      hasMorePages: query.parameters.offset + rows.length < state.rows.length,
      dataStatus: 'ok',
      warnings: [],
    };
  });
  annualFixtures.set(result.frame, state);
  return result;
}
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

test('MPS basic inputs finish while navigating through shipment to processing and are reused on return', async (t) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  t.after(() => release());
  let started = false;
  let countCalls = 0;
  const { frame } = await mpsPage(t, config, async (query) => {
    if (
      query.queryId === 'facts.execution-delivery.count' &&
      query.parameters.month === '2027-01-01'
    ) {
      countCalls++;
      if (!started) {
        started = true;
        await pending;
      }
    }
    return emptySource(query);
  });
  await version(frame, '2027-03');
  await expect.poll(() => started).toBe(true);
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  release();
  await expect.poll(() => countCalls).toBe(2);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  await expect(frame.getByRole('button', { name: '下载源值核对', exact: true })).toBeEnabled();
  assert.equal(countCalls, 2);
});

test('MPS processing carries the same-version shipment closing stock into its visible detail and export', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-10');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-10,郑州,A,产品甲,汤圆,系列,组,100,100',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await upload(
    frame,
    '选择发货输入CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库\n2026-09,郑州,A,产品甲,汤圆,系列,组,220,10,10,10,100,200,80',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await expect(view.getByRole('table', { name: '前两步输入', exact: true })).toContainText(
    '2026-09 → 2026-10',
  );
  await expect(
    view.getByRole('button', { name: '郑州 A 2026-10 期初库存 计算过程', exact: true }),
  ).toHaveText('80');
  const csv = await download(page, view, '下载需求拆分');
  const book = XLSX.read(csv, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  assert.equal(
    String(rows.find((row) => row['月份'] === '2026-10' && row['产品编码'] === 'A')['期初库存']),
    '80',
  );
});

test('MPS processing shows current evaluation and missing split dependencies in the same downloadable results', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-10');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await expect(view).toBeVisible();
  await expect(view).toContainText('2026-10');
  await expect(view.getByRole('table', { name: '大类需求', exact: true })).toBeVisible();
  for (const category of ['饺子', '调理肉制品', '饼类'])
    await expect(view.getByRole('table', { name: '大类需求', exact: true })).not.toContainText(
      category,
    );
  await expect(view.getByRole('table', { name: '基地单品需求拆分', exact: true })).toBeVisible();
  await expect(view).toContainText('未评估');
  const csv = await download(page, view, '下载需求拆分');
  assert.match(csv, /2026-10/);
  assert.match(csv, /未评估|缺|待确认/);
  assert.doesNotMatch(csv, /40%|40\/40\/20|模拟/);
});

test('MPS processing applies category exclusions to source-derived rows and CSV without removing products or report categories', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-10');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n' +
      ['饺子', '调理肉制品', '饼类', '汤圆']
        .map((category, index) => `郑州,P${index},产品${index},${category},系列,组,,`)
        .join('\n'),
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  const csv = await download(page, view, '下载需求拆分');
  for (const category of ['饺子', '调理肉制品', '饼类']) {
    await expect(view.getByRole('table', { name: '大类需求', exact: true })).not.toContainText(
      category,
    );
    await expect(
      view.getByLabel('大类筛选').getByRole('option', { name: category, exact: true }),
    ).toHaveCount(0);
    assert.equal(csv.includes(category), false);
  }
  assert.match(csv, /汤圆/);
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  await expect(frame.locator('section[aria-label="产销存报告"]')).toContainText('饺子');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  await expect(
    frame.getByRole('region', { name: '产品明细', exact: true }).locator('tbody tr'),
  ).toHaveCount(4);
});

async function upload(frame, label, text) {
  if (label === '设置上一财年发货夹具') {
    const [header, ...lines] = text
      .trim()
      .split('\n')
      .map((line) => line.split(','));
    const rows = new Map();
    for (const line of lines) {
      const value = (name) => line[header.indexOf(name)];
      const key = JSON.stringify([value('基地'), value('产品编码')]);
      const quantity = Number(value('数量'));
      if (
        rows.has(key) &&
        rows.get(key)['agents_scm_cust_deliv_daily_di.act_dl_qty_total'] !== quantity
      )
        throw Error('年度夹具同一基地物料数量冲突');
      rows.set(key, {
        ...Object.fromEntries(
          config.queries['facts.history-annual'].columns.map((column) => [column, null]),
        ),
        'agents_scm_cust_deliv_daily_di.belong_base': value('基地'),
        'agents_scm_cust_deliv_daily_di.material_code': value('产品编码'),
        'agents_scm_cust_deliv_daily_di.material_name': value('产品名称'),
        'agents_scm_cust_deliv_daily_di.product_categ_name': value('大类'),
        'agents_scm_cust_deliv_daily_di.act_dl_qty_total': quantity,
      });
    }
    annualFixtures.get(frame).rows = [...rows.values()];
    await frame.getByRole('button', { name: '读取去年发运占比源值', exact: true }).click();
    await expect(frame.getByText('全年历史读取中…')).toHaveCount(0);
    return;
  }
  const details = frame
    .locator('details')
    .filter({ has: frame.getByText('查看系统值、调整与缺项说明', { exact: true }) });
  if ((await details.isVisible()) && (await details.getAttribute('open')) === null)
    await details.locator('summary').click();
  await frame
    .getByLabel(label, { exact: true })
    .setInputFiles({ name: '本地核对.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
}

test('MPS 完整财年跨月复用但月度提报不跨月复制，池外分类单列', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-12');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n甲,A,产品甲,汤圆,系列,组甲,,\n乙,B,产品乙,面点,系列,组乙,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,甲,A,产品甲,汤圆,系列,组甲,30,30\n2027-01,乙,B,产品乙,面点,系列,组乙,80,80\n2026-12,丙,C,池外,面点,系列,组丙,500,500',
  );
  await upload(
    frame,
    '设置上一财年发货夹具',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,数量\n2025-12,甲,A,产品甲,汤圆,系列,组甲,60\n2026-01,乙,B,产品乙,面点,系列,组乙,40',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await view.getByLabel('月份筛选', { exact: true }).selectOption('2026-12');
  await expect(
    view.getByRole('button', { name: '甲 A 2026-12 系统占比 计算过程', exact: true }),
  ).toHaveText('100.00%');
  await expect(
    view.getByRole('table', { name: '基地单品需求拆分', exact: true }).locator('tbody tr'),
  ).toHaveCount(2);
  const december = await download(page, view, '下载需求拆分');
  assert.match(december, /产品甲/);
  assert.match(december, /产品乙/);
  await expect(
    view.getByRole('button', { name: '乙 B 2026-12 提报数量 计算过程', exact: true }),
  ).toHaveText('—');
  await view.getByLabel('月份筛选', { exact: true }).selectOption('2027-01');
  await expect(
    view.getByRole('button', { name: '乙 B 2027-01 系统占比 计算过程', exact: true }),
  ).toHaveText('100.00%');
  await expect(
    view.getByRole('table', { name: '基地单品需求拆分', exact: true }).locator('tbody tr'),
  ).toHaveCount(2);
});

test('MPS local constraints edit the current draft and leave formal writes disabled across versions', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-10');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
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

test('MPS capacity and report keep missing formula dependencies empty and export the current source rows', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-10');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,=1+1,汤圆,系列甲,组甲,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-10,郑州,A,=1+1,汤圆,系列甲,组甲,10,10',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估与缺口' }).click();
  const capacity = frame.getByRole('region', { name: '产能评估与缺口', exact: true });
  await expect(capacity.getByRole('table', { name: '产能评估明细', exact: true })).toContainText(
    'A',
  );
  for (const field of [
    '目标库存',
    '所需生产量',
    '无约束期末库存',
    '所需生产吨数',
    '可执行主计划',
    '调拨',
  ])
    await expect(
      capacity.getByRole('button', { name: `郑州 A 2026-10 ${field} 计算过程`, exact: true }),
    ).toHaveText('—');
  await capacity.getByLabel('月份筛选', { exact: true }).selectOption('2026-10');
  const capacityCsv = await download(page, capacity, '下载产能评估');
  assert.match(capacityCsv, /'=1\+1/);
  const book = XLSX.read(capacityCsv, { type: 'string', raw: true });
  const exportedRows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  assert.ok(exportedRows.every((row) => !row['月份'] || row['月份'] === '2026-10'));
  await capacity.getByRole('button', { name: '下一步：产销存报告', exact: true }).click();
  const report = frame.getByRole('region', { name: '产销存报告', exact: true });
  await report.getByLabel('月份筛选', { exact: true }).selectOption('2026-10');
  const reportCsv = await download(page, report, '下载产销存报告');
  assert.equal(reportCsv, capacityCsv);
  await expect(report.getByRole('button', { name: '保存正式报告', exact: true })).toBeDisabled();
});

test('MPS processing rounds source quantities for display and preserves raw values in its download', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-10');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
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

test('MPS configuration keeps accepted production days, explicit weight and assigned resources in the current local version', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-12');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列甲,组甲,,',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  const view = frame.getByRole('region', { name: '约束与配置', exact: true });
  await expect(view).toContainText('下一月需求 ÷ 下一月自然日天数');
  await expect(view.getByLabel('郑州 2026-12 生产天数', { exact: true })).toHaveValue('');
  await view.getByRole('button', { name: '郑州 2026-12 采用25天', exact: true }).click();
  await expect(view.getByLabel('郑州 2026-12 生产天数', { exact: true })).toHaveValue('25');
  await view.getByLabel('郑州 A 件吨系数', { exact: true }).fill('0.02');
  await view.getByRole('button', { name: '新增产能资源', exact: true }).click();
  await view.getByLabel('资源1 唯一编号', { exact: true }).fill('ZZ-T1');
  await view.getByLabel('资源1 基地', { exact: true }).fill('郑州');
  await view.getByLabel('资源1 名称', { exact: true }).fill('一号隧道');
  await view.getByLabel('资源1 日产吨数', { exact: true }).fill('8');
  await view.getByRole('button', { name: '新增资源分配', exact: true }).click();
  await view.getByLabel('分配1 月份', { exact: true }).selectOption('2026-12');
  await view.getByLabel('分配1 基地', { exact: true }).fill('郑州');
  await view.getByLabel('分配1 产品编码', { exact: true }).fill('A');
  await view.getByLabel('分配1 资源', { exact: true }).selectOption('ZZ-T1');
  await view.getByLabel('分配1 分配比例', { exact: true }).fill('1');
  const csv = await download(page, view, '下载本地配置');
  assert.match(csv, /ZZ-T1/);
  assert.match(csv, /0\.02/);
  assert.match(csv, /2026-12/);
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估与缺口' }).click();
  const capacity = frame.getByRole('region', { name: '产能评估与缺口', exact: true });
  await expect(capacity).toContainText('无约束参考');
  await expect(capacity.getByRole('table', { name: '资源负荷', exact: true })).toContainText(
    '一号隧道',
  );
  await expect(capacity).toContainText('未自动生成可执行主计划');
  if (process.env.MPS_WORKFLOW_SCREENSHOT_DIR) {
    await capacity.locator('.wf-scope').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${process.env.MPS_WORKFLOW_SCREENSHOT_DIR}/U1-capacity-desktop.png`,
      fullPage: true,
    });
    await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
    await view.getByRole('region', { name: '可用生产天数', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${process.env.MPS_WORKFLOW_SCREENSHOT_DIR}/U1-config-desktop.png`,
      fullPage: true,
    });
    await page.evaluate(() => {
      document.getElementById('root').style.width = '1120px';
    });
    await view.locator('.wf-scope').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${process.env.MPS_WORKFLOW_SCREENSHOT_DIR}/U1-config-narrow.png`,
      fullPage: true,
    });
  }
});

test('MPS processing exposes both three-layer sources and exports their intermediate quantities with the Top1 fallback', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-12');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n甲,A,产品甲,汤圆,系列,组,,\n乙,B,产品乙,汤圆,系列,组,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,甲,A,产品甲,汤圆,系列,组,30,30\n2026-12,乙,B,产品乙,汤圆,系列,组,70,70',
  );
  await upload(
    frame,
    '设置上一财年发货夹具',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,数量\n2025-12,甲,A,产品甲,汤圆,系列,组,60\n2025-12,乙,B,产品乙,汤圆,系列,组,40',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await view.getByLabel('月份筛选', { exact: true }).selectOption('2026-12');
  const layers = view.getByRole('table', { name: '两路三层占比', exact: true });
  await expect(layers).toContainText('30.00%');
  await expect(layers).toContainText('60.00%');
  await expect(
    view.getByRole('button', { name: '甲 A 2026-12 系统占比 计算过程', exact: true }),
  ).toHaveText('45.00%');
  await view.getByRole('button', { name: '甲 A 2026-12 提报三层占比明细', exact: true }).click();
  await expect(frame.getByRole('dialog')).toContainText('100 ÷ 100 = 1');
  await expect(frame.getByRole('dialog')).toContainText('30 ÷ 100 = 0.3');
  await frame.getByRole('dialog').getByRole('button', { name: '关闭弹窗', exact: true }).click();
  const csv = await download(page, view, '下载需求拆分');
  assert.match(csv, /提报物料组数量/);
  assert.match(csv, /历史范围内SKU数量/);
  assert.match(csv, /Top1托底/);
});

test('MPS report and CSV retain the annual SKU domain while incomplete production dependencies stay unknown', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-12');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,郑州,A,产品甲,汤圆,系列,组,100,100',
  );
  await upload(
    frame,
    '设置上一财年发货夹具',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,数量\n2025-12,郑州,A,产品甲,汤圆,系列,组,100',
  );
  for (const month of ['2026-12', '2027-01', '2027-02']) {
    await frame.getByRole('button', { name: `调整 汤圆 ${month}`, exact: true }).click();
    const form = frame.getByRole('group', { name: '大类需求调整', exact: true });
    await form.getByLabel('调整需求数量', { exact: true }).fill('100');
    await form.getByLabel('调整原因', { exact: true }).fill('核对缺月域汇总');
    await form.getByRole('button', { name: '应用大类调整', exact: true }).click();
  }
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await upload(
    frame,
    '选择发货输入CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库\n2026-11,郑州,A,产品甲,汤圆,系列,组,0,0,0,0,0,0,0',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  const constraints = frame.getByRole('region', { name: '约束与配置', exact: true });
  await constraints.getByLabel('郑州 安全天数', { exact: true }).fill('0');
  await constraints.getByLabel('郑州 A 件吨系数', { exact: true }).fill('1');
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  const report = frame.getByRole('region', { name: '产销存报告', exact: true });
  const summary = report
    .getByRole('table', { name: '评估范围与汇总', exact: true })
    .locator('tbody tr');
  await expect(summary.locator('td').nth(1)).toHaveText('100');
  await expect(summary.locator('td').nth(2)).toHaveText('—');
  await expect(summary.locator('td').nth(4)).toHaveText('3');
  await expect(summary).not.toContainText('缺月度SKU域');
  await expect(summary).toContainText('缺明确SKU件吨系数或所需生产');
  const csv = await download(page, report, '下载产销存报告');
  const book = XLSX.read(csv, { type: 'string', raw: true });
  const exported = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
  const total = exported.find((row) => row['粒度'] === '全版本汇总，无约束参考');
  assert.equal(total['已知生产吨数小计'], '100');
  assert.equal(total['完整生产吨数'], '');
  assert.equal(total['总行数'], '3');
  assert.doesNotMatch(total['未评估原因'], /缺月度SKU域/);
  assert.match(total['未评估原因'], /缺明确SKU件吨系数或所需生产/);
});

test('MPS effective category and share edits drive the same unconstrained inventory and shared-resource report export', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-12');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,\n郑州,B,产品乙,汤圆,系列,组,,',
  );
  const sourceRows = (months, report) =>
    months
      .flatMap((month) =>
        [
          ['A', 60],
          ['B', 40],
        ].map(
          ([code, quantity]) =>
            `${month},郑州,${code},产品${code},汤圆,系列,组,${quantity}${report ? ',' + quantity : ''}`,
        ),
      )
      .join('\n');
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n' +
      sourceRows(['2026-12', '2027-01', '2027-02'], true),
  );
  await upload(
    frame,
    '设置上一财年发货夹具',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,数量\n' +
      sourceRows(['2025-12', '2026-01', '2026-02'], false),
  );
  for (const [month, quantity] of [
    ['2026-12', 100],
    ['2027-01', 200],
    ['2027-02', 300],
    ['2027-03', 400],
  ]) {
    await frame.getByRole('button', { name: `调整 汤圆 ${month}`, exact: true }).click();
    const form = frame.getByRole('group', { name: '大类需求调整', exact: true });
    await form.getByLabel('调整需求数量', { exact: true }).fill(String(quantity));
    await form.getByLabel('调整原因', { exact: true }).fill('公开页面计算验收');
    await form.getByRole('button', { name: '应用大类调整', exact: true }).click();
  }
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const processing = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await processing.getByRole('button', { name: '郑州 B 2026-12 调整占比', exact: true }).click();
  await processing.getByLabel('郑州 B 2026-12 最终占比', { exact: true }).fill('0.25');
  await processing.getByLabel('郑州 B 2026-12 调整原因', { exact: true }).fill('单品业务需求调整');
  await processing.getByRole('button', { name: '应用占比', exact: true }).click();
  await expect(
    processing.getByRole('button', { name: '郑州 A 2026-12 有效占比 计算过程', exact: true }),
  ).toHaveText('75.00%');
  await expect(
    processing.getByRole('button', { name: '郑州 B 2026-12 系统占比 计算过程', exact: true }),
  ).toHaveText('40.00%');
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await upload(
    frame,
    '选择发货输入CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库\n2026-11,郑州,A,产品甲,汤圆,系列,组,0,0,0,0,0,0,0\n2026-11,郑州,B,产品乙,汤圆,系列,组,0,0,0,0,0,0,0',
  );
  await frame.getByRole('button', { name: '展开 郑州', exact: true }).click();
  const shipmentEstimate = frame.getByLabel('郑州 A 整月预估发货', { exact: true });
  await shipmentEstimate.fill('5');
  await shipmentEstimate.press('Enter');
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  const constraints = frame.getByRole('region', { name: '约束与配置', exact: true });
  await constraints.getByLabel('郑州 安全天数', { exact: true }).fill('31');
  for (const month of ['2026-12', '2027-01', '2027-02'])
    await constraints.getByRole('button', { name: `郑州 ${month} 采用25天`, exact: true }).click();
  await constraints.getByLabel('郑州 A 件吨系数', { exact: true }).fill('0.01');
  await constraints.getByLabel('郑州 B 件吨系数', { exact: true }).fill('0.02');
  for (const [index, id, kind, tons] of [
    [1, 'T', 'tunnel', '0.1'],
    [2, 'F', 'forming', '1'],
  ]) {
    await constraints.getByRole('button', { name: '新增产能资源', exact: true }).click();
    await constraints.getByLabel(`资源${index} 唯一编号`, { exact: true }).fill(id);
    await constraints.getByLabel(`资源${index} 基地`, { exact: true }).fill('郑州');
    await constraints.getByLabel(`资源${index} 类型`, { exact: true }).selectOption(kind);
    await constraints
      .getByLabel(`资源${index} 名称`, { exact: true })
      .fill(id === 'T' ? '共享隧道' : '共享成型机');
    await constraints.getByLabel(`资源${index} 日产吨数`, { exact: true }).fill(tons);
  }
  let index = 0;
  for (const code of ['A', 'B'])
    for (const resource of ['T', 'F']) {
      index++;
      await constraints.getByRole('button', { name: '新增资源分配', exact: true }).click();
      await constraints.getByLabel(`分配${index} 基地`, { exact: true }).fill('郑州');
      await constraints.getByLabel(`分配${index} 产品编码`, { exact: true }).fill(code);
      await constraints.getByLabel(`分配${index} 资源`, { exact: true }).selectOption(resource);
      await constraints.getByLabel(`分配${index} 分配比例`, { exact: true }).fill('1');
    }
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估与缺口' }).click();
  const capacity = frame.getByRole('region', { name: '产能评估与缺口', exact: true });
  for (const [field, value] of [
    ['需求数量', '75'],
    ['期初库存', '-5'],
    ['目标库存', '120'],
    ['所需生产量', '200'],
    ['无约束期末库存', '120'],
    ['所需生产吨数', '2'],
  ]) {
    await expect(
      capacity.getByRole('button', { name: `郑州 A 2026-12 ${field} 计算过程`, exact: true }),
    ).toHaveText(value);
  }
  await expect(capacity.getByRole('table', { name: '资源负荷', exact: true })).toContainText(
    '164.00%',
  );
  await expect(capacity.getByRole('table', { name: '资源负荷', exact: true })).toContainText(
    '超载，高于105%',
  );
  const tunnelRow = capacity
    .getByRole('table', { name: '资源负荷', exact: true })
    .locator('tbody tr')
    .first();
  await expect(tunnelRow.locator('td').nth(10)).toHaveText('16');
  await expect(tunnelRow.locator('td').nth(11)).toHaveText('1.6');
  const capacityCsv = await download(page, capacity, '下载产能评估');
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  const report = frame.getByRole('region', { name: '产销存报告', exact: true });
  const reportCsv = await download(page, report, '下载产销存报告');
  assert.equal(reportCsv, capacityCsv);
  if (process.env.MPS_WORKFLOW_SCREENSHOT_DIR) {
    await report
      .getByRole('region', { name: '资源负荷与缺口', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${process.env.MPS_WORKFLOW_SCREENSHOT_DIR}/U1-report-numeric-desktop.png`,
      fullPage: true,
    });
  }
  const book = XLSX.read(reportCsv, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  const a = rows.find(
    (row) =>
      row['粒度'] === '无约束产销存参考' && row['月份'] === '2026-12' && row['产品编码'] === 'A',
  );
  assert.equal(Number(a['所需生产量']), 200);
  const tunnel = rows.find(
    (row) =>
      row['粒度'] === '资源负荷与缺口' && row['月份'] === '2026-12' && row['资源编号'] === 'T',
  );
  assert.ok(Math.abs(Number(tunnel['资源负荷']) - 1.64) < 1e-12);
  assert.ok(Math.abs(Number(tunnel['缺口吨数']) - 1.6) < 1e-12);
  assert.ok(Math.abs(Number(tunnel['超载天数']) - 16) < 1e-12);
  assert.equal(
    rows.filter((row) => row['粒度'] === '无约束产销存参考' && row['月份'] === '2027-03').length,
    0,
  );
});

test('MPS share undo preserves group balance and stale overrides remain removable after the product scope changes', async (t) => {
  const { frame } = await workflowPage(t);
  await version(frame, '2026-12');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,\n郑州,B,产品乙,汤圆,系列,组,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,郑州,A,产品甲,汤圆,系列,组,60,60\n2026-12,郑州,B,产品乙,汤圆,系列,组,40,40',
  );
  await upload(
    frame,
    '设置上一财年发货夹具',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,数量\n2025-12,郑州,A,产品甲,汤圆,系列,组,60\n2025-12,郑州,B,产品乙,汤圆,系列,组,40',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  const adjust = async (code, share) => {
    await view.getByRole('button', { name: `郑州 ${code} 2026-12 调整占比`, exact: true }).click();
    await view.getByLabel(`郑州 ${code} 2026-12 最终占比`, { exact: true }).fill(share);
    await view.getByLabel(`郑州 ${code} 2026-12 调整原因`, { exact: true }).fill('组内占比核对');
    await view.getByRole('button', { name: '应用占比', exact: true }).click();
  };
  await adjust('B', '0.25');
  await adjust('A', '0.75');
  await view.getByRole('button', { name: '郑州 B 2026-12 撤销占比调整', exact: true }).click();
  await expect(view.getByRole('alert')).toContainText('请先撤销关联调整');
  await expect(
    view.getByRole('button', { name: '郑州 B 2026-12 有效占比 计算过程', exact: true }),
  ).toHaveText('25.00%');
  await view.getByRole('button', { name: '郑州 A 2026-12 撤销占比调整', exact: true }).click();
  await view.getByRole('button', { name: '郑州 B 2026-12 撤销占比调整', exact: true }).click();
  await expect(
    view.getByRole('button', { name: '郑州 B 2026-12 有效占比 计算过程', exact: true }),
  ).toHaveText('40.00%');
  await adjust('B', '0.25');
  await adjust('A', '0.75');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,C,产品丙,汤圆,系列,组,,',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const active = view.getByRole('table', { name: '当前占比调整', exact: true });
  await expect(active).toContainText('不在当前产品范围，未生效');
  await view.getByRole('button', { name: '撤销当前占比调整 郑州 B 2026-12', exact: true }).click();
  await expect(
    view.getByRole('button', { name: '撤销当前占比调整 郑州 B 2026-12', exact: true }),
  ).toHaveCount(0);
  await view.getByRole('button', { name: '撤销当前占比调整 郑州 A 2026-12', exact: true }).click();
  await expect(active).toContainText('暂无记录');
});

test('MPS accepted share undo audits its recomputed effective value separately from the captured system value', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-12');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,\n华东,A,产品甲,汤圆,系列,组,,\n郑州,B,产品乙,汤圆,系列,组,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,郑州,A,产品甲,汤圆,系列,组,30,30\n2026-12,华东,A,产品甲,汤圆,系列,组,30,30\n2026-12,郑州,B,产品乙,汤圆,系列,组,40,40',
  );
  await upload(
    frame,
    '设置上一财年发货夹具',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,数量\n2025-12,郑州,A,产品甲,汤圆,系列,组,30\n2025-12,华东,A,产品甲,汤圆,系列,组,30\n2025-12,郑州,B,产品乙,汤圆,系列,组,40',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  for (const [code, share] of [
    ['B', '0.2'],
    ['A', '0.3'],
  ]) {
    await view.getByRole('button', { name: `郑州 ${code} 2026-12 调整占比`, exact: true }).click();
    await view.getByLabel(`郑州 ${code} 2026-12 最终占比`, { exact: true }).fill(share);
    await view.getByLabel(`郑州 ${code} 2026-12 调整原因`, { exact: true }).fill('已确认组内调整');
    await view.getByRole('button', { name: '应用占比', exact: true }).click();
  }
  await expect(
    view.getByRole('button', { name: '华东 A 2026-12 有效占比 计算过程', exact: true }),
  ).toHaveText('50.00%');
  await view.getByRole('button', { name: '郑州 A 2026-12 撤销占比调整', exact: true }).click();
  await expect(
    view.getByRole('button', { name: '郑州 A 2026-12 有效占比 计算过程', exact: true }),
  ).toHaveText('40.00%');
  const undo = view
    .getByRole('table', { name: '占比调整记录', exact: true })
    .locator('tbody tr')
    .last();
  await expect(undo.locator('td').nth(1)).toHaveText('撤销');
  await expect(undo.locator('td').nth(2)).toHaveText('0.3');
  await expect(undo.locator('td').nth(3)).toHaveText('0.4');
  await page.locator('iframe').evaluate((element) => element.setAttribute('src', element.src));
  await expect(undo.locator('td').nth(3)).toHaveText('0.4');
  const entry = await page.evaluate(() => {
    const state = window.readView().localDrafts;
    return state.drafts.find((draft) => draft.id === state.selected).adjustments.history.at(-1);
  });
  assert.equal(entry.systemValue, 0.3);
  assert.equal(entry.value, 0.4);
});

test('MPS category undo audits the current inherited quantity after an upstream adjustment changes', async (t) => {
  const { page, frame } = await mpsPage(t, config, (query) => {
    if (!query.queryId.startsWith('annual-pool.')) return emptySource(query);
    return {
      rows: query.queryId.endsWith('.count')
        ? [{ total: 2 }]
        : [
            {
              belong_base: '全国',
              sub_category: '汤圆',
              stat_month: '2026-11',
              source_rows: 1,
              missing_qty: 0,
              duplicate_rows: 0,
              demand_qty: 100,
              update_time: null,
            },
            {
              belong_base: '全国',
              sub_category: '汤圆',
              stat_month: '2026-12',
              source_rows: 1,
              missing_qty: 0,
              duplicate_rows: 0,
              demand_qty: 150,
              update_time: null,
            },
          ],
      returnedColumns: query.queryId.endsWith('.count')
        ? ['total']
        : config.queries[query.queryId].columns,
      rejectedColumns: [],
      configVersion: 'audit-fixture-v1',
    };
  });
  await version(frame, '2026-10');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,',
  );
  await frame.getByRole('button', { name: '读取三年同比源值', exact: true }).click();
  await expect(frame.getByRole('button', { name: '读取三年同比源值', exact: true })).toBeEnabled();
  const adjust = async (month, quantity) => {
    await frame.getByRole('button', { name: `调整 汤圆 ${month}`, exact: true }).click();
    const form = frame.getByRole('group', { name: '大类需求调整' });
    await form.getByLabel('调整需求数量').fill(quantity);
    await form.getByLabel('调整原因').fill('已确认月需求');
    await form.getByRole('button', { name: '应用大类调整', exact: true }).click();
  };
  await adjust('2026-11', '200');
  await adjust('2026-12', '350');
  await adjust('2026-11', '400');
  await frame.getByRole('button', { name: '撤销 汤圆 2026-12', exact: true }).click();
  const row = frame
    .getByRole('region', { name: '逐月测算', exact: true })
    .locator('details')
    .getByRole('row')
    .filter({ hasText: '2026-12（M+3）' })
    .filter({ hasText: '汤圆' });
  await expect(row.locator('td').nth(3)).toHaveText('600');
  const audit = frame
    .getByRole('region', { name: '大类调整记录', exact: true })
    .locator('tbody tr')
    .last();
  await expect(audit.locator('td').nth(3)).toHaveText('600');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = window.readView().localDrafts;
        return state.drafts.find((draft) => draft.id === state.selected).adjustments.history.at(-1)
          .value;
      }),
    )
    .toBe(600);
  const entry = await page.evaluate(() => {
    const state = window.readView().localDrafts;
    return state.drafts.find((draft) => draft.id === state.selected).adjustments.history.at(-1);
  });
  assert.equal(entry.systemValue, null);
  assert.equal(entry.value, 600);
});
