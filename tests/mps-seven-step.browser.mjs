import { mpsDownloadText } from './helpers/mps-download.mjs';
import {
  mpsPageWithExactProductPeriod as mpsPage,
  openMpsCategoryFilter,
} from './helpers/mps-page.mjs';
import {
  shipmentSourceRow,
  shipmentSourceResponse,
  syncShipmentSource,
} from './helpers/mps-shipment-source.mjs';
import { selectAdjustmentReason } from './helpers/mps-edit.mjs';
import { expandShipmentBase } from './helpers/mps-shipment.mjs';
import { expectWorkflowExportValue } from './helpers/mps-workflow-export.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { authorPage } from './helpers/author-page.mjs';

test('MPS seven steps share the selected evaluation without legacy simulation controls', async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本' });
  await dialog.getByLabel('评估月份', { exact: true }).fill('2026-12');
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '当前评估产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,001,产品甲,汤圆,系列甲,物料组甲,,',
    ),
  });
  const steps = [
    '需求确认',
    '本月预估发货',
    '需求加工与收敛',
    '主数据对应关系',
    '约束与配置',
    '产能评估与缺口',
    '产销存报告',
  ];
  await expect(frame.locator('.ap-page-tab')).toHaveCount(7);
  const header = frame.locator('.dc-page-head');
  const refresh = header.getByRole('button', { name: '刷新', exact: true });
  const colors = await frame.locator('body').evaluate((element) => {
    const style = getComputedStyle(element);
    const probe = document.createElement('span');
    const color = (name) => {
      probe.style.color = style.getPropertyValue(name).trim();
      return probe.style.color;
    };
    return {
      brand: color('--workbench-brand'),
      brandSoft: color('--workbench-brand-soft'),
    };
  });
  assert.ok(colors.brand, 'shared Workbench brand color is loaded inside the MPS page');
  for (const step of steps) {
    await frame.locator('.ap-page-tab').filter({ hasText: step }).click();
    await expect(frame.getByRole('heading', { name: step, exact: true, level: 1 })).toBeVisible();
    await expect(refresh).toBeVisible();
    await expect(header.getByRole('button', { name: '数据源', exact: true })).toHaveCount(0);
    await expect(frame.getByLabel('评估月份选择')).toHaveValue('2026-12');
    await expect(frame.getByText('需求权重', { exact: true })).toHaveCount(0);
    await expect(
      frame.locator('button').filter({ hasText: /下一步|上一步|返回产能评估/ }),
    ).toHaveCount(0);
    const active = frame.locator('.ap-page-tab[data-active="true"]');
    await expect(active).toHaveCSS('background-color', colors.brandSoft);
    const badge = active.locator('.ap-page-tab-step');
    await expect(badge).toHaveCSS('background-color', colors.brand);
    assert.notEqual(
      await badge.evaluate((element) => getComputedStyle(element).color),
      colors.brand,
    );
    assert(!/模拟|40\/40\/20/.test(await frame.locator('body').innerText()));
  }
  assert.equal(await page.evaluate(() => window.peerDraft), '历史草稿，请保留。');
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  const beforeRefresh = await page.evaluate(() => window.readView().localDrafts);
  await refresh.click();
  await expect(frame.getByRole('status').filter({ hasText: '请先运行产能评估' })).toBeVisible();
  assert.deepEqual(await page.evaluate(() => window.readView().localDrafts), beforeRefresh);
  const download = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载需求推导参考', exact: true }).click();
  const csv = await mpsDownloadText(await (await download).path(), '需求推导参考');
  assert.match(csv, /2026-12/);
  assert.match(csv, /2027-01/);
  assert.match(csv, /2027-02/);
  assert(!csv.includes('2026-10'));
  assert.match(csv, /缺|未|待/);
});

async function monthlyScope(frame) {
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '当月范围.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n2026-10,郑州,A,产品甲,汤圆,系列甲,物料组甲,1,1\n2026-11,郑州,A,产品甲,汤圆,系列甲,物料组甲,1,1',
    ),
  });
}

