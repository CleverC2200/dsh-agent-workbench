import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { authorPage } from './helpers/author-page.mjs';
import { workflowExportRows } from './helpers/mps-workflow-export.mjs';

async function open(t) {
  const page = await authorPage(t);
  await page.clock.install({ time: new Date('2026-11-17T12:00:00+08:00') });
  await page.evaluate(() => window.openAuthor('mps', 1200));
  await expect(page.frameLocator('iframe').getByLabel('评估月份选择')).toBeVisible();
  await page.evaluate(async () => {
    const draft = {
      id: 'existing-inbound',
      name: '已有计划验收',
      month: '2026-12',
      pull: 'monthly',
    };
    const seed = { version: 1, localDrafts: { format: 1, selected: draft.id, drafts: [draft] } };
    Object.assign(draft, {
      month: '2026-12',
      inputs: {
        products: {
          file: '产品.csv',
          rows: [
            {
              基地: '郑州',
              产品编码: 'A',
              产品名称: '产品A',
              大类: '点心',
              系列: '系列',
              物料组: '组',
            },
          ],
        },
      },
      constraints: {
        safetyDays: [],
        turnoverDays: [{ base: '郑州', code: 'A', days: 0 }],
        rules: { local: [] },
      },
      adjustments: {
        categoryDemand: [],
        shares: [],
        history: [],
        quantities: ['2026-12', '2027-01', '2027-02', '2027-03'].map((month) => ({
          kind: 'base-sku',
          month,
          category: '点心',
          group: '组',
          base: '郑州',
          code: 'A',
          quantity: 0,
          systemValue: null,
          reason: '已确认无需求',
          at: '2026-11-17T00:00:00.000Z',
        })),
      },
      shipment: {
        values: {
          [JSON.stringify(['郑州', 'A'])]: {
            value: 1,
            source: '人工确认当月发货1件',
            previous: null,
          },
        },
        cutoff: '2026-11-30',
        activeSource: 'local-file',
        file: '库存.csv',
        rows: [
          {
            month: '2026-11',
            base: '郑州',
            code: 'A',
            name: '产品A',
            category: '点心',
            series: '系列',
            group: '组',
            shipped: 1,
            prepped: 0,
            unprepped: 0,
            daily3: 1,
            open: 101,
            inbound: 0,
            remaining: 0,
          },
        ],
        transferPlans: [{ month: '2026-11', base: '郑州', code: 'A', inbound: 0, outbound: 0 }],
      },
    });
    await window.openAuthor('mps', 1200, seed);
  });
  const frame = page.frameLocator('iframe');
  await expect(frame.getByLabel('评估月份选择')).toHaveValue('2026-12');
  return { page, frame };
}
const step = (frame, name) => frame.locator('.ap-page-tab').filter({ hasText: name }).click();
const current = (page) =>
  page.evaluate(() => {
    const state = window.readView().localDrafts;
    return state.drafts.find((row) => row.id === state.selected);
  });

test('既有入库确认保存重开后进入计算与真实下载，取消、缺计划和版本隔离保留', async (t) => {
  const { page, frame } = await open(t);
  await step(frame, '约束与配置');
  const panel = frame.getByRole('region', { name: '既有库存变动确认', exact: true });
  await expect(panel).toBeVisible();
  const view = frame.getByRole('region', { name: '约束与配置', exact: true });
  await view.getByRole('button', { name: '调整', exact: true }).click();
  await frame
    .getByLabel('郑州 A 2026-12 既有生产入库', { exact: true })
    .fill('999', { timeout: 5000 });
  await view.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal((await current(page)).inventoryMovements, undefined);
  await view.getByRole('button', { name: '调整', exact: true }).click();
  for (const [month, production, transit] of [
    ['2026-12', '20', '0'],
    ['2027-01', '0', '5'],
  ]) {
    for (const [title, value] of [
      ['既有生产入库', production],
      ['既有在途入库', transit],
      ['既有调入', '0'],
      ['既有调出', '0'],
    ])
      await frame.getByLabel(`郑州 A ${month} ${title}`, { exact: true }).fill(value);
    await frame.getByLabel(`郑州 A ${month} 既有计划来源`, { exact: true }).fill('已存在订单核对');
    await frame
      .getByLabel(`郑州 A ${month} 既有计划确认原因`, { exact: true })
      .fill('核对已有入库，零值确认无计划');
  }
  await view.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect.poll(async () => (await current(page)).inventoryMovements?.length).toBe(2);
  const saved = (await current(page)).inventoryMovements;
  assert.equal(saved.length, 2);
  await page.evaluate(async () =>
    window.openAuthor('mps', 1200, structuredClone(window.readView())),
  );
  await step(frame, '约束与配置');
  await expect(frame.getByLabel('郑州 A 2026-12 既有生产入库', { exact: true })).toHaveText('20');
  await expect.poll(async () => (await current(page)).inventoryMovements).toEqual(saved);
  await step(frame, '本月预估发货');
  await expect(frame.getByText('库存.csv', { exact: false }).first()).toBeVisible();
  await step(frame, '需求加工与收敛');
  const rows = await workflowExportRows(frame);
  assert.deepEqual(
    rows
      .filter((row) => row.产品编码 === 'A' && ['2026-12', '2027-01', '2027-02'].includes(row.月份))
      .map((row) => [row.月份, row.参考期末库存, row.既有计划状态]),
    [
      ['2026-12', '120', '已确认'],
      ['2027-01', '125', '已确认'],
      ['2027-02', '', '待补，未知不补0'],
    ],
  );
  assert.ok(
    rows
      .filter((row) => row.月份 === '2026-12' && row.产品编码 === 'A')
      .every((row) => row.既有计划来源 === '已存在订单核对'),
  );
  await step(frame, '约束与配置');
  await view.getByRole('button', { name: '调整', exact: true }).click();
  for (const title of ['既有生产入库', '既有在途入库', '既有调入', '既有调出'])
    await frame.getByLabel(`郑州 A 2027-02 ${title}`, { exact: true }).fill('0');
  await frame.getByLabel('郑州 A 2027-02 既有计划来源', { exact: true }).fill('已有订单核对');
  await frame.getByLabel('郑州 A 2027-02 既有计划确认原因', { exact: true }).fill('确认无计划');
  await view.getByRole('button', { name: '保存调整', exact: true }).click();
  await step(frame, '需求加工与收敛');
  const zeroConfirmed = (await workflowExportRows(frame)).find(
    (row) => row.产品编码 === 'A' && row.月份 === '2027-02',
  );
  assert.equal(zeroConfirmed.参考期末库存, '125');
  assert.equal(zeroConfirmed.既有计划状态, '已确认');
  await step(frame, '约束与配置');
  await view.getByRole('button', { name: '调整', exact: true }).click();
  await frame.getByRole('button', { name: '郑州 A 2027-02 恢复既有计划待补', exact: true }).click();
  await view.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect.poll(async () => (await current(page)).inventoryMovements).toEqual(saved);
  await step(frame, '需求确认');
  await frame.getByLabel('评估月份选择', { exact: true }).selectOption('2027-01');
  await expect.poll(async () => (await current(page)).month).toBe('2027-01');
  assert.equal((await current(page)).inventoryMovements, undefined);
  await frame.getByLabel('评估月份选择', { exact: true }).selectOption('2026-12');
  await expect.poll(async () => (await current(page)).month).toBe('2026-12');
  await expect.poll(async () => (await current(page)).inventoryMovements).toEqual(saved);
});
