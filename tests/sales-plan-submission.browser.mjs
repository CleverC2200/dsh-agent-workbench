import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const output = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'tsx',
    contents: `
import React from 'react';
import { createRoot } from 'react-dom/client';
import i18next from 'i18next';
import '@arco-design/web-react/dist/css/arco.css';
import zh from './src/workbench/original/zh-CN.json';
import en from './src/workbench/original/en-US.json';
import { RegionalApprovalResubmitDialog } from './src/workbench/original/workbenches/regionalApproval/RegionalApprovalResubmitDialog.tsx';
import { salesPlanDraftSnapshot } from './src/workbench/original/workbenches/regionalApproval/models/salesPlanLocalDraftModel.ts';
import { BackendHttpError } from './src/workbench/original/http-error.ts';
const i18n=i18next.createInstance();
const query=new URL(location.href).searchParams;
await i18n.init({lng:query.get('language')??'zh-CN',resources:{'zh-CN':{translation:{common:zh}},'en-US':{translation:{common:en}}},interpolation:{escapeValue:false}});
const period={periodId:'20261001',periodMonth:'2026-10',planTypeCode:'Y',status:'OPEN'};
const planId=(id)=>'p-jxs-2026-10-0000'+id;
const version=(id,status)=>({id:'v'+id,planId:planId(id),periodId:period.periodId,planTypeCode:'Y',orderType:'M',status,effective:true,seq:1,dealerCode:'456',targetQty:'1.000',targetAmount:'12.34',submitter:'user'});
const versions=Object.fromEntries([['1',1],['2',7],['3',1]].map(([id,status])=>[planId(id),version(id,status)]));
const sku=(v)=>({id:'s'+v.id,versionId:v.id,skuCode:'789',productCategName:'Category',baseQty:'1.000',qty:'2.000',amt:'24.68',adjAddQty:'0',adjCutQty:'0',price:'12.3400',regionConfirmedQty:v.status===7?'1.250':null,regionConfirmedAmount:v.status===7?'15.43':null});
const access=(v)=>({versionId:v.id,status:v.status,policy:'role-visible-v1',allowedActions:['APPROVE','REJECT'],roleActions:[{role:'region',allowedActions:['APPROVE','REJECT']}],snapshotHash:'a'.repeat(64),approvalRole:'region',roleContractSupported:true});
const item=(id,kind)=>({kind,planId:planId(id),versionId:'v'+id,label:'组织'+id,period,row:{...versions[planId(id)],versionId:'v'+id,dealerName:'客户'+id},approvalRole:'region',...(kind==='approve'?{row:{...versions[planId(id)],versionId:'v'+id},access:access(versions[planId(id)])}:{})});
const scenario=new URL(location.href).searchParams.get('scenario');
const items=scenario==='approve'?[item('1','approve'),item('3','approve')]:['resubmit','channel','signed-out-source'].includes(scenario)?[item('2','resubmit')]:[item('1','approve'),item('2','resubmit')];
if(['confirmation','stored','correction'].includes(scenario)) { const v=versions[planId('2')]; if(scenario==='correction') v.orderType='Z'; const current=item('2','resubmit'); if(scenario!=='stored') current.pendingValues={'789':scenario==='correction'?'5.000':'3.000'}; items.splice(0,items.length,current); }
window.actions=[];window.submissions=[];window.outcomes=[];
const skusFor=v=>[sku(v),{...sku(v),id:'unchanged',skuCode:'790'}];
const client={
 currentUser:{invoke:async()=>{if(scenario==='signed-out-source')throw new BackendHttpError({method:'GET',path:'/user',status:401,body:{}});return {id:'user',username:'user',roles:[{code:'sales_plan_region_approver'}]}}},
 detail:{invoke:async({planId})=>({currentVersion:versions[planId],skus:skusFor(versions[planId]),versions:[],logs:[],actionContext:access(versions[planId])})},
 versionSkus:{invoke:async({versionId})=>{const v=Object.values(versions).find(v=>v.id===versionId);return skusFor(v)}},
 draft:{invoke:async({planId})=>{const v=versions[planId];return {draft:scenario==='stored'?{planId,versionId:v.id,status:v.status,role:'region',sourceSnapshot:salesPlanDraftSnapshot({...v,versionId:v.id},{currentVersion:v,skus:skusFor(v)}),adjustments:[{skuCode:'789',adjustQty:'1.750'}],remark:''}:null}}},
 action:{invoke:async(request)=>{window.actions.push(request);if(scenario==='permission')throw new BackendHttpError({method:'POST',path:'/actions',status:403,body:{error:'denied'}});throw Error('fixture-refusal');}},
 submit:{invoke:async(request)=>{window.submissions.push(request);throw Error('fixture-refusal');}},
};
createRoot(document.getElementById('root')).render(<RegionalApprovalResubmitDialog items={items} client={client} connected={!['channel','signed-out-source'].includes(scenario)} unavailableReason={query.get('reason')??undefined} t={i18n.t.bind(i18n)} onClose={()=>{}} onSucceeded={()=>{}} onCompleted={(outcomes)=>window.outcomes.push(outcomes)} />);
`,
  },
  bundle: true,
  write: false,
  outdir: 'fixture',
  platform: 'browser',
  format: 'esm',
});

