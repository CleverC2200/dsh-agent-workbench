import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mpsPageWithExactProductPeriod as mpsPage } from './helpers/mps-page.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));

const longGroup = 'G1超长物料组名称用于复现名称覆盖第一个数量列的现场问题';
const products = Array.from({ length: 62 }, (_, index) => ({
  code: `P${String(index + 1).padStart(2, '0')}`,
  name: `产品${index + 1}`,
  category: index < 60 ? '汤圆' : '水饺',
  group: index < 30 ? longGroup : index < 60 ? 'G2' : 'G3',
}));

async function navigationPage(t) {
  const { page, frame } = await mpsPage(
    t,
    config,
    ({ queryId }) => ({
      rows: queryId.endsWith('.count') ? [{ total: 0 }] : [],
      returnedColumns: queryId.endsWith('.count') ? ['total'] : config.queries[queryId].columns,
      configVersion: 'table-navigation-fixture',
      dataStatus: 'ok',
      totalRowCount: 0,
      offset: 0,
      hasMorePages: false,
    }),
    { time: '2026-11-15T12:00:00+08:00' },
  );
  page.setDefaultTimeout(5000);
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '范围.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,物料组名称,老品编码,老品名称\n' +
        products
          .map((row) =>
            ['郑州', row.code, row.name, row.category, '系列', row.group, row.group, '', ''].join(
              ',',
            ),
          )
          .join('\n'),
    ),
  });
  const month = await frame.getByLabel('评估月份选择').inputValue();
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '提报.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n' +
        products
          .map((row) =>
            [month, '郑州', row.code, row.name, row.category, '系列', row.group, 10, 10].join(','),
          )
          .join('\n'),
    ),
  });
  return { page, frame, month };
}

test('第3步点击大类一次展开全部物料组和SKU，旁支与筛选独立', async (t) => {
  const { frame } = await navigationPage(t);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await frame.getByLabel('需求层级视角', { exact: true }).selectOption('national');
  const table = frame.getByRole('table', { name: '加工后的需求明细', exact: true });
  const category = table.getByRole('button', { name: '全国 大类 · 汤圆', exact: true });
  await category.press('Enter');
  await expect(table.getByText('SKU · P01 产品1', { exact: true })).toBeVisible();
  await expect(table.getByText('SKU · P60 产品60', { exact: true })).toHaveCount(1);
  await expect(table.getByText('SKU · P61 产品61', { exact: true })).toHaveCount(0);
  const group = table.getByRole('button', { name: '全国 物料组 · G2 G2', exact: true });
  await group.press('Enter');
  await expect(table.getByText('SKU · P60 产品60', { exact: true })).toHaveCount(0);
  await expect(table.getByText('SKU · P01 产品1', { exact: true })).toHaveCount(1);
  await category.press('Enter');
  await category.press('Enter');
  await expect(table.getByText('SKU · P60 产品60', { exact: true })).toHaveCount(1);
  await frame.getByLabel('搜索当前步骤', { exact: true }).fill('产品61');
  await expect(table.getByText('SKU · P61 产品61', { exact: true })).toHaveCount(1);
  await expect(table.getByText('SKU · P01 产品1', { exact: true })).toHaveCount(0);
});

async function shipmentTable(frame) {
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await frame.getByLabel('数据截止日').fill('2026-10-22');
  await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
    name: '发货.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库,近30天日均发货\n' +
        products
          .map((row) =>
            [
              '2026-10',
              '郑州',
              row.code,
              row.name,
              row.category,
              '系列',
              row.group,
              10,
              0,
              0,
              1,
              10,
              0,
              0,
              1,
            ].join(','),
          )
          .join('\n'),
    ),
  });
  return frame.getByRole('table', { name: '本月预估发货明细', exact: true });
}

