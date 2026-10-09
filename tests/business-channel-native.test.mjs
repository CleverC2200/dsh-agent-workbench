import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['business/shared/channel.js'], bundle: true, write: false, format: 'esm', platform: 'browser' });
let instance = 0;
async function fixture(t, referrer, href) {
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const listeners = new Map(), parent = { postMessage() {} };
  globalThis.window = { parent, location: new URL(href), addEventListener: (name, callback) => listeners.set(name, callback), dispatchEvent() {} };
  globalThis.document = { referrer };
  t.after(() => { globalThis.window = previousWindow; globalThis.document = previousDocument; });
  const channel = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text + '\n// instance ' + ++instance).toString('base64'));
  const messages = [];
  const port = { onmessage: null, start() {}, close() {}, postMessage: value => messages.push(value) };
  const connect = (origin, source = parent) => listeners.get('message')({ source, origin, data: { protocol: 'gea-html-v2', type: 'connect', context: { plugin: 'inventory-fc', session: 'owned-session' } }, ports: [port] });
  return { channel, connect, port, messages };
}
for (const referrer of ['', 'dsh-app://app/']) {
  test(`native served page connects without URL exceptions, referrer=${JSON.stringify(referrer)}`, async t => {
    const f = await fixture(t, referrer, 'dsh-app://app/api/agent-workbench/html?id=inventory-fc');
    assert.equal(f.channel.currentSessionId(), undefined);
    assert.doesNotThrow(() => f.connect('dsh-app://app', {}));
    await assert.rejects(f.channel.call('access'), /请先登录并连接/);
    assert.doesNotThrow(() => f.connect('https://other.example'));
    await assert.rejects(f.channel.call('access'), /请先登录并连接/);
    assert.doesNotThrow(() => f.connect('dsh-app://app'));
    assert.equal(f.channel.currentSessionId(), 'owned-session');
    const result = f.channel.call('access');
    const request = f.messages.findLast(value => value.type === 'request');
    assert.equal(request.session, 'owned-session');
    f.port.onmessage({ data: { type: 'response', id: request.id, result: { allowed: true } } });
    assert.deepEqual(await result, { allowed: true });
    f.port.onmessage({ data: { type: 'identity-changed' } });
    assert.equal(f.channel.currentSessionId(), undefined);
  });
}
test('invalid referrer rejects the connect without throwing', async t => {
  const f = await fixture(t, 'not a URL', 'dsh-app://app/api/agent-workbench/html');
  assert.doesNotThrow(() => f.connect('dsh-app://app'));
  await assert.rejects(f.channel.call('access'), /请先登录并连接/);
});
test('originless page URL cannot accept an opaque parent origin', async t => {
  const f = await fixture(t, '', 'data:text/html,fixture');
  assert.doesNotThrow(() => f.connect('null'));
  await assert.rejects(f.channel.call('access'), /请先登录并连接/);
});
