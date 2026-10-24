import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { orderWorkbenchSourceConfig } from '../business/inventory-orderworkbench/source-config.mjs';
import { readFileSync } from 'node:fs';
import { compressForModel } from '../src/page-interaction/shared/payload-budget.ts';

export const config = orderWorkbenchSourceConfig(
  JSON.parse(readFileSync('business/inventory-apsplan/sql.config.json', 'utf8')),
);
const built = await build({
  stdin: {
    contents:
      "export * from './prototypes/inventory-orderworkbench/metric-model.mjs'; export * from './prototypes/inventory-orderworkbench/live-presentation.mjs'; export * from './prototypes/inventory-orderworkbench/report-source.js';",
    resolveDir: resolve('.'),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  define: { ORDER_WORKBENCH_APS_CONFIG: JSON.stringify(config) },
  plugins: [
    {
      name: 'manage',
      setup(api) {
        api.onResolve({ filter: /^dsh-agent-manage\/aps-compute\/metrics$/ }, () => ({
          path: resolve('../dsh-agent-manage/src/aps-compute/metrics.ts'),
        }));
      },
    },
  ],
});
export const model = await import(
  'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
);
export function fixturePeriod() {
  return {
    start: '2026-10-01',
    end: '2026-10-24',
    kind: 'month',
    sections: [
      {
        id: 'orders',
        status: 'ready',
        rows: [
          {
            base: '郑州',
            category: '水饺',
            item: '小水饺',
            sku: 'sku-1',
            demand: 100,
            shortage: 4,
            invalid: 0,
            ontime: 9,
            judged: 10,
            unjudged: 2,
            invalid_judgment: 0,
          },
        ],
      },
      {
        id: 'changes',
        status: 'ready',
        rows: [
          { kind: '1', region: '华中', province: '河南', numerator: 10, denominator: 100 },
          { kind: '2', region: '华中', province: '河南', numerator: -5, denominator: 100 },
        ],
      },
      {
        id: 'stock',
        status: 'ready',
        rows: [
          {
            base: '郑州',
            category: '水饺',
            item: '小水饺',
            sku: 'sku-1',
            stock_date: '2026-10-23',
            available: 200,
            inventory: 300,
            sales_plan: 310,
            transfer_plan: 620,
            source_rows: 1,
            invalid: 0,
          },
        ],
      },
      {
        id: 'ages',
        status: 'ready',
        rows: [
          {
            base: '郑州',
            category: '水饺',
            item: '小水饺',
            sku: 'sku-1',
            stock_qty: 300,
            aged_qty: 30,
            excluded: 4,
            invalid: 0,
          },
        ],
      },
    ],
  };
}

function progressiveSource({ brokenCount = false } = {}) {
  const calls = [];
  const fixture = fixturePeriod();
  const execute = async (_request, { queryId, values }) => {
    calls.push({ queryId, values });
    const name = queryId.slice('workbench.'.length);
    let rows = [];
    if (name === 'agedate')
      rows = [
        {
          day: values.start <= '20261023' && values.end_exclusive > '20261023' ? '20261023' : null,
        },
      ];
    else if (name === 'ages.count') rows = [{ total: brokenCount ? 202 : 201 }];
    else if (name === 'ages')
      rows = Array.from({ length: 201 }, (_, i) => ({
        ...fixture.sections.find((s) => s.id === 'ages').rows[0],
        sku: 'sku-' + (i + 1),
        snapshot_date: '20261023',
        records: 1,
      })).slice(values.offset, values.offset + values.page_size);
    else if (['orders', 'stock', 'changes'].includes(name))
      rows = fixture.sections
        .find((s) => s.id === name)
        .rows.map((row) => ({
          ...Object.fromEntries(config.queries[queryId].resultColumns.map((key) => [key, null])),
          ...row,
          item: values.start === '2026-10-19' ? '周品项' : '月品项',
        }));
    return { rows, configVersion: 'test-v1' };
  };
  return { execute, calls };
}

test('progress publishes complete periods and reuses validated batches without sharing mutable rows or loads', async () => {
  const { execute, calls } = progressiveSource(),
    progress = [];
  const run = () =>
    model.loadWorkbenchReport('2026-10-01', '2026-11-01', new AbortController().signal, {
      execute,
      now: new Date('2026-10-24T00:00:00Z'),
      onProgress: (facts) => progress.push(facts),
    });
  const result = await run();
  assert.equal(progress[0].complete, false);
  assert.deepEqual(Object.keys(progress[0].periods), ['month']);
  assert.equal(progress[0].periods.month.sections.find((s) => s.id === 'ages').rows.length, 201);
  const firstView = model.workbenchPresentation(progress[0]);
  assert.ok(firstView.cards.every((card) => card.comparison.every((value) => value === '加载中')));
  assert.equal(firstView.performance['director-performance'].month.length, 0);
  assert.equal(model.workbenchEvidence(progress[0]).complete, false);
  assert.equal(result.complete, true);
  assert.deepEqual(result.pendingPeriods, []);
  assert.deepEqual(result.pendingSources, []);
  assert.equal(result.periods.month.sections.find((s) => s.id === 'ages').rows[0].item, '月品项');
  assert.equal(result.periods.week.sections.find((s) => s.id === 'ages').rows[0].item, '周品项');
  assert.equal(calls.filter((c) => c.queryId === 'workbench.ages').length, 3);
  assert.equal(calls.filter((c) => c.queryId === 'workbench.ages.count').length, 2);
  await run();
  assert.equal(calls.filter((c) => c.queryId === 'workbench.ages').length, 6);
});

test('failed completeness checks are not cached as good data; cancellation stops progress', async () => {
  const broken = progressiveSource({ brokenCount: true });
  const result = await model.loadWorkbenchReport(
    '2026-10-01',
    '2026-11-01',
    new AbortController().signal,
    {
      execute: broken.execute,
      now: new Date('2026-10-24T00:00:00Z'),
    },
  );
  for (const key of ['month', 'week']) {
    const part = result.periods[key].sections.find((s) => s.id === 'ages');
    assert.equal(part.status, 'error');
    assert.equal(part.code, 'RESULT_INCOMPLETE');
    assert.equal(result.periods[key].metrics['货龄（>60天库存占比）'].value, null);
  }
  assert.equal(
    broken.calls.filter((c) => c.queryId === 'workbench.ages' && c.values.offset === 200).length,
    2,
  );
  const source = progressiveSource(),
    controller = new AbortController();
  let progress = 0;
  await assert.rejects(
    model.loadWorkbenchReport('2026-10-01', '2026-11-01', controller.signal, {
      execute: source.execute,
      now: new Date('2026-10-24T00:00:00Z'),
      onProgress() {
        progress++;
        controller.abort();
      },
    }),
    { name: 'AbortError' },
  );
  assert.equal(progress, 1);
});
test('six metrics use sums, signed change quantities, judged records and calendar-day demand', () => {
  const metrics = model.computeWorkbenchMetrics(fixturePeriod());
  assert.deepEqual(
    Object.values(metrics).map((metric) => metric.value),
    [10, -5, 96, 90, 10, 10],
  );
  assert.match(metrics['准交率'].note, /2条空判定/);
  const period = fixturePeriod();
  period.sections[0].rows.push({
    ...period.sections[0].rows[0],
    demand: 900,
    shortage: 180,
    ontime: 0,
    judged: 0,
    unjudged: 6,
  });
  const combined = model.computeWorkbenchMetrics(period);
  assert.equal(combined['订单满足率'].value, (1 - 184 / 1000) * 100);
  assert.equal(combined['准交率'].value, 90);
});
test('missing, denied, duplicated and invalid data do not turn into zero', () => {
  for (const [id, field, value, name] of [
    ['orders', 'invalid', 1, '订单满足率'],
    ['orders', 'judged', 0, '准交率'],
    ['stock', 'source_rows', 2, '周转天数'],
    ['stock', 'sales_plan', null, '周转天数'],
    ['ages', 'invalid', 1, '货龄（>60天库存占比）'],
  ]) {
    const period = fixturePeriod();
    period.sections.find((section) => section.id === id).rows[0][field] = value;
    assert.equal(model.computeWorkbenchMetrics(period)[name].value, null);
  }
  const period = fixturePeriod();
  period.sections.find((section) => section.id === 'changes').status = 'error';
  assert.equal(model.computeWorkbenchMetrics(period)['作废率'].value, null);
});
test('completed-day comparisons stay within the selected month and equal-length week', () => {
  const periods = model.reportPeriods(
    '2026-10-01',
    '2026-11-01',
    new Date('2026-10-24T12:00:00+08:00'),
  );
  assert.equal(periods.month.end, '2026-10-24');
  assert.equal(periods.month.inventoryEnd, '2026-10-25');
  assert.deepEqual(
    [periods.previousMonth.start, periods.previousMonth.end],
    ['2026-09-01', '2026-09-24'],
  );
  assert.deepEqual([periods.week.start, periods.week.end], ['2026-10-19', '2026-10-24']);
  assert.deepEqual(
    [periods.previousWeek.start, periods.previousWeek.end],
    ['2026-10-12', '2026-10-17'],
  );
});
test('presentation fills both period tables, actual categories and shared directors without adding their rows', () => {
  const period = fixturePeriod();
  period.metrics = model.computeWorkbenchMetrics(period);
  const facts = {
    selected: 'month',
    periods: Object.fromEntries(
      ['month', 'week', 'previousMonth', 'yearMonth', 'previousWeek', 'yearWeek'].map((key) => [
        key,
        period,
      ]),
    ),
    directors: { rows: [{ base: '郑州', sku: 'sku-1', director: '甲,乙', names: 1 }] },
    customers: { rows: [] },
  };
  const presentation = model.workbenchPresentation(facts);
  assert.equal(presentation.cards.length, 6);
  assert.equal(presentation.cards[0].footer, '本周作废率 10.00%');
  assert.equal(presentation.cards[4].footer, '本周货龄占比 10.00%');
  assert.equal(presentation.cards[5].footer, '本周可发货天数 10.0天');
  assert.match(presentation.cards[0].formula, /下单量/);
  const differentWeek = {
    ...period,
    metrics: { ...period.metrics, 作废率: { ...period.metrics['作废率'], value: 3 } },
  };
  const different = model.workbenchPresentation({
    ...facts,
    periods: { ...facts.periods, week: differentWeek },
  });
  assert.equal(different.cards[0].value, '10.00');
  assert.equal(different.cards[0].footer, '本周作废率 3.00%');
  assert.equal(presentation.performance['base-performance'].month[0].length, 11);
  assert.equal(presentation.performance['base-performance'].week[0].length, 10);
  assert.equal(presentation.performance['item-performance'].month[0].length, 11);
  assert.equal(presentation.performance['item-performance'].week[0].length, 8);
  assert.equal(presentation.performance['director-performance'].month.length, 2);
  assert.equal(presentation.dimensions['category-fill'].rows[0][1], '96.00%');
  assert.equal(presentation.skus['水饺'][0].shipDays, '10.00天');
  assert.equal(model.workbenchEvidence(facts).periods.month.sections[0].total, 1);
  const evidence = model.workbenchEvidence(facts);
  const compressed = JSON.parse(
    compressForModel({
      evidence,
      detail: Array.from({ length: 1000 }, () => ({ description: '明细记录'.repeat(100) })),
    }).json,
  );
  for (const [name, metric] of Object.entries(period.metrics))
    assert.equal(compressed.evidence.periods.month.metrics[name].value, metric.value);
  assert.equal(compressed.evidence.periods.month.sourceDates.stock, '2026-10-23');
});
test('configured sources keep formal field rules and safe pagination', () => {
  for (const id of Object.keys(config.queries))
    assert.match(id, /^[a-z][a-z0-9_.-]{0,119}$/);
  assert.ok(config.queries['workbench.agedate']);
  assert.ok(config.queries['workbench.customermanagers']);
  assert.match(config.queries['workbench.changes'].request.sql, /SUM\(COALESCE\(cancel_qty,0\)\)/);
  assert.doesNotMatch(
    config.queries['workbench.orders'].request.sql,
    /exp_flag|DISTINCT.*is_ontime/,
  );
  assert.match(config.queries['workbench.orders'].request.sql, /COUNT\(is_ontime\)/);
  assert.match(
    config.queries['workbench.ages'].request.sql,
    /b.live_qty<>0 AND CAST\(b.prod_date AS DATE\)>/,
  );
  for (const name of ['orders', 'stock', 'changes', 'ages', 'customers', 'directors']) {
    assert.ok(config.queries[config.queries['workbench.' + name].pagination.countQuery]);
    assert.match(
      config.queries['workbench.' + name].request.sql,
      /LIMIT :gea_p1001 OFFSET :gea_p1002$/,
    );
  }
});
test('reader preserves denial and abort instead of falling back', async () => {
  let calls = 0;
  const execute = async () => {
    calls++;
    throw Object.assign(Error('denied'), { code: 'DATA_PERMISSION_DENIED' });
  };
  const facts = await model.loadWorkbenchReport(
    '2026-10-01',
    '2026-11-01',
    new AbortController().signal,
    { execute, now: new Date('2026-10-24T00:00:00Z') },
  );
  assert.ok(calls > 0);
  assert.ok(Object.values(facts.periods.month.metrics).every((metric) => metric.value === null));
  assert.ok(
    facts.periods.month.sections.every((section) => section.code === 'DATA_PERMISSION_DENIED'),
  );
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(
    model.loadWorkbenchReport('2026-10-01', '2026-11-01', stop.signal, { execute }),
    { name: 'AbortError' },
  );
});

test('an invalid SKU does not hide valid item comparisons; detail exposes source values and gaps', () => {
  const current = fixturePeriod(),
    previous = fixturePeriod();
  previous.sections
    .find((section) => section.id === 'stock')
    .rows.push({
      ...previous.sections.find((section) => section.id === 'stock').rows[0],
      sku: 'bad-sku',
      item: '异常品项',
      available: -106,
      invalid: 1,
    });
  current.metrics = model.computeWorkbenchMetrics(current);
  previous.metrics = model.computeWorkbenchMetrics(previous);
  const facts = {
    selected: 'month',
    periods: { month: current, previousMonth: previous, week: current },
    directors: { rows: [] },
    customers: { rows: [] },
  };
  assert.equal(previous.metrics['周转天数'].value, null);
  assert.equal(
    model.computeWorkbenchMetrics(previous, (row) => row.item === '小水饺')['周转天数'].value,
    10,
  );
  const presentation = model.workbenchPresentation(facts);
  const row = presentation.performance['item-performance'].month.find((row) => row[0] === '小水饺');
  assert.equal(row[5], '+0.00天');
  const detail = model.workbenchMetricDetail(facts, '周转天数');
  assert.match(detail, /本月.*10.0天/);
  assert.match(detail, /上月同期.*1条库存或计划记录异常/);
  const absent = { ...previous, sections: [] };
  absent.metrics = model.computeWorkbenchMetrics(absent);
  facts.periods.yearMonth = absent;
  assert.match(model.workbenchMetricDetail(facts, '订单满足率'), /去年同月同期.*该周期无来源数据/);
});
