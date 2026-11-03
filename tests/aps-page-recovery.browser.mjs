import test from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const bundle = await build({
  entryPoints: ['business/inventory-apsplan/source/app/plugin-entry.tsx'],
  bundle: true,
  write: false,
  define: { APS_MOCK: 'false' },
  alias: {
    react: resolve('node_modules/react'),
    'react-dom': resolve('node_modules/react-dom'),
  },
  plugins: [
    {
      name: 'connection-and-render-faults',
      setup(api) {
        api.onResolve(
          {
            filter: /^(\.\/workbench-app|\.\.\/\.\.\/\.\.\/shared\/channel\.js)$/,
          },
          (args) => ({ path: args.path, namespace: 'fault' }),
        );
        api.onLoad({ filter: /.*/, namespace: 'fault' }, (args) => ({
          resolveDir: process.cwd(),
          loader: 'tsx',
          contents: args.path.endsWith('channel.js')
            ? 'export const ready=new Promise(resolve=>window.connect=resolve);'
            : `import React from 'react'; export default function Home(){if(window.failRender)throw Error('fixture render failure');return <h1>产销看板已恢复</h1>}`,
        }));
      },
    },
  ],
});
async function fixture(t) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.clock.install();
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return page;
}
test('APS connection delay stays visible, times out with retry, and accepts a late connection', async (t) => {
  const page = await fixture(t);
  await expect(page.getByRole('status')).toContainText('正在连接');
  await page.clock.fastForward(20001);
  await expect(page.getByRole('alert')).toContainText('连接暂未完成');
  await page.getByRole('button', { name: '重试连接' }).click();
  await page.evaluate(() => window.connect());
  await expect(page.getByRole('heading', { name: '产销看板已恢复' })).toBeVisible();
});
test('APS render failure has a recovery action and identity invalidation removes business content', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => {
    window.failRender = true;
    window.connect();
  });
  await expect(page.getByRole('alert')).toContainText('页面暂不可用');
  await page.evaluate(() => {
    window.failRender = false;
  });
  await page.getByRole('button', { name: '重新打开看板' }).click();
  await expect(page.getByRole('heading', { name: '产销看板已恢复' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('gea-identity-changed')));
  await expect(page.locator('#root')).toHaveText('登录身份已变化，请重新打开产销页面');
  await expect(page.getByRole('heading')).toHaveCount(0);
});
