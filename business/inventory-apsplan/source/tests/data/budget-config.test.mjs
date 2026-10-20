import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from './public-build.mjs';
const config = JSON.parse(
  await readFile(new URL('../../../sql.config.json', import.meta.url), 'utf8'),
);
const calls = [];
let denied = false;
globalThis.document = {
  getElementById: (id) =>
    id === 'agent-sql-direct'
      ? { textContent: JSON.stringify({ path: '/api/agents/apsplan/query', token: 'fixture' }) }
      : null,
};
globalThis.fetch = async (_, options) => {
  const query = JSON.parse(options.body);
  calls.push(query);
  const q = config.queries[query.queryId];
  let result = { rows: [], returnedColumns: q.resultColumns, configVersion: 'fixture-v1' };
  if (query.queryId === 'page.budget-performance')
    result = denied
      ? {
          failure: {
            reasonCode: 'RESOURCE_NOT_IN_DATASET',
            stage: 'BIND',
            message: 'not in APS dataset',
          },
        }
      : {
          ...result,
          rows: [
            Object.fromEntries(
              q.resultColumns.map((key) => [
                key,
                {
                  source_basis: 'MONTHLY_BUDGET_UNTAXED_INCOME',
                  month: query.parameters.start_month,
                  matched_budget: '100',
                  matched_income: '80',
                  matched_keys: '6',
                  budget_keys: '10',
                  income_keys: '8',
                  records: '18',
                  invalid: '2',
                }[key] ?? null,
              ]),
            ),
          ],
        };
  return { ok: true, json: async () => result };
};
const output = await build({
  entryPoints: ['app/data/gea-workspace.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { createGeaWorkspace } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);
const input = {
  date: '2026-10-20',
  granularity: 'month',
  version: '滚动',
  orderType: 'M',
  stage: 'primary',
};
test('budget and income share one aggregate, dynamic date bounds, and no organization lookup', async () => {
  calls.length = 0;
  const workspace = createGeaWorkspace(async () => {
    throw Error('legacy SQL must not be used');
  });
  const current = await workspace(input);
  const comparisons = await workspace({ ...input, comparison: true });
  const budgetCalls = calls.filter((q) => q.queryId === 'page.budget-performance');
  assert.equal(budgetCalls.length, 3);
  assert.deepEqual(
    budgetCalls
      .map((q) => [q.parameters.start_month, q.parameters.as_of, q.parameters.end_exclusive])
      .sort(),
    [
      ['202510', '2025-10-20', '20251021'],
      ['202609', '2026-09-20', '20260921'],
      ['202610', '2026-10-20', '20261021'],
    ],
  );
  for (const data of [current, comparisons.previous, comparisons.annual]) {
    const finance = data.sections.find((s) => s.id === 'finance'),
      budget = data.sections.find((s) => s.id === 'sales-budget');
    assert.equal(data.missingValuePolicy, 'zero');
    assert.equal(finance.status, 'ready');
    assert.equal(budget.status, 'ready');
    assert.equal(finance.rows[0].matched_income, 80);
    assert.deepEqual(finance.rows, budget.rows);
  }
  assert.ok(!calls.some((q) => /sales-org/.test(q.queryId)));
});
test('denied budget is explicit in both sections and not retried for comparisons', async () => {
  calls.length = 0;
  denied = true;
  try {
    const workspace = createGeaWorkspace(async () => {
      throw Error('legacy SQL must not be used');
    });
    const current = await workspace(input);
    const comparisons = await workspace({ ...input, comparison: true });
    for (const data of [current, comparisons.previous, comparisons.annual])
      for (const id of ['finance', 'sales-budget']) {
        const section = data.sections.find((s) => s.id === id);
        assert.equal(section.status, 'error');
        assert.equal(section.error.code, 'RESOURCE_NOT_IN_DATASET');
        assert.deepEqual(section.rows, []);
      }
    assert.equal(calls.filter((q) => q.queryId === 'page.budget-performance').length, 1);
  } finally {
    denied = false;
  }
});

test('unsupported historic monthly accuracy remains unavailable under zero-fill', async () => {
  const workspace = createGeaWorkspace(async () => {
    throw Error('legacy SQL must not be used');
  });
  const data = await workspace({ ...input, date: '2026-09-20', stage: undefined });
  for (const id of ['sales-accuracy', 'demand-accuracy']) {
    assert.equal(data.sections.find((section) => section.id === id).status, 'unavailable');
  }
});
