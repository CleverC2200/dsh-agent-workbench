import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx-republish';
import { mpsPageWithExactProductPeriod as mpsPage } from './helpers/mps-page.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';
import { expect } from '@playwright/test';
import { authorPage } from './helpers/author-page.mjs';
import { workflowExportRows } from './helpers/mps-workflow-export.mjs';

const columns = '基地,SKU,月份,修正数量,调整原因,说明';
async function upload(frame, label, text) {
  await frame.getByLabel(label, { exact: true }).setInputFiles({
    name: '需求.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(text),
  });
}
async function draft(page) {
  return page.evaluate(() => {
    const state = window.readView().localDrafts;
    return state.drafts.find((row) => row.id === state.selected);
  });
}
async function setup(t, delisted = false) {
  let page;
  if (delisted) {
    const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
    ({ page } = await mpsPage(t, config, ({ queryId }) => ({
      rows: queryId.endsWith('.count')
        ? [{ total: queryId === 'transfers.count' ? 1 : 0 }]
        : queryId === 'transfers.detail'
          ? [
              {
                ...Object.fromEntries(
                  config.queries[queryId].columns.map((column) => [column, null]),
                ),
                stat_period: '2026-11',
                material_code: 'A',
                target_base: '郑州',
                transfer_tag: '下市品',
              },
            ]
          : [],
      returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
      rejectedColumns: [],
      configVersion: 'upload-fixture',
    })));
  } else {
    page = await authorPage(t);
    await page.evaluate(() => window.openAuthor('mps', 1200));
  }
  page.setDefaultTimeout(10000);
  const frame = page.frameLocator('iframe');
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,物料组名称,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,G1,物料组,,\n郑州,B,产品乙,汤圆,系列,G1,物料组,,\n华东,A,产品甲,汤圆,系列,G1,物料组,,',
  );
  const month = (await draft(page)).month;
  await upload(
    frame,
    '选择计划提报CSV',
    `月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n${month},郑州,A,产品甲,汤圆,系列,G1,60,60\n${month},郑州,B,产品乙,汤圆,系列,G1,40,40\n${month},华东,A,产品甲,汤圆,系列,G1,20,20`,
  );
  await expect.poll(async () => (await draft(page)).inputs.report?.rows.length).toBe(3);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  return {
    page,
    frame,
    month,
    view: frame.getByRole('region', { name: '需求加工与收敛', exact: true }),
  };
}

test('需求导入保留系统列和导入原值，最终预测立即采用并支持再导入后手调', async (t) => {
  const { page, frame, month, view } = await setup(t);
  const summary = view.getByRole('table', { name: '大类需求总表', exact: true });
  const detail = view.getByRole('table', { name: '加工后的需求明细', exact: true });
  await expect(
    summary.getByRole('columnheader', { name: `M+1 ${month} 人工导入`, exact: true }),
  ).toHaveCount(1);
  await expect(
    detail.getByRole('columnheader', { name: `M+1 ${month} 最终预测（可调整）`, exact: true }),
  ).toHaveCount(1);
  await upload(frame, '选择需求修正CSV', `${columns}\n郑州,A,${month},130,销售变化,`);
  await frame.getByRole('button', { name: '确认应用修正', exact: true }).click();
  await expect.poll(async () => (await draft(page)).demandImports?.[0]?.quantity).toBe(130);
  await expect(summary).toContainText('1/3项已导入');
  const download = async () => {
    const pending = page.waitForEvent('download');
    await view.getByRole('button', { name: '下载当前范围需求', exact: true }).click();
    const text = await mpsDownloadText(await (await pending).path());
    const book = XLSX.read(text.replace(/^\uFEFF/, ''), { type: 'string', raw: true });
    return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
  };
  let rows = await download();
  let leaf = rows.find(
    (row) =>
      row['粒度'] === '基地SKU' &&
      row['基地'] === '郑州' &&
      row['产品编码'] === 'A' &&
      row['月份'] === month,
  );
  assert.equal(Number(leaf['人工导入']), 130);
  assert.equal(Number(leaf['最终预测']), 130);
  assert.equal(
    leaf['预测偏差'],
    leaf['系统需求数量'] === '' ? '' : 130 - Number(leaf['系统需求数量']),
  );
  await upload(frame, '选择需求修正CSV', `${columns}\n郑州,A,${month},0,销售变化,`);
  await frame.getByRole('button', { name: '确认应用修正', exact: true }).click();
  await expect.poll(async () => (await draft(page)).demandImports?.[0]?.quantity).toBe(0);
  await view.getByLabel('搜索当前步骤').fill('产品甲');
  await frame.getByRole('button', { name: '调整', exact: true }).click();
  await view.getByLabel(`汤圆 G1 A 郑州 ${month} 需求数量`, { exact: true }).fill('140');
  await frame.getByLabel('批量调整原因', { exact: true }).selectOption('数据纠错');
  await frame.getByRole('button', { name: '保存调整', exact: true }).click();
  rows = await download();
  leaf = rows.find(
    (row) =>
      row['粒度'] === '基地SKU' &&
      row['基地'] === '郑州' &&
      row['产品编码'] === 'A' &&
      row['月份'] === month,
  );
  assert.equal(Number(leaf['人工导入']), 0);
  assert.equal(Number(leaf['最终预测']), 140);
  assert.equal((await draft(page)).demandImports[0].quantity, 0);
  await upload(frame, '选择需求修正CSV', `${columns}\n郑州,A,${month},0,销售变化,`);
  await frame.getByRole('button', { name: '确认应用修正', exact: true }).click();
  await expect.poll(async () => (await draft(page)).adjustments.quantities[0]?.quantity).toBe(0);
  await frame.getByRole('button', { name: '调整', exact: true }).click();
  await view.getByLabel(`汤圆 G1 A 郑州 ${month} 需求数量`, { exact: true }).fill('');
  await frame.getByLabel('批量调整原因', { exact: true }).selectOption('数据纠错');
  await frame.getByRole('button', { name: '保存调整', exact: true }).click();
  rows = await download();
  leaf = rows.find(
    (row) =>
      row['粒度'] === '基地SKU' &&
      row['基地'] === '郑州' &&
      row['产品编码'] === 'A' &&
      row['月份'] === month,
  );
  assert.equal(Number(leaf['最终预测']), 0);
});

