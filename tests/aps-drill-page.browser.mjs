import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';

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
  write: false,
});
test('leaf lists render ten rows, page without fetching, clamp and reset for a new scope', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<div id="app"></div>');
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
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
