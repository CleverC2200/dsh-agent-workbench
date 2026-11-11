import {test} from 'node:test';
import assert from 'node:assert/strict';
import {warningOwner,ownerWarningState,createOwnerScopedApi,migrateWarningOwners} from '../src/warning-ownership.mjs';
const status=(id,environment='test',tenantId='0')=>({authenticated:true,environment,user:{id,username:id,name:'同名用户',tenantId}});
const a=warningOwner(status('a')),b=warningOwner(status('b'));
const fixture=()=>({tasks:[{id:'a',owner:a},{id:'b',owner:b},{id:'closed',owner:a,deletedAt:'2026-11-11'},{id:'legacy',definedBy:'同名用户'}],events:[{id:'ea',monitorId:'a'},{id:'eb',monitorId:'b'},{id:'ec',monitorId:'closed'},{id:'unknown'}],runs:[{id:'ra',taskId:'a'},{id:'rb',taskId:'b'},{id:'rc',taskId:'closed'}]});
test('同名账号、不同环境和租户互相隔离，未登录拒绝访问',()=>{
  assert.notEqual(a.key,b.key);assert.notEqual(a.key,warningOwner(status('a','production')).key);assert.notEqual(a.key,warningOwner(status('a','test','1')).key);
  assert.throws(()=>warningOwner({...status('a'),authenticated:false}),/请登录/);
});
test('仅返回自己的任务卡片和记录，保留已删除任务历史，不猜测无归属记录',()=>{
  const s=ownerWarningState(fixture(),a);assert.deepEqual(s.tasks.map(t=>t.id),['a']);assert.deepEqual(s.events.map(e=>e.id),['ea','ec']);assert.deepEqual(s.runs.map(r=>r.id),['ra','rc']);
  assert.deepEqual(ownerWarningState(fixture(),b).tasks.map(t=>t.id),['b']);
});
test('所有跨用户写操作在调用业务逻辑前被拒绝',async()=>{
  let called=0;const api=createOwnerScopedApi({state:fixture(),currentOwner:async()=>a,api:async()=>called++});
  for(const input of [{op:'delete',id:'b'},{op:'toggle',id:'b'},{op:'run',id:'b'},{op:'save',task:{id:'b',owner:a}},{op:'close-event',id:'eb'},{op:'notify-test',eventId:'eb'},{op:'delete'},{op:'run',id:'missing'}])await assert.rejects(api(input),/不属于当前用户/);
  assert.equal(called,0);await api({op:'delete',id:'a'});assert.equal(called,1);
});
test('新任务以可信登录人绑定，伪造owner和姓名无效',async()=>{
  const api=createOwnerScopedApi({state:fixture(),currentOwner:async()=>a,api:async x=>x});
  const saved=await api({op:'save',task:{metric:'任意指标',owner:b,definedBy:'伪造人'}});
  assert.deepEqual(saved.task.owner,a);assert.equal(saved.task.definedBy,a.name);
});
test('账号切换后重新读取身份；list不调用返回全量数据的业务接口',async()=>{
  let owner=a;const api=createOwnerScopedApi({state:fixture(),currentOwner:async()=>owner,api:async()=>{throw Error('不得泄露全量记录')}});
  assert.equal((await api({op:'list',owner:b})).tasks[0].id,'a');owner=b;assert.equal((await api({op:'list'})).tasks[0].id,'b');
});
test('旧任务仅迁移核验清单，既有归属和无设置人记录不被覆盖',()=>{
  const state=fixture();state.tasks.push({id:'unknown'});
  migrateWarningOwners(state,{legacy:a,b:a,unknown:a});
  assert.equal(state.tasks.find(t=>t.id==='legacy').owner.key,a.key);
  assert.equal(state.tasks.find(t=>t.id==='b').owner.key,b.key);
  assert.equal(state.tasks.find(t=>t.id==='unknown').owner,undefined);
});