test('CSV预览不写入，点击确认仅改变基地SKU并保留系统依据、历史和第四月参考', async (t) => {
  const { page, frame, month, view } = await setup(t);
  const original = await draft(page);
  const referenceDate = new Date(`${month}-01T00:00:00Z`);
  referenceDate.setUTCMonth(referenceDate.getUTCMonth() + 3);
  const fourth = referenceDate.toISOString().slice(0, 7);
  await upload(
    frame,
    '选择需求修正CSV',
    `${columns}\n郑州,A,${month},55.75,销售变化,\n郑州,A,${fourth},7,其他,第四月库存参考`,
  );
  const preview = frame.getByRole('dialog', { name: '确认需求修正上传', exact: true });
  await expect(preview)
    .toContainText('55.75')
    .catch(async (failure) => {
      t.diagnostic(JSON.stringify(await frame.getByRole('alert').allTextContents()));
      throw failure;
    });
  await expect(preview).toContainText('第四月库存参考');
  assert.deepEqual(await draft(page), original);
  await preview.getByRole('button', { name: '确认应用修正', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect.poll(async () => (await draft(page)).adjustments.quantities.length).toBe(2);
  const saved = await draft(page);
  assert.equal(saved.adjustments.quantities.length, 2);
  assert.equal(saved.adjustments.quantities[0].quantity, 55.75);
  assert.equal(saved.adjustments.quantities[1].reason, '其他：第四月库存参考');
  assert.equal(saved.adjustments.history.length, 2);
  assert.deepEqual(saved.inputs, original.inputs);
  const rows = await workflowExportRows(frame);
  const selected = rows.find(
    (row) => row['基地'] === '郑州' && row['产品编码'] === 'A' && row['月份'] === month,
  );
  assert.equal(Number(selected['需求数量']), 55.75);
  assert.equal(selected['调整原因'], '销售变化');
  assert.equal(
    Number(
      rows.find(
        (row) => row['基地'] === '郑州' && row['产品编码'] === 'A' && row['月份'] === fourth,
      )['需求数量'],
    ),
    7,
  );
  await view.getByLabel('搜索当前步骤').fill('产品甲');
  await frame.getByRole('button', { name: '调整', exact: true }).click();
  await view.getByLabel(`汤圆 G1 A 郑州 ${month} 需求数量`, { exact: true }).fill('');
  await frame.getByLabel('批量调整原因', { exact: true }).selectOption('数据纠错');
  await frame.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect.poll(async () => (await draft(page)).adjustments.quantities.length).toBe(1);
  const undone = await draft(page);
  assert.equal(undone.adjustments.quantities.length, 1);
  assert.equal(undone.adjustments.history.at(-1).action, 'undo');
  assert.equal(undone.adjustments.history[0].reason, '销售变化');
});

test('无效文件不覆盖有效修正，后选文件不会被先选文件的迟到读取替换', async (t) => {
  const { page, frame, month } = await setup(t);
  const valid = `${columns}\n郑州,A,${month},80,促销活动,已确认`;
  await upload(frame, '选择需求修正CSV', valid);
  await frame.getByRole('button', { name: '确认应用修正', exact: true }).click();
  await expect.poll(async () => (await draft(page)).adjustments.quantities[0]?.quantity).toBe(80);
  const original = await draft(page);
  const invalid = [
    ['', '没有需求修正行'],
    [`郑州,A,${month},99,其他,`, '说明'],
    [`郑州,A,${month},99,随意原因,`, '合法调整原因'],
    [`郑州,A,${month},-1,库存调整,`, '非负有限数'],
    [`郑州,A,${month},,库存调整,`, '非负有限数'],
    [`郑州,A,2020-01,99,供应变化,`, '当前版本有效范围'],
    [`不存在,A,${month},99,供应变化,`, '当前版本有效范围'],
    [`郑州,不存在,${month},99,数据纠错,`, '当前版本有效范围'],
    [`郑州,A,${month},99,数据纠错,\n郑州,A,${month},100,数据纠错,`, '重复'],
    [`郑州,A,${month},99,数据纠错,"未闭合`, '引号未闭合'],
  ];
  for (const [body, message] of invalid) {
    await upload(frame, '选择需求修正CSV', `${columns}\n${body}`);
    await expect(frame.getByRole('alert').last()).toContainText(message);
    await expect(frame.getByRole('dialog', { name: '确认需求修正上传', exact: true })).toHaveCount(
      0,
    );
    assert.deepEqual(await draft(page), original);
  }
  await frame.locator('body').evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      File.prototype.text = original;
      return new Promise((resolve) => {
        window.releaseDemandUpload = () => original.call(this).then(resolve);
      });
    };
  });
  await upload(frame, '选择需求修正CSV', valid);
  await upload(frame, '选择需求修正CSV', `${columns}\n郑州,A,${month},-1,库存调整,`);
  await expect(frame.getByRole('alert').last()).toContainText('非负有限数');
  await frame.locator('body').evaluate(() => window.releaseDemandUpload());
  await expect(frame.getByRole('dialog', { name: '确认需求修正上传', exact: true })).toHaveCount(0);
  assert.deepEqual(await draft(page), original);
});

