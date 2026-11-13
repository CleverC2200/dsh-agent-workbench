import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
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
import './theme/tokens.css';
import zh from './src/workbench/original/zh-CN.json';
import Workbench from './src/workbench/original/workbenches/regionalApproval/RegionalApprovalWorkbench.tsx';
import {WorkbenchHostProvider} from './src/workbench/original/bridge.ts';
const i18n=i18next.createInstance();
await i18n.init({lng:'zh-CN',resources:{'zh-CN':{translation:{common:zh}}},interpolation:{escapeValue:false}});
const scenario=new URL(location.href).searchParams.get('scenario');
window.actions=[];window.listRequests=[];window.detailRequests=[];window.draftRequests=[];
const plan={planId:'p1',versionId:'v1',seq:1,periodId:'20261001',planTypeCode:'Y',dealerCode:'d1',dealerName:'华南经销客户',orgCode:'o1',orgName:'宝阳销售组',provinceCode:'pr1',provinceName:'华南省区',areaCode:'a1',areaName:'华南大区',status:1,orderType:'Z',currentQty:'100',currentAmount:'800',targetQty:'100',targetAmount:'1000',skuCount:1,mPlanAmount:'800',mPlanQty:'100',shipAmount:'600',shipQty:'60',prevAdjAddQty:'2',prevAdjCutQty:'0',corrPlanAmount:'816',corrPlanQty:'102',amountProgress:'60.0',correctionProgress:'81.6'};
if(scenario==='original-fields'||scenario==='zero-adjustment')for(const key of ['prevAdjAddQty','prevAdjCutQty','corrPlanAmount','corrPlanQty','correctionProgress'])delete plan[key];
const second={...plan,planId:'p2',versionId:'v2',dealerCode:'d2',dealerName:'华北客户',orgCode:'o2',orgName:'华北销售组',provinceCode:'pr2',provinceName:'华北省区',areaCode:'a2',areaName:'华北大区',currentQty:'50',currentAmount:'400',mPlanQty:'50',mPlanAmount:'400',shipAmount:'200',shipQty:'20',prevAdjAddQty:'0',prevAdjCutQty:'3',corrPlanAmount:'376',corrPlanQty:'47',amountProgress:'20.0',correctionProgress:'37.6'};
if(scenario==='duplicate')plan.planId='p-jxs-2026-10-00001';
if(scenario==='display-baseline'){delete plan.mPlanQty;delete plan.mPlanAmount;}
const plans=['display-baseline','correction-integer'].includes(scenario)?[plan,{...plan,planId:'p2',versionId:'v2',dealerCode:'d2',dealerName:'同组客户'}]:scenario==='duplicate'?[plan,{...plan,planId:'p-jxs-2026-10-00002',versionId:'v3',periodId:'20261002',planTypeCode:'DC'}]:scenario==='batch'||scenario==='filters'?[plan,second]:[plan];
if(scenario==='m-source')plan.orderType='M';
if(scenario==='zero'){plan.targetAmount='0';plan.amountProgress=null;plan.correctionProgress=null;}
if(scenario==='shipment-unknown'){plan.shipAmount=null;plan.amountProgress=null;plan.shipmentError='发货金额来源待确认';}
if(scenario==='returned-no-channel')plan.status=7;
if(scenario==='actual-progress')Object.assign(plan,{currentQty:'15160',currentAmount:'1623958.90',mPlanQty:'16755',mPlanAmount:'1635925.16',targetAmount:'2008135.97',shipAmount:null,shipQty:null,amountProgress:null,shipmentError:'未取得该客户当月发货数据'});
const details=new Map(plans.map(p=>[p.planId,{currentVersion:{...p,id:p.versionId,effective:true},skus:[{id:'s-'+p.planId,skuCode:'1001',versionId:p.versionId,productCategName:'水饺',skuName:'猪肉白菜水饺',qty:p.currentQty,baseQty:p.currentQty,price:'8',amt:p.currentAmount,amtBase:p.currentAmount,adjAddQty:p.planId==='p2'||scenario==='zero-adjustment'?'0':'2',adjCutQty:p.planId==='p2'?'3':'0'}],versions:[],logs:[]}]));
if(scenario==='display-baseline')for(const detail of details.values())Object.assign(detail.skus[0],{baseQty:'-4',amtBase:'114800',corrBaseQty:'100',qty:'100',amt:'800'});
if(scenario==='correction-integer')for(const detail of details.values())Object.assign(detail.skus[0],{qty:'100.000',corrBaseQty:'90.000',amt:'720.00',adjAddQty:'0',adjCutQty:'0'});
const drafts=new Map();
const client={
 periods:{invoke:async()=>({records:[{periodId:'20261001',periodMonth:'2026-10',planTypeCode:'Y',status:'OPEN'}],total:1,size:100,current:1,pages:1})},
 list:{invoke:async(q={})=>{window.listRequests.push(q);const records=plans.filter(p=>!q.versionIds||q.versionIds.includes(p.versionId)).filter(p=>['areaCode','provinceCode','orgCode','dealerCode'].every(key=>!q[key]||p[key]===q[key])).filter(p=>q.status===undefined||p.status===q.status);const total=records.length;return {records:structuredClone(records).map(p=>({...p,orderType:scenario==='m-source'?'M':scenario==='z-source'?'Z':q.orderType??'M'})),total,size:200,current:1,pages:1,summary:{targetAmount:total===2?'2000':total===1?records[0].targetAmount:'0',planAmount:total===2?'1192':total===1?records[0].corrPlanAmount:'0',planQty:total===2?'149':total===1?records[0].corrPlanQty:'0',diffAmount:total===2?'-808':total===1?String(Number(records[0].corrPlanAmount)-Number(records[0].targetAmount)):'0'}};}},
 detail:{invoke:async(q)=>{window.detailRequests.push(q);return structuredClone(details.get(q.planId));}},
 versions:{invoke:async(q)=>[details.get(q.planId).currentVersion]},
 versionSkus:{invoke:async(q)=>structuredClone([...details.values()].find(d=>d.currentVersion.id===q.versionId).skus)},
 logs:{invoke:async(q)=>structuredClone(details.get(q.planId).logs)},compare:{invoke:async()=>[]},
 draft:{invoke:async(q)=>{window.draftRequests.push(structuredClone({...q,signal:undefined}));if(q.draft)drafts.set(q.versionId,structuredClone(q.draft));return {draft:structuredClone(drafts.get(q.versionId)??null),stale:false};}},
 action:{invoke:async(p)=>{window.actions.push(p);const source=details.get(p.planId);const fromStatus=source.currentVersion.status;const toStatus=p.request.action==='REJECT'?6:2;source.currentVersion.status=toStatus;plans.find(row=>row.planId===p.planId).status=toStatus;return {planId:p.planId,versionId:p.versionId,fromStatus,toStatus,replayed:false,requestId:p.requestId,traceId:'trace-'+p.planId,auditId:'audit-'+p.planId};}},
};
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
    bundle.outputFiles.map((asset) => [asset.path.split(/[\\/]/).at(-1), asset.text]),
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
  page.setDefaultTimeout(5000);
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

