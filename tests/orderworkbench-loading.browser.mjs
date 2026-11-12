import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import {
  computeWorkbenchMetrics,
  metricCalculationVersion,
} from '../prototypes/inventory-orderworkbench/metric-model.mjs';

for (const [restoreFailed, narrowScope] of [
  [false, false],
  [true, false],
  [false, true],
])
  test(`built workbench paints before slow stock and clears identity (saved failure: ${restoreFailed}, narrow scope: ${narrowScope})`, async (t) => {
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
      ({ config, savedReport, restoreFailed, narrowScope }) => {
        const channel = new MessageChannel();
        window.fixturePort = channel.port1;
        window.pendingStock = [];
        window.queryIds = [];
        window.failedQueries = 0;
        window.workspaceLoads = 0;
        window.releaseStock = () => {
          window.stockReleased = true;
          window.pendingStock.splice(0).forEach((reply) => reply());
        };
        channel.port1.onmessage = ({ data }) => {
          if (data.type !== 'request') return;
          let result = { ok: true };
          if (data.method === 'workspace') {
            window.workspaceLoads++;
            const request = data.parameters;
            result =
              request.operation === 'load'
                ? {
                    version: 0,
                    report: savedReport,
                    scope: { key: 'verified-scope', base: narrowScope ? '基地A' : '' },
                  }
                : {
                    saved: true,
                    version: request.expectedVersion + 1,
                    requestId: request.requestId,
                  };
          }
          if (data.method === 'sql') {
            const id = data.parameters.queryId;
            const parameters = data.parameters.parameters;
            window.queryIds.push(id);
            let rows = [];
            if (id === 'workbench.agedate') rows = [{ day: null }];
            else if (id === 'workbench.period-snapshots')
              rows = [
                Object.fromEntries(
                  Array.from({ length: 6 }, (_, index) => [
                    ['stock_' + index, null],
                    ['age_' + index, null],
                  ]).flat(),
                ),
              ];
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
                  shortage: parameters.report_base ? 20 : 10,
                  records: 1,
                  invalid: 0,
                  summary: 1,
                },
              ];
            if (id === 'workbench.orders.periods.summary') {
              const columns = [
                'period_index',
                ...config.queries['workbench.orders.summary'].resultColumns,
              ];
              const members = Array.from({ length: 6 }, (_, index) => index)
                .filter((index) => parameters[`period_${index}_enabled`])
                .map((index) => ({
                  ...Object.fromEntries(columns.map((key) => [key, null])),
                  period_index: index,
                  base: '基地A',
                  category: '品类A',
                  item: '品项A',
                  director: '',
                  names: 0,
                  demand: 100,
                  shortage: parameters.report_base ? 20 : 10,
                  records: 1,
                  invalid: 0,
                  summary: 1,
                }));
              const encode = (value) =>
                value === null
                  ? 'N'
                  : 'V' + new TextEncoder().encode(String(value)).length + ':' + value;
              rows = members.length
                ? [
                    {
                      section_id: 0,
                      packet_index: 0,
                      packet_count: members.length,
                      packet_scope_total: members.length,
                      packet_rows: members.map((row, index) =>
                        [index + 1, ...columns.map((key) => row[key])].map(encode).join(''),
                      ),
                    },
                  ]
                : [];
            }
            result = { rows, configVersion: 'fixture-v1' };
            if (restoreFailed && id === 'workbench.ontime.periods.summary') {
              window.failedQueries++;
              result = {
                success: false,
                failure: { reasonCode: 'QUERY_TIMEOUT', message: 'fixture timeout' },
              };
            }
          }
          const reply = () => channel.port1.postMessage({ type: 'response', id: data.id, result });
          if (
            data.method === 'sql' &&
            data.parameters.queryId === 'workbench.stock.periods.summary' &&
            !window.stockReleased
          )
            window.pendingStock.push(reply);
          else if (
            data.method === 'workspace' &&
            data.parameters.operation === 'load' &&
            !window.workspaceReleased
          )
            window.releaseWorkspace = () => {
              window.workspaceReleased = true;
              reply();
            };
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
      { config, savedReport, restoreFailed, narrowScope },
    );
    await expect.poll(() => page.evaluate(() => window.queryIds.length)).toBeGreaterThan(0);
    await expect(page.locator('.wb-kpi-main strong').filter({ hasText: /^90\.00$/ })).toHaveCount(
      0,
    );
    await page.evaluate(() => window.releaseWorkspace());
    await expect(
      page
        .locator('.wb-kpi-main strong')
        .filter({ hasText: narrowScope ? /^80\.00$/ : /^90\.00$/ }),
    ).toHaveCount(1);
    await expect(page.locator('#periodMeta')).toContainText('对比数据及明细加载中');
    await expect(page.locator('#periodMeta')).not.toContainText('undefined');
    assert.ok(await page.evaluate(() => window.pendingStock.length > 0));
    await page.evaluate(() => window.releaseStock());
    await expect
      .poll(() =>
        page.evaluate(
          (restoreFailed) =>
            performance.getEntriesByName(
              'dashboard:order-workbench:' + (restoreFailed ? 'partial' : 'complete'),
            ).length,
          restoreFailed,
        ),
      )
      .toBe(1);
    await expect(page.locator('#periodMeta')).not.toContainText('对比数据及明细加载中');
    const reads = await page.evaluate(() => window.queryIds.length);
    const failures = await page.evaluate(() => window.failedQueries);
    const values = await page.locator('.wb-kpi-main strong').allTextContents();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('gea-session-changing'));
      window.dispatchEvent(new Event('gea-session-changed'));
    });
    await expect.poll(() => page.locator('.wb-kpi-main strong').allTextContents()).toEqual(values);
    if (restoreFailed)
      await expect.poll(() => page.evaluate(() => window.failedQueries)).toBe(failures * 2);
    assert.equal(
      await page.evaluate(() => window.queryIds.length),
      reads + failures,
      'returning retries only failed queries and keeps successful results',
    );
    const loads = await page.evaluate(() => window.workspaceLoads);
    await page.evaluate(() =>
      window.fixturePort.postMessage({
        type: 'context',
        context: {
          session: 'replacement-orders-session',
          plugin: 'inventory-orderworkbench',
        },
      }),
    );
    await expect.poll(() => page.evaluate(() => window.workspaceLoads)).toBe(loads + 1);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            performance.getEntriesByName('dashboard:order-workbench:retained-report-ready').length,
        ),
      )
      .toBe(1);
    await expect.poll(() => page.locator('.wb-kpi-main strong').allTextContents()).toEqual(values);
    if (restoreFailed)
      await expect.poll(() => page.evaluate(() => window.failedQueries)).toBe(failures * 3);
    assert.equal(
      await page.evaluate(() => window.queryIds.length),
      reads + failures * 2,
      'a replacement Session rechecks report scope and edits, then reuses only business facts',
    );
    await page.evaluate(() => window.fixturePort.postMessage({ type: 'identity-changed' }));
    await expect
      .poll(() => page.locator('.wb-kpi-main strong').allTextContents())
      .toEqual(['—', '—', '—', '—', '—', '—']);
    assert.deepEqual(errors, []);
  });