test('完整三个月导入与再导入保留旧调整、第四月和完整历史', async (t) => {
  const { page, frame, month } = await setup(t);
  await page.evaluate(async () => {
    const seed = window.readView();
    const current = seed.localDrafts.drafts.find((row) => row.id === seed.localDrafts.selected);
    const product = current.inputs.products.rows[0];
    current.inputs.products.rows = Array.from({ length: 5770 }, (_, index) => ({
      ...product,
      产品编码: `FULL${index}`,
    }));
    current.adjustments.quantities = [
      {
        kind: 'base-sku',
        month: new Date(
          Date.UTC(Number(current.month.slice(0, 4)), Number(current.month.slice(5)) + 2, 1),
        )
          .toISOString()
          .slice(0, 7),
        category: '汤圆',
        group: 'G1',
        base: '郑州',
        code: 'FULL1',
        quantity: 7,
        systemValue: null,
        reason: '旧调整保留',
        at: '2026-11-01T00:00:00.000Z',
      },
    ];
    current.adjustments.history = [
      {
        kind: 'quantities',
        key: '旧记录',
        action: 'set',
        value: 7,
        systemValue: null,
        reason: '旧历史保留',
        at: '2026-11-01T00:00:00.000Z',
      },
    ];
    await window.openAuthor('mps', 1200, seed);
  });
  await expect(frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' })).toHaveAttribute(
    'data-active',
    'true',
    { timeout: 30000 },
  );
  const months = Array.from({ length: 4 }, (_, index) => {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + index);
    return date.toISOString().slice(0, 7);
  });
  const imported = months
    .slice(0, 3)
    .flatMap((period) =>
      Array.from(
        { length: 5770 },
        (_, index) => `郑州,FULL${index},${period},${index % 2 ? 0 : 13},销售变化,`,
      ),
    );
  for (let iteration = 0; iteration < 2; iteration++) {
    await upload(
      frame,
      '选择需求修正CSV',
      `${columns}\n${imported.join('\n')}\n郑州,FULL0,${months[3]},7,库存调整,`,
    );
    const preview = frame.getByRole('dialog', { name: '确认需求修正上传', exact: true });
    await expect(preview).toContainText('共17311条', { timeout: 30000 });
    await preview
      .getByRole('button', { name: '确认应用修正', exact: true })
      .click({ timeout: 30000 });
    await expect(preview)
      .toHaveCount(0, { timeout: 30000 })
      .catch(async (failure) => {
        t.diagnostic(JSON.stringify(await frame.getByRole('alert').allTextContents()));
        throw failure;
      });
    const saved = await draft(page);
    assert.equal(saved.demandImports.length, 17310);
    assert.equal(saved.adjustments.quantities.length, 17312);
    assert.equal(saved.adjustments.history.length, 1 + (iteration + 1) * 17311);
    assert.equal(
      saved.adjustments.quantities.find((row) => row.code === 'FULL1' && row.month === months[3])
        .quantity,
      7,
    );
    assert.equal(saved.adjustments.quantities.find((row) => row.month === months[3]).quantity, 7);
    assert.equal(saved.demandImports.find((row) => row.code === 'FULL1').quantity, 0);
    assert.equal(saved.adjustments.history[0].reason, '旧历史保留');
  }
  const saved = await page.evaluate(() => window.readView());
  await page.evaluate(async (seed) => window.openAuthor('mps', 1200, seed), saved);
  assert.deepEqual(await page.evaluate(() => window.readView().localDrafts), saved.localDrafts);
});

