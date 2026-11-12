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
const dmsRejection='DMS回写失败: SKU 10003581 确认数量必须为整数，且数量及合计不能超出Integer范围。请核对 payload.confirmQty、当前销售计划的各 SKU 确认数量，以及汇总数量后重新提交。';
const items=['approve','dms','unknown'].includes(scenario)?[item('1','approve'),item('3','approve')]:['resubmit','channel','signed-out-source'].includes(scenario)?[item('2','resubmit')]:[item('1','approve'),item('2','resubmit')];
if(scenario==='readback')items.splice(0,items.length,item('1','approve'));
if(['confirmation','stored','correction'].includes(scenario)) { const v=versions[planId('2')]; if(scenario==='correction') v.orderType='Z'; const current=item('2','resubmit'); if(scenario!=='stored') current.pendingValues={'789':scenario==='correction'?'5.000':'3.000'}; items.splice(0,items.length,current); }
window.actions=[];window.submissions=[];window.outcomes=[];window.refreshes=[];if(scenario==='stale-draft')items[0].pendingValues={'789':'9.000'};
const skusFor=v=>[sku(v),{...sku(v),id:'unchanged',skuCode:'790'}];
let detailReads=0;
const client={
 currentUser:{invoke:async()=>{if(scenario==='signed-out-source')throw new BackendHttpError({method:'GET',path:'/user',status:401,body:{}});return {id:'user',username:'user',roles:[{code:'sales_plan_region_approver'}]}}},
 detail:{invoke:async({planId})=>{detailReads++;if(scenario==='readback'&&window.actions.length&&!window.readbackReady)throw new TypeError('readback offline');const v={...versions[planId]};if(scenario==='readback'&&window.actions.length)v.status=2;if(scenario==='old-version'||(scenario==='late-version'&&detailReads>items.length))v.id+='-new';if(scenario==='status-changed')v.status=2;if(scenario==='inactive-version')v.effective=false;if(scenario==='period-changed')v.periodId='20261101';return {currentVersion:v,skus:skusFor(v),versions:[],logs:[],actionContext:scenario==='access-changed'?{...access(v),policy:undefined,nodeOrder:1,allowedActions:[]}:access(v)}}},
 versionSkus:{invoke:async({versionId})=>{const v=Object.values(versions).find(v=>v.id===versionId);return scenario==='sku-format'?skusFor(v).map(s=>({...s,price:'12.34',qty:'2.0',amt:'24.680',adjAddQty:'0.000'})):scenario==='sku-version'?skusFor(v).map(s=>({...s,versionId:'other-version'})):scenario==='sku-price'?skusFor(v).map(s=>({...s,price:'13.00'})):skusFor(v)}},
 draft:{invoke:async({planId})=>{const v=versions[planId];return {stale:scenario==='stale-draft',draft:scenario==='stored'?{planId,versionId:v.id,status:v.status,role:'region',sourceSnapshot:salesPlanDraftSnapshot({...v,versionId:v.id},{currentVersion:v,skus:skusFor(v)}),adjustments:[{skuCode:'789',adjustQty:'1.750'}],remark:''}:null}}},
 action:{invoke:async(request)=>{window.actions.push(request);if(scenario==='readback')return {planId:request.planId,versionId:request.versionId,fromStatus:1,toStatus:2,approvalRole:'region',requestId:request.requestId,traceId:'fixture',replayed:false};if(['dms','unknown'].includes(scenario))throw new BackendHttpError({method:'POST',path:'/actions',status:502,body:scenario==='dms'?{error:'GEA_HTTP_502：'+dmsRejection,details:{upstreamCode:'SALES_PLAN_DMS_WRITEBACK_FAILED',retryable:false,requestId:'dms-rejected'}}:{error:'GEA_HTTP_502',details:{}}});if(scenario==='permission')throw new BackendHttpError({method:'POST',path:'/actions',status:403,body:{error:'denied'}});throw Error('fixture-refusal');}},
 submit:{invoke:async(request)=>{window.submissions.push(request);throw Error('fixture-refusal');}},
};
createRoot(document.getElementById('root')).render(<RegionalApprovalResubmitDialog items={items} client={client} connected={!['channel','signed-out-source'].includes(scenario)} unavailableReason={query.get('reason')??undefined} t={i18n.t.bind(i18n)} onRefresh={(ids)=>window.refreshes.push(ids)} onClose={(pending)=>window.closedPending=pending} onPendingChange={(pending)=>{window.pending=pending}} onSucceeded={()=>{}} onCompleted={(outcomes)=>window.outcomes.push(outcomes)} />);
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
  page.on('pageerror', (error) => t.diagnostic(error.stack));
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
    await expect(dialog.locator('strong').filter({ hasText: /¥37\.02/ })).toHaveText(
      /^\s*3\s*¥37\.02\s*$/,
    );
    await expect(dialog).not.toContainText('3.000');
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