test('MPS shipment closing inventory feeds the same-version assessment and report and is revoked on scope change', async (t) => {
  const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
  const { page, frame } = await mpsPage(
    t,
    config,
    (query) =>
      shipmentSourceResponse(
        config,
        query,
        [
          shipmentSourceRow({
            shipped: 220,
            daily3: 10,
            average: 10,
            open: 1010,
            inbound: 210,
            product_item: '物料组甲',
          }),
        ],
        '2026-09-22',
      ) ?? {
        rows: query.queryId.endsWith('.count') ? [{ total: 0 }] : [],
        returnedColumns: config.queries[query.queryId].columns,
        configVersion: 'seven-step-source',
      },
  );
  const months = frame.getByLabel('评估月份选择', { exact: true });
  const originalMonth = await months.inputValue();
  await frame.locator('body').page().clock.setFixedTime(new Date('2026-10-15T12:00:00+08:00'));
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const dialog = frame.getByRole('dialog', { name: '新建评估版本' });
  await dialog.getByLabel('评估月份', { exact: true }).fill('2026-10');
  await dialog.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '当前评估产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列甲,物料组甲,,',
    ),
  });
  await monthlyScope(frame);
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await syncShipmentSource(frame, '2026-09-22');
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估与缺口' }).click();
  await expectWorkflowExportValue(frame, '郑州 A 2026-10 期初库存 计算过程', '1,000');
  await expectWorkflowExportValue(frame, '郑州 A 2026-11 期初库存 计算过程', '—');
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await expandShipmentBase(frame, '郑州');
  const estimate = frame.getByLabel('郑州 A 整月预估发货', { exact: true });
  await frame.getByRole('button', { name: '调整', exact: true }).click();
  await estimate.fill('500');
  await frame.getByRole('button', { name: '保存调整', exact: true }).click();
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  await expectWorkflowExportValue(frame, '郑州 A 2026-10 期初库存 计算过程', '800');
  await months.selectOption(originalMonth);
  await expect(
    frame.getByRole('button', { name: '郑州 A 2026-10 期初库存 计算过程', exact: true }),
  ).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.peerDraft), '历史草稿，请保留。');
});

test('MPS data disclosures span the page at desktop and narrow widths', async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  for (const width of [1200, 600]) {
    await page.evaluate(
      (width) => (document.getElementById('root').style.width = `${width + 520}px`),
      width,
    );
    for (const name of ['需求加工与收敛', '约束与配置', '产能评估与缺口', '产销存报告']) {
      await frame.locator('.ap-page-tab').filter({ hasText: name }).click();
      await expect(frame.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
      assert.equal(await frame.locator('.ap-board-body').evaluate((e) => e.scrollTop), 0);
      for (const detail of await frame.locator('.wf-page > details').all()) {
        const box = await detail.boundingBox();
        const parent = await detail.evaluate((e) => e.parentElement.getBoundingClientRect().width);
        assert.ok(box.width >= parent - 2, `${name} ${width}: ${box.width}/${parent}`);
      }
      for (const removed of [
        '拆分过程与基地SKU明细',
        '需求与库存参考底稿（非排产结果）',
        '来源与结果说明',
      ])
        await expect(frame.getByText(removed, { exact: true })).toHaveCount(0);
    }
  }
});

test('Tab1 is read only and leaf edits cancel or save atomically at either width', async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,\n郑州,B,产品乙,水饺,系列,组,,',
    ),
  });
  const matrix = frame.getByRole('region', { name: '大类预估需求数量', exact: true });
  const month = await frame.getByLabel('评估月份选择').inputValue();
  const actions = frame.locator('.dc-adjustment-actions');
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '叶子提报.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n${month},郑州,A,产品甲,汤圆,系列,组,100,100\n${month},郑州,B,产品乙,水饺,系列,组,200,200`,
    ),
  });
  await expect(matrix.getByRole('button', { name: '调整', exact: true })).toHaveCount(0);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const leafView = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  await leafView.getByLabel('搜索当前步骤').fill('产品');
  await expect(matrix.getByRole('button', { name: /^调整 / })).toHaveCount(0);
  await expect(matrix.locator('tbody input')).toHaveCount(0);
  const original = await page.evaluate(() => window.readView().localDrafts);
  for (const width of [1200, 600]) {
    await page.evaluate(
      (width) => (document.getElementById('root').style.width = `${width + 520}px`),
      width,
    );
    await actions.getByRole('button', { name: '调整', exact: true }).click();
    await expect(leafView.locator('tbody input:not([aria-label$=\"调整备注\"])')).toHaveCount(8);
    await expect(leafView.locator('tbody input').first()).toBeFocused();
    await expect(frame.getByLabel('评估版本选择')).toBeEnabled();
    await expect(frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' })).toBeEnabled();
    await leafView.getByLabel(`汤圆 组 A 郑州 ${month} 需求数量`, { exact: true }).fill('100');
    await leafView.getByLabel(`水饺 组 B 郑州 ${month} 需求数量`, { exact: true }).fill('200');
    assert.deepEqual(await page.evaluate(() => window.readView().localDrafts), original);
    await actions.getByRole('button', { name: '保存调整', exact: true }).click();
    await expect(actions.getByRole('alert')).toContainText('原因');
    await expect(actions.getByLabel('批量调整原因', { exact: true })).toBeFocused();
    if (width === 600)
      await actions.getByRole('button', { name: '取消', exact: true }).press('Enter');
    else await actions.getByLabel('批量调整原因', { exact: true }).press('Escape');
    await expect(leafView.locator('tbody input')).toHaveCount(0);
    await expect(actions.getByRole('button', { name: '调整', exact: true })).toBeFocused();
    await expect(frame.getByLabel('评估版本选择')).toBeEnabled();
    assert.deepEqual(await page.evaluate(() => window.readView().localDrafts), original);
  }
  await actions.getByRole('button', { name: '调整', exact: true }).click();
  await leafView.getByLabel(`汤圆 组 A 郑州 ${month} 需求数量`, { exact: true }).fill('100.375');
  await leafView.getByLabel(`水饺 组 B 郑州 ${month} 需求数量`, { exact: true }).fill('-1');
  await selectAdjustmentReason(frame, '批量校验');
  await actions.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect(actions.getByRole('alert')).toContainText('水饺');
  assert.deepEqual(await page.evaluate(() => window.readView().localDrafts), original);
  await leafView.getByLabel(`水饺 组 B 郑州 ${month} 需求数量`, { exact: true }).fill('200.125');
  await actions.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect(leafView.locator('tbody input')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => window.readView().localDrafts.drafts[0].adjustments.quantities.length),
    )
    .toBe(2);
  const adjusted = await page.evaluate(() => window.readView().localDrafts.drafts[0].adjustments);
  assert.equal(adjusted.quantities.length, 2);
  assert.deepEqual(
    adjusted.quantities.map((row) => row.quantity).sort((a, b) => a - b),
    [100.375, 200.125],
  );
  assert.ok(adjusted.quantities.every((row) => row.reason === '其他：批量校验'));
});

