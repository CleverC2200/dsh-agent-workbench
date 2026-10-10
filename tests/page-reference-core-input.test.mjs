import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { resolve } from 'node:path';
import { verifyOfficialCore } from '../scripts/verify-official-input.mjs';

const require = createRequire(import.meta.url);
const core = resolve(process.env.DSH_TEST_CORE ?? '../../official-latest-standard');
verifyOfficialCore(core);
const built = await build({
  stdin: {
    contents: `export {installPageInteraction} from './src/page-interaction/client.ts';
      export {SessionInputShell} from ${JSON.stringify(resolve(core, 'packages/client/ui-conversation/src/client/input/facade.ts'))};`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'browser', conditions: ['browser'], format: 'cjs', jsx: 'automatic',
  loader: { '.css': 'text', '.module.css': 'text', '.png': 'dataurl', '.svg': 'dataurl' },
  external: ['react'],
});

function fixture(t, save, { quote = false } = {}) {
  const dom = new JSDOM('<!doctype html><main><iframe></iframe><div id="trigger"></div></main>', {
    url: 'https://host.example/workbench', pretendToBeVisual: true,
  });
  const values = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
    Text: dom.window.Text, MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  };
  const saved = [...Object.keys(values), 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  dom.window.HTMLElement.prototype.getClientRects = () => [{}];
  const module = { exports: {} };
  new Function('module', 'exports', 'require', built.outputFiles[0].text)(module, module.exports, require);
  const { installPageInteraction, SessionInputShell } = module.exports;
  let submissions = 0;
  const shell = new SessionInputShell({
    actx: {},
    defaultSink: async () => { submissions++; return { kind: 'success' }; },
    commandAttachments: { serialize: async () => [], release() {}, unsupportedNotice: () => '' },
  });
  const original = { source: 'page-content', ref: '{"id":"R111111111111","label":"原引用"}', label: '原引用', clipboardText: '[原引用](dsh-page:R111111111111)' };
  shell.setDraft('保留未发送文字 ');
  assert.equal(shell.insertReference(original, { start: 8, end: 8, draftRev: shell.snapshot.draftRev }), true);
  const before = shell.snapshot.draft;
  const persistence = [], timeline = [];
  const write = draft => { persistence.push(draft); timeline.push('writer'); };
  const offPersistence = typeof shell.bindDraftPersistence === 'function'
    ? shell.bindDraftPersistence(write)
    : shell.bindMirror(write);
  if (typeof shell.actions.persistDraft === 'function') {
    const flush = shell.actions.persistDraft;
    shell.actions.persistDraft = () => { timeline.push('flush'); flush(); };
  }
  const reference = { sessionId: 'owned', binding: { ctx: {} } };
  const effects = [];
  const ctx = {
    get: () => undefined, provide() {}, inputTriggers: { registerSource: () => () => {} },
    conversation: { input: { for: actx => { assert.equal(actx, reference.binding.ctx); return shell; } } },
    effect(fn) { const off = fn(); if (typeof off === 'function') effects.push(off); },
    inject(names, fn) { if (!names.includes('slots')) fn(this); },
  };
  globalThis.fetch = (url) => {
    if (url.endsWith('/binding')) return Promise.resolve(Response.json({ generation: 'live' }));
    if (url.endsWith('/api/agent-workbench/page')) return Promise.resolve(Response.json({ allowed: true }));
    assert.equal(url, '/api/page-interaction/reference');
    return save();
  };
  const frame = dom.window.document.querySelector('iframe');
  const posted = [];
  frame.contentWindow.postMessage = value => { posted.push(value); if (value.type === 'result') timeline.push('ack'); };
  const api = installPageInteraction(ctx);
  const offTrigger = api.mountTrigger(dom.window.document.querySelector('#trigger'), 'owned');
  const dispose = api.bindFrame(quote
    ? { mode: 'quote', frame, reference, page: '原页面', inputActions: shell.actions, isCurrentSession: () => true }
    : { mode: 'business', frame, reference, page: '原页面', surface: 'gea-workbench', owner: 'owned-lease', inputActions: shell.actions });
  t.after(() => {
    dispose(); offTrigger(); effects.reverse().forEach(fn => fn()); offPersistence(); shell.dispose(); dom.window.close();
    for (const [key, descriptor] of saved)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  });
  async function ready() {
    await new Promise(resolve => setImmediate(resolve));
    const channel = posted.at(-1).channel;
    const message = (type, details = {}) => dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
      source: frame.contentWindow, data: { protocol: 'dsh-page-interaction-v1', channel, type, ...details },
    }));
    message('selection-state', { active: true });
    return message;
  }
  async function result() {
    for (let i = 0; i < 20 && !posted.some(x => x.type === 'result'); i++)
      await new Promise(resolve => setImmediate(resolve));
    return posted.find(x => x.type === 'result');
  }
  return { shell, before, ready, result, persistence, timeline, submissions: () => submissions };
}