async function openConfirmation(t, scenario, { language = 'zh-CN', reason, blocked = false } = {}) {
  const server = createServer((request, response) => {
    const file = output.outputFiles.find(
      (file) => request.url?.split('?')[0] === '/' + file.path.split('/').at(-1),
    );
    response.setHeader(
      'Content-Type',
      file?.path.endsWith('.css') ? 'text/css' : file ? 'text/javascript' : 'text/html',
    );
    response.end(
      file?.contents ??
        '<div id="root"></div><link rel="stylesheet" href="/stdin.css"><script type="module" src="/stdin.js"></script>',
    );
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({
    channel: process.env.GEA_TEST_CHROMIUM ? undefined : 'chrome',
    executablePath: process.env.GEA_TEST_CHROMIUM,
    headless: true,
  });
  t.after(async () => {
    await browser.close();
    await new Promise((done) => server.close(done));
  });
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1280, height: 900 } });
  await page.goto(
    'http://127.0.0.1:' +
      server.address().port +
      '/?' +
      new URLSearchParams({ scenario, language, ...(reason ? { reason } : {}) }),
  );
  const dialog = page.getByRole('dialog');
  if (!blocked)
    await expect(
      dialog.getByRole('button', {
        name: ['resubmit', 'confirmation', 'stored', 'correction'].includes(scenario)
          ? '确认重提'
          : '确认提交',
        exact: true,
      }),
    ).toBeEnabled();
  return { page, dialog };
}

for (const scenario of ['approve', 'mixed'])
  test(
    'unified ' +
      scenario +
      ' confirmation sends optional approval remark 456 only to ordinary actions',
    { timeout: 30000 },
    async (t) => {
      const { page, dialog } = await openConfirmation(t, scenario);
      await expect(dialog.getByLabel('批量审批备注')).toBeVisible({ timeout: 1000 });
      await dialog.getByLabel('批量审批备注').fill('456');
      await expect(dialog.locator('label.arco-checkbox')).toHaveCount(0);
      await dialog.getByRole('button', { name: '确认提交', exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => window.actions.length + window.submissions.length))
        .toBe(2);
      const calls = await page.evaluate(() => ({
        actions: window.actions,
        submissions: window.submissions,
      }));
      assert.equal(calls.actions.length, scenario === 'approve' ? 2 : 1);
      assert.ok(calls.actions.every((call) => call.request.remark === '456'));
      assert.equal(calls.submissions.length, scenario === 'approve' ? 0 : 1);
      assert.ok(calls.submissions.every((call) => !('remark' in call.request)));
      const outcomes = await page.evaluate(() => window.outcomes);
      assert.equal(outcomes.length, 1);
      assert.equal(outcomes[0].length, 2);
      assert.ok(
        outcomes[0].every((outcome) => outcome.status === 'failed' && !outcome.permissionDenied),
      );
      assert.deepEqual(
        outcomes[0].map((outcome) => outcome.planId),
        scenario === 'approve'
          ? ['p-jxs-2026-10-00001', 'p-jxs-2026-10-00003']
          : ['p-jxs-2026-10-00001', 'p-jxs-2026-10-00002'],
      );
    },
  );

test(
  'resubmission-only confirmation has no approval remark field',
  { timeout: 30000 },
  async (t) => {
    const { dialog } = await openConfirmation(t, 'resubmit');
    await expect(dialog.getByLabel('批量审批备注')).toHaveCount(0);
  },
);

test(
  'mixed confirmation reports permission denial only for the rejected version',
  { timeout: 30000 },
  async (t) => {
    const { page, dialog } = await openConfirmation(t, 'permission');
    await dialog.getByRole('button', { name: '确认提交', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.outcomes.length)).toBe(1);
    const outcomes = await page.evaluate(() => window.outcomes[0]);
    assert.deepEqual(
      outcomes.map(({ versionId, permissionDenied }) => ({ versionId, permissionDenied })),
      [
        { versionId: 'v1', permissionDenied: true },
        { versionId: 'v2', permissionDenied: false },
      ],
    );
  },
);

