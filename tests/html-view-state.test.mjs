import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['src/workbench.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { WorkbenchController } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
const channelBuild = await build({ entryPoints: ['src/html-view-channel.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { connectHtmlViewState } = await import('data:text/javascript;base64,' + Buffer.from(channelBuild.outputFiles[0].text).toString('base64'));
test('the registered sample keeps only its explicit UI values across Document replacement without a login or Session', async () => {
    const workbench = new WorkbenchController({ panel: () => { }, document: () => { } });
    const off = workbench.registerFrame({ id: 'workbench-html-table', kind: 'html', src: '/sample' });
    await workbench.open('workbench-html-table');
    const value = { version: 1, keyword: '采购计划', stage: '' };
    workbench.saveHtmlViewState('workbench-html-table', undefined, value);
    workbench.leaveDocument();
    await workbench.open('workbench-html-table');
    assert.deepEqual(workbench.readHtmlViewState('workbench-html-table'), value);
    assert.throws(() => workbench.saveHtmlViewState('workbench-html-table', undefined, { ...value, results: [{ total: 42 }] }), /INVALID_HTML_VIEW_STATE/);
    off();
    assert.equal(workbench.readHtmlViewState('workbench-html-table'), undefined);
});
test('one frame generation cannot save after reload, release, or another page/window sends its receipt', async (t) => {
    const old = globalThis.window;
    const listeners = new Set();
    globalThis.window = { addEventListener: (_name, listener) => listeners.add(listener), removeEventListener: (_name, listener) => listeners.delete(listener) };
    t.after(() => { globalThis.window = old; });
    const posted = [], loads = new Set();
    const peer = { postMessage: value => posted.push(value) };
    const frame = { contentWindow: peer, addEventListener: (_name, listener) => loads.add(listener), removeEventListener: (_name, listener) => loads.delete(listener) };
    const owner = new WorkbenchController({ panel: () => { }, document: () => { } });
    owner.registerFrame({ id: 'workbench-html-table', kind: 'html', src: '/sample' });
    await owner.open('workbench-html-table');
    const stop = connectHtmlViewState(frame, 'workbench-html-table', undefined, owner, new AbortController().signal);
    const receive = (data, source = peer) => { for (const listener of listeners)
        listener({ source, data: { protocol: 'dsh-workbench-view-v1', page: 'workbench-html-table', version: 1, ...data } }); };
    receive({ type: 'ready' });
    const first = posted.at(-1);
    const value = { version: 1, keyword: '正确来源', stage: '' };
    receive({ type: 'save', channel: first.channel, generation: first.generation, state: value }, {});
    assert.equal(owner.readHtmlViewState('workbench-html-table'), undefined);
    receive({ type: 'save', channel: first.channel, generation: first.generation, state: value });
    assert.deepEqual(owner.readHtmlViewState('workbench-html-table'), value);
    for (const load of loads)
        load();
    receive({ type: 'save', channel: first.channel, generation: first.generation, state: { ...value, keyword: '旧代际' } });
    assert.deepEqual(owner.readHtmlViewState('workbench-html-table'), value);
    stop();
    receive({ type: 'save', channel: first.channel, generation: first.generation + 1, state: { ...value, keyword: '已释放' } });
    assert.deepEqual(owner.readHtmlViewState('workbench-html-table'), value);
});
test('FC UI records stay partitioned by the real identity and Session address and reject service/authority fields', async () => {
    const workbench = new WorkbenchController({ panel: () => { }, document: () => { } });
    workbench.registerFrame({ id: 'inventory-fc', kind: 'html', src: '/fc', resourceId: 'inventory-fc' });
    const state = { version: 1, filters: [{ key: 'branch-inventory:v1:filters:account:session:warehouse', value: { search: '原材料', businessOnly: true, urgentOnly: false, riskOnly: false, ageFilters: [], orderStatusV2: '全部' } }], drafts: [], plans: [], cycles: [], preferences: [] };
    workbench.saveHtmlViewState('inventory-fc', 'actual-account-scope/actual-session', state);
    assert.equal(workbench.readHtmlViewState('inventory-fc', 'next-account-scope/actual-session'), undefined);
    assert.equal(workbench.readHtmlViewState('inventory-fc', 'actual-account-scope/another-session'), undefined);
    assert.throws(() => workbench.saveHtmlViewState('inventory-fc', undefined, state), /SCOPE_REQUIRED/);
    assert.throws(() => workbench.saveHtmlViewState('inventory-fc', 'actual-account-scope/actual-session', { ...state, grant: { allowed: true } }), /INVALID_HTML_VIEW_STATE/);
    assert.deepEqual(workbench.readHtmlViewState('inventory-fc', 'actual-account-scope/actual-session'), state);
});

test('received mock pages keep only authored UI intent under their actual Session address', async () => {
  const owner = new WorkbenchController({ panel() {}, document() {} });
  const states = {
    'inventory-customer': {version:1, search:'佳特', page:2},
    'inventory-orderworkbench': {version:1,mode:'week',month:'2026-09',week:'2026-08-31',event:'focus',task:'all'},
    'inventory-orderfulfillment': {version:1,customer:'10010126',page:1,size:10}
  };
  for (const [id,state] of Object.entries(states)) {
    owner.registerFrame({id,kind:'html',src:'/mock',resourceId:'gea-html-'+id});
    owner.saveHtmlViewState(id,'subject/session-A',state);
    assert.equal(owner.readHtmlViewState(id,'subject/session-B'),undefined);
    assert.deepEqual(owner.readHtmlViewState(id,'subject/session-A'),state);
    assert.throws(()=>owner.saveHtmlViewState(id,undefined,state),/HTML_VIEW_SCOPE_REQUIRED/);
    assert.throws(()=>owner.saveHtmlViewState(id,'subject/session-A',{...state,rows:[{secret:'derived'}]}),/INVALID_HTML_VIEW_STATE/);
  }
});
test('the received category page partitions its UI intent by the owned Session', () => {
 const owner=new WorkbenchController({panel(){},document(){}});
 owner.registerFrame({id:'plan-region-category',kind:'html',src:'/category',resourceId:'gea-html-category-plan'});
 const state={version:1,category:'mianmo',draft:'未发送的品类说明'};
 owner.saveHtmlViewState('plan-region-category','subject/session-A',state);
 assert.equal(owner.readHtmlViewState('plan-region-category','subject/session-B'),undefined);
 assert.throws(()=>owner.saveHtmlViewState('plan-region-category',undefined,state),/HTML_VIEW_SCOPE_REQUIRED/);
 assert.deepEqual(owner.readHtmlViewState('plan-region-category','subject/session-A'),state);
});
