import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { orderWorkbenchSourceConfig } from '../business/inventory-orderworkbench/source-config.mjs';
import { readWithTransientRetry } from '../prototypes/inventory-orderworkbench/query-retry.mjs';
import { metricSnapshot } from '../prototypes/inventory-orderworkbench/metric-components.mjs';
const config = orderWorkbenchSourceConfig(
  JSON.parse(readFileSync('business/inventory-apsplan/sql.config.json')),
);
const built = await build({
  stdin: {
    contents:
      "export {loadWorkbenchReport} from './prototypes/inventory-orderworkbench/report-source.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  define: { ORDER_WORKBENCH_APS_CONFIG: JSON.stringify(config) },
});
const { loadWorkbenchReport } = await import(
  'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
);
const row = (kind) => ({
  kind,
  region: '华中',
  province: '河南',
  numerator: kind === '1' ? 10 : 5,
  denominator: 100,
  records: 10,
  invalid: 0,
  sample_numerator: kind === '1' ? 10 : 5,
  sample_denominator: 100,
  sample_records: 10,
  unknown_quantity: 0,
});
const options = (execute) => ({
  execute,
  sections: ['changes'],
  summary: true,
  metadata: false,
  singlePeriod: { start: '2026-10-01', end: '2026-10-26', kind: 'range' },
});
function response(id, rows) {
  return {
    rows,
    returnedColumns: config.queries[id].resultColumns,
    rejectedColumns: [],
  };
}

test('amendment publishes its numerator and denominator while cancellation is still pending', async () => {
  let paintedOnce = false;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  let painted;
  const early = new Promise((resolve) => (painted = resolve));
  const seen = [];
  const result = loadWorkbenchReport('2026-10-01', '2026-10-26', undefined, {
    ...options(async (_q, { queryId: id }) => {
      seen.push(id);
      if (id.includes('.cancellation')) await gate;
      return response(id, [row(id.endsWith('amendment') ? '2' : '1')]);
    }),
    onProgress: (f) => {
      const p = f.periods.month;
      if (!paintedOnce && p?.metrics['改单率'].value === 5) {
        paintedOnce = true;
        assert.equal(p.metrics['作废率'].loading, true);
        assert.equal(metricSnapshot(p, '改单率').denominator, 100);
        painted();
      }
    },
  });
  await early;
  release();
  const facts = await result;
  assert.equal(facts.periods.month.metrics['作废率'].value, 10);
  assert.equal(facts.periods.month.metrics['改单率'].value, 5);
  assert.equal(seen.filter((x) => x === 'workbench.changes').length, 0);
});

test('permission failure of cancellation leaves amendment usable and never retries the denial', async () => {
  let calls = 0;
  const f = await loadWorkbenchReport(
    '2026-10-01',
    '2026-10-26',
    undefined,
    options(async (_q, { queryId: id }) => {
      if (id.includes('.cancellation')) {
        calls++;
        throw Object.assign(Error('denied'), {
          code: 'DATA_PERMISSION_DENIED',
        });
      }
      return response(id, [row('2')]);
    }),
  );
  const p = f.periods.month;
  assert.equal(p.metrics['改单率'].value, 5);
  assert.equal(metricSnapshot(p, '改单率').numerator, 5);
  assert.equal(p.metrics['作废率'].value, null);
  assert.match(p.metrics['作废率'].missingReason, /DATA_PERMISSION_DENIED/);
  assert.equal(calls, 2);
});

test('independent amendment reads do not run the cancellation query', async () => {
  const calls = [];
  const f = await loadWorkbenchReport('2026-10-01', '2026-10-26', undefined, {
    ...options(async (_q, { queryId: id }) => {
      calls.push(id);
      return response(id, [row('2')]);
    }),
    changeKinds: ['2'],
  });
  assert.equal(f.periods.month.metrics['改单率'].value, 5);
  assert.deepEqual(calls, ['workbench.changes.amendment']);
});

for (const code of ['GEA_SQL_UNAVAILABLE', 'GEA_SQL_QUERY_TIMEOUT'])
  test('retries one transient ' + code, async () => {
    let calls = 0;
    assert.equal(
      await readWithTransientRetry(
        async () => {
          if (++calls === 1) throw Object.assign(Error(code), { code });
          return 7;
        },
        undefined,
        1,
      ),
      7,
    );
    assert.equal(calls, 2);
  });
for (const code of [
  'DATA_PERMISSION_DENIED',
  'RESOURCE_NOT_IN_DATASET',
  'GEA_SQL_RESULT_INCOMPLETE',
  'SESSION_EXPIRED',
])
  test('does not retry ' + code, async () => {
    let calls = 0;
    await assert.rejects(
      readWithTransientRetry(
        async () => {
          calls++;
          throw Object.assign(Error(code), { code });
        },
        undefined,
        1,
      ),
    );
    assert.equal(calls, 1);
  });
test('a second transient failure is final, rather than starting a loop', async () => {
  let calls = 0;
  await assert.rejects(
    readWithTransientRetry(
      async () => {
        calls++;
        throw Object.assign(Error('temporary'), {
          code: 'GEA_SQL_UNAVAILABLE',
        });
      },
      undefined,
      1,
    ),
  );
  assert.equal(calls, 2);
});
test('abort during retry delay prevents another request', async () => {
  let calls = 0;
  const c = new AbortController();
  const p = readWithTransientRetry(
    async () => {
      calls++;
      throw Object.assign(Error('temporary'), { code: 'GEA_SQL_UNAVAILABLE' });
    },
    c.signal,
    10000,
  );
  setTimeout(() => c.abort(), 5);
  await assert.rejects(p);
  assert.equal(calls, 1);
});

test('only a failed cancellation partition retries; the successful partition and amendment stay cached', async () => {
  const calls = [];
  const facts = await loadWorkbenchReport(
    '2026-10-01',
    '2026-10-26',
    undefined,
    options(async (_q, { queryId: id }) => {
      calls.push(id);
      if (id.includes('.partition0') && calls.filter((x) => x === id).length === 1)
        throw Object.assign(Error('temporary'), { code: 'GEA_SQL_UNAVAILABLE' });
      return response(id, [row(id.endsWith('amendment') ? '2' : '1')]);
    }),
  );
  assert.equal(calls.filter((x) => x.includes('.partition0')).length, 2);
  assert.equal(calls.filter((x) => x.includes('.partition1')).length, 1);
  assert.equal(calls.filter((x) => x.endsWith('amendment')).length, 1);
  assert.equal(facts.periods.month.metrics['作废率'].value, 10);
  assert.equal(facts.periods.month.metrics['改单率'].value, 5);
});
