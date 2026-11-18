import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { authorPage } from './helpers/author-page.mjs';
import { expandShipmentBase } from './helpers/mps-shipment.mjs';
import { mpsDownloadText } from './helpers/mps-download.mjs';

const upload = (frame, label, content) =>
  frame.getByLabel(label, { exact: true }).setInputFiles({
    name: '分类.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(content),
  });
const step = (frame, name) => frame.locator('.ap-page-tab').filter({ hasText: name }).click();
const download = async (page, button) => {
  const waiting = page.waitForEvent('download');
  await button.click();
  return mpsDownloadText(await (await waiting).path());
};

async function open(
  t,
  products = [
    ['A', '甲类'],
    ['B', '乙类'],
    ['C', '丙类'],
  ],
) {
  const page = await authorPage(t, { time: '2026-11-18T12:00:00+08:00' });
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  await frame.getByRole('dialog').getByLabel('评估月份', { exact: true }).fill('2026-12');
  await frame.getByRole('button', { name: '创建本地版本', exact: true }).click();
  await upload(
    frame,
    '选择产品关系CSV或Excel',
    '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n' +
      products
        .map(([code, category]) => `郑州,${code},产品${code},${category},系列,${category}组,,`)
        .join('\n'),
  );
  return { page, frame, products };
}

test('前五步共享两类联选，下载和异常随筛选，后两步与保存保留全量', async (t) => {
  const { page, frame, products } = await open(t);
  const filter = frame.getByRole('group', { name: '大类筛选', exact: true });
  await filter.getByRole('checkbox', { name: '甲类', exact: true }).check();
  await filter.getByRole('checkbox', { name: '乙类', exact: true }).check();
  const details = frame.getByRole('region', { name: '产品明细', exact: true });
  await expect(details.locator('tbody tr')).toHaveCount(2);
  await expect(details.locator('tbody tr').first().locator('td').nth(9)).toHaveText('');
  await step(frame, '本月预估发货');
  await expect(filter.getByRole('checkbox', { name: '乙类', exact: true })).toBeChecked();
  await frame.getByLabel('数据截止日', { exact: true }).fill('2026-11-17');
  await upload(
    frame,
    '选择发货输入CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库,近30天日均发货\n' +
      products
        .map(
          ([code, category]) =>
            `2026-11,郑州,${code},产品${code},${category},系列,${category}组,10,,0,1,1,0,0,1`,
        )
        .join('\n'),
  );
  const table = frame.getByRole('table', { name: '本月预估发货明细', exact: true });
  await expect(
    table.getByRole('button', { name: '全国合计 本月已发货 计算过程', exact: true }),
  ).toHaveText('20');
  const csv = await download(page, frame.getByRole('button', { name: '下载明细', exact: true }));
  assert.match(csv, /甲类/);
  assert.match(csv, /乙类/);
  assert.doesNotMatch(csv, /丙类/);
  await frame.getByText('发货与库存异常报告', { exact: true }).click();
  const issues = await download(
    page,
    frame.getByRole('button', { name: '下载发货与库存异常', exact: true }).first(),
  );
  assert.match(issues, /A/);
  assert.match(issues, /B/);
  assert.doesNotMatch(issues, /"C"/);
  await step(frame, '需求确认');
  const shipmentIssues = frame.getByRole('region', { name: '待定单品异常', exact: true });
  const excluded = await download(
    page,
    shipmentIssues.getByRole('button', { name: '下载待定单品异常CSV', exact: true }),
  );
  assert.match(excluded, /发货截止日/);
  assert.match(excluded, /2026-11-17/);
  assert.doesNotMatch(excluded, /丙类/);

  for (const name of ['需求加工与收敛', '主数据对应关系', '约束与配置']) {
    await step(frame, name);
    await expect(filter.getByRole('checkbox', { name: '甲类', exact: true })).toBeChecked();
    await expect(filter.getByRole('checkbox', { name: '乙类', exact: true })).toBeChecked();
    if (name === '约束与配置') {
      const inventory = frame.getByRole('region', { name: '基地与单品目标库存', exact: true });
      await expect(inventory).not.toContainText('产品C');
    }
  }
  for (const name of ['产能评估与缺口', '产销存报告']) {
    await step(frame, name);
    await expect(filter).toHaveCount(0);
  }
  const report = await download(
    page,
    frame.getByRole('button', { name: '下载需求推导参考', exact: true }),
  );
  assert.match(report, /丙类/);
  await step(frame, '需求确认');
  await filter.getByRole('button', { name: '清空筛选', exact: true }).click();
  await expect(details.locator('tbody tr')).toHaveCount(3);
  await step(frame, '本月预估发货');
  await expect(
    table.getByRole('button', { name: '全国合计 本月已发货 计算过程', exact: true }),
  ).toHaveText('30');
  await frame.getByRole('button', { name: '页面说明', exact: true }).click();
  const saved = JSON.parse(
    await download(page, frame.getByRole('button', { name: '导出核对底稿', exact: true })),
  );
  assert.equal(saved.draft.products.length, 3);
  assert.equal(saved.draft.shipment.rows.length, 3);
});

