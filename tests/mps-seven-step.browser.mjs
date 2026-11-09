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
  for (const step of steps) {
    await frame.locator('.ap-page-tab').filter({ hasText: step }).click();
    await expect(frame.getByRole('heading', { name: step, exact: true, level: 1 })).toBeVisible();
    await expect(frame.getByLabel('评估版本选择').locator('option:checked')).toContainText(
      '2026-12',
    );
    await expect(frame.getByText('需求权重', { exact: true })).toHaveCount(0);
    const badge = frame.locator('.ap-page-tab[data-active="true"] .ap-page-tab-step');
    assert.ok(
      await badge.evaluate((e) => {
        const style = getComputedStyle(e);
        return (
          style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.color !== style.backgroundColor
        );
      }),
    );
    assert(!/模拟|40\/40\/20/.test(await frame.locator('body').innerText()));
  }
  assert.equal(await page.evaluate(() => window.peerDraft), '历史草稿，请保留。');
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  const download = page.waitForEvent('download');
  await frame.getByRole('button', { name: '下载需求推导参考', exact: true }).click();
  const csv = await readFile(await (await download).path(), 'utf8');
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
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
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
  await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
    name: '发货核对.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库\n2026-09,郑州,A,产品甲,汤圆,系列甲,物料组甲,220,0,0,10,1000,200,100',
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估与缺口' }).click();
  await expectWorkflowExportValue(frame, '郑州 A 2026-10 期初库存 计算过程', '1,000');
  await expectWorkflowExportValue(frame, '郑州 A 2026-11 期初库存 计算过程', '—');
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await frame.getByRole('button', { name: '展开 郑州', exact: true }).click();
  const estimate = frame.getByLabel('郑州 A 整月预估发货', { exact: true });
  await estimate.fill('500');
  await estimate.press('Enter');
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  await expectWorkflowExportValue(frame, '郑州 A 2026-10 期初库存 计算过程', '800');
  await frame.getByLabel('评估版本选择').selectOption('local-1');
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

test('Tab1 adjusts the existing demand matrix without a duplicate review table', async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n郑州,A,产品甲,汤圆,系列,组,,',
    ),
  });
  const matrix = frame.getByRole('region', { name: '大类预估需求数量', exact: true });
  await expect(matrix).toBeVisible();
  await expect(frame.getByText('查看系统值、调整与缺项说明', { exact: true })).toHaveCount(0);
  await expect(matrix.getByRole('button', { name: /^调整 / })).toHaveCount(4);
  await expect(matrix.locator('.dc-demand-amount small')).toHaveCount(4);
  for (const width of [1200, 600]) {
    await page.evaluate(
      (width) => (document.getElementById('root').style.width = `${width + 520}px`),
      width,
    );
    await matrix
      .getByRole('button', { name: /^调整 / })
      .first()
      .click();
    const editor = matrix.getByRole('group', { name: '大类需求调整', exact: true });
    await expect(editor.getByLabel('调整需求数量', { exact: true })).toBeFocused();
    assert.equal(
      await editor.evaluate((element) => {
        const row = element.closest('tr');
        return (
          row?.classList.contains('mps-inline-edit-row') &&
          row.previousElementSibling?.querySelector('[aria-expanded="true"]') != null
        );
      }),
      true,
    );
    await expect(editor.getByLabel('调整需求数量', { exact: true })).toBeFocused();
    await editor.getByLabel('调整需求数量', { exact: true }).fill('100');
    await editor.getByLabel('调整需求数量', { exact: true }).press('Enter');
    await expect(editor.getByRole('alert')).toContainText('原因');
    await expect(editor.getByLabel('调整原因', { exact: true })).toBeFocused();
    if (width === 600) {
      await editor.getByRole('button', { name: '取消', exact: true }).focus();
      await editor.getByRole('button', { name: '取消', exact: true }).press('Enter');
    } else await editor.getByLabel('调整原因', { exact: true }).press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(matrix.getByRole('button', { name: /^调整 / }).first()).toBeFocused();
  }
});
