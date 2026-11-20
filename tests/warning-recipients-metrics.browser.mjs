import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const output = await build({
  stdin: {
    contents:
      "import {openAlertManagement} from './business/inventory-apsplan/source/app/monitor-management.js';import './business/inventory-apsplan/source/app/monitor-management.css';window.openWarning=(startNew=true)=>openAlertManagement([],()=>{},startNew);",
    resolveDir: process.cwd(),
    loader: 'js',
  },
  bundle: true,
  write: false,
  outfile: 'page.js',
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
      export const ask=async()=>{};
      export async function call(method,input){
        window.calls.push({method,input});
        if(input.op==='list'){
          if(window.failRefresh)throw Error('暂时无法刷新列表');
          return{tasks:window.warningTasks,runs:window.warningRuns,events:[]};
        }
        if(input.op==='save'){
          await new Promise(resolve=>window.finishSave=resolve);
          if(window.saveError)throw Error(window.saveError);
          const existing=window.warningTasks.find(task=>task.id===input.task.id);
          const saved={...existing,...input.task};
          window.warningTasks=[saved];
          return saved;
        }
        if(input.op==='delete'){
          await new Promise(resolve=>window.finishDelete=resolve);
          if(window.deleteError)throw Error(window.deleteError);
          const deleted=window.warningTasks.find(task=>task.id===input.id);
          window.warningTasks=window.warningTasks.filter(task=>task.id!==input.id);
          return deleted;
        }
        if(input.op==='run'){
          const task=window.warningTasks.find(task=>task.id===input.id);
          const run={id:'run-manual',taskId:task.id,name:task.metric+'检测',at:new Date().toISOString(),status:'执行中'};
          window.warningRuns.unshift(run);
          return{accepted:true,run};
        }
        if(input.op==='agents')return[{id:'gea-html-inventory-apsplan',name:'产销协同Agent'}];
        if(input.op==='metric')throw Error('Fixed metric definitions must not require a backend request');
        if(input.op==='people')return{people:[{username:'10008447',realname:'刘壮壮',orgCodeTxt:'产品生成数智化组'}],hasMore:false};
        if(input.op==='recipient-check')return{mapped:true};
        throw Error('Unexpected fixture operation '+input.op);
      }`,
        }));
      },
    },
  ],
});
async function warningPage(t, tasks = [], { sandboxed = false } = {}) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  let page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.route('http://warning-fixture.test/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><div id="root"></div>',
    }),
  );
  await page.goto('http://warning-fixture.test/');
  if (sandboxed) {
    const attached = page.waitForEvent('framenavigated', (frame) => !!frame.parentFrame());
    await page.setContent(
      '<iframe title="预警" sandbox="allow-scripts allow-downloads" src="http://warning-fixture.test/frame" style="width:100%;height:950px"></iframe>',
    );
    page = await attached;
  }
  await page.evaluate((tasks) => {
    window.calls = [];
    window.warningTasks = tasks;
    window.warningRuns = [];
  }, tasks);
  await page.addStyleTag({
    content: output.outputFiles.find((file) => file.path.endsWith('.css')).text,
  });
  await page.addScriptTag({
    content: output.outputFiles.find((file) => file.path.endsWith('.js')).text,
  });
  return page;
}

test('sandboxed task deletion confirms safely and reports the backend outcome', async (t) => {
  const frame = await warningPage(
    t,
    [
      {
        id: 'scheduled-delete',
        metric: '当前库存',
        scope: '品类',
        description: '检查库存',
        enabled: true,
        frequency: '每天 09:00',
      },
    ],
    { sandboxed: true },
  );
  await frame.page().setViewportSize({ width: 540, height: 900 });
  await frame.evaluate(() => {
    window.warningRuns = [
      {
        id: 'previous-run',
        taskId: 'scheduled-delete',
        name: '历史库存检测',
        at: '2026-11-20T01:00:00Z',
        status: '成功',
      },
    ];
    return window.openWarning(false);
  });
  const deletes = () =>
    frame.evaluate(() =>
      window.calls.filter(({ input }) => input.op === 'delete').map(({ input }) => input.id),
    );
  const button = frame.getByRole('button', { name: '删除', exact: true });
  const dialog = frame.getByRole('dialog', { name: '删除检测任务' });
  const confirm = dialog.getByRole('button', { name: '确认删除' });
  const cancel = dialog.getByRole('button', { name: '取消' });

  await button.click();
  await expect(dialog).toBeVisible({ timeout: 3000 });
  await expect(dialog).toContainText('当前库存 · 品类');
  await expect(cancel).toBeFocused();
  await frame.page().keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  assert.deepEqual(await deletes(), []);

  await button.click();
  await cancel.click();
  await expect(dialog).toBeHidden();
  assert.deepEqual(await deletes(), []);

  await frame.evaluate(() => {
    window.deleteError = '检测正在执行，请执行结束后再删除';
  });
  await button.click();
  await confirm.click();
  await expect(frame.getByRole('button', { name: '正在删除…', exact: true })).toBeDisabled();
  await frame.evaluate(() => window.finishDelete());
  await expect(frame.getByRole('alert')).toContainText('检测正在执行，请执行结束后再删除');
  await expect(button).toBeEnabled();
  assert.deepEqual(await deletes(), ['scheduled-delete']);

  await frame.evaluate(() => {
    window.deleteError = '';
    window.failRefresh = true;
  });
  await button.click();
  await confirm.click();
  await expect(frame.getByRole('button', { name: '正在删除…', exact: true })).toBeDisabled();
  await frame.evaluate(() => window.finishDelete());
  await expect(frame.getByRole('status')).toContainText('检测任务已删除');
  await expect(button).toHaveCount(0);
  assert.deepEqual(await deletes(), ['scheduled-delete', 'scheduled-delete']);
  await frame.getByRole('tab', { name: '执行记录' }).click();
  await expect(frame.getByText('历史库存检测', { exact: true })).toBeVisible();
});

test('scheduled task edits report progress, retain inputs on error, and acknowledge a saved change without a list refresh', async (t) => {
  const page = await warningPage(
    t,
    [
      {
        id: 'scheduled',
        metric: '当前库存',
        scope: '品类',
        description: '检查库存',
        enabled: true,
        notifyStrategy: 'off',
        frequency: '每天 09:00',
        schedule: { frequency: 'daily', time: '09:00' },
        agentPreset: 'gea-html-inventory-apsplan',
      },
    ],
    { sandboxed: true },
  );
  await page.evaluate(() => window.openWarning(false));
  await page.getByRole('button', { name: '修改', exact: true }).click();
  await expect(page.getByRole('button', { name: '执行数字人' })).toHaveText('产销协同Agent');
  await page.getByLabel('任务说明').fill('核实库存超标');
  await page.getByRole('button', { name: '执行小时' }).click();
  await page.getByRole('option', { name: '10', exact: true }).press('Enter');
  await page.evaluate(() => (window.saveError = '调度配置暂不可用'));
  await page.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByRole('button', { name: '正在保存…' })).toBeDisabled();
  await page.evaluate(() => window.finishSave());
  await expect(page.getByRole('alert')).toHaveText('调度配置暂不可用');
  await expect(page.getByLabel('任务说明')).toHaveValue('核实库存超标');
  await page.evaluate(() => {
    window.saveError = '';
    window.failRefresh = true;
  });
  await page.getByRole('button', { name: '保存修改' }).press('Enter');
  await expect(page.getByRole('button', { name: '正在保存…' })).toBeDisabled();
  await page.evaluate(() => window.finishSave());
  await expect(page.getByRole('status')).toContainText('检测任务已更新');
  await expect(page.getByText('核实库存超标', { exact: true })).toBeVisible();
  await expect(page.getByText('每天 10:00')).toBeVisible();
  const payloads = await page.evaluate(() =>
    window.calls.filter(({ input }) => input.op === 'save').map(({ input }) => input.task),
  );
  assert.equal(payloads.length, 2);
  assert.deepEqual(
    payloads.map(({ schedule }) => schedule.time),
    ['10:00', '10:00'],
  );
});

test('run now shows a new execution record immediately for an enabled scheduled task', async (t) => {
  const page = await warningPage(
    t,
    [
      {
        id: 'scheduled',
        metric: '当前库存',
        scope: '品类',
        description: '检查库存',
        enabled: true,
        frequency: '每天 09:00',
        schedule: { frequency: 'daily', time: '09:00' },
      },
    ],
    { sandboxed: true },
  );
  await page.evaluate(() => window.openWarning(false));
  await page.getByRole('button', { name: '立即执行' }).click();
  await expect(page.getByRole('tab', { name: '执行记录' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('status')).toContainText('本次检测已启动');
  await expect(page.getByRole('row', { name: /当前库存检测.*执行中/ })).toBeVisible();
  const calls = await page.evaluate(() => window.calls.filter(({ input }) => input.op === 'run'));
  assert.equal(calls.length, 1);
  await page.getByRole('tab', { name: '检测任务' }).click();
  await expect(page.getByText('每天 09:00')).toBeVisible();
});
test('the warning dialog shows the registered gap definition and selects the verified named recipient', async (t) => {
  const page = await warningPage(t);
  await page.evaluate(() => window.openWarning());
  await page.getByRole('button', { name: '选择指标', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索指标' }).fill('分仓库存差额');
  await page.getByRole('option', { name: '分仓库存差额', exact: true }).click();
  const info = page.locator('[data-metric-info]');
  await expect(info).toContainText('指标库口径');
  await expect(info).toContainText('A540');
  await expect(info).toContainText('未提供明确任务规则');
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
  assert.equal(
    (await page.evaluate(() => window.calls)).filter((x) => x.input.op === 'metric').length,
    0,
  );
});

test('the existing current-stock task displays its fixed V0.6 definition while metadata queries are unavailable', async (t) => {
  const page = await warningPage(t, [
    {
      id: 'existing-current-stock',
      metric: '当前库存',
      scope: '品类',
      description: '检查库存',
      enabled: true,
      notifyMode: 'repeat',
      schedule: { frequency: 'daily', time: '09:00' },
      agentPreset: 'gea-html-inventory-apsplan',
    },
  ]);
  await page.evaluate(() => window.openWarning(false));
  await page.getByRole('button', { name: '修改', exact: true }).click();
  const info = page.locator('[data-metric-info]');
  await expect(info).toContainText('V0.6');
  await expect(info).toContainText('不含客户/渠道库存');
  await expect(info).toContainText('全链路库存工作台');
  await expect(info).not.toContainText('待核实');
  await expect(info).not.toContainText('请先明确业务模块');
  assert.equal(await page.locator('select[name=metric]').inputValue(), '当前库存');
  assert.equal(
    (await page.evaluate(() => window.calls)).filter((x) => x.input.op === 'metric').length,
    0,
  );
  await expect(page.locator('.am-editing > .am-mode-note')).toContainText(
    '展示和执行使用同一份配置',
  );
});

test('selecting the base-stock metric immediately shows its workbook exclusions without another choice', async (t) => {
  const page = await warningPage(t);
  await page.evaluate(() => window.openWarning());
  await page.getByRole('button', { name: '选择指标', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索指标' }).fill('当前库存');
  await page.getByRole('option', { name: '当前库存（基地库存）', exact: true }).click();
  const info = page.locator('[data-metric-info]');
  await expect(info).toContainText('基地库存');
  await expect(info).toContainText('OEM成品仓');
  await expect(info).toContainText('19开头');
  await expect(info).not.toContainText('待核实');
  await info.locator('summary').click();
  await expect(info).toContainText('第 157 行');
});

test('two empty browser profiles show all fixed definitions without network or machine configuration', async (t) => {
  const results = [];
  for (let profile = 0; profile < 2; profile++) {
    const page = await warningPage(t);
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    await page.route('**/*', (route) => route.abort());
    await page.evaluate(() => window.openWarning());
    const definitions = await page.evaluate(() => {
      const select = document.querySelector('select[name=metric]');
      return [...select.options]
        .filter((option) => option.value)
        .map((option) => {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return {
            name: option.value,
            text: document.querySelector('[data-metric-info]').textContent,
          };
        });
    });
    assert.equal(definitions.length, 161);
    for (const definition of definitions) {
      assert.match(definition.text, /指标库口径V0\.6/, definition.name);
      assert.doesNotMatch(definition.text, /待核实|请先明确业务模块|未登记此指标/, definition.name);
    }
    assert.equal(
      (await page.evaluate(() => window.calls)).filter((call) => call.input.op === 'metric').length,
      0,
    );
    results.push(definitions);
  }
  assert.deepEqual(results[0], results[1]);
});
