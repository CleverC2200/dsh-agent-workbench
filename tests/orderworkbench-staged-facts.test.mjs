import test from 'node:test';
import assert from 'node:assert/strict';
import { startWorkbenchStagedRead } from '../prototypes/inventory-orderworkbench/staged-facts.mjs';

test('cold facts stay private until accepted, including completion before report authorization', async () => {
  const published = [];
  const facts = { complete: true };
  const read = startWorkbenchStagedRead(async (_signal, progress) => {
    progress({ complete: false });
    progress(facts);
    return facts;
  }, new AbortController().signal);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(published, []);
  assert.equal(await read.accept((value) => published.push(value)), facts);
  assert.deepEqual(published, [facts]);
});

test('a narrower scope, navigation or identity cancellation cannot publish provisional results', async () => {
  let finish;
  const parent = new AbortController();
  const read = startWorkbenchStagedRead(async (_signal, progress) => {
    await new Promise((resolve) => {
      finish = resolve;
    });
    progress({ complete: true });
  }, parent.signal);
  await new Promise((resolve) => setImmediate(resolve));
  read.cancel();
  finish();
  await assert.rejects(
    read.accept(() => assert.fail('cancelled data published')),
    { name: 'AbortError' },
  );
  const next = startWorkbenchStagedRead(async () => 1, parent.signal);
  parent.abort();
  await assert.rejects(
    next.accept(() => assert.fail('old identity published')),
    { name: 'AbortError' },
  );
});

test('early gateway denial is handled privately and retained as the original failure', async () => {
  const denial = Object.assign(Error('denied'), { code: 'ACCESS_DENIED' });
  const read = startWorkbenchStagedRead(async () => {
    throw denial;
  }, new AbortController().signal);
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    read.accept(() => assert.fail('denial published')),
    (error) => error === denial,
  );
});
