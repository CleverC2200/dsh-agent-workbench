import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const pause=()=>new Promise(resolve=>setTimeout(resolve,25));
async function until(check){for(let i=0;i<100;i++){if(check())return;await pause();}assert.ok(check(),'dealer page settles');}

test('the built dealer page opens safely, reports current scope and restores the last SKU page through the public view protocol',async t=>{
  const html=await readFile('lib/business/inventory-dealer/index.html','utf8');
  const dom=new JSDOM(html,{url:'https://host.example/api/agent-workbench/html?id=inventory-dealer',referrer:'https://host.example/',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  Object.assign(dom.window,{AbortController,AbortSignal,structuredClone,TextEncoder,TextDecoder});
  dom.window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
  const external=[],requests=[],errors=[];
  dom.window.fetch=(...args)=>{external.push(args);return Promise.reject(Error('Unexpected HTTP'));};
  dom.window.addEventListener('error',e=>errors.push(e.error));
  dom.window.addEventListener('unhandledrejection',e=>errors.push(e.reason));
  for(const script of dom.window.document.querySelectorAll('script'))dom.window.eval(script.textContent);
  const root=dom.window.document.getElementById('app');
  await until(()=>root.textContent.includes('固定模拟输入')&&root.textContent.includes('12,060'));
  assert.doesNotMatch(root.textContent,/UNDECLARED_DEALER_MOCK_QUERY/);
  const port={start(){},close(){},postMessage(message){requests.push(message);if(message.type==='request')queueMicrotask(()=>port.onmessage?.({data:{type:'response',id:message.id,result:{accepted:true}}}));}};
  const post=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:dom.window.parent,origin:'https://host.example',data}));
  dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:dom.window.parent,origin:'https://host.example',ports:[port],data:{protocol:'gea-html-v2',type:'connect',context:{session:'dealer-session-fixture',plugin:'inventory-dealer'}}}));
  post({protocol:'dsh-workbench-view-v1',type:'restore',page:'inventory-dealer',version:1,channel:'dealer-view-fixture',generation:1,state:{version:1,customer:'customer-A',tab:'sku',page:21,pageSize:10,search:''}});
  await until(()=>root.textContent.includes('sku-A-200'));
  await until(()=>requests.some(m=>m.type==='request'&&m.method==='context'&&m.parameters.parts?.dealer?.page===21));
  const current=requests.filter(m=>m.method==='context').at(-1).parameters;
  assert.equal(current.source,'MOCK');
  assert.equal(current.parts.dealer.recordTotal,201);
  assert.equal(current.parts.dealer.visibleRows.length,1);
  assert.equal(current.parts.dealer.visibleRows[0].code,'sku-A-200');
  assert.equal(current.parts.dealer.health.unreasonable,201);
  assert.deepEqual(requests.filter(m=>m.method==='sql'||m.method==='conversation'),[]);
  assert.deepEqual(external,[]);
  assert.deepEqual(errors,[]);
});