test('第2步点击大类显示两个物料组的全部SKU且保留旁支', async (t) => {
  const { frame } = await navigationPage(t);
  const table = await shipmentTable(frame);
  await table.getByRole('button', { name: '展开 郑州', exact: true }).press('Enter');
  await table.getByRole('button', { name: '展开 郑州 汤圆', exact: true }).press('Enter');
  await expect(table.locator('.sp-sku')).toHaveCount(60);
  await expect(table.getByText('产品60', { exact: true })).toHaveCount(1);
  await expect(table.getByText('产品61', { exact: true })).toHaveCount(0);
  await table
    .getByRole('button', { name: `收起 郑州 汤圆 ${longGroup}`, exact: true })
    .press('Enter');
  await expect(table.locator('.sp-sku')).toHaveCount(30);
  await table.getByRole('button', { name: '收起 郑州 汤圆', exact: true }).press('Enter');
  await table.getByRole('button', { name: '展开 郑州 水饺', exact: true }).press('Enter');
  await expect(table.locator('.sp-sku')).toHaveCount(2);
});

async function checkScrolledTable(table, frame) {
  await table.scrollIntoViewIfNeeded();
  const wrapper = table.locator('..');
  await wrapper.evaluate((element) => {
    element.scrollTop = 180;
    element.scrollLeft = 120;
  });
  const geometry = await table.evaluate((element) => {
    const box = (item) => {
      const r = item.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    const wrapper = element.parentElement;
    return {
      wrapper: box(wrapper),
      head: box(element.tHead),
      scrollTop: wrapper.scrollTop,
      scrollLeft: wrapper.scrollLeft,
      horizontalOverflow: wrapper.scrollWidth > wrapper.clientWidth,
      headers: [...element.tHead.rows].map((row) => box(row)),
    };
  });
  assert.ok(geometry.scrollTop > 100, '长表必须实际发生纵向滚动');
  if (geometry.horizontalOverflow) assert.ok(geometry.scrollLeft > 0, '窄于内容时实际发生横向滚动');
  assert.ok(Math.abs(geometry.head.top - geometry.wrapper.top) < 3, '表头保留在滚动区域顶部');
  for (let index = 1; index < geometry.headers.length; index++)
    assert.ok(
      geometry.headers[index].top >= geometry.headers[index - 1].bottom - 2,
      '双层表头不互相覆盖',
    );
  const board = frame.locator('.ap-board-body');
  const before = await board.evaluate((element) => element.scrollTop);
  await board.evaluate((element) => {
    element.scrollTop = Math.max(0, element.scrollTop - 50);
  });
  assert.notEqual(
    await board.evaluate((element) => element.scrollTop),
    before,
    '页面也实际发生滚动',
  );
  const head = await table.locator('thead').boundingBox();
  const viewport = await board.boundingBox();
  assert.ok(head.y >= viewport.y && head.y < viewport.y + viewport.height, '页面滚动后列名仍可见');
  if (process.env.MPS06_EVIDENCE_DIR) {
    const name = await table.getAttribute('aria-label');
    const width = Math.round((await wrapper.boundingBox()).width);
    await table
      .page()
      .screenshot({ path: `${process.env.MPS06_EVIDENCE_DIR}/${name}-${width}.png` });
  }
}

test('第2步宽窗表格铺满，长物料组不盖数量且正常与窄窗滚动保留表头', async (t) => {
  const { page, frame } = await navigationPage(t);
  const table = await shipmentTable(frame);
  await table.getByRole('button', { name: '展开 郑州', exact: true }).press('Enter');
  await table.getByRole('button', { name: '展开 郑州 汤圆', exact: true }).press('Enter');
  for (const width of [1830, 1200, 715, 600, 390, 1200]) {
    await page.evaluate((width) => {
      document.getElementById('root').style.width = `${width + 300}px`;
    }, width);
    const compact = width <= 715;
    if (compact) await expect(table).toHaveAttribute('data-compact', 'true');
    else await expect(table).not.toHaveAttribute('data-compact', 'true');
    await table.locator('..').evaluate((element) => {
      element.scrollLeft = 0;
      element.scrollTop = 0;
    });
    if (width === 1830) {
      const edges = await table.evaluate((element) => ({
        table: element.getBoundingClientRect().right,
        wrapper: element.parentElement.getBoundingClientRect().right,
      }));
      assert.ok(Math.abs(edges.table - edges.wrapper) < 3, '宽窗末列与表格滚动区域右边缘对齐');
    }
    if (compact) {
      const keyColumns = await table.evaluate((element) => {
        const wrapper = element.parentElement;
        const bounds = wrapper.getBoundingClientRect();
        const headers = [...element.tHead.rows[1].cells].slice(0, 3);
        const values = [...element.tBodies[0].rows[0].cells].slice(1, 4);
        return {
          headings: headers.map((cell) => cell.innerText.split('\n')[0]),
          leftWidth: element.tHead.rows[0].cells[0].getBoundingClientRect().width,
          visible: [...headers, ...values].every((cell) => {
            const box = cell.getBoundingClientRect();
            return (
              box.left >= bounds.left - 1 && box.right <= bounds.left + wrapper.clientWidth + 1
            );
          }),
        };
      });
      assert.deepEqual(keyColumns.headings, ['本月已发货', '整月预估发货', '预计月末结存']);
      assert.ok(keyColumns.leftWidth <= 149, '窄窗固定首列采用紧凑宽度');
      assert.ok(keyColumns.visible, '三项关键数量的表头和值在首屏完整可见');
    }
    const group = table.getByRole('row').filter({
      has: frame.getByRole('button', { name: `收起 郑州 汤圆 ${longGroup}`, exact: true }),
    });
    const bounds = await group.getByRole('rowheader').evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const rect = range.getBoundingClientRect();
      const cell = element.getBoundingClientRect();
      return {
        textRight: rect.right,
        cellRight: cell.right,
        clipped: getComputedStyle(element).overflowX === 'hidden',
      };
    });
    assert.ok(bounds.clipped || bounds.textRight <= bounds.cellRight + 1, '名称在首列边界内显示');
    await expect(group.getByText(longGroup, { exact: true })).toHaveAttribute('title', longGroup);
    assert.ok(
      await group
        .getByText(longGroup, { exact: true })
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
      '完整物料组名称在首列内换行可读',
    );
    const quantity = group.getByRole('button', {
      name: `郑州 汤圆 ${longGroup} 本月已发货 计算过程`,
      exact: true,
    });
    await expect(quantity).toHaveText('300');
    await quantity.scrollIntoViewIfNeeded();
    assert.ok(
      await quantity.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
        );
      }),
      '首个数量列不被名称或固定列覆盖',
    );

    await checkScrolledTable(table, frame);
    if (compact) {
      const sticky = await table.evaluate((element) => {
        const wrapper = element.parentElement.getBoundingClientRect();
        const first = element.tHead.rows[0].cells[0].getBoundingClientRect();
        const last = element.tHead.rows[1].lastElementChild;
        return {
          left: first.left - wrapper.left,
          rightPinned: getComputedStyle(last).position === 'sticky',
        };
      });
      assert.ok(Math.abs(sticky.left) < 3, '窄窗横向滚动后首列仍固定在左边缘');
      assert.equal(sticky.rightPinned, false, '窄窗右侧留给滚动的明细列');
    }
  }
});

