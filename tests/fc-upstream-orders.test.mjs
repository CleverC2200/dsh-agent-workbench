import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('ASN SQL links execution occupations once, excludes closed documents and allocates base stock in FIFO order', () => {
  const result = spawnSync(
    'uv',
    [
      'run',
      '--no-project',
      '--with-requirements',
      'scripts/requirements-sql.txt',
      'python',
      'scripts/test_fc_upstream_orders.py',
    ],
    {
      encoding: 'utf8',
      timeout: 30000,
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran 22 tests/);
});

test('optimized FC order cards preserve canonical FIFO and unknown quantities across warehouse scopes', () => {
  const result = spawnSync(
    'uv',
    [
      'run',
      '--no-project',
      '--with-requirements',
      'scripts/requirements-sql.txt',
      'python',
      'scripts/test_fc_card_reads.py',
    ],
    {
      encoding: 'utf8',
      timeout: 30000,
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran 7 tests/);
});

test('all declared FC sorts preserve null ordering and ten-row pages after SQL compaction', () => {
  const result = spawnSync('python3', ['scripts/test_fc_compact_sort.py'], {
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('incomplete ASN links retain labelled known quantities without inventing zeros', async () => {
  const { build } = await import('esbuild');
  const output = await build({
    stdin: {
      contents: "export {fcCurrentMetric} from './business/shared/fc-current-metrics.ts';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
  });
  const { fcCurrentMetric } = await import(
    'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
  );
  assert.deepEqual(
    fcCurrentMetric([{ demand: 70, known_demand: 70, known_demand_count: 1 }], 'demand'),
    { value: 70, partial: false },
  );
  assert.deepEqual(
    fcCurrentMetric(
      [{ allocated: null, known_allocated: 20, known_allocated_count: 1 }],
      'allocated',
    ),
    { value: 20, partial: true },
  );
  assert.deepEqual(
    fcCurrentMetric(
      [{ shortage: null, known_shortage: null, known_shortage_count: 0 }],
      'shortage',
    ),
    { value: null, partial: true },
  );
  assert.deepEqual(fcCurrentMetric(undefined, 'demand'), { value: null, partial: false });
});
