import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['src/company/quick-questions.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { buildQuickQuestions, quickQuestionSnapshotSchema, quickQuestionMessageSchema } =
  await import(
    'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
  );
const snapshot = {
  agent: 'sales-approval',
  scope: '2026年12月',
  selection: 'list',
  rows: [
    {
      name: '华南',
      facts: {
        progress: { label: '月提报达成', display: '77.3%' },
        plan: { label: '月计划', display: '−¥1,234.50' },
        target: { label: '月度目标', display: '¥743.01万' },
      },
    },
  ],
};

test('questions retain every displayed digit, sign and unit without numeric reformatting', () => {
  const questions = buildQuickQuestions(snapshot);
  assert.equal(questions.length, 4);
  for (const text of ['77.3%', '−¥1,234.50', '¥743.01万'])
    assert.ok(questions.some((q) => q.includes(text)));
  assert.ok(questions.every((q) => q.includes('华南')));
});

test('an unready, empty or unconfigured page has no placeholder questions', () => {
  assert.deepEqual(buildQuickQuestions(null), []);
  assert.deepEqual(buildQuickQuestions({ ...snapshot, rows: [] }), []);
  assert.deepEqual(buildQuickQuestions({ ...snapshot, agent: 'not-configured' }), []);
  assert.deepEqual(buildQuickQuestions({ ...snapshot, rows: [{ name: '华南', facts: {} }] }), []);
});

test('another Agent opts in through configuration with its own display facts', () => {
  const questions = buildQuickQuestions(
    { ...snapshot, agent: 'stock' },
    {
      stock: {
        rules: [
          { field: 'plan', text: '{name}的{label}{value}要调整吗？' },
          { field: 'progress', text: '{name}的{label}{value}合理吗？' },
          { text: '{name}需要复核吗？' },
        ],
      },
    },
  );
  assert.equal(questions.length, 3);
  assert.ok(questions[0].includes('−¥1,234.50'));
});

test('reporting rules use current customer and SKU display values', () => {
  const questions = buildQuickQuestions({
    agent: 'sales-reporting',
    scope: '客户甲／2026年12月',
    selection: 'list',
    rows: [
      {
        name: '客户甲的汤圆',
        facts: {
          quantity: { label: '确认计划量', display: '1,030 件' },
          amount: { label: '提报金额', display: '¥83,000.00' },
          adjustment: { label: '追减', display: '−15 件／−¥1,234.50' },
        },
      },
    ],
  });
  assert.equal(questions.length, 4);
  assert.ok(questions.every((q) => q.includes('客户甲的汤圆')));
  assert.ok(questions.some((q) => q.includes('−15 件／−¥1,234.50')));
});

test('transport parses display text and rejects raw numbers, excessive rows and invalid generations', () => {
  assert.equal(quickQuestionSnapshotSchema.safeParse(snapshot).success, true);
  assert.equal(
    quickQuestionSnapshotSchema.safeParse({
      ...snapshot,
      rows: [{ name: '华南', facts: { plan: { label: '月计划', display: 123 } } }],
    }).success,
    false,
  );
  assert.equal(
    quickQuestionSnapshotSchema.safeParse({ ...snapshot, rows: Array(201).fill(snapshot.rows[0]) })
      .success,
    false,
  );
  assert.equal(
    quickQuestionMessageSchema.safeParse({
      protocol: 'workbench-quick-questions-v1',
      owner: 'owner',
      sessionId: 'session',
      sequence: -1,
      snapshot,
    }).success,
    false,
  );
  assert.equal(
    quickQuestionMessageSchema.parse({
      protocol: 'workbench-quick-questions-v1',
      owner: 'owner',
      sessionId: 'session',
      sequence: 3,
      snapshot: { ...snapshot, rows: 'invalid' },
    }).snapshot,
    null,
  );
});
