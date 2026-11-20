import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { authorPage } from './author-page.mjs';
export async function mpsPage(t, config, execute, options = {}) {
  const page = await authorPage(t, { ...options, mpsConfig: config });
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