test('actual Core editor preserves existing chip and text while Workbench inserts a second selected reference', async t => {
  const f = fixture(t, async () => Response.json({ id: 'R222222222222', label: '新引用' }));
  const message = await f.ready();
  message('reference', { requestId: 'second', reference: { text: '选中的新内容', label: '新引用', targets: [] } });
  assert.equal((await f.result())?.ok, true);
  assert.equal(f.shell.snapshot.occurrences.length, 2);
  assert.ok(f.shell.snapshot.draft.startsWith(f.before));
  assert.ok(f.shell.snapshot.draft.includes('[新引用](dsh-page:R222222222222)'));
  assert.equal(f.submissions(), 0);
});

test('actual Core editor keeps text edited during save and inserts using the current revision', async t => {
  let complete;
  const f = fixture(t, () => new Promise(resolve => { complete = resolve; }));
  const message = await f.ready();
  message('reference', { requestId: 'late', reference: { text: '选中的新内容', label: '新引用', targets: [] } });
  const span = f.shell.actions.captureInsertion();
  assert.equal(f.shell.actions.insertText('保存中新增文字 ', { ...span, start: span.end }), true);
  const edited = f.shell.snapshot.draft;
  complete(Response.json({ id: 'R222222222222', label: '新引用' }));
  assert.equal((await f.result())?.ok, true);
  assert.equal(f.shell.snapshot.occurrences.length, 2);
  assert.ok(f.shell.snapshot.draft.startsWith(edited));
  assert.equal(f.submissions(), 0);
});

test('static quote reaches the actual Core draft writer before success while preserving resident text and chips', async t => {
  const f = fixture(t, () => { throw Error('Static quotes must not call business transport'); }, { quote: true });
  const message = await f.ready();
  message('quote', { requestId: 'plain-quote', reference: { text: '未发送的问题', label: '分析问题', targets: [] } });
  assert.equal((await f.result())?.ok, true);
  assert.equal(f.shell.snapshot.occurrences.length, 1);
  assert.ok(f.shell.snapshot.draft.includes(f.before));
  assert.ok(f.shell.snapshot.draft.includes('未发送的问题'));
  assert.ok(f.persistence.length > 0);
  const saved = f.persistence.at(-1);
  assert.equal(typeof saved === 'string' ? saved : saved.text, f.shell.snapshot.draft);
  assert.ok(f.timeline.indexOf('writer') < f.timeline.indexOf('ack'), f.timeline.join(','));
  if (typeof f.shell.actions.persistDraft === 'function') {
    assert.ok(f.timeline.indexOf('flush') < f.timeline.indexOf('ack'), 'alpha retains its explicit flush before acknowledgment');
    assert.equal(saved.references.length, 1, 'alpha persists semantic references');
  } else {
    assert.equal(f.timeline.includes('flush'), false, 'rc.2 uses its official automatic draft writer');
  }
  assert.equal(f.submissions(), 0);
  t.diagnostic(JSON.stringify({ core, persistence: typeof saved === 'string' ? 'clipboard-text' : 'semantic-document', timeline: f.timeline }));
});
