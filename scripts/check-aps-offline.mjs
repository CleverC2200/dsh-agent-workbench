import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const evidence = resolve(process.env.APS_EVIDENCE_DIR ?? '.runtime/aps-offline');
await mkdir(evidence, { recursive: true });
const html = await readFile('lib/business/inventory-apsplan/index.html', 'utf8');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/*', (route) =>
  route.request().url() === 'https://aps.fixture/page.html'
    ? route.fulfill({ contentType: 'text/html', body: html })
    : route.request().url() === 'https://aps.fixture/'
      ? route.fulfill({
          contentType: 'text/html',
          body: '<html><body><iframe sandbox="allow-scripts allow-downloads" style="width:100%;height:850px"></iframe></body></html>',
        })
      : route.abort(),
);
try {
  await page.goto('https://aps.fixture/');
  await page.evaluate(() => {
    const fixture = (window.apsFixture = {
      requests: [],
      contexts: [],
      catalogs: [],
      invocations: {},
      sequence: 0,
    });
    const frame = document.querySelector('iframe');
    frame.onload = () => {
      const channel = new MessageChannel();
      fixture.port = channel.port1;
      fixture.port.onmessage = ({ data }) => {
        if (data.type === 'catalog') {
          fixture.catalogs.push(data);
          return;
        }
        if (data.type === 'invoked') {
          fixture.invocations[data.id] = data;
          return;
        }
        if (data.type === 'cancel') {
          fixture.cancelled = data;
          return;
        }
        if (data.type !== 'request') return;
        fixture.requests.push(data);
        if (data.method === 'context') {
          fixture.contexts.push(data.parameters);
          fixture.context = data.parameters;
        }
        if (fixture.holdNextContext && data.method === 'context') {
          fixture.holdNextContext = false;
          fixture.held = data;
          return;
        }
        fixture.port.postMessage({ type: 'response', id: data.id, result: { ok: true } });
      };
      frame.contentWindow.postMessage(
        {
          protocol: 'gea-html-v2',
          type: 'connect',
          context: {
            plugin: 'inventory-apsplan',
            session: 'session-00000000-0000-4000-8000-000000000047',
          },
        },
        '*',
        [channel.port2],
      );
    };
    frame.src = 'https://aps.fixture/page.html';
  });
  await page.waitForFunction(() => window.apsFixture.context?.simulated === true);
  const invoke = async (parameters, name = 'filter') => {
    const id = await page.evaluate(
      ({ parameters, name }) => {
        const f = window.apsFixture;
        const id = String(++f.sequence);
        f.port.postMessage({
          type: 'invoke',
          id,
          name,
          session: 'session-00000000-0000-4000-8000-000000000047',
          arguments: parameters,
        });
        return id;
      },
      { parameters, name },
    );
    await page.waitForFunction((id) => window.apsFixture.invocations[id], id);
    return page.evaluate((id) => window.apsFixture.invocations[id], id);
  };
  let context = await page.evaluate(() => window.apsFixture.context);
  assert.equal(context.realData, false);
  assert.equal(context.mode, 'APS_MOCK');
  assert.equal(context.metrics['库存量'].value, 3);
  assert.equal(context.metrics['订单满足率'].value, 99);
  assert.equal(context.metrics['生产计划达成率'].value, null);
  assert.equal((await invoke({ workspace: 'intelligent', base: '华东' })).error, undefined);
  await page.waitForFunction(
    () => window.apsFixture.context?.scope?.base === '华东' && window.apsFixture.context.simulated,
  );
  context = await page.evaluate(() => window.apsFixture.context);
  assert.equal(context.metrics['库存量'].value, 2);
  assert.equal(context.metrics['订单满足率'].value, 90);
  assert.ok((await invoke({ base: '未返回基地' })).error);
  assert.equal(
    (
      await invoke({
        workspace: 'plan',
        analysisScope: 'production',
        granularity: 'week',
        date: '2026-08-25',
      })
    ).error,
    undefined,
  );
  await page.waitForFunction(
    () =>
      window.apsFixture.context?.period?.date === '2026-08-30' &&
      window.apsFixture.context.simulated,
  );
  assert.equal((await invoke({ date: '2026-08-10' })).error, undefined);
  await page.waitForFunction(
    () =>
      window.apsFixture.context?.period?.date === '2026-08-16' &&
      window.apsFixture.context.simulated,
  );
  assert.equal((await invoke({ date: '2026-08-10' })).error, undefined);
  await page.waitForFunction(
    () =>
      window.apsFixture.context?.period?.date === '2026-08-16' &&
      window.apsFixture.context.simulated,
  );
  await page.evaluate(() => {
    window.apsFixture.holdNextContext = true;
  });
  const cancelId = await page.evaluate(() => {
    const f = window.apsFixture;
    const id = String(++f.sequence);
    f.port.postMessage({
      type: 'invoke',
      id,
      name: 'filter',
      session: 'session-00000000-0000-4000-8000-000000000047',
      arguments: { base: '华南' },
    });
    return id;
  });
  await page.waitForFunction(() => window.apsFixture.held);
  await page.evaluate(
    (id) =>
      window.apsFixture.port.postMessage({
        type: 'cancel',
        id,
        session: 'session-00000000-0000-4000-8000-000000000047',
      }),
    cancelId,
  );
  await page.waitForFunction((id) => window.apsFixture.invocations[id]?.error, cancelId);
  await page.waitForFunction(
    () => window.apsFixture.context?.scope?.base === '华东' && window.apsFixture.context.simulated,
  );
  await page.evaluate(() => {
    const f = window.apsFixture;
    f.port.postMessage({ type: 'response', id: f.held.id, result: { ok: true } });
  });
  assert.equal(await page.evaluate(() => window.apsFixture.context.scope.base), '华东');
  assert.equal((await invoke({}, 'refresh')).error, undefined);
  await page.waitForFunction(() => window.apsFixture.context?.simulated === true);
  const result = await page.evaluate(() => ({
    context: window.apsFixture.context,
    catalog: window.apsFixture.catalogs.at(-1),
    businessRequests: window.apsFixture.requests.filter((item) =>
      ['sql', 'workspace', 'conversation'].includes(item.method),
    ),
  }));
  assert.deepEqual(result.businessRequests, []);
  assert.deepEqual(errors, []);
  for (const element of result.catalog.elements) assert.match(element.id, /^[a-zA-Z0-9_.:-]+$/);
  await page.screenshot({ path: resolve(evidence, 'aps-offline-pc.png') });
  await writeFile(
    resolve(evidence, 'offline-result.json'),
    JSON.stringify(
      { ...result, errors, level: 'offline fixed mock only', native: 'not-run' },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'APS fixed mock PC/context/filter/week/missing/catalog passed; remote business requests 0',
  );
} finally {
  await browser.close();
}
