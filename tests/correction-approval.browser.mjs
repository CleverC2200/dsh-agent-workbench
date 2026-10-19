import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'tsx',
    contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import i18next from 'i18next';
import '@arco-design/web-react/dist/css/arco.css';
import './src/workbench/workbench.css';
import zh from './src/workbench/original/zh-CN.json';
import Workbench from './src/workbench/original/workbenches/regionalApproval/RegionalApprovalWorkbench.tsx';
import {WorkbenchHostProvider} from './src/workbench/original/bridge.ts';
const i18n=i18next.createInstance();
await i18n.init({lng:'zh-CN',resources:{'zh-CN':{translation:{common:zh}}},interpolation:{escapeValue:false}});
const scenario=new URL(location.href).searchParams.get('scenario');
window.actions=[];window.listRequests=[];window.detailRequests=[];
const plan={planId:'p1',versionId:'v1',seq:1,periodId:'20261001',planTypeCode:'Y',dealerCode:'d1',dealerName:'华南经销客户',orgName:'宝阳销售组',provinceName:'华南省区',areaName:'华南大区',status:scenario==='absent'?10:1,orderType:scenario==='absent'?'M':'Z',currentQty:'100',currentAmount:'800',targetQty:'100',targetAmount:scenario==='zero'?'0':'1000',skuCount:1,mPlanAmount:'800',mPlanQty:'100',shipAmount:'600',shipQty:'60',corrPlanAmount:'1000',corrPlanQty:'125',prevAdjAddQty:'25',prevAdjCutQty:'0',amountProgress:scenario==='zero'?undefined:'60.0',correctionProgress:scenario==='zero'?undefined:'100.0',monthlyApproved:scenario!=='not-approved',hasCorrection:scenario!=='absent'};
const mixed=scenario==='mixed'||scenario==='mixed-null';
const noZ={...plan,planId:'m-no-z',versionId:'m-v1',dealerCode:'d3',dealerName:'终审月初客户',orderType:'M',status:10,hasCorrection:false,monthlyApproved:true,mPlanQty:'90',mPlanAmount:'720',corrPlanQty:'90',corrPlanAmount:'720',correctionProgress:null,prevAdjAddQty:null,prevAdjCutQty:null};
const grayM={...noZ,planId:'m-draft',versionId:'m-v0',dealerCode:'d4',dealerName:'月初未终审客户',status:0,monthlyApproved:false,mPlanQty:null,mPlanAmount:null,corrPlanQty:null,corrPlanAmount:null};
const mixedPlans=[plan,{...plan,planId:'z2',versionId:'z-v2',dealerCode:'d2',dealerName:'省区纠偏客户',status:2,corrPlanQty:'100',corrPlanAmount:'800',prevAdjAddQty:'0',prevAdjCutQty:'0'},noZ,...(scenario==='mixed-null'?[grayM]:[])];
const plans=mixed?mixedPlans:scenario==='grouped'?[plan,{...plan,planId:'p2',versionId:'v2',dealerCode:'d2',dealerName:'华南第二客户',targetAmount:'3000',shipAmount:'3000',amountProgress:'100.0'}]:[plan];
const sku={id:'s1',skuCode:'1001',versionId:'v1',productCategName:'水饺',skuName:'猪肉白菜水饺',qty:'100',corrBaseQty:'100',baseQty:'100',amt:'800',amtBase:'800',price:'8',adjAddQty:'2',adjCutQty:'0',editable:scenario!=='readonly'&&scenario!=='absent',nodeAdjAddQty:'2',nodeAdjCutQty:'0'};
if(scenario==='rounding'||scenario==='corrupt')Object.assign(sku,{qty:'0.003',corrBaseQty:'0.003',baseQty:'0.003',amt:'0.01',amtBase:'0.01',price:'2',nodeAdjAddQty:'0',nodeAdjCutQty:'0.001'});
if(scenario==='delivery')Object.assign(sku,{adjAddQty:'25',nodeAdjAddQty:'25'});
if(scenario==='units') { Object.assign(plan,{mPlanAmount:'9999',mPlanQty:'10000',targetAmount:'1189000'});Object.assign(sku,{qty:'18200',corrBaseQty:'18200',amt:'1189000',price:'11.99',nodeAdjAddQty:'0',nodeAdjCutQty:'10000'}); }
const skus=scenario==='zero-matrix'?[
  {...sku,skuCode:'1001',nodeAdjAddQty:'0',nodeAdjCutQty:'0'},
  {...sku,skuCode:'1002',nodeAdjAddQty:'0',nodeAdjCutQty:'100'},
  {...sku,skuCode:'1003',qty:'0',corrBaseQty:'0',amt:'0',nodeAdjAddQty:'0',nodeAdjCutQty:'0'},
  {...sku,skuCode:'1004',qty:'0',corrBaseQty:'0',amt:'0',nodeAdjAddQty:'50',nodeAdjCutQty:'0'},
]:[sku];
let detail={currentVersion:{...plan,id:'v1',effective:true,orderType:scenario==='absent'?'M':'Z'},skus,versions:[],logs:[],correctionContext:{contract:'absolute-net-v1',monthlyApproved:true,hasCorrection:scenario!=='absent',approvalOpen:scenario!=='closed'},actionContext:{versionId:'v1',status:1,nodeOrder:2,allowedActions:scenario==='readonly'||scenario==='absent'?[]:['SAVE','APPROVE','REJECT'],snapshotHash:'a'.repeat(64)}};
const client={
 periods:{invoke:async(q)=>({records:[{periodId:'20261001',periodMonth:scenario==='past'?'2026-09':scenario==='future'?'2026-11':scenario==='leap'?'2024-02':'2026-10',planTypeCode:'Y',planType:q?.planType,status:'OPEN'}],total:1,size:100,current:1,pages:1})},
 list:{invoke:async(q)=>{window.listRequests.push(q);if(mixed&&q?.orderType==='Z'){const records=[...mixedPlans.filter(p=>p.orderType==='Z'&&(q.statuses?.includes(p.status)||q.status===p.status)),...mixedPlans.filter(p=>p.hasCorrection===false)];return {records,total:records.length,size:20,current:1,pages:1,summary:{targetAmount:scenario==='mixed-null'?'4000':'3000',planAmount:scenario==='mixed-null'?null:'2520',planQty:scenario==='mixed-null'?null:'315',diffAmount:scenario==='mixed-null'?null:'-480'}};}return {groupMetrics:q?.summaryOnly&&scenario==='grouped'?[{dimension:'region',key:'宝阳销售组',targetAmount:'4000',planAmount:'1000',diffAmount:'-3000',planQty:'125',shipAmount:'3600',shipQty:'120',amountProgress:'90.0'}]:[],records:q?.status===undefined||q.status===1?plans.map(p=>({...p,orderType:q?.orderType==='Z'&&p.hasCorrection===false?'M':q?.orderType??'M'})):[],total:q?.status===undefined||q.status===1?plans.length:0,size:200,current:1,pages:1,summary:q?.status===undefined||q.status===1?{targetAmount:plan.targetAmount,planAmount:scenario==='monthly-null'?null:'1000',diffAmount:scenario==='monthly-null'?null:scenario==='zero'?'1000':'0',planQty:scenario==='monthly-null'?null:'125'}:{targetAmount:'0',planAmount:'0',diffAmount:'0',planQty:'0'}};}},
 detail:{invoke:async(q)=>{window.detailRequests.push(q);if(mixed&&q.planId==='m-no-z')return {currentVersion:{...noZ,id:'m-v1',effective:true},skus:[{...sku,id:'m-sku',versionId:'m-v1',qty:q.orderType==='Z'?'90':'100',corrBaseQty:q.orderType==='Z'?'90':'100',amt:q.orderType==='Z'?'720':'800',editable:false,nodeAdjAddQty:'0',nodeAdjCutQty:'0'}],versions:[],logs:[],correctionContext:{contract:'absolute-net-v1',monthlyApproved:true,hasCorrection:false,approvalOpen:true},actionContext:{versionId:'m-v1',status:10,allowedActions:[],snapshotHash:'a'.repeat(64)}};return structuredClone(detail);}},versions:{invoke:async()=>[detail.currentVersion]},versionSkus:{invoke:async()=>detail.skus},logs:{invoke:async()=>detail.logs},compare:{invoke:async()=>[]},draft:{invoke:async()=>({draft:null})},
 action:{invoke:async(p)=>{window.actions.push(p);if(scenario!=='rounding'&&scenario!=='corrupt')throw Error('fixture action not configured');detail={...detail,currentVersion:{...detail.currentVersion,status:2},skus:[{...sku,regionAdjAddQty:'0',regionAdjCutQty:'0.001',regionAdjAddAmount:'0.00',regionAdjCutAmount:scenario==='corrupt'?'0.01':'0.00',regionConfirmedQty:'0.002',regionConfirmedAmount:'0.01'}],logs:[{id:'l1',planId:'p1',versionId:'v1',fromStatus:1,toStatus:2,actionCode:p.request.action,operatorCode:'approver',actionAt:'2026-10-19T12:00:00+08:00',requestId:p.requestId}]};return {planId:'p1',versionId:'v1',fromStatus:1,toStatus:2,replayed:false,requestId:p.requestId,traceId:'t1',auditId:'sales-plan-log:l1'}}},
};
window.setDetail=value=>{detail=value};window.getDetail=()=>structuredClone(detail);
createRoot(document.getElementById('root')).render(<WorkbenchHostProvider value={{salesPlan:client}}><div className="gea-original-workbench"><Workbench stateScope="correction-approval" t={i18n.t.bind(i18n)} onContextChange={()=>{}} approvalStages={['region']} liveActionsEnabled/></div></WorkbenchHostProvider>);
`,
  },
  outfile: '/fixture/app.js',
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"test"' },
  loader: { '.svg': 'dataurl', '.png': 'dataurl' },
});

async function openWorkbench(t, scenario = 'default', date = '2026-10-19T04:00:00Z') {
  const assets = new Map(
    bundle.outputFiles.map((asset) => [asset.path.split('/').at(-1), asset.text]),
  );
  const server = createServer((req, res) => {
    const name = req.url.slice(1);
    res.setHeader(
      'content-type',
      assets.has(name)
        ? name.endsWith('.css')
          ? 'text/css'
          : 'text/javascript'
        : 'text/html; charset=utf-8',
    );
    res.end(
      assets.get(name) ??
        '<meta charset="utf-8"><link rel="stylesheet" href="/app.css"><style>html,body,#root{height:100%;margin:0}</style><div id="root" class="gea-workbench-document"></div><script type="module" src="/app.js"></script>',
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  t.after(async () => {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.GEA_TEST_CHROMIUM,
  });
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.route(/^https?:\/\//, (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
  );
  await page.clock.install({ time: new Date(date) });
  await page.goto('http://127.0.0.1:' + server.address().port + '?scenario=' + scenario);
  await expect(page.getByRole('tab', { name: '纠偏', exact: true })).toBeVisible();
  return page;
}

test('两Tab用发货和目标显示月达成，纠偏六列与全范围汇总同口径', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t);
  await expect(page.getByTestId('regional-approval-workbench')).toContainText('60.0%');
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  await expect(page.getByRole('columnheader')).toHaveText([
    '组织名称',
    '月度目标',
    '月计划',
    '月达成进度',
    '追加/追减',
    '纠偏后进度',
  ]);
  await expect(page.getByRole('img', { name: /纠偏后进度 100.0%/ })).toBeVisible();
  for (const value of ['60.0%', '100.0%', '+25 / −0'])
    await expect(page.getByRole('row').filter({ hasText: '华南经销客户' })).toContainText(value);
  for (const value of ['目标金额', '¥1,000', '计划金额', '差额', '¥0', '计划数量', '125件'])
    await expect(page.getByTestId('correction-summary')).toContainText(value);
});

test('多状态纠偏一次读取真实无Z的M回退，明细消费只读品类基准', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t, 'mixed');
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: '终审月初客户' })).toHaveCount(1);
  await expect(page.getByRole('row').filter({ hasText: '省区纠偏客户' })).toHaveCount(1);
  const summary = page.getByTestId('correction-summary');
  for (const value of ['¥3,000', '¥2,520', '−¥480', '315件'])
    await expect(summary).toContainText(value);
  const queries = await page.evaluate(() => window.listRequests.filter((q) => q.orderType === 'Z'));
  assert.equal(queries.length, 1);
  assert.ok(queries[0].statuses.includes(1) && queries[0].statuses.includes(2));
  assert.equal(queries[0].status, undefined);
  await page.getByRole('button', { name: '终审月初客户', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const row = dialog.getByRole('row').filter({ hasText: '猪肉白菜水饺' });
  await expect(row).toContainText('90件');
  await expect(row).toContainText('¥720');
  await expect(dialog.getByRole('textbox', { name: '调整量 1001', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '通过', exact: true })).toBeDisabled();
  assert.equal(await page.evaluate(() => window.detailRequests.at(-1).orderType), 'Z');
  assert.deepEqual(await page.evaluate(() => window.actions), []);
});

test('同范围含未终审M时保留目标与灰行，未知汇总保持缺失', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t, 'mixed-null');
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: '月初未终审客户' });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('button', { name: '月初未终审客户', exact: true })).toBeDisabled();
  const cards = page.getByTestId('correction-summary').locator(':scope > div');
  await expect(cards.nth(0)).toContainText('¥4,000');
  for (const index of [1, 2, 3]) await expect(cards.nth(index).locator('strong')).toHaveText('—');
  assert.equal(
    await page.evaluate(() => window.listRequests.filter((q) => q.orderType === 'Z').length),
    1,
  );
});

test('月初卡片尊重服务端显式空确认汇总，不回退到本地计划量额', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t, 'monthly-null');
  const scope = page.getByTestId('regional-approval-workbench');
  await expect(scope).toContainText('目标金额¥1,000');
  await expect(scope).toContainText('计划金额—');
  await expect(scope).toContainText('差额（计划 − 目标）—');
  await expect(scope).toContainText('计划数量—');
});

test('SKU按品类合列，编辑净调整联动金额且负确认量拦截动作', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t);
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  await page.getByRole('button', { name: '华南经销客户', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('columnheader')).toHaveText([
    'SKU 编码 / 物料描述',
    '月初计划量 / 金额',
    '纠偏量 / 金额',
  ]);
  await expect(dialog).not.toContainText('AI');
  const input = dialog.getByRole('textbox', { name: '调整量 1001', exact: true });
  await expect(input).toHaveValue('2');
  await input.fill('-3');
  const row = dialog.getByRole('row').filter({ hasText: '猪肉白菜水饺' });
  await expect(row).toContainText('−¥24');
  await expect(dialog).toContainText('净纠偏数量 −3件');
  await input.fill('-101');
  await expect(row.getByRole('alert')).toHaveText('纠偏后计划数量不可为负');
  await expect(dialog.getByRole('button', { name: '保存调整', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '通过', exact: true })).toBeDisabled();
  assert.deepEqual(await page.evaluate(() => window.actions), []);
  await input.fill('0');
  await expect(dialog.getByRole('button', { name: '保存调整', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: /水饺/ }).click();
  await expect(input).toBeHidden();
});

test(
  '继承绝对量直接通过后按六字段和基准金额读回，拒绝错误调整金额',
  { timeout: 30000 },
  async (t) => {
    for (const scenario of ['rounding', 'corrupt']) {
      const page = await openWorkbench(t, scenario);
      await page.getByRole('tab', { name: '纠偏', exact: true }).click();
      await page.getByRole('button', { name: '华南经销客户', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('textbox', { name: '调整量 1001', exact: true })).toHaveValue(
        '-0.001',
      );
      await dialog.getByRole('button', { name: '通过', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.actions.length)).toBe(1);
      assert.deepEqual(await page.evaluate(() => window.actions[0].request.adjustments), [
        { skuCode: '1001', adjustQty: '-0.001' },
      ]);
      if (scenario === 'rounding') await expect(dialog).toBeHidden();
      else await expect(dialog.getByRole('alert')).toContainText('字段或日志尚未核对通过');
    }
  },
);

test('零目标与只读状态保留原值，不开放纠偏编辑和审批', { timeout: 30000 }, async (t) => {
  for (const scenario of ['zero', 'readonly', 'absent', 'closed', 'not-approved']) {
    const page = await openWorkbench(t, scenario);
    await page.getByRole('tab', { name: '纠偏', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: '华南经销客户' });
    if (scenario === 'zero') {
      await expect(row.getByRole('cell').nth(3)).toContainText('—');
      await expect(row.getByRole('cell').nth(3).locator('[title="未设置有效目标"]')).toBeVisible();
      await expect(row).toContainText('¥600');
    } else if (scenario === 'not-approved')
      await expect(row.getByRole('button', { name: '华南经销客户' })).toBeDisabled();
    else {
      await row.getByRole('button', { name: '华南经销客户' }).click();
      const dialog = page.getByRole('dialog');
      await expect(
        dialog.getByRole('textbox', { name: '调整量 1001', exact: true }),
      ).toBeDisabled();
      await expect(dialog.getByRole('button', { name: '通过', exact: true })).toBeDisabled();
    }
    assert.deepEqual(await page.evaluate(() => window.actions), []);
  }
});

test('时间红线覆盖过去当前未来月份，月初不展示红线', { timeout: 30000 }, async (t) => {
  for (const [scenario, expected, date] of [
    ['past', '100.0'],
    ['default', '61.3'],
    ['future', '0.0'],
    ['leap', '100.0', '2024-02-29T04:00:00Z'],
    ['default', '100.0', '2026-10-31T04:00:00Z'],
  ]) {
    const page = await openWorkbench(t, scenario, date);
    await expect(page.getByRole('img', { name: /时间进度/ })).toHaveCount(0);
    await page.getByRole('tab', { name: '纠偏', exact: true }).click();
    await expect(
      page.getByRole('img', { name: new RegExp('时间进度 ' + expected + '%') }).first(),
    ).toBeVisible();
  }
});

test('零值矩阵只灰显未参与项，保留基准零量与追减到零的明确提交', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t, 'zero-matrix');
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  await page.getByRole('button', { name: '华南经销客户', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('未参与本次纠偏', { exact: true })).toHaveCount(1);
  const zeroRow = dialog
    .getByRole('textbox', { name: '调整量 1003', exact: true })
    .locator('xpath=ancestor::tr');
  await expect(zeroRow).toContainText('未参与本次纠偏');
  await dialog.getByRole('button', { name: '保存调整', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.actions.length)).toBe(1);
  assert.deepEqual(await page.evaluate(() => window.actions[0].request.adjustments), [
    { skuCode: '1001', adjustQty: '0' },
    { skuCode: '1002', adjustQty: '-100' },
    { skuCode: '1003', adjustQty: '0' },
    { skuCode: '1004', adjustQty: '50' },
  ]);
});

test('金额数量按原值万阈值格式化，tooltip和编辑框保留精度', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t, 'units');
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: '华南经销客户' });
  await expect(row).toContainText('¥118.90万');
  await expect(row).toContainText('¥9,999');
  await expect(row).toContainText('1.00万件');
  await row.getByRole('button', { name: '华南经销客户' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('1.82万件');
  await expect(dialog).toContainText('−¥11.99万');
  await expect(dialog.locator('[title="18,200.000件"]').last()).toBeVisible();
  const input = dialog.getByRole('textbox', { name: '调整量 1001', exact: true });
  await input.focus();
  await expect(input).toHaveValue('-10000');
  await input.fill('0.123');
  await expect(dialog).toContainText('¥1.47');
});

test('区域月达成与卡片消费服务端整集合摘要', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t, 'grouped');
  const row = page.getByRole('row').filter({ hasText: '宝阳销售组' }).first();
  await expect(row).toContainText('90.0%');
  const summary = page.getByTestId('regional-approval-workbench');
  await expect(summary).toContainText('计划金额¥1,000');
});

test('桌面与窄屏保留列表、编辑与关闭入口且页面不横向溢出', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t, 'delivery');
  const evidence = process.env.W1_EVIDENCE_DIR;
  if (evidence) await mkdir(evidence, { recursive: true });
  const capture = async (name) => {
    if (evidence)
      await page.screenshot({
        path: evidence + '/' + name + '.png',
        fullPage: true,
        animations: 'disabled',
      });
  };
  await expect(page.getByRole('columnheader', { name: '月达成进度', exact: true })).toBeVisible();
  await capture('monthly-desktop');
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  await expect(page.getByRole('button', { name: '华南经销客户', exact: true })).toBeVisible();
  await capture('correction-desktop');
  await page.getByRole('button', { name: '华南经销客户', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('textbox', { name: '调整量 1001', exact: true }),
  ).toBeVisible();
  await capture('detail-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('dialog').getByRole('button', { name: '通过', exact: true }),
  ).toBeVisible();
  await capture('detail-narrow');
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await capture('correction-narrow');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
});
