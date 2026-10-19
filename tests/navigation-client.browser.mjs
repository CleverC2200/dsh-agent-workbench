import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { chromium, expect } from '@playwright/test';

test('只读门禁拒绝轮询时暂不可用，其他错误和回执拒绝仍提示', { timeout: 60000 }, async (t) => {
  const output = await build({
    stdin: {
      contents: `import React from 'react';import{createRoot}from'react-dom/client';import{DesktopNavigation}from'./src/client/desktop-navigation.tsx';import{zh}from'./src/client/locales.ts';
    const open=async()=>{window.opens=(window.opens||0)+1};
    createRoot(document.getElementById('root')).render(<DesktopNavigation identity={{getSnapshot:()=>window.identitySnapshot||(window.identitySnapshot={state:"confirmed",scope:"A",status:{authenticated:true}}),subscribe:()=>()=>{}}} t={key=>zh[key]} open={open} login={()=>{window.loginClicked=true}}/>);`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'browser',
  });
  let mode = 'readonly',
    polls = 0,
    finished = 0,
    retried = 0,
    releaseFinish;
  const denied = {
    ok: false,
    error: { code: 'GEA_SALES_READONLY_OPERATION' },
  };
  const server = createServer((req, res) => {
    if (req.url === '/app.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(output.outputFiles[0].text);
      return;
    }
    if (req.url?.includes('/navigation/')) {
      res.setHeader('Content-Type', 'application/json');
      if (req.url.endsWith('/poll')) {
        polls++;
        if (mode === 'http') {
          res.statusCode = 500;
          res.end(JSON.stringify(denied));
          return;
        }
        res.end(
          JSON.stringify(
            mode === 'readonly'
              ? denied
              : mode === 'other'
                ? { ok: false, error: { code: 'OTHER_ERROR' } }
                : {
                    ok: true,
                    value: {
                      state: 'ready',
                      receipt: 'receipt-readonly',
                      panel: 'gea-inbox',
                    },
                  },
          ),
        );
        return;
      }
      if (req.url.endsWith('/finish')) {
        finished++;
        if (finished === 2) {
          releaseFinish = () => res.end(JSON.stringify(denied));
          return;
        }
      }
      if (req.url.endsWith('/retry')) {
        retried++;
        res.end(JSON.stringify(denied));
        return;
      }
      res.end(JSON.stringify(denied));
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end('<div id="root"></div><script src="/app.js"></script>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.DSH_TEST_BROWSER_CHANNEL,
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:' + server.address().port);
  await expect.poll(() => polls).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.opens || 0), 0);
  assert.equal(finished, 0);
  assert.equal(retried, 0);
  mode = 'other';
  await expect(page.getByRole('alert')).toBeVisible();
  mode = 'readonly';
  await expect(page.getByRole('alert')).toHaveCount(0);
  mode = 'http';
  await expect(page.getByRole('alert')).toBeVisible();
  mode = 'readonly';
  await expect(page.getByRole('alert')).toHaveCount(0);
  mode = 'ready';
  await expect.poll(() => finished).toBe(1);
  await expect(page.getByRole('alert')).toBeVisible();
  assert.equal(await page.evaluate(() => window.opens), 1);
  assert.equal(retried, 0);
  await page.getByRole('alert').getByRole('button').first().click();
  await expect.poll(() => finished).toBe(2);
  assert.equal(retried, 0);
  mode = 'readonly';
  await expect(page.getByRole('alert')).toHaveCount(0);
  releaseFinish();
  await page.waitForTimeout(100);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test(
  '页面登录后续跳，详情真正可见才发送 ACK，重复轮询不重新打开',
  { timeout: 30000 },
  async (t) => {
    assert.ok(
      existsSync(new URL('../src/client/desktop-navigation.tsx', import.meta.url)),
      '缺少导航页面消费组件',
    );
    const output = await build({
      stdin: {
        contents: `import React from 'react';import{createRoot}from'react-dom/client';import{DesktopNavigation}from'./src/client/desktop-navigation.tsx';import{Inbox}from'./src/client/inbox.tsx';import{zh}from'./src/client/locales.ts';
    const listeners=new Set();let target=null;
    function App(){const [view,setView]=React.useState({pageNo:1,readState:''});const [item,setItem]=React.useState(null);React.useEffect(()=>{listeners.add(setItem);return()=>listeners.delete(setItem)},[]);
      const open=React.useCallback((value,signal)=>new Promise((resolve,reject)=>{window.opens=(window.opens||0)+1;target={...value,visible:resolve,failed:reject};listeners.forEach(fn=>fn(target));signal.addEventListener('abort',()=>{target=null;listeners.forEach(fn=>fn(null));reject(Error('cancelled'))},{once:true})}),[]);
      return <><DesktopNavigation identity={{getSnapshot:()=>window.identitySnapshot||(window.identitySnapshot={state:"confirmed",scope:"A",status:{authenticated:true}}),subscribe:()=>()=>{}}} t={key=>zh[key]} open={open} login={()=>{window.loginClicked=true}}/><Inbox t={key=>zh[key]} navigation={item} view={view} onViewChange={setView}/></>}
    createRoot(document.getElementById('root')).render(<App/>);`,
        resolveDir: process.cwd(),
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      platform: 'browser',
    });
    let logged = false,
      finished = 0,
      release,
      identityRevision = 0,
      detailRequests = 0;
    const ready = {
      state: 'ready',
      receipt: 'receipt-1',
      panel: 'gea-inbox',
      notificationId: 'notice-1',
      interactionRequestId: 'ir-1',
    };
    const detail = {
      id: 'notice-1',
      interaction_request_id: 'ir-1',
      title: '测试待办',
      state: 'unread',
    };
    const server = createServer(async (req, res) => {
      const reply = (value) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, value }));
      };
      if (req.url === '/app.js') {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(output.outputFiles[0].text);
        return;
      }
      if (req.url?.endsWith('/navigation/poll'))
        return reply({
          ...(!logged ? { state: 'login' } : finished ? { state: 'idle' } : ready),
          identityRevision,
        });
      if (req.url?.endsWith('/navigation/finish')) {
        finished++;
        return reply({ state: 'idle' });
      }
      if (req.url?.endsWith('/notifications')) {
        let body = '';
        for await (const c of req) body += c;
        const value = JSON.parse(body);
        if (value.id) {
          detailRequests++;
          if (value.id === 'notice-2')
            return reply({
              detail: {
                ...detail,
                id: 'notice-2',
                title: '另一条通知',
                interactionRequestId: 'ir-2',
              },
            });
          release = () => reply({ detail: { ...detail, interactionRequestId: 'ir-1' } });
          return;
        }
        return reply({
          items: [{ ...detail, id: 'notice-2', title: '另一条通知' }],
          total: 1,
          unreadCount: 1,
          pageSize: 20,
        });
      }
      res.setHeader('Content-Type', 'text/html');
      res.end('<div id="root"></div><script src="/app.js"></script>');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    const browser = await chromium.launch({
      headless: true,
      channel: process.env.DSH_TEST_BROWSER_CHANNEL,
    });
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port);
    await expect(page.getByRole('button', { name: '登录并继续' })).toBeVisible();
    assert.equal(finished, 0);
    logged = true;
    await expect.poll(() => Boolean(release)).toBe(true);
    assert.equal(finished, 0);
    assert.equal(await page.evaluate(() => window.opens), 1);
    release();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect.poll(() => finished).toBe(1);
    assert.equal(await page.evaluate(() => window.opens), 1);
    // 已完成唤醒不能锁死消息列表，用户仍可手动阅读另一条详情。
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '另一条通知', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('另一条通知');
    await expect.poll(() => detailRequests).toBe(2);
    // 同目标的新 receipt 必须等待本次详情，不能复用旧详情提前确认。
    ready.receipt = 'receipt-2';
    finished = 0;
    release = undefined;
    await expect.poll(() => detailRequests).toBe(3);
    assert.equal(finished, 0);
    // 退出登录撤销旧页面，即使上一导航曾经完成或本次详情尚未返回。
    logged = false;
    identityRevision++;
    await expect(page.getByRole('button', { name: '登录并继续' })).toBeVisible();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    release();
    assert.equal(finished, 0);
  },
);

test(
  'startup service recovery never reports an unclaimed message as an open or receipt failure',
  { timeout: 30000 },
  async (t) => {
    const output = await build({
      stdin: {
        contents: `import React from 'react';import{createRoot}from'react-dom/client';import{DesktopNavigation}from'./src/client/desktop-navigation.tsx';import{zh}from'./src/client/locales.ts';const open=async()=>{window.opens=(window.opens||0)+1};createRoot(document.getElementById('root')).render(<DesktopNavigation identity={{getSnapshot:()=>window.identitySnapshot||(window.identitySnapshot={state:"confirmed",scope:"A",status:{authenticated:true}}),subscribe:()=>()=>{}}} t={key=>zh[key]} open={open} login={()=>{}}/>);`,
        resolveDir: process.cwd(),
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      platform: 'browser',
    });
    let polls = 0;
    const server = createServer((req, res) => {
      if (req.url === '/app.js') {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(output.outputFiles[0].text);
        return;
      }
      if (req.url?.endsWith('/poll')) {
        polls++;
        res.setHeader('Content-Type', 'application/json');
        if (polls === 1) {
          res.statusCode = 503;
          res.end('{}');
        } else res.end(JSON.stringify({ ok: true, value: { state: 'idle' } }));
        return;
      }
      res.setHeader('Content-Type', 'text/html');
      res.end('<div id="root"></div><script src="/app.js"></script>');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    const browser = await chromium.launch({
      headless: true,
      channel: process.env.DSH_TEST_BROWSER_CHANNEL,
    });
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.alerts = [];
      new MutationObserver(() => {
        for (const alert of document.querySelectorAll('[role="alert"]'))
          window.alerts.push(alert.textContent);
      }).observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await expect.poll(() => polls).toBe(1);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect.poll(() => polls).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole('alert')).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.opens || 0), 0);
    assert.deepEqual(await page.evaluate(() => window.alerts), []);
  },
);

test(
  'identity recovery after the startup deadline never flashes an independent navigation error',
  { timeout: 30000 },
  async (t) => {
    const output = await build({
      stdin: {
        contents: `import React from 'react';import{createRoot}from'react-dom/client';import{DesktopNavigation}from'./src/client/desktop-navigation.tsx';import{createBusinessIdentityReader}from'../dsh-gea-plugin/src/business-identity-client.ts';import{zh}from'./src/client/locales.ts';
      const identity=createBusinessIdentityReader();window.identity=identity;window.recover=()=>identity.refresh();void identity.refresh().catch(()=>{});
      const open=async()=>{window.opens=(window.opens||0)+1};
      function IdentityMarker(){const value=React.useSyncExternalStore(identity.subscribe,identity.getSnapshot);return value.error?<p data-identity-error="">identity service unavailable</p>:null;}
      createRoot(document.getElementById('root')).render(<><IdentityMarker/><DesktopNavigation identity={identity} t={key=>zh[key]} open={open} login={()=>{}}/></>);`,
        resolveDir: process.cwd(),
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      platform: 'browser',
    });
    let identityAvailable = false,
      polls = 0,
      finished = 0,
      releasePoll;
    const server = createServer((req, res) => {
      if (req.url === '/app.js') {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(output.outputFiles[0].text);
        return;
      }
      if (req.url === '/api/gea-html/identity') {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = identityAvailable ? 200 : 503;
        res.end(
          JSON.stringify(
            identityAvailable
              ? {
                  scope: 'A',
                  subject: 'user-A',
                  status: {
                    environment: 'test',
                    environments: ['test'],
                    authenticated: true,
                    loginState: 'authenticated',
                    user: null,
                  },
                }
              : {},
          ),
        );
        return;
      }
      if (req.url?.endsWith('/navigation/poll')) {
        polls++;
        releasePoll = () => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, value: { state: 'unavailable' } }));
        };
        return;
      }
      if (req.url?.endsWith('/navigation/finish')) finished++;
      res.setHeader('Content-Type', 'text/html');
      res.end('<div id="root"></div><script src="/app.js"></script>');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    const browser = await chromium.launch({
      headless: true,
      channel: process.env.DSH_TEST_BROWSER_CHANNEL,
    });
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.clock.install();
    await page.addInitScript(() => {
      window.timeline = [];
      new MutationObserver(() =>
        window.timeline.push({
          at: Date.now(),
          identityError: Boolean(document.querySelector('[data-identity-error]')),
          navigationError: Boolean(document.querySelector('[data-navigation-code]')),
        }),
      ).observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await expect
      .poll(() => page.evaluate(() => window.identity?.getSnapshot().state))
      .toBe('unknown');
    await page.clock.runFor(5500);
    await expect(page.locator('[data-identity-error]')).toHaveCount(1);
    assert.equal(polls, 0);
    identityAvailable = true;
    await page.evaluate(() => window.recover());
    await expect.poll(() => polls).toBe(1);
    await page.clock.runFor(1);
    await expect(page.locator('[data-identity-error]')).toHaveCount(0);
    releasePoll();
    await expect(page.locator('[data-navigation-code]')).toHaveCount(0);
    const timeline = await page.evaluate(() => window.timeline);
    t.diagnostic(JSON.stringify({ scenario: 'identity-deadline-recovery', timeline }));
    assert.ok(timeline.some((value) => value.identityError));
    assert.deepEqual(
      timeline.filter((value) => value.navigationError),
      [],
      JSON.stringify(timeline),
    );
    assert.equal(finished, 0);
    assert.equal(await page.evaluate(() => window.opens || 0), 0);
  },
);

for (const lostAt of [
  'before-host',
  'after-ack',
  'business-finish-http-poll',
  'business-finish-host-poll',
]) {
  test(
    `finish ${lostAt} 失败后保留原 receipt 并重试，不重新打开`,
    { timeout: 30000 },
    async (t) => {
      const { createDesktopNavigation } =
        await import('../../dsh-gea-plugin/src/host/desktop-navigation.ts');
      const output = await build({
        stdin: {
          contents: `import React from 'react';import{createRoot}from'react-dom/client';import{DesktopNavigation}from'./src/client/desktop-navigation.tsx';import{zh}from'./src/client/locales.ts';
      const identity={getSnapshot:()=>window.identitySnapshot||(window.identitySnapshot={state:'confirmed',scope:'A',status:{authenticated:true}}),subscribe:()=>()=>{}};
      const open=async()=>{window.opens=(window.opens||0)+1};createRoot(document.getElementById('root')).render(<DesktopNavigation identity={identity} t={key=>zh[key]} open={open} login={()=>{}}/>);`,
          resolveDir: process.cwd(),
          loader: 'tsx',
        },
        bundle: true,
        write: false,
        platform: 'browser',
      });
      let pending = {
        id: 'delivery-fixture',
        navigationReference: 'private-reference',
        schemaVersion: 1,
      };
      let acknowledgements = 0,
        resolutions = 0,
        retries = 0,
        ackAttempts = 0,
        hostPollFailures = 0;
      const finishes = [];
      const epoch = new AbortController();
      const nav = createDesktopNavigation(
        {
          status: () => ({ authenticated: true }),
          identitySignal: () => epoch.signal,
          watchIdentity: () => () => {},
          resolveClientNavigation: async () => {
            resolutions++;
            return {
              intentId: 'intent-fixture',
              panel: 'gea-inbox',
              expiresAt: Date.now() + 60000,
            };
          },
          acknowledgeClientNavigation: async () => {
            if (lostAt.startsWith('business-finish') && ackAttempts++ === 0)
              throw Error('NAVIGATION_ACK_FAILED');
            acknowledgements++;
          },
        },
        async (path) => {
          if (path === '/navigation/pending') {
            if (lostAt === 'business-finish-host-poll' && finishes.length === 1) {
              hostPollFailures++;
              throw Error('NAVIGATION_CONTROL_UNAVAILABLE');
            }
            return pending;
          }
          pending = null;
        },
      );
      t.after(() => nav.dispose());
      const server = createServer(async (req, res) => {
        if (req.url === '/app.js') {
          res.setHeader('Content-Type', 'text/javascript');
          res.end(output.outputFiles[0].text);
          return;
        }
        if (!req.url?.includes('/navigation/')) {
          res.setHeader('Content-Type', 'text/html');
          res.end('<div id="root"></div><script src="/app.js"></script>');
          return;
        }
        let body = '';
        for await (const chunk of req) body += chunk;
        try {
          let value;
          if (req.url.endsWith('/poll')) {
            if (
              (lostAt === 'before-host' || lostAt === 'business-finish-http-poll') &&
              finishes.length === 1
            ) {
              res.statusCode = 503;
              res.end();
              return;
            }
            value = await nav.poll();
          }
          if (req.url.endsWith('/retry')) {
            retries++;
            value = await nav.retry();
          }
          if (req.url.endsWith('/finish')) {
            const input = JSON.parse(body);
            finishes.push(input);
            if (finishes.length === 1 && lostAt === 'before-host') {
              res.statusCode = 503;
              res.end();
              return;
            }
            value = await nav.finish(input);
            if (finishes.length === 1 && lostAt === 'after-ack') {
              res.statusCode = 503;
              res.end();
              return;
            }
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, value }));
        } catch (error) {
          res.end(JSON.stringify({ ok: false, error: { code: error.message } }));
        }
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      t.after(() => {
        server.closeAllConnections();
        server.close();
      });
      const browser = await chromium.launch({
        headless: true,
        channel: process.env.DSH_TEST_BROWSER_CHANNEL,
      });
      t.after(() => browser.close());
      const page = await browser.newPage();
      await page.goto('http://127.0.0.1:' + server.address().port);
      await expect(page.getByRole('alert')).toHaveAttribute('data-navigation-stage', 'finish');
      await page.waitForTimeout(1800);
      if (lostAt === 'business-finish-host-poll') assert.ok(hostPollFailures > 0);
      await expect(page.getByRole('alert')).toHaveAttribute('data-navigation-stage', 'finish');
      await page.getByRole('alert').getByRole('button').first().click();
      await expect.poll(() => finishes.length).toBe(2);
      await expect(page.getByRole('alert')).toHaveCount(0);
      assert.deepEqual(finishes[1], finishes[0]);
      assert.equal(finishes[0].outcome, 'visible');
      assert.equal(retries, 0);
      assert.equal(resolutions, 1);
      assert.equal(acknowledgements, 1);
      assert.equal(await page.evaluate(() => window.opens), 1);
    },
  );
}
