import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHtmlSessions } from '../src/html-sessions.ts';

test('owned HTML filter reaches the existing page Session guard and returns its correlated receipt', async (t) => {
  const session = 'session-11111111-1111-4111-8111-111111111111';
  const sessions = createHtmlSessions();
  const lease = sessions.open('inventory-customer', session, 'lease');
  t.after(() => sessions.clear());
  sessions.registerAction(lease, 'filter', '客户库存筛选');
  const pending = sessions.invoke('inventory-customer', session, 'filter', { region: '华南事业部' }, new AbortController().signal);
  void pending.catch(() => {});
  const [invocation] = sessions.consume(lease);
  assert.equal(invocation.session, session);
  const listeners = [], sent = [];
  const parent = { postMessage() {} };
  const port = { postMessage(message) { sent.push(message); }, close() {}, start() {} };
  const priorWindow = globalThis.window, priorDocument = globalThis.document;
  globalThis.window = { parent, location: { href: 'http://localhost/' }, addEventListener(name, fn) { if (name === 'message') listeners.push(fn); }, dispatchEvent() {} };
  globalThis.document = { referrer: 'http://localhost/' };
  t.after(() => { globalThis.window = priorWindow; globalThis.document = priorDocument; });
  const source = (await readFile(new URL('../business/shared/channel.js', import.meta.url), 'utf8'))
    .replace("import { sqlQueryError } from './query-error.js';", 'const sqlQueryError = error => error;');
  const channel = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  for (const listener of listeners) listener({ source: parent, origin: 'http://localhost', data: { protocol: 'gea-html-v2', type: 'connect', context: { session, plugin: 'inventory-customer' } }, ports: [port] });
  let region = 'all';
  channel.action('filter', '筛选', args => { region = args.region; return { applied: true }; });
  port.onmessage({ data: { ...invocation, session: 'session-other' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(region, 'all', 'wrong Session is still rejected');
  port.onmessage({ data: invocation });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(region, '华南事业部');
  const receipt = sent.find(message => message.type === 'invoked' && message.id === invocation.id);
  assert.equal(receipt.session, session);
  sessions.reply(lease, receipt);
  assert.deepEqual(await pending, { applied: true });
});
