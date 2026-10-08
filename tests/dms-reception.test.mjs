import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const bundle = async contents => {
  const result = await build({stdin:{contents,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
};
const {validHtmlViewState} = await bundle("export {validHtmlViewState} from './src/html-view-state.ts';");
const {validatePageCatalog} = await bundle("export {validatePageCatalog} from './src/page-bridge/catalog.ts';");
const pause = () => new Promise(done=>setTimeout(done,5));
async function until(check) { for(let i=0;i<150;i++){if(check())return;await pause();}assert.ok(check(),'DMS public page settles'); }

test('DMS resources declare mock view and no execution capabilities', async()=>{
  const root='../dsh-agent-manage/business-resources/inventory-dms/';
  const capability=JSON.parse(await readFile(root+'capability.json','utf8'));
  const mcp=JSON.parse(await readFile(root+'mcp.json','utf8'));
  assert.equal(capability.data.mock,true);assert.equal(capability.maxEffect,'view');
  assert.deepEqual(capability.data.tables,[]);assert.deepEqual(mcp.capabilities,[]);
});

test('DMS view restoration accepts selectors and rejects simulated or real business state',()=>{
  assert.equal(validHtmlViewState('inventory-dms',{version:1,type:'JD',order:'Z',outcome:'partial'}),true);
  assert.equal(validHtmlViewState('inventory-dms',{version:1,plan:{status:10}}),false);
  assert.equal(validHtmlViewState('inventory-dms',{version:1,receipts:[],realWriteback:true}),false);
  assert.equal(validHtmlViewState('inventory-dms',{version:1,type:'UNKNOWN'}),false);
});

async function mount(t, options={}) {
  const html=await readFile('lib/prototypes/dms/index.html','utf8');
  const dom=new JSDOM(html,{url:'https://host.example/dms',referrer:'https://host.example/workbench',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const w=dom.window;Object.assign(w,{AbortController,AbortSignal,structuredClone,TextEncoder,TextDecoder});
  const messages=[],requests=[],errors=[],saved=[];let hold=false;const delayed=[];
  w.fetch=()=>{throw Error('DMS must not call HTTP');};
  w.addEventListener('error',e=>errors.push(e.error?.message??e.message));
  w.parent.postMessage=m=>{messages.push(m);if(m.protocol==='dsh-workbench-view-v1'&&m.type==='save')saved.push(structuredClone(m.state));};
  const port={start(){},close(){},onmessage:null,postMessage(m){messages.push(m);if(m.type==='catalog'&&m.elements.length)validatePageCatalog({surface:'gea-html-inventory-dms',tool:'gea_plugin_page_apply',description:'DMS模拟',elements:m.elements});if(m.type==='request'){requests.push(m);const respond=()=>port.onmessage?.({data:{type:'response',id:m.id,result:{accepted:true}}});if(hold)delayed.push(respond);else queueMicrotask(respond);}}};
  const post=data=>w.dispatchEvent(new w.MessageEvent('message',{source:w.parent,origin:'https://host.example',data}));
  for(const script of w.document.querySelectorAll('script'))w.eval(script.textContent);
  const $=id=>w.document.getElementById(id);
  assert.equal($('approve').disabled,true);
  w.dispatchEvent(new w.MessageEvent('message',{source:w.parent,origin:'https://host.example',ports:[port],data:{protocol:'gea-html-v2',type:'connect',context:{session:'session-A',plugin:'inventory-dms'}}}));
  post({protocol:'dsh-workbench-view-v1',type:'restore',page:'inventory-dms',version:1,channel:'view-A',generation:1,state:options.restore??{version:1}});
  await until(()=>$('approve').disabled===false);
  return {w,$,post,port,messages,requests,errors,saved,hold(){hold=true;},release(){hold=false;for(const fn of delayed.splice(0))fn();}};
}

test('compiled PC DMS keeps original M/Z unknown, original-key retry and duplicate-receipt behavior',async t=>{
  const a=await mount(t),{$,requests,messages}=a;
  const choose=v=>{$('outcome').value=v;};
  $('approve').click();choose('failure');$('send').click();assert.equal($('sync').textContent,'FAILED');
  choose('success');$('send').click();assert.equal($('deliveries').textContent,'1');
  const finished=$('finished').textContent;$('duplicate').click();assert.equal($('finished').textContent,finished);
  $('reset').click();$('approve').click();choose('lost-receipt');$('send').click();
  assert.equal($('sync').textContent,'UNKNOWN');assert.equal($('send').disabled,true);
  $('reconcile').click();assert.equal($('sync').textContent,'SYNCED');assert.equal($('attempts').textContent,'1');
  $('order').value='Z';$('order').dispatchEvent(new a.w.Event('change'));$('approve').click();choose('partial');$('send').click();
  const before=JSON.parse($('packets').textContent);assert.deepEqual(before.map(p=>p.items[0].qty),['2.500','1.250']);
  $('reconcile').click();assert.match($('status').textContent,/^5/);assert.equal(JSON.parse($('receipts').textContent).length,1);
  choose('success');$('send').click();assert.equal($('deliveries').textContent,'2');assert.equal($('sync').textContent,'SYNCED');
  assert.deepEqual(JSON.parse($('packets').textContent),before);
  await until(()=>requests.at(-1)?.parameters.syncStatus==='SYNCED');
  const catalog=messages.filter(m=>m.type==='catalog').at(-1).elements;
  for(const e of catalog){assert.ok(a.w.document.querySelector(`[data-page-target="${e.id}"]`),e.id);assert.equal(e.actions,undefined);assert.equal(e.editable,undefined);}
  assert.ok(requests.every(r=>r.method==='context'));assert.ok(requests.every(r=>r.parameters.source==='DMS_MOCK'&&r.parameters.simulated&&r.parameters.realWriteback===false));assert.deepEqual(a.errors,[]);
});

test('DMS selector restore, Session switch, stale publication, release and unload use current public SDK',async t=>{
  const a=await mount(t,{restore:{version:1,type:'JD',order:'Z',outcome:'partial'}}),{$,port,requests,messages}=a;
  assert.equal($('type').value,'JD');assert.equal($('order').value,'Z');assert.equal($('outcome').value,'partial');
  $('approve').click();$('send').click();assert.equal($('sync').textContent,'UNKNOWN');
  a.hold();$('reconcile').click();await until(()=>requests.at(-1)?.parameters.syncStatus==='FAILED');
  port.onmessage({data:{type:'context',context:{session:'session-B',plugin:'inventory-dms'}}});
  a.release();await until(()=>requests.at(-1)?.session==='session-B'&&!$('send').disabled);
  assert.equal($('deliveries').textContent,'1');assert.equal($('sync').textContent,'FAILED');
  assert.ok(messages.some(m=>m.type==='cancel'&&m.session==='session-A'));
  port.onmessage({data:{type:'apply',session:'session-B',toolCallId:'forbidden-write',args:{kind:'invoke',target:'field:dms:status'}}});
  await until(()=>messages.some(m=>m.type==='applied'&&m.toolCallId==='forbidden-write'));
  assert.equal(messages.find(m=>m.toolCallId==='forbidden-write').applied,false);
  a.hold();$('reset').click();await pause();a.w.dispatchEvent(new a.w.Event('pagehide'));a.release();
  await until(()=>messages.filter(m=>m.type==='catalog').at(-1)?.elements.length===0);
  assert.ok(a.saved.every(s=>Object.keys(s).every(k=>['version','type','order','outcome'].includes(k))));assert.deepEqual(a.errors,[]);
});

test('DMS selectors survive the public Workbench presentation restore without restoring simulator authority',async()=>{
  const {WorkbenchController}=await bundle("export {WorkbenchController} from './src/workbench.ts';");
  let saved;const memory={getSnapshot:()=>saved,set:value=>{saved=value;}};
  const owner=new WorkbenchController({panel(){},document(){}},memory);
  const id='inventory-dms',intent={version:1,type:'TM',order:'Z',outcome:'partial'};
  const off=owner.registerFrame({id,kind:'html',src:'/mock-dms',resourceId:'gea-html-inventory-dms'});
  owner.saveHtmlViewState(id,'subject/session-A',intent);
  assert.equal(owner.readHtmlViewState(id,'subject/session-B'),undefined);
  assert.throws(()=>owner.saveHtmlViewState(id,undefined,intent),/HTML_VIEW_SCOPE_REQUIRED/);
  assert.throws(()=>owner.saveHtmlViewState(id,'subject/session-A',{...intent,receipts:[]}),/INVALID_HTML_VIEW_STATE/);
  const restored=new WorkbenchController({panel(){},document(){}},memory);
  restored.registerFrame({id,kind:'html',src:'/mock-dms',resourceId:'gea-html-inventory-dms'});
  assert.deepEqual(restored.readHtmlViewState(id,'subject/session-A'),intent);
  off();assert.equal(owner.readHtmlViewState(id,'subject/session-A'),undefined);
});
