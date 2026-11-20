import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { delimiter, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'tsx',
    contents: `
import React from 'react';
import { createRoot } from 'react-dom/client';
import i18next from 'i18next';
import '@arco-design/web-react/dist/css/arco.css';
import './src/workbench/workbench.css';
import './theme/tokens.css';
import './src/frame-presenter.css';
import zh from './src/workbench/original/zh-CN.json';
import {BackendHttpError} from './src/workbench/original/http-error.ts';
import Workbench from './src/workbench/original/workbenches/regionalApproval/RegionalApprovalWorkbench.tsx';
import {QuickQuestions,QuickQuestionsContext} from './src/company/quick-questions-view.tsx';
import { InlineSkuDetails } from './src/workbench/original/workbenches/regionalApproval/InlineSkuDetails.tsx';
import { WorkbenchHostProvider } from './src/workbench/original/bridge.ts';
const i18n=i18next.createInstance();
await i18n.init({lng:'zh-CN',resources:{'zh-CN':{translation:{common:zh}}},interpolation:{escapeValue:false}});
const sourcePlans = [
  {
    planId: "p1",
    versionId: "v1",
    seq: 1,
    periodId: "period-1",
    planTypeCode: "Y",
    orderType: "M",
    dealerCode: "d1",
    dealerName: "客户1",
    orgCode: "org-a",
    orgName: "宝阳销售组",
    provinceCode: "province",
    provinceName: "华南省区",
    areaCode: "area",
    areaName: "华南大区",
    status: 1,
    currentQty: "20",
    currentAmount: "200",
    targetQty: "40",
    targetAmount: "400",
    skuCount: 1,
  },
  {
    planId: "p2",
    versionId: "v2",
    seq: 1,
    periodId: "period-1",
    planTypeCode: "Y",
    orderType: "M",
    dealerCode: "d2",
    dealerName: "客户2",
    orgCode: "org-a",
    orgName: "宝阳销售组",
    provinceCode: "province",
    provinceName: "华南省区",
    areaCode: "area",
    areaName: "华南大区",
    status: 1,
    currentQty: "30",
    currentAmount: "300",
    targetQty: "40",
    targetAmount: "400",
    skuCount: 1,
  },
  {
    planId: "p3",
    versionId: "v3",
    seq: 1,
    periodId: "period-1",
    planTypeCode: "Y",
    orderType: "M",
    dealerCode: "d3",
    dealerName: "客户3",
    orgCode: "org-b",
    orgName: "烟台经销组",
    provinceCode: "province",
    provinceName: "华南省区",
    areaCode: "area",
    areaName: "华南大区",
    status: 1,
    currentQty: "10",
    currentAmount: "100",
    targetQty: "40",
    targetAmount: "400",
    skuCount: 1,
  },
];
const baseSkuFor = (versionId) => ({
  id: "s-" + versionId,
  skuCode: "1001",
  versionId,
  productCategName: "汤圆",
  materialDescription: "冷冻汤圆组合装（家庭分享装）支持完整查看的长物料描述与包装规格500g×12袋ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  qty: "20",
  baseQty: "10",
  amt: "200",
  amtBase: "100",
  price: "10",
});

const comparison=new URL(location.href).searchParams.get('comparison');
if(['confirmed-monthly','monthly-incomplete'].includes(comparison))Object.assign(sourcePlans[0],{mPlanAmount:'689800',mPlanQty:'8586',currentAmount:'689800',currentQty:'8586',targetAmount:'714400',skuCount:2});
const continued = {
  'return-continued-region': [7, 'region', 1],
  'return-continued-province': [8, 'province', 2],
  'return-continued-skipped': [9, 'area', 2],
}[comparison];
const approvalRole = comparison?.startsWith('single-') ? 'category' : continued?.[1] ?? (comparison === 'return-unavailable' ? 'province' : 'region');
if(['history-correction','overview-correction','overview-correction-pagination'].includes(comparison))for(const plan of sourcePlans)plan.orderType='Z';
if(comparison==='surplus') for(const plan of sourcePlans) plan.targetAmount='50';
if(comparison==='shipment-missing') sourcePlans[0].shipmentError='未取得该客户 2026-10 的发货数据';
if(comparison?.startsWith('sku-review')||comparison==='category-allocation') for(const plan of sourcePlans) plan.skuCount=comparison==='sku-review-scroll'?40:2;
if(comparison==='mixed-terminal')sourcePlans[1].status=5;
if(comparison==='header-selection')sourcePlans[2].status=5;
if(['header-pagination','overview-correction-pagination'].includes(comparison))for(let n=4;n<=12;n++)sourcePlans.push({...sourcePlans[2],planId:'p'+n,versionId:'v'+n,dealerCode:'d'+n,dealerName:'客户'+n,orgCode:'org-'+n,orgName:'经销组'+n});
if(comparison==='performance')for(let n=4;n<=12;n++)sourcePlans.push({...sourcePlans[2],planId:'p'+n,versionId:'v'+n,dealerCode:'d'+n,dealerName:'客户'+n,orgCode:'org-'+n,orgName:'经销组'+n});
if(comparison==='sku-review-scheduling')for(let n=4;n<=6;n++)sourcePlans.push({...sourcePlans[2],planId:'p'+n,versionId:'v'+n,dealerCode:'d'+n,dealerName:'客户'+n,orgCode:'org-'+n,orgName:'经销组'+n});
const plans=continued?sourcePlans.slice(0,new URL(location.href).searchParams.has('grouped')?2:1).map(plan=>({...plan,status:continued[0]})):['returned','return-unavailable'].includes(comparison)?(comparison==='return-unavailable'?sourcePlans.slice(0,new URL(location.href).searchParams.has('grouped')?2:1):sourcePlans).map(plan=>({...plan,status:comparison==='return-unavailable'?8:7})):comparison==='empty'?[]:comparison==='readonly'?sourcePlans.slice(0,1).map(plan=>({...plan,orderType:'Z'})):new URL(location.href).searchParams.has('grouped')?sourcePlans:sourcePlans.slice(0,1);
if(comparison?.startsWith('single-'))for(const plan of plans)plan.status=4;
window.advanceOverviewVersion=()=>{plans[0].versionId='v1-next';};
window.sentDirect=[];window.completePlan=()=>{plans[0].status=10;};window.returnConfirmed=false;
const skuFor=(versionId)=>{
  const base=baseSkuFor(versionId);
  if(versionId==='v1-next')return {...base,qty:'7',price:'30',amt:'999'};
  if(comparison?.startsWith('overview-correction'))return {...base,adjAddQty:'5',adjCutQty:'1'};
  if(continued) return {...base,regionConfirmedQty:'10',regionConfirmedAmount:'100',provinceConfirmedQty:'15',provinceConfirmedAmount:'150',areaConfirmedQty:'25',areaConfirmedAmount:'250'};
  if(comparison==='integer')return {...base,qty:'501.600',amt:'5016.00'};
  if(comparison==='single-integer-category')return {...base,baseQty:'2480.000',amtBase:'24800.00',qty:'7000.000',amt:'70000.00'};
  if(!['inline','missing','category-allocation'].includes(comparison)) return base;
  const old=versionId.includes('previous'),older=versionId.includes('older');
  const prefix=versionId.slice(0,2);
  const qty=old?'10':older?'5':prefix==='v2'?'30':prefix==='v3'?'10':'20';
  const price=old?'8':older?'7':prefix==='v2'?'12':prefix==='v3'?'8':'10';
  return {...base,qty,price,amt:String(Number(qty)*Number(price))};
};
const skusFor=versionId=>comparison==='sku-review-scroll'?Array.from({length:40},(_,index)=>({...skuFor(versionId),id:'s-'+versionId+'-'+index,skuCode:String(30000000+index),productCategName:index<20?'饼类':'汤圆',materialDescription:'滚动测试SKU '+index})):comparison==='confirmed-monthly'&&versionId==='v1'?[
 {...skuFor(versionId),qty:'8000',amt:'600000',baseQty:'6752',amtBase:'506400',regionConfirmedQty:'8420.4',price:'75'},
 {...skuFor(versionId),skuCode:'2002',productCategName:'面点',qty:'200',amt:'20000',baseQty:'1834',amtBase:'183400',regionConfirmedQty:'288',price:'100'},
]:comparison?.startsWith('sku-review')||comparison==='category-allocation'?[skuFor(versionId),{...skuFor(versionId),id:'s-'+versionId+'-2002',skuCode:'2002',productCategName:'面点',materialDescription:'测试包子',qty:'5',baseQty:'5',amt:'50',amtBase:'50',price:'10'}]:[skuFor(versionId)];
window.sentReturns=[];
window.savedDrafts=[];
if (['history','history-correction','inline','missing'].includes(comparison)) for(const plan of plans) plan.seq = comparison==='missing' && plan.planId==='p2' ? 1 : 3;
const readCalls=window.readCalls=[];
window.performanceReads={lists:[],active:0,peak:0};
window.listPrefetchAborted=0;
const writes=window.writes=[];
const versionsFor=(plan)=>['history','history-correction','inline','missing'].includes(comparison) && !(comparison==='missing'&&plan.planId==='p2')
  ? [{...plan,id:plan.versionId,seq:3,effective:true},{...plan,id:plan.versionId+'-previous',seq:2,effective:false},{...plan,id:plan.versionId+'-older',seq:1,effective:false}]
  : [{...plan,id:plan.versionId,effective:true}];
const forbidden=async()=>{writes.push('write');throw Error('LOCAL_RENDER_ACTION_FORBIDDEN')};
const drafts=new Map();
if(comparison==='overview-draft')drafts.set('p1:v1',{role:'region',adjustments:[{skuCode:'1001',adjustQty:'5'}]});
const host={salesPlan:{
  periods:{invoke:async()=>({records:[{periodId:'period-1',periodMonth:'2026-10',planTypeCode:'Y',status:'OPEN'}],total:1,size:100,current:1,pages:1})},
  list:{invoke:async(q)=>{window.performanceReads.lists.push({status:q?.status,pageSize:q?.pageSize});if(comparison==='sku-review-performance'&&q?.pageSize===1)await new Promise(resolve=>setTimeout(resolve,80));if(comparison==='loading'||comparison==='quick-loading') await new Promise(resolve=>setTimeout(resolve,4000));const records=(comparison?.startsWith('single-')?(q?.status===undefined||q.status===4):(continued||comparison==='return-unavailable'||q?.status===undefined||q.status===1))?plans:[];return {records:window.queueGone?[]:records,total:window.queueGone?0:records.length,size:200,current:1,pages:1,...(comparison==='confirmed-monthly'?{summary:{planAmount:'689800',planQty:'8586',targetAmount:'714400'}}:comparison?.startsWith('overview-correction')?{summary:{planAmount:'600',planQty:'60',targetAmount:'1200'}}:{})}}},
  detail:{invoke:async({planId})=>{const plan=plans.find(row=>row.planId===planId);return {currentVersion:{...plan,id:plan.versionId,effective:true,...(window.autoBlock==='version'?{id:'new-version'}:{}),...(window.autoBlock==='status'?{status:2}:{}),...(window.returnConfirmed?{status:6}:{}),...(window.autoBlock==='period'?{periodId:'new-period'}:{})},skus:window.autoBlock==='sku'?skusFor(plan.versionId).map(s=>({...s,price:'11'})):skusFor(plan.versionId),versions:versionsFor(plan),logs:window.returnConfirmed?window.sentReturns.filter(c=>c.planId===planId).map(c=>({planId,versionId:c.versionId,actionCode:'REJECT',fromStatus:c.request.expectedStatus,toStatus:6,requestId:c.requestId})):continued?[{planId,versionId:plan.versionId,actionCode:'APPROVE',fromStatus:continued[2],toStatus:continued[0]-5}]:[],actionContext:{versionId:plan.versionId,status:plan.status,nodeOrder:comparison?.startsWith('single-')?4:2,allowedActions:window.autoBlock==='role'?[]:continued||['returned','return-unavailable'].includes(comparison)?['REJECT']:['APPROVE','REJECT'],snapshotHash:'a'.repeat(64)}}}},
  versions:{invoke:async({planId})=>{readCalls.push({history:planId});const plan=plans.find(row=>row.planId===planId);return versionsFor(plan)}},
  skuReview:{invoke:async({planId,versionId,signal})=>{
    readCalls.push({review:planId});
    if(comparison==='sku-review-scheduling'&&readCalls.filter(call=>call.review).length===1)
      await new Promise(resolve=>{window.completeFirstReview=resolve});
    if(comparison==='sku-review-failure') throw Error('fixture failure');
    signal?.throwIfAborted();
    return {versionId,skus:skusFor(versionId).map(sku=>sku.skuCode==='1001'?{...sku,amt:versionId==='v1'?'100.10':versionId==='v2'?'200.20':'0'}:sku),months:['2025-10','2026-08','2026-09'],shipmentUnavailable:false,
      rows:comparison==='sku-review-scroll'?skusFor(versionId).map(sku=>({skuCode:sku.skuCode,shipments:['1','2','3']})):[{skuCode:'1001',shipments:['1.5','10','20']},{skuCode:'2002',shipments:['2','3','4']}]};
  }},
  versionSkus:{invoke:async({versionId,signal})=>{
    readCalls.push({versionId});
    if(comparison==='sku-review-preempts-prefetch'&&!window.listPrefetchAborted)
      await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{
        window.listPrefetchAborted++;
        reject(signal.reason);
      },{once:true}));
    if(comparison==='performance'){window.performanceReads.active++;window.performanceReads.peak=Math.max(window.performanceReads.peak,window.performanceReads.active);await new Promise(resolve=>setTimeout(resolve,40));window.performanceReads.active--;}
    if(comparison==='category-loading'||comparison==='quick-category-loading') await new Promise(resolve=>setTimeout(resolve,5000));
    if(comparison==='forbidden'&&versionId.includes('previous'))throw Object.assign(Error('forbidden'),{status:403});return skusFor(versionId);
  }},
  draft:{invoke:async(q)=>{if(window.autoBlock==='draft')return {draft:null,stale:true};if(window.sentDirect.length){if(comparison==='single-dms-stale-second')return {draft:null,stale:true};if(comparison==='single-dms-unreadable-second')throw Error('fixture draft read failed');}const key=q.planId+':'+q.versionId;if(q.draft){writes.push('draft');window.savedDrafts.push(q.draft);drafts.set(key,q.draft);}return {draft:drafts.get(key)??null}}},
  logs:{invoke:async()=>[]},compare:{invoke:async({planId,fromVersionId,toVersionId})=>{
    readCalls.push({planId,fromVersionId,toVersionId});
    if(comparison==='forbidden')throw Object.assign(Error('forbidden'),{status:403});
    return [{skuCode:'1001',changeType:'UPDATED',before:{...skuFor(fromVersionId),qty:'10',amt:'100'},after:skuFor(toVersionId),qtyDelta:'10',amountDelta:'100'}];
  }},action:{invoke:async(command)=>{if(comparison?.startsWith('single-')){window.sentDirect.push(command);const status=comparison==='single-permission'?403:comparison==='single-conflict'?409:502;const error=comparison.startsWith('single-dms')?'DMS回写失败[ITEM_DISABLED]：产品编码TEST-ITEM已停用,不能填报':comparison==='single-permission'?'当前用户没有品类审批权限':comparison==='single-conflict'?'计划版本已变化，请刷新后重试':'GEA_HTTP_502';throw new BackendHttpError({method:'POST',path:'/sales-plan/plans/versions/'+command.versionId+'/actions',status,body:{error:window.directRejection??error,details:{...(comparison.startsWith('single-dms')?{retryable:false,upstreamCode:'SALES_PLAN_DMS_WRITEBACK_FAILED'}:{}),requestId:'hidden-error-reference',traceId:'hidden-trace-reference'}}});}if(comparison!=='return-edits'&&!continued)return forbidden();window.sentReturns.push(command);if(window.returnUnknown && command.planId==='p1')throw new TypeError('offline');return {planId:command.planId,versionId:command.versionId,fromStatus:command.request.expectedStatus,toStatus:continued?continued[2]+5:6,replayed:false,requestId:command.requestId,traceId:'fixture'};}},submit:{invoke:forbidden}
},modelInference:{invoke:forbidden}};
window.reportFactRequests=0;
if(['sku-review','report-unpublished','report-cancel'].includes(comparison))for(const plan of plans)plan.baseName='郑州';
host.salesPlan.reportFacts={invoke:async({planId,versionId,signal})=>{
 window.reportFactRequests++;
 if(comparison==='report-unpublished')throw Error('FIELD_NOT_PUBLISHED');
 if(comparison==='report-cancel')await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 return {planId,versionId,month:'2026-10',rows:skusFor(versionId).map(sku=>({skuCode:sku.skuCode,grading:'FACTORY_WH',inventoryOrganization:'郑州总库存组织',customerType:'经销商',customerGroup:'客户组',materialGroupCode:'100',materialGroupName:'物料组'}))};
}};
if(['sku-review','report-unpublished','report-cancel'].includes(comparison)){
 const list=host.salesPlan.list.invoke;
 host.salesPlan.list.invoke=async(query)=>{
  const page=await list(query);
  const records=query.orderType==='Z'?[]:page.records;
  return {...page,records,total:records.length};
 };
}
if(comparison?.startsWith('progressive-shipment')||comparison==='sku-review-preempts-prefetch'){
 const list=host.salesPlan.list.invoke;
 host.salesPlan.list.invoke=async(query,onPlanPage)=>{
  const page=await list(query);
  if(!onPlanPage || !page.records.length) return page;
  onPlanPage({...page,records:page.records.map(row=>({...row,shipmentPending:true,shipQty:null,shipAmount:null}))});
  if(comparison==='sku-review-preempts-prefetch') return page;
  await new Promise(resolve=>{window.finishShipments=resolve});
  query.signal.throwIfAborted();
  if(comparison==='progressive-shipment-error') throw Error('fixture shipment error');
  return {...page,records:page.records.map(row=>({...row,shipQty:'123',shipAmount:'456'}))};
 };
}
const root=createRoot(document.getElementById('root'));
window.restoreIntegerInput=async(mode,role='region')=>{
 const row={...plans[0],status:role==='category'?4:plans[0].status},loaded=await host.salesPlan.detail.invoke({planId:row.planId}),detail={...loaded,currentVersion:{...loaded.currentVersion,status:row.status}};
 if(mode==='draft')drafts.set(row.planId+':'+row.versionId,{role,adjustments:[{skuCode:'1001',adjustQty:'481.600'}]});
 root.render(<WorkbenchHostProvider value={host}><InlineSkuDetails row={row} detail={detail} canEdit approvalRole={role} t={i18n.t.bind(i18n)} initialInputValues={mode==='input'?{'1001':'501.600'}:undefined} draftPatch={mode==='patch'?{at:1,quantity:'501.600'}:undefined}/></WorkbenchHostProvider>);
};
const translate=i18n.t.bind(i18n);
function QuickQuestionFixture(){
 const [snapshot,setSnapshot]=React.useState(null),[draft,setDraft]=React.useState('');
 const observe=React.useCallback(context=>{window.quickQuestionSnapshot=context.quickQuestions;setSnapshot(context.quickQuestions)},[]);
 return <WorkbenchHostProvider value={host}><div style={{display:'flex',height:'100%'}}><div className="gea-original-workbench" style={{width:'75%',height:'100%'}}><Workbench stateScope="local-render" t={translate} onContextChange={observe} approvalStages={[approvalRole]} liveActionsEnabled/></div><aside style={{width:'25%',padding:12,boxSizing:'border-box'}}><QuickQuestionsContext.Provider value={snapshot}><QuickQuestions onFill={setDraft}/></QuickQuestionsContext.Provider><textarea aria-label="Agent输入框" value={draft} onChange={event=>setDraft(event.target.value)}/></aside></div></WorkbenchHostProvider>;
}
const renderWorkbench=toolCall=>root.render(comparison?.startsWith('quick-') ? <QuickQuestionFixture/> : <WorkbenchHostProvider value={host}><div className="gea-original-workbench"><Workbench stateScope="local-render" t={translate} onContextChange={context=>{window.approvalContext=context}} approvalStages={[approvalRole]} onSubmitBatch={(items)=>{window.approvalItems=items}} toolCall={toolCall} automaticAnalysisEnabled={comparison==='shared-list-analysis'} liveActionsEnabled/></div></WorkbenchHostProvider>);
window.selectOverviewRows=targets=>renderWorkbench({toolCallId:crypto.randomUUID(),command:{kind:'select',targets}});
renderWorkbench();
`,
  },
  outfile: '/fixture/app.js',
  bundle: true,
  nodePaths: (process.env.WORKBENCH_BROWSER_NODE_PATH ?? '').split(delimiter).filter(Boolean),
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"test"' },
  loader: { '.svg': 'dataurl', '.png': 'dataurl' },
});

