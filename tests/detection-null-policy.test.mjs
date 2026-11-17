import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectionNullPolicy} from '../src/detection-null-policy.mjs';
import {validate} from '../src/detection-backend.mjs';
import {displayRule} from '../src/task-rules.mjs';
const task={id:'null-policy',scope:'品类*基地',description:'偏离目标20%，查询成功但返回空值时，该对象视为正常，继续检测其他对象'};
test('全量38个查询空值不要求伪造区间，保留非实测说明',()=>{
 const results=Array.from({length:38},(_,i)=>({scope:task.scope,objectKey:String(i),objectName:'对象'+i,unit:'天',value:null,dataStatus:'queried-null',status:'健康',period:'2026-11',cutoff:'未提供',evidence:'已完成查询，无后续分页；缺值/零分母，排除重复粒度',rule:{sourceType:'task',taskQuote:task.description,nullPolicy:'healthy'}}));
 const accepted=validate({complete:true,results},task);
 assert.equal(accepted.length,38);
 assert.ok(accepted.every(row=>row.value===null&&/非实测/.test(row.analysis)));
 assert.doesNotMatch(displayRule(accepted[0].rule),/undefined/);
 assert.throws(()=>validate({complete:false,error:'权限拒绝',results},task),/权限拒绝/);
});
test('仅明确授权时生成空值执行合同，保留partial和覆盖检查',()=>{
 assert.match(detectionNullPolicy(task),/全部对象/);
 assert.match(detectionNullPolicy(task),/排除粒度重复/);
 assert.match(detectionNullPolicy(task),/不同版本对象数量不一致/);
 assert.match(detectionNullPolicy({description:'空值不能算正常'}),/未授权/);
});
