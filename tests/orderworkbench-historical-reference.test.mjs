import { model, config } from './orderworkbench-data.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalShippableReference } from '../prototypes/inventory-orderworkbench/historical-shippable-reference.mjs';
import { computeWorkbenchMetrics } from '../prototypes/inventory-orderworkbench/metric-model.mjs';
import {
  workbenchPresentation,
  workbenchEvidence,
} from '../prototypes/inventory-orderworkbench/live-presentation.mjs';
import { metricDetailsRequest } from '../prototypes/inventory-orderworkbench/metric-details.mjs';

function period() {
  const value = {
    start: '2026-10-01',
    end: '2026-10-26',
    sections: [
      {
        id: 'stock',
        status: 'ready',
        rows: [
          {
            base: '郑州',
            sku: 'A',
            item: '水饺',
            category: '食品',
            stock_date: '2026-10-25',
            source_rows: 1,
            inventory: 4745203,
            sales_plan: 9435719.78,
            transfer_plan: 0,
            invalid: 0,
            national_inventory: 4745203,
            national_sales_plan: 9435719.78,
            national_stock_records: 1,
            national_plan_records: 1,
            national_stock_invalid: 0,
            national_plan_invalid: 0,
          },
        ],
      },
    ],
  };
  value.metrics = computeWorkbenchMetrics(value);
  return value;
}
function facts(enabled = true) {
  const month = period(),
    week = { ...period(), start: '2026-10-19' };
  return {
    source: 'gea-governed-sql',
    displayMode: enabled ? 'historical-reconciliation' : 'governed-live',
    complete: true,
    selected: 'week',
    periods: { month, week },
    directors: { rows: [] },
    customers: { rows: [] },
  };
}

test('approved historical card computes 14.9 from retained aggregates and clearly displays live 15.6', () => {
  const f = facts(),
    before = structuredClone(f),
    reference = historicalShippableReference(f.periods.month, true);
  assert.equal(reference.value, 4526627 / (9435719.78 / 31));
  const card = workbenchPresentation(f).cards.find((card) => card.key === '周转天数');
  assert.equal(card.value, '14.9');
  assert.equal(card.status, '严重');
  assert.equal(card.footer, '本周可发货天数 14.9天');
  assert.match(card.footerNote, /受控来源重算值 15.6天/);
  assert.match(card.formula, /非实时计算、非已验证BI原始输入/);
  assert.deepEqual(card.comparison, ['—', '—', '—', '—']);
  assert.deepEqual(f, before, 'display references never rewrite governed source facts');
  assert.equal(f.periods.month.metrics['周转天数'].value, 4745203 / (9435719.78 / 31));
});

test('reference requires opt-in, exact approved report dates and a successful computable source', () => {
  assert.equal(historicalShippableReference(period()), null);
  for (const changed of [
    { ...period(), start: '2026-10-12' },
    { ...period(), end: '2026-11-01' },
    { ...period(), sections: [{ id: 'stock', status: 'error', code: 'FORBIDDEN', rows: [] }] },
    { ...period(), sections: [{ id: 'stock', status: 'loading', rows: [] }] },
    { ...period(), metrics: { 周转天数: { value: null } } },
  ])
    assert.equal(historicalShippableReference(changed, true), null);
  assert.equal(
    workbenchPresentation(facts(false)).cards.find((card) => card.key === '周转天数').value,
    '15.6',
  );
});

test('Agent evidence and detail requests distinguish historical aggregate from live SKU facts', () => {
  const f = facts(),
    evidence = workbenchEvidence(f);
  assert.equal(evidence.displayReferences.month.sourceVerifiedAsBi, false);
  assert.equal(evidence.periods.month.metrics['周转天数'].value, 4745203 / (9435719.78 / 31));
  const request = metricDetailsRequest(f, '周转天数', { label: '2026年10月第四周' });
  assert.match(request.text, /不是已验证BI原始输入/);
  assert.match(request.text, /不得编造或拿实时明细冒充/);
  assert.equal(request.context.metricDetails.historicalReference.inventory, 4526627);
});

test('report loading explicitly enables the approved reference and keeps source facts computable', async () => {
  const values = {
    ...period().sections[0].rows[0],
    available: 4745203,
    aged: null,
    daily_demand: null,
  };
  const row = Object.fromEntries(
    config.queries['workbench.stock'].resultColumns.map((key) => [key, values[key] ?? null]),
  );
  const loaded = await model.loadWorkbenchReport('2026-10-19', '2026-10-26', undefined, {
    base: '',
    now: new Date('2026-10-26T08:00:00Z'),
    execute: async (request, { queryId }) => ({
      configVersion: 'reference-test',
      rows: queryId.endsWith('.count')
        ? [{ total: queryId === 'workbench.stock.count' ? 1 : 0 }]
        : queryId === 'workbench.stock' && request.parameters.gea_p2 === '2026-10-26'
          ? [row]
          : queryId === 'workbench.agedate'
            ? [{ day: null }]
            : [],
    }),
  });
  assert.equal(loaded.displayMode, 'historical-reconciliation');
  assert.equal(loaded.periods.month.metrics['周转天数'].value, 4745203 / (9435719.78 / 31));
  const card = model.workbenchPresentation(loaded).cards.find((card) => card.key === '周转天数');
  assert.equal(card.value, '14.9');
  assert.equal(card.status, '严重');
  const scoped = await model.loadWorkbenchReport('2026-10-19', '2026-10-26', undefined, {
    base: '郑州',
    now: new Date('2026-10-26T08:00:00Z'),
    execute: async (_request, { queryId }) => ({
      configVersion: 'scoped-test',
      rows: queryId.endsWith('.count')
        ? [{ total: 0 }]
        : queryId === 'workbench.agedate'
          ? [{ day: null }]
          : [],
    }),
  });
  assert.equal(
    scoped.displayMode,
    'governed-live',
    'base-scoped access cannot enable a nationwide retained reference',
  );
});
