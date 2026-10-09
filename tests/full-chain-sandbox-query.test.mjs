import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { chromium, expect } from '@playwright/test';

test('company query submits complete conditions inside the actual opaque-origin frame sandbox', async (t) => {
  const built = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {FullChainWorkbench} from './business/inventory-qll/source/inventory-light-plugins/src/pages/qll.tsx';import {mountBusinessFetch} from './business/inventory-qll/source/inventory-light-plugins/src/native/api.ts';import {createCompanyWire} from './tests/fixtures/full-chain-company-wire.mjs';const wire=createCompanyWire();window.sqlCalls=[];window.fixtureWire=(method,payload,options)=>{if(method==='sql')window.sqlCalls.push(payload);return wire(method,payload,options);};await mountBusinessFetch();createRoot(document.getElementById('app')).render(<FullChainWorkbench/>);`,
      loader: 'tsx',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    define: { 'process.env.NEXT_PUBLIC_APP_BASE_PATH': '""' },
    plugins: [
      {
        name: 'external-service-fixture',
        setup(b) {
          b.onResolve({ filter: /^react(?:\/|$)|^react-dom(?:\/|$)/ }, (a) => ({
            path: require.resolve(a.path),
          }));
          b.onResolve({ filter: /^node:crypto$/ }, () => ({
            path: resolve('business/shared/browser-crypto.ts'),
          }));
          b.onResolve({ filter: /channel\.js$/ }, () => ({
            path: 'wire',
            namespace: 'fixture',
          }));
          b.onResolve({ filter: /\.css$/ }, () => ({
            path: 'css',
            namespace: 'fixture',
          }));
          b.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({
            contents:
              a.path === 'css'
                ? 'export default {};'
                : 'export const currentSessionId=()=>"sandbox-public-fixture";export const call=(...args)=>window.fixtureWire(...args);export const ready=Promise.resolve();export const publish=async value=>{(window.fixturePublished??=[]).push(value);};export const action=()=>()=>{};export const reportElements=()=>()=>{};',
          }));
        },
      },
    ],
  });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', (e) => console.log('BROWSER_PAGE_ERROR', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('BROWSER_CONSOLE_ERROR', m.text());
  });
  const host =
    '<iframe sandbox="allow-scripts allow-downloads" src="/company" style="width:1200px;height:800px"></iframe>';
  await page.route('http://127.0.0.1:19483/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    assert.ok(path === '/' || path === '/company' || path === '/app.js', path);
    return route.fulfill({
      contentType: path === '/app.js' ? 'application/javascript' : 'text/html',
      headers: { 'access-control-allow-origin': '*' },
      body:
        path === '/app.js'
          ? built.outputFiles[0].text
          : path === '/company'
            ? '<div id="app"></div><script type="module" src="/app.js"></script>'
            : host,
    });
  });
  await page.goto('http://127.0.0.1:19483/');
  const frame = page.frameLocator('iframe');
  const child = page.frames().find((x) => x !== page.mainFrame());
  const waitReady = (sku) =>
    expect
      .poll(() =>
        child.evaluate((sku) => {
          const context = window.fixturePublished?.at(-1);
          return (
            context?.parts?.queryState?.state === 'ready' &&
            context?.parts?.pageFilters?.search === sku
          );
        }, sku),
      )
      .toBe(true);
  await expect(frame.getByRole('textbox', { name: '查询 SKU' })).toBeVisible();
  await frame.getByRole('textbox', { name: '查询 SKU' }).fill('MOCK-001');
  await frame.locator('[aria-label="读取时点"]').fill('2026-10-02');
  await frame.locator('[aria-label="库存查询月份"]').fill('2026-09');
  assert.deepEqual(await child.evaluate(() => sqlCalls), []);
  await frame
    .locator('[aria-label="库存查询条件"]')
    .getByRole('button', { name: '查询', exact: true })
    .click();
  await expect.poll(() => child.evaluate(() => sqlCalls.length)).toBeGreaterThan(0);
  await waitReady('MOCK-001');
  let calls = await child.evaluate(() => sqlCalls);
  assert.ok(
    calls.every(
      (x) =>
        x.parameters.gea_p1 === '2026-10-02' && Object.values(x.parameters).includes('MOCK-001'),
    ),
  );
  const before = calls.length;
  await frame.locator('[aria-label="读取时点"]').fill('2026-10-03');
  for (const sku of ['M', 'MOCK-00', '']) {
    await frame.getByRole('textbox', { name: '查询 SKU' }).fill(sku);
    assert.equal(await child.evaluate(() => sqlCalls.length), before);
  }
  await frame.getByRole('textbox', { name: '查询 SKU' }).fill('MOCK-002');
  await frame
    .locator('[aria-label="库存查询条件"]')
    .getByRole('button', { name: '查询', exact: true })
    .click();
  await expect.poll(() => child.evaluate(() => sqlCalls.length)).toBeGreaterThan(before);
  await waitReady('MOCK-002');
  calls = (await child.evaluate(() => sqlCalls)).slice(before);
  assert.ok(
    calls.every(
      (x) =>
        x.parameters.gea_p1 === '2026-10-03' && Object.values(x.parameters).includes('MOCK-002'),
    ),
  );
  const structure = frame.getByRole('group', { name: '库存结构筛选' });
  const beforeStructure = await child.evaluate(() => sqlCalls.length);
  await frame.getByRole('textbox', { name: 'SKU编码筛选' }).fill('MOCK-003');
  assert.equal(await child.evaluate(() => sqlCalls.length), beforeStructure);
  await structure.getByRole('button', { name: '查询', exact: true }).click();
  await expect.poll(() => child.evaluate(() => sqlCalls.length)).toBeGreaterThan(beforeStructure);
  assert.ok(
    (await child.evaluate(() => sqlCalls))
      .slice(beforeStructure)
      .every((x) => Object.values(x.parameters).includes('MOCK-003')),
  );
  await waitReady('MOCK-003');
  const beforeStructureEnter = await child.evaluate(() => sqlCalls.length);
  await frame.getByRole('textbox', { name: 'SKU编码筛选' }).fill('MOCK-004');
  await frame.getByRole('textbox', { name: 'SKU编码筛选' }).press('Enter');
  await expect
    .poll(() => child.evaluate(() => sqlCalls.length))
    .toBeGreaterThan(beforeStructureEnter);
  assert.ok(
    (await child.evaluate(() => sqlCalls))
      .slice(beforeStructureEnter)
      .every((x) => Object.values(x.parameters).includes('MOCK-004')),
  );
  await waitReady('MOCK-004');
  const beforeEnter = await child.evaluate(() => sqlCalls.length);
  await frame.getByRole('textbox', { name: '查询 SKU' }).fill('MOCK-005');
  await frame.getByRole('textbox', { name: '查询 SKU' }).press('Enter');
  await expect.poll(() => child.evaluate(() => sqlCalls.length)).toBeGreaterThan(beforeEnter);
  assert.ok(
    (await child.evaluate(() => sqlCalls))
      .slice(beforeEnter)
      .every((x) => Object.values(x.parameters).includes('MOCK-005')),
  );
  assert.equal(
    await page.locator('iframe').getAttribute('sandbox'),
    'allow-scripts allow-downloads',
  );
});
