import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from './helpers/prepared-assets.mjs';
import { chromium, expect } from '@playwright/test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

test('production FC config keeps an unavailable summary unknown without substituting live replenishment', async (t) => {
  const config = JSON.parse(await readFile('lib/business/inventory-fc/sql.config.json', 'utf8'));
  assert.equal(config.queries['replenishment.overview'].summaryRoute.required, true);
  const output = await build({
    stdin: {
      contents: `import React from 'react';import{createRoot}from'react-dom/client';import Page from './business/inventory-fc/source/inventory-light-plugins/src/pages/configured-workbench.tsx';createRoot(document.getElementById('app')).render(React.createElement(Page));`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    outfile: 'summary.js',
    format: 'iife',
    platform: 'browser',
    alias: { react: resolve('node_modules/react'), 'react-dom': resolve('node_modules/react-dom') },
    define: { PLUGIN_ID: '\"fc\"', 'process.env.NODE_ENV': '\"test\"' },
    loader: { '.css': 'css', '.module.css': 'local-css' },
  });
  const js = output.outputFiles.find((file) => file.path.endsWith('.js')).text;
  const html = `<main id="app"></main><script id="agent-sql-direct" type="application/json">{"path":"/api/agents/inventory-fc/query","token":"fixture"}</script><script>${js}</script>`;
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const calls = [];
  await page.route('http://summary-consistency.test/**', async (route) => {
    if (route.request().method() !== 'POST')
      return route.fulfill({ contentType: 'text/html', body: html });
    const query = route.request().postDataJSON();
    calls.push(query.queryId);
    return route.fulfill({
      json: {
        rows: [],
        returnedColumns: config.queries[query.queryId].resultColumns,
        rejectedColumns: [],
        configVersion: 'fixture',
      },
    });
  });
  for (let entry = 0; entry < 2; entry++) {
    await page.goto('http://summary-consistency.test/');
    await expect
      .poll(() => calls.filter((id) => id === 'summary.bootstrap').length)
      .toBe(entry + 1);
    const card = page.locator('.kpi-card').filter({ hasText: '待补货量' });
    await expect(card.locator('.kpi-value')).toHaveText('-');
    await expect(page.locator('body')).not.toContainText('当前范围的汇总数据尚未就绪');
  }
  assert.equal(
    calls.some((id) => id.startsWith('replenishment') || id === 'source.branch-stock-date'),
    false,
  );
});
