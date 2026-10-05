import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['src/page-interaction/client.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { installPageInteraction } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));

function fixture(t, saving, options={}) {
  const globals = ['window', 'document', 'fetch'].map(key => [key, globalThis[key]]);
  const listeners = new Map();
  const effects = [];
  const element = () => ({ isConnected: true, disabled: false, dataset: {}, children: [], namespaceURI: 'svg', style: {}, getClientRects: () => [{}], setAttribute() {}, addEventListener() {}, removeEventListener() {}, append(...items) { this.children.push(...items) }, remove() { this.isConnected = false } });
  globalThis.document = { hidden: false, hasFocus: () => true, createElement: element, createElementNS: element, head: element(), addEventListener() {}, removeEventListener() {} };
  globalThis.window = { addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn) }, removeEventListener: (name, fn) => listeners.get(name)?.delete(fn) };
  const posted = [];
  const frame = { ...element(),src:options.src,srcdoc:'',getAttribute:name=>name==='sandbox'?(options.sandbox??null):null, contentWindow: { postMessage: msg => posted.push(msg) } };
  globalThis.window.location={href:'https://host.example/workbench'};
  const saves=[];
  const drafts = [];
  const owned = { ctx: {}, sessionId: 'owned' };
  let released = false;
  const reference = { sessionId: 'owned', ready: Promise.resolve(owned), get binding() { if (released) throw Error('RELEASED'); return owned }, release() { released = true } };
  const input = { state: { getSnapshot: () => ({ draft: 'Keep my text', draftRev: 7 }) }, notify() {}, insertReference: (ref, span) => { drafts.push({ ref, span }); return true } };
  const ctx = { get: () => undefined, provide() {}, inputTriggers: { registerSource: () => () => {} }, conversation: { input: { for: context => { assert.equal(context, owned.ctx); return input } } }, effect: fn => { const off = fn(); if (typeof off === 'function') effects.push(off) }, inject(names, fn) { if (!names.includes('slots')) fn(this) } };
  globalThis.fetch = (url,init) => {if(url.endsWith('/binding'))return Promise.resolve(Response.json({ generation: 'live' }));saves.push(JSON.parse(init.body));return saving();};
  const api = installPageInteraction(ctx);
  const triggerAnchor = element();
  const offTrigger = api.mountTrigger(triggerAnchor, 'owned');
  const inputActions={captureInsertion:()=>({start:12,end:12,draftRev:7}),insertText:(text,span)=>{drafts.push({text,span});return options.conflict!==true;},persistDraft:()=>drafts.push({persisted:true})};
  const dispose = api.bindFrame(options.quote?{mode:'quote',frame,reference,page:'Original page',inputActions,isCurrentSession:()=>options.current!==false}:{mode:'business',frame,reference,page:'Original page',surface:'gea-workbench',owner:'owned-lease'});
  t.after(() => { dispose(); offTrigger(); effects.reverse().forEach(fn => fn()); for (const [key, value] of globals) globalThis[key] = value });
  return { drafts, posted, saves, frame, reference, dispose, offTrigger, trigger: triggerAnchor.children[0], mountOtherTrigger: () => { const anchor = element(); const off = api.mountTrigger(anchor, 'other'); effects.push(off); return anchor.children[0] }, receive: async (type, details = {}, event = {}) => {
    const channel = posted.at(-1)?.channel;
    for (const fn of listeners.get('message') ?? []) await fn({ source: event.source??frame.contentWindow,origin:event.origin??options.origin, data: { protocol: 'dsh-page-interaction-v1', channel, type, ...details } });
  } };
}

test('explicit frame reference appends through its owned input revision without replacing draft', async t => {
  const f = fixture(t, () => Promise.resolve(Response.json({ id: 'R123456abcdef', label: 'Chosen row' })));
  await new Promise(resolve => setImmediate(resolve));
  await f.receive('selection-state', { active: true });
  await f.receive('reference', { requestId: 'chosen', reference: { label: 'Chosen row', text: '120', targets: [] } });
  assert.equal(f.drafts.length, 1);
  assert.deepEqual(f.drafts[0].span, { start: 12, end: 12, draftRev: 7 });
  assert.equal(f.posted.at(-1).ok, true);
});

for (const cause of ['frame-dispose', 'reference-release', 'trigger-dispose']) test(`late saved evidence is not inserted after ${cause}`, async t => {
  let resolveSave;
  const f = fixture(t, () => new Promise(resolve => { resolveSave = resolve }));
  await new Promise(resolve => setImmediate(resolve));
  await f.receive('selection-state', { active: true });
  const pending = f.receive('reference', { requestId: 'chosen', reference: { label: 'Chosen row', text: '120', targets: [] } });
  await new Promise(resolve => setImmediate(resolve));
  if (cause === 'frame-dispose') f.dispose(); else if (cause === 'reference-release') f.reference.release(); else f.offTrigger();
  resolveSave(Response.json({ id: 'R123456abcdef', label: 'Chosen row' }));
  await pending;
  assert.equal(f.drafts.length, 0);
});

