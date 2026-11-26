import { openMpsProductDetails } from './helpers/mps-page.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { authorPage } from './helpers/author-page.mjs';
const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
async function fixture(t, { failEvents = false, sql } = {}) {
  const page = await authorPage(t, { mpsConfig: config, mpsResource: true });
  page.setDefaultTimeout(5000);
  const calls = [];
  const contexts = [];
  await page.route('**/api/agent-workbench/config', (route) =>
    route.fulfill({ json: { cwd: '/fixture-author-workspace' } }),
  );
  await page.route('**/api/agent-manage/resources?*', (route) =>
    route.fulfill({
      json: [{ id: 'inventory-mps', kind: 'prompt', installed: true, enabled: true }],
    }),
  );
  await page.route('**/api/agent-manage/resources/select', (route) =>
    route.fulfill({ json: { preset: 'inventory-mps' } }),
  );
  await page.route('**/api/agent-workbench/page', async (route) => {
    const input = route.request().postDataJSON();
    calls.push(input);
    if (input.operation === 'context') contexts.push(input.parameters);
    if (input.operation === 'events' && failEvents)
      return route.fulfill({ status: 400, json: { error: 'PAGE_SESSION_EXPIRED' } });
    if (input.operation === 'sql' && sql) {
      const failure = await sql(input.parameters);
      if (failure) return route.fulfill({ status: 400, json: { error: failure } });
    }
    if (input.operation === 'sql')
      return route.fulfill({
        json: {
          rows:
            input.parameters.queryId === 'products.period'
              ? [{ month: null }]
              : input.parameters.queryId.endsWith('.count')
                ? [{ total: 0 }]
                : [],
          returnedColumns: config.queries[input.parameters.queryId].columns,
          configVersion: 'v1',
        },
      });
    await route.fulfill({
      json:
        input.operation === 'open'
          ? { owner: 'fixture-owner', binding: { surface: 'mps', tool: 'mps_page' } }
          : input.operation === 'events' || input.operation === 'catalog'
            ? []
            : {},
    });
  });
  await page.evaluate(() => window.openAuthor('mps', 1200));
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('heading', { name: '需求确认', exact: true })).toBeVisible();
  return {
    page,
    frame,
    calls,
    contexts,
    recover: () => {
      failEvents = false;
    },
  };
}

test('MPS首次自动连接，切换步骤持续发布上下文并保留原草稿', { timeout: 30000 }, async (t) => {
  const { page, frame, calls, contexts } = await fixture(t);
  await expect.poll(() => calls.some((call) => call.operation === 'open')).toBe(true);
  await expect
    .poll(() => contexts.some((context) => context.parts?.navigation?.tab === 'check'))
    .toBe(true);
  await expect(frame.locator('.author-questions')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Core草稿接口fixture' })).toHaveValue(
    '历史草稿，请保留。',
  );
  await frame.locator('.ap-page-tab').filter({ hasText: '本月预估发货' }).click();
  await expect.poll(() => contexts.at(-1)?.parts?.navigation?.tab).toBe('ship');
  assert.equal(await page.evaluate(() => window.corePrompts.length), 0);
});

test('MPS页面能力断开显示中文原因及重连入口', { timeout: 30000 }, async (t) => {
  const { page, calls, contexts, recover } = await fixture(t, { failEvents: true });
  await expect(page.getByRole('alert').filter({ hasText: '页面连接已失效' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'pageReconnect', exact: true })).toBeEnabled();
  recover();
  await page.getByRole('button', { name: 'pageReconnect', exact: true }).click();
  await expect.poll(() => calls.filter((call) => call.operation === 'open').length).toBe(2);
  await expect
    .poll(() => contexts.some((context) => context.parts?.navigation?.tab === 'check'))
    .toBe(true);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Core草稿接口fixture' })).toHaveValue(
    '历史草稿，请保留。',
  );
});

test('MPS查询拒绝后结束加载，重试空集与读取失败分别显示', { timeout: 30000 }, async (t) => {
  const gate = Promise.withResolvers();
  t.after(() => gate.resolve());
  let denied = true;
  const { frame } = await fixture(t, {
    sql: async ({ queryId }) => {
      if (queryId !== 'products.period') return;
      await gate.promise;
      return denied ? 'DATA_PERMISSION_DENIED' : undefined;
    },
  });
  const products = await openMpsProductDetails(frame);
  await expect(products.getByRole('button', { name: '同步中…', exact: true })).toBeDisabled();
  gate.resolve();
  await expect(products.getByRole('alert')).toHaveText('当前账号暂无数据权限');
  await expect(products.getByRole('button', { name: '同步产品', exact: true })).toBeEnabled();
  denied = false;
  await products.getByRole('button', { name: '同步产品', exact: true }).click();
  await expect(products.getByRole('alert')).toHaveCount(0);
  await expect(products.getByRole('button', { name: '同步产品', exact: true })).toBeEnabled();
  await expect(products.getByText('0 个产品', { exact: true })).toBeVisible();
});

test('其他业务页的快捷问题继续转入草稿', { timeout: 30000 }, async (t) => {
  const page = await authorPage(t);
  await page.evaluate(() => window.openAuthor('category', 1200));
  const frame = page.frameLocator('iframe');
  await expect
    .poll(() => frame.locator('body').evaluate(() => window.dshPageInteraction?.available()))
    .toBe(true);
  await frame.locator('.author-questions summary').press('Enter');
  await frame.locator('.author-question-list button').first().press('Enter');
  await expect.poll(() => page.evaluate(() => window.persisted)).toBe(1);
  await expect(frame.locator('.author-quote-status')).toContainText('已转入当前对话草稿');
  assert.match(await page.evaluate(() => window.peerDraft), /^历史草稿，请保留。引用：/);
  assert.equal(await page.evaluate(() => window.corePrompts.length), 0);
});
