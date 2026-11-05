import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import {
  computeWorkbenchMetrics,
  metricCalculationVersion,
} from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import { performanceStyleVersion } from '../prototypes/inventory-orderworkbench/performance-rules.mjs';

test('built page uses the standard card style, retains source provenance and clears on identity change', async (t) => {
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.ORDER_BROWSER_CHANNEL || undefined,
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const period = {
    start: '2026-10-01',
    end: '2026-10-26',
    sections: [
      {
        id: 'stock',
        status: 'ready',
        rows: [
          {
            base: '郑州',
            sku: 'A',
            category: '食品',
            item: '水饺',
            stock_date: '2026-10-25',
            source_rows: 1,
            inventory: 4745203,
            sales_plan: 9435719.78,
            transfer_plan: 0,
            invalid: 0,
            national_inventory: 4745203,
            national_sales_plan: 9435719.78,
            national_stock_records: 1,
            national_plan_records: 1,
            national_stock_invalid: 0,
            national_plan_invalid: 0,
          },
        ],
      },
    ],
  };
  period.metrics = computeWorkbenchMetrics(period);
  const savedReport = {
    schemaVersion: 1,
    edits: {},
    presentation: { lazy: false, performanceStyleVersion, shippableReferenceVersion: 1, cards: [] },
    facts: {
      complete: true,
      source: 'gea-governed-sql',
      displayMode: 'historical-reconciliation',
      metricCalculationVersion,
      attributionVersion: 2,
      selected: 'week',
      periods: { month: period, week: { ...period, start: '2026-10-19' } },
      directors: { status: 'ready', rows: [] },
      customers: { status: 'ready', rows: [] },
      customerManagers: { status: 'ready', rows: [] },
    },
  };
  await page.addInitScript(() => {
    const NativeDate = Date;
    window.Date = class extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : ['2026-10-25T08:00:00Z']));
      }
      static now() {
        return NativeDate.parse('2026-10-25T08:00:00Z');
      }
    };
  });
  const html = await readFile('lib/business/inventory-orderworkbench/index.html', 'utf8');
  await page.route('https://workbench.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await page.goto('https://workbench.test/');
  await page.evaluate((savedReport) => {
    const channel = new MessageChannel();
    window.fixturePort = channel.port1;
    channel.port1.onmessage = ({ data }) => {
      if (data.type !== 'request' || data.method === 'sql') return;
      const request = data.parameters;
      const result =
        data.method === 'workspace' && request.operation === 'load'
          ? { version: 0, report: savedReport, scope: { base: '' } }
          : { ok: true };
      channel.port1.postMessage({ type: 'response', id: data.id, result });
    };
    window.postMessage(
      {
        protocol: 'gea-html-v2',
        type: 'connect',
        context: { session: 'historical-reference-fixture', plugin: 'inventory-orderworkbench' },
      },
      location.origin,
      [channel.port2],
    );
  }, savedReport);
  const card = page.locator('[data-metric-question="周转天数"]');
  await expect(card.locator('.wb-kpi-main strong')).toHaveText('14.9');
  await expect(card.locator('.wb-kpi-state')).toHaveText('严重');
  await expect(card.locator('.wb-kpi-foot')).toHaveText('本周可发货天数 14.9天');
  await expect(card.locator('.wb-kpi-foot')).toHaveAttribute(
    'title',
    /非实时计算、非已验证BI原始输入/,
  );
  await card.screenshot({
    path: process.env.ORDER_REFERENCE_SCREENSHOT || '.runtime/historical-reference.png',
  });
  await page.evaluate(() => window.fixturePort.postMessage({ type: 'identity-changed' }));
  await expect(card.locator('.wb-kpi-main strong')).toHaveText('—');
  assert.deepEqual(errors, []);
});
