import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';

const bundle = await build({
  stdin: {
    contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { useWorkspace } from './business/inventory-apsplan/source/app/data/use-workspace';
      function App({date}) { const result=useWorkspace(true,date,'month');
        return <pre>{JSON.stringify(result)}</pre>; }
      const root=createRoot(document.getElementById('app'));
      window.renderDate=(date)=>root.render(<App date={date}/>);
      window.renderDate('2026-10-29');`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  alias: {
    react: resolve('business/inventory-apsplan/source/node_modules/react'),
    'react-dom': resolve('business/inventory-apsplan/source/node_modules/react-dom'),
  },
  bundle: true,
  write: false,
  define: { APS_MOCK: 'false' },
  plugins: [
    {
      name: 'workspace-fixture',
      setup(api) {
        api.onResolve({ filter: /\/(gea-workspace|mock-workspace|host-bridge)$/ }, (args) => ({
          path: args.path,
          namespace: 'fixture',
        }));
        api.onResolve({ filter: /^dsh-agent-manage\/aps-compute\/metrics$/ }, (args) => ({
          path: args.path,
          namespace: 'fixture',
        }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents: path.endsWith('gea-workspace')
            ? 'export const createGeaWorkspace=()=>window.readWorkspace;'
            : path.endsWith('mock-workspace')
              ? 'export const readMockWorkspace=()=>{};'
              : path.endsWith('host-bridge')
                ? 'export const request=()=>{}; export const setLiveContext=()=>{}; export const onRefresh=()=>()=>{};'
                : 'export const deriveMetrics=()=>({});',
        }));
      },
    },
  ],
});

test('current and comparison reads overlap; late current progress preserves comparison and old dates cannot overwrite', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => console.error(error.message));
  await page.setContent('<div id="app"></div>');
  await page.evaluate(() => {
    window.reads = [];
    window.readWorkspace = (input) =>
      new Promise((resolve, reject) => window.reads.push({ input, resolve, reject }));
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => window.reads.length === 2);
  assert.deepEqual(await page.evaluate(() => window.reads.map((r) => !!r.input.comparison)), [
    false,
    true,
  ]);
  const data = (marker) => ({ sections: [], limitations: [], readAt: marker });
  await page.evaluate((d) => window.reads[1].input.onComparison({ previous: d }), data('previous'));
  await page.waitForFunction(
    () => JSON.parse(document.querySelector('pre').textContent).previous?.readAt === 'previous',
  );
  await page.evaluate((d) => window.reads[0].input.onProgress(d), data('partial'));
  await page.waitForFunction(
    () => JSON.parse(document.querySelector('pre').textContent).data?.readAt === 'partial',
  );
  assert.equal(JSON.parse(await page.locator('pre').textContent()).previous.readAt, 'previous');
  await page.evaluate((d) => window.reads[0].resolve(d), data('complete'));
  await page.waitForFunction(() => !JSON.parse(document.querySelector('pre').textContent).busy);
  assert.equal(JSON.parse(await page.locator('pre').textContent()).previous.readAt, 'previous');
  await page.evaluate(() => window.renderDate('2026-10-28'));
  await page.waitForFunction(() => window.reads.length === 4);
  await page.evaluate((d) => {
    window.reads[1].input.onComparison({ annual: d });
    window.reads[1].resolve({ previous: d, annual: d });
  }, data('stale'));
  await page.evaluate((d) => window.reads[2].resolve(d), data('new-date'));
  await page.evaluate(() => window.reads[3].reject(new Error('comparison unavailable')));
  await page.waitForFunction(
    () => !JSON.parse(document.querySelector('pre').textContent).comparisonBusy,
  );
  const result = JSON.parse(await page.locator('pre').textContent());
  assert.equal(result.data.readAt, 'new-date');
  assert.equal(result.previous, null);
  assert.equal(result.annual, null);
  assert.match(result.error, /comparison unavailable/);
});