test('第7步点击大类展开全部物料组和超过一页的SKU，旁支独立且表头可见', async (t) => {
  const { page, frame, month } = await navigationPage(t);
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估与缺口' }).click();
  await frame.getByRole('button', { name: '执行评估', exact: true }).click();
  const status = frame.getByRole('status').filter({ hasText: '单品月份' });
  await expect(status).toContainText('暂无单品月份满足排产条件，缺项待补');
  await expect(status).toContainText('已评估 0/186 个单品月份');
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  await expect(status).toContainText('暂无单品月份满足排产条件，缺项待补');
  await expect(status).toContainText('已评估 0/186 个单品月份');
  const summary = frame.getByRole('table', { name: '产销存汇总', exact: true });
  await expect(summary.getByRole('cell', { name: '待评估', exact: true }).first()).toBeVisible();
  const summaryBounds = await summary.boundingBox();
  const equipment = frame.locator('summary').filter({ hasText: '设备范围与产品占用' });
  await expect(equipment.locator('..')).not.toHaveAttribute('open', '');
  const equipmentBounds = await equipment.boundingBox();
  assert.ok(summaryBounds.y < equipmentBounds.y, '产销存汇总先于设备详情');
  const statusBounds = await status.boundingBox();
  const exceptionBounds = await frame
    .getByRole('heading', { name: '产品范围与池外异常', exact: true })
    .boundingBox();
  assert.ok(statusBounds.y < exceptionBounds.y, '产销存结果状态显示在产品范围与池外异常之前');
  await frame.getByRole('button', { name: `展开全国 ${month}`, exact: true }).press('Enter');
  const table = frame.getByRole('table', { name: '求解单品明细', exact: true });
  const summaryOdm = frame
    .getByRole('table', { name: '产销存汇总', exact: true })
    .locator(':scope > thead')
    .getByRole('columnheader', { name: 'ODM默认计划到货量', exact: true });
  const detailOdm = table.getByRole('columnheader', { name: 'ODM默认计划到货量', exact: true });
  await expect(frame.locator('.wf-plan-selected')).toContainText('62 条基地 SKU 记录');
  await expect(frame.locator('.wf-plan-detail-filters')).toContainText('62 个去重单品');
  for (const heading of [summaryOdm, detailOdm]) {
    assert.ok(await heading.evaluate((cell) => cell.scrollWidth <= cell.clientWidth + 1));
  }
  const category = table.getByRole('button', { name: '产销存 大类 · 汤圆', exact: true });
  await category.press('Enter');
  await expect(table.getByRole('cell', { name: 'P60', exact: true })).toHaveCount(1);
  await expect(table.getByRole('cell', { name: 'P61', exact: true })).toHaveCount(0);
  const group = table.getByRole('button', { name: '产销存 汤圆 物料组 · G2', exact: true });
  await group.press('Enter');
  await expect(table.getByRole('cell', { name: 'P60', exact: true })).toHaveCount(0);
  await expect(table.getByRole('cell', { name: 'P01', exact: true })).toHaveCount(1);
  await group.press('Enter');
  for (const width of [1200, 600]) {
    await page.evaluate((width) => {
      document.getElementById('root').style.width = `${width + 300}px`;
    }, width);
    await checkScrolledTable(table, frame);
  }
  await frame.getByLabel('单品明细大类', { exact: true }).selectOption('水饺');
  await expect(table.getByRole('cell', { name: 'P61', exact: true })).toHaveCount(1);
  await expect(table.getByRole('cell', { name: 'P01', exact: true })).toHaveCount(0);
});

test('第3步正常和窄窗滚动后表头与首列保持可辨', async (t) => {
  const { page, frame } = await navigationPage(t);
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  await frame.getByLabel('需求层级视角', { exact: true }).selectOption('national');
  const table = frame.getByRole('table', { name: '加工后的需求明细', exact: true });
  await table.getByRole('button', { name: '全国 大类 · 汤圆', exact: true }).press('Enter');
  for (const width of [1200, 600]) {
    await page.evaluate((width) => {
      document.getElementById('root').style.width = `${width + 300}px`;
    }, width);
    await checkScrolledTable(table, frame);
    const readable = await table
      .locator('tbody tr')
      .nth(1)
      .evaluate((element) => {
        const first = element.cells[0].getBoundingClientRect();
        const clip = element.closest('table').parentElement.getBoundingClientRect();
        return [...element.cells].slice(1).some((cell) => {
          const rect = cell.getBoundingClientRect();
          return rect.left >= first.right && rect.right <= clip.right;
        });
      });
    assert.ok(readable, '数量列仍有独立的可见区域');
  }
});
