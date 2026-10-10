import { createReferenceStore } from '../src/page-interaction/reference-store.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceDomain } from '../src/page-interaction/reference-domain.ts';
import {
  temporaryReferenceStorage,
  mountReferenceStorage,
  Context,
} from './helpers/reference-storage.mjs';
import {
  pageReference,
  serializeReference,
  projectReferenceText,
} from '@cleverc2200/dsh-agent-workbench/page-interaction/reference';

test('page references keep only the chosen evidence and declared targets', async (t) => {
  const ref = pageReference({
    page: '销售计划',
    label: '客户A · 金额',
    text: '200',
    row: '客户A',
    column: '金额',
    targets: ['row:p'],
    capturedAt: '2026-09-25',
    secret: 'never',
  });
  const { facility } = await temporaryReferenceStorage(t);
  const domain = await facility.open(referenceDomain);
  const store = createReferenceStore(domain.table('references'));
  const receipt = await store.put(
    {
      ...ref,
      sessionId: 'session-test',
      surface: 'page',
      tool: 'gea_workbench_apply',
    },
    'fixture-principal',
  );
  const message = serializeReference(receipt);
  assert.match(message, /dsh-page:R[a-f0-9]{12}/);
  assert.equal(message.includes('200'), false);
  assert.equal(message.includes('row:p'), false);
  assert.equal(store.read('session-other', receipt.id).error, 'REFERENCE_UNAVAILABLE');
  assert.equal(store.read('session-test', receipt.id).text, '200');
  store.dispose();
  assert.equal(store.read('session-test', receipt.id).error, 'REFERENCE_UNAVAILABLE');
  assert.equal(pageReference({ text: '' }), undefined);
});

test('Core JSON sidecar restores the selected content after an actual storage close and reopen', async (t) => {
  const { ctx, root, facility } = await temporaryReferenceStorage(t);
  const domain = await facility.open(referenceDomain);
  const before = createReferenceStore(domain.table('references'));
  const receipt = await before.put(
    {
      sessionId: 'session-cold-reference-fixture',
      surface: 'fixture',
      page: '经销商库存',
      label: '客户A',
      text: '库存 200',
      targets: ['customer:A'],
      capturedAt: 'fixture',
    },
    'production-tenant-user',
  );
  before.dispose();
  await domain.close();
  await ctx.fiber.dispose();
  const coldContext = new Context();
  t.after(() => coldContext.fiber.dispose());
  const coldFacility = await mountReferenceStorage(coldContext, root);
  const coldDomain = await coldFacility.open(referenceDomain);
  const after = createReferenceStore(coldDomain.table('references'));
  assert.equal(after.read('session-cold-reference-fixture', receipt.id).text, '库存 200');
  assert.equal(after.read('session-other', receipt.id).error, 'REFERENCE_UNAVAILABLE');
  assert.deepEqual(after.read('session-cold-reference-fixture', receipt.id).targets, [
    'customer:A',
  ]);
});

test('a failed durable write never emits a reference receipt', async () => {
  const store = createReferenceStore({
    get() {},
    async put() {
      throw Error('WRITE_FAILED');
    },
  });
  await assert.rejects(
    store.put(
      { sessionId: 'session-fixture', surface: 'fixture', text: 'chosen', targets: [] },
      'fixture',
    ),
    /WRITE_FAILED/,
  );
});

test('teardown during a pending durable capture never emits a late receipt', async () => {
  const pending = Promise.withResolvers();
  const store = createReferenceStore({
    get() {},
    put() {
      return pending.promise;
    },
  });
  const capture = store.put(
    { sessionId: 'session-fixture', surface: 'fixture', text: 'chosen', targets: [] },
    'fixture',
  );
  store.dispose();
  pending.resolve();
  await assert.rejects(capture, /引用未保存/);
});

test('large excerpts are visibly marked as truncated, without expanding the page', () => {
  const ref = pageReference({ text: '甲'.repeat(7000), targets: ['row:p'] });
  assert.equal(ref.text.length, 6000);
  assert.equal(ref.truncated, true);
});

test('group references retain every declared target', () => {
  const targets = Array.from({ length: 40 }, (_, index) => `row:${index}`);
  assert.deepEqual(pageReference({ text: '整组计划', targets }).targets, targets);
});

test('sent references project to the same label without leaking the wire ID', () => {
  const receipt = { id: 'R123456abcdef', label: '销售计划 · 表格 · 9 行' };
  assert.deepEqual(projectReferenceText(serializeReference(receipt) + '分析这些'), {
    text: '销售计划 · 表格 · 9 行 分析这些',
    labels: [receipt.label],
    ranges: [{ start: 0, end: receipt.label.length }],
  });
  assert.deepEqual(projectReferenceText('普通消息'), {
    text: '普通消息',
    labels: [],
    ranges: [],
  });
});

test('reference labels round-trip brackets, slashes, percent and Unicode', () => {
  const label = '销售计划 · 客户[直营]/50%';
  assert.equal(
    projectReferenceText(serializeReference({ id: 'R123456abcdef', label })).text,
    label + ' ',
  );
});

test('historical literal receipts remain original text rather than activating a legacy decoder', () => {
  const text = '【引用 R123456abcdef：库存范围】';
  assert.deepEqual(projectReferenceText(text), { text, labels: [], ranges: [] });
});
