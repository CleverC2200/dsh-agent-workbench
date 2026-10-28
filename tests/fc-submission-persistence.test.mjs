import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const compiled = await build({
  entryPoints: [
    'business/inventory-fc/source/inventory-light-plugins/src/pages/fc-submission-persistence.ts',
  ],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  plugins: [
    {
      name: 'store',
      setup(b) {
        b.onResolve({ filter: /fc-storage-client$/ }, () => ({
          path: 'store',
          namespace: 'fixture',
        }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents:
            'export const fcPersistence=new Proxy({}, {get:(_t,k)=>(...args)=>globalThis.fcSubmissionFixture[k](...args)});',
        }));
      },
    },
  ],
});
const { persistAndSubmitFc, verifyFcReceiptArchive } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const snapshot = { stage: 'confirmed', aiPreOrderCode: 'AI1' },
  receipt = { aiPreOrderCode: 'AI1', orderCode: 'D1' };
function fixture() {
  let stored = null,
    revision = '0';
  const calls = [];
  return {
    calls,
    pending: () => false,
    load: async () => ({ value: stored, revision }),
    save: async (_scope, _rev, value) => {
      calls.push(value.stage);
      stored = value;
      revision = String(Number(revision) + 1);
      return { status: 'saved', value, revision };
    },
  };
}
test('confirmation is persisted before DMS and an existing receipt never reissues DMS', async () => {
  const f = fixture();
  globalThis.fcSubmissionFixture = f;
  let sends = 0,
    acks = 0;
  const send = async () => {
      f.calls.push('DMS');
      sends++;
      return receipt;
    },
    ack = () => acks++;
  await persistAndSubmitFc('001', snapshot, new AbortController().signal, send, ack);
  await persistAndSubmitFc('001', snapshot, new AbortController().signal, send, ack);
  assert.deepEqual(f.calls, ['confirmed', 'DMS', 'dms-received']);
  assert.equal(sends, 1);
  assert.equal(acks, 2);
});
test('failed confirmation does not call DMS; failure persisting acknowledgement retains acknowledgement', async () => {
  const f = fixture();
  globalThis.fcSubmissionFixture = {
    ...f,
    save: async () => {
      throw Error('unknown write');
    },
  };
  let sends = 0,
    acks = 0;
  await assert.rejects(() =>
    persistAndSubmitFc(
      '001',
      snapshot,
      new AbortController().signal,
      async () => {
        sends++;
        return receipt;
      },
      () => acks++,
    ),
  );
  assert.equal(sends, 0);
  globalThis.fcSubmissionFixture = {
    ...f,
    save: async (s, r, v) => {
      if (v.stage === 'dms-received') throw Error('receipt write unknown');
      return f.save(s, r, v);
    },
  };
  await assert.rejects(() =>
    persistAndSubmitFc(
      '001',
      snapshot,
      new AbortController().signal,
      async () => {
        sends++;
        return receipt;
      },
      () => acks++,
    ),
  );
  assert.equal(sends, 1);
  assert.equal(acks, 1);
});
test('DMS timeout records unknown, later submit refuses to send again', async () => {
  const f = fixture();
  globalThis.fcSubmissionFixture = f;
  let sends = 0;
  const send = async () => {
    sends++;
    throw Error('timeout');
  };
  await assert.rejects(() =>
    persistAndSubmitFc('001', snapshot, new AbortController().signal, send, () => {}),
  );
  await assert.rejects(
    () => persistAndSubmitFc('001', snapshot, new AbortController().signal, send, () => {}),
    /待核对/,
  );
  assert.deepEqual(f.calls, ['confirmed', 'dms-unknown']);
  assert.equal(sends, 1);
});

test('a changed saved configuration prevents DMS submission', async () => {
  const f = fixture();
  globalThis.fcSubmissionFixture = {
    ...f,
    load: async (scope) =>
      scope.kind === 'submission' ? { revision: '0', value: null } : { revision: '9', value: {} },
  };
  let sends = 0;
  await assert.rejects(
    () =>
      persistAndSubmitFc(
        '001',
        { ...snapshot, calculationContext: {}, planRevision: '4', cycleRevision: '0' },
        new AbortController().signal,
        async () => {
          sends++;
          return receipt;
        },
        () => {},
      ),
    /版本已变化/,
  );
  assert.equal(sends, 0);
  assert.equal(f.calls.length, 0);
});

