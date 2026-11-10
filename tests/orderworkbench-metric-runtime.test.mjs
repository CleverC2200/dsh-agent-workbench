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
  assert.deepEqual([...new Set(calls.map((c) => c.queryId))], ['workbench.changes']);
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
  assert.equal(failed.sources[0].code, 'RESOURCE_NOT_IN_DATASET');
});