test('纠偏复用月初工作台的区域客户维度、筛选和批量动作', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t, 'existing-z');
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  const workbench = page.getByTestId('regional-approval-workbench');
  await expect(workbench).toBeVisible();
  await expect(page.getByTestId('correction-workbench')).toHaveCount(0);
  await expect(workbench.getByRole('tab', { name: '按客户', exact: true })).toBeVisible();
  await expect(workbench.getByRole('button', { name: '筛选条件', exact: true })).toBeVisible();
  await expect(workbench.getByRole('button', { name: '通过', exact: true })).toBeVisible();
  await expect(workbench.getByRole('button', { name: '退回', exact: true })).toBeVisible();
  await expect(workbench.getByRole('checkbox').first().locator('..')).toBeVisible();
  await expect(workbench.getByRole('switch', { name: '品类维度', exact: true })).toBeVisible();
  const queries = await page.evaluate(() => window.listRequests.filter((q) => q.orderType === 'Z'));
  assert.ok(queries.length > 0);
});

test(
  '纠偏追加追减沿月初本地草稿暂存并能重开恢复，不发送远端SAVE',
  { timeout: 30000 },
  async (t) => {
    const page = await openWorkbench(t);
    await page.getByRole('tab', { name: '纠偏', exact: true }).click();
    await page.getByRole('tab', { name: '按客户', exact: true }).click();
    const open = page.getByRole('button', { name: '打开 华南经销客户 调整明细', exact: true });
    await open.click();
    const input = page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue('102');
    await expect(input.locator('xpath=ancestor::tr[1]').getByRole('cell').nth(3)).toContainText(
      '+2',
    );
    await input.fill('97');
    await page.clock.runFor(700);
    await expect
      .poll(() => page.evaluate(() => window.draftRequests.filter((q) => q.draft).length))
      .toBe(1);
    assert.deepEqual(
      await page.evaluate(
        () => window.draftRequests.filter((q) => q.draft).at(-1).draft.adjustments,
      ),
      [{ skuCode: '1001', adjustQty: '-3' }],
    );
    assert.deepEqual(await page.evaluate(() => window.actions), []);
    await open.click();
    await open.click();
    await expect(
      page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true }),
    ).toHaveValue('97');
  },
);