async function openWorkbench(t, grouped = false, comparison) {
  const assets = new Map(
    bundle.outputFiles.map((asset) => [asset.path.split(/[\\/]/).at(-1), asset.text]),
  );
  const server = createServer((req, res) => {
    const name = req.url.slice(1);
    if (assets.has(name)) {
      res.setHeader('content-type', name.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(assets.get(name));
    } else {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(
        '<meta charset="utf-8"><link rel="stylesheet" href="/app.css"><style>html,body,#root{height:100%;margin:0}</style><div id="root" class="gea-workbench-document"></div><script type="module" src="/app.js"></script>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  t.after(async () => {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  });
  browser = await chromium.launch({
    headless: true,
    channel: process.env.DSH_TEST_BROWSER_CHANNEL,
    executablePath: process.env.GEA_TEST_CHROMIUM,
  });
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1536, height: 920 } });
  page.setDefaultTimeout(10000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(/^https?:\/\//, (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
  );
  t.after(() => assert.deepEqual(pageErrors, []));
  const params = new URLSearchParams();
  if (grouped) params.set('grouped', '1');
  if (comparison) params.set('comparison', comparison);
  await page.goto(`http://127.0.0.1:${server.address().port}?${params}`);
  await expect(page.getByTestId('regional-approval-workbench')).toBeVisible();
  const groupBox = page.locator('tbody label.arco-checkbox:has(input[value*="group:"])').first();
  if (grouped && comparison !== 'quick-loading') await expect(groupBox).toBeVisible();
  return { frame: page, page, groupBox };
}

test('sales performance: hidden statistics do not query and independent SKU reads overlap', async (t) => {
  const { page } = await openWorkbench(t, true, 'performance');
  const totals = page.getByRole('region', { name: '当前页明细汇总', exact: true });
  await expect(totals.locator('strong').nth(1)).toHaveText('¥2,400');
  const reads = await page.evaluate(() => ({
    ...window.performanceReads,
    skus: window.readCalls.filter((call) => call.versionId).length,
    writes: window.writes.length,
  }));
  assert.equal(reads.skus, 12);
  assert.equal(reads.writes, 0);
  assert.equal(reads.active, 0);
  assert.equal(reads.lists.length, 2, JSON.stringify(reads));
  assert.equal(reads.peak, 2, JSON.stringify(reads));
  await page.getByRole('button', { name: '展开审批流程图' }).click();
  await expect
    .poll(() => page.evaluate(() => window.performanceReads.lists.length))
    .toBeGreaterThan(2);
  await expect(page.getByTestId('regional-approval-stage-region')).toBeEnabled();
});

test('sales performance: workflow statistics do not reload SKU review, while refresh reads new data', async (t) => {
  const { page } = await openWorkbench(t, true, 'sku-review-performance');
  await page.getByRole('tab', { name: '按大类 / SKU' }).click();
  const reviews = () => page.evaluate(() => window.readCalls.filter((call) => call.review).length);
  const review = page.getByRole('region', { name: '按大类 / SKU', exact: true });
  await expect(review.getByRole('table')).toBeVisible();
  assert.equal(await reviews(), 3);
  await page.getByRole('button', { name: '展开审批流程图' }).click();
  await expect(page.getByTestId('regional-approval-stage-region')).toBeEnabled();
  assert.equal(await reviews(), 3);
  await page.getByRole('button', { name: '刷新数据', exact: true }).click();
  await expect.poll(reviews).toBe(6);
  await expect(review.getByRole('table')).toBeVisible();
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test('sales performance: analysis and queue share one read per partition on every refresh', async (t) => {
  const { page } = await openWorkbench(t, true, 'shared-list-analysis');
  const analysis = () => page.evaluate(() => window.approvalContext?.analysisSummary?.data?.count);
  const reads = () => page.evaluate(() => window.performanceReads.lists.length);
  await expect.poll(analysis).toBe(3);
  assert.equal(await reads(), 2);
  await page.evaluate(() => {
    window.queueGone = true;
  });
  await page.getByRole('button', { name: '刷新数据', exact: true }).click();
  await expect.poll(async () => [await analysis(), await reads()]).toEqual([0, 4]);
});

for (const fails of [false, true]) {
  test(`sales plan rows appear before shipments and survive ${fails ? 'shipment failure' : 'shipment completion'}`, async (t) => {
    const { page } = await openWorkbench(
      t,
      false,
      fails ? 'progressive-shipment-error' : 'progressive-shipment',
    );
    await expect(page.locator('[data-sales-plan-shipment]')).toHaveCount(0);
    await expect(page.getByText('当月发货加载中…')).toHaveCount(0);
    const reads = () =>
      page.evaluate(() => window.readCalls.filter((call) => call.versionId).length);
    await expect.poll(reads).toBeGreaterThan(0);
    const detailReads = await reads();
    await page.evaluate(() => window.finishShipments());
    await expect(page.locator('[data-sales-plan-shipment]')).toHaveCount(0);
    await expect(page.getByText('发货实绩未取得', { exact: true })).toHaveCount(0);
    assert.equal(await reads(), detailReads);
    assert.deepEqual(await page.evaluate(() => window.writes), []);
  });
}

test('sales performance: a completed SKU request frees its slot while the first is pending', async (t) => {
  const { page } = await openWorkbench(t, true, 'sku-review-scheduling');
  await page.getByRole('tab', { name: '按大类 / SKU' }).click();
  const reviews = () => page.evaluate(() => window.readCalls.filter((call) => call.review).length);
  await expect.poll(reviews).toBe(6);
  const review = page.getByRole('region', { name: '按大类 / SKU', exact: true });
  await expect(review.getByRole('table')).toHaveCount(0);
  await page.evaluate(() => window.completeFirstReview());
  await expect(review.getByRole('table')).toBeVisible();
});

test('sales performance: opening SKU review interrupts unfinished list prefetch and resumes it after review', async (t) => {
  const { page } = await openWorkbench(t, true, 'sku-review-preempts-prefetch');
  const prefetchReads = () =>
    page.evaluate(() => window.readCalls.filter((call) => call.versionId).length);
  await expect.poll(prefetchReads).toBe(2);
  await page.getByRole('tab', { name: '按大类 / SKU' }).click();
  const review = page.getByRole('region', { name: '按大类 / SKU', exact: true });
  await expect(review.getByRole('table')).toBeVisible();
  assert.equal(await page.evaluate(() => window.listPrefetchAborted), 2);
  await expect.poll(prefetchReads).toBe(5);
});

async function assertExpandedSkuLayout(region) {
  const layout = await region.getByRole('table').evaluate((table) => {
    const viewport = table.parentElement;
    const row = [...table.querySelectorAll('tbody tr')].find((node) => node.querySelector('td'));
    const rowRect = row.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    return {
      rowCoversRightEdge: row.contains(
        document.elementFromPoint(viewportRect.right - 4, rowRect.top + rowRect.height / 2),
      ),
      tableWidth: table.getBoundingClientRect().width,
      viewportWidth: viewport.clientWidth,
      columns: [...table.querySelectorAll('thead th')]
        .filter((node) => node.getAttribute('aria-hidden') !== 'true')
        .map((node) => node.getBoundingClientRect().width),
    };
  });
  assert.ok(
    layout.tableWidth >= layout.viewportWidth,
    `row background must span viewport: ${JSON.stringify(layout)}`,
  );
  assert.equal(
    layout.rowCoversRightEdge,
    true,
    'SKU row background must continue to the right edge',
  );
  assert.ok(layout.columns[0] <= 240, `SKU column too wide: ${layout.columns[0]}`);
  assert.ok(
    layout.columns.slice(1).every((width) => width <= 160),
    `metric columns too wide: ${layout.columns}`,
  );
  return layout;
}

async function visibleBlueAccents(page) {
  return page.getByTestId('regional-approval-workbench').evaluate((root) =>
    [...root.querySelectorAll('*')]
      .filter((node) => node.getBoundingClientRect().width > 0)
      .map((node) => ({
        label: (node.textContent ?? '').trim().slice(0, 24),
        className: typeof node.className === 'string' ? node.className : '',
        color: getComputedStyle(node).color,
        background: getComputedStyle(node).backgroundColor,
        border: getComputedStyle(node).borderTopColor,
      }))
      .filter((item) =>
        [item.color, item.background, item.border].some((value) => {
          const match = /rgba?\((\d+), (\d+), (\d+)/.exec(value);
          return (
            match &&
            Number(match[3]) > Number(match[1]) + 40 &&
            Number(match[3]) > Number(match[2]) + 20
          );
        }),
      ),
  );
}

test(
  'sales plan actions follow brand, secondary and disabled button states',
  { timeout: 30000 },
  async (t) => {
    const { page } = await openWorkbench(t);
    const state = (locator) =>
      locator.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          background: style.backgroundColor,
          color: style.color,
          border: style.borderTopColor,
          radius: style.borderRadius,
          height: style.height,
        };
      });
    const toolbar = page.getByTestId('regional-approval-toolbar-actions');
    const filter = toolbar.getByRole('button', { name: '筛选条件' });
    assert.deepEqual(await state(filter), {
      background: 'rgb(255, 255, 255)',
      color: 'rgb(85, 93, 104)',
      border: 'rgb(217, 221, 227)',
      radius: '6px',
      height: '30px',
    });
    await filter.hover();
    await expect.poll(async () => (await state(filter)).background).toBe('rgb(255, 250, 251)');
    await expect.poll(async () => (await state(filter)).color).toBe('rgb(223, 23, 50)');
    const approve = toolbar.getByRole('button', { name: '通过' });
    assert.equal(await approve.isDisabled(), true);
    assert.deepEqual(await state(approve), {
      background: 'rgb(245, 246, 248)',
      color: 'rgb(98, 107, 120)',
      border: 'rgb(227, 230, 234)',
      radius: '6px',
      height: '30px',
    });
    const activeTab = page.getByRole('tab', { name: '按区域' });
    assert.equal((await state(activeTab)).color, 'rgb(223, 23, 50)');
    const firstRow = page.locator('tbody .arco-table-tr').first();
    await firstRow.hover();
    await expect
      .poll(() =>
        firstRow
          .locator('td')
          .evaluateAll((cells) =>
            cells.every((cell) => getComputedStyle(cell).backgroundColor === 'rgb(255, 250, 251)'),
          ),
      )
      .toBe(true);
    for (const name of ['查看提报进度', '刷新数据', '导出月度计划报表']) {
      const offset = await toolbar.getByRole('button', { name, exact: true }).evaluate((button) => {
        const outer = button.getBoundingClientRect();
        const icon = button.querySelector('svg').getBoundingClientRect();
        return Math.abs(icon.top + icon.height / 2 - outer.top - outer.height / 2);
      });
      assert.ok(offset <= 0.5, `${name} icon must be vertically centered: ${offset}px`);
    }
  },
);

test(
  'dimension tab hover, underline and month value align with their controls',
  { timeout: 30000 },
  async (t) => {
    const { page } = await openWorkbench(t);
    const tab = page.getByRole('tab', { name: '按区域' });
    await tab.click();
    await tab.hover();
    const tabState = await tab.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const header = node.closest('[class*="queueHeader"]').getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        underlineGap: header.bottom - rect.bottom,
        color: style.color,
        background: style.backgroundColor,
        border: style.borderBottomColor,
      };
    });
    assert.deepEqual(tabState, {
      underlineGap: 1,
      color: 'rgb(223, 23, 50)',
      background: 'rgb(255, 240, 242)',
      border: 'rgb(223, 23, 50)',
    });
    const month = page.getByRole('combobox', { name: '销售计划周期' });
    const monthState = await month.evaluate((node) => {
      const view = node.querySelector('.arco-select-view');
      const value = node.querySelector('.arco-select-view-value');
      const range = document.createRange();
      range.selectNodeContents(value);
      const viewRect = view.getBoundingClientRect();
      const textRect = range.getBoundingClientRect();
      return {
        alignment: getComputedStyle(value).alignItems,
        centerGap: Math.abs((viewRect.top + viewRect.bottom - textRect.top - textRect.bottom) / 2),
      };
    });
    assert.equal(monthState.alignment, 'center');
    assert.ok(monthState.centerGap <= 1, `month text center gap: ${monthState.centerGap}px`);
  },
);

