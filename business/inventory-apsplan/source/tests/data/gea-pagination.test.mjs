import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from './public-build.mjs';
const bundle=await build({entryPoints:[fileURLToPath(new URL('../../app/data/gea-sql.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {readGovernedSql}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
test('host default 200-row paging returns all 401 rows before calculating metrics',async()=>{
 const calls=[];const all=Array.from({length:401},(_,i)=>({id:i,qty:i}));
 const rows=await readGovernedSql(async(method,input)=>{calls.push(input.pageNo);const page=input.pageNo??1;return {rows:all.slice((page-1)*200,page*200),total:401,returnedColumns:['id','qty']};},'SELECT id AS id, qty AS qty FROM approved ORDER BY id',{});
 assert.deepEqual(rows,all);assert.deepEqual(calls,[1,2,3]);
});
test('a denied later page fails once without returning partial totals',async()=>{
 let calls=0;
 await assert.rejects(()=>readGovernedSql(async()=>{if(++calls===1)return {rows:Array.from({length:200},()=>({qty:1})),total:201};return {success:false,failure:{reasonCode:'RESOURCE_NOT_PUBLISHED',stage:'BIND'}};},'fixed',{}),{code:'RESOURCE_NOT_PUBLISHED'});
 assert.equal(calls,2);
});
test('changed total is rejected without mixing snapshots',async()=>{
 let calls=0;
 await assert.rejects(()=>readGovernedSql(async()=>++calls===1?{rows:Array(200).fill({qty:1}),total:201}:{rows:[{qty:1}],total:202},'fixed',{}),{code:'GEA_PAGINATION_CHANGED'});
});
test('later pages overlap with at most three in flight and retain row order',async()=>{
 let active=0,peak=0;const all=Array.from({length:1001},(_,id)=>({id}));
 const rows=await readGovernedSql(async(_,q)=>{
  peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,q.pageNo===2?12:2));active--;
  return {rows:all.slice((q.pageNo-1)*200,q.pageNo*200),total:all.length,pageNo:q.pageNo};
 },'fixed',{});
 assert.deepEqual(rows,all);assert.equal(peak,3);
});
