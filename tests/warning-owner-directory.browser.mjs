import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
const bundle = await build({
  stdin: {
    contents:
      "import {openAlertManagement} from './business/inventory-apsplan/source/app/monitor-management.js';import './business/inventory-apsplan/source/app/monitor-management.css';window.openManagement=()=>openAlertManagement([],()=>{},false);",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  outfile: 'page.js',
  plugins: [
    {
      name: 'isolated-owner-api',
      setup(api) {
        api.onResolve({ filter: /\/shared\/channel\.js$/ }, () => ({
          path: 'channel',
          namespace: 'fixture',
        }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents:
            'export const call=(method,input)=>window.detection(input);export const ask=async()=>{};',
        }));
      },
    },
  ],
});
async function setup(t, width = 1280, { sandboxed = false } = {}) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  let page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.route('http://owner.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="zh-CN"><div id="root"></div></html>',
    }),
  );
  await page.goto('http://owner.test/');
  if (sandboxed) {
    const attached = page.waitForEvent('framenavigated', (frame) => !!frame.parentFrame());
    await page.setContent(
      '<iframe title="负责人" sandbox="allow-scripts allow-downloads" src="http://owner.test/frame" style="width:100%;height:850px"></iframe>',
    );
    page = await attached;
  }
  await page.evaluate(() => {
    window.calls = [];
    window.owners = [];
    window.revision = 0;
    window.allowWrite = true;
    window.detection = async (input) => {
      window.calls.push(input);
      if (input.op === 'list')
        return {
          tasks: [],
          runs: [],
          events: [],
          capabilities: { write: window.allowWrite, reason: window.allowWrite ? '' : '仅可读取' },
        };
      if (input.op === 'owner-directory')
        return { owners: window.owners, revision: window.revision };
      if (input.op === 'owner-directory-save') {
        if (window.saveError) throw Error(window.saveError);
        if (input.revision !== window.revision) throw Error('已被其他窗口修改');
        window.owners = input.owners;
        window.revision++;
        return { owners: window.owners, revision: window.revision };
      }
      if (input.op === 'agents')
        return [{ id: 'gea-html-inventory-apsplan', name: '产销协同Agent' }];
      if (input.op === 'feishu-status') return { enabled: true };
      if (input.op === 'save') return input.task;
      throw Error('unhandled ' + input.op);
    };
  });
  if (bundle.outputFiles.find((file) => file.path.endsWith('.css')))
    await page.addStyleTag({
      content: bundle.outputFiles.find((file) => file.path.endsWith('.css')).text,
    });
  await page.addScriptTag({
    content: bundle.outputFiles.find((file) => file.path.endsWith('.js')).text,
  });
  await page.evaluate(() => window.openManagement());
  return page;
}
test('owner directory CRUD retains form on server error, validates fields and reloads persisted cross scope', async (t) => {
  const page = await setup(t);
  await page.getByRole('tab', { name: '通知负责人' }).click();
  await page.getByRole('button', { name: '新增责任人' }).click();
  await expect(page.getByRole('heading', { name: '新增责任关系' })).toBeFocused();
  await page.getByRole('button', { name: '保存责任关系' }).click();
  assert.equal(
    (await page.evaluate(() => window.calls.filter((call) => call.op === 'owner-directory-save')))
      .length,
    0,
  );
  await page.getByLabel('责任类型', { exact: true }).selectOption('基地×品类');
  await page.getByLabel('基地', { exact: true }).selectOption('遂平');
  await page.getByLabel('品类', { exact: true }).selectOption('饺子');
  await page.getByLabel('责任人姓名').fill('测试负责人');
  await page.getByLabel('工号').fill('10000001');
  await page.evaluate(() => (window.saveError = '工号与飞书姓名不匹配'));
  await page.getByRole('button', { name: '保存责任关系' }).click();
  await expect(page.getByRole('status')).toContainText('工号与飞书姓名不匹配');
  await expect(page.getByLabel('工号')).toHaveValue('10000001');
  await page.evaluate(() => (window.saveError = ''));
  await page.getByRole('button', { name: '保存责任关系' }).click();
  await expect(page.locator('tbody')).toContainText('遂平 × 饺子');
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('测试负责人');
  await page.getByRole('button', { name: '修改', exact: true }).click();
  await page.getByLabel('责任类型', { exact: true }).selectOption('品类');
  await expect(page.getByLabel('基地', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: '保存责任关系' }).click();
  assert.equal((await page.evaluate(() => window.owners))[0].type, '品类');
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.locator('[data-count]')).toContainText('共 0 条');
});
test('read only directory cannot mutate and narrow layout remains within the panel', async (t) => {
  const page = await setup(t, 600);
  await page.locator('[data-close]').click();
  await page.evaluate(() => {
    window.allowWrite = false;
    return window.openManagement();
  });
  await page.getByRole('tab', { name: '通知负责人' }).click();
  await expect(page.getByRole('button', { name: '新增责任人' })).toBeDisabled();
  const fits = await page
    .locator('.am-owner-view')
    .evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  assert.equal(fits, true);
});
test('automatic notification strategy hides manual picker and round trips through task save', async (t) => {
  const page = await setup(t);
  await page.getByRole('button', { name: '新增检测' }).click();
  const strategy = page.locator('select[name=notifyStrategy]');
  await strategy.selectOption('automatic', { force: true });
  await expect(page.locator('[data-recipient-picker]')).toBeHidden();
  await expect(page.locator('[data-routing-help]')).toBeVisible();
  await strategy.selectOption('off', { force: true });
  await expect(page.locator('[data-routing-help]')).toBeHidden();
  await strategy.selectOption('specified', { force: true });
  await expect(page.locator('[data-recipient-picker]')).toBeVisible();
  await strategy.selectOption('automatic', { force: true });
  await page.locator('select[name=metric]').selectOption({ index: 1 }, { force: true });
  await page.locator('select[name=scope]').selectOption('品类', { force: true });
  await page.locator('textarea[name=description]').fill('低于95时预警');
  await page.getByRole('button', { name: '保存检测任务', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.calls.filter((call) => call.op === 'save').length))
    .toBe(1);
  const saved = await page.evaluate(() => window.calls.find((call) => call.op === 'save').task);
  assert.equal(saved.notifyStrategy, 'automatic');
  assert.deepEqual(saved.notifyRecipients, []);
});

test('owner form validates and saves by click and Enter inside the production opaque sandbox', async (t) => {
  const page = await setup(t, 1280, { sandboxed: true });
  assert.equal(await page.evaluate(() => self.origin), 'null');
  await page.getByRole('tab', { name: '通知负责人' }).click();
  await page.getByRole('button', { name: '新增责任人' }).click();
  await page.getByLabel('责任人姓名').fill('测试负责人');
  await page.getByLabel('工号').fill('10000001');
  await page.getByRole('button', { name: '保存责任关系' }).click();
  await expect(page.locator('[data-count]')).toContainText('共 1 条');
  await page.getByRole('button', { name: '修改', exact: true }).click();
  await page.getByLabel('工号').fill('invalid');
  await page.getByRole('button', { name: '保存责任关系' }).click();
  assert.equal(await page.evaluate(() => window.revision), 1);
  await expect(page.getByLabel('工号')).toBeFocused();
  await page.getByLabel('工号').fill('10000002');
  await page.getByLabel('工号').press('Enter');
  await expect(page.locator('tbody')).toContainText('10000002');
  assert.equal(await page.evaluate(() => window.revision), 2);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('10000002');
  assert.equal(await page.evaluate(() => self.origin), 'null');
});
