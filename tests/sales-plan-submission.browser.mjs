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
import { RegionalApprovalResubmitDialog } from './src/workbench/original/workbenches/regionalApproval/RegionalApprovalResubmitDialog.tsx';
import { BackendHttpError } from './src/workbench/original/http-error.ts';
const i18n=i18next.createInstance();
await i18n.init({lng:'zh-CN',resources:{'zh-CN':{translation:{common:zh}}},interpolation:{escapeValue:false}});
const period={periodId:'20261001',periodMonth:'2026-10',planTypeCode:'Y',status:'OPEN'};
const planId=(id)=>'p-jxs-2026-10-0000'+id;
const version=(id,status)=>({id:'v'+id,planId:planId(id),periodId:period.periodId,planTypeCode:'Y',orderType:'M',status,effective:true,seq:1,dealerCode:'456',targetQty:'1.000',targetAmount:'12.34',submitter:'user'});
const versions=Object.fromEntries([['1',1],['2',7],['3',1]].map(([id,status])=>[planId(id),version(id,status)]));
const sku=(v)=>({id:'s'+v.id,versionId:v.id,skuCode:'789',productCategName:'Category',baseQty:'1.000',qty:'2.000',price:'12.3400',regionConfirmedQty:v.status===7?'1.250':null,regionConfirmedAmount:v.status===7?'15.43':null});
const access=(v)=>({versionId:v.id,status:v.status,policy:'role-visible-v1',allowedActions:['APPROVE','REJECT'],roleActions:[{role:'region',allowedActions:['APPROVE','REJECT']}],snapshotHash:'a'.repeat(64),approvalRole:'region',roleContractSupported:true});
const item=(id,kind)=>({kind,planId:planId(id),versionId:'v'+id,label:'客户'+id,period,...(kind==='approve'?{row:{...versions[planId(id)],versionId:'v'+id},access:access(versions[planId(id)])}:{})});
const scenario=new URL(location.href).searchParams.get('scenario');
const items=scenario==='approve'?[item('1','approve'),item('3','approve')]:scenario==='resubmit'?[item('2','resubmit')]:[item('1','approve'),item('2','resubmit')];
window.actions=[];window.submissions=[];window.outcomes=[];
const client={
 currentUser:{invoke:async()=>({id:'user',username:'user',roles:[{code:'sales_plan_region_approver'}]})},
 detail:{invoke:async({planId})=>({currentVersion:versions[planId],skus:[sku(versions[planId])],versions:[],logs:[],actionContext:access(versions[planId])})},
 versionSkus:{invoke:async({versionId})=>[sku(Object.values(versions).find(v=>v.id===versionId))]},
 draft:{invoke:async()=>({draft:null})},
 action:{invoke:async(request)=>{window.actions.push(request);if(scenario==='permission')throw new BackendHttpError({method:'POST',path:'/actions',status:403,body:{error:'denied'}});throw Error('fixture-refusal');}},
 submit:{invoke:async(request)=>{window.submissions.push(request);throw Error('fixture-refusal');}},
};
createRoot(document.getElementById('root')).render(<RegionalApprovalResubmitDialog items={items} client={client} connected={true} t={i18n.t.bind(i18n)} onClose={()=>{}} onSucceeded={()=>{}} onCompleted={(outcomes)=>window.outcomes.push(outcomes)} />);
`,
  },
  bundle: true,
  write: false,
  outdir: 'fixture',
  platform: 'browser',
  format: 'esm',
});

async function openConfirmation(t, scenario) {
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
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(async () => {
    await browser.close();
    await new Promise((done) => server.close(done));
  });
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1280, height: 900 } });
  await page.goto('http://127.0.0.1:' + server.address().port + '/?scenario=' + scenario);
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('button', {
      name: scenario === 'resubmit' ? '确认重提' : '确认提交',
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
