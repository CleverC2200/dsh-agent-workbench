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
  assert.deepEqual([...new Set(calls.map((c) => c.queryId))], ['workbench.amendments']);
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