test('BI/default submission cannot bypass an unread saved configuration', async () => {
  const f = fixture();
  globalThis.fcSubmissionFixture = {
    ...f,
    load: async (scope) => ({ revision: scope.kind === 'plans' ? '1' : '0', value: null }),
  };
  await assert.rejects(
    () =>
      persistAndSubmitFc(
        '001',
        { ...snapshot, calculationContext: {}, planRevision: '0', cycleRevision: '0' },
        new AbortController().signal,
        () => {
          throw Error('unexpected DMS');
        },
        () => {},
      ),
    /版本已变化/,
  );
  assert.equal(f.calls.length, 0);
});

test('after historical intent verification, the latest DMS receipt wins', async () => {
  const calls = [];
  globalThis.fcSubmissionFixture = {
    pending: () => true,
    verify: async () => {
      calls.push('verify');
      return { revision: '1', value: snapshot };
    },
    load: async () => {
      calls.push('load');
      return { revision: '2', value: { ...snapshot, stage: 'dms-received', receipt } };
    },
    save: () => {
      throw Error('unexpected write');
    },
  };
  const result = await persistAndSubmitFc(
    '001',
    snapshot,
    new AbortController().signal,
    () => {
      throw Error('unexpected DMS');
    },
    () => calls.push('ack'),
  );
  assert.deepEqual(result, receipt);
  assert.deepEqual(calls, ['verify', 'load', 'ack']);
});

test('two same-month snapshot batches archive separately and replay their own receipt', async () => {
  const records = new Map();
  const events = [];
  globalThis.fcSubmissionFixture = {
    pending: () => false,
    load: async (scope) => records.get(scope.entityId) ?? { value: null, revision: '0' },
    save: async (scope, revision, value) => {
      const result = { value, revision: String(Number(revision) + 1), status: 'saved' };
      records.set(scope.entityId, result);
      events.push([scope.entityId, value.stage]);
      return result;
    },
  };
  let sends = 0;
  const run = (id) =>
    persistAndSubmitFc(
      '001',
      { ...snapshot, aiPreOrderCode: id, month: '2026-10', snapshotVersion: id },
      new AbortController().signal,
      async () => ({
        orderCode: 'D' + ++sends,
        aiPreOrderCode: 'REMOTE-' + id,
        requestAiPreOrderCode: id,
      }),
      () => {},
    );
  const first = await run('A');
  const second = await run('B');
  assert.notEqual(first.orderCode, second.orderCode);
  assert.deepEqual(await run('A'), first);
  assert.deepEqual(await run('B'), second);
  assert.equal(sends, 2);
  assert.deepEqual(events, [
    ['A', 'confirmed'],
    ['A', 'dms-received'],
    ['B', 'confirmed'],
    ['B', 'dms-received'],
  ]);
});

test('legacy month-only pending batches cannot be bypassed by the new identifier', async () => {
  let sends = 0;
  for (const stage of ['confirmed', 'dms-unknown']) {
    globalThis.fcSubmissionFixture = {
      pending: () => false,
      load: async () => ({ revision: '1', value: { ...snapshot, stage } }),
    };
    await assert.rejects(
      () =>
        persistAndSubmitFc(
          '001',
          { ...snapshot, aiPreOrderCode: 'NEW' },
          new AbortController().signal,
          async () => {
            sends++;
          },
          () => {},
          'AI1',
        ),
      /旧补货批次/,
    );
  }
  assert.equal(sends, 0);
});

test('legacy success replays for identical confirmation; changed snapshot can proceed', async () => {
  const legacy = { ...snapshot, snapshotVersion: 'OLD', stage: 'dms-received', receipt };
  const f = fixture();
  globalThis.fcSubmissionFixture = {
    ...f,
    load: async (scope) =>
      scope.entityId === 'AI1' ? { revision: '2', value: legacy } : f.load(scope),
  };
  let sends = 0;
  const send = async () => {
    sends++;
    return { orderCode: 'D2', aiPreOrderCode: 'REMOTE-NEW', requestAiPreOrderCode: 'NEW' };
  };
  assert.deepEqual(
    await persistAndSubmitFc(
      '001',
      { ...snapshot, aiPreOrderCode: 'NEW', snapshotVersion: 'OLD' },
      new AbortController().signal,
      send,
      () => {},
      'AI1',
    ),
    receipt,
  );
  assert.equal(sends, 0);
  assert.equal(
    (
      await persistAndSubmitFc(
        '001',
        { ...snapshot, aiPreOrderCode: 'NEW', snapshotVersion: 'UPDATED' },
        new AbortController().signal,
        send,
        () => {},
        'AI1',
      )
    ).orderCode,
    'D2',
  );
  assert.equal(sends, 1);
});

