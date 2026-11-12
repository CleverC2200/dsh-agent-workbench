import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'tsx',
    contents: `
import './src/workbench-entry.tsx';
window.publishIdentity=(snapshot)=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window.parent,data:{type:'gea:identity-snapshot',snapshot}}));

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
async function open(
  t,
  authenticated,
  { pollStatus = 'authenticated', clock = false, dark = false, passwordFailure, holdPassword } = {},
) {
  const assets = new Map(bundle.outputFiles.map((x) => [x.path.split('/').at(-1), x.text]));
  assets.set('theme.css', await readFile('theme/tokens.css', 'utf8'));
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
        '<meta charset="utf-8"><link rel="stylesheet" href="/app.css"><link rel="stylesheet" href="/theme.css"><div id="gea-workbench"></div><script type="module" src="/app.js"></script>',
    );
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((r) => server.close(r));
  });
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.DSH_TEST_BROWSER_CHANNEL,
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  if (clock) await page.clock.install();
  const captchaImage = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 40;
    const context = canvas.getContext('2d');
    context.fillStyle = '#edf0f5';
    context.fillRect(0, 0, 120, 40);
    context.font = 'bold 26px sans-serif';
    context.fillStyle = '#303b55';
    context.fillText('a1B2', 20, 29);
    return canvas.toDataURL('image/jpeg');
  });
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
    if (url.pathname.endsWith('login/password/prepare'))
      value = { challengeId: 'captcha-' + calls.length, image: captchaImage, expiresIn: 60 };
    if (url.pathname.endsWith('login/password')) {
      if (holdPassword) await holdPassword;
      if (passwordFailure)
        return route.fulfill({ json: { ok: false, error: { code: passwordFailure } } });
      value = { authenticated: true };
    }
    if (url.pathname.endsWith('login/poll')) value = { ...status, status: pollStatus };
    if (url.pathname.endsWith('workflow/config')) value = [];
    if (url.pathname.endsWith('workbench/query'))
      value = { records: [], total: 0, size: 100, current: 1, pages: 0 };
    await route.fulfill({ json: { ok: true, value } });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/?locale=zh`);
  await page.waitForFunction(() => window.publishIdentity);
  await expect(page.locator('.gea-workbench-boot')).toBeVisible();
  if (dark) {
    await page.evaluate(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: location.origin,
          source: window.parent,
          data: { protocol: 'agent-workbench-theme', dark: true },
        }),
      ),
    );
    await expect(page.locator('.gea-workbench-boot')).toHaveCSS(
      'background-color',
      'rgb(27, 29, 33)',
    );
  }
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

test(
  'Native respects early Host challenge expiration, stops polling and permits refresh',
  { timeout: 30000 },
  async (t) => {
    const f = await open(t, false, { pollStatus: 'expired', clock: true });
    await expect(f.page.getByRole('alert')).toHaveText('二维码已过期，请重新登录。');
    const pollCount = () => f.calls.filter((c) => c.path.endsWith('login/poll')).length;
    assert.equal(pollCount(), 1);
    await f.page.clock.fastForward(5000);
    assert.equal(pollCount(), 1, 'a Host-expired challenge must not be polled again');
    await expect(f.page.locator('.gea-original-workbench')).toHaveCount(0);
    await expect(f.page.getByRole('button', { name: '刷新二维码', exact: true })).toBeEnabled();
    await f.page.getByRole('button', { name: '刷新二维码', exact: true }).click();
    await expect.poll(() => f.calls.filter((c) => c.path.endsWith('login/start')).length).toBe(2);
    assert.equal(
      f.calls.filter((c) => c.path.endsWith('login/start')).at(-1).payload.environment,
      'test',
    );
    assert.equal(
      f.calls.filter((c) => /action|submit|model\/advice|model\/discover/.test(c.path)).length,
      0,
    );
    assert.deepEqual(f.errors, []);
    assert.equal(f.external(), 0);
  },
);

test('Native approval follows parent theme for business surfaces and Arco controls', async (t) => {
  const { page } = await open(t, true, { dark: true });
  await expect(page.locator('.gea-original-workbench')).toBeVisible();
  for (const dark of [true, false, true]) {
    await page.evaluate(
      (dark) =>
        window.dispatchEvent(
          new MessageEvent('message', {
            origin: location.origin,
            source: window.parent,
            data: { protocol: 'agent-workbench-theme', dark, fontSize: 16 },
          }),
        ),
      dark,
    );
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      dark ? 'rgb(27, 29, 33)' : 'rgb(249, 250, 251)',
    );
    await expect(page.locator('body')).toHaveAttribute('arco-theme', dark ? 'dark' : 'light');
    await expect(page.locator('[aria-label="需求预测区域经理审批工作台"]')).toHaveCSS(
      'background-color',
      dark ? 'rgb(36, 38, 43)' : 'rgb(255, 255, 255)',
    );
    await expect(page.locator('.arco-table-th').first()).toHaveCSS(
      'background-color',
      dark ? 'rgb(48, 52, 59)' : 'rgb(245, 246, 248)',
    );
    const colors = await page
      .locator('.arco-table')
      .first()
      .evaluate((node) => ({
        background: getComputedStyle(node).getPropertyValue('--color-bg-2').trim(),
        text: getComputedStyle(node).getPropertyValue('--text-primary').trim(),
      }));
    assert.equal(colors.background, dark ? '#232324' : '#fff');
    assert.equal(colors.text, dark ? '#edf0f5' : '#000000');
    if (process.env.NATIVE_THEME_EVIDENCE)
      await page.screenshot({
        path: `${process.env.NATIVE_THEME_EVIDENCE}/native-${dark ? 'dark' : 'light'}.png`,
      });
  }
});