test('Step3 preserves unsaved category forecasts and remarks across steps and versions', async (t) => {
  const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
  const annual = ['A', 'B'].map((code, index) => ({
    ...Object.fromEntries(
      config.queries['facts.history-annual'].columns.map((column) => [column, null]),
    ),
    'agents_scm_cust_deliv_daily_di.belong_base': '郑州',
    'agents_scm_cust_deliv_daily_di.material_code': code,
    'agents_scm_cust_deliv_daily_di.material_name': index ? '产品乙' : '产品甲',
    'agents_scm_cust_deliv_daily_di.product_categ_name': '汤圆',
    'agents_scm_cust_deliv_daily_di.act_dl_qty_total': index ? 200 : 100,
  }));
  const { page, frame } = await mpsPage(t, config, ({ queryId }) => ({
    rows:
      queryId === 'facts.history-annual'
        ? annual
        : queryId.endsWith('.count')
          ? [{ total: 0 }]
          : [],
    returnedColumns: config.queries[queryId].columns,
    configVersion: 'adjustment-source',
    ...(queryId === 'facts.history-annual'
      ? { totalRowCount: 2, offset: 0, hasMorePages: false, dataStatus: 'ok', warnings: [] }
      : {}),
  }));
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,\n郑州,B,产品乙,汤圆,系列,组,,',
    ),
  });
  const month = (
    await frame.getByLabel('评估版本选择').locator('option:checked').textContent()
  ).match(/\d{4}-\d{2}/)[0];
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '提报.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      `月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n${month},郑州,A,产品甲,汤圆,系列,组,100,100\n${month},郑州,B,产品乙,汤圆,系列,组,200,200`,
    ),
  });
  await frame.getByRole('button', { name: '读取去年发运占比源值', exact: true }).click();
  await expect(frame.getByText('全年历史读取中…')).toHaveCount(0);
  const firstVersion = await frame.getByLabel('评估版本选择').inputValue();
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame
    .getByRole('dialog', { name: '新建评估版本' })
    .getByRole('button', { name: '创建本地版本', exact: true })
    .click();
  const secondVersion = await frame.getByLabel('评估版本选择').inputValue();
  await frame.getByLabel('评估版本选择').selectOption(firstVersion);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const process = frame.getByRole('region', { name: '需求加工与收敛', exact: true });
  const summary = frame.getByRole('region', { name: '大类需求总表', exact: true });
  await frame.locator('.dc-title-row').getByRole('button', { name: '调整', exact: true }).click();
  const quantity = summary.getByLabel(`汤圆 ${month} 需求数量`, { exact: true });
  await quantity.fill('600');
  await summary.getByLabel('汤圆 调整备注', { exact: true }).fill('促销备货核对');
  await selectAdjustmentReason(frame, '促销活动');
  await (
    await openMpsCategoryFilter(frame)
  )
    .getByRole('checkbox', { name: '汤圆', exact: true })
    .check();
  await process.getByLabel('需求层级视角').selectOption('base');
  await process.getByLabel('月份筛选', { exact: true }).selectOption(month);
  await process.getByRole('button', { name: '基地 · 郑州', exact: true }).click();
  const summaryScroll = process.getByRole('region', { name: '大类需求总表滚动区', exact: true });
  await summaryScroll.evaluate((element) => (element.scrollLeft = 160));
  const scroll = process.getByRole('region', { name: '加工后的需求横向滚动区', exact: true });
  await scroll.evaluate((element) => {
    element.scrollLeft = 350;
    element.scrollTop = 20;
  });
  await frame.locator('.ap-board-body').evaluate((element) => (element.scrollTop = 280));
  const positions = await Promise.all([
    scroll.evaluate((e) => [e.scrollLeft, e.scrollTop]),
    frame.locator('.ap-board-body').evaluate((e) => e.scrollTop),
  ]);
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  await (
    await openMpsCategoryFilter(frame)
  )
    .getByRole('checkbox', { name: '汤圆', exact: true })
    .check();
  await (
    await openMpsCategoryFilter(frame)
  )
    .getByRole('button', { name: '清空筛选', exact: true })
    .click();
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await expect(
    frame
      .getByRole('group', { name: '大类筛选', exact: true, includeHidden: true })
      .getByRole('checkbox', { name: '汤圆', exact: true, includeHidden: true }),
  ).toBeChecked();
  await expect(quantity).toHaveValue('600');
  await expect(summary.getByLabel('汤圆 调整备注', { exact: true })).toHaveValue('促销备货核对');
  await expect(frame.getByLabel('批量调整原因', { exact: true })).toHaveValue('促销活动');
  await expect(process.getByLabel('搜索当前步骤')).toHaveValue('');
  await expect(process.getByLabel('需求层级视角')).toHaveValue('base');
  await expect(process.getByLabel('月份筛选', { exact: true })).toHaveValue(month);
  await expect(process.getByRole('button', { name: '基地 · 郑州', exact: true })).toBeVisible();
  assert.deepEqual(await scroll.evaluate((e) => [e.scrollLeft, e.scrollTop]), positions[0]);
  assert.equal(await summaryScroll.evaluate((e) => e.scrollLeft), 160);
  assert.equal(await frame.locator('.ap-board-body').evaluate((e) => e.scrollTop), positions[1]);
  await frame.getByLabel('评估版本选择').selectOption(secondVersion);
  await expect(frame.getByRole('button', { name: '调整', exact: true })).toBeVisible();
  await frame.getByLabel('评估版本选择').selectOption(firstVersion);
  await expect(quantity).toHaveValue('600');
  await frame.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect(frame.locator('.dc-title-row').getByRole('alert')).toHaveCount(0);
  await expect(frame.getByRole('button', { name: '调整', exact: true })).toBeVisible();
  await process
    .locator('summary')
    .filter({ hasText: /^需求调整记录/ })
    .click();
  await expect(process.getByRole('region', { name: '需求调整记录', exact: true })).toContainText(
    '促销备货核对',
  );
  const download = page.waitForEvent('download');
  await process.getByRole('button', { name: '下载当前范围需求', exact: true }).click();
  const csv = await readFile(await (await download).path(), 'utf8');
  assert.match(csv, /200/);
  assert.match(csv, /400/);
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  await expectWorkflowExportValue(frame, `郑州 A ${month} 需求数量 计算过程`, '200');
  await expectWorkflowExportValue(frame, `郑州 B ${month} 需求数量 计算过程`, '400');
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await frame.getByRole('button', { name: '调整', exact: true }).click();
  await quantity.fill('900');
  await summary.getByLabel('汤圆 调整备注', { exact: true }).fill('应丢弃');
  await frame.getByRole('button', { name: '取消', exact: true }).click();
  await expect(quantity).toHaveText('600');
  await expect(summary.getByLabel('汤圆 调整备注', { exact: true })).toHaveText('促销备货核对');
  await page.locator('iframe').evaluate((element) => element.setAttribute('src', element.src));
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await expect(summary.getByLabel('汤圆 调整备注', { exact: true })).toHaveText('促销备货核对');
  await process
    .locator('summary')
    .filter({ hasText: /^需求调整记录/ })
    .click();
  await expect(process.getByRole('region', { name: '需求调整记录', exact: true })).toContainText(
    '促销备货核对',
  );
});
