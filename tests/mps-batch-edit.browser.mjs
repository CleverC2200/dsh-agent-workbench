import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mpsPage } from './helpers/mps-page.mjs';
import { adjustCategory } from './helpers/mps-edit.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
async function setup(t) {
  const annual = ['郑州', '华东'].flatMap((base) =>
    ['A', 'B'].map((code, i) => ({
      ...Object.fromEntries(
        config.queries['facts.history-annual'].columns.map((column) => [column, null]),
      ),
      'agents_scm_cust_deliv_daily_di.belong_base': base,
      'agents_scm_cust_deliv_daily_di.material_code': code,
      'agents_scm_cust_deliv_daily_di.material_name': i ? '产品乙' : '产品甲',
      'agents_scm_cust_deliv_daily_di.product_categ_name': '汤圆',
      'agents_scm_cust_deliv_daily_di.act_dl_qty_total': i ? 40 : 60,
    })),
  );
  const result = await mpsPage(t, config, ({ queryId }) =>
    queryId === 'facts.history-annual'
      ? {
          rows: annual,
          returnedColumns: config.queries[queryId].columns,
          configVersion: 'annual-batch-fixture',
          totalRowCount: 4,
          offset: 0,
          hasMorePages: false,
          dataStatus: 'ok',
          warnings: [],
        }
      : {
          rows: queryId.endsWith('.count') ? [{ total: 0 }] : [],
          returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
          rejectedColumns: [],
          configVersion: 'batch-fixture',
        },
  );
  const { frame } = result;
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await dialog.getByLabel('评估月份', { exact: true }).fill('2026-12');
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n,A,产品甲,汤圆,系列,组,,\n,B,产品乙,汤圆,系列,组,,',
  );
  await upload(
    frame,
    '选择计划提报CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-12,郑州,A,产品甲,汤圆,系列,组,60,60\n2026-12,郑州,B,产品乙,汤圆,系列,组,40,40\n2026-12,华东,A,产品甲,汤圆,系列,组,60,60\n2026-12,华东,B,产品乙,汤圆,系列,组,40,40',
  );
  await frame.getByRole('button', { name: '读取去年发运占比源值', exact: true }).click();
  await expect(frame.getByText('全年历史读取中…')).toHaveCount(0);
  return result;
}
async function upload(frame, label, csv) {
  await frame
    .getByLabel(label, { exact: true })
    .setInputFiles({ name: 'batch.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
}
async function step(frame, name) {
  await frame.locator('.ap-page-tab').filter({ hasText: name }).click();
  return frame.getByRole('region', { name, exact: true });
}
async function draft(page) {
  return page.evaluate(() => {
    const state = window.readView().localDrafts;
    return state.drafts.find((row) => row.id === state.selected);
  });
}
async function begin(view) {
  await view.getByRole('button', { name: '调整', exact: true }).click();
}
async function save(view) {
  await view.getByRole('button', { name: '保存调整', exact: true }).click();
}

test('shipment stages multiple hierarchy edits atomically, cancels across pages and preserves source precision', async (t) => {
  const { page, frame } = await setup(t);
  await step(frame, '本月预估发货');
  await frame.getByLabel('数据截止日').fill('2026-11-22');
  await upload(
    frame,
    '选择发货输入CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库\n2026-11,郑州,A,产品甲,汤圆,系列,组,220.125,10,10,10,100,200,80\n2026-11,郑州,B,产品乙,汤圆,系列,组,110,0,0,0,10,20,8',
  );
  const view = frame.locator('.sp-card');
  await expect.poll(async () => (await draft(page)).shipment?.rows?.length).toBe(2);
  const original = (await draft(page)).shipment;
  await frame.getByRole('button', { name: '展开 郑州', exact: true }).click();
  await expect(view.locator('.mps-batch-input')).toHaveCount(0);
  await begin(view);
  await view.getByLabel('全国合计 整月预估发货', { exact: true }).fill('101');
  await view.getByLabel('郑州 A 整月预估发货', { exact: true }).fill('40');
  assert.deepEqual((await draft(page)).shipment, original);
  await expect(frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' })).toBeDisabled();
  await view.getByRole('button', { name: '取消', exact: true }).click();
  assert.deepEqual((await draft(page)).shipment, original);
  await begin(view);
  await view.getByLabel('郑州 剩余天数入库', { exact: true }).fill('-1');
  await save(view);
  await expect(view.getByRole('alert')).toContainText('不能小于0');
  assert.deepEqual((await draft(page)).shipment, original);
  await view.getByLabel('郑州 剩余天数入库', { exact: true }).fill('11');
  await view.getByLabel('全国合计 整月预估发货', { exact: true }).fill('101');
  await view.getByLabel('郑州 A 整月预估发货', { exact: true }).fill('40');
  await save(view);
  await expect
    .poll(async () => (await draft(page)).shipment?.values?.[JSON.stringify(['郑州', 'A'])]?.value)
    .toBe(40);
  const saved = (await draft(page)).shipment;
  assert.equal(saved.rows[0].shipped, 220.125);
  assert.equal(saved.values[JSON.stringify(['郑州', 'A'])].value, 40);
  await expect(
    view.getByRole('button', { name: '郑州 A 整月预估发货 计算过程', exact: true }),
  ).toHaveText('40');
  await begin(view);
  await view.getByLabel('全国合计 整月预估发货', { exact: true }).fill('');
  await view.getByLabel('郑州 剩余天数入库', { exact: true }).fill('');
  await save(view);
  await expect.poll(async () => Object.keys((await draft(page)).shipment.values).length).toBe(0);
  assert.deepEqual((await draft(page)).shipment.values, {});
  assert.deepEqual((await draft(page)).shipment.remaining, {});
});

test('processing shares one edit mode for category months and expanded SKUs and saves a single reason', async (t) => {
  const { page, frame } = await setup(t);
  await adjustCategory(frame, '汤圆', '2026-12', '100', '验收基线');
  await adjustCategory(frame, '汤圆', '2027-01', '200', '验收基线');
  const view = await step(frame, '需求加工与收敛');
  await expect(view.getByRole('button', { name: /^调整数量/ })).toHaveCount(0);
  const original = (await draft(page)).adjustments;
  await begin(view);
  await expect(view.locator('.mps-batch-input')).toHaveCount(4);
  await view.getByLabel('汤圆 2026-12 需求数量', { exact: true }).fill('120.75');
  await view.getByLabel('汤圆 2027-01 需求数量', { exact: true }).fill('220');
  await view.getByLabel('搜索当前步骤').fill('产品甲');
  await view.getByLabel('搜索当前步骤').fill('');
  await view.getByRole('button', { name: '基地 · 郑州', exact: true }).click();
  await view.getByRole('button', { name: '郑州 大类 · 汤圆', exact: true }).click();
  await view.getByRole('button', { name: '郑州 物料组 · 组', exact: true }).click();
  await expect(view.getByLabel('汤圆 组 A 郑州 2026-12 需求数量', { exact: true })).toBeEditable();
  await view.getByLabel('汤圆 组 A 郑州 2026-12 需求数量', { exact: true }).fill('50');
  await save(view);
  await expect(view.getByRole('alert')).toContainText('调整原因');
  assert.deepEqual((await draft(page)).adjustments, original);
  await view.getByLabel('批量调整原因', { exact: true }).fill('同批调整三处');
  await save(view);
  await expect(view.getByRole('alert')).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await draft(page)).adjustments?.categoryDemand?.find((row) => row.month === '2026-12')
          ?.quantity,
    )
    .toBe(120.75);
  const changed = (await draft(page)).adjustments;
  assert.equal(changed.categoryDemand.find((row) => row.month === '2026-12').quantity, 120.75);
  await expect(view.getByLabel('汤圆 2026-12 需求数量', { exact: true })).toHaveText('121');
  assert.equal(changed.categoryDemand.find((row) => row.month === '2027-01').quantity, 220);
  assert.equal(changed.quantities[0].quantity, 50);
  assert.equal(changed.quantities[0].reason, '同批调整三处');
  await view.getByRole('button', { name: '基地 · 华东', exact: true }).click();
  await view.getByRole('button', { name: '华东 大类 · 汤圆', exact: true }).click();
  await view.getByRole('button', { name: '华东 物料组 · 组', exact: true }).click();
  await view.getByRole('button', { name: '运算过程 华东 A 2026-12', exact: true }).click();
  await expect(frame.getByRole('dialog').locator('p').last()).toHaveText('结果：22');
  await frame.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await begin(view);
  await view.getByLabel('汤圆 2026-12 需求数量', { exact: true }).fill('999');
  await view.getByRole('button', { name: '取消', exact: true }).click();
  assert.deepEqual((await draft(page)).adjustments, changed);
});

test('configuration stages calendar, weights, rules and resources together; invalid hidden input blocks the whole save', async (t) => {
  const { page, frame } = await setup(t);
  const view = await step(frame, '约束与配置');
  await expect(view.getByRole('button', { name: '新增约束', exact: true })).toBeDisabled();
  await view.locator('summary').filter({ hasText: '高级配置：' }).click();
  await expect(view.locator('.mps-batch-input')).toHaveCount(0);
  const original = await draft(page);
  await begin(view);
  await view.getByLabel('郑州 安全天数', { exact: true }).fill('7');
  await view.getByLabel('郑州 2026-12 生产天数', { exact: true }).fill('32');
  await view.getByLabel('郑州 A 件吨系数', { exact: true }).fill('0.123456789');
  await view.getByRole('button', { name: '新增产能资源', exact: true }).click();
  await view.getByLabel('资源1 名称', { exact: true }).fill('验收隧道');
  await view.getByLabel('资源1 日产吨数', { exact: true }).fill('8');
  await view.locator('summary').filter({ hasText: '高级配置：' }).click();
  await save(view);
  await expect(view.getByRole('alert')).toContainText('生产天数');
  assert.deepEqual(await draft(page), original);
  await expect(view.getByLabel('郑州 2026-12 生产天数', { exact: true })).toBeVisible();
  await view.getByLabel('郑州 2026-12 生产天数', { exact: true }).fill('15');
  await save(view);
  await expect
    .poll(
      async () =>
        (await draft(page)).constraints?.safetyDays?.find((row) => row.base === '郑州')?.days,
    )
    .toBe(7);
  const saved = await draft(page);
  assert.equal(saved.constraints.safetyDays.find((row) => row.base === '郑州').days, 7);
  assert.equal(
    saved.productionDays.find((row) => row.base === '郑州' && row.month === '2026-12').days,
    15,
  );
  assert.equal(
    saved.unitWeights.find((row) => row.base === '郑州' && row.code === 'A').tonsPerPiece,
    0.123456789,
  );
  assert.equal(saved.resources[0].dailyTons, 8);
  await begin(view);
  await view.getByLabel('郑州 安全天数', { exact: true }).fill('999');
  await view.getByRole('button', { name: '删除资源1', exact: true }).click();
  await view.getByRole('button', { name: '取消', exact: true }).click();
  assert.deepEqual(await draft(page), saved);
});

test('seven pages retain readable compact headers and contained toolbars at desktop and narrow widths', async (t) => {
  const { page, frame } = await setup(t);
  for (const width of [1200, 720]) {
    await page.evaluate((width) => {
      document.getElementById('root').style.width = `${width + 520}px`;
    }, width);
    for (const name of [
      '需求确认',
      '本月预估发货',
      '需求加工与收敛',
      '主数据对应关系',
      '约束与配置',
      '产能评估与缺口',
      '产销存报告',
    ]) {
      await frame.locator('.ap-page-tab').filter({ hasText: name }).click();
      await expect(frame.getByRole('heading', { name, exact: true }).first()).toBeVisible();
      await expect(frame.getByRole('button', { name: /^下一步[:：]/ })).toHaveCount(0);
      const toolbar = frame.locator('.wf-toolbar').first();
      if (await toolbar.count()) {
        const bounds = await toolbar.boundingBox();
        const container = await frame.locator('.dc-page').boundingBox();
        assert.ok(
          bounds.x >= container.x - 1 &&
            bounds.x + bounds.width <= container.x + container.width + 1,
        );
        if (name === '需求加工与收敛' && width === 1200)
          assert.ok(bounds.height <= 84, `filter toolbar height ${bounds.height}`);
      }
      if (name === '需求加工与收敛') {
        const view = frame.getByRole('region', { name, exact: true });
        await begin(view);
        const editedBounds = await toolbar.boundingBox();
        assert.ok(
          editedBounds.height <= (width === 1200 ? 104 : 140),
          `editing toolbar height ${editedBounds.height}`,
        );
        if (process.env.MPS_BATCH_SCREENSHOTS)
          await page.screenshot({
            path: `${process.env.MPS_BATCH_SCREENSHOTS}/${width}-editing.png`,
          });
        await view.getByRole('button', { name: '取消', exact: true }).click();
      }
      if (process.env.MPS_BATCH_SCREENSHOTS)
        await page.screenshot({
          path: `${process.env.MPS_BATCH_SCREENSHOTS}/${width}-${name}.png`,
        });
    }
  }
});
