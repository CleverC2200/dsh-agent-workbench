import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchWarningOwners,resolveWarningRoutes,warningOwnerDirectory} from '../src/warning-recipient-routing.mjs';
import {enqueueChanges,drainNotifications} from '../src/feishu-warning-transport.mjs';

test('组合按两套清单匹配，同人去重，无法识别的对象不猜测', () => {
  assert.equal(warningOwnerDirectory().length,14);
  assert.equal(new Set(warningOwnerDirectory().map(row=>row.employeeNo)).size,8);
  assert.deepEqual(matchWarningOwners('品类*基地','遂平基地 × 水饺'), ['gea:10007538','gea:10008296']);
  assert.deepEqual(matchWarningOwners('品类*基地','汤圆 × 华东基地'), ['gea:10008447']);
  assert.deepEqual(matchWarningOwners('品类*基地','遂平基地 × 未知品类'), []);
  assert.deepEqual(matchWarningOwners('品类','其余'), ['gea:10008447']);
});

test('账号查询失败保持其他匹配并返回缺口，不回退默认收件人',async()=>{
  const {routes,unresolved}=await resolveWarningRoutes([
    {objectKey:'known',objectName:'遂平基地 × 饺子',status:'预警'},
    {objectKey:'unknown',objectName:'未知基地 × 饺子',status:'预警'},
  ],'品类*基地',async account=>{
    if(account==='gea:10007538')throw Error('unavailable');
    return {receiveId:account};
  });
  assert.deepEqual(routes.get('known'),[{receiveId:'gea:10008296'}]);
  assert.equal(routes.has('unknown'),false);
  assert.equal(unresolved.length,2);
});

test('合并发送未知结果逐明细留痕，再次排队扫描不重发',async()=>{
  const recipient={receiveId:'person',receiveIdType:'user_id',recipientName:'负责人'};
  const state={events:['one','two'].map(id=>({id,monitorId:'task',eventStatus:'活跃',history:[{runId:'run',status:'预警'}]}))};
  enqueueChanges(state,new Map(),{id:'run',taskId:'task'},recipient,{});
  let calls=0;
  const options={state,locked:async callback=>callback(),save:async()=>{},send:async()=>{
    calls++;throw Object.assign(Error('timeout'),{unknown:true});
  }};
  await drainNotifications(options);
  await drainNotifications(options);
  assert.equal(calls,1);
  assert.ok(state.events.every(event=>event.notifications[0].status==='待核实'));
});

test('自动路由按对象分配，同一执行同一人只发一条并共享回执', async () => {
  const run = {id:'run',taskId:'task'};
  const rows = [
    {objectKey:'first',objectName:'遂平基地 × 面点',status:'预警'},
    {objectKey:'second',objectName:'遂平基地 × 饺子',status:'预警'},
  ];
  const lookups = [];
  const {routes,unresolved} = await resolveWarningRoutes(rows,'品类*基地',async account => {
    lookups.push(account);
    return {receiveId:account,receiveIdType:'user_id',recipientName:account};
  });
  assert.equal(lookups.length,2);
  assert.deepEqual(unresolved,[]);
  const state = {events:rows.map(row => ({
    ...row,id:row.objectKey,scope:row.objectName,monitorId:'task',eventStatus:'活跃',history:[{runId:'run',status:'预警'}],
  }))};
  enqueueChanges(state,new Map(),run,routes,{});
  const sent = [];
  await drainNotifications({state,locked:async callback=>callback(),save:async()=>{},send:async job=>{
    sent.push(job);
    return {messageId:'receipt-'+job.receiveId};
  }});
  assert.equal(sent.length,2);
  assert.match(sent.find(job=>job.receiveId==='gea:10007538').card.header.title.content,/汇总｜2 项/);
  assert.deepEqual(state.events.map(event=>event.notifications.find(job=>job.receiveId==='gea:10007538').messageId),
    ['receipt-gea:10007538','receipt-gea:10007538']);
  assert.equal(state.events[0].notifications.length,1);
});
