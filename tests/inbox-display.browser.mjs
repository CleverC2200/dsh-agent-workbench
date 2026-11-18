import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from './helpers/prepared-assets.mjs';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const { outputFiles } = await build({
  stdin: {
    contents: `import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { MessageCenter } from './src/client/message-center.tsx';
      import { zh } from './src/client/locales.ts';
      function App(){const [view,setView]=React.useState({pageNo:1,readState:''});return <MessageCenter t={key=>zh[key]} view={view} onViewChange={setView}/>;}
      createRoot(document.getElementById('root')).render(<App/>);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
});
const css = await readFile(new URL('../src/client/native-pages.css', import.meta.url), 'utf8');
const item = {
  id: 'notice-1',
  title: '消息一',
  body: '详情正文',
  state: 'unread',
  kind: 'approval',
};

test('opening and closing inbox details preserves the list without a blank reload', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  let listReads = 0;
  let releaseList;
  let releaseDetail;
  await page.route('http://inbox.test/**', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
      return;
    }
    const query = route.request().postDataJSON();
    if (query.id) {
      await new Promise((resolve) => {
        releaseDetail = resolve;
      });
      await route.fulfill({
        json: { ok: true, value: { detail: { ...item, body: '服务端最新正文' } } },
      });
    } else {
      listReads++;
      await new Promise((resolve) => {
        releaseList = resolve;
      });
      await route.fulfill({
        json: {
          ok: true,
          value: {
            items: [item],
            total: 1,
            unreadCount: 1,
            pageSize: 10,
            environment: 'test',
            coverage: 'complete',
            fetchedAt: '2026-09-15T00:00:00Z',
          },
        },
      });
    }
  });
  await page.goto('http://inbox.test/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: outputFiles[0].text });
  await expect.poll(() => Boolean(releaseList)).toBe(true);
  await expect(page.locator('.gea-inbox table')).toBeVisible();
  const headerBefore = await page.locator('.gea-inbox thead').boundingBox();
  releaseList();
  await expect(page.getByRole('button', { name: '消息一', exact: true })).toBeVisible();
  assert.deepEqual(
    await page.locator('.gea-inbox thead').boundingBox(),
    headerBefore,
    'list headers must not jump when data arrives',
  );
  await page.evaluate(() => {
    window.inboxTable = document.querySelector('.gea-inbox table');
    window.tableRemoved = false;
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.removedNodes) {
          if (node === window.inboxTable || node.contains?.(window.inboxTable))
            window.tableRemoved = true;
        }
    }).observe(document.querySelector('.gea-inbox'), { childList: true, subtree: true });
  });
  await page.getByRole('button', { name: '消息一', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('status')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: '消息一', exact: true }),
  ).toBeVisible();
  await mkdir('.runtime/web-evidence', { recursive: true });
  await page.screenshot({ path: '.runtime/web-evidence/inbox-detail-loading.png' });
  const headingBefore = await page
    .getByRole('dialog')
    .getByRole('heading', { name: '消息一', exact: true })
    .boundingBox();
  await expect.poll(() => Boolean(releaseDetail)).toBe(true);
  releaseDetail();
  await expect(page.getByRole('dialog').getByText('服务端最新正文', { exact: true })).toBeVisible();
  await expect(page.locator('article')).toHaveAttribute('aria-busy', 'false');
  await page.screenshot({ path: '.runtime/web-evidence/inbox-detail-loaded.png' });
  assert.deepEqual(
    await page
      .getByRole('dialog')
      .getByRole('heading', { name: '消息一', exact: true })
      .boundingBox(),
    headingBefore,
    'detail heading must not jump when response arrives',
  );
  await page.getByRole('button', { name: '返回消息列表', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  assert.equal(
    await page.evaluate(() => window.tableRemoved),
    false,
    'detail navigation must not remove the background list',
  );
  assert.equal(listReads, 1, 'closing read-only details must not reload the list');

  releaseDetail = undefined;
  await page.getByRole('button', { name: '消息一', exact: true }).click();
  await expect.poll(() => Boolean(releaseDetail)).toBe(true);
  await page.getByRole('button', { name: '返回消息列表', exact: true }).click();
  releaseDetail();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: '消息一', exact: true })).toBeVisible();
  assert.equal(listReads, 1);
  assert.equal(await page.evaluate(() => window.tableRemoved), false);
});

test('the message center loads announcements on demand and refreshes a withdrawn item', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 560, height: 640 } });
  const requests = [];
  let withdrawn = false;
  let unavailable = true;
  const announcement = {
    id: '9223372036854775807',
    title: '生产会议安排',
    summary: '各部门参加',
    publishTime: '2026-11-18T08:00:00+08:00',
    top: true,
  };
  await page.route('http://inbox.test/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/') {
      await route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
      return;
    }
    const query = route.request().postDataJSON();
    requests.push({ pathname, query });
    if (pathname.endsWith('/notifications')) {
      await route.fulfill({ json: { ok: true, value: { items: [item], total: 1, pageSize: 20 } } });
      return;
    }
    assert.equal(pathname, '/api/gea-proof/announcements');
    if (unavailable) {
      await route.fulfill({ json: { ok: false, error: { code: 'GEA_REQUEST_REJECTED' } } });
      return;
    }
    if (query.id) {
      assert.equal(query.id, announcement.id);
      await route.fulfill({
        json: withdrawn
          ? { ok: false, error: { code: 'ANNOUNCEMENT_NOT_FOUND' } }
          : {
              ok: true,
              value: {
                detail: {
                  ...announcement,
                  content:
                    '<p><strong>请准时参会</strong><a href="/legacy">安排</a></p><script type="application/json">internal</script>',
                },
              },
            },
      });
      return;
    }
    const items = withdrawn ? [] : [announcement];
    await route.fulfill({
      json: {
        ok: true,
        value: { items, total: withdrawn ? 0 : 21, pageNo: query.pageNo, pageSize: 20 },
      },
    });
  });
  await page.goto('http://inbox.test/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: outputFiles[0].text });
  const business = page.getByRole('tab', { name: '业务提醒' });
  const announcements = page.getByRole('tab', { name: '通知公告' });
  await expect(business).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: '消息一', exact: true })).toBeVisible();
  assert.equal(requests.filter(({ pathname }) => pathname.endsWith('/announcements')).length, 0);
  await business.focus();
  await business.press('ArrowRight');
  await expect(announcements).toBeFocused();
  await expect(business).toHaveAttribute('aria-selected', 'true');
  await announcements.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('暂时无法获取公告，请重试。');
  unavailable = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByText('置顶', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: '公告标题' }).fill('会议');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.query).toEqual({ pageNo: 1, title: '会议' });
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.query).toEqual({ pageNo: 2, title: '会议' });
  await page.getByRole('button', { name: announcement.title, exact: true }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.locator('strong')).toHaveText('请准时参会');
  await expect(drawer.locator('.gea-announcement-body')).toHaveText('请准时参会安排');
  await expect(drawer.locator('a, script')).toHaveCount(0);
  await drawer.getByRole('button', { name: '关闭' }).click();
  await expect(drawer).not.toBeVisible();
  withdrawn = true;
  await page.getByRole('button', { name: announcement.title, exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByText('该公告已不可查看，列表已重新加载。')).toBeVisible();
  await expect(page.getByText('没有找到公告')).toBeVisible();
  await business.click();
  await expect(page.getByRole('button', { name: '消息一', exact: true })).toBeVisible();
  assert.equal(requests.filter(({ pathname }) => pathname.endsWith('/notifications')).length, 1);
});