test(
  'sales plan controls and month menu use the shared brand palette',
  { timeout: 30000 },
  async (t) => {
    const { page } = await openWorkbench(t);
    await expect(page.getByRole('button', { name: /宝阳销售组/ }).first()).toBeVisible();
    assert.deepEqual(await visibleBlueAccents(page), [], 'default toolbar, row and pagination');
    const status = await page.getByTestId('regional-approval-status-p1').evaluate((node) => ({
      color: getComputedStyle(node).color,
      background: getComputedStyle(node).backgroundColor,
    }));
    assert.deepEqual(status, { color: 'rgb(98, 107, 120)', background: 'rgb(245, 246, 248)' });
    const month = page.getByRole('combobox', { name: '销售计划周期' });
    const trigger = await month.evaluate((node) => {
      const view = node.querySelector('.arco-select-view');
      const value = node.querySelector('.arco-select-view-value');
      return {
        height: getComputedStyle(view).height,
        radius: getComputedStyle(view).borderRadius,
        color: getComputedStyle(value).color,
        weight: getComputedStyle(value).fontWeight,
      };
    });
    assert.deepEqual(trigger, {
      height: '36px',
      radius: '8px',
      color: 'rgb(32, 35, 42)',
      weight: '700',
    });
    await month.click();
    const menu = page.locator('.arco-select-popup-inner').filter({ hasText: '2026年10月' });
    await expect(menu).toBeVisible();
    const option = await menu.locator('.arco-select-option-selected').evaluate((node) => ({
      color: getComputedStyle(node).color,
      background: getComputedStyle(node).backgroundColor,
      height: getComputedStyle(node).height,
      check: getComputedStyle(node, '::after').content,
    }));
    assert.deepEqual(option, {
      color: 'rgb(32, 35, 42)',
      background: 'rgb(255, 240, 242)',
      height: '34px',
      check: '"✓"',
    });
    if (process.env.SALES_PLAN_VISUAL_DIR) {
      await page.screenshot({
        path: resolve(process.env.SALES_PLAN_VISUAL_DIR, 'sales-plan-date.png'),
      });
    }
    await page.keyboard.press('Escape');
    await page.locator('.arco-switch').first().click();
    await page.getByRole('button', { name: '汤圆品类', exact: true }).first().click();
    await expect(
      page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true }),
    ).toBeVisible();
    assert.deepEqual(await visibleBlueAccents(page), [], 'checked switch and expanded SKU rows');
    await page.getByTestId('regional-approval-flow-toggle').click();
    assert.deepEqual(await visibleBlueAccents(page), [], 'expanded workflow stages');
    if (process.env.SALES_PLAN_VISUAL_DIR) {
      await page.screenshot({
        path: resolve(process.env.SALES_PLAN_VISUAL_DIR, 'sales-plan-brand.png'),
      });
    }
  },
);

test('组织分组行的勾选可以取消，不会勾上就取消不掉', { timeout: 30000 }, async (t) => {
  const { groupBox } = await openWorkbench(t, true);
  const box = groupBox.locator('input');
  await expect(box).not.toBeChecked();
  await groupBox.click();
  await expect(box).toBeChecked();
  await groupBox.click();
  await expect(box).not.toBeChecked();
  await groupBox.click();
  await expect(box).toBeChecked();
});

test('多计划组织行展开后显示同一 SKU 的真实汇总', { timeout: 30000 }, async (t) => {
  const { frame, groupBox } = await openWorkbench(t, true);
  const groupRow = groupBox.locator('xpath=ancestor::tr');
  const count = Number(/(\d+)\s*份计划/.exec(await groupRow.innerText())?.[1]);
  assert.ok(count > 1, '测试行应包含多份计划');
  await groupRow.getByRole('button').first().click();
  const summary = frame.getByTestId('regional-approval-group-sku-summary');
  await expect(summary).toBeVisible();
  const skuRow = summary.getByRole('row').filter({ hasText: '1001' });
  await expect(skuRow).toContainText(String(count * 20));
  await expect(skuRow).toContainText((count * 200).toFixed(2));
});

test('品类维度关闭组织编辑入口，只展开并编辑当前品类', { timeout: 30000 }, async (t) => {
  const { page } = await openWorkbench(t, false, 'sku-review');
  await page.getByRole('button', { name: /打开 宝阳销售组 调整明细/ }).click();
  await expect(
    page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true }),
  ).toBeVisible();
  await page.getByRole('switch', { name: '品类维度', exact: true }).click();
  await expect(page.getByRole('button', { name: /打开 宝阳销售组 调整明细/ })).toHaveCount(0);
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  const category = page.getByRole('button', { name: '汤圆品类', exact: true });
  await category.click();
  await expect(category).toHaveAttribute('aria-expanded', 'true');
  const input = page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(input).toHaveValue('20');
  await expect(page.getByRole('spinbutton', { name: '确认计划量 2002', exact: true })).toHaveCount(
    0,
  );
  await input.fill('40');
  await expect(page.getByTestId('regional-approval-month-plan-p1')).toContainText('¥450');
  await expect.poll(() => page.evaluate(() => window.savedDrafts.length)).toBeGreaterThan(0);
  await category.click();
  await page.getByRole('switch', { name: '品类维度', exact: true }).click();
  await page.getByRole('button', { name: /打开 宝阳销售组 调整明细/ }).click();
  await expect(page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true })).toHaveValue(
    '40',
  );
  assert.ok((await page.evaluate(() => window.writes)).every((kind) => kind === 'draft'));
});

test('品类汇总按下级原确认量拆分，金额、草稿和其他品类保持一致', { timeout: 30000 }, async (t) => {
  const { page, groupBox } = await openWorkbench(t, true, 'category-allocation');
  const queue = groupBox.locator('xpath=ancestor::tr');
  await queue.getByRole('button').first().click();
  await expect(page.getByTestId('regional-approval-group-sku-summary').first()).toBeVisible();
  await page.getByRole('switch', { name: '品类维度', exact: true }).click();
  await expect(queue.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  const category = queue
    .locator('xpath=following-sibling::tr')
    .getByRole('button', { name: '汤圆品类', exact: true })
    .first();
  await category.click();
  const input = page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true }).first();
  await expect(input).toHaveValue('50');
  await expect(page.getByRole('spinbutton', { name: '确认计划量 2002', exact: true })).toHaveCount(
    0,
  );
  await input.fill('100');
  await expect(queue).toContainText('¥1,220');
  await expect.poll(() => page.evaluate(() => window.savedDrafts.length)).toBe(2);
  let latest = new Map(
    (await page.evaluate(() => window.savedDrafts)).map((draft) => [draft.planId, draft]),
  );
  assert.deepEqual(latest.get('p1').adjustments, [{ skuCode: '1001', adjustQty: '20' }]);
  assert.deepEqual(latest.get('p2').adjustments, [{ skuCode: '1001', adjustQty: '30' }]);
  await category.click();
  const other = queue
    .locator('xpath=following-sibling::tr')
    .getByRole('button', { name: '面点品类', exact: true })
    .first();
  await other.click();
  const otherInput = page.getByRole('spinbutton', { name: '确认计划量 2002', exact: true });
  await expect(otherInput).toHaveValue('10');
  await otherInput.fill('11');
  await expect.poll(() => page.evaluate(() => window.savedDrafts.length)).toBe(4);
  latest = new Map(
    (await page.evaluate(() => window.savedDrafts)).map((draft) => [draft.planId, draft]),
  );
  assert.deepEqual(latest.get('p1').adjustments, [
    { skuCode: '1001', adjustQty: '20' },
    { skuCode: '2002', adjustQty: '1' },
  ]);
  assert.deepEqual(latest.get('p2').adjustments, [{ skuCode: '1001', adjustQty: '30' }]);
  await other.click();
  await category.click();
  await expect(input).toHaveValue('100');
  await expect(queue).toContainText('¥1,230');
  assert.ok((await page.evaluate(() => window.writes)).every((kind) => kind === 'draft'));
  if (process.env.DSH_REVIEW_EVIDENCE)
    await page.screenshot({
      path: process.env.DSH_REVIEW_EVIDENCE + '/category-allocation.png',
      fullPage: true,
    });
});

