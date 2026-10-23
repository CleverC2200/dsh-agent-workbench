import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const bundle = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { SessionSearchDialog } from './src/company/session-search-dialog.tsx';
      const sessions = [
        { id: 'one', displayTitle: '销售计划沟通', updatedAt: 3 },
        { id: 'two', displayTitle: '库存复盘', updatedAt: 2 },
        { id: 'three', displayTitle: '订单满足率分析', updatedAt: 1 },
      ];
      function App() {
        const [open, setOpen] = React.useState(false);
        return <><nav><button onClick={() => setOpen(true)} aria-label="搜索会话">搜索</button><span>AI工作台</span></nav>
          {open && <SessionSearchDialog
            sessions={sessions}
            searchMessages={async (query, signal) => {
              window.searchCalls.push(query);
              await new Promise(resolve => setTimeout(resolve, 40));
              if (signal.aborted) throw Error('aborted');
              return { items: query.includes('订单') ? [{ sessionId: 'two', snippet: '上次讨论过订单缺口' }] : [], hasMore: false };
            }}
            openSession={id => { window.openedSession = id; }}
            onClose={() => setOpen(false)}
            copy={{ title: '搜索会话', placeholder: '搜索会话名称或内容', recent: '最近', results: '搜索结果', empty: '没有找到会话', loading: '正在加载…', failed: '搜索暂时不可用，请重试', more: '结果较多', close: '关闭', clear: '清除搜索' }}
          />}
        </>;
      }
      window.searchCalls = [];
      createRoot(document.getElementById('root')).render(<App />);
    `,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"test"' },
});

test('search button opens a centered dialog, searches titles and content, and opens a session', async (t) => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.GEA_TEST_CHROMIUM,
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ content: await readFile(resolve('src/company/shell.css'), 'utf8') });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const trigger = page.getByRole('button', { name: '搜索会话' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '搜索会话' });
  await expect(dialog).toBeVisible();
  if (process.env.SESSION_SEARCH_VISUAL_DIR)
    await page.screenshot({
      path: resolve(process.env.SESSION_SEARCH_VISUAL_DIR, 'session-search-dialog.png'),
    });
  const bounds = await dialog.boundingBox();
  assert.ok(bounds.x > 250 && bounds.x < 400, 'dialog is centered in the window');
  const input = dialog.getByRole('searchbox', { name: '搜索会话' });
  await expect(input).toBeFocused();
  await trigger.focus();
  await expect(input).toBeFocused();
  await expect(dialog.getByRole('button', { name: '销售计划沟通' })).toBeVisible();
  await input.fill('订单');
  await expect(dialog.getByRole('button', { name: /订单满足率分析/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /库存复盘.*上次讨论过订单缺口/ })).toBeVisible();
  assert.deepEqual(await page.evaluate(() => window.searchCalls), ['订单']);
  await input.press('ArrowDown');
  await expect(dialog.getByRole('button', { name: /订单满足率分析/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.openedSession), 'three');
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
