import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';

test('opaque MPS page computes in a worker without blocking UI, preserves results and terminates cancelled work', async (t) => {
  const output = await build({
    stdin: {
      contents: `import {computeWorkflow} from './static/mps/source/workflow-worker-client.js'; import {buildMpsWorkflow} from './static/mps/source/workflow-inputs.js'; window.computeWorkflow=computeWorkflow;window.buildMpsWorkflow=buildMpsWorkflow;`,
      resolveDir: process.cwd(),
    },
    plugins: [await mpsComputePlugin()],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const policy =
    "default-src 'none'; script-src 'unsafe-inline'; worker-src blob:; connect-src 'none'";
  await page.route('http://mps-worker.test/**', (route) => {
    const workerPage = route.request().url().endsWith('/worker');
    return route.fulfill({
      contentType: 'text/html',
      headers: workerPage ? { 'Content-Security-Policy': policy } : {},
      body: workerPage
        ? `<script>${output.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`
        : '<iframe sandbox="allow-scripts" src="/worker"></iframe>',
    });
  });
  await page.goto('http://mps-worker.test/');
  const frame = page.frames().find((item) => item.url().endsWith('/worker'));
  await frame.waitForFunction(() => window.computeWorkflow);
  const result = await frame.evaluate(async () => {
    const draft = {
      id: 'worker-test',
      month: '2026-12',
      pull: 'monthly',
      productSource: 'local-file',
      products: Array.from({ length: 200 }, (_, index) => ({
        基地: '甲',
        产品编码: String(index),
        大类: '点心',
        系列: '系列',
        物料组: '包点',
      })),
      report: Array.from({ length: 200 }, (_, index) => ({
        月份: '2026-12',
        基地: '甲',
        产品编码: String(index),
        月初数量: index,
      })),
      history: [],
      reportRead: { status: 'ready' },
      historyRead: { status: 'ready' },
      categoryDemand: [{ month: '2026-12', category: '点心', quantity: 12000 }],
      constraints: { safetyDays: [{ base: '甲', days: 15 }], rules: { local: [] } },
    };
    const shipment = {
      draftId: draft.id,
      month: draft.month,
      shipmentMonth: '2026-11',
      status: 'ready',
      sourceKind: 'local-file',
      source: 'local-file',
      rows: [],
      adjustForecast() {},
    };
    const evaluation = { weights: null, sourceIssues: [] };
    const expected = window.buildMpsWorkflow(draft, null, shipment, evaluation);
    let created = 0;
    let terminated = 0;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        created++;
      }
      terminate() {
        terminated++;
        super.terminate();
      }
    };
    let ticks = 0;
    const timer = setInterval(() => ticks++, 5);
    try {
      const actual = await window.computeWorkflow(
        draft,
        null,
        shipment,
        evaluation,
        new AbortController().signal,
      );
      const active = new AbortController();
      const pending = window.computeWorkflow(draft, null, shipment, evaluation, active.signal);
      active.abort();
      let aborted;
      try {
        await pending;
      } catch (error) {
        aborted = error.name;
      }
      const completed = await window.computeWorkflow(
        draft,
        null,
        shipment,
        evaluation,
        new AbortController().signal,
      );
      return { actual, expected, completed, aborted, ticks, created, terminated };
    } finally {
      clearInterval(timer);
    }
  });
  assert.ok(result.actual.rows.length > 0);
  assert.deepEqual(result.actual, result.expected);
  assert.deepEqual(result.completed, result.expected);
  assert.equal(result.aborted, 'AbortError');
  assert.ok(result.ticks > 0, 'the UI event loop remains responsive during computation');
  assert.equal(result.created, 3);
  assert.equal(result.terminated, 3);
});
