import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const config = JSON.parse(await readFile('business/inventory-qll/sql.config.json', 'utf8'));
const entry = `import React from 'react'; import { createRoot } from 'react-dom/client'; import { CategoryHierarchy } from './business/inventory-qll/source/inventory-light-plugins/src/pages/qll/components/category-hierarchy.tsx'; function App(){ const [channel,setChannel]=React.useState(false); return <><label><input type="checkbox" onChange={e=>setChannel(e.target.checked)} />含渠道</label><CategoryHierarchy date={new URL(location.href).searchParams.get("date") || "2026-10-28"} channel={channel}/></> } createRoot(document.getElementById('root')).render(<App/>);`;
const built = await build({
  stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true,
  write: false,
  outdir: 'out',
  format: 'iife',
  platform: 'browser',
});
const js = built.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = built.outputFiles.find((f) => f.path.endsWith('.css')).text;
test(
  'four levels load only when opened; SKU filters and paging stay within the selected organization',
  { timeout: 60000 },
  async (t) => {
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const calls = [];
    let failBranch = true;
    await page.route('http://tree.test/**', async (route) => {
      if (!route.request().url().includes('/api/agents/'))
        return route.fulfill({
          contentType: 'text/html',
          body: `<html><head><style>${css}</style></head><body><script id="agent-sql-direct" type="application/json">{"path":"/api/agents/inventory-qll/query","token":"fixture"}</script><div id="root"></div><script>${js}</script></body></html>`,
        });
      const { queryId, parameters: p } = route.request().postDataJSON();
      if (['summary.snapshot', 'summary.bootstrap'].includes(queryId))
        return route.fulfill({
          json: {
            rows: [],
            returnedColumns: config.queries[queryId].resultColumns,
            rejectedColumns: [],
            configVersion: 'fixture',
          },
        });
      calls.push({ queryId, ...p });
      if (queryId === 'category-tree.branch' && failBranch) {
        failBranch = false;
        return route.fulfill({
          status: 500,
          json: { message: '分仓查询暂时失败', code: 'QUERY_FAILED' },
        });
      }
      const columns = config.queries[queryId].resultColumns;
      const row = (key, name) =>
        Object.fromEntries(
          columns.map((c) => [
            c,
            {
              day: '2026-10-28',
              node_key: key,
              node_name: name,
              inventory: 123456.78,
              age_qty: 100,
              age_sum: 2000,
              risk_rank: 1,
              source_date: '2026-10-28',
              latest_date: '2026-10-28',
            }[c] ?? 0,
          ]),
        );
      const rows =
        queryId === 'overview.quick-stock'
          ? ['基地', '分仓'].map((location_type) => ({
              ...row('', ''),
              location_type,
              snapshot_date: '2026-10-28',
            }))
          : queryId.startsWith('source.')
            ? [row('', '')]
            : p.level === 'category'
              ? [row('汤圆', '汤圆')]
              : p.level === 'organization'
                ? [
                    row(
                      queryId.endsWith('customer')
                        ? '河南省区'
                        : queryId.endsWith('branch')
                          ? 'A020'
                          : '郑州',
                      queryId.endsWith('branch')
                        ? '长沙分仓'
                        : queryId.endsWith('customer')
                          ? '河南省区'
                          : '郑州',
                    ),
                  ]
                : Array.from({ length: p.tree_risk ? 1 : p.offset ? 2 : 11 }, (_, i) =>
                    row(`SKU${p.offset + i}`, '测试商品'),
                  );
      return route.fulfill({
        json: { rows, returnedColumns: columns, rejectedColumns: [], configVersion: 'fixture' },
      });
    });
    await page.goto('http://tree.test/');
    await expect(page.getByRole('button', { name: '汤圆', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('分仓查询暂时失败');
    assert.equal(
      calls.some((c) => c.level === 'sku'),
      false,
    );
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: '汤圆', exact: true }).click();
    await page.getByRole('button', { name: '基地', exact: true }).click();
    await page.getByRole('button', { name: '郑州', exact: true }).click();
    const leaf = page.getByRole('region', { name: '汤圆 / 基地 / 郑州 SKU 明细', exact: true });
    await expect(leaf.locator('tbody tr')).toHaveCount(10);
    await expect(leaf.getByTitle('123,456.78件', { exact: true }).first()).toHaveText('12.35万件');
    await leaf.getByRole('button', { name: '下一页' }).click();
    await expect(leaf.locator('tbody tr')).toHaveCount(2);
    assert.equal(calls.at(-1).offset, 10);
    await leaf.getByRole('combobox', { name: '状态快捷筛选' }).selectOption('1');
    await expect(leaf.locator('tbody tr')).toHaveCount(1);
    assert.equal(calls.at(-1).offset, 0);
    assert.equal(calls.at(-1).parent_organization, '郑州');
    await leaf.getByRole('textbox', { name: 'SKU 编码或名称' }).fill('SKU0');
    await leaf.getByRole('button', { name: '查询', exact: true }).click();
    await expect.poll(() => calls.at(-1).tree_search).toBe('%SKU0%');
    const before = calls.filter(
      (c) => c.queryId === 'category-tree.base' && c.level === 'category',
    ).length;
    await page.getByRole('checkbox', { name: '含渠道' }).check();
    await page.getByRole('button', { name: '渠道', exact: true }).click();
    await page.getByRole('button', { name: '河南省区', exact: true }).click();
    await expect(
      page
        .getByRole('region', { name: '汤圆 / 渠道 / 河南省区 SKU 明细', exact: true })
        .locator('tbody tr'),
    ).toHaveCount(10);
    assert.equal(
      calls.filter((c) => c.queryId === 'category-tree.base' && c.level === 'category').length,
      before,
    );
    assert.equal(
      calls.some((c) => c.queryId.includes('trend')),
      false,
    );
    const customerReads = calls.filter(
      (c) => c.queryId === 'category-tree.customer' && c.level === 'category',
    ).length;
    await page.getByRole('checkbox', { name: '含渠道' }).uncheck();
    await page.getByRole('checkbox', { name: '含渠道' }).check();
    await expect(page.getByRole('button', { name: '渠道', exact: true })).toBeVisible();
    assert.equal(
      calls.filter((c) => c.queryId === 'category-tree.customer' && c.level === 'category').length,
      customerReads,
    );
    for (const width of [1280, 560]) {
      await page.setViewportSize({ width, height: 900 });
      const bounds = await leaf.getByRole('button', { name: '下一页' }).boundingBox();
      assert.equal(
        await leaf.getByRole('button', { name: '下一页' }).evaluate((button) => {
          const right = button.getBoundingClientRect().right;
          for (let parent = button.parentElement; parent; parent = parent.parentElement) {
            if (
              ['hidden', 'auto', 'scroll'].includes(getComputedStyle(parent).overflowX) &&
              right > parent.getBoundingClientRect().right + 1
            )
              return false;
          }
          return true;
        }),
        true,
        'ancestor scroll containers do not clip paging controls',
      );
      assert.ok(
        bounds && bounds.x + bounds.width <= width,
        'SKU paging remains visible without horizontal scrolling',
      );
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    const evidence = process.env.QLL_TREE_EVIDENCE;
    if (evidence) {
      await mkdir(evidence, { recursive: true });
      await page.screenshot({ path: join(evidence, 'category-desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 560, height: 900 });
      await page.screenshot({ path: join(evidence, 'category-narrow.png'), fullPage: true });
    }
  },
);

test('a later read date renders published company rows and retains zero and missing cells distinctly', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const daily = structuredClone(config);
  delete daily.dailySummary.bundle;
  const calls = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://published.test/**', async (route) => {
    if (!route.request().url().includes('/api/agents/'))
      return route.fulfill({
        contentType: 'text/html',
        body: `<meta charset="utf-8"><style>${css}</style><script id="agent-sql-config" type="application/json">${JSON.stringify(daily)}</script><script id="agent-sql-direct" type="application/json">{"path":"/api/agents/inventory-qll/query","token":"fixture"}</script><div id="root"></div><script>${js}</script>`,
      });
    const { queryId, parameters: p } = route.request().postDataJSON();
    calls.push({ queryId, ...p });
    const columns = daily.queries[queryId].resultColumns;
    let rows;
    if (queryId === 'summary.snapshot')
      rows = [
        {
          batch_id: 'batch',
          business_date: '2026-11-06',
          stock_date: '2026-11-06',
          target_month: '2026-11-01',
        },
      ];
    else if (queryId === 'snapshot.overview.quick-stock')
      rows = ['基地', '分仓'].map((location_type) => ({
        location_type,
        snapshot_date: '2026-11-06',
        row_count: 1,
        total_qty: 100,
        available_qty: 80,
        pack_unit_qty: 0,
        freeze_qty: 0,
      }));
    else if (queryId === 'snapshot.calendar.target_versions')
      rows = [{ month: '2026-11-01', inventory_version: '月初' }];
    else if (queryId.startsWith('snapshot.category-tree.')) {
      const base = queryId.endsWith('.base');
      const row = (key, inventory, target, gap) => ({
        ...Object.fromEntries(columns.map((c) => [c, null])),
        node_key: key,
        node_name: key,
        inventory,
        missing_inventory: 0,
        target,
        missing_target: target === null ? 1 : 0,
        gap,
        turnover_qty: inventory,
        daily: 10,
        age_qty: inventory,
        age_sum: inventory * 20,
        overaged: 0,
        risk_rank: 8,
        source_date: '2026-11-06',
        latest_date: '2026-11-06',
      });
      rows =
        p.level === 'category'
          ? [row('汤圆', base ? 100 : 50, base ? 80 : null, base ? 20 : null)]
          : p.level === 'organization'
            ? [row(base ? '华南' : 'A020', base ? 100 : 50, base ? 80 : null, base ? 20 : null)]
            : [row('无库存SKU', 0, null, null), row('有库存SKU', 100, 80, 20)];
    } else
      return route.fulfill({
        status: 403,
        json: { code: 'DATA_PERMISSION_DENIED', message: 'raw source denied' },
      });
    return route.fulfill({
      json: { rows, returnedColumns: columns, rejectedColumns: [], configVersion: 'fixed' },
    });
  });
  await page.goto('http://published.test/?date=2026-11-09');
  const category = page.getByRole('button', { name: '汤圆', exact: true });
  await expect(category).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(category.locator('..').locator('..')).toContainText('150件');
  await expect(category.locator('..').locator('..')).toContainText('2026-11-06');
  await category.click();
  await page.getByRole('button', { name: '基地', exact: true }).click();
  await page.getByRole('button', { name: '华南', exact: true }).click();
  const leaf = page.getByRole('region', { name: '汤圆 / 基地 / 华南 SKU 明细', exact: true });
  await expect(leaf.locator('tbody tr')).toHaveCount(2);
  const zero = leaf.locator('tbody tr').filter({ hasText: '无库存SKU' });
  await expect(zero).toContainText('0件');
  const nonzero = leaf.locator('tbody tr').filter({ hasText: '有库存SKU' });
  await expect(nonzero).toContainText('100件');
  const gap = zero.locator('td').nth(5);
  await expect(gap).toHaveText('-');
  assert.equal(
    calls.some((c) => c.queryId.startsWith('category-tree.')),
    false,
  );
  assert.ok(
    calls
      .filter((c) => c.queryId === 'snapshot.category-tree.base')
      .every((c) => c.order_end_exclusive === '2026-11-07' && c.inventory_version === '月初'),
  );
  assert.deepEqual(errors, []);
  if (process.env.QLL_TREE_EVIDENCE) {
    await mkdir(process.env.QLL_TREE_EVIDENCE, { recursive: true });
    await page.screenshot({
      path: join(process.env.QLL_TREE_EVIDENCE, 'published-company-list.png'),
      fullPage: true,
    });
  }
});