test('纠偏六列与月初四列共用表格，保留发货和节点进度', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t, 'original-fields');
  await expect(page.getByRole('columnheader', { name: '追加/追减', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  await page.getByRole('tab', { name: '按客户', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: '追加/追减', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '纠偏后进度', exact: true })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: '华南经销客户' }).first();
  await expect(row).toContainText('60.0%');
  await expect(row).toContainText('81.6%');
  await expect(row).toContainText('60 件');
  await expect(row.locator('[title="60.000件"]')).toHaveText('60 件');
  await expect(row).toContainText('+2 / −0');
});

test('月初提报达成使用实际金额，纠偏保留发货达成口径', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t, 'actual-progress');
  for (const mode of ['月初', '纠偏']) {
    await page.getByRole('tab', { name: mode, exact: true }).click();
    await page.getByRole('tab', { name: '按客户', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: '华南经销客户' }).first();
    const columns = await page.getByRole('columnheader').allTextContents();
    const progressColumn = columns.findIndex(
      (name) => name === (mode === '月初' ? '月提报达成' : '月达成进度'),
    );
    assert.ok(progressColumn >= 0);
    const cell = row.getByRole('cell').nth(progressColumn);
    await expect(cell.locator('strong')).toHaveText(mode === '月初' ? '80.9%' : '—');
    if (mode === '月初') {
      await expect(cell).toContainText('¥162.40万 / ¥200.81万');
      await expect(cell).not.toContainText('发货实绩未取得');
    } else {
      await expect(cell).toContainText('发货实绩未取得');
    }
    await expect(row).not.toContainText('81.5%');
    if (process.env.GEA_PROGRESS_EVIDENCE)
      await page.screenshot({
        path:
          process.env.GEA_PROGRESS_EVIDENCE +
          (mode === '月初' ? '/monthly.png' : '/correction.png'),
      });
  }
  const zero = await openWorkbench(t, 'zero');
  const row = zero.getByRole('row').filter({ hasText: '宝阳销售组' }).first();
  await expect(row.locator('strong[title]')).toHaveText('—');
});

test('未接入重提入口时明确说明原因，避免误报身份或版本问题', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t, 'returned-no-channel');
  await page
    .getByRole('row')
    .filter({ hasText: '宝阳销售组' })
    .first()
    .getByRole('checkbox')
    .locator('..')
    .click();
  const submit = page.getByRole('button', { name: '修改后提交', exact: true });
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAttribute(
    'title',
    '当前页面尚未接入修改后提交入口，请更新客户端后重试。',
  );
});

test('批量审批弹窗在窄工作区内保持关闭与确认按钮同行且可关闭', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t, 'batch');
  await page.getByRole('tab', { name: '按客户', exact: true }).click();
  for (const kind of ['退回', '通过']) {
    await page.setViewportSize({ width: 1440, height: 960 });
    for (const name of ['华南经销客户', '华北客户'])
      await page
        .getByRole('row')
        .filter({ hasText: name })
        .first()
        .getByRole('checkbox')
        .locator('..')
        .click();
    await page.getByRole('button', { name: kind, exact: true }).click();
    const dialog = page.getByRole('dialog');
    const close = dialog.getByRole('button', { name: '关闭', exact: true });
    const confirm = dialog.getByRole('button', { name: `确认批量${kind}`, exact: true });
    await expect(close).toBeVisible();
    await page.clock.runFor(500);
    if (kind === '退回') await expect(confirm).toBeDisabled();
    for (const width of [1440, 701, 700, 560, 375]) {
      await page.setViewportSize({ width, height: 960 });
      await page.clock.runFor(100);
      const closeBox = await close.boundingBox();
      const confirmBox = await confirm.boundingBox();
      assert.ok(closeBox && confirmBox);
      assert.ok(
        Math.abs(closeBox.y - confirmBox.y) < 1,
        `${kind} at ${width}px: buttons must share a row`,
      );
      assert.ok(
        closeBox.x + closeBox.width <= confirmBox.x,
        `${kind} at ${width}px: buttons must not overlap`,
      );
      assert.ok(
        closeBox.x >= 0 && confirmBox.x + confirmBox.width <= width,
        `${kind} at ${width}px: buttons must fit the viewport`,
      );
    }
    if (kind === '退回') {
      await dialog.getByRole('textbox').fill('核对客户数量');
      await expect(confirm).toBeEnabled();
    }
    await close.click();
    await expect(dialog).toHaveCount(0);
    assert.deepEqual(await page.evaluate(() => window.actions), []);
  }
});

