import test from 'node:test';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  openMpsProductDetails,
  mpsPageWithExactProductPeriod as mpsPage,
} from './helpers/mps-page.mjs';

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
  const month = (
    await frame.getByLabel('评估版本选择').locator('option:checked').textContent()
  ).match(/\d{4}-\d{2}/)[0];
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
      alignedColumns: [...element.tHead.rows[element.tHead.rows.length - 1].cells].map(
        (cell, index, headers) => ({
          header: box(cell),
          body: box(
            element.tBodies[0].rows[0].cells[
              element.tBodies[0].rows[0].cells.length - headers.length + index
            ],
          ),
        }),
      ),
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
  for (const { header, body } of geometry.alignedColumns) {
    assert.ok(
      Math.abs(header.left - body.left) < 3 && Math.abs(header.right - body.right) < 3,
      '横向滚动后表头与对应数据列对齐',
    );
  }
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
  for (const width of [2300, 1200, 600]) {
    await page.evaluate((width) => {
      document.getElementById('root').style.width = `${width + 300}px`;
    }, width);
    await table.locator('..').evaluate((element) => {
      element.scrollLeft = 0;
      element.scrollTop = 0;
    });
    if (width === 2300) {
      const edges = await table.evaluate((element) => ({
        table: element.getBoundingClientRect().right,
        wrapper: element.parentElement.getBoundingClientRect().right,
      }));
      assert.ok(Math.abs(edges.table - edges.wrapper) < 3, '宽窗末列与表格滚动区域右边缘对齐');
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
      name: `郑州 汤圆 ${longGroup} 月初 1 号库存 计算过程`,
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
    if (width === 600) {
      const sticky = await table.evaluate((element) => {
        const wrapper = element.parentElement.getBoundingClientRect();
        const first = element.tHead.rows[0].cells[0].getBoundingClientRect();
        const last = element.tHead.rows[1].lastElementChild.getBoundingClientRect();
        return { left: first.left - wrapper.left, right: last.right - wrapper.right };
      });
      assert.ok(Math.abs(sticky.left) < 3, '窄窗横向滚动后首列仍固定在左边缘');
      assert.ok(Math.abs(sticky.right) < 3, '窄窗横向滚动后结存列仍固定在右边缘');
    }
  }
});