for (const comparison of ['return-continued-province', 'return-continued-skipped']) {
  test(`品类展开在上级审批维度也只保留品类编辑：${comparison}`, { timeout: 30000 }, async (t) => {
    const { page, groupBox } = await openWorkbench(t, true, comparison);
    const queue = groupBox.locator('xpath=ancestor::tr');
    await page.getByRole('switch', { name: '品类维度', exact: true }).click();
    await expect(queue.getByRole('button')).toHaveCount(0);
    await page.getByRole('button', { name: '汤圆品类', exact: true }).click();
    const input = page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
    const original = comparison === 'return-continued-province' ? 30 : 50;
    await expect(input).toHaveValue(String(original));
    await input.fill(String(original + 1));
    await expect.poll(() => page.evaluate(() => window.savedDrafts.length)).toBe(2);
    const latest = new Map(
      (await page.evaluate(() => window.savedDrafts)).map((draft) => [draft.planId, draft]),
    );
    assert.deepEqual(latest.get('p1').adjustments, [{ skuCode: '1001', adjustQty: '1' }]);
    assert.deepEqual(latest.get('p2').adjustments, []);
    assert.ok((await page.evaluate(() => window.writes)).every((kind) => kind === 'draft'));
  });
}

test('品类明细保留原审批权限限制', { timeout: 30000 }, async (t) => {
  const { page } = await openWorkbench(t, false, 'readonly');
  await page.getByRole('switch', { name: '品类维度', exact: true }).click();
  await page.getByRole('button', { name: '汤圆品类', exact: true }).first().click();
  await expect(page.getByTestId('regional-approval-group-sku-summary').first()).toBeVisible();
  await expect(page.getByRole('spinbutton')).toHaveCount(0);
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test(
  'monthly plan uses confirmed quantities before expansion and after edits and collapse',
  { timeout: 30000 },
  async (t) => {
    const { page } = await openWorkbench(t, false, 'confirmed-monthly');
    const plan = page.getByTestId('regional-approval-month-plan-p1');
    await expect(plan).toContainText('66.03万');
    await expect(plan).toContainText('8,708');
    const totals = page.getByRole('region', { name: '当前页明细汇总', exact: true });
    await expect(totals).toContainText('66.03万');
    const row = page.getByRole('row').filter({ has: plan });
    await expect(row).toContainText('92.4%');
    const expand = page.getByRole('button', { name: /宝阳销售组/ }).first();
    await expand.click();
    const input = page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
    await expect(input).toHaveValue('8420');
    await expect(plan).toContainText('66.03万');
    await input.fill('8421');
    await input.blur();
    await expect(plan).toContainText('66.04万');
    await expect(totals).toContainText('66.04万');
    await expand.click();
    await expect(input).toHaveCount(0);
    await expect(plan).toContainText('66.04万');
    await page.getByRole('switch', { name: '品类维度', exact: true }).click();
    await expect(page.getByTestId('regional-approval-month-plan-p1:category:汤圆')).toContainText(
      '63.16万',
    );
    await expect(page.getByTestId('regional-approval-month-plan-p1:category:面点')).toContainText(
      '2.88万',
    );
    assert.deepEqual(await page.evaluate(() => window.sentDirect), []);
  },
);

test('monthly organization totals aggregate confirmed quantities from every customer', async (t) => {
  const { page } = await openWorkbench(t, true, 'confirmed-monthly');
  const row = page.locator('tbody tr').filter({ hasText: '宝阳销售组' }).first();
  const plan = row.locator('[data-testid^="regional-approval-month-plan-"]');
  await expect(plan).toContainText('66.05万');
  await expect(plan).toContainText('8,728');
  await row.getByRole('button').first().click();
  await expect(page.getByTestId('regional-approval-group-sku-summary')).toBeVisible();
  await expect(plan).toContainText('66.05万');
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test('incomplete monthly SKU reads keep amounts unknown instead of showing the old summary', async (t) => {
  const { page } = await openWorkbench(t, false, 'monthly-incomplete');
  await expect(page.getByTestId('regional-approval-sku-coverage-error')).toBeVisible();
  await expect(page.getByTestId('regional-approval-month-plan-p1')).not.toContainText('68.98万');
  const totals = page.getByRole('region', { name: '当前页明细汇总', exact: true });
  await expect(totals).not.toContainText('68.98万');
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test('editable quantity inputs are white, outlined and rounded', { timeout: 30000 }, async (t) => {
  const { frame } = await openWorkbench(t);
  await frame
    .getByRole('button', { name: /宝阳销售组/ })
    .first()
    .click();
  const input = frame.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(input).toBeVisible();

  let idle;
  await expect
    .poll(async () => {
      idle = await input.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          bg: s.backgroundColor,
          borderWidth: s.borderTopWidth,
          borderColor: s.borderTopColor,
          radius: s.borderRadius,
        };
      });
      return idle;
    })
    .toMatchObject({ bg: 'rgb(255, 255, 255)', borderWidth: '1px' });
  assert.notEqual(idle.borderColor, 'rgba(0, 0, 0, 0)', '描边不能是透明');
  assert.ok(parseFloat(idle.radius) >= 4, `圆角要明显，实际 ${idle.radius}`);

  await input.click();
  await expect
    .poll(() => input.evaluate((el) => getComputedStyle(el).borderTopColor), { timeout: 3000 })
    .not.toBe(idle.borderColor);
});

test(
  'top toolbar month label and date value follow the shared control typography',
  { timeout: 30000 },
  async (t) => {
    const { frame } = await openWorkbench(t);
    const measured = await frame.getByTestId('regional-approval-workbench').evaluate((el) => {
      const doc = el.ownerDocument;
      const weight = (node) => (node ? Number(getComputedStyle(node).fontWeight) : 0);
      const labels = [...doc.querySelectorAll('small')]
        .filter((node) => ['计划月份', '版本', '对比'].includes(node.textContent.trim()))
        .map((node) => ({ text: node.textContent.trim(), weight: weight(node) }));
      const values = [...doc.querySelectorAll('small')]
        .filter((node) => ['计划月份', '版本', '对比'].includes(node.textContent.trim()))
        .flatMap((label) => [
          ...(label.parentElement?.querySelectorAll('.arco-select-view-value') ?? []),
        ])
        .map((node) => ({ text: node.textContent.trim().slice(0, 12), weight: weight(node) }));
      return { labels, values };
    });
    assert.equal(
      measured.labels.length,
      1,
      `顶部只剩计划月份标签，实际：${JSON.stringify(measured.labels)}`,
    );
    for (const label of measured.labels)
      assert.ok(label.weight >= 600, `${label.text} 要加粗，实际 ${label.weight}`);
    assert.ok(measured.values.length > 0, '顶部要能读到取值');
    for (const value of measured.values)
      assert.equal(value.weight, 700, `月份取值「${value.text}」使用统一日期控件字重`);
  },
);

test('table headers are bold without a darker background', { timeout: 30000 }, async (t) => {
  const { frame } = await openWorkbench(t);
  await frame
    .getByRole('button', { name: /宝阳销售组/ })
    .first()
    .click();
  await expect(
    frame.getByRole('spinbutton', { name: '确认计划量 1001', exact: true }),
  ).toBeVisible();
  const tables = await frame.locator('table').evaluateAll((nodes) =>
    nodes
      .map((table) => ({
        head: [...table.querySelectorAll(':scope > thead > tr > th')].map((node) => ({
          text: (node.textContent || '').trim(),
          weight: Number(getComputedStyle(node).fontWeight),
          bg: getComputedStyle(node).backgroundColor,
          fontSize: getComputedStyle(node).fontSize,
          lineHeight: getComputedStyle(node).lineHeight,
          height: node.getBoundingClientRect().height,
        })),
      }))
      .filter((table) => table.head.length > 0),
  );
  const queue = tables.find((table) => table.head.some((cell) => cell.text === '组织名称'));
  const detail = tables.find((table) => table.head.some((cell) => cell.text === '确认计划量'));
  assert.ok(queue, '找不到队列表格表头');
  assert.ok(detail, '找不到 SKU 明细表头');
  const queueColumnNames = queue.head.map((cell) => cell.text);
  assert.ok(
    queueColumnNames.includes('月提报达成'),
    `队列表头缺少月提报达成列名，实际 ${JSON.stringify(queueColumnNames)}`,
  );
  assert.ok(!queueColumnNames.includes('计划/目标'), '不要再用「计划/目标」这种含糊列名');
  for (const table of [queue, detail]) {
    for (const cell of table.head) {
      if (!cell.text) continue;
      assert.equal(cell.weight, 800, `表头「${cell.text}」字重`);
      assert.equal(cell.fontSize, '9px', `表头「${cell.text}」字号`);
      assert.ok(Math.abs(parseFloat(cell.lineHeight) - 12.15) < 0.1, `表头「${cell.text}」行高`);
      assert.equal(cell.height, 38, `表头「${cell.text}」高度`);
      assert.equal(
        cell.bg,
        table === queue ? 'rgb(245, 246, 248)' : 'rgb(242, 243, 245)',
        `表头「${cell.text}」使用对应的浅灰底色`,
      );
    }
  }
});
test(
  'approval flow lane is collapsed by default and toggles from the title row',
  { timeout: 30000 },
  async (t) => {
    const { frame, page } = await openWorkbench(t);
    const lane = frame.getByTestId('regional-approval-flow-lane');
    const toggle = frame.getByTestId('regional-approval-flow-toggle');
    await expect(toggle).toBeVisible();
    await expect(lane).toBeHidden();
    await expect(toggle).toContainText('当前节点：城市经理审批');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await expect(frame.getByTestId('regional-approval-queue-footer')).toBeVisible();

    await toggle.click();
    await expect(lane).toBeVisible();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await expect(frame.locator('[data-testid^="regional-approval-stage-"]')).toHaveCount(5);
    await expect(frame.getByTestId('regional-approval-stage-region')).toBeEnabled();
    for (const stage of ['customer', 'province', 'area', 'category'])
      await expect(frame.getByTestId(`regional-approval-stage-${stage}`)).toBeDisabled();
    await expect(toggle).toContainText('当前节点：城市经理审批');
    await frame.getByTestId('regional-approval-stage-region').click();
    await expect(toggle).toContainText('当前节点：全部节点');
    await frame.getByTestId('regional-approval-stage-region').click();
    await expect(toggle).toContainText('当前节点：城市经理审批');

    await page.reload();
    await expect(frame.getByTestId('regional-approval-workbench')).toBeVisible();
    await expect(frame.getByTestId('regional-approval-flow-lane')).toBeVisible();

    await frame.getByTestId('regional-approval-flow-toggle').click();
    await expect(frame.getByTestId('regional-approval-flow-lane')).toBeHidden();
    await page.reload();
    await expect(frame.getByTestId('regional-approval-workbench')).toBeVisible();
    await expect(frame.getByTestId('regional-approval-flow-lane')).toBeHidden();
  },
);

test('collapsing the flow lane keeps filters and inline edits', { timeout: 30000 }, async (t) => {
  const { frame } = await openWorkbench(t);
  await frame.getByRole('button', { name: '筛选条件', exact: true }).click();
  const area = frame.getByLabel('大区', { exact: true });
  await area.click();
  await frame.getByRole('option', { name: '华南大区', exact: true }).click();
  await expect(area).toContainText('华南大区');
  await frame
    .getByRole('button', { name: /宝阳销售组/ })
    .first()
    .click();
  const input = frame.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(input).toBeVisible();
  await input.fill('22.125');
  await expect(frame.locator('td').getByRole('status')).toHaveCount(0, { timeout: 10000 });

  const toggle = frame.getByTestId('regional-approval-flow-toggle');
  await toggle.click();
  await expect(frame.getByTestId('regional-approval-flow-lane')).toBeVisible();
  await toggle.click();
  await expect(frame.getByTestId('regional-approval-flow-lane')).toBeHidden();

  await toggle.click();
  await expect(frame.getByRole('spinbutton', { name: '确认计划量 1001', exact: true })).toHaveValue(
    '22',
  );
  await expect(area).toContainText('华南大区');
});

for (const orderType of ['M', 'Z']) {
  for (const grouped of [false, true]) {
    test(
      `销售预测仅展示当前版本且不读取历史对比: ${orderType} ${grouped ? '组织汇总' : '单计划'}`,
      { timeout: 30000 },
      async (t) => {
        const { page, groupBox } = await openWorkbench(
          t,
          grouped,
          orderType === 'Z' ? 'history-correction' : 'history',
        );
        if (orderType === 'Z') await page.getByRole('tab', { name: '纠偏', exact: true }).click();
        await expect(page.getByRole('button', { name: '版本对比', exact: true })).toHaveCount(0);
        await expect(page.getByRole('combobox', { name: /版本[①②]/ })).toHaveCount(0);
        const queue = grouped
          ? groupBox.locator('xpath=ancestor::tr')
          : page.locator('tbody tr').filter({ hasText: '宝阳销售组' }).first();
        await queue.getByRole('button').first().click();
        const region = grouped
          ? page.getByTestId('regional-approval-group-sku-summary').first().getByRole('region')
          : page.getByRole('region', { name: 'SKU 编码 / 物料描述', exact: true }).last();
        await expect(region.getByRole('row').filter({ hasText: '1001' })).toContainText(
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        );
        await expect(region.getByRole('columnheader')).toHaveText([
          'SKU 编码 / 物料描述',
          '月计划',
          '确认计划量',
          ...(orderType === 'Z' ? ['追加/追减'] : []),
        ]);
        assert.ok(
          (await page.evaluate(() => window.readCalls)).every(
            (call) =>
              !call.fromVersionId &&
              !call.history &&
              (!call.versionId || ['v1', 'v2', 'v3'].includes(call.versionId)),
          ),
        );
      },
    );
  }
}

test('无可读计划不显示版本对比，只读来源仍能查看当前明细', { timeout: 30000 }, async (t) => {
  const empty = await openWorkbench(t, false, 'empty');
  await expect(empty.page.getByRole('button', { name: '版本对比', exact: true })).toHaveCount(0);
  const { page } = await openWorkbench(t, false, 'readonly');
  await expect(page.locator('tbody input[type="checkbox"]').first()).toBeDisabled();
  await page
    .getByRole('button', { name: /宝阳销售组/ })
    .first()
    .click();
  const region = page.getByRole('region', { name: 'SKU 编码 / 物料描述', exact: true }).last();
  await expect(region.getByRole('spinbutton')).toHaveCount(0);
  await expect(region.getByRole('row').filter({ hasText: '1001' })).toContainText(
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  );
  if (process.env.GEA_LAYOUT_EVIDENCE)
    await page.screenshot({
      path: resolve(process.env.GEA_LAYOUT_EVIDENCE, 'expanded-readonly.png'),
    });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test(
  '组织汇总按原确认数量比例分摊，合计、逐计划草稿和收起重开保持一致',
  { timeout: 30000 },
  async (t) => {
    const { page, groupBox } = await openWorkbench(t, true, 'inline');
    const queue = groupBox.locator('xpath=ancestor::tr');
    await queue.getByRole('button').first().click();
    const summary = page.getByTestId('regional-approval-group-sku-summary').first();
    const input = summary.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
    await expect(input).toBeVisible();
    await assertExpandedSkuLayout(summary.getByRole('region'));
    const old = Number(await input.inputValue());
    await input.fill(String(old * 2));
    await expect.poll(() => page.evaluate(() => window.savedDrafts.length)).toBeGreaterThan(1);
    const saved = await page.evaluate(() => window.savedDrafts);
    const latest = new Map(saved.map((draft) => [draft.planId, draft]));
    assert.equal(latest.get('p1').adjustments[0].adjustQty, '20');
    assert.equal(latest.get('p2').adjustments[0].adjustQty, '30');
    await expect(queue).toContainText('¥1,120');
    await queue.getByRole('button').first().click();
    await queue.getByRole('button').first().click();
    await expect(
      summary.getByRole('spinbutton', { name: '确认计划量 1001', exact: true }),
    ).toHaveValue('100');
    await groupBox.click();
    await page.getByRole('button', { name: '通过', exact: true }).click();
    const items = await page.evaluate(() => window.approvalItems);
    assert.deepEqual(Object.fromEntries(items.map((item) => [item.planId, item.pendingValues])), {
      p1: { 1001: '40' },
      p2: { 1001: '60' },
    });
    assert.ok((await page.evaluate(() => window.writes)).every((kind) => kind === 'draft'));
  },
);

test('汇总数量为空或超过精度时阻止通过，修正后可继续', { timeout: 30000 }, async (t) => {
  const { page, groupBox } = await openWorkbench(t, true, 'inline');
  const queue = groupBox.locator('xpath=ancestor::tr');
  await queue.getByRole('button').first().click();
  const input = page
    .getByTestId('regional-approval-group-sku-summary')
    .first()
    .getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(input).toBeVisible();
  await groupBox.click();
  await input.fill('');
  await expect(page.getByRole('button', { name: '通过', exact: true })).toBeDisabled();
  await input.fill('10.0001');
  await expect(page.getByRole('button', { name: '通过', exact: true })).toBeDisabled();
  await input.fill('10.001');
  await expect(page.getByRole('button', { name: '通过', exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.savedDrafts.length)).toBe(2);
  const drafts = await page.evaluate(() => window.savedDrafts);
  const deltas = Object.fromEntries(
    drafts.map((draft) => [draft.planId, draft.adjustments[0].adjustQty]),
  );
  assert.deepEqual(deltas, { p1: '-16', p2: '-24' });
});

test('退回计划可继续修改本地草稿，组织汇总分摊不触发重提或审批', { timeout: 30000 }, async (t) => {
  const { page, groupBox } = await openWorkbench(t, true, 'returned');
  await groupBox.locator('xpath=ancestor::tr').getByRole('button').first().click();
  const group = page.getByTestId('regional-approval-group-sku-summary').first();
  const input = group.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(input).toBeVisible();
  await input.fill('80');
  await expect.poll(() => page.evaluate(() => window.savedDrafts.length)).toBe(2);
  assert.ok((await page.evaluate(() => window.writes)).every((kind) => kind === 'draft'));
  await page.getByRole('tab', { name: '按客户', exact: true }).click();
  await page
    .getByRole('button', { name: /打开 客户1/ })
    .first()
    .click();
  await expect(page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true })).toHaveValue(
    '40',
  );
});

test(
  'returned group submission carries each customer allocation from inline edits',
  { timeout: 30000 },
  async (t) => {
    const { page, groupBox } = await openWorkbench(t, true, 'returned');
    await groupBox.locator('xpath=ancestor::tr').getByRole('button').first().click();
    const group = page.getByTestId('regional-approval-group-sku-summary').first();
    await group.getByRole('spinbutton', { name: '确认计划量 1001', exact: true }).fill('80');
    await groupBox.click();
    await page.getByRole('button', { name: '提交所选', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.approvalItems?.length)).toBe(2);
    const items = await page.evaluate(() => window.approvalItems);
    assert.deepEqual(
      items
        .map((item) => ({
          kind: item.kind,
          customer: item.row.dealerName,
          role: item.approvalRole,
          value: item.pendingValues['1001'],
        }))
        .sort((left, right) => left.customer.localeCompare(right.customer)),
      [
        { kind: 'resubmit', customer: '客户1', role: 'region', value: '40' },
        { kind: 'resubmit', customer: '客户2', role: 'region', value: '40' },
      ],
    );
  },
);

test('split sales plan wraps control groups only when they cannot fit', async (t) => {
  const { page } = await openWorkbench(t);
  await page.getByRole('switch', { name: '品类维度' }).click();
  for (const [orderType, width, wraps] of [
    ['月初', 650, false],
    ['月初', 600, true],
    ['月初', 760, false],
    ['月初', 907, false],
    ['纠偏', 600, false],
    ['纠偏', 480, true],
  ]) {
    await page.getByRole('tab', { name: orderType, exact: true }).click();
    await page.setViewportSize({ width, height: 820 });
    const layout = `${orderType} at ${width}px`;
    const actions = page.getByTestId('regional-approval-toolbar-actions');
    const geometry = await actions.evaluate((node) => {
      const actions = node.getBoundingClientRect();
      const toolbar = node.parentElement.getBoundingClientRect();
      const tabs = node.parentElement.querySelector('[role="tablist"]').getBoundingClientRect();
      const root = node.closest('[data-testid="regional-approval-workbench"]');
      const header = node.closest('[class*="queueHeader"]').getBoundingClientRect();
      const table = root.querySelector('[class*="tableViewport"]').getBoundingClientRect();
      return {
        actionTops: [...node.querySelectorAll('button')].map(
          (button) => button.getBoundingClientRect().top,
        ),
        wraps: actions.top >= tabs.bottom,
        wrapGap: node.querySelector('button').getBoundingClientRect().top - tabs.bottom,
        topOverflow: toolbar.top - actions.top,
        bottomOverflow: actions.bottom - toolbar.bottom,
        toolbarHeight: toolbar.height,
        tableGap: table.top - header.bottom,
        rightOverflow: actions.right - root.getBoundingClientRect().right,
      };
    });
    assert.ok(
      Math.max(...geometry.actionTops) - Math.min(...geometry.actionTops) <= 1,
      `actions aligned for ${layout}`,
    );
    assert.ok(
      geometry.topOverflow <= 0 && geometry.bottomOverflow <= 0,
      `actions remain inside toolbar for ${layout}`,
    );
    assert.equal(geometry.wraps, wraps, `toolbar wrapping for ${layout}`);
    if (wraps) assert.ok(geometry.wrapGap <= 4, `compact row gap for ${layout}`);
    assert.ok(geometry.toolbarHeight <= 104, `wrapped toolbar for ${layout}`);
    assert.ok(geometry.tableGap >= 8, `table separated for ${layout}`);
    assert.ok(geometry.rightOverflow <= 0, `actions fit for ${layout}`);
    const customerTab = page.getByRole('tab', { name: '按客户' });
    await customerTab.scrollIntoViewIfNeeded();
    await expect(customerTab).toBeInViewport();
  }
});

test('展开 SKU 表在宽屏保持紧凑，长描述换行且窄屏可用键盘访问', { timeout: 30000 }, async (t) => {
  const { page } = await openWorkbench(t);
  await page
    .getByRole('button', { name: /宝阳销售组/ })
    .first()
    .click();
  const region = page.getByRole('region', { name: 'SKU 编码 / 物料描述', exact: true }).last();
  const row = region.getByRole('row').filter({ hasText: '1001' });
  await expect(row.getByRole('cell').first()).toContainText('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
  await expect(row.getByRole('cell').nth(1)).toHaveText('10¥100');
  const input = region.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(input).toHaveValue('20');
  if (process.env.GEA_LAYOUT_EVIDENCE)
    await page.screenshot({ path: resolve(process.env.GEA_LAYOUT_EVIDENCE, 'expanded-wide.png') });
  const { columns: geometry } = await assertExpandedSkuLayout(region);
  t.diagnostic(`wide SKU/metric column widths: ${geometry.join(', ')}`);

  const description = row.getByRole('cell').first();
  assert.equal(await description.evaluate((node) => node.scrollWidth <= node.clientWidth), true);
  await input.fill('30');
  await expect(row.getByRole('cell').nth(2)).toContainText('¥300');
  await page.setViewportSize({ width: 694, height: 820 });
  const scroller = page.locator('.arco-table-content-inner').first();
  await expect
    .poll(() => scroller.evaluate((node) => node.scrollWidth > node.clientWidth))
    .toBe(true);
  await scroller.hover({ position: { x: 10, y: 10 } });
  await page.mouse.wheel(300, 0);
  await expect.poll(() => scroller.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await region.focus();
  await expect(region).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  if (process.env.GEA_LAYOUT_EVIDENCE)
    await page.screenshot({
      path: resolve(process.env.GEA_LAYOUT_EVIDENCE, 'expanded-narrow.png'),
    });
});

test('月初隐藏发货实绩，纠偏保留缺失状态及期间原因', { timeout: 30000 }, async (t) => {
  const { page } = await openWorkbench(t, false, 'shipment-missing');
  await expect(page.locator('[data-sales-plan-shipment]')).toHaveCount(0);
  await expect(page.getByText('发货实绩未取得', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  const status = page.getByText('发货实绩未取得', { exact: true });
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute('title', '未取得该客户 2026-10 的发货数据');
});

test('pagination footer keeps counts and controls on one line', { timeout: 30000 }, async (t) => {
  const { frame, page } = await openWorkbench(t);
  const footer = frame.getByTestId('regional-approval-queue-footer');
  const total = footer.getByText(/^共 [\d,]+ 条$/);
  const pageSize = footer.locator('.arco-select-view');
  const currentPage = footer.locator('.arco-pagination-item-active');
  const pageCount = footer.getByText(/^共 \d+ 页$/);
  for (const viewportWidth of [1536, 420]) {
    await page.setViewportSize({ width: viewportWidth, height: 920 });
    await expect(total).toBeVisible();
    await expect(pageCount).toBeVisible();
    const boxes = await Promise.all(
      [total, pageSize, currentPage, pageCount].map((locator) => locator.boundingBox()),
    );
    assert.ok(boxes.every(Boolean), '分页元素均应有可测量的布局框');
    const centers = boxes.map((box) => box.y + box.height / 2);
    assert.ok(
      Math.max(...centers) - Math.min(...centers) <= 3,
      `分页元素应在同一水平中心线：${JSON.stringify(centers)}`,
    );
    assert.ok(
      Math.abs(boxes[1].height - 36) <= 1,
      `页容量选择框高度应为 36px，实际 ${boxes[1].height}`,
    );
    assert.ok(
      Math.abs(boxes[2].height - 36) <= 1,
      `页码按钮高度应为 36px，实际 ${boxes[2].height}`,
    );
    if (viewportWidth === 1536) {
      const overflow = await footer.evaluate((node) => node.scrollWidth - node.clientWidth);
      assert.ok(overflow <= 1, `桌面宽度不应横向溢出：${overflow}`);
    }
  }
});

test('real sales plan differences stay legible in both themes without changing their sign', async (t) => {
  for (const [comparison, sign] of [
    [undefined, 'Negative'],
    ['surplus', 'Positive'],
  ]) {
    const { page } = await openWorkbench(t, false, comparison);
    const value = page.locator(`[class*="queueMetrics"] strong[class*="variance${sign}"]`);
    await expect(value).toBeVisible();
    await expect(value).not.toHaveText('—');
    const text = await value.textContent();
    for (const dark of [true, false]) {
      await page.evaluate((dark) => {
        document.body.toggleAttribute('data-ds-dark-theme', dark);
        document.body.setAttribute('arco-theme', dark ? 'dark' : 'light');
      }, dark);
      const contrast = await value.evaluate((node) => {
        const luminance = (color) => {
          const rgb = color
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((value) => {
              const srgb = value / 255;
              return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
            });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const foreground = luminance(getComputedStyle(node).color);
        const background = luminance(
          getComputedStyle(node.closest('[data-testid="regional-approval-workbench"]'))
            .backgroundColor,
        );
        return (
          (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
        );
      });
      assert.ok(contrast >= 4.5, `${sign} difference in ${dark ? 'dark' : 'light'}: ${contrast}`);
      await expect(value).toHaveText(text);
    }
  }
});

test(
  'sales plan loading preserves controls and shows an embedded accessible skeleton before rows',
  { timeout: 30000 },
  async (t) => {
    const { page } = await openWorkbench(t, false, 'loading');
    const skeleton = page.getByRole('status', { name: '销售计划加载中' });
    await expect(skeleton).toBeVisible();
    await expect(skeleton).toHaveCSS('border-radius', '0px');
    await expect(skeleton.locator('table')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByTestId('regional-approval-queue-footer')).toBeVisible();
    await expect(skeleton).toBeHidden({ timeout: 20000 });
    await expect(page.getByText('华南大区').first()).toBeVisible();
  },
);

test(
  'sales plan uses table skeleton while SKU data is loading after queue arrives',
  { timeout: 30000 },
  async (t) => {
    const { page } = await openWorkbench(t, false, 'category-loading');
    await expect
      .poll(async () => await page.evaluate(() => window.readCalls.length))
      .toBeGreaterThan(0);
    const skeleton = page.getByRole('status', { name: '销售计划加载中' });
    await expect(skeleton).toBeVisible({ timeout: 2000 });
    await expect(page.locator('.arco-spin-loading')).toHaveCount(0);
    await expect(skeleton).toBeHidden({ timeout: 15000 });
    await expect(page.getByText('华南大区').first()).toBeVisible();
  },
);

test(
  'unified monthly XLSX exports saved customer SKU rows and ignores collapsed local edits',
  { timeout: 30000 },
  async (t) => {
    const { page } = await openWorkbench(t, false, 'sku-review');
    const { readFile } = await import('node:fs/promises');
    const xlsx = await import('xlsx-republish');
    const exported = async (button) => {
      const pending = page.waitForEvent('download');
      await button.click();
      const download = await pending;
      const workbook = xlsx.read(await readFile(await download.path()), { type: 'buffer' });
      return xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    };
    const plan = page.getByTestId('regional-approval-month-plan-p1');
    await expect(plan).toContainText('¥250');
    let rows = await exported(page.getByRole('button', { name: '导出月度计划报表', exact: true }));
    assert.equal(Object.keys(rows[0]).length, 24);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]['月初计划'], 20);
    assert.equal(rows[0]['月初计划额'], 200);
    const expand = page.getByRole('button', { name: /宝阳销售组/ }).first();
    await expand.click();
    await page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true }).fill('21');
    await page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true }).blur();
    await expand.click();
    await expect(plan).toContainText('¥260');
    rows = await exported(page.getByRole('button', { name: '导出月度计划报表', exact: true }));
    assert.equal(rows[0]['月初计划'], 20);
    assert.equal(rows[0]['月初计划额'], 200);
    await page.getByRole('tab', { name: '按大类 / SKU' }).click();
    const review = page.getByRole('region', { name: '按大类 / SKU', exact: true }).first();
    await expect(review.getByRole('rowheader', { name: /1001/ })).toBeVisible();
    await expect(review.getByRole('button', { name: '导出汇总', exact: true })).toHaveCount(0);
    rows = await exported(page.getByRole('button', { name: '导出月度计划报表', exact: true }));
    assert.equal(rows.length, 2);
    assert.deepEqual(await page.evaluate(() => window.sentDirect), []);
    assert.deepEqual(await page.evaluate(() => window.sentReturns), []);
  },
);

test(
  'regional SKU review filters and collapses the complete customer scope with one unified export entry',
  { timeout: 30000 },
  async (t) => {
    const { page } = await openWorkbench(t, true, 'sku-review');
    await page.getByRole('tab', { name: '按大类 / SKU' }).click();
    const review = page.getByRole('region', { name: '按大类 / SKU', exact: true }).first();
    await expect(review.getByRole('cell', { name: '300.30', exact: true }).first()).toBeVisible();
    assert.equal(
      await page.evaluate(() => window.readCalls.filter((call) => call.review).length),
      3,
    );
    await expect(review.getByRole('rowheader', { name: /1001/ })).toBeVisible();
    if (process.env.DSH_REVIEW_EVIDENCE)
      await page.screenshot({
        path: process.env.DSH_REVIEW_EVIDENCE + '/regional-sku-review-all.png',
        fullPage: true,
      });
    await review.getByRole('button', { name: /汤圆.*1 SKU/ }).click();
    await expect(review.getByRole('rowheader', { name: /1001/ })).toHaveCount(0);
    await expect(review.getByRole('cell', { name: '300.30', exact: true }).first()).toBeVisible();
    await review.getByRole('button', { name: /汤圆.*1 SKU/ }).click();
    await expect(review.getByRole('rowheader', { name: /2002/ })).toBeVisible();
    await review.getByRole('combobox', { name: 'SKU 编码 / 物料名称', exact: true }).click();
    await page.getByRole('option', { name: /1001/ }).click();
    await expect(review.getByRole('rowheader', { name: /2002/ })).toHaveCount(0);
    await review.getByRole('button', { name: '重置', exact: true }).click();
    await expect(review.getByRole('rowheader', { name: /2002/ })).toBeVisible();
    await review.getByRole('combobox', { name: '大类', exact: true }).click();
    await page.getByRole('option', { name: '汤圆', exact: true }).click();
    await expect(review.getByRole('rowheader', { name: /2002/ })).toHaveCount(0);
    await review.getByRole('combobox', { name: 'SKU 编码 / 物料名称', exact: true }).click();
    await page.getByRole('option', { name: /1001/ }).click();
    await expect(review.getByRole('button', { name: '导出汇总', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '导出月度计划报表', exact: true })).toBeVisible();
    assert.deepEqual(await page.evaluate(() => window.writes), []);
    if (process.env.DSH_REVIEW_EVIDENCE)
      await page.screenshot({
        path: process.env.DSH_REVIEW_EVIDENCE + '/regional-sku-review.png',
        fullPage: true,
      });
    await page.setViewportSize({ width: 820, height: 900 });
    await expect(page.getByRole('button', { name: '导出月度计划报表', exact: true })).toBeVisible();
    if (process.env.DSH_REVIEW_EVIDENCE)
      await page.screenshot({
        path: process.env.DSH_REVIEW_EVIDENCE + '/regional-sku-review-narrow.png',
        fullPage: true,
      });
  },
);

test('regional SKU review scrolls to its final rows with wheel and keyboard in a bounded panel', async (t) => {
  const { page } = await openWorkbench(t, true, 'sku-review-scroll');
  await page.getByRole('tab', { name: '按大类 / SKU' }).click();
  const review = page.getByRole('region', { name: '按大类 / SKU', exact: true }).first();
  const viewport = review.getByRole('region', { name: '按大类 / SKU', exact: true });
  await expect(review.getByRole('rowheader', { name: /30000039/ })).toHaveCount(1);
  for (const size of [
    { width: 1280, height: 820 },
    { width: 920, height: 700 },
  ]) {
    await page.setViewportSize(size);
    await viewport.focus();
    await page.keyboard.press('Home');
    await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBe(0);
    await viewport.hover({ position: { x: 100, y: 100 } });
    await page.mouse.wheel(0, 10000);
    await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    const bounds = await viewport.boundingBox();
    assert.ok(bounds.y + bounds.height <= size.height, 'table viewport must fit inside the page');
    const total = review.locator('tfoot');
    await expect(total).toBeInViewport();
    await expect(review.getByRole('button', { name: '重置', exact: true })).toBeInViewport();
    await viewport.focus();
    await page.keyboard.press('Home');
    await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBe(0);
    await page.keyboard.press('End');
    await expect
      .poll(() =>
        viewport.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop),
      )
      .toBeLessThanOrEqual(1);
    await expect(total).toBeInViewport();
    if (size.width < 1050) {
      await viewport.hover({ position: { x: 100, y: 100 } });
      await page.mouse.wheel(10000, 0);
      await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    }
  }
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test(
  'regional SKU review exposes incomplete reads and retry without showing a partial total',
  { timeout: 30000 },
  async (t) => {
    const { page } = await openWorkbench(t, true, 'sku-review-failure');
    await page.getByRole('tab', { name: '按大类 / SKU' }).click();
    await expect(page.getByText('提报数据未完整取得，请重试。', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '导出汇总', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '导出月度计划报表', exact: true })).toBeEnabled();
    assert.deepEqual(await page.evaluate(() => window.writes), []);
  },
);

test(
  'monthly confirmation rounds visible values and persisted deltas while viewing remains read-only',
  { timeout: 30000 },
  async (t) => {
    const { page } = await openWorkbench(t, false, 'integer');
    await page
      .getByRole('button', { name: /宝阳销售组/ })
      .first()
      .click();
    const input = page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
    await expect(input).toHaveValue('502');
    assert.deepEqual(await page.evaluate(() => window.writes), []);
    await input.fill('501.400');
    await input.blur();
    await expect(input).toHaveValue('501');
    await expect.poll(() => page.evaluate(() => window.savedDrafts.length)).toBeGreaterThan(0);
    const draft = await page.evaluate(() => window.savedDrafts.at(-1));
    assert.equal(Number(draft.adjustments[0].adjustQty), -0.6);
    await expect(input.locator('xpath=ancestor::td[1]')).toContainText('¥5,010.00');
  },
);

test('monthly category quantities show integers in the input and plan column', async (t) => {
  const { page } = await openWorkbench(t, false, 'single-integer-category');
  await page.locator('tbody button').first().click();
  const input = page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(input).toHaveValue('7000');
  const row = input.locator('xpath=ancestor::tr[1]');
  await expect(row.getByText('2,480', { exact: true })).toBeVisible();
  await expect(row.getByText('¥24,800.00', { exact: true })).toBeVisible();
  assert.deepEqual(await page.evaluate(() => window.writes), []);
  if (process.env.DSH_REVIEW_EVIDENCE)
    await row.screenshot({
      path: process.env.DSH_REVIEW_EVIDENCE + '/monthly-category-integer.png',
    });
  await input.fill('7000.600');
  await input.blur();
  await expect(input).toHaveValue('7001');
  await expect.poll(() => page.evaluate(() => window.savedDrafts.length)).toBeGreaterThan(0);
  const draft = await page.evaluate(() => window.savedDrafts.at(-1));
  assert.equal(Number(draft.adjustments[0].adjustQty), 1);
  await expect(input.locator('xpath=ancestor::td[1]')).toContainText('¥70,010.00');
});

test('monthly category external edits round before rendering and persisting', async (t) => {
  const { page } = await openWorkbench(t);
  await page.evaluate(() => window.restoreIntegerInput('patch', 'category'));
  const input = page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(input).toHaveValue('502');
  await expect.poll(() => page.evaluate(() => window.savedDrafts.length)).toBeGreaterThan(0);
  const draft = await page.evaluate(() => window.savedDrafts.at(-1));
  assert.equal(Number(draft.adjustments[0].adjustQty), 482);
});

for (const role of ['region', 'category'])
  for (const mode of ['input', 'draft'])
    test(
      'restored monthly quantities remain integers without writing: ' + role + ' ' + mode,
      { timeout: 30000 },
      async (t) => {
        const { page } = await openWorkbench(t);
        await page.evaluate(({ mode, role }) => window.restoreIntegerInput(mode, role), {
          mode,
          role,
        });
        await expect(
          page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true }),
        ).toHaveValue('502');
        assert.deepEqual(await page.evaluate(() => window.savedDrafts), []);
        assert.deepEqual(await page.evaluate(() => window.writes), []);
      },
    );

for (const scenario of ['return-edits', 'return-continued-province'])
  test(
    'return transport values do not create an unsaved draft on cancellation: ' + scenario,
    { timeout: 30000 },
    async (t) => {
      const { page } = await openWorkbench(t, false, scenario);
      await page.locator('tbody label.arco-checkbox').first().click();
      await page.getByRole('button', { name: '退回', exact: true }).click();
      const modal = page.getByRole('dialog', { name: '退回', exact: true });
      await expect(modal.getByRole('textbox')).toBeVisible();
      await expect(modal.locator('[role="status"]')).toHaveCount(0);
      await modal.getByRole('button', { name: '取消', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      assert.deepEqual(await page.evaluate(() => window.sentReturns), []);
      assert.deepEqual(await page.evaluate(() => window.savedDrafts), []);
    },
  );

for (const [scenario, target] of [
  ['return-edits', 1],
  ['return-continued-region', 1],
  ['return-continued-province', 2],
  ['return-continued-skipped', 2],
])
  test(
    'single return carries the current edited quantity: ' + scenario,
    { timeout: 30000 },
    async (t) => {
      const { page } = await openWorkbench(t, false, scenario);
      await page.locator('tbody').getByRole('button').first().click();
      const input = page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
      await expect(input).toBeVisible();
      await input.fill('30.600');
      await input.blur();
      await page.locator('tbody label.arco-checkbox').first().click();
      await page.getByRole('button', { name: '退回', exact: true }).click();
      const modal = page.getByRole('dialog', { name: '退回', exact: true });
      await modal
        .getByRole('textbox', { name: '退回原因（必填）', exact: true })
        .fill('请核对修改后的数量');
      await modal.getByRole('button', { name: '确认退回', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.sentReturns.length)).toBe(1);
      const request = await page.evaluate(() => window.sentReturns[0].request);
      assert.equal(request.expectedReturnTargetStage, target);
      assert.equal(request.action, 'REJECT');
      assert.deepEqual(request.adjustments, [
        { skuCode: '1001', adjustQty: target === 1 ? '11' : '21' },
      ]);
    },
  );

for (const [scenario, target] of [
  ['return-edits', 1],
  ['return-continued-skipped', 2],
])
  test(
    'batch return carries each customer allocation of the current edited group quantity: ' +
      scenario,
    { timeout: 30000 },
    async (t) => {
      const { page, groupBox } = await openWorkbench(t, true, scenario);
      const queue = groupBox.locator('xpath=ancestor::tr');
      await queue.getByRole('button').first().click();
      const input = page
        .getByTestId('regional-approval-group-sku-summary')
        .first()
        .getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
      await expect(input).toBeVisible();
      await input.fill('60');
      await input.blur();
      await groupBox.check();
      await page.getByRole('button', { name: '退回', exact: true }).click();
      const modal = page.getByRole('dialog');
      await modal.getByRole('textbox').fill('按调整后的数量核对');
      await modal.getByRole('button', { name: '确认批量退回', exact: true }).click();
      await expect.poll(() => page.evaluate(() => window.sentReturns.length)).toBe(2);
      const sent = await page.evaluate(() => window.sentReturns);
      assert.deepEqual(
        sent
          .toSorted((a, b) => a.planId.localeCompare(b.planId))
          .map((item) => [
            item.planId,
            item.request.expectedReturnTargetStage,
            item.request.adjustments,
          ]),
        [
          ['p1', target, [{ skuCode: '1001', adjustQty: target === 1 ? '10' : '20' }]],
          ['p2', target, [{ skuCode: '1001', adjustQty: target === 1 ? '10' : '20' }]],
        ],
      );
    },
  );

test('unresolved return destination prevents business writes', { timeout: 30000 }, async (t) => {
  const { page } = await openWorkbench(t, false, 'return-unavailable');
  await page.locator('tbody label.arco-checkbox').first().click();
  await page.getByRole('button', { name: '退回', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '退回', exact: true });
  await modal.getByRole('textbox', { name: '退回原因（必填）', exact: true }).fill('核对数量');
  await expect(
    modal.getByText('未能核对实际退回节点或修改后的数量，请刷新后重试。', { exact: true }),
  ).toBeVisible();
  await expect(modal.getByRole('button', { name: '确认退回', exact: true })).toBeDisabled();
  assert.deepEqual(await page.evaluate(() => window.sentReturns), []);
});

test(
  'unresolved batch return destination fails before any write',
  { timeout: 30000 },
  async (t) => {
    const { page, groupBox } = await openWorkbench(t, true, 'return-unavailable');
    await groupBox.check();
    await page.getByRole('button', { name: '退回', exact: true }).click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('textbox').fill('开发验收');
    await modal.getByRole('button', { name: '确认批量退回', exact: true }).click();
    await expect(
      modal.getByText('本次提交完成：成功 0 笔，失败 2 笔，待核对 0 笔，跳过 0 笔。', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(modal.getByText(/未能核对实际退回节点或修改后的数量，请刷新后重试。/)).toHaveCount(
      2,
    );
    await expect(modal.getByText(/结果暂时未知/)).toHaveCount(0);
    assert.deepEqual(await page.evaluate(() => window.sentReturns), []);
  },
);

for (const [scenario, reason] of [
  ['single-dms', 'DMS回写失败：产品编码TEST-ITEM已停用,不能填报'],
  ['single-permission', '当前用户没有品类审批权限'],
  ['single-conflict', '计划版本已变化，请刷新后重试'],
])
  test(
    'single automatic approval preserves ' + scenario + ' reason in the actual workbench',
    async (t) => {
      const { page } = await openWorkbench(t, false, scenario);
      await page.locator('tbody label.arco-checkbox:visible').first().click();
      await page.getByRole('button', { name: '通过', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(reason, { exact: true })).toBeInViewport();
      await expect(
        dialog.locator('textarea,input,[role=combobox],label.arco-checkbox'),
      ).toHaveCount(0);
      await expect(dialog).toContainText('p1');
      await expect(dialog.locator('.arco-alert-error')).toHaveCount(1);
      assert.equal(await page.evaluate(() => window.sentDirect.length), 1);
      if (scenario === 'single-dms' && process.env.GEA_RESULT_EVIDENCE) {
        await expect
          .poll(() => dialog.evaluate((el) => getComputedStyle(el).transform))
          .toBe('none');
        await page.screenshot({
          path: process.env.GEA_RESULT_EVIDENCE + '/single-result-wide.png',
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await expect
          .poll(async () => {
            const bounds = await dialog.boundingBox();
            return Boolean(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
          })
          .toBe(true);
        const bounds = await dialog.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
        await page.screenshot({
          path: process.env.GEA_RESULT_EVIDENCE + '/single-result-narrow.png',
        });
      }
      await expect(page.getByText(/hidden-error-reference|hidden-trace-reference/)).toHaveCount(0);
      await expect(
        page
          .getByTestId('regional-approval-workbench')
          .getByRole('button', { name: '核对提交结果', exact: true }),
      ).toHaveCount(0);
      if (scenario === 'single-permission')
        await expect(dialog.getByRole('button', { name: '重新提交', exact: true })).toBeDisabled();
    },
  );

test('single uncertain approval keeps its original intent and does not create another request', async (t) => {
  const { page } = await openWorkbench(t, false, 'single-unknown');
  await page.locator('tbody label.arco-checkbox:visible').first().click();
  await page.getByRole('button', { name: '通过', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/尚未查到/)).toBeVisible();
  assert.equal(await page.evaluate(() => window.sentDirect[0].request.remark), '同意');
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(
    page
      .getByTestId('regional-approval-workbench')
      .getByRole('button', { name: '核对提交结果', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '通过', exact: true })).toBeDisabled();
  await page
    .getByTestId('regional-approval-workbench')
    .getByRole('button', { name: '核对提交结果', exact: true })
    .click();
  assert.equal(await page.evaluate(() => window.sentDirect.length), 1);
  await dialog.getByRole('button', { name: '核对提交结果', exact: true }).click();
  await expect(dialog.getByText(/尚未查到/)).toBeVisible();
  assert.equal(await page.evaluate(() => window.sentDirect.length), 1);
  await expect(dialog).toContainText('客户1：');
  await page.evaluate(() => window.completePlan());
  await dialog.getByRole('button', { name: '核对提交结果', exact: true }).click();
  await expect(dialog).toContainText('提交成功');
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByText(/客户1：.*尚未查到/)).toHaveCount(0);
  await expect(page.getByText(/\{\{plan\}\}/)).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.sentDirect.length), 1);
});

test('explicit single DMS rejection permits another manual submission with a new request', async (t) => {
  const { page } = await openWorkbench(t, false, 'single-dms');
  await page.locator('tbody label.arco-checkbox:visible').first().click();
  await page.getByRole('button', { name: '通过', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const again = dialog.getByRole('button', { name: '重新提交', exact: true });
  await expect(again).toBeEnabled();
  await page.evaluate(() => {
    window.directRejection = 'DMS回写失败：产品TEST-ITEM仍为停用状态，请先维护产品资料';
  });
  await again.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => page.evaluate(() => window.sentDirect.length)).toBe(2);
  const calls = await page.evaluate(() => window.sentDirect);
  assert.notEqual(calls[1].requestId, calls[0].requestId);
  assert.notEqual(calls[1].idempotencyKey, calls[0].idempotencyKey);
  assert.deepEqual(calls[1].request, calls[0].request);
  await expect(
    dialog.getByText('DMS回写失败：产品TEST-ITEM仍为停用状态，请先维护产品资料', {
      exact: true,
    }),
  ).toBeInViewport();
});

test('closing a single DMS failure then selecting it again sends a fresh request', async (t) => {
  const { page } = await openWorkbench(t, false, 'single-dms');
  const select = page.locator('tbody label.arco-checkbox:visible').first();
  await select.click();
  await page.getByRole('button', { name: '通过', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/产品编码TEST-ITEM已停用/)).toBeVisible();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(select.locator('input')).not.toBeChecked();
  await page.evaluate(() => {
    window.directRejection = 'DMS回写失败：产品TEST-ITEM仍为停用状态，请先维护产品资料';
  });
  await select.click();
  const approve = page.getByRole('button', { name: '通过', exact: true });
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect.poll(() => page.evaluate(() => window.sentDirect.length)).toBe(2);
  const calls = await page.evaluate(() => window.sentDirect);
  assert.notEqual(calls[1].requestId, calls[0].requestId);
  assert.notEqual(calls[1].idempotencyKey, calls[0].idempotencyKey);
  await expect(
    dialog.getByText('DMS回写失败：产品TEST-ITEM仍为停用状态，请先维护产品资料', {
      exact: true,
    }),
  ).toBeInViewport();
});

for (const [scenario, reason] of [
  ['single-dms-stale-second', '原计划已变化，旧草稿未套用'],
  ['single-dms-unreadable-second', '草稿读取失败，请重新打开'],
])
  test('a second toolbar approval explains ' + scenario + ' before any new write', async (t) => {
    const { page } = await openWorkbench(t, false, scenario);
    const select = page.locator('tbody label.arco-checkbox:visible').first();
    const approve = page.getByRole('button', { name: '通过', exact: true });
    await select.click();
    await approve.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/产品编码TEST-ITEM已停用/)).toBeVisible();
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await select.click();
    await approve.click();
    await expect(dialog.getByText(reason, { exact: true })).toBeInViewport();
    assert.equal(await page.evaluate(() => window.sentDirect.length), 1);
    await expect(dialog.getByRole('button', { name: '刷新权威状态', exact: true })).toBeEnabled();
  });

test('manual approval retry rechecks a stale draft before issuing a new command', async (t) => {
  const { page } = await openWorkbench(t, false, 'single-dms-stale-second');
  await page.locator('tbody label.arco-checkbox:visible').first().click();
  await page.getByRole('button', { name: '通过', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '重新提交', exact: true }).click();
  await expect(dialog.getByText('原计划已变化，旧草稿未套用', { exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => window.sentDirect.length), 1);
});

test('batch return retains an unknown attempt while successful plans are not sent again', async (t) => {
  const { page, groupBox } = await openWorkbench(t, true, 'return-edits');
  await page.evaluate(() => {
    window.returnUnknown = true;
  });
  await groupBox.check();
  await page.getByRole('button', { name: '退回', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('批量审批备注')).toHaveValue('');
  await dialog.getByLabel('批量审批备注').fill('请核对');
  await dialog.getByRole('button', { name: '确认批量退回', exact: true }).click();
  await expect(dialog).toContainText('待核对 1 笔');
  await expect(dialog.locator('textarea,input,[role=combobox]')).toHaveCount(0);
  if (process.env.GEA_RESULT_EVIDENCE) {
    await expect.poll(() => dialog.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    await page.screenshot({ path: process.env.GEA_RESULT_EVIDENCE + '/batch-pending-wide.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () => {
        const b = await dialog.boundingBox();
        return Boolean(b && b.x >= 0 && b.x + b.width <= 390);
      })
      .toBe(true);
    await page.screenshot({ path: process.env.GEA_RESULT_EVIDENCE + '/batch-pending-narrow.png' });
  }
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page
    .getByTestId('regional-approval-workbench')
    .getByRole('button', { name: '核对提交结果', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: '核对提交结果', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('待核对 1 笔');
  assert.equal(await page.evaluate(() => window.sentReturns.length), 2);
  await page.evaluate(() => {
    window.returnConfirmed = true;
  });
  await page.getByRole('dialog').getByRole('button', { name: '核对提交结果', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('待核对 0 笔');
  assert.equal(await page.evaluate(() => window.sentReturns.length), 2);
});

for (const [block, reason] of [
  ['version', '计划版本已变化'],
  ['status', '审批状态已变化'],
  ['period', '计划周期不一致'],
  ['sku', 'SKU 1001 的'],
  ['role', '当前审批节点已不能通过这笔计划'],
  ['draft', '原计划已变化，旧草稿未套用'],
])
  test(
    'automatic approval explains ' + block + ' blocking and stops loading before any write',
    async (t) => {
      const { page } = await openWorkbench(t, false, 'single-dms');
      await page.locator('tbody label.arco-checkbox:visible').first().click();
      const approve = page.getByRole('button', { name: '通过', exact: true });
      await expect(approve).toBeEnabled();
      await page.evaluate((block) => {
        window.autoBlock = block;
      }, block);
      await approve.click();
      await expect(page.getByRole('dialog')).toContainText(reason);
      await expect(approve).not.toHaveClass(/arco-btn-loading/);
      assert.equal(await page.evaluate(() => window.sentDirect.length), 0);
    },
  );

test('actual toolbar retains terminal members as skipped in a mixed organization selection', async (t) => {
  const { page, groupBox } = await openWorkbench(t, true, 'mixed-terminal');
  await groupBox.check();
  await page.getByRole('button', { name: '通过', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.approvalItems?.length)).toBe(2);
  const items = await page.evaluate(() => window.approvalItems);
  assert.deepEqual(items.map((item) => [item.planId, item.kind]).sort(), [
    ['p1', 'approve'],
    ['p2', 'skip'],
  ]);
  assert.equal(await page.evaluate(() => window.writes.length), 0);
});

test('unknown approval survives an empty queue and only rechecks its result', async (t) => {
  const { page } = await openWorkbench(t, false, 'single-unknown');
  await page.locator('tbody label.arco-checkbox:visible').first().click();
  await page.getByRole('button', { name: '通过', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('尚未查到能确认本次提交结果的记录');
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await page.evaluate(() => {
    window.queueGone = true;
  });
  await page.getByRole('button', { name: '刷新数据', exact: true }).click();
  await expect(page.locator('tbody label.arco-checkbox:visible')).toHaveCount(0);
  await page
    .getByTestId('regional-approval-workbench')
    .getByRole('button', { name: '核对提交结果', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('尚未查到能确认本次提交结果的记录');
  await dialog.getByRole('button', { name: '核对提交结果', exact: true }).click();
  await expect(dialog).toContainText('尚未查到能确认本次提交结果的记录');
  assert.equal(await page.evaluate(() => window.sentDirect.length), 1);
});

test('quick questions follow visible rows and selected objects, preserving displayed values and only filling the draft', async (t) => {
  const { page, groupBox } = await openWorkbench(t, true, 'quick-selection');
  const capsules = page.getByRole('region', { name: '推荐问法' });
  await expect(capsules.getByRole('button')).toHaveCount(4);
  const verifyDisplay = async () => {
    const snapshot = await page.evaluate(() => window.quickQuestionSnapshot);
    const texts = await capsules.getByRole('button').allTextContents();
    const body = await page.getByTestId('regional-approval-workbench').innerText();
    for (const question of texts) {
      const row = snapshot.rows.find((row) => question.includes(row.name));
      assert.ok(row, question);
      assert.ok(body.includes(row.name));
      for (const fact of Object.values(row.facts)) {
        if (question.includes(fact.label)) {
          assert.ok(question.includes(fact.display), question);
          assert.ok(
            body.includes(fact.display),
            fact.display + ' must be visible in the workbench',
          );
        }
      }
    }
    return texts;
  };
  const listQuestions = await verifyDisplay();
  const draft = page.getByRole('textbox', { name: 'Agent输入框' });
  await draft.fill('保留中的草稿');
  await groupBox.click();
  await expect(capsules.getByText('围绕所选对象')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.quickQuestionSnapshot?.rows.length)).toBe(1);
  const selected = await verifyDisplay();
  assert.notDeepEqual(selected, listQuestions);
  assert.ok(selected.every((q) => q.includes('宝阳销售组')));
  assert.ok(selected.every((q) => !q.includes('烟台经销组')));
  await expect(draft).toHaveValue('保留中的草稿');
  await capsules.getByRole('button').first().click();
  await expect(draft).toHaveValue(selected[0]);
  await groupBox.click();
  await expect(capsules.getByText('围绕当前页面')).toBeVisible();
  assert.deepEqual(await verifyDisplay(), listQuestions);
  await expect(draft).toHaveValue(selected[0]);
  await page.locator('tbody label.arco-checkbox:has(input[value="p3"])').click();
  await expect(capsules.getByText('围绕所选对象')).toBeVisible();
  const otherQuestions = await verifyDisplay();
  assert.ok(otherQuestions.every((q) => q.includes('烟台经销组') && !q.includes('宝阳销售组')));
  assert.deepEqual(await page.evaluate(() => window.writes), []);
  assert.deepEqual(await page.evaluate(() => window.sentDirect), []);
  if (process.env.GEA_QUICK_EVIDENCE)
    await page.screenshot({ path: process.env.GEA_QUICK_EVIDENCE + '/approval-selected.png' });
});

test('quick questions hide while loading and refresh when changing dimensions', async (t) => {
  const { page } = await openWorkbench(t, true, 'quick-loading');
  await expect(page.getByRole('region', { name: '推荐问法' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '推荐问法' }).getByRole('button')).toHaveCount(4, {
    timeout: 15000,
  });
  await page.getByRole('tab', { name: '按客户', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.quickQuestionSnapshot?.rows.map((row) => row.name).sort()),
    )
    .toEqual(['客户1', '客户2', '客户3']);
  const questions = await page
    .getByRole('region', { name: '推荐问法' })
    .getByRole('button')
    .allTextContents();
  assert.ok(questions.every((q) => /客户[123]/.test(q)));
});

test('quick questions wait for visible version totals to finish loading', async (t) => {
  const { page } = await openWorkbench(t, false, 'quick-category-loading');
  await page.waitForFunction(() => window.readCalls.some((call) => call.versionId));
  const questions = page.getByRole('region', { name: '推荐问法' });
  await expect(page.getByText('销售计划加载中', { exact: true })).toBeVisible();
  await expect(questions).toHaveCount(0, { timeout: 500 });
  await expect(questions.getByRole('button')).toHaveCount(4, { timeout: 15000 });
  await expect(page.getByText('销售计划加载中', { exact: true })).toHaveCount(0);
});

test('header select all skips disabled rows and supports partial selection and cancellation', async (t) => {
  const { page } = await openWorkbench(t, true, 'header-selection');
  const header = page.locator('thead label.arco-checkbox:visible').first();
  await expect(header).toBeVisible();
  await header.check();
  await expect
    .poll(() =>
      page.evaluate(() => window.approvalContext?.selectedEntities.map((row) => row.id).sort()),
    )
    .toEqual(['p1', 'p2']);
  await expect(page.locator('tbody input[value="p3"]')).toBeDisabled();
  await expect(page.locator('tbody input[value="p3"]')).not.toBeChecked();
  await header.uncheck();
  await expect
    .poll(() => page.evaluate(() => window.approvalContext?.selectedEntities.length))
    .toBe(0);
  await page.getByRole('tab', { name: '按客户', exact: true }).click();
  await header.check();
  await page.locator('tbody label.arco-checkbox:has(input[value="p1"])').uncheck();
  await expect(header).toHaveClass(/arco-checkbox-indeterminate/);
  const checkboxColor = (checkbox) =>
    checkbox
      .locator('.arco-checkbox-mask')
      .evaluate((mask) => getComputedStyle(mask).backgroundColor);
  assert.equal(
    await checkboxColor(header),
    await checkboxColor(page.locator('tbody label.arco-checkbox:has(input[value="p2"])')),
  );
  await expect
    .poll(() => page.evaluate(() => window.approvalContext?.selectedEntities.map((row) => row.id)))
    .toEqual(['p2']);
  await header.click();
  await expect
    .poll(() =>
      page.evaluate(() => window.approvalContext?.selectedEntities.map((row) => row.id).sort()),
    )
    .toEqual(['p1', 'p2']);
  await header.uncheck();
  await expect
    .poll(() => page.evaluate(() => window.approvalContext?.selectedEntities.length))
    .toBe(0);
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test('header cancellation clears terminal members inherited from a selected organization', async (t) => {
  const { page } = await openWorkbench(t, true, 'mixed-terminal');
  const header = page.locator('thead label.arco-checkbox:visible').first();
  await header.check();
  await expect
    .poll(() =>
      page.evaluate(() => window.approvalContext?.selectedEntities.map((row) => row.id).sort()),
    )
    .toEqual(['p1', 'p2', 'p3']);
  await header.uncheck();
  await expect
    .poll(() => page.evaluate(() => window.approvalContext?.selectedEntities.length))
    .toBe(0);
  await expect(page.getByRole('button', { name: '通过', exact: true })).toBeDisabled();
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test('header select all only selects plans on the current page', async (t) => {
  const { page } = await openWorkbench(t, true, 'header-pagination');
  const totals = page.getByRole('region', { name: '当前页明细汇总', exact: true });
  await expect(totals).toContainText('¥2,400');
  await page.getByRole('combobox', { name: '每页条数' }).click();
  await page.getByRole('option', { name: '10 条/页', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.approvalContext?.pagination.pageSize))
    .toBe(10);
  const visibleIds = await page.evaluate(() =>
    window.approvalContext.visibleEntities.map((row) => row.id).sort(),
  );
  assert.equal(visibleIds.length, 11);
  const header = page.locator('thead label.arco-checkbox:visible').first();
  await header.check();
  await expect
    .poll(() =>
      page.evaluate(() => window.approvalContext?.selectedEntities.map((row) => row.id).sort()),
    )
    .toEqual(visibleIds);
  await expect(totals.locator('strong')).toHaveText(['¥4,400', '¥2,200', '−¥2,200', '220 件']);
  await page.locator('.arco-pagination-item-next:visible').click();
  await expect.poll(() => page.evaluate(() => window.approvalContext?.pagination.page)).toBe(2);
  await expect(totals).toContainText('¥2,400');
  assert.equal(
    await page.evaluate(() => window.readCalls.filter((call) => call.versionId).length),
    12,
  );
  await expect
    .poll(() => page.evaluate(() => window.approvalContext?.selectedEntities.length))
    .toBe(0);
  const nextPageIds = await page.evaluate(() =>
    window.approvalContext.visibleEntities.map((row) => row.id).sort(),
  );
  assert.equal(nextPageIds.length, 1);
  await header.check();
  await expect
    .poll(() =>
      page.evaluate(() => window.approvalContext?.selectedEntities.map((row) => row.id).sort()),
    )
    .toEqual(nextPageIds);
  await expect(totals.locator('strong')).toHaveText(['¥400', '¥200', '−¥200', '20 件']);
  await header.uncheck();
  await expect
    .poll(() => page.evaluate(() => window.approvalContext?.selectedEntities.length))
    .toBe(0);
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test('overview follows a customer selection and restores the full query after clearing', async (t) => {
  const { page } = await openWorkbench(t, true);
  const totals = page
    .getByRole('region', { name: '当前页明细汇总', exact: true })
    .locator('strong');
  await expect(totals).toHaveText(['¥1,200', '¥600', '−¥600', '60 件']);
  await page.getByRole('tab', { name: '按客户', exact: true }).click();
  const customer = page.locator('tbody label.arco-checkbox:has(input[value="p1"])');
  await customer.check();
  await expect(totals).toHaveText(['¥400', '¥200', '−¥200', '20 件']);
  await customer.uncheck();
  await expect(totals).toHaveText(['¥1,200', '¥600', '−¥600', '60 件']);
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test('overview deduplicates organization and customer targets from the page action', async (t) => {
  const { page, groupBox } = await openWorkbench(t, true);
  const totals = page
    .getByRole('region', { name: '当前页明细汇总', exact: true })
    .locator('strong');
  await expect(totals).toHaveText(['¥1,200', '¥600', '−¥600', '60 件']);
  await groupBox.check();
  await expect(totals).toHaveText(['¥800', '¥400', '−¥400', '40 件']);
  const groupId = await groupBox.locator('input').inputValue();
  await page.evaluate(
    (id) => window.selectOverviewRows(['row:' + id, 'row:p1', 'row:p2']),
    groupId,
  );
  await expect(totals).toHaveText(['¥800', '¥400', '−¥400', '40 件']);
  await page.evaluate(() => window.selectOverviewRows([]));
  await expect(totals).toHaveText(['¥1,200', '¥600', '−¥600', '60 件']);
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test('overview reads the current version and its SKU price for a retained selection', async (t) => {
  const { page } = await openWorkbench(t, true);
  await page.getByRole('tab', { name: '按客户', exact: true }).click();
  const totals = page
    .getByRole('region', { name: '当前页明细汇总', exact: true })
    .locator('strong');
  await page.locator('tbody label.arco-checkbox:has(input[value="p1"])').check();
  await expect(totals).toHaveText(['¥400', '¥200', '−¥200', '20 件']);
  await page.evaluate(() => window.advanceOverviewVersion());
  await page.getByRole('button', { name: '刷新数据', exact: true }).click();
  await expect(totals).toHaveText(['¥400', '¥210', '−¥190', '7 件']);
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

test('overview uses restored monthly drafts and subsequent inline edits in the selected scope', async (t) => {
  const { page } = await openWorkbench(t, true, 'overview-draft');
  const totals = page
    .getByRole('region', { name: '当前页明细汇总', exact: true })
    .locator('strong');
  await expect(totals).toHaveText(['¥1,200', '¥650', '−¥550', '65 件']);
  await page.getByRole('tab', { name: '按客户', exact: true }).click();
  await page.locator('tbody label.arco-checkbox:has(input[value="p1"])').check();
  await expect(totals).toHaveText(['¥400', '¥250', '−¥150', '25 件']);
  await page
    .getByRole('button', { name: /客户1/ })
    .first()
    .click();
  const quantity = page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await expect(quantity).toHaveValue('25');
  await quantity.fill('27');
  await quantity.blur();
  await expect(totals).toHaveText(['¥400', '¥270', '−¥130', '27 件']);
  assert.deepEqual(await page.evaluate(() => window.sentDirect), []);
});

test('overview uses the correction model quantity and amount for selected plans', async (t) => {
  const { page } = await openWorkbench(t, true, 'overview-correction');
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  await page.getByRole('tab', { name: '按客户', exact: true }).click();
  await page.locator('tbody label.arco-checkbox:has(input[value="p1"])').check();
  const totals = page
    .getByRole('region', { name: '当前页明细汇总', exact: true })
    .locator('strong');
  await expect(totals).toHaveText(['¥400', '¥240', '−¥160', '24 件']);
  await page
    .getByRole('button', { name: /客户1/ })
    .first()
    .click();
  const quantity = page.getByRole('spinbutton', { name: '确认计划量 1001', exact: true });
  await quantity.fill('27');
  await quantity.blur();
  await expect(totals).toHaveText(['¥400', '¥270', '−¥130', '27 件']);
  await page.locator('tbody label.arco-checkbox:has(input[value="p1"])').uncheck();
  await expect(totals).toHaveText(['¥1,200', '¥750', '−¥450', '75 件']);
  assert.deepEqual(await page.evaluate(() => window.sentDirect), []);
});

test('overview keeps the full correction query when selection is cleared across pages', async (t) => {
  const { page } = await openWorkbench(t, true, 'overview-correction-pagination');
  await page.getByRole('tab', { name: '纠偏', exact: true }).click();
  const totals = page
    .getByRole('region', { name: '当前页明细汇总', exact: true })
    .locator('strong');
  await expect(totals).toHaveText(['¥4,800', '¥2,880', '−¥1,920', '288 件']);
  await page.getByRole('combobox', { name: '每页条数' }).click();
  await page.getByRole('option', { name: '10 条/页', exact: true }).click();
  await page.locator('thead label.arco-checkbox:visible').first().check();
  await expect(totals).toHaveText(['¥4,400', '¥2,640', '−¥1,760', '264 件']);
  await page.locator('.arco-pagination-item-next:visible').click();
  await expect(totals).toHaveText(['¥4,800', '¥2,880', '−¥1,920', '288 件']);
  await page.locator('thead label.arco-checkbox:visible').first().check();
  await expect(totals).toHaveText(['¥400', '¥240', '−¥160', '24 件']);
  await page.locator('thead label.arco-checkbox:visible').first().uncheck();
  await expect(totals).toHaveText(['¥4,800', '¥2,880', '−¥1,920', '288 件']);
  assert.deepEqual(await page.evaluate(() => window.writes), []);
});

for (const mode of ['report-unpublished', 'report-cancel']) {
  test(`unified monthly report does not download for ${mode}`, async (t) => {
    const { page } = await openWorkbench(t, false, mode);
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.getByRole('button', { name: '导出月度计划报表', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.reportFactRequests)).toBeGreaterThan(0);
    if (mode === 'report-unpublished') {
      await expect(
        page.getByText('报表所需字段尚未开放读取，请联系数据管理员发布后重试；未产生文件。', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: '导出月度计划报表', exact: true }),
      ).toBeEnabled();
    } else {
      await page.getByRole('tab', { name: '纠偏', exact: true }).click();
      await expect(page.getByRole('tab', { name: '纠偏', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    }
    assert.equal(downloads, 0);
    assert.deepEqual(await page.evaluate(() => window.writes), []);
  });
}