test('纠偏暂存后批量通过携带草稿，批量退回复用原原因和动作', { timeout: 30000 }, async (t) => {
  for (const kind of ['APPROVE', 'REJECT']) {
    const page = await openWorkbench(t, 'batch');
    await page.getByRole('tab', { name: '纠偏', exact: true }).click();
    await page.getByRole('tab', { name: '按客户', exact: true }).click();
    await page.getByRole('button', { name: '打开 华南经销客户 调整明细', exact: true }).click();
    await page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true }).fill('108');
    await page.clock.runFor(700);
    await expect
      .poll(() => page.evaluate(() => window.draftRequests.filter((q) => q.draft).length))
      .toBe(1);
    for (const name of ['华南经销客户', '华北客户'])
      await page
        .getByRole('row')
        .filter({ hasText: name })
        .first()
        .getByRole('checkbox')
        .locator('..')
        .click();
    await page
      .getByRole('button', { name: kind === 'APPROVE' ? '通过' : '退回', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    if (kind === 'REJECT') await dialog.getByRole('textbox').fill('核对客户数量');
    await dialog
      .getByRole('button', {
        name: kind === 'APPROVE' ? '确认批量通过' : '确认批量退回',
        exact: true,
      })
      .click();
    await expect.poll(() => page.evaluate(() => window.actions.length)).toBe(2);
    const actions = await page.evaluate(() => window.actions);
    assert.ok(
      actions.every((p) => p.request.action === kind && p.request.approvalRole === 'region'),
    );
    if (kind === 'APPROVE')
      assert.deepEqual(actions.find((p) => p.planId === 'p1').request.adjustments, [
        { skuCode: '1001', adjustQty: '8' },
      ]);
    else
      assert.ok(
        actions.every(
          (p) => p.request.remark === '核对客户数量' && p.request.expectedReturnTargetStage === 1,
        ),
      );
    if (kind === 'REJECT') {
      assert.deepEqual(actions.find((p) => p.planId === 'p1').request.adjustments, [
        { skuCode: '1001', adjustQty: '8' },
      ]);
      assert.deepEqual(actions.find((p) => p.planId === 'p2').request.adjustments, [
        { skuCode: '1001', adjustQty: '0' },
      ]);
    }
  }
});

test('纠偏复用品类维度、筛选汇总和分页控件', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t, 'filters');
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  await page.getByRole('tab', { name: '按客户', exact: true }).click();
  await page.getByRole('switch', { name: '品类维度', exact: true }).click();
  await expect(page.getByTestId('regional-approval-category-row-p1-水饺')).toBeVisible();
  await expect(page.getByTestId('regional-approval-workbench')).toContainText('¥2,000');
  await page.getByRole('button', { name: '筛选条件', exact: true }).click();
  await page.getByLabel('客户', { exact: true }).click();
  await page.getByRole('option', { name: '华南经销客户', exact: true }).click();
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: '打开 华北客户 调整明细', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId('regional-approval-workbench')).toContainText('计划金额¥816');
  assert.ok(
    await page.evaluate(() =>
      window.listRequests.some((q) => q.orderType === 'Z' && q.dealerCode === 'd1'),
    ),
  );
  await expect(page.getByLabel('每页条数', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '打开 华北客户 调整明细', exact: true }),
  ).toBeVisible();
});

