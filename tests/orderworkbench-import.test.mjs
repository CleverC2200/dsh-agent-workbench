import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountReportImport } from '../prototypes/inventory-orderworkbench/report-import.mjs';
import {
  projectReportImports,
  importedSummary,
} from '../prototypes/inventory-orderworkbench/import-content.mjs';
const period = { type: 'WEEK', start: '2026-10-19', end: '2026-10-26' };

test('slow preview acknowledges the loading dialog, deduplicates retries, and outlives the action receipt', async (t) => {
  const dom = new JSDOM('<div class="wb-summary-actions"></div>');
  t.after(() => dom.window.close());
  const batch = {
    batchId: 'write-test-20261019',
    period,
    summary: { risk: '联调记录，待核验' },
    unmet: [],
    short: [],
    long: [],
  };
  const gate = Promise.withResolvers();
  let reads = 0,
    writes = 0,
    readSignal;
  const page = mountReportImport({
    document: dom.window.document,
    state: () => ({ ready: true, key: 'week', period, editVersion: 0 }),
    preview: (_batch, signal) => {
      reads++;
      readSignal = signal;
      return gate.promise;
    },
    commit: async () => {
      writes++;
    },
    changed() {},
    ask() {},
  });
  t.after(() => page.dispose());
  const action = {
    kind: 'invoke',
    target: 'report:import-preview',
    action: 'preview',
    value: JSON.stringify(batch),
  };
  const controller = new AbortController();
  await page.apply(action, controller.signal);
  assert.equal(page.context().processing, true);
  assert.equal(page.context().batchId, batch.batchId);
  assert.equal(page.context().canCommit, false);
  assert.match(page.context().status, /正在读取报告/);
  assert.equal(dom.window.document.querySelector('.wb-import-overlay').hidden, false);
  assert.equal(dom.window.document.getElementById('wbImportCommit').disabled, true);
  controller.abort();
  assert.equal(
    readSignal.aborted,
    false,
    'accepted read-only preview belongs to the page, not the completed tool call',
  );
  await page.apply(action);
  assert.equal(reads, 1);
  gate.resolve({ batch, previewId: 'slow-preview', canCommit: true, editVersion: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(page.context().processing, false);
  assert.equal(page.context().awaitingUserConfirmation, true);
  await page.apply(action);
  assert.equal(reads, 1, 'ready same-batch preview is reused');
  assert.equal(writes, 0, 'only the user confirmation button can write');
});

for (const cancel of ['cancel', 'period', 'identity', 'dispose'])
  test(`pending preview is cancelled on ${cancel} and a late result cannot reopen it`, async (t) => {
    const dom = new JSDOM('<div class="wb-summary-actions"></div>');
    t.after(() => dom.window.close());
    const gate = Promise.withResolvers();
    const batch = { period, summary: {}, unmet: [], short: [], long: [] };
    let readSignal,
      writes = 0;
    const page = mountReportImport({
      document: dom.window.document,
      state: () => ({ ready: true, key: 'week', period }),
      preview: (_batch, signal) => {
        readSignal = signal;
        return gate.promise;
      },
      commit: async () => {
        writes++;
      },
      changed() {},
      ask() {},
    });
    t.after(() => page.dispose());
    await page.apply({
      kind: 'invoke',
      target: 'report:import-preview',
      action: 'preview',
      value: JSON.stringify(batch),
    });
    if (cancel === 'cancel') dom.window.document.getElementById('wbImportCancel').click();
    else if (cancel === 'identity')
      dom.window.dispatchEvent(new dom.window.Event('gea-identity-changed'));
    else if (cancel === 'dispose') page.dispose();
    else page.invalidate();
    assert.equal(readSignal.aborted, true);
    gate.resolve({ batch, previewId: 'late', canCommit: true });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(page.context().canCommit, false);
    assert.equal(page.context().processing, false);
    assert.equal(page.context().awaitingUserConfirmation, false);
    assert.equal(writes, 0);
  });

test('backend preview failure is published after acknowledgement without claiming a write', async (t) => {
  const dom = new JSDOM('<div class="wb-summary-actions"></div>');
  t.after(() => dom.window.close());
  const gate = Promise.withResolvers();
  const page = mountReportImport({
    document: dom.window.document,
    state: () => ({ ready: true, key: 'week', period }),
    preview: () => gate.promise,
    commit: async () => assert.fail('preview must not write'),
    changed() {},
    ask() {},
  });
  t.after(() => page.dispose());
  await page.apply({
    kind: 'invoke',
    target: 'report:import-preview',
    action: 'preview',
    value: '{}',
  });
  gate.reject(Error('数据库校验失败'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(page.context().status, /预览失败：数据库校验失败/);
  assert.equal(page.context().processing, false);
  assert.equal(page.context().canCommit, false);
  assert.equal(page.context().previewId, null);
});
test('Agent preview opens dialog; only a user button confirmation writes', async (t) => {
  const dom = new JSDOM('<div class="wb-summary-actions"></div>');
  t.after(() => dom.window.close());
  let writes = 0;
  const state = { ready: true, key: 'week', period, scope: { base: '郑州' } };
  const batch = {
    period,
    summary: { risk: '待核验' },
    unmet: [],
    short: [],
    long: [],
  };
  const page = mountReportImport({
    document: dom.window.document,
    state: () => state,
    preview: async () => ({ batch, previewId: 'preview1', canCommit: true }),
    commit: async () => {
      writes++;
      return { saved: true };
    },
    changed() {},
    ask: async () => {},
  });
  t.after(() => page.dispose());
  dom.window.document.getElementById('wbImportExample').click();
  assert.equal(writes, 0);
  assert.equal(dom.window.document.getElementById('wbImportCommit').disabled, true);
  await page.apply({
    kind: 'invoke',
    target: 'report:import-preview',
    action: 'preview',
    value: JSON.stringify(batch),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(page.context().canCommit, true);
  assert.equal(page.elements().find((row) => row.id === 'report:import-scope').value, '郑州');
  assert.equal(
    page.elements().some((row) => row.id === 'report:import-commit'),
    false,
  );
  assert.equal(page.context().awaitingUserConfirmation, true);
  assert.equal(dom.window.document.querySelector('.wb-import-overlay').hidden, false);
  await assert.rejects(
    page.apply({
      kind: 'invoke',
      target: 'report:import-commit',
      action: 'commit',
      value: 'preview1',
      confirm: false,
    }),
    /弹窗/,
  );
  await assert.rejects(
    page.apply({
      kind: 'invoke',
      target: 'report:import-commit',
      action: 'commit',
      value: 'preview1',
      confirm: true,
    }),
    /弹窗/,
  );
  dom.window.document.getElementById('wbImportCommit').click();
  assert.equal(writes, 0, 'script clicks are not user confirmation');
  dom.window.document.getElementById('wbImportCommit').onclick({ isTrusted: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(writes, 1);
  assert.match(page.context().status, /已写入/);
  dom.window.document.getElementById('wbImportClose').click();
  assert.match(page.context().status, /已保存内容不受影响/);
  assert.equal(writes, 1);
});
test('period change invalidates preview; failed commit is not displayed as saved', async (t) => {
  const dom = new JSDOM('<div class="wb-summary-actions"></div>');
  t.after(() => dom.window.close());
  let key = 'a';
  const batch = {
    period,
    summary: { risk: '待核验' },
    unmet: [],
    short: [],
    long: [],
  };
  const page = mountReportImport({
    document: dom.window.document,
    state: () => ({ ready: true, key, period }),
    preview: async () => ({ batch, previewId: 'p', canCommit: true }),
    commit: async () => {
      throw Error('数据库未确认');
    },
    changed() {},
    ask() {},
  });
  t.after(() => page.dispose());
  await page.apply({
    kind: 'invoke',
    target: 'report:import-preview',
    action: 'preview',
    value: JSON.stringify(batch),
  });
  await new Promise((resolve) => setImmediate(resolve));
  dom.window.document.getElementById('wbImportCommit').onclick({ isTrusted: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(page.context().status, /数据库未确认/);
  key = 'b';
  dom.window.document.getElementById('wbImportCommit').onclick({ isTrusted: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(page.context().status, /周期已切换/);
});
test('latest logical batch renders once and manual edits/deletion win', () => {
  const batch = {
    batchId: 'testbatch',
    summary: { risk: '旧' },
    short: [{ key: 'one', measure: '旧' }],
  };
  const latest = {
    ...batch,
    summary: { risk: '新' },
    short: [{ key: 'one', measure: '新' }],
  };
  const rows = projectReportImports([{ batch }, { batch: latest }]);
  assert.equal(rows.short.length, 1);
  assert.equal(rows.short[0].measure, '新');
  assert.equal(
    projectReportImports([{ batch: latest }], { [rows.short[0].id]: null }).short.length,
    0,
  );
  assert.equal(importedSummary({ risk: '人工' }, rows.summary, { risk: '默认' }).risk, '人工');
});

test('imported summary remains visible as a supplement without replacing manual conclusions', async () => {
  const { summarySupplement } =
    await import('../prototypes/inventory-orderworkbench/import-content.mjs');
  const defaults = {
    positive: '默认正向',
    risk: '默认风险',
    rhythm: '默认节奏',
  };
  const manual = { ...defaults, risk: '人工风险' };
  const imported = { risk: '导入风险', rhythm: '导入节奏' };
  assert.deepEqual(summarySupplement(manual, imported, defaults), {
    risk: '导入风险',
  });
  assert.equal(importedSummary(manual, imported, defaults).risk, '人工风险');
  assert.equal(importedSummary(manual, imported, defaults).rhythm, '导入节奏');
});

test('cancel, close and Escape discard the preview without writes', async (t) => {
  const dom = new JSDOM('<div class="wb-summary-actions"></div>');
  t.after(() => dom.window.close());
  let writes = 0;
  const batch = {
    period,
    summary: { risk: '待核验' },
    unmet: [],
    short: [],
    long: [],
  };
  const page = mountReportImport({
    document: dom.window.document,
    state: () => ({ ready: true, key: 'a', period }),
    preview: async () => ({ batch, previewId: 'p', canCommit: true }),
    commit: async () => {
      writes++;
      return { saved: true };
    },
    changed() {},
    ask() {},
  });
  t.after(() => page.dispose());
  for (const action of ['wbImportCancel', 'wbImportClose', 'Escape']) {
    await page.apply({
      kind: 'invoke',
      target: 'report:import-preview',
      action: 'preview',
      value: JSON.stringify(batch),
    });
    await new Promise((resolve) => setImmediate(resolve));
    if (action === 'Escape')
      dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    else dom.window.document.getElementById(action).click();
    assert.equal(page.context().previewId, null);
    assert.equal(page.context().awaitingUserConfirmation, false);
    assert.equal(dom.window.document.querySelector('.wb-import-overlay').hidden, true);
    dom.window.document.getElementById('wbImportCommit').onclick({ isTrusted: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(writes, 0);
  }
});

test('viewing an example preserves the prepared draft; Agent handoff closes only after successful send', async (t) => {
  const dom = new JSDOM('<div class="wb-summary-actions"></div>');
  t.after(() => dom.window.close());
  const batch = {
    period,
    summary: { risk: '用户真实内容' },
    unmet: [],
    short: [],
    long: [],
  };
  let writes = 0,
    sent = 0,
    fail = true;
  const page = mountReportImport({
    document: dom.window.document,
    state: () => ({ ready: true, key: 'a', period }),
    preview: async () => ({ batch, previewId: 'p', canCommit: true }),
    commit: async () => {
      writes++;
      return { saved: true };
    },
    changed() {},
    ask: async () => {
      sent++;
      if (fail) throw Error('发送连接失败');
    },
  });
  t.after(() => page.dispose());
  const doc = dom.window.document;
  await page.apply({
    kind: 'invoke',
    target: 'report:import-preview',
    action: 'preview',
    value: JSON.stringify(batch),
  });
  await new Promise((resolve) => setImmediate(resolve));
  doc.getElementById('wbImportExample').click();
  assert.equal(page.context().previewId, 'p');
  assert.equal(page.context().awaitingUserConfirmation, false);
  assert.equal(doc.getElementById('wbImportCommit').disabled, true);
  doc.getElementById('wbImportCommit').onclick({ isTrusted: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(writes, 0);
  doc.getElementById('wbImportExample').click();
  assert.match(doc.getElementById('wbImportContent').textContent, /用户真实内容/);
  assert.equal(page.context().awaitingUserConfirmation, true);
  await doc.getElementById('wbImportAsk').onclick();
  assert.match(page.context().status, /发送连接失败/);
  assert.equal(doc.querySelector('.wb-import-overlay').hidden, false);
  fail = false;
  await doc.getElementById('wbImportAsk').onclick();
  assert.equal(sent, 2);
  assert.equal(doc.querySelector('.wb-import-overlay').hidden, true);
  assert.equal(writes, 0);
});