test('the input.left trigger pairs only with its explicitly associated visible frame', async t => {
  const f = fixture(t, () => Promise.resolve(Response.json({ id: 'R123456abcdef', label: 'Chosen row' })));
  const other = f.mountOtherTrigger();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.trigger.disabled, true);
  await f.receive('selection-state', { active: true });
  assert.equal(f.trigger.disabled, false);
  assert.equal(other.disabled, true);
});

test('a URL sandbox frame accepts its opaque-origin picker while preserving channel, generation and owned lease guards',async t=>{
  const f=fixture(t,()=>Promise.resolve(Response.json({id:'R123456abcdef',label:'Chosen row'})),{src:'https://host.example/api/agent-workbench/html?id=inventory-fc',sandbox:'allow-scripts allow-downloads',origin:'null'});
  await new Promise(resolve=>setImmediate(resolve));
  await f.receive('selection-state',{active:true});
  assert.equal(f.trigger.disabled,false);
  await f.receive('reference',{requestId:'chosen',reference:{label:'Chosen row',text:'120',targets:[]}});
  assert.equal(f.drafts.length,1);
  assert.equal(f.saves[0].generation,'live');assert.equal(f.saves[0].owner,'owned-lease');
  await f.receive('reference',{requestId:'wrong-channel',channel:'foreign',reference:{text:'secret',targets:[]}});
  await f.receive('reference',{requestId:'wrong-origin',reference:{text:'secret',targets:[]}},{origin:'https://host.example'});
  await f.receive('reference',{requestId:'wrong-window',reference:{text:'secret',targets:[]}},{source:{}});
  assert.equal(f.drafts.length,1);
});

test('a native URL frame still rejects opaque or foreign origins',async t=>{
  const f=fixture(t,()=>Promise.resolve(Response.json({id:'R123456abcdef',label:'Chosen row'})),{src:'https://host.example/api/gea-proof/workbench',origin:'https://host.example'});
  await new Promise(resolve=>setImmediate(resolve));
  await f.receive('selection-state',{active:true});
  await f.receive('reference',{requestId:'opaque',reference:{text:'secret',targets:[]}},{origin:'null'});
  await f.receive('reference',{requestId:'foreign',reference:{text:'secret',targets:[]}},{origin:'https://foreign.example'});
  assert.equal(f.drafts.length,0);
  await f.receive('reference',{requestId:'native',reference:{text:'trusted',targets:[]}});
  assert.equal(f.drafts.length,1);
});


test('a static picker quote uses only actual inputActions CAS and preserves its Session without GEA or business receipts',async t=>{
 const f=fixture(t,()=>{throw Error('quote cannot call business Host');},{quote:true,sandbox:'allow-scripts',origin:'null'});
 await f.receive('selection-state',{active:true});await f.receive('reference',{requestId:'static-q',reference:{label:'样板行',text:'用户选择的静态文本',targets:[],capturedAt:'2026-10-05'}});
 assert.equal(f.saves.length,0);assert.deepEqual(f.drafts,[{text:'引用：Original page · 样板行\n> 用户选择的静态文本\n',span:{start:12,end:12,draftRev:7}},{persisted:true}]);
 assert.equal(f.posted.at(-1).ok,true);assert.equal(JSON.stringify(f.drafts).includes('dsh-page:'),false,'plain quote is not a fabricated business receipt');
});

test('static quote CAS conflict does not claim persistence or successful insertion',async t=>{
 const f=fixture(t,()=>{throw Error('business Host forbidden');},{quote:true,conflict:true});await f.receive('selection-state',{active:true});await f.receive('reference',{requestId:'conflict',reference:{text:'选择',targets:[]}});
 assert.equal(f.drafts.some(item=>item.persisted),false);assert.equal(f.posted.at(-1).ok,false);
});

test('released or hidden static quote bindings cannot edit another or resident draft',async t=>{
 const f=fixture(t,()=>{throw Error('business Host forbidden');},{quote:true});await f.receive('selection-state',{active:true});f.reference.release();await f.receive('reference',{requestId:'late',reference:{text:'迟到文本',targets:[]}});assert.equal(f.drafts.length,0);
 f.dispose();await f.receive('reference',{requestId:'disposed',reference:{text:'再次迟到',targets:[]}});assert.equal(f.drafts.length,0);
});


test('a static quote from a no-longer-current main Session is refused even while its borrowed reference remains live',async t=>{
 const f=fixture(t,()=>{throw Error('business Host forbidden');},{quote:true,current:false});await f.receive('selection-state',{active:true});await f.receive('reference',{requestId:'cross-session',reference:{text:'旧页面内容',targets:[]}});assert.equal(f.drafts.length,0);assert.equal(f.posted.at(-1).ok,false);
});