test('同月Y/DC不同周期的发货按客户月份去重，金额未确认保持未知', { timeout: 30000 }, async (t) => {
  const grouped = await openWorkbench(t, 'duplicate');
  await expect(grouped.getByRole('row').filter({ hasText: '宝阳销售组' }).first()).toContainText(
    '80.0%',
  );
  await grouped.getByRole('tab', { name: '纠偏', exact: true }).click();
  const row = grouped.getByRole('row').filter({ hasText: '宝阳销售组' }).first();
  await expect(row).toContainText('60 件');
  await expect(row).toContainText('30.0%');
  await expect(row).not.toContainText('120');
  const unknown = await openWorkbench(t, 'shipment-unknown');
  await unknown.getByRole('tab', { name: '纠偏', exact: true }).click();
  const shipment = unknown
    .getByRole('row')
    .filter({ hasText: '宝阳销售组' })
    .first()
    .getByText('— / 60 件', { exact: true });
  await expect(shipment).toHaveAttribute('title', '发货金额来源待确认');
  await expect(shipment).toContainText('— / 60 件');
  await expect(shipment).not.toContainText('¥0');
  await expect(
    unknown.getByRole('row').filter({ hasText: '宝阳销售组' }).first(),
  ).not.toContainText('80.0%');
});

test('月初和纠偏单笔通过都带入即时编辑，纠偏输入不改月初基准', { timeout: 30000 }, async (t) => {
  for (const order of ['M', 'Z']) {
    const page = await openWorkbench(t, order === 'M' ? 'm-source' : 'default');
    if (order === 'Z') await page.getByRole('tab', { name: '纠偏', exact: true }).click();
    await page.getByRole('tab', { name: '按客户', exact: true }).click();
    await page.getByRole('button', { name: '打开 华南经销客户 调整明细', exact: true }).click();
    await page
      .getByRole('spinbutton', {
        name: '确认计划量 1001',
        exact: true,
      })
      .fill('108');
    if (order === 'Z') {
      await expect(page.getByTestId('regional-approval-month-plan-p1')).toContainText('100');
      await expect(page.getByRole('row').filter({ hasText: '华南经销客户' }).first()).toContainText(
        '86.4%',
      );
    }
    await page.getByRole('checkbox').first().locator('..').click();
    await page.getByRole('button', { name: '通过', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.actions.length)).toBe(1);
    assert.deepEqual(await page.evaluate(() => window.actions[0].request.adjustments), [
      { skuCode: '1001', adjustQty: '8' },
    ]);
    assert.equal(await page.evaluate(() => window.actions[0].request.action), 'APPROVE');
  }
});

test('两个视图明确异类来源只读，不能串用本地草稿或发起审批', { timeout: 30000 }, async (t) => {
  for (const [scenario, label] of [
    ['m-source', '月初来源（只读）'],
    ['z-source', '纠偏来源（只读）'],
  ]) {
    const page = await openWorkbench(t, scenario);
    if (scenario === 'm-source') await page.getByRole('tab', { name: '纠偏', exact: true }).click();
    await page.getByRole('tab', { name: '按客户', exact: true }).click();
    const row = page.getByRole('row').filter({ hasText: '华南经销客户' }).first();
    await expect(row).toContainText(label);
    await expect(row.getByRole('checkbox')).toBeDisabled();
    await page.getByRole('button', { name: '打开 华南经销客户 调整明细', exact: true }).click();
    await expect(page.getByRole('spinbutton')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '通过', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '退回', exact: true })).toBeDisabled();
    assert.deepEqual(await page.evaluate(() => window.draftRequests.filter((q) => q.draft)), []);
    assert.deepEqual(await page.evaluate(() => window.actions), []);
  }
});

test('真实零追加追减显示零值而非缺失', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t, 'zero-adjustment');
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  await page.getByRole('tab', { name: '按客户', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: '华南经销客户' }).first()).toContainText(
    '+0 / −0',
  );
});

test('Z月计划和展开基准只展示corrBaseQty与amt，M保留原base字段', { timeout: 30000 }, async (t) => {
  for (const order of ['Z', 'M']) {
    const page = await openWorkbench(t, 'display-baseline');
    if (order === 'Z') await page.getByRole('tab', { name: '纠偏', exact: true }).click();
    await page.getByRole('tab', { name: '按客户', exact: true }).click();
    const monthly = page.getByTestId('regional-approval-month-plan-p1');
    await expect(monthly).toContainText(order === 'Z' ? '100' : '−4');
    await expect(monthly).toContainText(order === 'Z' ? '¥800' : '¥11.48万');
    await page.getByRole('button', { name: '打开 华南经销客户 调整明细', exact: true }).click();
    const sku = page.getByRole('row').filter({ hasText: '猪肉白菜水饺' }).last();
    await expect(sku.getByRole('cell').nth(1)).toHaveText(order === 'Z' ? '100¥800' : '-4¥114,800');
    await expect(sku.getByRole('cell')).toHaveCount(order === 'Z' ? 4 : 3);
    if (order === 'Z') {
      await page.getByRole('tab', { name: '按区域', exact: true }).click();
      await page
        .getByRole('button', { name: /宝阳销售组/ })
        .first()
        .click();
      const grouped = page.getByTestId('regional-approval-group-sku-summary');
      const groupedSku = grouped.getByRole('row').filter({ hasText: '猪肉白菜水饺' });
      await expect(groupedSku.getByRole('cell').nth(1)).toHaveText('200¥1,600');
      await expect(groupedSku.getByRole('cell')).toHaveCount(order === 'Z' ? 4 : 3);
    }
  }
});