async function passwordForm(f) {
  await f.page.getByRole('button', { name: '账号密码', exact: true }).click();
  await expect(f.page.locator('.gea-captcha-image')).toBeVisible();
  await f.page.locator('input[name="username"]').fill('employee');
  await f.page.locator('input[name="password"]').fill('  synthetic-password  ');
  await f.page.locator('input[name="captcha"]').fill('a1B2');
}

test(
  'Native password login renders, refreshes, preserves exact password and waits for Host identity',
  { timeout: 30000 },
  async (t) => {
    const f = await open(t, false, { clock: true });
    await passwordForm(f);
    const count = () => f.calls.filter((c) => c.path.endsWith('login/password/prepare')).length;
    assert.equal(count(), 1);
    await f.page.getByRole('button', { name: '刷新验证码', exact: true }).last().click();
    await expect.poll(count).toBe(2);
    await expect(f.page.locator('.gea-captcha-image img')).toBeVisible();
    await f.page.locator('input[name="captcha"]').fill('a1B2');
    await f.page.getByRole('button', { name: '显示密码', exact: true }).click();
    await expect(f.page.locator('input[name="password"]')).toHaveAttribute('type', 'text');
    await f.page.getByRole('button', { name: '隐藏密码', exact: true }).click();
    if (process.env.DSH_LOGIN_EVIDENCE_DIR) {
      await mkdir(process.env.DSH_LOGIN_EVIDENCE_DIR, { recursive: true });
      await f.page.screenshot({
        path: join(process.env.DSH_LOGIN_EVIDENCE_DIR, 'password-desktop.png'),
        fullPage: true,
      });
      await f.page.setViewportSize({ width: 375, height: 812 });
      await f.page.screenshot({
        path: join(process.env.DSH_LOGIN_EVIDENCE_DIR, 'password-narrow.png'),
        fullPage: true,
      });
      assert.equal(
        await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
    }
    await f.page.locator('input[name="captcha"]').fill('a1B2');
    await expect(f.page.getByRole('button', { name: '登录 GEA', exact: true })).toBeEnabled();
    await f.page.locator('input[name="captcha"]').press('Enter');
    await expect
      .poll(() => f.calls.filter((c) => c.path.endsWith('login/password')).length)
      .toBe(1);
    const sent = f.calls.find((c) => c.path.endsWith('login/password')).payload;
    assert.equal(sent.password, '  synthetic-password  ');
    assert.match(sent.challengeId, /^captcha-/);
    await expect(f.page.locator('.gea-original-workbench')).toHaveCount(0);
    f.status.authenticated = true;
    f.status.user = { id: 'host-user', username: 'Host' };
    f.status.pageScope = 'host-password';
    await f.publish({ state: 'confirmed', scope: 'host-password', status: f.status });
    await expect(f.page.locator('.gea-original-workbench')).toBeVisible();
    assert.deepEqual(f.errors, []);
    assert.equal(f.external(), 0);
  },
);

test(
  'Native password captcha expires without sending credentials and environment/method changes cancel pending login',
  { timeout: 30000 },
  async (t) => {
    const held = Promise.withResolvers();
    t.after(() => held.resolve());
    const f = await open(t, false, { clock: true, holdPassword: held.promise });
    await passwordForm(f);
    await f.page.clock.fastForward(61000);
    await expect(f.page.getByRole('button', { name: '登录 GEA', exact: true })).toBeDisabled();
    assert.equal(f.calls.filter((c) => c.path.endsWith('login/password')).length, 0);
    await f.page.getByRole('button', { name: '刷新验证码', exact: true }).click();
    await expect(f.page.locator('.gea-captcha-image')).toBeVisible();
    await f.page.locator('input[type="radio"][value="production"]').check();
    await expect
      .poll(
        () =>
          f.calls.filter((c) => c.path.endsWith('login/password/prepare')).at(-1)?.payload
            .environment,
      )
      .toBe('production');
    await expect(f.page.locator('.gea-captcha-image')).toBeVisible();
    await expect(f.page.locator('input[name="password"]')).toHaveValue('');
    await f.page.locator('input[name="username"]').fill('employee');
    await f.page.locator('input[name="password"]').fill('synthetic-password');
    await f.page.locator('input[name="captcha"]').fill('a1B2');
    await f.page.getByRole('button', { name: '登录 GEA', exact: true }).click();
    await expect
      .poll(() => f.calls.filter((c) => c.path.endsWith('login/password')).length)
      .toBe(1);
    await f.page.getByRole('button', { name: '飞书扫码', exact: true }).click();
    await expect(f.page.locator('.gea-login-qr img')).toBeVisible();
    held.resolve();
    await expect(f.page.locator('.gea-original-workbench')).toHaveCount(0);
    assert.deepEqual(f.errors, []);
  },
);

for (const [code, message] of [
  ['GEA_LOGIN_CAPTCHA_INVALID', '验证码错误或失效'],
  ['GEA_LOGIN_RATE_LIMITED', '认证尝试过多'],
]) {
  test(
    'Native password failure ' + code + ' gives recovery without automatic login retries',
    { timeout: 30000 },
    async (t) => {
      const f = await open(t, false, { passwordFailure: code });
      await passwordForm(f);
      await f.page.getByRole('button', { name: '登录 GEA', exact: true }).click();
      await expect(f.page.getByRole('alert')).toContainText(message);
      assert.equal(f.calls.filter((c) => c.path.endsWith('login/password')).length, 1);
      await expect(f.page.locator('input[name="password"]')).toHaveValue('');
      assert.deepEqual(f.errors, []);
    },
  );
}
