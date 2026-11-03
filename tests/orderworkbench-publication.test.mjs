import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

test('report publication coalesces clicks and drops queued snapshots on identity loss or disposal', async (t) => {
  const { window } = new JSDOM('<p id="pageSyncStatus"></p>', { runScripts: 'outside-only' });
  t.after(() => window.close());
  const frames = new Map(), sent = [];
  let nextFrame = 0, snapshots = 0;
  window.setTimeout = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  window.clearTimeout = id => frames.delete(id);
  window.ready = Promise.resolve();
  window.call = async (type, value) => { sent.push(value); };
  window.reportElements = () => () => {};
  window.eval(readFileSync('prototypes/inventory-orderworkbench/publication.js', 'utf8')
    .replace(/^import .*;$/gm, '').replace('export function publishReport', 'window.publishReport = function'));
  const update = window.publishReport(() => {
    snapshots++;
    return { period: { label: '当前周期' }, metrics: [], events: [], tasks: [] };
  }, () => {});
  const flush = async () => {
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(callback => callback());
    await new Promise(resolve => setImmediate(resolve));
  };
  await Promise.resolve();
  for (let i = 0; i < 10; i++) window.document.dispatchEvent(new window.Event('click'));
  assert.equal(snapshots, 0);
  await flush();
  assert.equal(snapshots, 1);
  assert.equal(sent.length, 1);
  update();
  window.dispatchEvent(new window.Event('gea-identity-changed'));
  await flush();
  assert.equal(sent.length, 1);
  window.dispatchEvent(new window.Event('gea-session-changed'));
  await flush();
  assert.equal(sent.length, 2);
  update();
  window.dispatchEvent(new window.Event('pagehide'));
  await flush();
  assert.equal(sent.length, 2);
});