test('纠偏重复点击当前节点保留选择和调整输入', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t);
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  await page.getByRole('tab', { name: '按客户', exact: true }).click();
  await page.getByRole('button', { name: '打开 华南经销客户 调整明细', exact: true }).click();
  const input = page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await input.fill('97');
  const selected = page.getByRole('checkbox').first();
  await selected.locator('..').click();
  await page.getByRole('button', { name: '展开审批流程图', exact: true }).click();
  const current = page.getByTestId('regional-approval-stage-region');
  await expect(current).toHaveAttribute('aria-pressed', 'true');
  await current.click();
  await expect(current).toHaveAttribute('aria-pressed', 'true');
  await expect(selected).toBeChecked();
  await expect(input).toHaveValue('97');
});

test('纠偏确认计划量取整，客户和区域明细同步展示调整数量与金额', { timeout: 30000 }, async (t) => {
  const page = await openWorkbench(t, 'correction-integer');
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  await page.getByRole('tab', { name: '按客户', exact: true }).click();
  await page.getByRole('button', { name: '打开 华南经销客户 调整明细', exact: true }).click();
  const input = page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(input).toHaveValue('100');
  await expect(input).toHaveAttribute('step', '1');
  const row = input.locator('xpath=ancestor::tr[1]');
  await expect(row.getByRole('cell').nth(3)).toContainText('+10');
  await expect(row.getByRole('cell').nth(3)).toContainText('+¥80.00');
  assert.deepEqual(await page.evaluate(() => window.draftRequests.filter((q) => q.draft)), []);
  await input.fill('101.600');
  await input.blur();
  await expect(input).toHaveValue('102');
  await expect(row.getByRole('cell').nth(3)).toContainText('+12');
  await expect(row.getByRole('cell').nth(3)).toContainText('+¥96.00');
  await page.clock.runFor(700);
  await expect
    .poll(() => page.evaluate(() => window.draftRequests.filter((q) => q.draft).length))
    .toBeGreaterThan(0);
  assert.equal(
    Number(
      await page.evaluate(
        () => window.draftRequests.filter((q) => q.draft).at(-1).draft.adjustments[0].adjustQty,
      ),
    ),
    2,
  );
  await page.getByRole('tab', { name: '按区域', exact: true }).click();
  await page
    .getByRole('button', { name: /宝阳销售组/ })
    .first()
    .click();
  const summary = page.getByTestId('regional-approval-group-sku-summary');
  const groupedInput = summary.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(groupedInput).toHaveValue('202');
  await expect(groupedInput).toHaveAttribute('step', '1');
  const groupedRow = groupedInput.locator('xpath=ancestor::tr[1]');
  await expect(groupedRow.getByRole('cell').nth(3)).toContainText('+22');
  await groupedInput.fill('175');
  await expect(groupedRow.getByRole('cell').nth(3)).toContainText('-5');
  await expect(groupedRow.getByRole('cell').nth(3)).toContainText('-¥40.00');
  if (process.env.DSH_REVIEW_EVIDENCE)
    await page.screenshot({
      path: process.env.DSH_REVIEW_EVIDENCE + '/correction-adjustment-wide.png',
    });
  await page.setViewportSize({ width: 390, height: 844 });
  const viewport = summary.getByRole('region');
  await viewport.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  const adjustmentCell = groupedRow.getByRole('cell').nth(3);
  await adjustmentCell.scrollIntoViewIfNeeded();
  const box = await adjustmentCell.boundingBox();
  assert.ok(
    box && box.x >= 0 && box.x + box.width <= 390,
    'adjustment cell stays readable after horizontal scrolling',
  );
  await expect(adjustmentCell).toBeVisible();
  if (process.env.DSH_REVIEW_EVIDENCE)
    await page.screenshot({
      path: process.env.DSH_REVIEW_EVIDENCE + '/correction-adjustment-narrow.png',
    });
  assert.deepEqual(await page.evaluate(() => window.actions), []);
});