for (const scenario of ['dms', 'unknown'])
  test('batch ' + scenario + ' preserves explicit failure versus uncertain outcome', async (t) => {
    const { page, dialog } = await openConfirmation(t, scenario);
    await dialog.getByRole('button', { name: '确认提交', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.outcomes.length)).toBe(1);
    if (scenario === 'dms') {
      await expect(dialog.getByText(/DMS回写失败.*10003581.*整数/)).toHaveCount(2);
      await expect(dialog.getByText(/payload\.confirmQty.*各 SKU 确认数量/)).toHaveCount(2);
      await expect(dialog.getByText(/错误编号|dms-rejected/)).toHaveCount(0);
      await expect(dialog.locator('textarea,input,[role=combobox]')).toHaveCount(0);
      await expect(dialog.getByText('操作请求失败且未更新本地状态', { exact: false })).toHaveCount(
        0,
      );
      await expect(dialog.getByText(/结果暂时未知/)).toHaveCount(0);
      assert.equal(await page.evaluate(() => window.pending), false);
      if (process.env.GEA_SUBMISSION_EVIDENCE) {
        await page.screenshot({
          path: process.env.GEA_SUBMISSION_EVIDENCE + '/dms-error-wide.png',
        });
        await page.setViewportSize({ width: 390, height: 844 });
        const bounds = await dialog.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
        await page.screenshot({
          path: process.env.GEA_SUBMISSION_EVIDENCE + '/dms-error-narrow.png',
        });
      }
      assert.ok(
        (await page.evaluate(() => window.outcomes[0])).every((o) => o.status === 'failed'),
      );
    } else {
      await expect(dialog.getByText(/结果暂时未知/)).toHaveCount(2);
      assert.equal(await page.evaluate(() => window.pending), true);
      assert.ok(
        (await page.evaluate(() => window.outcomes[0])).every((o) => o.status === 'pending'),
      );
    }
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal(await page.evaluate(() => window.closedPending), scenario === 'unknown');
  });

for (const [scenario, message] of [
  ['old-version', '计划版本已变化：选中版本 v1，当前版本 v1-new'],
  ['status-changed', '审批状态已变化：选中状态 1，当前状态 2'],
  ['inactive-version', '选中的计划版本已失效'],
  ['period-changed', '计划周期不一致：所选周期 20261001，当前周期 20261101'],
  ['sku-version', 'SKU 789 的所属版本不一致：应为 v1，实际为 other-version'],
  ['sku-price', 'SKU 789 的单价已变化：原值 12.3400，当前值 13.00'],
  ['access-changed', '当前审批节点已不能通过这笔计划'],
  ['stale-draft', '本地草稿已过期，与当前计划明细不一致'],
])
  test('submission preflight identifies ' + scenario, async (t) => {
    const { page, dialog } = await openConfirmation(t, scenario, { blocked: true });
    await expect(dialog.getByText(message, { exact: false }).first()).toBeVisible();
    await expect(dialog.getByText(/样例数据/)).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: '确认提交', exact: true })).toBeDisabled();
    assert.equal(await page.evaluate(() => window.actions.length + window.submissions.length), 0);
  });

test('old selection recovery requests a queue refresh without submitting', async (t) => {
  const { page, dialog } = await openConfirmation(t, 'old-version', { blocked: true });
  await dialog.getByRole('button', { name: '刷新列表并重新选择', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.refreshes), [
    ['p-jxs-2026-10-00001', 'p-jxs-2026-10-00002'],
  ]);
  assert.equal(await page.evaluate(() => window.actions.length + window.submissions.length), 0);
});

test('expired draft recovery keeps storage and drops stale local adjustments before review', async (t) => {
  const { page, dialog } = await openConfirmation(t, 'stale-draft', { blocked: true });
  const first = dialog.locator('section').first();
  await first.getByRole('button', { name: '不使用过期草稿，重新核对', exact: true }).click();
  await dialog
    .locator('section')
    .nth(1)
    .getByRole('button', { name: '不使用过期草稿，重新核对', exact: true })
    .click();
  await expect(dialog.getByRole('button', { name: '确认提交', exact: true })).toBeEnabled();
  await expect(
    first.getByText('过期草稿已保留，本次按当前计划数据重新核对。', { exact: true }),
  ).toBeVisible();
  assert.equal(await page.evaluate(() => window.actions.length + window.submissions.length), 0);
  await dialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.actions.length)).toBe(1);
  assert.equal(await page.evaluate(() => window.actions[0].adjustments), undefined);
});

test('version change after preview names the conflict and does not send an action', async (t) => {
  const { page, dialog } = await openConfirmation(t, 'late-version');
  await dialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await expect(
    dialog.getByText('计划版本已变化：选中版本 v1，当前版本 v1-new', { exact: false }),
  ).toBeVisible();
  assert.equal(await page.evaluate(() => window.actions.length + window.submissions.length), 0);
});

test('explicit batch rejection can be submitted again with fresh commands after preflight', async (t) => {
  const { page, dialog } = await openConfirmation(t, 'dms');
  await dialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.actions.length)).toBe(2);
  const again = dialog.getByRole('button', { name: '重新提交', exact: true });
  await again.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => page.evaluate(() => window.actions.length)).toBe(4);
  const calls = await page.evaluate(() => window.actions);
  assert.notEqual(calls[2].requestId, calls[0].requestId);
  assert.notEqual(calls[2].idempotencyKey, calls[0].idempotencyKey);
});

test('equal decimal formats pass preflight and still submit exact quantities', async (t) => {
  const { page, dialog } = await openConfirmation(t, 'sku-format');
  await dialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.actions.length)).toBe(1);
});

test('a retained successful receipt retries only readback without another action', async (t) => {
  const { page, dialog } = await openConfirmation(t, 'readback');
  await dialog.getByRole('button', { name: '确认提交', exact: true }).click();
  await expect(dialog.getByText(/仅重试回读/)).toBeVisible();
  assert.equal(await page.evaluate(() => window.actions.length), 1);
  await dialog.getByRole('button', { name: '刷新权威状态', exact: true }).click();
  await expect(dialog.getByText(/仅重试回读/)).toBeVisible();
  assert.equal(await page.evaluate(() => window.actions.length), 1);
  await page.evaluate(() => {
    window.readbackReady = true;
  });
  await dialog.getByRole('button', { name: '刷新权威状态', exact: true }).click();
  await expect(dialog).toContainText('提交成功');
  assert.equal(await page.evaluate(() => window.actions.length), 1);
});
