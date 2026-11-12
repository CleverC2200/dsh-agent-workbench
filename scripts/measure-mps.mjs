import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import { mpsComputePlugin } from './mps-compute-build.mjs';

let stage = 'input';
try {
  const root = resolve(import.meta.dirname, '..');
  const { values } = parseArgs({
    options: {
      input: { type: 'string' },
      manage: { type: 'string' },
      repetitions: { type: 'string', default: '1' },
      worker: { type: 'boolean' },
      channel: { type: 'string' },
    },
  });
  assert.ok(values.input && values.manage, 'MPS_MEASURE_REQUIRES_INPUT_AND_MANAGE');
  const repetitions = Number(values.repetitions);
  assert.ok(
    Number.isInteger(repetitions) && repetitions > 0 && repetitions <= 20,
    'MPS_MEASURE_INVALID_REPETITIONS',
  );
  const manage = resolve(values.manage);
  const raw = await readFile(resolve(values.input), 'utf8');
  const recorded = JSON.parse(raw);
  const args = Array.isArray(recorded)
    ? recorded
    : [recorded.draft, recorded.relations, recorded.shipment, recorded.evaluation];
  assert.ok(
    args.length === 4 && args[0] && /^\d{4}-(0[1-9]|1[0-2])$/.test(args[0].month),
    'MPS_MEASURE_INVALID_INPUT',
  );
  const [draft, relations, shipment, evaluation] = args;
  const head = (cwd) =>
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  const dirty = (cwd) =>
    Boolean(execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim());
  const count = (rows) => (Array.isArray(rows) ? rows.length : 0);
  const summary = (result) => ({
    workflowRows: count(result.rows),
    planRows: count(result.plan?.rows),
    activeDemandRows: (result.plan?.rows ?? []).filter((row) => row.demand > 0).length,
    constrainedRows: (result.plan?.rows ?? []).filter(
      (row) => row.demand > 0 && row.fulfillment !== null && row.fulfillment < 1,
    ).length,
    evaluatedRows: result.plan?.summary.evaluatedRows ?? 0,
    maxResourceLoad: (result.plan?.resourceSchedules ?? []).reduce(
      (max, row) => (Number.isFinite(row.load) ? Math.max(max, row.load) : max),
      0,
    ),
    reportIssues: count(result.plan?.reportIssues),
    resources: count(result.plan?.resourceSchedules),
  });
  stage = 'prepare';
  const compiledAt = performance.now();
  const compiled = await build({
    entryPoints: [resolve(root, 'static/mps/source/workflow-inputs.js')],
    plugins: [await mpsComputePlugin(manage)],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'es2022',
  });
  const { buildMpsWorkflow } = await import(
    'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
  );
  const preparationMs = performance.now() - compiledAt;
  stage = 'compute';
  let expected;
  const samples = [];
  for (let repetition = 0; repetition < repetitions; repetition++) {
    const at = performance.now();
    const result = buildMpsWorkflow(...args);
    const computeMs = performance.now() - at;
    const serializeAt = performance.now();
    const encoded = JSON.stringify(result);
    const serializationMs = performance.now() - serializeAt;
    const cloneAt = performance.now();
    const cloned = structuredClone(result);
    const cloneMs = performance.now() - cloneAt;
    assert.deepEqual(cloned, result);
    if (expected && encoded !== expected) throw Error('MPS_MEASURE_RESULT_CHANGED');
    expected = encoded;
    samples.push({
      repetition,
      computeMs,
      serializationMs,
      cloneMs,
      jsonBytes: Buffer.byteLength(encoded),
      result: summary(result),
    });
  }
  const config = JSON.parse(await readFile(resolve(root, 'static/mps/sql.config.json'), 'utf8'));
  const queryIds = new Set(Object.keys(config.queries));
  const parameterScope = (key, values) => {
    if (!Array.isArray(values)) return [];
    const valid = values.filter((value) => {
      if (typeof value !== 'string' || !value.trim()) return false;
      return (
        key === 'codes' ||
        /^(?:\d{4}-(?:0?[1-9]|1[0-2])|\d{4}年(?:0?[1-9]|1[0-2])月|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-\d{2})$/i.test(
          value,
        )
      );
    });
    const unique = [
      ...new Set(valid.map((value) => (key === 'codes' ? value.trim() : value))),
    ].sort();
    return [
      [
        key,
        {
          ...(key === 'months'
            ? { values: unique, sourceAliasCount: unique.length }
            : {
                count: unique.length,
                fingerprint: createHash('sha256').update(JSON.stringify(unique)).digest('hex'),
              }),
          complete: valid.length === values.length,
        },
      ],
    ];
  };
  const reads = (recorded.reads ?? []).map((read) => ({
    queryId: queryIds.has(read.queryId) ? read.queryId : 'other',
    parameters: Object.fromEntries([
      ...['start', 'end', 'month', 'page_size', 'offset'].flatMap((key) => {
        const value = read.parameters?.[key];
        const valid = ['page_size', 'offset'].includes(key)
          ? Number.isSafeInteger(value) && value >= 0
          : typeof value === 'string' && /^\d{4}-\d{2}(?:-\d{2})?$/.test(value);
        return valid ? [[key, value]] : [];
      }),
      ...['months', 'codes'].flatMap((key) => parameterScope(key, read.parameters?.[key])),
    ]),
    ...Object.fromEntries(
      ['calls', 'rows', 'elapsedMs'].flatMap((key) =>
        Number.isFinite(read[key]) && read[key] >= 0 ? [[key, read[key]]] : [],
      ),
    ),
  }));
  let worker;
  if (values.worker) {
    stage = 'worker';
    const { chromium } = await import('@playwright/test');
    const workerOutput = await build({
      entryPoints: [resolve(root, 'static/mps/source/workflow-worker.js')],
      plugins: [await mpsComputePlugin(manage)],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      target: 'es2022',
    });
    const workerSource =
      `let received; const now = () => performance.timeOrigin + performance.now();
self.addEventListener('message', () => { received = now(); });
const post = self.postMessage.bind(self);
self.postMessage = (data) => post({...data, measurement: {received, finished: now()}});
` + workerOutput.outputFiles[0].text;
    const client = await build({
      entryPoints: [resolve(root, 'static/mps/source/workflow-worker-client.js')],
      plugins: [
        {
          name: 'measured-worker',
          setup(api) {
            api.onResolve({ filter: /^mps-workflow-worker-source$/ }, () => ({
              path: 'worker',
              namespace: 'measurement',
            }));
            api.onLoad({ filter: /.*/, namespace: 'measurement' }, () => ({
              contents: `export default ${JSON.stringify(workerSource)}`,
              loader: 'js',
            }));
          },
        },
      ],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'esm',
      target: 'es2022',
    });
    const browser = await chromium.launch({
      headless: true,
      ...(values.channel ? { channel: values.channel } : {}),
    });
    try {
      const page = await browser.newPage();
      await page.route('**/*', (route) => route.abort());
      worker = { browser: browser.version(), samples: [] };
      for (let repetition = 0; repetition < repetitions; repetition++) {
        const roundtripAt = performance.now();
        const { measurement, encoded } = await page.evaluate(
          async ({ source, inputJson, repetition }) => {
            const input = JSON.parse(inputJson);
            const args = Array.isArray(input)
              ? input
              : [input.draft, input.relations, input.shipment, input.evaluation];
            const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
            const { computeWorkflow } = await import(url);
            const NativeWorker = window.Worker;
            const now = () => performance.timeOrigin + performance.now();
            let created, sent, postMessageSyncMs, received, finished, arrived;
            window.Worker = class extends NativeWorker {
              constructor(...args) {
                created = now();
                super(...args);
                this.addEventListener('message', ({ data }) => {
                  arrived = now();
                  ({ received, finished } = data.measurement);
                });
              }
              postMessage(...args) {
                sent = now();
                super.postMessage(...args);
                postMessageSyncMs = now() - sent;
              }
            };
            try {
              const started = now();
              const result = await computeWorkflow(...args, new AbortController().signal);
              const totalMs = now() - started;
              const serializationAt = now();
              const encoded = JSON.stringify(result);
              const serializationMs = now() - serializationAt;
              return {
                encoded,
                measurement: {
                  repetition,
                  serializationMs,
                  totalMs,
                  createToInputMs: received - created,
                  inputArrivalMs: received - sent,
                  postMessageSyncMs,
                  computeMs: finished - received,
                  resultArrivalMs: arrived - finished,
                },
              };
            } finally {
              window.Worker = NativeWorker;
              URL.revokeObjectURL(url);
            }
          },
          { source: client.outputFiles[0].text, inputJson: raw, repetition },
        );
        const measurementRoundtripMs = performance.now() - roundtripAt;
        const comparisonAt = performance.now();
        if (encoded !== expected) throw Error('MPS_MEASURE_WORKER_RESULT_CHANGED');
        const comparisonMs = performance.now() - comparisonAt;
        worker.samples.push({
          ...measurement,
          measurementRoundtripMs,
          comparisonMs,
          fullResultEqual: true,
        });
      }
    } finally {
      await browser.close();
    }
  }
  console.log(
    JSON.stringify(
      {
        scope: 'recorded-input-offline',
        environment: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          workbenchHead: head(root),
          manageHead: head(manage),
          workbenchDirty: dirty(root),
          manageDirty: dirty(manage),
        },
        size: {
          inputBytes: Buffer.byteLength(raw),
          products: count(draft.products),
          report: count(draft.report),
          planRates: count(draft.planRates),
          annualHistory: (draft.historyAnnual?.periods ?? []).reduce(
            (sum, period) => sum + count(period.rows),
            0,
          ),
          shipment: count(shipment?.rows),
          relations: Object.fromEntries(
            ['products', 'sku_capacity', 'tunnels', 'transfers'].map((key) => [
              key,
              count(relations?.sources?.[key]),
            ]),
          ),
          weights: count(evaluation?.weights?.rows),
          annualCapacity: count(evaluation?.annual?.rows),
        },
        preparationMs,
        reads,
        samples,
        ...(worker ? { worker } : {}),
      },
      null,
      2,
    ),
  );
} catch (error) {
  const reason =
    [
      'MPS_MEASURE_WORKER_RESULT_CHANGED',
      'MPS_MEASURE_RESULT_CHANGED',
      'MPS_MEASURE_REQUIRES_INPUT_AND_MANAGE',
      'MPS_MEASURE_INVALID_REPETITIONS',
      'MPS_MEASURE_INVALID_INPUT',
    ].find((code) => String(error?.message ?? '').includes(code)) ?? 'UNAVAILABLE';
  console.error(JSON.stringify({ reason, error: 'MPS_MEASURE_FAILED', stage }));
  process.exitCode = 1;
}
