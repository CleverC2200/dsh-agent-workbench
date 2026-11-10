import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

async function fixture(t, call) {
  const dom = new JSDOM('<p id="pageSyncStatus" hidden></p>');
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  let withdrawn = 0;
  globalThis.orderPublicationFixture = {
    ready: Promise.resolve(),
    call,
    reportElements: () => () => withdrawn++,
  };
  const source = (
    await readFile(
      new URL('../prototypes/inventory-orderworkbench/publication.js', import.meta.url),
      'utf8',
    )
  ).replace(
    "import { ready, call, reportElements } from '../../business/shared/channel.js';",
    'const { ready, call, reportElements } = globalThis.orderPublicationFixture;',
  );
  const module = await import(
    'data:text/javascript;base64,' + Buffer.from(source + `\n// ${t.name}`).toString('base64')
  );
  const update = module.publishReport(
    () => ({ period: { label: '本周' }, metrics: [], events: [], tasks: [] }),
    () => {},
  );
  t.after(() => {
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    dom.window.close();
    Object.assign(globalThis, previous);
    delete globalThis.orderPublicationFixture;
  });
  return {
    window: dom.window,
    status: dom.window.document.getElementById('pageSyncStatus'),
    update,
    withdrawn: () => withdrawn,
  };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

test('identity renewal shows connecting; a confirmed session failure still requires reopening', async (t) => {
  let failure;
  const f = await fixture(t, async () => {
    if (failure) throw failure;
    return { ok: true };
  });
  await tick();
  assert.equal(f.status.hidden, true);
  f.window.dispatchEvent(new f.window.Event('gea-identity-changed'));
  assert.match(f.status.textContent, /正在重新连接订单工作台/);
  assert.doesNotMatch(f.status.textContent, /失效|重新打开/);
  assert.ok(f.withdrawn() > 0);
  f.window.dispatchEvent(new f.window.Event('gea-session-changed'));
  await tick();
  assert.equal(f.status.hidden, true);
  failure = Error('SESSION_EXPIRED');
  f.update();
  await tick();
  assert.match(f.status.textContent, /会话已失效.*重新打开/);
});

test('port renewal cancels old context and ignores its late expired error', async (t) => {
  let rejectOld,
    oldSignal,
    calls = 0;
  const f = await fixture(t, (_method, _value, { signal }) => {
    if (calls++ > 0) return Promise.resolve({ ok: true });
    oldSignal = signal;
    return new Promise((_resolve, reject) => {
      rejectOld = reject;
    });
  });
  await tick();
  f.window.dispatchEvent(new f.window.Event('gea-session-changing'));
  assert.equal(oldSignal.aborted, true);
  rejectOld(Error('SESSION_EXPIRED'));
  await tick();
  assert.match(f.status.textContent, /正在重新连接订单工作台/);
  assert.doesNotMatch(f.status.textContent, /已失效/);
  f.window.dispatchEvent(new f.window.Event('gea-session-changed'));
  await tick();
  assert.equal(f.status.hidden, true);
  assert.equal(calls, 2);
});
