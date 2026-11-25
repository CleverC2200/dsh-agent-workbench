import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { authorPage } from './author-page.mjs';
export async function mpsPage(t, config, execute, options = {}) {
  const queryFixture = options.optimizedPaging ? config : structuredClone(config);
  if (!options.optimizedPaging)
    for (const id of Object.keys(queryFixture.queries)) {
      if (id.includes('.calculation.')) delete queryFixture.queries[id];
      if (id === 'facts.history') queryFixture.queries[id].parameterSpec.page_size.maximum = 500;
      if (id === 'facts.shipment-history')
        queryFixture.queries[id].parameterSpec.page_size.maximum = 200;
    }
  const page = await authorPage(t, { ...options, mpsConfig: queryFixture });
  await options.beforeOpen?.(page);
  const calls = [];
  const contexts = [];
  await page.exposeFunction('mpsQuery', async (message) => {
    if (message.method === 'context') contexts.push(message.parameters);
    if (message.method !== 'sql') return {};
    assert.deepEqual(Object.keys(message.parameters).sort(), ['parameters', 'queryId']);
    calls.push(message.parameters);
    return execute(message.parameters);
  });
  await page.evaluate(() => {
    window.addEventListener('message', (event) => {
      if (event.data?.protocol !== 'gea-html-v2' || event.data.type !== 'ready') return;
      const pair = new MessageChannel();
      window.mpsPort = pair.port1;
      pair.port1.onmessage = async ({ data }) => {
        if (data.type !== 'request') return;
        try {
          pair.port1.postMessage({
            type: 'response',
            id: data.id,
            result: await window.mpsQuery(data),
          });
        } catch (error) {
          pair.port1.postMessage({ type: 'response', id: data.id, error: error.message });
        }
      };
      event.source.postMessage(
        {
          protocol: 'gea-html-v2',
          type: 'connect',
          context: { session: 'fixture-mps-session', plugin: 'inventory-mps' },
        },
        '*',
        [pair.port2],
      );
    });
  });
  await page.evaluate(
    (startAtShipment) =>
      window.openAuthor('mps', 1200, startAtShipment ? { version: 1, tab: 'ship' } : undefined),
    options.startAtShipment === true,
  );
  const frame = page.frameLocator('iframe');
  await expect(
    frame.getByRole('heading', {
      name: options.startAtShipment ? '本月预估发货' : '需求确认',
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  return { page, frame, calls, contexts };
}

export async function openMpsCategoryFilter(frame) {
  const group = frame.getByRole('group', { name: '大类筛选', exact: true });
  if (!(await group.isVisible())) await frame.locator('summary[aria-label="大类筛选"]').click();
  return group;
}

export async function openMpsProductDetails(frame) {
  const section = frame.getByRole('region', { name: '产品明细', exact: true });
  const details = section.locator(':scope > details');
  if (!(await details.evaluate((element) => element.open)))
    await details.locator(':scope > summary').click();
  return section;
}

export async function mpsPageWithExactProductPeriod(t, config, execute, options = {}) {
  return mpsPage(
    t,
    config,
    async (request) => {
      if (request.queryId !== 'products.period') return execute(request);
      const result = await execute({
        ...request,
        queryId: 'products.count',
        parameters: { month: request.parameters.month },
      });
      return {
        ...result,
        rows: [{ month: Number(result.rows[0]?.total) > 0 ? request.parameters.month : null }],
        returnedColumns: ['month'],
        totalRowCount: 1,
        offset: 0,
        hasMorePages: false,
      };
    },
    options,
  );
}
