import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { chromium, expect } from '@playwright/test';

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'tsx',
    contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {WorkbenchPage,workbenchHost} from './src/workbench/page.tsx';
import {WorkbenchHostProvider} from './src/workbench/original/bridge.ts';
import {zh} from './src/client/locales.ts';
window.publishIdentity=(snapshot)=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window.parent,data:{type:'gea:identity-snapshot',snapshot}}));
createRoot(document.getElementById('root')).render(<WorkbenchHostProvider value={workbenchHost}><WorkbenchPage t={key=>zh[key]}/></WorkbenchHostProvider>);
`,
  },
  bundle: true,
  write: false,
  outfile: '/fixture/app.js',
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"test"' },
  loader: { '.svg': 'dataurl', '.png': 'dataurl' },
});
async function open(t, authenticated) {
  const assets = new Map(bundle.outputFiles.map((x) => [x.path.split('/').at(-1), x.text]));
  const server = createServer((req, res) => {
    const name = req.url.slice(1);
    res.setHeader(
      'content-type',
      name.endsWith('.js')
        ? 'text/javascript'
        : name.endsWith('.css')
          ? 'text/css'
          : 'text/html; charset=utf-8',
    );
    res.end(
      assets.get(name) ??
        '<meta charset="utf-8"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>',
    );
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((r) => server.close(r));
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const calls = [];
  const errors = [];
  let external = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  const status = {
    environment: 'test',
    environments: ['production', 'test'],
    authenticated,
    pageScope: null,
    loginState: authenticated ? 'authenticated' : 'anonymous',
    user: authenticated ? { id: 'user', username: 'user' } : null,
    roles: [],
    mode: 'model',
  };
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') {
      external++;
      return route.abort();
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const payload = route.request().postDataJSON();
    calls.push({ path: url.pathname, payload });
    let value = status;
    if (url.pathname.endsWith('login/start'))
      value = { image: 'data:image/png;base64,AA==', loginId: 'qr', expiresIn: 120 };
    if (url.pathname.endsWith('login/poll')) value = { ...status, status: 'authenticated' };
    if (url.pathname.endsWith('workflow/config')) value = [];
    if (url.pathname.endsWith('workbench/query'))
      value = { records: [], total: 0, size: 100, current: 1, pages: 0 };
    await route.fulfill({ json: { ok: true, value } });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.publishIdentity);
  await expect(page.locator('.gea-workbench-boot')).toBeVisible();
  const publish = (snapshot) => page.evaluate((value) => window.publishIdentity(value), snapshot);
  await publish({ state: 'confirmed', scope: null, status });
  return { page, calls, errors, external: () => external, status, publish };
}
test(
  'Native opens the authenticated approval page without model discovery or writes',
  { timeout: 30000 },
  async (t) => {
    const f = await open(t, true);
    await expect(f.page.locator('.gea-original-workbench')).toBeVisible();
    assert.equal(f.calls.filter((c) => c.path.endsWith('model/discover')).length, 0);
    assert.equal(f.calls.filter((c) => /action|submit|model\/advice/.test(c.path)).length, 0);
    assert.deepEqual(f.errors, []);
    assert.equal(f.external(), 0);
  },
);

test(
  'Native QR waits for Host confirmation and only accepts parent snapshots while replacing environments',
  { timeout: 30000 },
  async (t) => {
    const f = await open(t, false);
    await expect(f.page.locator('.gea-login-qr img')).toBeVisible();
    await expect.poll(() => f.calls.filter((c) => c.path.endsWith('login/poll')).length).toBe(1);
    await expect(f.page.locator('.gea-original-workbench')).toHaveCount(0);
    await expect(f.page.locator('.gea-login-qr img')).toBeVisible();
    await f.page.evaluate((status) => {
      const snapshot = {
        state: 'confirmed',
        scope: 'untrusted',
        status: { ...status, authenticated: true },
      };
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://other.invalid',
          source: window.parent,
          data: { type: 'gea:identity-snapshot', snapshot },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: location.origin,
          source: null,
          data: { type: 'gea:identity-snapshot', snapshot },
        }),
      );
    }, f.status);
    await expect(f.page.locator('.gea-original-workbench')).toHaveCount(0);
    await f.page.locator('input[type="radio"][value="production"]').check();
    await expect
      .poll(() => f.calls.filter((c) => c.path.endsWith('login/start')).at(-1)?.payload.environment)
      .toBe('production');
    await expect(f.page.locator('.gea-login-qr img')).toBeVisible();
    await f.page.getByRole('button', { name: '刷新二维码', exact: true }).click();
    await expect.poll(() => f.calls.filter((c) => c.path.endsWith('login/start')).length).toBe(3);
    await f.publish({
      state: 'unknown',
      scope: null,
      status: { ...f.status, authenticated: true },
    });
    await expect(f.page.locator('.gea-workbench-boot')).toBeVisible();
    await expect(f.page.locator('.gea-login-qr')).toHaveCount(0);
    f.status.pageScope = 'host:test:tenant:host-user';
    f.status.authenticated = true;
    f.status.user = { id: 'host-user', username: 'Host' };
    await f.publish({ state: 'confirmed', scope: f.status.pageScope, status: f.status });
    await expect(f.page.locator('.gea-original-workbench')).toBeVisible();
    assert.equal(
      f.calls.filter((c) => /action|submit|model\/advice|model\/discover/.test(c.path)).length,
      0,
    );
    assert.deepEqual(f.errors, []);
    assert.equal(f.external(), 0);
  },
);
