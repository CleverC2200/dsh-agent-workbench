import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from './helpers/prepared-assets.mjs';
import { chromium, expect } from '@playwright/test';
import { prepareFulfillmentPresentation } from '../prototypes/inventory-orderfulfillment/prepare-presentation.mjs';

test('live fulfillment keeps granted rows and clears denied, filtered and previous-identity facts', async (t) => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.DSH_BROWSER_CHANNEL ? { channel: process.env.DSH_BROWSER_CHANNEL } : {}),
  });
  t.after(() => browser.close());
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1050 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const config = await readFile('business/inventory-orderfulfillment/sql.config.json', 'utf8');
  const html = (
    await readFile('lib/business/inventory-orderfulfillment/index.html', 'utf8')
  ).replace(
    '<head>',
    '<head><script id="agent-sql-config" type="application/json">' +
      config.replaceAll('<', '\\u003c') +
      '</script>',
  );
  await page.route('https://fulfillment.test/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await page.goto('https://fulfillment.test/');
  await page.evaluate(() => {
    window.fixtureDenied = false;
    window.fixtureContexts = [];
    window.connectFixture = (session) => {
      const channel = new MessageChannel();
      window.fixturePort = channel.port1;
      channel.port1.onmessage = ({ data }) => {
        if (data.type !== 'request') return;
        let result = { ok: true };
        if (data.method === 'context') window.fixtureContexts.push(data.parameters);
        if (data.method === 'sql') {
          const id = data.parameters.queryId;
          result = window.fixtureDenied
            ? {
                success: false,
                errorCode: 'RETURN_PERMISSION_DENIED',
                message: 'Denied',
              }
            : id === 'orders.source-period'
              ? {
                  rows: [
                    { latest_created: '2026-10-21 12:00:00', latest_load: '2026-10-21 12:05:00' },
                  ],
                  configVersion: 'v1',
                }
              : id === 'orders.facts'
                ? {
                    rows: [
                      {
                        cust_order_no: 'AUTHORIZED-ORDER',
                        executeorderno: 'E1',
                        executeorderlineno: '1',
                        cust_code: 'C01',
                        cust_name: 'PRIVATE-CUSTOMER',
                        detailstatus: 10,
                        is_stat: '1',
                      },
                    ],
                    returnedColumns: [
                      'cust_order_no',
                      'executeorderno',
                      'executeorderlineno',
                      'cust_code',
                      'detailstatus',
                      'is_stat',
                    ],
                    rejectedColumns: ['cust_name'],
                    configVersion: 'v1',
                  }
                : id.endsWith('.count')
                  ? { rows: [{ total: 1 }], configVersion: 'v1' }
                  : id === 'orders.summary'
                    ? {
                        rows: [
                          {
                            source_orders: 1,
                            source_rows: 1,
                            first_created: '2026-10-21',
                            latest_created: '2026-10-21',
                          },
                        ],
                        configVersion: 'v1',
                      }
                    : id === 'trace.summary'
                      ? {
                          rows: [
                            {
                              matched_orders: 1,
                              overdue_orders: 0,
                              warning_orders: 0,
                            },
                          ],
                          configVersion: 'v1',
                        }
                      : {
                          rows: [
                            {
                              order_no: 'AUTHORIZED-ORDER',
                              customer_code: 'C01',
                              customer_name: 'PRIVATE-CUSTOMER',
                            },
                          ],
                          returnedColumns: ['order_no', 'customer_code'],
                          rejectedColumns: ['customer_name'],
                          configVersion: 'v1',
                        };
        }
        channel.port1.postMessage({ type: 'response', id: data.id, result });
      };
      window.postMessage(
        {
          protocol: 'gea-html-v2',
          type: 'connect',
          context: { session, plugin: 'inventory-orderfulfillment' },
        },
        location.origin,
        [channel.port2],
      );
    };
    window.connectFixture('session-a');
  });
  await expect(page.locator('#deliveryOrderDetailRows')).toContainText('AUTHORIZED-ORDER');
  const original = await browser.newPage({
    viewport: { width: 1600, height: 1050 },
  });
  await original.route('https://reference.test/', async (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: prepareFulfillmentPresentation(
        await readFile('prototypes/inventory-orderfulfillment/presentation.html', 'utf8'),
      ).replace(
        '</head>',
        '<style>' +
          (await readFile('theme/tokens.css', 'utf8')) +
          '\n' +
          (await readFile('prototypes/inventory-orderfulfillment/theme.css', 'utf8')) +
          '</style></head>',
      ),
    }),
  );
  await original.goto('https://reference.test/');
  // Compare author styles using the same fixture row and the scroll wrapper
  // installed by orderPage; the retained presentation has no sample rows.
  await original.evaluate(
    (markup) => {
      const table = document.querySelector('.delivery-order-table');
      table.tBodies[0].innerHTML = markup;
      const scroll = document.createElement('div');
      scroll.className = 'fulfillment-table-scroll';
      table.before(scroll);
      scroll.append(table);
    },
    await page.locator('#deliveryOrderDetailRows').innerHTML(),
  );
  const appearance = () =>
    Object.fromEntries(
      [
        '.content',
        '.fulfillment-header',
        '.summary.delivery-summary',
        '.delivery-order-table',
        '.delivery-order-table th',
        '.delivery-order-table td',
      ].map((selector) => {
        const node = document.querySelector(selector);
        if (!node) throw Error('Missing appearance fixture: ' + selector + ' at ' + location.href);
        const style = getComputedStyle(node),
          rect = node.getBoundingClientRect();
        return [
          selector,
          {
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            padding: style.padding,
            width: rect.width,
            left: rect.x,
          },
        ];
      }),
    );
  assert.deepEqual(await page.evaluate(appearance), await original.evaluate(appearance));
  await expect(page.locator('.author-questions')).toHaveCount(0);
  await original.close();
  await expect(page.locator('body')).not.toContainText('PRIVATE-CUSTOMER');
  await expect(page.locator('body')).not.toContainText('6,320');
  await page.locator('#deliveryCustomerQuery').fill('C02');
  await expect(page.locator('#deliveryOrderDetailRows')).not.toContainText('AUTHORIZED-ORDER');
  await expect(page.locator('#deliveryOrderDetailRows')).toContainText('AUTHORIZED-ORDER');
  await page.getByRole('tab', { name: '仓配', exact: true }).click();
  await expect(page.locator('#warehouseDimensionPanel')).toBeVisible();
  await page.getByRole('tab', { name: '品项', exact: true }).click();
  await expect(page.locator('#itemInventoryPanel')).toBeVisible();
  await page.setViewportSize({ width: 500, height: 900 });
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('#prototypeStatus')).toBeHidden();
  assert.deepEqual(
    await page.evaluate(() =>
      ['.shell', '.main', '.layout', '.workspace'].filter((selector) =>
        ['auto', 'scroll'].includes(getComputedStyle(document.querySelector(selector)).overflowY),
      ),
    ),
    [],
  );
  await mkdir('.runtime/order01', { recursive: true });
  await page.screenshot({
    path: '.runtime/order01/authorized-fixture.png',
    fullPage: true,
  });
  await page.evaluate(() => {
    window.fixturePort.postMessage({ type: 'identity-changed' });
  });
  await expect(page.locator('#deliveryOrderDetailRows')).not.toContainText('AUTHORIZED-ORDER');
  await page.evaluate(() => {
    window.fixtureDenied = true;
    window.connectFixture('session-b');
  });
  await expect(page.locator('#prototypeStatus')).toContainText('订单源日期读取失败或未获授权');
  await expect(page.locator('body')).not.toContainText('AUTHORIZED-ORDER');
  assert.deepEqual(errors, []);
});