test('cancelled receipt read cannot acknowledge a result into the next session', async () => {
  const controller = new AbortController();
  let acknowledgements = 0;
  globalThis.fcSubmissionFixture = {
    pending: () => false,
    load: async () => {
      controller.abort();
      return { revision: '2', value: { ...snapshot, stage: 'dms-received', receipt } };
    },
  };
  await assert.rejects(
    () =>
      persistAndSubmitFc(
        '001',
        snapshot,
        controller.signal,
        () => {
          throw Error('unexpected send');
        },
        () => acknowledgements++,
      ),
    /abort/i,
  );
  assert.equal(acknowledgements, 0);
});

test('cancellation after confirmation save cannot start a DMS request', async () => {
  const controller = new AbortController();
  const f = fixture();
  let sends = 0;
  globalThis.fcSubmissionFixture = {
    ...f,
    save: async (...args) => {
      const result = await f.save(...args);
      controller.abort();
      return result;
    },
  };
  await assert.rejects(
    () =>
      persistAndSubmitFc(
        '001',
        snapshot,
        controller.signal,
        async () => {
          sends++;
          return receipt;
        },
        () => {},
      ),
    /abort/i,
  );
  assert.equal(sends, 0);
  assert.deepEqual(f.calls, ['confirmed']);
});

test('receipt archive recovery verifies the old write then reads the current receipt without a new order or write', async () => {
  const calls = [];
  globalThis.fcSubmissionFixture = {
    pending: () => true,
    verify: async () => {
      calls.push('verify');
      return { revision: '2' };
    },
    load: async () => {
      calls.push('load');
      return { revision: '2', value: { ...snapshot, stage: 'dms-received', receipt } };
    },
    save: () => {
      throw Error('unexpected write');
    },
  };
  assert.deepEqual(
    await verifyFcReceiptArchive(
      { kind: 'submission', warehouseCode: '001', entityId: 'AI1' },
      new AbortController().signal,
    ),
    receipt,
  );
  assert.deepEqual(calls, ['verify', 'load']);
});

test('receipt archive recovery cannot treat confirmed, foreign or cancelled reads as completion', async () => {
  const scope = { kind: 'submission', warehouseCode: '001', entityId: 'AI1' };
  for (const value of [
    snapshot,
    { ...snapshot, stage: 'dms-received', receipt: { ...receipt, requestAiPreOrderCode: 'OTHER' } },
  ]) {
    globalThis.fcSubmissionFixture = {
      pending: () => false,
      load: async () => ({ value, revision: '2' }),
    };
    await assert.rejects(
      () => verifyFcReceiptArchive(scope, new AbortController().signal),
      /尚未完成归档/,
    );
  }
  const controller = new AbortController();
  globalThis.fcSubmissionFixture = {
    pending: () => true,
    verify: async () => {
      controller.abort();
    },
    load: () => {
      throw Error('unexpected read');
    },
  };
  await assert.rejects(() => verifyFcReceiptArchive(scope, controller.signal), /abort/i);
});

test('a confirmation that fits alone but cannot fit its receipt stops before saving or sending', async () => {
  const f = fixture();
  globalThis.fcSubmissionFixture = f;
  const large = { ...snapshot, padding: 'x'.repeat(47000) };
  assert.ok(new TextEncoder().encode(JSON.stringify(large)).byteLength < 48000);
  let sends = 0;
  await assert.rejects(
    () =>
      persistAndSubmitFc(
        '001',
        large,
        new AbortController().signal,
        async () => {
          sends++;
          return receipt;
        },
        () => {},
      ),
    /归档空间/,
  );
  assert.equal(sends, 0);
  assert.deepEqual(f.calls, []);
});