test('第7步点击大类展开全部物料组和超过一页的SKU，旁支独立且表头可见', async (t) => {
  const { page, frame, month } = await navigationPage(t);
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估与缺口' }).click();
  await frame.getByRole('button', { name: '执行评估', exact: true }).click();
  const status = frame.locator('.wf-plan-status[role="status"]');
  await expect(status).toContainText('暂无单品月份满足排产条件，缺项待补');
  await expect(status).toContainText('满足排产条件 0/186 个单品月份');
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  await expect(status).toContainText('暂无单品月份满足排产条件，缺项待补');
  await expect(status).toContainText('满足排产条件 0/186 个单品月份');
  const statusBounds = await status.boundingBox();
  const exceptionBounds = await frame
    .getByRole('heading', { name: '产品范围与池外异常', exact: true })
    .boundingBox();
  assert.ok(statusBounds.y < exceptionBounds.y, '产销存结果状态显示在产品范围与池外异常之前');
  await frame.getByRole('button', { name: `展开全国 ${month}`, exact: true }).press('Enter');
  const table = frame.getByRole('table', { name: '求解单品明细', exact: true });
  const category = table.getByRole('button', { name: '产销存 大类 · 汤圆', exact: true });
  await category.press('Enter');
  await expect(table.getByText('P60', { exact: true })).toHaveCount(1);
  await expect(table.getByText('P61', { exact: true })).toHaveCount(0);
  const group = table.getByRole('button', { name: '产销存 汤圆 物料组 · G2', exact: true });
  await group.press('Enter');
  await expect(table.getByText('P60', { exact: true })).toHaveCount(0);
  await expect(table.getByText('P01', { exact: true })).toHaveCount(1);
  await group.press('Enter');
  for (const width of [1200, 600]) {
    await page.evaluate((width) => {
      document.getElementById('root').style.width = `${width + 300}px`;
    }, width);
    await checkScrolledTable(table, frame);
  }
  await frame.getByLabel('单品明细大类', { exact: true }).selectOption('水饺');
  await expect(table.getByText('P61', { exact: true })).toHaveCount(1);
  await expect(table.getByText('P01', { exact: true })).toHaveCount(0);
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

test('七步按业务层级排序，SKU编码顺序独立于同版标签优先级', async (t) => {
  const source = [
    ['遂平', '003', '汤圆', 'G2', '常规', '普通'],
    ['华南', '002', '水饺', 'G1', '下市品', '定制'],
    ['华东', '002', '水饺', 'G1', '新品', '定制'],
    ['西南', '001', '水饺', 'G1', '常规', '定制'],
    ['郑州', '004', '水饺', 'G2', '常规', '普通'],
  ];
  const { frame } = await mpsPage(
    t,
    config,
    ({ queryId, parameters }) => {
      const raw = source.map(([base, code, category, group, tag, name]) => ({
        ...Object.fromEntries(
          config.queries['products.detail'].columns.map((column) => [column, null]),
        ),
        stat_period: parameters.month,
        target_base: base,
        material_code: code,
        material_name: name,
        responsible_item: category,
        product_item: group,
        product_item_name: group,
        series: '系列',
        transfer_tag: tag,
        source_rows: 1,
      }));
      const rows = queryId.startsWith('products.') ? raw : [];
      return {
        rows: queryId.endsWith('.count') ? [{ total: rows.length }] : rows,
        returnedColumns: config.queries[queryId].columns,
        configVersion: 'business-table-fixture',
        totalRowCount: rows.length,
        offset: 0,
        hasMorePages: false,
      };
    },
    { time: '2026-11-15T12:00:00+08:00' },
  );
  const stickyHead = async (table) => {
    await expect(table).toBeVisible();
    assert.equal(
      await table.locator('thead').evaluate((element) => getComputedStyle(element).position),
      'sticky',
    );
  };
  const products = await openMpsProductDetails(frame);
  await expect(products.getByRole('table').locator('tbody tr')).toHaveCount(5);
  await expect(products.locator('.mps-sku-tag')).toHaveText([
    '常规',
    '定制',
    '新品',
    '下市',
    '常规',
  ]);
  await stickyHead(products.getByRole('table'));
  const month = (
    await frame.getByLabel('评估版本选择').locator('option:checked').textContent()
  ).match(/\d{4}-\d{2}/)[0];
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '业务排序.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n' +
        source
          .map(([base, code, category, group, , name]) =>
            [month, base, code, name, category, '系列', group, 10, 10].join(','),
          )
          .join('\n'),
    ),
  });
  await frame.locator('.ap-page-tab').filter({ hasText: '需求加工与收敛' }).click();
  const table = frame.getByRole('table', { name: '加工后的需求明细', exact: true });
  await frame.getByLabel('需求层级视角', { exact: true }).selectOption('base');
  assert.deepEqual(
    await table
      .locator('.wf-demand-level-0 th .wf-demand-toggle')
      .allTextContents()
      .then((rows) => rows.map((row) => row.match(/基地 · (\S+)/)[1])),
    ['郑州', '西南', '华东', '华南', '遂平'],
  );
  await frame.getByLabel('需求层级视角', { exact: true }).selectOption('national');
  const categories = table.locator('.wf-demand-level-0 button');
  await expect(categories).toHaveText(['大类 · 水饺', '大类 · 汤圆']);
  await categories.first().click();
  await expect(table.locator('.wf-demand-level-1 button')).toHaveText([
    '物料组 · G1 G1',
    '物料组 · G2 G2',
  ]);
  await expect(table.locator('.mps-sku-tag')).toHaveText(['定制', '新品', '常规']);
  await frame.getByLabel('基地筛选', { exact: true }).selectOption('华南');
  await expect(table.locator('.mps-sku-tag')).toHaveText(['下市']);

  await stickyHead(table);
  await frame.getByLabel('基地筛选', { exact: true }).selectOption('');
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  const shipmentMonth = new Date(`${month}-01T00:00:00Z`);
  shipmentMonth.setUTCMonth(shipmentMonth.getUTCMonth() - 1);
  const shipmentPeriod = shipmentMonth.toISOString().slice(0, 7);
  await frame.getByLabel('数据截止日').fill(`${shipmentPeriod}-22`);
  await frame.getByLabel('选择发货输入CSV', { exact: true }).setInputFiles({
    name: '排序发货.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,本月已发货,已备,未备,近三天日均发货量,月初库存,本月生产入库,剩余天数入库,近30天日均发货\n' +
        source
          .map(([base, code, category, group, , name]) =>
            [
              shipmentPeriod,
              base,
              code,
              name,
              category,
              '系列',
              group,
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
  const shipment = frame.getByRole('table', { name: '本月预估发货明细', exact: true });
  await expect(shipment.locator('.sp-base .sp-hierarchy-name')).toHaveText([
    '郑州',
    '西南',
    '华东',
    '华南',
    '遂平',
  ]);
  await shipment.getByRole('button', { name: '展开 全国合计', exact: true }).click();
  await expect(shipment.locator('.sp-level-1 .sp-hierarchy-name')).toHaveText(['水饺', '汤圆']);
  await shipment.getByRole('button', { name: '展开 全国合计 水饺', exact: true }).click();
  await expect(shipment.locator('.sp-sku .mps-sku-tag')).toHaveText(['定制', '新品', '常规']);
  await stickyHead(shipment);
  await frame.locator('.ap-page-tab').filter({ hasText: '主数据对应关系' }).click();
  const relations = frame.locator('.mps-relations-table');
  await expect(relations.locator('.mps-sku-tag')).toHaveText([
    '常规',
    '定制',
    '新品',
    '下市',
    '常规',
  ]);
  await stickyHead(relations);
  await frame.locator('.ap-page-tab').filter({ hasText: '约束与配置' }).click();
  await frame.getByText('高级配置：生产日历、件吨系数与资源分配', { exact: true }).click();
  const days = frame.getByRole('table', { name: '可用生产天数', exact: true });
  await expect(days.locator('tbody tr td:first-child')).toHaveText([
    '郑州',
    '郑州',
    '郑州',
    '西南',
    '西南',
    '西南',
    '华东',
    '华东',
    '华东',
    '华南',
    '华南',
    '华南',
    '遂平',
    '遂平',
    '遂平',
  ]);
  await expect(
    frame.getByRole('table', { name: '既有库存变动确认', exact: true }).locator('.mps-sku-tag'),
  ).toHaveCount(15);
  await stickyHead(days);
  await frame.locator('.ap-page-tab').filter({ hasText: '产能评估与缺口' }).click();
  await frame.getByRole('button', { name: '执行评估', exact: true }).click();
  await expect(frame.locator('.wf-plan-status[role="status"]')).toContainText(
    '满足排产条件',
  );
  const capacity = frame.getByRole('table', { name: '基地需求与月总产能', exact: true });
  await expect(capacity.locator('tbody tr td:first-child')).toHaveText([
    '郑州',
    '西南',
    '华东',
    '华南',
    '遂平',
    '全国',
  ]);
  await stickyHead(capacity);
  await frame.locator('.ap-page-tab').filter({ hasText: '产销存报告' }).click();
  await frame.getByRole('button', { name: `展开全国 ${month}`, exact: true }).click();
  const report = frame.getByRole('table', { name: '求解单品明细', exact: true });
  await expect(report.locator('tbody tr td:first-child')).toHaveText(['大类', '大类']);
  await expect(report.getByRole('button', { name: /^产销存 大类/ })).toHaveText(['水饺', '汤圆']);
  await report.getByRole('button', { name: '产销存 大类 · 水饺', exact: true }).click();
  await expect(report.locator('.mps-sku-tag')).toHaveText(['定制', '新品', '常规']);
  await stickyHead(report);
});