test('跨月参考保留原版人工导入且新版从系统值开始', async (t) => {
  const { page, frame, month } = await setup(t);
  const following = new Date(`${month}-01T00:00:00Z`);
  following.setUTCMonth(following.getUTCMonth() + 1);
  const nextMonth = following.toISOString().slice(0, 7);
  await upload(frame, '选择需求修正CSV', `${columns}\n郑州,A,${nextMonth},333,销售变化,`);
  await frame
    .getByRole('dialog', { name: '确认需求修正上传', exact: true })
    .getByRole('button', { name: '确认应用修正', exact: true })
    .click();
  await expect.poll(async () => (await draft(page)).demandImports?.length).toBe(1);
  const base = await draft(page);
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const creation = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await creation.getByLabel('评估月份', { exact: true }).fill(nextMonth);
  await creation.getByLabel('参考版本', { exact: true }).selectOption(base.id);
  await creation.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await expect.poll(async () => (await draft(page)).month).toBe(nextMonth);
  assert.deepEqual((await draft(page)).demandImports ?? [], []);
  await frame.getByLabel('评估版本选择', { exact: true }).selectOption(base.id);
  assert.deepEqual((await draft(page)).demandImports, base.demandImports);
});

test('上传不能使完整修正历史超出本地草稿可保存范围', async (t) => {
  const { page, frame, month } = await setup(t);
  await page.evaluate(async () => {
    const seed = window.readView();
    const draft = seed.localDrafts.drafts.find((row) => row.id === seed.localDrafts.selected);
    draft.adjustments.history = Array.from({ length: 90000 }, () => ({
      kind: 'quantities',
      key: '历史叶子',
      action: 'set',
      systemValue: null,
      value: 1,
      reason: '保留历史',
      at: '2026-11-01T00:00:00.000Z',
    }));
    await window.openAuthor('mps', 1200, seed);
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const original = await draft(page);
  await upload(frame, '选择需求修正CSV', `${columns}\n郑州,A,${month},90,销售变化,`);
  const preview = frame.getByRole('dialog', { name: '确认需求修正上传', exact: true });
  await preview.getByRole('button', { name: '确认应用修正', exact: true }).click();
  await expect(preview.getByRole('alert')).toContainText('可保存范围');
  assert.deepEqual(await draft(page), original);
});

test('取消上传不写入，版本切换及恢复保留各自修正并丢弃迟到预览', async (t) => {
  const { page, frame, month } = await setup(t);
  const valid = `${columns}\n郑州,A,${month},70,供应变化,保留版本一`;
  await upload(frame, '选择需求修正CSV', valid);
  await frame.getByRole('button', { name: '取消上传', exact: true }).click();
  assert.equal((await draft(page)).adjustments.quantities.length, 0);
  await upload(frame, '选择需求修正CSV', valid);
  await frame.getByRole('button', { name: '确认应用修正', exact: true }).click();
  await expect.poll(async () => (await draft(page)).adjustments.quantities[0]?.quantity).toBe(70);
  const first = await draft(page);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求确认' }).click();
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame
    .getByRole('dialog', { name: '新建评估版本', exact: true })
    .getByRole('button', { name: '创建本地版本', exact: true })
    .click();
  await expect.poll(async () => (await draft(page)).id).not.toBe(first.id);
  const second = await draft(page);
  assert.notEqual(second.id, first.id);
  assert.equal(second.adjustments.quantities.length, 0);
  await frame.getByLabel('评估版本选择', { exact: true }).selectOption(first.id);
  await expect.poll(async () => (await draft(page)).id).toBe(first.id);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await frame.locator('body').evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      File.prototype.text = original;
      return new Promise((resolve) => {
        window.releaseDemandUpload = () => original.call(this).then(resolve);
      });
    };
  });
  await upload(frame, '选择需求修正CSV', `${columns}\n郑州,A,${month},99,销售变化,`);
  await frame.getByLabel('评估版本选择', { exact: true }).selectOption(second.id);
  await expect.poll(async () => (await draft(page)).id).toBe(second.id);
  await frame.locator('body').evaluate(() => window.releaseDemandUpload());
  await expect(frame.getByRole('dialog', { name: '确认需求修正上传', exact: true })).toHaveCount(0);
  assert.deepEqual(await draft(page), second);
  await frame.getByLabel('评估版本选择', { exact: true }).selectOption(first.id);
  await expect.poll(async () => (await draft(page)).id).toBe(first.id);
  assert.deepEqual((await draft(page)).adjustments, first.adjustments);
  const saved = await page.evaluate(() => window.readView());
  await page.evaluate(async (seed) => window.openAuthor('mps', 1200, seed), saved);
  assert.deepEqual(await page.evaluate(() => window.readView().localDrafts), saved.localDrafts);
});

