import { expectWorkflowExportValue, workflowExportRows } from './helpers/mps-workflow-export.mjs';
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
async function workflowExportRowsForTarget(page, view) {
  const csv = await download(page, view, '下载目标库存明细');
  const book = XLSX.read(csv, { type: 'string', raw: true });
  return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
}

async function seedShare(frame, code, share) {
  const rows = await workflowExportRows(frame);
  const row = rows.find(
    (row) => row['月份'] === '2026-12' && row['基地'] === '郑州' && row['产品编码'] === code,
  );
  const page = frame.locator('body').page();
  await page.evaluate(
    async ({ code, share, group, systemValue }) => {
      const seed = window.readView();
      const state = seed.localDrafts;
      const draft = state.drafts.find((draft) => draft.id === state.selected);
      const rowId = JSON.stringify(['2026-12', '郑州', group, code]);
      draft.adjustments.shares = [
        ...draft.adjustments.shares.filter((row) => row.rowId !== rowId),
        {
          rowId,
          share: Number(share),
          systemValue,
          reason: '历史版本占比调整',
          at: new Date().toISOString(),
        },
      ];
      await window.openAuthor('mps', 1200, seed);
    },
    { code, share, group: row['物料组'], systemValue: Number(row['系统占比']) },
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await expect(frame.getByText('全年历史读取中…')).toHaveCount(0);
}

async function version(frame, month) {
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await dialog.getByLabel('评估月份', { exact: true }).fill(month);
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
}

test('春节跨月扣减显示在生产日历和年度矩阵，人工覆盖可恢复默认', async (t) => {
  const { frame } = await workflowPage(t);
  await version(frame, '2025-01');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  const view = frame.getByRole('region', { name: '约束与配置', exact: true });
  await view.locator('summary').filter({ hasText: '高级配置：' }).click();
  await expect(view.getByLabel('郑州 2025-01 生产天数', { exact: true })).toHaveValue('18');
  await expect(view.getByLabel('郑州 2025-02 生产天数', { exact: true })).toHaveValue('22');
  await expect(view.getByLabel('郑州 2025-03 生产天数', { exact: true })).toHaveValue('25');
  await view.getByLabel('郑州 2025-01 生产天数', { exact: true }).fill('15');
  await expect(view.getByLabel('郑州 2025-01 生产天数', { exact: true })).toHaveValue('15');
  await view.getByRole('button', { name: '郑州 2025-01 恢复默认生产天数', exact: true }).click();
  await expect(view.getByLabel('郑州 2025-01 生产天数', { exact: true })).toHaveValue('18');
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估与缺口' }).click();
  await frame.getByRole('button', { name: '执行评估', exact: true }).click();
  const matrix = frame.getByRole('table', { name: '全年月度负荷率矩阵', exact: true });
  await expect(
    matrix.getByRole('columnheader', { name: '2025-01 春节扣7天', exact: true }),
  ).toBeVisible();
  await expect(
    matrix.getByRole('columnheader', { name: '2025-02 春节扣3天', exact: true }),
  ).toBeVisible();
  await expect(matrix.locator('th > .wf-capacity-holiday')).toHaveCount(2);
});

test('Tab3 expands base then category, group and SKU with base-scoped totals and explanations', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-12');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n,A,产品甲,汤圆,系列,组,,\n,B,产品乙,汤圆,系列,组,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,郑州,A,产品甲,汤圆,系列,组,60,60\n2026-12,郑州,B,产品乙,汤圆,系列,组,20,20\n2026-12,华东,A,产品甲,汤圆,系列,组,40,40\n2026-12,华东,B,产品乙,汤圆,系列,组,80,80',
  );
  await upload(
    frame,
    '设置上一财年发货夹具',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,数量\n2025-12,郑州,A,产品甲,汤圆,系列,组,60\n2025-12,郑州,B,产品乙,汤圆,系列,组,20\n2025-12,华东,A,产品甲,汤圆,系列,组,40\n2025-12,华东,B,产品乙,汤圆,系列,组,80',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await view.getByRole('button', { name: '调整数量 汤圆 2026-12', exact: true }).click();
  const editor = view.getByRole('group', { name: '分层需求数量调整' });
  await editor.getByLabel('有效需求数量').fill('200');
  await editor.getByLabel('数量调整原因').fill('基地层级核对');
  await editor.getByRole('button', { name: '应用数量调整', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const detail = view.getByRole('table', { name: '加工后的需求明细', exact: true });
  await expect(
    detail.getByRole('columnheader', { name: '基地 / 大类 / 物料组 / SKU', exact: true }),
  ).toBeVisible();
  await expect(detail.locator('tbody tr')).toHaveCount(2);
  const zhengzhou = detail
    .getByRole('row')
    .filter({ has: frame.getByRole('button', { name: '基地 · 郑州', exact: true }) });
  await expect(zhengzhou.getByRole('cell').first()).toHaveText('80');
  await detail.getByRole('button', { name: '基地 · 郑州', exact: true }).click();
  await detail.getByRole('button', { name: '郑州 大类 · 汤圆', exact: true }).click();
  await detail.getByRole('button', { name: '郑州 物料组 · 组', exact: true }).click();
  await expect(detail.getByText('SKU · A 产品甲', { exact: true })).toHaveCount(1);
  await expect(detail.getByText('SKU · B 产品乙', { exact: true })).toHaveCount(1);
  await expect(
    detail.getByRole('button', { name: '运算过程 华东 A 2026-12', exact: true }),
  ).toHaveCount(0);
  await detail.getByRole('button', { name: '运算过程 郑州 A 2026-12', exact: true }).click();
  await expect(frame.getByRole('dialog')).toContainText('结果：60');
  await frame.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await detail
    .getByRole('button', { name: '调整数量 汤圆 组 A 郑州 2026-12', exact: true })
    .click();
  await editor.getByLabel('有效需求数量').fill('50');
  await editor.getByLabel('数量调整原因').fill('基地单品调整核对');
  await editor.getByRole('button', { name: '应用数量调整', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const adjusted = XLSX.utils.sheet_to_json(
    XLSX.read(await download(page, view, '下载需求拆分'), { type: 'string', raw: true }).Sheets[
      'Sheet1'
    ],
  );
  for (const base of ['郑州', '华东'])
    assert.equal(
      adjusted.find(
        (row) => row['月份'] === '2026-12' && row['基地'] === base && row['产品编码'] === 'A',
      )['需求数量'],
      '50',
    );
  await detail
    .getByRole('button', { name: '撤销数量 汤圆 组 A 郑州 2026-12', exact: true })
    .click();
  await detail.getByRole('button', { name: '基地 · 郑州', exact: true }).click();
  await detail.getByRole('button', { name: '基地 · 华东', exact: true }).click();
  await detail.getByRole('button', { name: '华东 大类 · 汤圆', exact: true }).click();
  await detail.getByRole('button', { name: '华东 物料组 · 组', exact: true }).click();
  const product = detail.getByRole('row').filter({ hasText: 'SKU · A 产品甲' });
  await expect(product.getByRole('cell').first()).toHaveText('40');
  const csv = await download(page, view, '下载需求拆分');
  const book = XLSX.read(csv, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  for (const [base, code, quantity] of [
    ['郑州', 'A', '60'],
    ['郑州', 'B', '20'],
    ['华东', 'A', '40'],
    ['华东', 'B', '80'],
  ]) {
    assert.equal(
      rows.find(
        (row) => row['月份'] === '2026-12' && row['基地'] === base && row['产品编码'] === code,
      )['需求数量'],
      quantity,
    );
  }
});
async function download(page, view, name) {
  const waiting = page.waitForEvent('download');
  await view.getByRole('button', { name, exact: true }).click();
  const chunks = [];
  for await (const chunk of await (await waiting).createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

test('MPS complete split export retains the same shipment subtotal and completeness as the category summary', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-10');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,\n郑州,B,产品乙,汤圆,系列,组,,',
  );
  await upload(
    frame,
    '选择模型预测CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,数量\n2026-10,郑州,A,产品甲,汤圆,系列,组,10\n2026-11,郑州,A,产品甲,汤圆,系列,组,20',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  const shipmentHeader =
    '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库\n';
  const known = '2026-09,郑州,A,产品甲,汤圆,系列,组,220,10,10,10,100,200,80\n';
  await upload(
    frame,
    '选择发货输入CSV',
    shipmentHeader + known + '2026-09,郑州,B,产品乙,汤圆,系列,组,110,,10,10,,20,8',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  const summary = view.getByRole('table', { name: '大类需求总表', exact: true });
  await expect(summary.locator('tbody tr td').nth(1)).toHaveText('300（已知小计）');
  const readExport = async () => {
    const csv = await download(page, view, '下载需求拆分');
    const book = XLSX.read(csv, { type: 'string', raw: true });
    return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  };
  const partial = await readExport();
  for (const month of ['2026-10', '2026-11']) {
    const category = partial.find((row) => row['粒度'] === '大类' && row['月份'] === month);
    assert.equal(category['本月预估发货'], undefined);
    assert.equal(category['本月预估发货已知小计'], '300');
    assert.equal(category['本月预估发货完整性'], '已知小计');
    assert.equal(category['本月预估发货缺项数'], '1');
    assert.equal(category['模型预测数量'], month === '2026-10' ? '10' : '20');
  }
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await upload(
    frame,
    '选择发货输入CSV',
    shipmentHeader + known + '2026-09,郑州,B,产品乙,汤圆,系列,组,0,0,0,0,0,0,0',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await expect(summary.locator('tbody tr td').nth(1)).toHaveText('300');
  const complete = (await readExport()).find(
    (row) => row['粒度'] === '大类' && row['月份'] === '2026-10',
  );
  assert.equal(complete['本月预估发货'], '300');
  assert.equal(complete['本月预估发货已知小计'], '300');
  assert.equal(complete['本月预估发货完整性'], '完整');
  assert.equal(complete['本月预估发货缺项数'], '0');
});

test('MPS basic inputs finish while navigating through shipment to processing and are reused on return', async (t) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  t.after(() => release());
  let started = false;
  let countCalls = 0;
  const { frame } = await mpsPage(t, config, async (query) => {
    if (query.queryId === 'facts.plan-quantity.count' && query.parameters.month === '2027-01-01') {
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
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
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
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await expectWorkflowExportValue(frame, '郑州 A 2026-10 期初库存 计算过程', '80');
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
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await expect(view).toBeVisible();
  await expect(view).toContainText('2026-10');
  await expect(view.getByRole('table', { name: '大类需求总表', exact: true })).toBeVisible();
  for (const category of ['饺子', '调理肉制品', '饼类'])
    await expect(view.getByRole('table', { name: '大类需求总表', exact: true })).not.toContainText(
      category,
    );
  await expect(view.getByRole('table', { name: '加工后的需求明细', exact: true })).toBeVisible();
  await expect(view).toContainText('未评估');
  const csv = await download(page, view, '下载需求拆分');
  assert.match(csv, /2026-10/);
  assert.match(csv, /未评估|缺|待确认/);
  assert.doesNotMatch(csv, /40%|40\/40\/20|模拟/);
});

test('MPS processing includes every current product category in its summary, filters and complete export', async (t) => {
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
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  const csv = await download(page, view, '下载需求拆分');
  for (const category of ['饺子', '调理肉制品', '饼类']) {
    await expect(view.getByRole('table', { name: '大类需求总表', exact: true })).toContainText(
      category,
    );
    await expect(
      view.getByLabel('大类筛选').getByRole('option', { name: category, exact: true }),
    ).toHaveCount(1);
    assert.equal(csv.includes(category), true);
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
  await frame
    .getByLabel(label, { exact: true })
    .setInputFiles({ name: '本地核对.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
}

test('MPS 评估月提报与完整财年形成固定系数，后月提报不改本轮且池外分类单列', async (t) => {
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
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await view.getByLabel('月份筛选', { exact: true }).selectOption('2026-12');
  await expectWorkflowExportValue(frame, '甲 A 2026-12 系统占比 计算过程', '100.00%');
  assert.equal(
    (await workflowExportRows(frame)).filter((row) => row['产品编码'] && row['月份'] === '2026-12')
      .length,
    2,
  );
  const december = await download(page, view, '下载需求拆分');
  assert.match(december, /产品甲/);
  assert.match(december, /产品乙/);
  await expectWorkflowExportValue(frame, '乙 B 2026-12 提报数量 计算过程', '0');
  await view.getByLabel('月份筛选', { exact: true }).selectOption('2027-01');
  await expectWorkflowExportValue(frame, '乙 B 2027-01 系统占比 计算过程', '100.00%');
  await expectWorkflowExportValue(frame, '甲 A 2027-01 系统占比 计算过程', '100.00%');
  assert.equal(
    (await workflowExportRows(frame)).filter((row) => row['产品编码'] && row['月份'] === '2027-01')
      .length,
    2,
  );
});

test('MPS constraints retain prototype rule management, collapse advanced inputs and isolate versions', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-10');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列甲,组甲,,',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  const view = frame.getByRole('region', { name: '约束与配置', exact: true });
  await expect(view.getByRole('table', { name: '约束列表', exact: true })).toBeVisible();
  await expect(view.getByRole('region', { name: '冲突与放宽建议', exact: true })).toHaveCount(0);
  await expect(view.getByLabel('郑州 A 件吨系数', { exact: true })).toHaveCount(0);
  await view.getByLabel('郑州 安全天数', { exact: true }).fill('0');
  await view.getByRole('button', { name: '新增约束', exact: true }).click();
  const editor = frame.getByRole('dialog', { name: '新增约束', exact: true });
  await editor.getByLabel('约束内容', { exact: true }).fill('最低库存核对');
  await editor.getByLabel('作用基地', { exact: true }).selectOption('郑州');
  await editor.getByLabel('规则参数', { exact: true }).fill('12');
  await editor.getByLabel('生效至（留空为长期）', { exact: true }).fill('2026-10');
  await editor.getByRole('button', { name: '保存约束', exact: true }).click();
  await expect(view.getByRole('table', { name: '约束列表', exact: true })).toContainText(
    '最低库存核对',
  );
  await expect(view.getByRole('table', { name: '规则计算结果', exact: true })).toContainText(
    '待补计算输入',
  );
  await version(frame, '2026-11');
  await expect(view.getByRole('table', { name: '约束列表', exact: true })).not.toContainText(
    '最低库存核对',
  );
  await frame.getByLabel('评估版本选择').selectOption('local-2');
  await expect(view.getByRole('table', { name: '约束列表', exact: true })).toContainText(
    '最低库存核对',
  );
  await view.getByRole('button', { name: '停用约束1', exact: true }).click();
  await expect(view.getByRole('table', { name: '约束列表', exact: true })).toContainText('已停用');
  const advanced = view.locator('summary').filter({ hasText: '高级配置：' });
  await advanced.click();
  const weight = view.getByLabel('郑州 A 件吨系数', { exact: true });
  await weight.fill('0.01');
  await advanced.click();
  await expect(weight).toHaveCount(0);
  await advanced.click();
  await expect(weight).toHaveValue('0.01');
  await expect(view.getByRole('button', { name: '保存正式配置', exact: true })).toBeDisabled();
  const csv = await download(page, view, '下载本地配置');
  assert.match(csv, /最低库存核对/);
  assert.match(csv, /2026-10/);
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
  for (const field of [
    '目标库存',
    '所需生产量',
    '参考期末库存',
    '所需生产吨数',
    '可执行主计划',
    '调拨',
  ])
    await expectWorkflowExportValue(frame, `郑州 A 2026-10 ${field} 计算过程`, '—');
  await capacity.getByLabel('月份筛选', { exact: true }).selectOption('2026-10');
  const capacityCsv = await download(page, capacity, '下载需求推导参考');
  assert.match(capacityCsv, /'=1\+1/);
  const book = XLSX.read(capacityCsv, { type: 'string', raw: true });
  const exportedRows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  assert.ok(exportedRows.every((row) => !row['月份'] || row['月份'] === '2026-10'));
  await capacity.getByRole('button', { name: '下一步：产销存报告', exact: true }).click();
  const report = frame.getByRole('region', { name: '产销存报告', exact: true });
  await report.getByLabel('月份筛选', { exact: true }).selectOption('2026-10');
  const reportCsv = await download(page, report, '下载需求推导参考');
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
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await expectWorkflowExportValue(frame, '郑州 A 2026-10 提报数量 计算过程', '13');
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
  await view.locator('summary').filter({ hasText: '高级配置：' }).click();
  await expect(view).toContainText('源缺项保留');
  await expect(view.getByLabel('郑州 2026-12 生产天数', { exact: true })).toHaveValue('25');
  await view.getByLabel('郑州 2026-12 生产天数', { exact: true }).fill('15');
  await view.getByRole('button', { name: '郑州 2026-12 恢复默认生产天数', exact: true }).click();
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
  await expect(capacity.getByText('需求与库存参考底稿（非排产结果）', { exact: true })).toHaveCount(
    0,
  );
  await expect(capacity.getByRole('button', { name: '执行评估', exact: true })).toBeEnabled();
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
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await view.getByLabel('月份筛选', { exact: true }).selectOption('2026-12');
  await expectWorkflowExportValue(frame, '甲 A 2026-12 系统占比 计算过程', '45.00%');
  const csv = await download(page, view, '下载需求拆分');
  assert.match(csv, /提报物料组数量/);
  assert.match(csv, /历史范围内SKU数量/);
  assert.match(csv, /Top1托底/);
});

test('MPS report and CSV derive all three months from evaluation-month coefficients without later submissions', async (t) => {
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
  await constraints.locator('summary').filter({ hasText: '高级配置：' }).click();
  await constraints.getByLabel('郑州 安全天数', { exact: true }).fill('0');
  await constraints.getByLabel('郑州 A 件吨系数', { exact: true }).fill('1');
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  const report = frame.getByRole('region', { name: '产销存报告', exact: true });
  await expect(report.getByRole('button', { name: '导出产销存结果', exact: true })).toBeDisabled();
  const csv = await download(page, report, '下载需求推导参考');
  const book = XLSX.read(csv, { type: 'string', raw: true });
  const exported = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
  const total = exported.find((row) => row['粒度'] === '全版本汇总，需求推导参考');
  assert.equal(total['已知生产吨数小计'], '300');
  assert.equal(total['完整生产吨数'], '300');
  assert.equal(total['总行数'], '3');
  assert.doesNotMatch(total['未评估原因'], /缺月度SKU域/);
  assert.doesNotMatch(total['未评估原因'], /缺明确SKU件吨系数或所需生产/);
});

async function preparedPlan(t, partialHistory = false) {
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
      sourceRows(['2025-12', '2026-01', '2026-02'], false)
        .split('\n')
        .filter((line) => !partialHistory || !line.includes(',B,'))
        .join('\n'),
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
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  if (!partialHistory) {
    await seedShare(frame, 'B', '0.25');
    await expectWorkflowExportValue(frame, '郑州 A 2026-12 有效占比 计算过程', '75.00%');
    await expectWorkflowExportValue(frame, '郑州 B 2026-12 系统占比 计算过程', '40.00%');
  }
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
  await constraints.locator('summary').filter({ hasText: '高级配置：' }).click();
  await constraints.getByLabel('郑州 安全天数', { exact: true }).fill('31');
  await expect(constraints.getByLabel('郑州 2027-01 生产天数', { exact: true })).toHaveValue('25');
  await expect(constraints.getByLabel('郑州 2027-02 生产天数', { exact: true })).toHaveValue('15');
  await constraints.getByLabel('郑州 2027-01 生产天数', { exact: true }).fill('15');
  await constraints
    .getByRole('button', { name: '郑州 2027-01 恢复默认生产天数', exact: true })
    .click();
  await expect(constraints.getByLabel('郑州 2027-01 生产天数', { exact: true })).toHaveValue('25');
  await expect(constraints.getByLabel('郑州 2027-02 生产天数', { exact: true })).toHaveValue('15');
  for (const month of ['2026-12', '2027-01', '2027-02'])
    await constraints.getByLabel(`郑州 ${month} 生产天数`, { exact: true }).fill('25');
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
  return { page, frame, capacity, constraints };
}

test('MPS effective category and share edits drive the same unconstrained inventory and shared-resource report export', async (t) => {
  const { page, frame, capacity, constraints } = await preparedPlan(t);
  for (const [field, value] of [
    ['需求数量', '75'],
    ['期初库存', '-5'],
    ['目标库存', '120'],
    ['所需生产量', '200'],
    ['参考期末库存', '120'],
    ['所需生产吨数', '2'],
  ]) {
    await expectWorkflowExportValue(frame, `郑州 A 2026-12 ${field} 计算过程`, value);
  }
  const capacityCsv = await download(page, capacity, '下载需求推导参考');
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  const report = frame.getByRole('region', { name: '产销存报告', exact: true });
  const reportCsv = await download(page, report, '下载需求推导参考');
  assert.equal(reportCsv, capacityCsv);
  if (process.env.MPS_WORKFLOW_SCREENSHOT_DIR) {
    await report.locator('.wf-actions').first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${process.env.MPS_WORKFLOW_SCREENSHOT_DIR}/U1-report-numeric-desktop.png`,
      fullPage: true,
    });
  }
  const book = XLSX.read(reportCsv, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  const a = rows.find(
    (row) =>
      row['粒度'] === '需求推导产销存参考' && row['月份'] === '2026-12' && row['产品编码'] === 'A',
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
    rows.filter((row) => row['粒度'] === '需求推导产销存参考' && row['月份'] === '2027-03').length,
    0,
  );

  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估与缺口' }).click();
  await capacity.getByRole('button', { name: '执行评估', exact: true }).click();
  await expect(capacity.getByRole('button', { name: '导出求解结果', exact: true })).toBeEnabled();
  await capacity.locator('summary').filter({ hasText: '未覆盖缺口与公平分配' }).click();
  await expect(capacity.getByRole('table', { name: '求解缺口明细', exact: true })).toContainText(
    '60.98%',
  );
  const solvedCsv = await download(page, capacity, '导出求解结果');
  await expect(capacity.getByRole('table', { name: '基地大类RCCP', exact: true })).toContainText(
    '无归属需求',
  );
  await expect(capacity.getByRole('region', { name: '全年月度负荷率', exact: true })).toBeVisible();
  await expect(capacity.getByRole('region', { name: '缺口明细', exact: true })).toBeVisible();
  const rccpReport = capacity.getByRole('table', { name: '基地大类RCCP', exact: true });
  await expect(rccpReport.getByRole('columnheader')).toHaveCount(9);
  await rccpReport.getByRole('button', { name: '郑州 汤圆 系列明细', exact: true }).click();
  await expect(rccpReport.getByRole('table', { name: 'RCCP系列明细', exact: true })).toContainText(
    '产能配额',
  );
  await capacity.getByRole('button', { name: '口径与规则', exact: true }).click();
  await expect(frame.getByRole('dialog', { name: '口径与规则', exact: true })).toContainText(
    '超过105%为红色',
  );
  await frame
    .getByRole('dialog', { name: '口径与规则', exact: true })
    .getByRole('button', { name: '关闭弹窗', exact: true })
    .click();
  const physicalLines = capacity.getByRole('region', { name: '产线产能明细', exact: true });
  await physicalLines.locator('summary').first().click();
  await expect(
    physicalLines.getByRole('table', { name: '物理产线产能明细', exact: true }),
  ).toContainText('隧道吨位（规格）');
  const sourceProblems = capacity.getByRole('region', { name: '问题分类与补充清单', exact: true });
  await expect(sourceProblems).toContainText('下市品产生需求');
  await expect(sourceProblems).toContainText('缺产线产能');
  await expect(sourceProblems).toContainText('缺调拨关系');
  await expect(sourceProblems).toContainText('缺件吨系数');
  const issueDetail = sourceProblems.locator('details');
  await issueDetail.locator('summary').click();
  const detailBounds = await issueDetail.boundingBox();
  const cardBounds = await sourceProblems.boundingBox();
  assert.ok(detailBounds.width > cardBounds.width * 0.9);
  const classifiedCsv = await download(page, sourceProblems, '导出分类问题清单');
  assert.match(classifiedCsv, /问题分类,来源标签,标签所属月,需求数量,源表,字段/);
  const solvedBook = XLSX.read(solvedCsv, { type: 'string', raw: true });
  const solved = XLSX.utils.sheet_to_json(solvedBook.Sheets[solvedBook.SheetNames[0]]);
  const firstMonth = solved.filter((row) => row['月份'] === '2026-12');
  assert.equal(firstMonth.length, 2);
  const [planA, planB] = ['A', 'B'].map((code) =>
    firstMonth.find((row) => row['产品编码'] === code),
  );
  assert.ok(Math.abs(Number(planA['生产满足率']) - Number(planB['生产满足率'])) < 1e-8);
  assert.ok(Number(planA['实际主计划量']) * 0.01 + Number(planB['实际主计划量']) * 0.02 <= 2.5);
  assert.ok(Number(planA['实际主计划量']) < Number(a['所需生产量']));
  const secondA = solved.find((row) => row['月份'] === '2027-01' && row['产品编码'] === 'A');
  assert.equal(Number(secondA['期初库存']), Number(planA['实际期末库存']));
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  await expect(report.getByRole('button', { name: '执行评估', exact: true })).toHaveCount(0);
  await expect(report.getByRole('table', { name: '产销存汇总', exact: true })).toHaveCount(1);
  assert.ok(
    await report
      .locator('.wf-plan-month')
      .first()
      .evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft) >= 16),
  );
  assert.equal(await frame.locator('.ap-board-body').evaluate((element) => element.scrollTop), 0);
  const actualReportCsv = await download(page, report, '导出产销存结果');
  assert.equal(actualReportCsv, solvedCsv);
  assert.equal(
    await download(
      page,
      report.getByRole('region', { name: '问题分类与补充清单', exact: true }),
      '导出分类问题清单',
    ),
    classifiedCsv,
  );
  await report.getByLabel('月份筛选', { exact: true }).selectOption('2026-12');
  await report.getByRole('button', { name: '展开 2个单品', exact: true }).click();
  await report.getByLabel('单品明细大类', { exact: true }).selectOption('汤圆');
  await report.getByLabel('单品明细物料组', { exact: true }).selectOption('组');
  await expect(report.getByRole('table', { name: '求解单品明细', exact: true })).toContainText('A');
  const skuScroll = report.locator('.wf-plan-detail-row .wf-table-scroll');
  assert.equal(await skuScroll.evaluate((element) => getComputedStyle(element).maxHeight), 'none');
  const skuTable = await skuScroll.getByRole('table').boundingBox();
  const skuPager = await report.locator('.wf-plan-detail-row .dc-card-foot').boundingBox();
  assert.ok(skuPager.y >= skuTable.y + skuTable.height - 2);
  await report
    .getByRole('button', { name: '郑州 A 2026-12 实际主计划量 求解过程', exact: true })
    .click();
  await expect(frame.getByRole('dialog')).toContainText('共同满足率');
  await frame.getByRole('dialog').getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  await constraints.getByLabel('郑州 安全天数', { exact: true }).fill('10');
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  await expect(report).toContainText('输入已变化，需重新评估');
  await expect(report.getByRole('button', { name: '导出产销存结果', exact: true })).toBeDisabled();
});

test('部分需求缺失显示已知负荷，导出保留完整负荷为空和逐SKU缺项', async (t) => {
  const { page, capacity } = await preparedPlan(t, true);
  await capacity.getByRole('button', { name: '执行评估', exact: true }).click();
  await capacity.getByLabel('月份筛选', { exact: true }).selectOption('2026-12');
  const rccp = capacity.getByRole('table', { name: '基地大类RCCP', exact: true });
  await expect(rccp).toContainText('已知需求负荷');
  await expect(rccp).toContainText('完整负荷待补');
  await capacity.getByText('查看2026-12缺项明细 1项', { exact: true }).click();
  const issues = capacity.getByRole('table', { name: '需求与折吨缺项', exact: true });
  await expect(issues).toContainText('B 产品乙');
  await expect(issues).toContainText('缺历史拆分依据');
  const csv = await download(page, capacity, '导出需求与折吨缺项');
  const book = XLSX.read(csv, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['产品编码'], 'B');
  assert.equal(rows[0]['历史参考物料'], 'B');
  assert.match(rows[0]['来源'], /cust_deliv_daily_di/);
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
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  const adjust = async (code, share) => {
    await seedShare(frame, code, share);
  };
  await adjust('B', '0.25');
  await adjust('A', '0.75');
  await view.getByRole('button', { name: '撤销当前占比调整 郑州 B 2026-12', exact: true }).click();
  await expect(view.getByRole('alert')).toContainText('请先撤销关联调整');
  await expectWorkflowExportValue(frame, '郑州 B 2026-12 有效占比 计算过程', '25.00%');
  await view.getByRole('button', { name: '撤销当前占比调整 郑州 A 2026-12', exact: true }).click();
  await view.getByRole('button', { name: '撤销当前占比调整 郑州 B 2026-12', exact: true }).click();
  await expectWorkflowExportValue(frame, '郑州 B 2026-12 有效占比 计算过程', '40.00%');
  await adjust('B', '0.25');
  await adjust('A', '0.75');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,C,产品丙,汤圆,系列,组,,',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  const active = view.getByRole('table', { name: '当前占比调整', exact: true });
  await expect(active).toContainText('不在当前产品范围，未生效');
  await view.getByRole('button', { name: '撤销当前占比调整 郑州 B 2026-12', exact: true }).click();
  await expect(
    view.getByRole('button', { name: '撤销当前占比调整 郑州 B 2026-12', exact: true }),
  ).toHaveCount(0);
  await view.getByRole('button', { name: '撤销当前占比调整 郑州 A 2026-12', exact: true }).click();
  await expect(active).toHaveCount(0);
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
  await frame.getByText('来源诊断与缺项清单', { exact: true }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  for (const [code, share] of [
    ['B', '0.2'],
    ['A', '0.3'],
  ]) {
    await seedShare(frame, code, share);
  }
  await expectWorkflowExportValue(frame, '华东 A 2026-12 有效占比 计算过程', '50.00%');
  await view.getByRole('button', { name: '撤销当前占比调整 郑州 A 2026-12', exact: true }).click();
  await expectWorkflowExportValue(frame, '郑州 A 2026-12 有效占比 计算过程', '40.00%');
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
    .getByRole('region', { name: '大类预估需求数量', exact: true })
    .getByRole('row')
    .filter({ has: frame.getByRole('cell', { name: '汤圆', exact: true }) });
  await expect(row.locator('td').nth(3).locator('.dc-demand-amount')).toHaveText('600');
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

test('MPS business-rule evidence produces a real conflict, keeps preview reversible and saves structured fields', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-11');
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  const view = frame.getByRole('region', { name: '约束与配置', exact: true });
  await view.getByRole('button', { name: '新增约束', exact: true }).click();
  const editor = frame.getByRole('dialog', { name: '新增约束', exact: true });
  await editor.getByLabel('规则类型', { exact: true }).selectOption('cost-limit');
  await editor.getByLabel('约束内容', { exact: true }).fill('代工成本增幅不得超过8%');
  await editor.getByLabel('规则参数', { exact: true }).fill('8');
  await editor.getByLabel('2026-11 方案核对值', { exact: true }).fill('10');
  await editor.getByLabel('2026-11 核对来源', { exact: true }).fill('当前月方案成本同比核对');
  await editor.getByRole('button', { name: '保存约束', exact: true }).click();
  const result = view.getByRole('table', { name: '规则计算结果', exact: true });
  await expect(result.getByRole('row').filter({ hasText: '2026-11' })).toContainText('存在冲突');
  await expect(result).toContainText('10%，上限8%');
  await result.getByRole('button', { name: '预览放宽', exact: true }).click();
  const preview = frame.getByRole('dialog', { name: '放宽约束预览', exact: true });
  await preview.getByRole('button', { name: '保留原约束', exact: true }).click();
  await expect(result).toContainText('存在冲突');
  await expect
    .poll(async () => {
      const saved = await page.evaluate(() => window.readView());
      return saved?.localDrafts?.drafts?.find((row) => row.id === saved.localDrafts.selected)
        ?.constraints?.rules?.local?.[0]?.effect?.value;
    })
    .toBe(8);
  await view.getByRole('button', { name: '编辑约束1', exact: true }).click();
  const edit = frame.getByRole('dialog', { name: '编辑约束', exact: true });
  await edit.getByLabel('2026-11 方案核对值', { exact: true }).fill('7');
  await edit.getByRole('button', { name: '保存约束', exact: true }).click();
  await expect(result.getByRole('row').filter({ hasText: '2026-11' })).toContainText('满足约束');
  if (process.env.MPS_RULE_SCREENSHOTS === '1') {
    await view.locator('.wf-scope').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: '.scratch/tab5-implementation/rules-desktop.png',
      fullPage: true,
    });
    await page.evaluate(() => {
      document.getElementById('root').style.width = '1120px';
    });
    await page.screenshot({
      path: '.scratch/tab5-implementation/rules-narrow.png',
      fullPage: true,
    });
  }
});

test('MPS Tab5 reuses a base policy across three months while SKU inventory versions stay diagnostic', async (t) => {
  let failure = false;
  const annualState = { rows: [] };
  const facts = [
    {
      target_month: '2026-12',
      belong_base: '郑州',
      material_code: 'A',
      inventory_version: '纠偏',
      final_target_inventory: 120,
      avg_daily_planned_demand: 10,
      source_rows: 12,
    },
    {
      target_month: '2026-12',
      belong_base: '郑州',
      material_code: 'A',
      inventory_version: '月初',
      final_target_inventory: 500,
      avg_daily_planned_demand: 10,
      source_rows: 1,
    },
    {
      target_month: '2026-12',
      belong_base: '郑州',
      material_code: 'B',
      inventory_version: '月初',
      final_target_inventory: 300,
      avg_daily_planned_demand: 10,
      source_rows: 1,
    },
    {
      target_month: '2027-01',
      belong_base: '郑州',
      material_code: 'A',
      inventory_version: '滚动',
      final_target_inventory: 220,
      avg_daily_planned_demand: 10,
      source_rows: 1,
    },
    {
      target_month: '2027-02',
      belong_base: '郑州',
      material_code: 'A',
      inventory_version: '滚动',
      final_target_inventory: 50,
      avg_daily_planned_demand: 0,
      source_rows: 1,
    },
  ].map((row) => ({
    final_target_turnover_days: null,
    turnover_days_value_count: 0,
    missing_turnover_days_rows: 1,
    final_target_value_count: 1,
    daily_demand_value_count: 1,
    missing_target_rows: 0,
    missing_daily_rows: 0,
    ...row,
  }));
  const { page, frame, calls } = await mpsPage(t, config, ({ queryId, parameters }) => {
    if (queryId === 'facts.history-annual') {
      const rows = annualState.rows.slice(
        parameters.offset,
        parameters.offset + parameters.page_size,
      );
      return {
        rows,
        returnedColumns: config.queries[queryId].columns,
        configVersion: 'annual-policy-fixture',
        totalRowCount: annualState.rows.length,
        offset: parameters.offset,
        hasMorePages: false,
        dataStatus: 'ok',
        warnings: [],
      };
    }
    if (!queryId.startsWith('inventory-targets.')) return emptySource({ queryId });
    if (failure) throw Error('目标来源暂不可用');
    const rows = facts.filter(
      (row) =>
        row.target_month >= parameters.start_month && row.target_month <= parameters.end_month,
    );
    return {
      rows: queryId.endsWith('.count')
        ? [{ total: rows.length }]
        : rows.slice(parameters.offset, parameters.offset + parameters.page_size),
      returnedColumns: config.queries[queryId].columns,
      rejectedColumns: [],
      configVersion: 'targets-v1',
    };
  });
  annualFixtures.set(frame, annualState);
  await version(frame, '2026-12');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,\n郑州,B,产品乙,汤圆,系列,组,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,郑州,A,产品甲,汤圆,系列,组,100,100\n2026-12,郑州,B,产品乙,汤圆,系列,组,100,100\n2027-01,郑州,A,产品甲,汤圆,系列,组,100,100\n2027-02,郑州,A,产品甲,汤圆,系列,组,100,100',
  );
  await upload(
    frame,
    '设置上一财年发货夹具',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,数量\n2025-12,郑州,A,产品甲,汤圆,系列,组,100\n2025-12,郑州,B,产品乙,汤圆,系列,组,100',
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
    await form.getByLabel('调整原因', { exact: true }).fill('基地策略计算测试');
    await form.getByRole('button', { name: '应用大类调整', exact: true }).click();
  }
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  const view = frame.getByRole('region', { name: '约束与配置', exact: true });
  await expect(view.getByRole('table', { name: '目标库存单品明细', exact: true })).toHaveCount(0);
  await expect(view.getByLabel('郑州 安全天数', { exact: true })).toBeVisible();
  let csv = await download(page, view, '下载目标库存明细');
  assert.match(csv, /2026-12,郑州,A,产品甲,月初,500,10,50,,缺输入/);
  await view.getByLabel('郑州 安全天数', { exact: true }).fill('10');
  csv = await download(page, view, '下载目标库存明细');
  assert.match(csv, /2026-12,郑州,A,产品甲,月初,500,10,50,10,基地安全天数策略/);
  assert.match(csv, /2026-12,郑州,B,产品乙,月初,300,10,30/);
  await view.getByLabel('目标库存版本', { exact: true }).selectOption('月初');
  csv = await download(page, view, '下载目标库存明细');
  assert.match(csv, /2026-12,郑州,B,产品乙,月初,300,10,30,10,基地安全天数策略/);
  assert.ok(
    calls.some(
      (call) =>
        call.queryId === 'inventory-targets.detail' &&
        call.parameters.start_month === '2026-12' &&
        call.parameters.end_month === '2027-02',
    ),
  );
  await view.getByLabel('目标库存版本', { exact: true }).selectOption('auto');
  const fullCsv = await download(page, view, '下载三个月完整目标库存');
  assert.match(fullCsv, /2027-01,郑州,A,产品甲,滚动,220,10,22,10,基地安全天数策略/);
  assert.match(fullCsv, /2027-02,郑州,A,产品甲,滚动,50,0,,10,基地安全天数策略/);
  assert.match(fullCsv, /zero-daily-demand/);
  const book = XLSX.read(fullCsv, { type: 'string', raw: true });
  const exported = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  for (const row of exported) {
    const index = ['2026-12', '2027-01', '2027-02'].indexOf(row['月份']);
    assert.equal(Number(row['有效安全天数']), 10);
    assert.equal(Number(row['下月自然天数']), [31, 28, 31][index]);
    assert.ok(
      Math.abs(Number(row['推导目标库存']) - [1000 / 31, 1500 / 28, 2000 / 31][index]) < 1e-8,
    );
    assert.equal(row['推导缺项代码'], undefined);
  }
  await view.getByLabel('目标库存版本', { exact: true }).selectOption('月初');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = window.readView().localDrafts;
        return state.drafts.find((row) => row.id === state.selected).constraints.targetVersion;
      }),
    )
    .toBe('月初');
  const saved = await page.evaluate(() => window.readView());
  const draft = saved.localDrafts.drafts.find((row) => row.id === saved.localDrafts.selected);
  assert.equal(draft.constraints.targetVersion, '月初');
  assert.equal(draft.inventoryTargets, undefined);
  failure = true;
  await view.getByRole('button', { name: '同步目标库存', exact: true }).click();
  await expect(view).toContainText('数据读取失败');
  csv = await download(page, view, '下载目标库存明细');
  assert.doesNotMatch(csv, /,300,10,30,/);
  assert.match(csv, /2026-12,郑州,A,产品甲,月初,,,,10,基地安全天数策略/);
  await view.getByLabel('郑州 安全天数', { exact: true }).fill('0');
  assert.equal(Number((await workflowExportRowsForTarget(page, view))[0]['推导目标库存']), 0);
  await view.getByLabel('郑州 安全天数', { exact: true }).fill('');
  await expect(view.getByRole('table', { name: '目标周转天数待补', exact: true })).toContainText(
    '来源读取失败',
  );
});

test('MPS processing compares both forecast months and persists fixed quantities with current-baseline undo', async (t) => {
  const { page, frame } = await workflowPage(t);
  await version(frame, '2026-12');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,麦德龙定制思念1000g小小玉珍珠黑芝麻汤圆（10袋）,汤圆,真实系列,组,,\n郑州,B,产品乙,汤圆,真实系列,组,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,郑州,A,麦德龙定制思念1000g小小玉珍珠黑芝麻汤圆（10袋）,汤圆,真实系列,组,60,60\n2026-12,郑州,B,产品乙,汤圆,真实系列,组,40,40',
  );
  await upload(
    frame,
    '设置上一财年发货夹具',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,数量\n2025-12,郑州,A,麦德龙定制思念1000g小小玉珍珠黑芝麻汤圆（10袋）,汤圆,真实系列,组,60\n2025-12,郑州,B,产品乙,汤圆,真实系列,组,40',
  );
  await upload(
    frame,
    '选择模型预测CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,数量\n2026-12,郑州,A,麦德龙定制思念1000g小小玉珍珠黑芝麻汤圆（10袋）,汤圆,真实系列,组,0\n2027-01,郑州,A,麦德龙定制思念1000g小小玉珍珠黑芝麻汤圆（10袋）,汤圆,真实系列,组,250',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await upload(
    frame,
    '选择发货输入CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库\n2026-11,郑州,A,麦德龙定制思念1000g小小玉珍珠黑芝麻汤圆（10袋）,汤圆,真实系列,组,220,10,10,10,100,200,80\n2026-11,郑州,B,产品乙,汤圆,真实系列,组,0,0,0,0,0,0,0',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  const apply = async (name, value, reason = '分层数量核对') => {
    await view.getByRole('button', { name: `调整数量 ${name}`, exact: true }).click();
    const editor = view.getByRole('group', { name: '分层需求数量调整' });
    await editor.getByLabel('有效需求数量').fill(String(value));
    await editor.getByLabel('数量调整原因').fill(reason);
    await editor.getByRole('button', { name: '应用数量调整', exact: true }).click();
    await expect(editor).toHaveCount(0);
  };
  await apply('汤圆 2026-12', 100);
  await apply('汤圆 2027-01', 200);
  const summary = view.getByRole('table', { name: '大类需求总表', exact: true });
  await expect(summary.locator('tbody tr')).toHaveCount(1);
  await expect(
    summary.getByRole('columnheader', { name: 'M+1 2026-12 模型预测', exact: true }),
  ).toBeVisible();
  await expect(
    summary.getByRole('columnheader', { name: 'M+2 2027-01 模型预测', exact: true }),
  ).toBeVisible();
  await expect(summary.locator('tbody tr td').nth(3)).toHaveText('0');
  await expect(summary.locator('tbody tr td').nth(5)).toHaveText('250');
  const processed = view.getByRole('table', { name: '加工后的需求明细', exact: true });
  await expect(
    processed.getByRole('columnheader', { name: 'M+1 2026-12 计划提报', exact: true }),
  ).toBeVisible();
  await expect(
    processed.getByRole('columnheader', { name: '2026-11 本月预估发货（可调整）', exact: true }),
  ).toBeVisible();
  const categoryDetail = processed.locator('tbody tr').first();
  await expect(categoryDetail.getByRole('cell').nth(0)).toHaveText('100');
  await expect(categoryDetail.getByRole('cell').nth(1)).toHaveText('100');
  await expect(categoryDetail.getByRole('cell').nth(2)).toHaveText('300');
  await expect(categoryDetail.getByRole('cell').nth(4)).toContainText('0');
  await expect(categoryDetail.getByRole('cell').nth(4)).toContainText('已知小计');
  await view.getByRole('button', { name: '基地 · 郑州', exact: true }).click();
  await view.getByText('大类 · 汤圆', { exact: true }).click();
  await view.getByText('物料组 · 组', { exact: true }).click();
  await page.evaluate(async () => {
    const seed = structuredClone(window.readView());
    const selected = seed.localDrafts;
    selected.drafts.find((draft) => draft.id === selected.selected).adjustments.quantities = [
      {
        kind: 'sku',
        month: '2026-12',
        category: '汤圆',
        group: '组',
        code: 'B',
        quantity: 20,
        systemValue: 40,
        at: new Date().toISOString(),
        reason: '已有全国单品调整',
      },
    ];
    await window.openAuthor('mps', 1200, seed);
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await apply('汤圆 2026-12', 200, '上游大类变化后保留固定单品');
  await expectWorkflowExportValue(frame, '郑州 A 2026-12 需求数量 计算过程', '180');
  await expectWorkflowExportValue(frame, '郑州 B 2026-12 需求数量 计算过程', '20');
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const state = window.readView().localDrafts;
        return state.drafts.find((row) => row.id === state.selected).adjustments.quantities.length;
      }),
    )
    .toBe(1);
  await page.locator('iframe').evaluate((element) => element.setAttribute('src', element.src));
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await view.getByRole('button', { name: '基地 · 郑州', exact: true }).click();
  await view.getByText('大类 · 汤圆', { exact: true }).click();
  await view.getByText('物料组 · 组', { exact: true }).click();
  await view.getByText('数量调整与撤销记录（0）', { exact: true }).click();
  await view.getByRole('button', { name: '撤销固定数量 汤圆 组 B 2026-12', exact: true }).click();
  await expectWorkflowExportValue(frame, '郑州 B 2026-12 需求数量 计算过程', '80');
  if (process.env.T3_UI_SCREENSHOTS === '1') {
    await view.getByRole('heading', { name: '大类需求总表', exact: true }).scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      document.getElementById('root').style.width = '1800px';
    });
    await page.screenshot({ path: '.scratch/t3-ui/process-1280.png' });
    await view
      .getByRole('heading', { name: '加工后的需求', exact: true })
      .evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: '.scratch/t3-ui/tree-1280.png' });
    await page.evaluate(() => {
      document.getElementById('root').style.width = '1120px';
    });
    await page.screenshot({ path: '.scratch/t3-ui/process-600.png' });
    await view
      .getByRole('heading', { name: '加工后的需求', exact: true })
      .evaluate((element) => element.scrollIntoView({ block: 'start' }));
    const longName = view.getByText('SKU · A 麦德龙定制思念1000g小小玉珍珠黑芝麻汤圆（10袋）', {
      exact: true,
    });
    const textBox = await longName.boundingBox();
    const identityBox = await longName.locator('xpath=ancestor::th').boundingBox();
    assert.ok(
      textBox.x + textBox.width <= identityBox.x + identityBox.width + 1,
      'long product names stay inside the pinned identity column',
    );
    await page.screenshot({ path: '.scratch/t3-ui/tree-600.png' });
  }
  await view.getByLabel('月份筛选').selectOption('2027-01');
  const csv = await download(page, view, '下载需求拆分');
  const book = XLSX.read(csv, { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  assert.equal(
    rows.find((row) => row['月份'] === '2026-12' && row['产品编码'] === 'B')['需求数量'],
    '80',
  );
  assert.equal(
    rows.find((row) => row['月份'] === '2027-01' && row['产品编码'] === 'A')['需求数量'],
    '120',
  );
  assert.equal(
    rows.find((row) => row['月份'] === '2027-01' && row['产品编码'] === 'A')['拆分系数所属月'],
    '2026-12',
  );
  const skuCompare = rows.find((row) => row['月份'] === '2026-12' && row['产品编码'] === 'A');
  assert.equal(skuCompare['模型预测数量'], '0');
  assert.equal(skuCompare['本月预估发货'], '300');
  assert.equal(skuCompare['本月预估所属月'], '2026-11');
  assert.match(rows.find((row) => row['粒度'] === '全部调整记录')['全部调整记录'], /分层数量核对/);
  const state = await page.evaluate(() => {
    const value = window.readView().localDrafts;
    return value.drafts.find((row) => row.id === value.selected);
  });
  assert.equal(
    state.adjustments.history.filter((row) => row.kind === 'quantities').at(-1).value,
    80,
  );
  await view.getByLabel('月份筛选').selectOption('');
  await view.getByRole('button', { name: '调整本月预估 汤圆 郑州', exact: true }).click();
  const shipmentEditor = view.getByRole('group', { name: '分层需求数量调整' });
  await shipmentEditor.getByLabel('本月预估发货数量').fill('600');
  await shipmentEditor.getByRole('button', { name: '应用本月预估调整', exact: true }).click();
  await expect(shipmentEditor).toHaveCount(0);
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await expect(frame.getByLabel('全国合计 整月预估发货', { exact: true })).toHaveValue('600');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await view.getByRole('button', { name: '基地 · 郑州', exact: true }).click();
  await view.getByText('大类 · 汤圆', { exact: true }).click();
  await view.getByText('物料组 · 组', { exact: true }).click();
  await view.getByRole('button', { name: '运算过程 郑州 A 2026-12', exact: true }).click();
  await expect(frame.getByRole('dialog')).toContainText('提报三层占比');
  await expect(frame.getByRole('dialog')).toContainText('历史三层占比');
  await expect(frame.getByRole('dialog')).toContainText('同一套系数用于M+1至M+3');
  await frame.getByRole('button', { name: '关闭弹窗', exact: true }).click();
});

test('Tab5 uses one source final turnover day per base-SKU and persists manual supplements only for missing sources', async (t) => {
  const source = {
    target_month: '2027-01',
    belong_base: '郑州',
    material_code: 'A',
    inventory_version: '滚动',
    final_target_inventory: 120,
    avg_daily_planned_demand: 10,
    final_target_turnover_days: 27,
    source_rows: 1,
    final_target_value_count: 1,
    daily_demand_value_count: 1,
    missing_target_rows: 0,
    missing_daily_rows: 0,
    turnover_days_value_count: 1,
    missing_turnover_days_rows: 0,
  };
  const { page, frame } = await mpsPage(t, config, ({ queryId }) =>
    queryId.startsWith('inventory-targets.')
      ? {
          rows: queryId.endsWith('.count') ? [{ total: 1 }] : [source],
          returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
          configVersion: 'turnover-days-source',
        }
      : emptySource({ queryId }),
  );
  await version(frame, '2026-12');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,\n郑州,B,产品乙,汤圆,系列,组,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,郑州,A,产品甲,汤圆,系列,组,100,100\n2026-12,郑州,B,产品乙,汤圆,系列,组,100,100',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  const view = frame.getByRole('region', { name: '约束与配置', exact: true });
  const pending = view.getByRole('table', { name: '目标周转天数待补', exact: true });
  await expect(pending.locator('tbody tr')).toHaveCount(1);
  await expect(pending).toContainText('产品乙');
  const field = view.getByLabel('郑州 B 补充目标周转天数', { exact: true });
  await expect(field).toHaveValue('');
  let book = XLSX.read(await download(page, view, '下载三个月完整目标库存'), {
    type: 'string',
    raw: true,
  });
  let rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  assert.ok(
    rows
      .filter((row) => row['产品编码'] === 'A')
      .every(
        (row) => Number(row['有效安全天数']) === 27 && row['天数来源'] === '源最终目标周转天数',
      ),
  );
  assert.ok(
    rows.filter((row) => row['产品编码'] === 'B').every((row) => row['有效安全天数'] === undefined),
  );
  await field.fill('25');
  await expect
    .poll(async () => {
      const saved = await page.evaluate(() => window.readView().localDrafts);
      return saved.drafts.find((draft) => draft.id === saved.selected).constraints
        ?.turnoverDays?.[0]?.days;
    })
    .toBe(25);
  await page.locator('iframe').evaluate((element) => element.setAttribute('src', element.src));
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  await expect(field).toHaveValue('25');
  book = XLSX.read(await download(page, view, '下载三个月完整目标库存'), {
    type: 'string',
    raw: true,
  });
  rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  assert.ok(
    rows
      .filter((row) => row['产品编码'] === 'B')
      .every(
        (row) => Number(row['有效安全天数']) === 25 && row['天数来源'] === '人工补充目标周转天数',
      ),
  );
  await field.fill('0');
  book = XLSX.read(await download(page, view, '下载三个月完整目标库存'), {
    type: 'string',
    raw: true,
  });
  rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  assert.ok(
    rows.filter((row) => row['产品编码'] === 'B').every((row) => row['推导目标库存'] === '0'),
  );
  await field.fill('');
  await expect(pending).toContainText('缺输入');
});
