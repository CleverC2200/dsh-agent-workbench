import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const bundle = await build({
  stdin: {
    contents: `import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DataPagination } from './business/inventory-qll/source/inventory-light-plugins/src/dsh-ui/controls.tsx';
function Example() {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [total, setTotal] = useState(42);
  const [loading, setLoading] = useState(false);
  window.setPaginationState = ({ total: nextTotal, loading: nextLoading }) => {
    if (nextTotal !== undefined) setTotal(nextTotal);
    if (nextLoading !== undefined) setLoading(nextLoading);
  };
  return <DataPagination ariaLabel="库存明细分页" pageNumber={page} pageSize={size}
    totalCount={total} disabled={loading} onPageChange={setPage}
    onPageSizeChange={(next) => { setSize(next); setPage(1); }} />;
}
createRoot(document.getElementById('root')).render(<Example />);`,
    resolveDir: process.cwd(),
    sourcefile: 'qll-pagination-entry.tsx',
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  outdir: 'out',
  format: 'iife',
  platform: 'browser',
});
const script = bundle.outputFiles.find((file) => file.path.endsWith('.js'))?.text;
const css = bundle.outputFiles.find((file) => file.path.endsWith('.css'))?.text;
assert.ok(script && css, 'pagination browser fixture must bundle JavaScript and CSS');

test('QLL inventory pagination follows the plan-management footer pattern', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 900, height: 240 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('http://pagination.test/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;font-family:"Microsoft YaHei UI",Arial,sans-serif;background:#f7f8fa}#root{width:100%}${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`,
    }),
  );
  await page.goto('http://pagination.test/');
  const pager = page.getByRole('navigation', { name: '库存明细分页' });
  const size = pager.getByRole('button', { name: '每页条数' });
  const previous = pager.getByRole('button', { name: '上一页' });
  const next = pager.getByRole('button', { name: '下一页' });
  await expect(pager).toContainText('共 42 条');
  await expect(pager).toContainText('1 / 5');
  await expect(previous).toBeDisabled();
  const boxes = await Promise.all([size, previous, next].map((item) => item.boundingBox()));
  assert.ok(
    boxes.every((box) => box?.height === 36),
    `pagination controls should be 36px: ${JSON.stringify(boxes)}`,
  );
  assert.ok((await pager.boundingBox()).height >= 68);
  if (process.env.GEA_QLL_PAGINATION_EVIDENCE)
    await page.screenshot({ path: process.env.GEA_QLL_PAGINATION_EVIDENCE + '-closed.png' });
  await size.click();
  const menu = page.getByRole('listbox', { name: '每页条数' });
  await expect(menu).toBeVisible();
  if (process.env.GEA_QLL_PAGINATION_EVIDENCE)
    await page.screenshot({ path: process.env.GEA_QLL_PAGINATION_EVIDENCE + '-open.png' });
  await expect(menu.getByRole('option', { name: '10 条/页' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await menu.getByRole('option', { name: '20 条/页' }).click();
  await expect(pager).toContainText('1 / 3');
  await next.click();
  await expect(pager).toContainText('2 / 3');
  await next.click();
  await expect(next).toBeDisabled();
  await size.click();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(size).toBeFocused();
  await page.evaluate(() => {
    document.getElementById('root').style.paddingTop = '170px';
  });
  await size.click();
  const upwardMenu = await menu.boundingBox();
  const upwardTrigger = await size.boundingBox();
  assert.ok(
    upwardMenu.y + upwardMenu.height < upwardTrigger.y,
    'menu should open above a low trigger',
  );
  await menu.getByRole('option', { name: '50 条/页' }).click();
  await expect(pager).toContainText('1 / 1');
  await page.evaluate(() => window.setPaginationState({ loading: true }));
  await expect(size).toBeDisabled();
  await expect(previous).toBeDisabled();
  await page.evaluate(() => window.setPaginationState({ loading: false, total: 0 }));
  await expect(pager).toContainText('0 / 0');
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 300 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []);
});
