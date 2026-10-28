import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const config = JSON.parse(await readFile('business/inventory-qll/sql.config.json', 'utf8'));
const entry = `import React from 'react'; import { createRoot } from 'react-dom/client'; import { CategoryHierarchy } from './business/inventory-qll/source/inventory-light-plugins/src/pages/qll/components/category-hierarchy.tsx'; function App(){ const [channel,setChannel]=React.useState(false); return <><label><input type="checkbox" onChange={e=>setChannel(e.target.checked)} />含渠道</label><CategoryHierarchy date="2026-10-28" channel={channel}/></> } createRoot(document.getElementById('root')).render(<App/>);`;
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
      const rows = queryId.startsWith('source.')
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
