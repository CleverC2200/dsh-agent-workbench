import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

test('province tab renders all three document tables and lazily caches distinct order counts', async (t) => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
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
        super(...(args.length ? args : ['2026-10-23T00:00:00Z']));
      }
      static now() {
        return NativeDate.parse('2026-10-23T00:00:00Z');
      }
    };
  });
  await page.route('https://province.workbench.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await page.goto('https://province.workbench.test/');
  await page.evaluate(
    ({ config }) => {
      const channel = new MessageChannel();
      window.provinceReads = 0;
      window.savedWrites = 0;
      window.countFailure = true;
      window.fixtureEdits = {
        imports: [
          {
            batch: {
              batchId: 'title-regression',
              unmet: [
                {
                  key: 'base-test',
                  dimension: 'base',
                  entity: '郑州',
                  base: '郑州',
                  reason: '待核验',
                  measure: '待制定改善措施',
                },
              ],
            },
          },
        ],
      };
      window.fixtureEditVersion = 0;
      channel.port1.onmessage = ({ data }) => {
        if (data.type !== 'request') return;
        let result = { ok: true };
        if (data.method === 'workspace') {
          if (data.parameters.operation !== 'load') window.savedWrites++;
          if (data.parameters.operation === 'save-edits') {
            window.fixtureEdits = data.parameters.report.edits;
            result = {
              saved: true,
              requestId: data.parameters.requestId,
              version: ++window.fixtureEditVersion,
            };
          } else
            result = {
              version: 0,
              editVersion: window.fixtureEditVersion,
              report: { edits: window.fixtureEdits },
              scope: { key: 'province-fixture-scope', base: '' },
            };
        }
        if (data.method === 'sql') {
          const id = data.parameters.queryId,
            parameters = data.parameters.parameters;
          let rows = [];
          if (id === 'workbench.period-snapshots')
            rows = [
              Object.fromEntries(
                Array.from({ length: 6 }, (_, i) => [
                  ['stock_' + i, null],
                  ['age_' + i, null],
                ]).flat(),
              ),
            ];
          else if (id.endsWith('.count')) rows = [{ total: 0 }];
          else if (id === 'workbench.province.amendment.orders') {
            window.provinceReads++;
            if (window.countFailure) {
              channel.port1.postMessage({
                type: 'response',
                id: data.id,
                result: {
                  success: false,
                  failure: { reasonCode: 'QUERY_FAILED', message: 'fixture count failure' },
                },
              });
              return;
            }
            rows = [
              { region: '华中', province: '河南', changed_orders: 2 },
              { region: '华中', province: '湖南', changed_orders: 1 },
            ];
          } else if (
            id.includes('changes.') &&
            id.includes('periods.summary') &&
            !id.includes('partition1')
          ) {
            const kind = id.includes('amendment') ? '2' : '1';
            const columns = ['period_index', ...config.queries['workbench.changes'].resultColumns];
            const records = [];
            for (let i = 0; i < 6; i++)
              if (parameters['period_' + i + '_enabled']) {
                for (const province of ['河南', '湖南']) {
                  const numerator = kind === '1' ? (province === '河南' ? 10 : 5) : 3;
                  records.push({
                    ...Object.fromEntries(columns.map((key) => [key, null])),
                    period_index: i,
                    base: '郑州',
                    kind,
                    region: '华中',
                    province,
                    numerator,
                    denominator: 100,
                    sample_numerator: numerator,
                    sample_denominator: 100,
                    sample_records: 1,
                    records: 1,
                    invalid: 0,
                    unknown_quantity: 0,
                  });
                }
              }
            const encode = (value) =>
              value === null
                ? 'N'
                : 'V' + new TextEncoder().encode(String(value)).length + ':' + value;
            if (records.length)
              rows = [
                {
                  packet_index: 0,
                  packet_count: records.length,
                  packet_scope_total: records.length,
                  packet_rows: records.map((row, i) =>
                    [i + 1, ...columns.map((key) => row[key])].map(encode).join(''),
                  ),
                },
              ];
          }
          result = { rows, configVersion: 'province-fixture-v1' };
        }
        channel.port1.postMessage({ type: 'response', id: data.id, result });
      };
      window.fixturePort = channel.port1;
      window.postMessage(
        {
          protocol: 'gea-html-v2',
          type: 'connect',
          context: { session: 'province-fixture', plugin: 'inventory-orderworkbench' },
        },
        location.origin,
        [channel.port2],
      );
    },
    { config },
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => performance.getEntriesByName('dashboard:order-workbench:complete').length,
      ),
    )
    .toBe(1);
  assert.equal(await page.evaluate(() => window.provinceReads), 0);
  const tab = page.getByRole('tab', { name: '省区维度分析', exact: true });
  await tab.click();
  const panel = page.locator('#wbDimensionPanel');
  await expect(panel.locator('table')).toHaveCount(3);
  await expect(panel.getByRole('heading', { name: '省区作废率' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: '省区改单率' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: '省区改单和作废综合排名 TOP10' })).toBeVisible();
  await expect(panel.locator('table').nth(0).locator('tbody tr')).toHaveCount(2);
  await expect(panel.locator('table').nth(0).locator('tbody tr').first()).toContainText('10.00%');
  await expect(panel.locator('table').nth(2).locator('tbody tr').first()).toContainText('13.00%');
  const retry = panel.getByRole('button', { name: '重新读取改单笔数' });
  await expect(retry).toBeVisible();
  await page.evaluate(() => {
    window.countFailure = false;
  });
  await retry.click();
  await expect(
    panel.locator('table').nth(1).locator('tbody tr').first().locator('td').nth(6),
  ).toHaveText('2');
  const reads = await page.evaluate(() => window.provinceReads);
  await page.getByRole('tab', { name: '基地维度达成分析', exact: true }).click();
  await tab.click();
  assert.equal(await page.evaluate(() => window.provinceReads), reads);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('gea-session-changing'));
    window.dispatchEvent(new Event('gea-session-changed'));
  });
  await expect(
    panel.locator('table').nth(1).locator('tbody tr').first().locator('td').nth(6),
  ).toHaveText('2');
  assert.equal(await page.evaluate(() => window.provinceReads), reads);
  await expect(panel.locator('table').nth(0).locator('thead tr')).toHaveCount(1);
  await expect(panel.locator('table').nth(2).locator('thead tr')).toHaveCount(2);
  await tab.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: '品项维度达成分析', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(tab).toBeFocused();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await page.setViewportSize({ width: 1000, height: 1000 });
  assert.ok(
    await panel
      .locator('.wb-performance-table-wrap')
      .nth(2)
      .evaluate((element) => element.scrollWidth > element.clientWidth),
  );
  assert.equal(await page.evaluate(() => window.savedWrites), 0);
  await expect(
    panel.getByRole('heading', { name: '省区未达成项：原因分析与改善措施' }),
  ).toBeVisible();
  await panel.locator('[data-wb-add-unmet="province"]').click();
  const option = await page.locator('#wbUnmetEntity option').nth(1).getAttribute('value');
  await page.locator('#wbUnmetEntity').selectOption(option);
  await page.locator('#wbUnmetTitleInput').fill('省区联调');
  await page.locator('#wbUnmetReasonInput').fill('待核验');
  await page.locator('#wbUnmetMeasureInput').fill('待制定改善措施');
  await page.locator('#wbUnmetAddSubmit').click();
  await expect(panel.locator('[data-wb-unmet-card]')).toContainText('省区联调');
  await panel.locator('[data-wb-edit-unmet]').click();
  await expect(page.locator('#wbUnmetAddTitle')).toHaveText('编辑省区未达成项');
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: '基地维度达成分析', exact: true }).click();
  await tab.click();
  await expect(panel.locator('[data-wb-unmet-card]')).toContainText('省区联调');
  await page.getByRole('tab', { name: '基地维度达成分析', exact: true }).click();
  const importedCard = panel.locator('[data-wb-unmet-card]').filter({ hasText: '郑州' });
  await importedCard.locator('[data-wb-edit-unmet]').click();
  await page.locator('#wbUnmetTitleInput').fill('货龄改善跟进');
  await page.locator('#wbUnmetAddSubmit').click();
  await expect(importedCard).toContainText('郑州基地｜货龄改善跟进');
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.fixtureEdits.overrides?.some(
          ([key, value]) => key.includes(':import:') && value.title === '货龄改善跟进',
        ),
      ),
    )
    .toBe(true);
  await importedCard.locator('[data-wb-edit-unmet]').click();
  await expect(page.locator('#wbUnmetTitleInput')).toHaveValue('货龄改善跟进');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('gea-session-changing'));
    window.dispatchEvent(new Event('gea-session-changed'));
  });
  await expect(panel.locator('[data-wb-unmet-card]').filter({ hasText: '郑州' })).toContainText(
    '郑州基地｜货龄改善跟进',
  );
  await tab.click();
  assert.deepEqual(errors, []);
  if (process.env.PROVINCE_PREVIEW_SCREENSHOT) {
    await page.setViewportSize({ width: 1680, height: 1150 });
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: process.env.PROVINCE_PREVIEW_SCREENSHOT });
  }
});
