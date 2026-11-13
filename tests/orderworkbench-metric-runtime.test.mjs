import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { orderWorkbenchSourceConfig } from '../business/inventory-orderworkbench/source-config.mjs';
import {
  readOrderMetric,
  metricCalculationVersion,
} from '../lib/business/inventory-orderworkbench/metric-runtime.mjs';
const root = 'lib/business/inventory-orderworkbench/';
const config = JSON.parse(await readFile(root + 'sql.config.json', 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
test('cancellation groups remain within the gateway parser nesting boundary', () => {
  for (const suffix of ['groups', 'dimensions', 'dimensions.packets']) {
    const sql = config.queries['workbench.changes.cancellation.' + suffix].request.sql;
    let depth = 0,
      peak = 0,
      quoted = false;
    for (let index = 0; index < sql.length; index++) {
      if (sql[index] === "'") {
        if (quoted && sql[index + 1] === "'") index++;
        else quoted = !quoted;
      } else if (!quoted && sql[index] === '(') peak = Math.max(peak, ++depth);
      else if (!quoted && sql[index] === ')') depth--;
    }
    assert.equal(depth, 0);
    assert.equal(quoted, false);
    assert.ok(peak <= 10, suffix + ' exceeded JSqlParser fallback depth');
    assert.match(sql, /cancellation_lines AS/);
    assert.match(sql, /FROM cancellation_lines s/);
  }
});

test('stock SKU pagination applies outside the complete stock and plan union', () => {
  const sql = config.queries['workbench.stock'].request.sql;
  assert.match(sql, /^SELECT base,sku,category,item/);
  assert.match(sql, /UNION ALL/);
  assert.match(sql, /\) stock_scope ORDER BY base,sku LIMIT :gea_p1001 OFFSET :gea_p1002$/);
});
test('unsupported inventory customer dimensions are explicit without querying or changing scope', async () => {
  let calls = 0;
  const result = await readOrderMetric(
    config,
    {
      metric: '货龄占比',
      start: '2026-11-01',
      endExclusive: '2026-11-13',
      base: '郑州',
      view: 'groups',
      dimensions: ['customer'],
    },
    async () => {
      calls++;
      throw Error('must not query');
    },
  );
  assert.equal(calls, 0);
  assert.equal(result.groups.availability, 'unsupported-dimension');
  assert.equal(result.current, null);
  assert.equal(result.groups.unsupported[0].dimension, 'customer');
  await assert.rejects(
    () =>
      readOrderMetric(
        config,
        {
          metric: '满足率',
          start: '2026-11-01',
          endExclusive: '2026-11-13',
          view: 'summary',
          dimensions: ['item'],
        },
        async () => {
          calls++;
        },
      ),
    /DIMENSIONS_REQUIRE_GROUPS/,
  );
  assert.equal(calls, 0);
});
test('customer groups paginate display rows while retaining full totals', async () => {
  const rows = Array.from({ length: 150 }, (_, index) => ({
    base: '郑州',
    category: '速冻',
    item: '水饺',
    sku: null,
    name: '商品',
    customer: 'C' + String(index).padStart(3, '0'),
    region: '大区',
    province: '省区',
    demand: 10,
    shortage: 1,
    sample_demand: 10,
    sample_shortage: 1,
    sample_records: 1,
    records: 1,
    invalid: 0,
    missing_ship_date: 0,
    unmatched_order: 0,
    missing_trace: 0,
    missing_ship_time: 0,
    director: null,
    names: 0,
    summary: 1,
  }));
  const execute = async () => ({ configVersion: 'pagination-test', rows });
  const input = {
    metric: '满足率',
    start: '2026-11-01',
    endExclusive: '2026-11-13',
    base: '郑州',
    view: 'groups',
    dimensions: ['customer'],
  };
  const first = await readOrderMetric(config, input, execute);
  const second = await readOrderMetric(config, { ...input, page: 2 }, execute);
  const beyond = await readOrderMetric(config, { ...input, page: 3 }, execute);
  assert.equal(first.groups.rows.length, 100);
  assert.equal(second.groups.rows.length, 50);
  assert.equal(first.groups.pagination.totalGroups, 150);
  assert.equal(first.groups.pagination.hasMore, true);
  assert.equal(second.groups.pagination.hasMore, false);
  assert.equal(first.groups.total.denominator, 1500);
  assert.equal(second.groups.total.denominator, 1500);
  assert.equal(first.groups.reconciliation.matches, true);
  assert.equal(first.groups.rows[99].customer, 'C099');
  assert.equal(second.groups.rows[0].customer, 'C100');
  assert.equal(beyond.groups.rows.length, 0);
  assert.equal(beyond.groups.empty, false);
  assert.equal(beyond.groups.pagination.outOfRange, true);
});
test('future groups without completed dates are empty rather than falsely unpublished', async () => {
  let calls = 0;
  const result = await readOrderMetric(
    config,
    { metric: '满足率', start: '2026-12-01', endExclusive: '2026-12-03', view: 'groups' },
    async () => {
      calls++;
      throw Error('must not query');
    },
    undefined,
    { now: new Date('2026-11-13T04:00:00Z') },
  );
  assert.equal(calls, 0);
  assert.equal(result.groups.availability, 'available');
  assert.equal(result.groups.empty, true);
  assert.equal(result.groups.emptyReason, 'NO_COMPLETED_DATES');
});

test('grouped amendment dispatches published groups with explicit scope and preserves components', async () => {
  const calls = [];
  const result = await readOrderMetric(
    config,
    {
      metric: '改单率',
      start: '2026-10-19',
      endExclusive: '2026-10-26',
      base: '郑州',
      view: 'groups',
    },
    async (_request, options) => {
      calls.push(options);
      return {
        configVersion: 'grouped-test',
        rows: [
          {
            base: '郑州',
            item: '水饺',
            kind: '2',
            region: '大区',
            province: '省区',
            numerator: 10,
            denominator: 100,
            records: 1,
            invalid: 0,
            sample_numerator: 10,
            sample_denominator: 100,
            sample_records: 1,
            unknown_quantity: 0,
          },
        ],
      };
    },
  );
  assert.equal(result.groups.availability, 'available');
  assert.equal(result.groups.rows[0].item, '水饺');
  assert.equal(result.groups.rows[0].current.numerator, 10);
  assert.equal(result.groups.rows[0].current.denominator, 100);
  assert.equal(result.groups.reconciliation.matches, true);
  assert(calls.every((call) => call.queryId === 'workbench.changes.amendment.groups'));
  assert(
    calls.every(
      (call) => call.values.report_base === '郑州' && call.values.owner_start === '2026-10-19',
    ),
  );
});
test('built page and independent evaluator carry the automatic fingerprint of their actual code and SQL', async () => {
  const scan = await build({
    entryPoints: ['prototypes/inventory-orderworkbench/metric-runtime.mjs'],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    absWorkingDir: resolve('.'),
    define: { ORDER_WORKBENCH_METRIC_VERSION: '0' },
  });
  const inputs = await Promise.all(
    Object.keys(scan.metafile.inputs)
      .sort()
      .map(async (p) => [p, hash(await readFile(p))]),
  );
  assert.ok(inputs.some(([p]) => p.endsWith('performance-rules.mjs')));
  assert.ok(inputs.some(([p]) => p.endsWith('metric-model.mjs')));
  assert.ok(inputs.every(([p]) => !p.includes('SKILL.md')));
  const queries = orderWorkbenchSourceConfig(
    JSON.parse(await readFile('business/inventory-apsplan/sql.config.json', 'utf8')),
  );
  const revision = hash(JSON.stringify({ queries, inputs }));
  assert.equal(config.metricRuntime.revision, revision);
  assert.equal(metricCalculationVersion, Number.parseInt(revision.slice(0, 12), 16));
  assert.equal(hash(await readFile(root + 'metric-runtime.mjs')), config.metricRuntime.sha256);
  assert.ok((await readFile(root + 'index.html', 'utf8')).includes(revision));
});
test('single-period independent query preserves the explicit dates, quantity grain and source failures', async () => {
  const calls = [];
  const result = await readOrderMetric(
    config,
    { metric: '改单率', start: '2026-10-19', endExclusive: '2026-10-26' },
    async (_request, options) => {
      calls.push(options);
      return {
        configVersion: 'fixed',
        rows: [
          {
            kind: '2',
            region: '全国',
            province: '省区',
            numerator: 10,
            denominator: 100,
            records: 1,
            invalid: 0,
            sample_numerator: 10,
            sample_denominator: 100,
            sample_records: 1,
            unknown_quantity: 0,
          },
        ],
      };
    },
    undefined,
    { now: new Date('2026-11-10T00:00:00Z') },
  );
  assert.equal(result.current.numerator, 10);
  assert.equal(result.current.denominator, 100);
  assert.equal(result.current.value, 10);
  assert.equal(result.current.quantityUnit, '商品数量');
  assert.equal(result.contract.lockPeriod, false);
  assert.deepEqual([...new Set(calls.map((c) => c.queryId))], ['workbench.changes.amendment']);
  assert.ok(
    calls.every((c) => c.values.start === '2026-10-19' && c.values.end_exclusive === '2026-10-26'),
  );
  assert.equal(result.period.start, '2026-10-19');
  await assert.rejects(
    () =>
      readOrderMetric(
        config,
        {
          metric: '改单率',
          start: '2026-10-19',
          endExclusive: '2026-10-26',
          expectedVersion: metricCalculationVersion - 1,
        },
        () => assert.fail('stale query executed'),
      ),
    /VERSION_STALE/,
  );
  const failed = await readOrderMetric(
    config,
    { metric: '准交率', start: '2026-10-19', endExclusive: '2026-10-26' },
    () => {
      throw Object.assign(Error('denied'), { code: 'RESOURCE_NOT_IN_DATASET' });
    },
  );
  assert.equal(failed.current.value, null);
  assert.equal(failed.current.status, '查询失败');
  assert.equal(failed.current.numerator, null);
  assert.equal(failed.current.denominator, null);
  assert.equal(failed.current.pending, null);
  assert.equal(failed.sources[0].code, 'RESOURCE_NOT_IN_DATASET');
});

test('independent questions preserve base and exact month or day parameters for every card metric', async () => {
  for (const base of ['郑州', '华东', ''])
    for (const start of ['2026-10-01', '2026-10-31'])
      for (const metric of ['作废率', '改单率', '订单满足率', '准交率', '货龄占比', '周转天数']) {
        const calls = [];
        const result = await readOrderMetric(
          config,
          { metric, start, endExclusive: '2026-11-01', base },
          async (_request, options) => {
            calls.push(options);
            return {
              configVersion: 'exact-scope',
              rows: options.queryId.endsWith('.count')
                ? [{ total: 0 }]
                : options.queryId === 'workbench.agedate'
                  ? [{ day: null }]
                  : [],
            };
          },
          undefined,
          { now: new Date('2026-11-10T00:00:00Z') },
        );
        assert.equal(result.base, base);
        assert.equal(result.period.start, start);
        assert.equal(result.period.endExclusive, '2026-11-01');
        assert(calls.length > 0);
        for (const call of calls) {
          assert.equal(call.values.report_base, base);
          assert.equal(
            call.values.start,
            call.queryId === 'workbench.agedate' ? start.replaceAll('-', '') : start,
          );
          assert.equal(
            call.values.end_exclusive,
            call.queryId === 'workbench.agedate' ? '20261101' : '2026-11-01',
          );
        }
      }
});
