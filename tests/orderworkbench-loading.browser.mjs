import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import {
  computeWorkbenchMetrics,
  metricCalculationVersion,
} from '../prototypes/inventory-orderworkbench/metric-model.mjs';

for (const restoreFailed of [false, true])
  test(`built workbench paints before slow stock and clears identity (saved failure: ${restoreFailed})`, async (t) => {
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const html = await readFile('lib/business/inventory-orderworkbench/index.html', 'utf8');
    const config = JSON.parse(
      await readFile('lib/business/inventory-orderworkbench/sql.config.json', 'utf8'),
    );
    await page.addInitScript(() => {
      const NativeDate = Date;
      window.Date = class extends NativeDate {
        constructor(...args) {
          super(...(args.length ? args : ['2026-10-24T00:00:00Z']));
        }
        static now() {
          return NativeDate.parse('2026-10-24T00:00:00Z');
        }
      };
    });
    await page.route('https://workbench.test/', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await page.goto('https://workbench.test/');
    const oldPeriod = {
      start: '2026-10-19',
      end: '2026-10-24',
      kind: 'week',
      sections: [{ id: 'orders', status: 'error', code: 'OLD_FAILURE', rows: [] }],
    };
    oldPeriod.metrics = computeWorkbenchMetrics(oldPeriod);
    const savedReport = restoreFailed
      ? {
          schemaVersion: 1,
          facts: {
            complete: true,
            selected: 'week',
            start: oldPeriod.start,
            end: oldPeriod.end,
            metricCalculationVersion,
            attributionVersion: 2,
            periods: { week: oldPeriod },
            directors: { status: 'error', rows: [] },
            customers: { status: 'ready', rows: [] },
            customerManagers: { status: 'ready', rows: [] },
          },
          edits: {},
        }
      : null;
    await page.evaluate(
      ({ config, savedReport }) => {
        const channel = new MessageChannel();
        window.fixturePort = channel.port1;
        window.pendingStock = [];
        window.queryIds = [];
        window.releaseStock = () => {
          window.stockReleased = true;
          window.pendingStock.splice(0).forEach((reply) => reply());
        };
        channel.port1.onmessage = ({ data }) => {
          if (data.type !== 'request') return;
          let result = { ok: true };
          if (data.method === 'workspace') {
            const request = data.parameters;
            result =
              request.operation === 'load'
                ? { version: 0, report: savedReport, scope: { base: '' } }
                : {
                    saved: true,
                    version: request.expectedVersion + 1,
                    requestId: request.requestId,
                  };
          }
          if (data.method === 'sql') {
            const id = data.parameters.queryId;
            window.queryIds.push(id);
            let rows = [];
            if (id === 'workbench.agedate') rows = [{ day: null }];
            else if (id.endsWith('.count')) rows = [{ total: 0 }];
            else if (id === 'workbench.orders.summary')
              rows = [
                {
                  ...Object.fromEntries(config.queries[id].resultColumns.map((key) => [key, null])),
                  base: '基地A',
                  category: '品类A',
                  item: '品项A',
                  director: '',
                  names: 0,
                  demand: 100,
                  shortage: 10,
                  records: 1,
                  invalid: 0,
                  summary: 1,
                },
              ];
            result = { rows, configVersion: 'fixture-v1' };
          }
          const reply = () => channel.port1.postMessage({ type: 'response', id: data.id, result });
          if (
            data.method === 'sql' &&
            data.parameters.queryId === 'workbench.stock.summary.packets' &&
            !window.stockReleased
          )
            window.pendingStock.push(reply);
          else reply();
        };
        window.postMessage(
          {
            protocol: 'gea-html-v2',
            type: 'connect',
            context: { session: 'workbench-fixture', plugin: 'inventory-orderworkbench' },
          },
          location.origin,
          [channel.port2],
        );
      },
      { config, savedReport },
    );
    await expect(page.locator('.wb-kpi-main strong').filter({ hasText: /^90\.00$/ })).toHaveCount(
      1,
    );
    await expect(page.locator('#periodMeta')).toContainText('对比数据及明细加载中');
    await expect(page.locator('#periodMeta')).not.toContainText('undefined');
    assert.ok(await page.evaluate(() => window.pendingStock.length > 0));
    await page.evaluate(() => window.releaseStock());
    await expect
      .poll(() =>
        page.evaluate(
          () => performance.getEntriesByName('dashboard:order-workbench:complete').length,
        ),
      )
      .toBe(1);
    await expect(page.locator('#periodMeta')).not.toContainText('对比数据及明细加载中');
    await page.evaluate(() => window.fixturePort.postMessage({ type: 'identity-changed' }));
    await expect
      .poll(() => page.locator('.wb-kpi-main strong').allTextContents())
      .toEqual(['—', '—', '—', '—', '—', '—']);
    assert.deepEqual(errors, []);
  });
