import { model, config } from './orderworkbench-data.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWorkbenchMetrics,
  metricCalculationVersion,
} from '../prototypes/inventory-orderworkbench/metric-model.mjs';
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
            plan_month_offset: 1,
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
    metricCalculationVersion,
    source: 'gea-governed-sql',
    metricCalculationVersion,
    displayMode: enabled ? 'historical-reconciliation' : 'governed-live',
    complete: true,
    selected: 'week',
    periods: { month, week },
    directors: { rows: [] },
    customers: { rows: [] },
  };
}

test('stale historical flags cannot override governed stock calculation or detail evidence', () => {
  const f = facts(),
    before = structuredClone(f);
  let card = workbenchPresentation(f).cards.find((card) => card.key === '周转天数');
  assert.equal(card.value, '15.1');
  assert.equal(card.footer, '本周可发货天数 15.1天');
  assert.equal(card.historicalReference, undefined);
  assert.deepEqual(f, before);
  assert.equal(workbenchEvidence(f).displayReferences, undefined);
  const request = metricDetailsRequest(f, '周转天数', { label: '2026年10月第四周' });
  assert.equal(request.context.metricDetails.historicalReference, undefined);
  assert.doesNotMatch(request.text, /4,526,627|历史对账快照/);
  for (const period of Object.values(f.periods)) {
    period.sections[0].rows[0].national_inventory = 5000000;
    period.metrics = computeWorkbenchMetrics(period);
  }
  card = workbenchPresentation(f).cards.find((card) => card.key === '周转天数');
  assert.equal(card.value, (5000000 / (9435719.78 / 30)).toFixed(1));
});

test('report loading uses governed live facts for national and base scopes', async () => {
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
  assert.equal(loaded.displayMode, 'governed-live');
  assert.equal(loaded.periods.month.metrics['周转天数'].value, 4745203 / (9435719.78 / 30));
  const card = model.workbenchPresentation(loaded).cards.find((card) => card.key === '周转天数');
  assert.equal(card.value, '15.1');
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
