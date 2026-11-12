import test from 'node:test';
import { workflowPerformanceInput } from './helpers/mps-workflow-fixture.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';

const manage = resolve(process.env.DSH_MPS_MANAGE ?? '../dsh-agent-manage');

async function measureReads(t, reads) {
  const directory = await mkdtemp(join(tmpdir(), 'mps-measure-reads-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, 'input.json');
  await writeFile(input, JSON.stringify({ ...workflowPerformanceInput(2), reads }));
  const stdout = execFileSync(
    process.execPath,
    ['scripts/measure-mps.mjs', '--input', input, '--manage', manage],
    { encoding: 'utf8', stdio: 'pipe' },
  );
  return { stdout, report: JSON.parse(stdout) };
}

test('测量保留当前配置中的年度明细、同源计数及其他受控查询标识', async (t) => {
  const { stdout, report } = await measureReads(t, [
    { queryId: 'annual.capacity.detail' },
    { queryId: 'annual.capacity.count' },
    { queryId: 'annual.count' },
    { queryId: 'products.prices' },
    { queryId: 'secret-query-token' },
  ]);
  assert.deepEqual(report.reads, [
    { queryId: 'annual.capacity.detail', parameters: {} },
    { queryId: 'annual.capacity.count', parameters: {} },
    { queryId: 'annual.count', parameters: {} },
    { queryId: 'products.prices', parameters: {} },
    { queryId: 'other', parameters: {} },
  ]);
  assert.ok(!stdout.includes('secret-query-token'));
});

test('测量保留合法月份范围和完整编码集合指纹，丢弃认证字段及非法月份原文', async (t) => {
  const twoCodeScope = {
    count: 2,
    fingerprint: '52b4f97b9550c6bb4aac2b90681e0f2fe7ab5d37ec750a876da883df310aed84',
    complete: true,
  };
  const { stdout, report } = await measureReads(t, [
    {
      queryId: 'annual.capacity.detail',
      parameters: {
        months: ['Jul-26', '2026-7', '2026年7月', '2026-07', '2026-12', 'Jul-26'],
        page_size: 200,
        offset: 0,
        authorization: 'secret-auth-token',
      },
    },
    {
      queryId: 'annual.count',
      parameters: {
        months: ['2026-07', 'secret-month-token', '2026-13', '2026-00', 'Foo-26', 202607],
      },
    },
    {
      queryId: 'unit-weights.detail',
      parameters: { codes: ['sku-bravo', 'sku-alpha', 'sku-bravo'] },
    },
    {
      queryId: 'unit-weights.count',
      parameters: { codes: ['sku-alpha', 'sku-bravo'], headers: 'secret-header-token' },
    },
    {
      queryId: 'unit-weights.count',
      parameters: { codes: ['sku-alpha', null, 'sku-bravo'] },
    },
    {
      queryId: 'unit-weights.detail',
      parameters: { codes: ['sku-alpha', 'sku-charlie'] },
    },
  ]);
  assert.deepEqual(report.reads, [
    {
      queryId: 'annual.capacity.detail',
      parameters: {
        page_size: 200,
        offset: 0,
        months: {
          values: ['2026-07', '2026-12', '2026-7', '2026年7月', 'Jul-26'],
          sourceAliasCount: 5,
          complete: true,
        },
      },
    },
    {
      queryId: 'annual.count',
      parameters: { months: { values: ['2026-07'], sourceAliasCount: 1, complete: false } },
    },
    {
      queryId: 'unit-weights.detail',
      parameters: { codes: twoCodeScope },
    },
    {
      queryId: 'unit-weights.count',
      parameters: { codes: twoCodeScope },
    },
    {
      queryId: 'unit-weights.count',
      parameters: { codes: { ...twoCodeScope, complete: false } },
    },
    {
      queryId: 'unit-weights.detail',
      parameters: {
        codes: {
          count: 2,
          fingerprint: 'e157fadb932c57851f31953b7499ae18f040484dc8d6a931357f9e1ec854b786',
          complete: true,
        },
      },
    },
  ]);
  assert.ok(!/secret-|sku-alpha|sku-bravo|sku-charlie|2026-13|2026-00|Foo-26/.test(stdout));
});

test('离线测量复用有效需求输入，报告阶段与规模且不输出业务原文', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mps-measure-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const recorded = workflowPerformanceInput();
  recorded.draft.id = 'secret-draft';
  recorded.draft.name = 'secret-name';
  recorded.shipment.draftId = recorded.draft.id;
  const input = join(directory, 'input.json');
  await writeFile(
    input,
    JSON.stringify({
      ...recorded,
      headers: { authorization: 'secret-token' },
      reads: [
        {
          queryId: 'facts.history-annual',
          parameters: { start: '2025-07-01', end: '2026-06-30', headers: 'secret-header' },
          calls: 4,
          rows: 2,
          arbitrary: 'secret-extra',
        },
      ],
    }),
  );
  const stdout = execFileSync(
    process.execPath,
    ['scripts/measure-mps.mjs', '--input', input, '--manage', manage],
    { encoding: 'utf8' },
  );
  const report = JSON.parse(stdout);
  assert.equal(report.scope, 'recorded-input-offline');
  assert.equal(report.size.products, 200);
  assert.equal(report.samples.length, 1);
  assert.ok(report.samples[0].computeMs >= 0);
  assert.ok(report.samples[0].serializationMs >= 0);
  assert.ok(report.samples[0].cloneMs >= 0);
  assert.ok(report.samples[0].jsonBytes > 0);
  assert.equal(report.samples[0].result.activeDemandRows, 600);
  assert.ok(report.samples[0].result.constrainedRows > 0);
  assert.ok(report.samples[0].result.maxResourceLoad <= 1);
  assert.deepEqual(report.reads, [
    {
      queryId: 'facts.history-annual',
      parameters: { start: '2025-07-01', end: '2026-06-30' },
      calls: 4,
      rows: 2,
    },
  ]);
  assert.match(report.environment.workbenchHead, /^[a-f0-9]{40}$/);
  assert.match(report.environment.manageHead, /^[a-f0-9]{40}$/);
  assert.ok(!stdout.includes('secret-'));
});

test('中等规模有效需求在共享瓶颈下保持相同满足率且完整输出不改输入', async () => {
  const input = workflowPerformanceInput();
  const before = structuredClone(input);
  const compiled = await build({
    entryPoints: ['static/mps/source/workflow-inputs.js'],
    plugins: [await mpsComputePlugin(manage)],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
  });
  const { buildMpsWorkflow } = await import(
    'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
  );
  const result = buildMpsWorkflow(input.draft, input.relations, input.shipment, input.evaluation);
  const first = result.plan.rows.filter((row) => row.month === input.draft.month);
  assert.equal(first.length, 200);
  assert.ok(first.every((row) => Math.abs(row.demand - 0.5) < 1e-9));
  assert.ok(first.every((row) => Math.abs(row.mainPlan - 0.25) < 1e-7));
  assert.ok(first.every((row) => Math.abs(row.fulfillment - 0.5) < 1e-7));
  assert.ok(result.plan.resourceSchedules.every((row) => row.scheduledTons <= row.capacity));
  assert.deepEqual(input, before);
});

test('拒绝无效录制输入时不在错误输出回显业务原文', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mps-measure-invalid-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, 'invalid.json');
  await writeFile(input, '{"authorization":"secret-invalid-token"');
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        ['scripts/measure-mps.mjs', '--input', input, '--manage', manage],
        { encoding: 'utf8', stdio: 'pipe' },
      ),
    (error) => {
      assert.ok(!(error.stdout + error.stderr).includes('secret-invalid-token'));
      assert.equal(JSON.parse(error.stderr).error, 'MPS_MEASURE_FAILED');
      return true;
    },
  );
});