test('下市品上传正需求保持有效，其他基地及兄弟SKU不重摊并按筛选下载异常', async (t) => {
  const { page, frame, month } = await setup(t, true);
  const view = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  const report = frame.getByRole('region', { name: '下市品需求与库存报告', exact: true });
  await expect(report).toContainText('下市品停止自动补货');
  await upload(
    frame,
    '选择需求修正CSV',
    `${columns}\n郑州,B,${month},40,数据纠错,\n华东,A,${month},20,供应变化,`,
  );
  await frame.getByRole('button', { name: '确认应用修正', exact: true }).click();
  const before = await workflowExportRows(frame);
  await upload(frame, '选择需求修正CSV', `${columns}\n郑州,A,${month},88,库存调整,人工保留`);
  await frame.getByRole('button', { name: '确认应用修正', exact: true }).click();
  await expect(report).toContainText('下市品人工正需求');
  await expect(report).toContainText('保留人工原值');
  await expect
    .poll(async () => {
      const saved = await draft(page);
      return saved.adjustments.quantities.find((row) => row.base === '郑州' && row.code === 'A')
        ?.quantity;
    })
    .toBe(88);
  const saved = await draft(page);
  assert.equal(saved.adjustments.history.length, 3);
  const after = await workflowExportRows(frame);
  const leaf = after.find(
    (row) => row['基地'] === '郑州' && row['产品编码'] === 'A' && row['月份'] === month,
  );
  assert.equal(Number(leaf['需求数量']), 88);
  assert.equal(leaf['下市品处理'], '有效人工正需求继续计算');
  const unaffected = (rows) =>
    rows
      .filter((row) => row['产品编码'] && (row['基地'] !== '郑州' || row['产品编码'] !== 'A'))
      .map((row) => [row['基地'], row['产品编码'], row['月份'], row['需求数量']]);
  assert.deepEqual(unaffected(after), unaffected(before));
  await expect(
    view.getByRole('table', { name: '加工后的需求明细', exact: true }).locator('tbody tr').first(),
  ).toContainText('148');
  await view.getByLabel('基地筛选', { exact: true }).selectOption('郑州');
  await view.getByLabel('月份筛选', { exact: true }).selectOption(month);
  const downloading = page.waitForEvent('download');
  await report.getByRole('button', { name: '下载下市品异常明细', exact: true }).click();
  const text = await mpsDownloadText(await (await downloading).path());
  const book = XLSX.read(text.replace(/^\uFEFF/, ''), { type: 'string', raw: true });
  const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '' });
  assert.ok(
    rows.length > 0 && rows.every((row) => row['基地'] === '郑州' && row['月份'] === month),
  );
  assert.ok(
    rows.some((row) => row['异常类别'] === '下市品人工正需求' && Number(row['计算用值']) === 88),
    JSON.stringify(rows),
  );
});
