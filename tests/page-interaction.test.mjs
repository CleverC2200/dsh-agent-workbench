import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['src/page-interaction/client.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { installPageInteraction } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));

function fixture(t, saving) {
  const globals = ['window', 'document', 'fetch'].map(key => [key, globalThis[key]]);
  const listeners = new Map();
  const effects = [];
  const element = () => ({ isConnected: true, disabled: false, dataset: {}, children: [], namespaceURI: 'svg', style: {}, getClientRects: () => [{}], setAttribute() {}, addEventListener() {}, removeEventListener() {}, append(...items) { this.children.push(...items) }, remove() { this.isConnected = false } });
  globalThis.document = { hidden: false, hasFocus: () => true, createElement: element, createElementNS: element, head: element(), addEventListener() {}, removeEventListener() {} };
  globalThis.window = { addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn) }, removeEventListener: (name, fn) => listeners.get(name)?.delete(fn) };
  const posted = [];
  const frame = { ...element(), contentWindow: { postMessage: msg => posted.push(msg) } };
  const drafts = [];
  const owned = { ctx: {}, sessionId: 'owned' };
  let released = false;
  const reference = { sessionId: 'owned', ready: Promise.resolve(owned), get binding() { if (released) throw Error('RELEASED'); return owned }, release() { released = true } };
  const input = { state: { getSnapshot: () => ({ draft: 'Keep my text', draftRev: 7 }) }, notify() {}, insertReference: (ref, span) => { drafts.push({ ref, span }); return true } };
  const ctx = { get: () => undefined, provide() {}, inputTriggers: { registerSource: () => () => {} }, conversation: { input: { for: context => { assert.equal(context, owned.ctx); return input } } }, effect: fn => { const off = fn(); if (typeof off === 'function') effects.push(off) }, inject(names, fn) { if (!names.includes('slots')) fn(this) } };
  globalThis.fetch = url => url.endsWith('/binding') ? Promise.resolve(Response.json({ generation: 'live' })) : saving();
  const api = installPageInteraction(ctx);
  const triggerAnchor = element();
  const offTrigger = api.mountTrigger(triggerAnchor, 'owned');
  const dispose = api.bindFrame({ frame, reference, page: 'Original page', surface: 'gea-workbench' });
  t.after(() => { dispose(); offTrigger(); effects.reverse().forEach(fn => fn()); for (const [key, value] of globals) globalThis[key] = value });
  return { drafts, posted, reference, dispose, offTrigger, trigger: triggerAnchor.children[0], mountOtherTrigger: () => { const anchor = element(); const off = api.mountTrigger(anchor, 'other'); effects.push(off); return anchor.children[0] }, receive: async (type, details = {}) => {
    const channel = posted.at(-1)?.channel;
    for (const fn of listeners.get('message') ?? []) await fn({ source: frame.contentWindow, data: { protocol: 'dsh-page-interaction-v1', channel, type, ...details } });
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
