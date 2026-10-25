import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportPersistence } from '../prototypes/inventory-orderworkbench/report-persistence.mjs';
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));
test('failed saves keep the same intent for retry and latest edits follow the confirmed revision', async () => {
  const calls = [],
    states = [];
  let reject = true;
  const persistence = createReportPersistence(
    async (request) => {
      calls.push(structuredClone(request));
      if (request.operation === 'load') return { version: 4, report: null };
      if (reject) throw Error('NETWORK');
      return { saved: true, version: request.expectedVersion + 1, requestId: request.requestId };
    },
    (state) => states.push(state),
  );
  await persistence.open(
    { type: 'WEEK', start: '2026-10-12', end: '2026-10-19' },
    new AbortController().signal,
  );
  persistence.save({ text: 'first' });
  await turn();
  assert.equal(persistence.pending(), true);
  assert.equal(states.includes('saved'), false);
  persistence.save({ text: 'second' });
  reject = false;
  persistence.retry();
  await turn();
  assert.deepEqual(calls[1], calls[2]);
  assert.equal(calls[3].expectedVersion, 5);
  assert.deepEqual(calls[3].report, { text: 'second' });
  assert.equal(persistence.pending(), false);
});
test('late saves from the old page cannot publish saved state on a new period', async () => {
  const states = [];
  let release;
  const persistence = createReportPersistence(
    (request) =>
      request.operation === 'load'
        ? Promise.resolve({ version: 0, report: null })
        : new Promise((resolve) => {
            release = () => resolve({ saved: true, version: 1, requestId: request.requestId });
          }),
    (state) => states.push(state),
  );
  await persistence.open({}, new AbortController().signal);
  persistence.save({ text: 'old' });
  persistence.cancel();
  await persistence.open({}, new AbortController().signal);
  release();
  await turn();
  assert.equal(states.at(-1), 'loaded');
});