test(
  'resubmit confirmation uses list edits, shows only changes with the customer and never asks for quantities again',
  { timeout: 30000 },
  async (t) => {
    const { page, dialog } = await openConfirmation(t, 'confirmation');
    await expect(dialog.locator('input')).toHaveCount(0);
    await expect(dialog).toContainText('客户2');
    await expect(dialog).toContainText('789');
    await expect(dialog).not.toContainText('790');
    await expect(dialog).toContainText('3.000');
    await dialog.getByRole('button', { name: '确认重提', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.submissions.length)).toBe(1);
    const submitted = await page.evaluate(() => window.submissions[0]);
    assert.equal(submitted.request.items.find((row) => row.skuCode === '789').qty, '3.000');
    assert.equal(submitted.request.items.find((row) => row.skuCode === '790').qty, '2.000');
  },
);

for (const scenario of ['stored', 'correction'])
  test(
    'resubmit confirmation preserves ' + scenario + ' quantities',
    { timeout: 30000 },
    async (t) => {
      const { page, dialog } = await openConfirmation(t, scenario);
      await expect(dialog.locator('input')).toHaveCount(0);
      await expect(dialog).not.toContainText('790');
      await dialog.getByRole('button', { name: '确认重提', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.submissions.length)).toBe(1);
      const request = await page.evaluate(() => window.submissions[0].request);
      const changed = request.items.find((row) => row.skuCode === '789');
      if (scenario === 'correction') {
        assert.equal(request.adjustmentMode, 'ABSOLUTE_NET');
        assert.equal(changed.qty, '2.000');
        assert.equal(changed.adjAddQty, '3');
        assert.equal(changed.adjCutQty, '0');
      } else assert.equal(changed.qty, '3.000');
    },
  );

test(
  'missing Host credentials explain the channel block without sending a submission',
  { timeout: 30000 },
  async (t) => {
    const { page, dialog } = await openConfirmation(t, 'channel', {
      reason: 'credential',
      blocked: true,
    });
    await expect(dialog).toContainText('服务提报凭据未配置，请联系管理员完成当前环境的服务接入。');
    await expect(dialog.getByRole('button', { name: '确认重提', exact: true })).toBeDisabled();
    assert.equal(await page.evaluate(() => window.submissions.length), 0);
  },
);

for (const [reason, zhText, enText] of [
  [
    'signed-out',
    '请先登录 GEA，再重新打开重提确认。',
    'Sign in to GEA, then reopen the resubmission confirmation.',
  ],
  [
    'configuration',
    '当前环境尚未配置服务提报通道，请联系管理员完成接入配置。',
    'The service submission channel is not configured for this environment. Contact an administrator.',
  ],
  [
    'tenant',
    '当前租户与服务提报配置不匹配，请切换到正确租户或联系管理员。',
    'The current tenant does not match the service submission configuration. Switch to the correct tenant or contact an administrator.',
  ],
  [
    'credential',
    '服务提报凭据未配置，请联系管理员完成当前环境的服务接入。',
    'Service submission credentials are missing. Ask an administrator to set up this environment.',
  ],
  [
    undefined,
    '服务提报通道暂不可用，请稍后重试或联系管理员。',
    'The service submission channel is unavailable. Try again later or contact an administrator.',
  ],
]) {
  for (const [language, text, confirm] of [
    ['zh-CN', zhText, '确认重提'],
    ['en-US', enText, 'Confirm resubmission'],
  ])
    test(
      'disconnected resubmit channel explains ' + (reason ?? 'older Host') + ' in ' + language,
      { timeout: 30000 },
      async (t) => {
        const { page, dialog } = await openConfirmation(t, 'channel', {
          reason,
          language,
          blocked: true,
        });
        await expect(dialog).toContainText(text);
        await expect(dialog.getByRole('button', { name: confirm, exact: true })).toBeDisabled();
        await expect(dialog).not.toContainText(
          language === 'zh-CN' ? '权限不足' : 'lacks permission',
        );
        assert.equal(await page.evaluate(() => window.submissions.length), 0);
      },
    );
}

test(
  'signed-out reason remains visible after current-user source loading fails',
  { timeout: 30000 },
  async (t) => {
    const { page, dialog } = await openConfirmation(t, 'signed-out-source', {
      reason: 'signed-out',
      blocked: true,
    });
    await expect(dialog).toContainText('来源读取失败，请关闭后重新打开；当前编辑尚未提交。');
    await expect(dialog).toContainText('请先登录 GEA，再重新打开重提确认。');
    await expect(dialog.getByRole('button', { name: '确认重提', exact: true })).toBeDisabled();
    assert.equal(await page.evaluate(() => window.submissions.length), 0);
  },
);
