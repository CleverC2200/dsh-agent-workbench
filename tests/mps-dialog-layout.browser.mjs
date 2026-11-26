import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { mpsPageWithExactProductPeriod as mpsPage } from './helpers/mps-page.mjs';
import { authorPage } from './helpers/author-page.mjs';

const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
const evidence = process.env.MPS_DIALOG_EVIDENCE;
async function fixture(t) {
  return mpsPage(
    t,
    config,
    ({ queryId, parameters }) => {
      const fields = queryId.startsWith('products.')
        ? {
            stat_period: parameters.month,
            material_name: '测试产品',
            responsible_item: '点心',
            product_item: '包点',
          }
        : { sub_category: '点心', plannum_total: 8, allnum_total: 9 };
      const detail = queryId === 'products.detail' || queryId === 'facts.report';
      const rows = queryId.endsWith('.count')
        ? [{ total: queryId === 'products.count' ? 25 : queryId === 'facts.report.count' ? 45 : 0 }]
        : detail
          ? Array.from({ length: queryId === 'products.detail' ? 25 : 45 }, (_, index) => ({
              ...Object.fromEntries(
                config.queries[queryId].columns.map((column) => [column, null]),
              ),
              belong_base: '华南',
              material_code: `OUT${index}`,
              ...fields,
            }))
          : [];
      return {
        rows,
        returnedColumns: config.queries[queryId].columns,
        configVersion: 'dialog-layout-fixture',
        totalRowCount: rows.length,
        offset: parameters.offset ?? 0,
        hasMorePages: false,
      };
    },
    { time: '2026-11-18T13:30:00+08:00' },
  );
}
async function capture(page, name) {
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/${name}.png` });
}
async function headerAtScrollTop(dialog, scroll) {
  await scroll.evaluate((element) => {
    element.scrollTop = 260;
  });
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  const gap = await dialog
    .locator('thead')
    .first()
    .evaluate(
      (element, selector) => {
        const viewport = element.closest(selector);
        return element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      },
      await scroll.getAttribute('class').then((value) => `.${value.split(' ')[0]}`),
    );
  assert.ok(Math.abs(gap) <= 1, `sticky header gap is ${gap}px`);
}

test('长表弹窗滚动后表头贴齐正文顶端，横向滚动和关闭保持可用', async (t) => {
  const { page, frame } = await fixture(t);
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n华南,A,产品A,点心,系列,包点,OLD,老品',
    ),
  });
  const bell = frame.getByRole('button', { name: '池外销售提报，45 条', exact: true });
  await bell.click();
  const dialog = frame.getByRole('dialog', { name: '池外销售提报', exact: true });
  await expect(dialog.getByRole('row')).toHaveCount(46);
  await capture(page, 'pool-before-scroll');
  const body = dialog.locator('.dc-dialog-body');
  await body.evaluate((element) => {
    element.scrollTop = 260;
  });
  await capture(page, 'pool-scrolled');
  await headerAtScrollTop(dialog, body);
  for (const width of [1920, 520]) {
    await page.setViewportSize({ width, height: 720 });
    await page.evaluate(() => {
      document.querySelector('#root').style.cssText = 'width:100%;height:100%;margin-left:0';
    });
    await headerAtScrollTop(dialog, body);
    if (width === 520) {
      const horizontalOffset = await body.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
        return element.scrollLeft;
      });
      assert.ok(horizontalOffset > 0);
    }
    const bounds = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: innerWidth };
    });
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width);
    await expect(dialog.getByRole('button', { name: '关闭弹窗' })).toBeVisible();
    await capture(page, `pool-${width}`);
  }
  await dialog.getByRole('button', { name: '关闭弹窗' }).click();
  await expect(dialog).toHaveCount(0);
  await bell.click();
  await dialog.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('源明细保留吸顶和键盘横滚，表单弹窗保留留白及操作区', async (t) => {
  const page = await authorPage(t, { time: '2026-11-18T13:30:00+08:00' });
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: '新建评估版本', exact: true }).click();
  const form = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  await form.getByLabel('评估月份', { exact: true }).fill('2026-12');
  await form.getByLabel('版本名称', { exact: true }).fill('弹窗验证');
  await capture(page, 'version-form-desktop');
  await form.getByRole('button', { name: '创建本地版本', exact: true }).click();
  const report = frame.getByRole('region', { name: '计划提报数据', exact: true });
  await frame.getByLabel('选择产品关系CSV或Excel', { exact: true }).setInputFiles({
    name: '产品.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '基地,产品编码,产品名称,大类,系列,物料组,老品编码,老品名称\n' +
        Array.from(
          { length: 30 },
          (_, index) => `华南,A${index},产品${index},点心,系列,包点,,`,
        ).join('\n'),
    ),
  });
  await frame.getByLabel('选择计划提报CSV', { exact: true }).setInputFiles({
    name: '提报.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '月份,基地,产品编码,产品名称,大类,系列,物料组,月初数量,纠偏数量\n' +
        Array.from(
          { length: 30 },
          (_, index) => `2026-12,华南,A${index},产品${index},点心,系列,包点,8,9`,
        ).join('\n'),
    ),
  });
  await report.getByRole('button', { name: '预览当前明细', exact: true }).click();
  const source = frame.getByRole('dialog', { name: '计划提报 · 2026-12 · 明细核对', exact: true });
  const sourceScroll = source.locator('.dc-table-scroll');
  await headerAtScrollTop(source, sourceScroll);
  await page.setViewportSize({ width: 820, height: 720 });
  await page.evaluate(() => {
    document.querySelector('#root').style.cssText = 'width:100%;height:100%;margin-left:0';
  });
  await headerAtScrollTop(source, sourceScroll);
  await sourceScroll.focus();
  await sourceScroll.press('ArrowRight');
  await expect
    .poll(() => sourceScroll.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await expect(source.getByRole('button', { name: '下载明细', exact: true })).toBeVisible();
  await capture(page, 'source-preview-scrolled');
  await source.press('Escape');

  await page.setViewportSize({ width: 820, height: 640 });
  await page.evaluate(() => {
    document.querySelector('#root').style.cssText = 'width:100%;height:100%;margin-left:0';
  });
  for (const title of ['新建评估版本', '版本对比']) {
    await frame.getByRole('button', { name: title, exact: true }).click();
    const dialog = frame.getByRole('dialog', { name: title, exact: true });
    const padding = await dialog.locator('.dc-dialog-body').evaluate((element) => {
      const child = element.firstElementChild;
      return (
        child.getBoundingClientRect().left +
        parseFloat(getComputedStyle(child).paddingLeft) -
        element.getBoundingClientRect().left
      );
    });
    assert.equal(padding, 20);
    await expect(dialog.getByRole('button', { name: '关闭弹窗', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^关闭(?:弹窗)?$/ })).toHaveCount(1);
    if (title === '新建评估版本') {
      await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: '创建本地版本', exact: true })).toBeVisible();
    } else {
      await expect(dialog.locator('.dc-dialog-footer')).toHaveCount(0);
    }
    await capture(page, `narrow-${title}`);
    await dialog.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
});

test('主数据弹窗嵌套表格保留吸顶、键盘横滚和固定下载操作', async (t) => {
  const { page, frame } = await fixture(t);
  await frame.getByRole('region', { name: '产品明细', exact: true }).locator('summary').click();
  await frame.getByRole('button', { name: '查看源表', exact: true }).click();
  const master = frame.getByRole('dialog', { name: '月主计划数据源', exact: true });
  await expect(master.getByRole('row'))
    .toHaveCount(26)
    .catch(async (error) => {
      t.diagnostic(await master.innerText());
      throw error;
    });
  const scroll = master.locator('.dc-table-scroll');
  await headerAtScrollTop(master, scroll);
  await scroll.focus();
  await scroll.press('ArrowRight');
  await expect.poll(() => scroll.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect(master.getByRole('button', { name: '下载当前页', exact: true })).toBeVisible();
  await capture(page, 'master-data-scrolled');
  await master.press('Escape');
  await expect(master).toHaveCount(0);
});

test('键盘打开弹窗后按Escape或关闭按钮，焦点回到仍存在的触发按钮', async (t) => {
  const { frame } = await fixture(t);
  for (const title of ['池外销售提报', '新建评估版本']) {
    const trigger = frame.getByRole('button', {
      name: title === '池外销售提报' ? '池外销售提报，45 条' : title,
      exact: true,
    });
    const dialog = frame.getByRole('dialog', { name: title, exact: true });
    for (const method of ['Escape', '关闭弹窗']) {
      await trigger.focus();
      await trigger.press('Enter');
      await expect(dialog).toBeVisible();
      if (title === '新建评估版本') await dialog.getByLabel('版本名称', { exact: true }).focus();
      else await dialog.locator('.dc-table-scroll').focus();
      if (method === 'Escape') await dialog.press('Escape');
      else await dialog.getByRole('button', { name: method, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  }
});

test('弹窗卸载不抢走父窗口或后来打开弹窗的焦点', async (t) => {
  const { page, frame } = await fixture(t);
  const trigger = frame.getByRole('button', { name: '新建评估版本', exact: true });
  const dialog = frame.getByRole('dialog', { name: '新建评估版本', exact: true });
  const close = dialog.getByRole('button', { name: '关闭弹窗', exact: true });
  await trigger.focus();
  await trigger.press('Enter');
  const composer = page.getByRole('textbox', { name: 'Core草稿接口fixture', exact: true });
  await composer.focus();
  await close.dispatchEvent('click');
  await expect(dialog).toHaveCount(0);
  await expect(composer).toBeFocused();

  await trigger.focus();
  await trigger.press('Enter');
  await frame.getByRole('button', { name: '版本对比', exact: true }).dispatchEvent('click');
  const compare = frame.getByRole('dialog', { name: '版本对比', exact: true });
  const compareClose = compare.getByRole('button', { name: '关闭弹窗', exact: true });
  await expect(compareClose).toBeFocused();
  await close.dispatchEvent('click');
  await expect(dialog).toHaveCount(0);
  await expect(compareClose).toBeFocused();
  await compare.press('Escape');
  await expect(compare).toHaveCount(0);
});
