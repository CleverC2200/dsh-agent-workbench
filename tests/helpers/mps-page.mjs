import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { authorPage } from './author-page.mjs';
export async function mpsPage(t, config, execute) {
  const page = await authorPage(t, { mpsConfig: config });
  const calls = [];
  await page.exposeFunction('mpsQuery', async (message) => {
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
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('heading', { name: '需求确认', exact: true })).toBeVisible();
  return { page, frame, calls };
}
