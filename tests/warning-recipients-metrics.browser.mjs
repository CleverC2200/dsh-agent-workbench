import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const output = await build({
  stdin: {
    contents:
      "import {openAlertManagement} from './business/inventory-apsplan/source/app/monitor-management.js';window.openWarning=()=>openAlertManagement([],()=>{},true);",
    resolveDir: process.cwd(),
    loader: 'js',
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  plugins: [
    {
      name: 'owned-warning-fixture',
      setup(api) {
        api.onResolve({ filter: /shared\/channel\.js$/ }, () => ({
          path: 'channel',
          namespace: 'fixture',
        }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          resolveDir: process.cwd(),
          contents: `
      import {warningMetricInfo} from '${new URL('../business/shared/warning-metrics.mjs', import.meta.url).pathname}';
      export const ask=async()=>{};
      export async function call(method,input){
        window.calls.push({method,input});
        if(input.op==='list')return{tasks:[],runs:[],events:[]};
        if(input.op==='agents')return[{id:'gea-html-inventory-apsplan',name:'产销协同Agent'}];
        if(input.op==='metric')return warningMetricInfo(input.metric);
        if(input.op==='people')return{people:[{username:'10008447',realname:'刘壮壮',orgCodeTxt:'产品生成数智化组'}],hasMore:false};
        if(input.op==='recipient-check')return{mapped:true};
        throw Error('Unexpected fixture operation '+input.op);
      }`,
        }));
      },
    },
  ],
});
test('the warning dialog shows the registered gap definition and selects the verified named recipient', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.route('http://warning-fixture.test/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><div id="root"></div>',
    }),
  );
  await page.goto('http://warning-fixture.test/');
  await page.evaluate(() => {
    window.calls = [];
  });
  await page.addScriptTag({ content: output.outputFiles[0].text });
  await page.evaluate(() => window.openWarning());
  await page.getByRole('button', { name: '选择指标', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索指标' }).fill('分仓库存差额');
  await page.getByRole('option', { name: '分仓库存差额', exact: true }).click();
  const info = page.locator('[data-metric-info]');
  await expect(info).toContainText('指标库口径');
  await expect(info).toContainText('A540');
  await expect(info).toContainText('任务说明中明确判断规则');
  await expect(info).not.toContainText('未匹配到同名指标');
  await info.locator('summary').click();
  await expect(info).toContainText('保留正负');
  const input = page.getByPlaceholder(/姓名|工号|账号/);
  await input.fill('刘壮壮');
  await page.getByRole('button', { name: '刘壮壮 · 10008447 · 产品生成数智化组' }).click();
  await expect(page.getByRole('button', { name: '移除接收人 刘壮壮' })).toBeVisible();
  const chosen = await page
    .locator('[data-recipient-picker] input[type=hidden]')
    .evaluateAll((xs) => xs.map((x) => x.value));
  assert.ok(chosen.includes('gea:10008447'));
  assert.equal(
    (await page.evaluate(() => window.calls)).filter((x) => x.input.op === 'recipient-check')
      .length,
    1,
  );
});