test('发货物料组仅一页隐藏整个分页条，多页仍能查看最后一个单品', async (t) => {
  const products = Array.from({ length: 26 }, (_, i) => [`A${i}`, '甲类']);
  products.push(['B', '乙类']);
  const { frame } = await open(t, products);
  await step(frame, '本月预估发货');
  await frame.getByLabel('数据截止日', { exact: true }).fill('2026-11-17');
  await upload(
    frame,
    '选择发货输入CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库,近30天日均发货\n' +
      products
        .map(
          ([code, category]) =>
            `2026-11,郑州,${code},产品${code},${category},系列,${category}组,1,0,0,1,0,0,0,1`,
        )
        .join('\n'),
  );
  await expandShipmentBase(frame, '郑州');
  await expect(
    frame.getByRole('button', { name: '郑州 乙类 乙类组 下一页单品', exact: true }),
  ).toHaveCount(0);
  await expect(frame.locator('.sp-sku-pages').filter({ hasText: '郑州 乙类' })).toHaveCount(0);
  const next = frame.getByRole('button', { name: '郑州 甲类 甲类组 下一页单品', exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(
    frame.getByRole('button', { name: '郑州 A25 本月已发货 计算过程', exact: true }),
  ).toBeVisible();
});

test('筛选内汇总调整及恢复只修改当前叶子，隐藏大类的调整和输入继续保留', async (t) => {
  const { page, frame, products } = await open(t);
  await step(frame, '本月预估发货');
  await frame.getByLabel('数据截止日', { exact: true }).fill('2026-11-17');
  await upload(
    frame,
    '选择发货输入CSV',
    '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库,近30天日均发货\n' +
      products
        .map(
          ([code, category]) =>
            `2026-11,郑州,${code},产品${code},${category},系列,${category}组,10,0,0,1,0,0,10,1`,
        )
        .join('\n'),
  );
  const adjust = async (name, value) => {
    await frame.getByRole('button', { name: '调整', exact: true }).click();
    await frame.getByLabel(name, { exact: true }).fill(value);
    await expect(
      frame.getByRole('group', { name: '大类筛选', exact: true }).getByRole('checkbox').first(),
    ).toBeDisabled();
    await frame.getByRole('button', { name: '保存调整', exact: true }).click();
  };
  await adjust('郑州 剩余天数入库', '60');
  const filter = frame.getByRole('group', { name: '大类筛选', exact: true });
  await filter.getByRole('checkbox', { name: '甲类', exact: true }).check();
  await filter.getByRole('checkbox', { name: '乙类', exact: true }).check();
  await adjust('全国合计 整月预估发货', '120');
  await adjust('郑州 剩余天数入库', '30');
  await adjust('郑州 剩余天数入库', '');
  await filter.getByRole('button', { name: '清空筛选', exact: true }).click();
  await frame.getByRole('button', { name: '页面说明', exact: true }).click();
  const saved = JSON.parse(
    await download(page, frame.getByRole('button', { name: '导出核对底稿', exact: true })),
  );
  assert.equal(saved.draft.shipment.rows.length, 3);
  assert.equal(saved.draft.shipment.values['["郑州","A"]'].value, 60);
  assert.equal(saved.draft.shipment.values['["郑州","B"]'].value, 60);
  assert.equal(saved.draft.shipment.values['["郑州","C"]'], undefined);
  assert.deepEqual(saved.draft.shipment.remaining['郑州'].values, { '["郑州","C"]': 20 });
});
