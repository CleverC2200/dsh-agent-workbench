import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';

const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {DrillPage} from './business/inventory-apsplan/source/app/drill-page';
    const root=createRoot(document.getElementById('app'));
    window.draw=(count,key='A')=>root.render(<DrillPage key={key} rows={Array.from({length:count},(_,i)=>String(i+1))}>
      {(row)=><div className="leaf" key={row}>{row}</div>}</DrillPage>);
    window.draw(23);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  alias: {
    react: resolve('business/inventory-apsplan/source/node_modules/react'),
    'react-dom': resolve('business/inventory-apsplan/source/node_modules/react-dom'),
  },
  bundle: true,
  outdir: '.scratch/drill-pagination-bundle',
  write: false,
});
test('leaf lists render ten rows, page without fetching, clamp and reset for a new scope', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<div id="app"></div>');
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.addStyleTag({
    content: bundle.outputFiles.find((file) => file.path.endsWith('.css')).text,
  });
  await page.addScriptTag({
    content: bundle.outputFiles.find((file) => file.path.endsWith('.js')).text,
  });
  await expect(page.locator('.leaf')).toHaveCount(10);
  await expect(page.getByRole('button', { name: '上一页' })).toBeDisabled();
  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page.locator('.leaf').first()).toHaveText('11');
  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page.locator('.leaf')).toHaveText(['21', '22', '23']);
  await expect(page.getByRole('button', { name: '下一页' })).toBeDisabled();
  await page.evaluate(() => window.draw(12));
  await expect(page.locator('.leaf')).toHaveText(['11', '12']);
  await page.evaluate(() => window.draw(23, 'B'));
  await expect(page.locator('.leaf').first()).toHaveText('1');
  assert.deepEqual(requests, []);
});

for (const width of [1280, 480, 360])
  test(`drill pagination follows shared compact style at ${width}px`, async (t) => {
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width, height: 700 } });
    await page.setContent('<div class="category-drill-table"><div id="app"></div></div>');
    await page.addStyleTag({
      content: await readFile('business/inventory-apsplan/source/app/data/plugin-host.css', 'utf8'),
    });
    await page.addStyleTag({
      content:
        'body{margin:0;font:16px Arial}.category-drill-table{overflow:auto;border:1px solid #eee}.leaf{min-width:1200px;height:32px;color:#858c96;font-size:12px}',
    });
    await page.addStyleTag({
      content: bundle.outputFiles.find((file) => file.path.endsWith('.css')).text,
    });
    await page.addScriptTag({
      content: bundle.outputFiles.find((file) => file.path.endsWith('.js')).text,
    });
    const pager = page.getByRole('navigation', { name: '物料组分页' });
    const next = pager.getByRole('button', { name: '下一页' });
    await expect(next).toHaveCSS('height', '36px');
    await expect(next).toHaveCSS('width', '36px');
    await expect(pager.getByText('共 23 条')).toHaveCSS('font-size', '12px');
    const assertFits = async () => {
      await expect
        .poll(async () => {
          const boxes = await Promise.all(
            (await pager.getByRole('button').all()).map((control) => control.boundingBox()),
          );
          return boxes.every((box) => box && box.x >= 0 && box.x + box.width <= width);
        })
        .toBe(true);
    };
    await assertFits();
    await page.locator('.category-drill-table').evaluate((el) => (el.scrollLeft = el.scrollWidth));
    await assertFits();
    await next.click();
    await expect(page.locator('.leaf').first()).toHaveText('11');
    await pager.getByRole('button', { name: /当前第 2 页/ }).click();
    await pager.getByRole('textbox', { name: '输入页码' }).fill('3');
    await pager.getByRole('textbox', { name: '输入页码' }).press('Enter');
    await expect(page.locator('.leaf')).toHaveText(['21', '22', '23']);
    await pager.getByRole('button', { name: '每页条数' }).click();
    await page.getByRole('option', { name: '20 条/页', exact: true }).click();
    await expect(page.locator('.leaf')).toHaveCount(20);
    await expect(page.locator('.leaf').first()).toHaveText('1');
    await expect(pager.getByRole('button', { name: '上一页' })).toBeDisabled();
    if (process.env.AGENT_LAYOUT_EVIDENCE) {
      await mkdir(process.env.AGENT_LAYOUT_EVIDENCE, { recursive: true });
      await pager.screenshot({
        path: process.env.AGENT_LAYOUT_EVIDENCE + `/pagination-${width}.png`,
      });
    }
  });
