import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { chromium, expect } from '@playwright/test';

const require = createRequire(import.meta.url);
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'tsx',
    contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {mountWorkspaceDirectoryPrompt} from './src/company/workspace-directory.tsx';
import {zh} from './src/company/locales.ts';
import '../../official-latest-standard/packages/client/ui-theme/src/styles/base.css';
import '../../official-latest-standard/packages/client/ui-theme/src/styles/design-platform.css';
const entries=[],cleanups=[];
window.picks=0;window.result='pending';
const ctx={locale:{bind:()=>key=>zh[key],subscribe:()=>()=>{},getSnapshot:()=>({active:'zh'})},
slots:{inject:(_,f)=>f(),register:(options,component)=>{entries.push({options,component});return()=>{}}},
effect:f=>cleanups.push(f()),uiWorkspace:{pickDirectory:async()=>{window.picks++;return '/selected/work';}}};
const pick=mountWorkspaceDirectoryPrompt(ctx);window.dispose=()=>cleanups.forEach(f=>f?.());
const Prompt=entries[0].component;
createRoot(document.getElementById('root')).render(<><button onClick={()=>{window.result='pending';pick().then(path=>window.result=path);}}>开始对话</button><Prompt/></>);
`,
  },
  bundle: true,
  write: false,
  outfile: '/fixture/app.js',
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"test"' },
  alias: {
    react: dirname(require.resolve('react/package.json')),
    'react-dom': dirname(require.resolve('react-dom/package.json')),
  },
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
});
test(
  'automatic folder selection explains the next step, supports cancellation, and opens one native picker after confirmation',
  { timeout: 30000 },
  async (t) => {
    const assets = new Map(
      bundle.outputFiles.map((file) => [file.path.split('/').at(-1), file.text]),
    );
    const server = createServer((req, res) => {
      const name = req.url.slice(1);
      res.setHeader(
        'Content-Type',
        name.endsWith('.js')
          ? 'text/javascript'
          : name.endsWith('.css')
            ? 'text/css'
            : 'text/html; charset=utf-8',
      );
      res.end(
        assets.get(name) ??
          '<html data-theme="light"><link rel="stylesheet" href="/app.css"><main id="root"></main><script type="module" src="/app.js"></script></html>',
      );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    });
    const browser = await chromium.launch({
      headless: true,
      timeout: 5000,
      channel: process.env.DSH_TEST_BROWSER_CHANNEL,
      executablePath: process.env.GEA_TEST_CHROMIUM,
    });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(5000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.deepEqual(errors, []);
    await page.getByRole('button', { name: '开始对话' }).click();
    const dialog = page.getByRole('dialog', { name: '先选择工作文件夹' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('接下来会打开系统文件夹选择器');
    assert.equal(await page.evaluate(() => window.picks), 0);
    if (process.env.DSH_WORKSPACE_PROMPT_SCREENSHOT) {
      await mkdir(dirname(process.env.DSH_WORKSPACE_PROMPT_SCREENSHOT), { recursive: true });
      await page.screenshot({
        path: process.env.DSH_WORKSPACE_PROMPT_SCREENSHOT,
        animations: 'disabled',
      });
    }
    await page.getByRole('button', { name: '暂不选择' }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.result)).toBe(null);
    assert.equal(await page.evaluate(() => window.picks), 0);
    await page.getByRole('button', { name: '开始对话' }).click();
    await page.getByRole('button', { name: '选择工作文件夹', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.result)).toBe('/selected/work');
    assert.equal(await page.evaluate(() => window.picks), 1);
    await page.getByRole('button', { name: '开始对话' }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.result)).toBe(null);
    assert.deepEqual(errors, []);
  },
);
