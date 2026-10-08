import test from 'node:test';import assert from 'node:assert/strict';import {build} from './public-build.mjs';
const out=await build({entryPoints:['app/data/gea-workspace.ts'],bundle:true,platform:'node',format:'esm',write:false});const {createGeaWorkspace,period}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const input={date:'2026-08-31',granularity:'month',version:'滚动',orderType:'M'};
test('governed staged queries retain numeric zero, dimensions, limits and named parameters',async()=>{let active=0,max=0;const workspace=createGeaWorkspace(async(method,{sql,parameters})=>{assert.equal(method,'sql');assert.ok(!sql.includes('%('));for(const p of sql.matchAll(/:gea_p\d+/g))assert.ok(p[0].slice(1) in parameters);max=Math.max(max,++active);await new Promise(r=>setTimeout(r,1));active--;return {rows:[{records:'1',inventory:'0',warehouse:'001',first_day:'20260801'}]}});const r=await workspace({...input,stage:'primary'});assert.equal(r.sections.filter(s=>s.status==='ready').length,4);assert.equal(r.sections.find(s=>s.id==='stock').rows[0].inventory,0);assert.equal(r.sections.find(s=>s.id==='stock').rows[0].warehouse,'001');assert.equal(r.sections.find(s=>s.id==='stock').rows[0].first_day,'20260801');assert.ok(max<=3);assert.ok(r.sections.some(s=>s.status==='loading'));});
test('denied section exposes structured error without fallback data',async()=>{const r=await createGeaWorkspace(async()=>({failure:{reasonCode:'NO_RETURN_COLUMN_ALLOWED',stage:'BIND',message:'denied'}}))({...input,stage:'primary'});assert.ok(r.sections.filter(s=>s.status==='error').every(s=>s.rows.length===0&&s.error.code==='NO_RETURN_COLUMN_ALLOWED'));});
test('permission denial is reused across main and comparison parameter variants',async()=>{
 for(const code of ['RESOURCE_NOT_IN_DATASET','NO_RETURN_COLUMN_ALLOWED','GEA_SQL_PERMISSION_DENIED','AI_GATEWAY_DATA_PERMISSION_DENIED']){
  const calls=new Map();const workspace=createGeaWorkspace(async(_,v)=>{calls.set(v.sql,(calls.get(v.sql)||0)+1);return {failure:{reasonCode:code,message:'denied'}}});
  const main=await workspace(input);const comparison=await workspace({...input,comparison:true});
  for(const result of [main,comparison.previous,comparison.annual])assert.ok(result.sections.every(s=>s.status==='error'&&s.rows.length===0&&s.error.code===code));
  assert.ok([...calls.values()].every(count=>count===1));
 }
});
test('empty data and query failures do not suppress other period requests',async()=>{
 for(const response of [{rows:[]},{failure:{reasonCode:'GEA_SQL_QUERY_FAILED',message:'query failed'}}]){
  const calls=new Map();const workspace=createGeaWorkspace(async(_,v)=>{calls.set(v.sql,(calls.get(v.sql)||0)+1);return response});
  await workspace(input);await workspace({...input,comparison:true});
  assert.equal([...calls.entries()].find(([sql])=>sql.includes('agents_scm_safety_stock'))[1],3);
 }
});
test('month facts stay missing for historical partial month; leap comparisons use same periods',async()=>{let sqls=[];const workspace=createGeaWorkspace(async(_,v)=>{sqls.push(v.sql);return {rows:[]}});const r=await workspace({...input,date:'2026-08-15'});assert.equal(r.sections.find(s=>s.id==='finance').status,'empty');assert.ok(!sqls.some(s=>s.includes('FROM agents_aps_finance')));sqls=[];const c=await workspace({...input,date:'2024-02-29',comparison:true});assert.equal(c.previous.end,'2024-01-29');assert.equal(c.annual.end,'2023-02-28');assert.ok(!sqls.some(sql=>sql.includes('FROM agents_scm_cust_deliv_daily')||sql.includes('FROM agents_sales_forecast_detail_mi')));assert.deepEqual(period('2026-09-22','week'),['2026-09-21','2026-09-22']);});
