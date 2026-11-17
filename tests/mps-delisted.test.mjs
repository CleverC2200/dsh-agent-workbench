import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';
import { delistedInput } from './helpers/mps-delisted.mjs';

const compiled = await build({
  entryPoints: ['static/mps/source/workflow-inputs.js'],
  plugins: [await mpsComputePlugin()],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
});
const { buildMpsWorkflow } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
);

test('下市标签及来源日均进入计算，前月计划只经期初承接，未来调拨继续入账且异常可追溯', () => {
  const sample = delistedInput();
  const result = buildMpsWorkflow(
    sample.draft,
    sample.relations,
    sample.shipment,
    sample.evaluation,
  );
  for (const rows of [result.rows, result.plan.rows]) {
    const retired = rows.filter((row) => row.code === '0');
    assert.deepEqual(
      retired.map((row) => row.demand),
      [0, 0, 0],
    );
    assert.deepEqual(
      retired.map((row) => row.expectedShipment),
      [50, 45, 0],
    );
    assert.deepEqual(
      retired.map((row) => row.projectedClosing),
      [50, 0, 0],
    );
    assert.ok(rows.filter((row) => row.code === '1').every((row) => row.demand === 50));
  }
  assert.ok(
    result.plan.reportIssues.some(
      (issue) => issue.kind === '下市品停止自动补货' && /原系统拆分需求/.test(issue.reason),
    ),
  );
});

test('下市人工正需求保留原修正与历史并继续后续计算，仅单列异常供人决定', () => {
  const sample = delistedInput();
  sample.draft.adjustments = {
    quantities: [
      {
        kind: 'base-sku',
        month: '2026-12',
        category: '点心',
        group: '包点',
        code: '0',
        base: '甲',
        quantity: 120,
        reason: '促销活动',
        at: '2026-11-17T08:00:00Z',
        systemValue: 50,
      },
      {
        kind: 'base-sku',
        month: '2027-01',
        category: '点心',
        group: '包点',
        code: '0',
        base: '甲',
        quantity: 20,
        reason: '人工确认',
        at: '2026-11-17T08:01:00Z',
        systemValue: 50,
      },
    ],
    history: [{ quantity: 110, reason: '历史修正' }],
  };
  const original = structuredClone(sample.draft.adjustments);
  const result = buildMpsWorkflow(
    sample.draft,
    sample.relations,
    sample.shipment,
    sample.evaluation,
  );
  const rows = result.plan.rows.filter((row) => row.code === '0');
  assert.deepEqual(
    rows.map((row) => row.demand),
    [120, 20, 0],
  );
  assert.deepEqual(
    rows.map((row) => row.automaticDemandStopped),
    [false, false, true],
  );
  assert.ok(rows.slice(0, 2).every((row) => row.mainPlan > 0));
  assert.ok(
    result.plan.reportIssues.some(
      (issue) => issue.kind === '下市品人工正需求' && /保留.*有效/.test(issue.action),
    ),
  );
  assert.deepEqual(sample.draft.adjustments, original);
});

test('日均真实零与缺失补零报告可区分，原始来源失败原因不改写成成功', () => {
  const sample = delistedInput();
  sample.shipment.rows[0].average = null;
  let result = buildMpsWorkflow(sample.draft, sample.relations, sample.shipment, sample.evaluation);
  const missing = result.delistedIssues.filter((issue) => issue.kind === '下市品日均缺失');
  assert.equal(missing.length, 2);
  assert.ok(
    missing.every(
      (issue) =>
        issue.rawValue === null &&
        issue.calculationValue === 0 &&
        /avg_30d_send/.test(issue.reason),
    ),
  );
  sample.shipment.rows[0].average = 0;
  result = buildMpsWorkflow(sample.draft, sample.relations, sample.shipment, sample.evaluation);
  assert.ok(result.delistedIssues.every((issue) => issue.kind !== '下市品日均缺失'));
  sample.shipment.status = 'failed';
  sample.shipment.error = '库存来源访问失败';
  result = buildMpsWorkflow(sample.draft, sample.relations, sample.shipment, sample.evaluation);
  assert.ok(
    result.delistedIssues.some(
      (issue) => issue.kind === '下市品日均缺失' && /failed.*访问失败/.test(issue.reason),
    ),
  );
  assert.equal(sample.shipment.status, 'failed');
});

test('未来既有生产和在途按月份确认入账，前月不重复，缺记录不会被日均补0覆盖', () => {
  const sample = delistedInput();
  sample.shipment.rows[0].average = null;
  sample.draft.inventoryMovements = ['2026-11', '2026-12', '2027-01', '2027-02'].map((month) => ({
    month,
    base: '甲',
    code: '0',
    productionInbound: month === '2026-12' ? 20 : 0,
    inTransitInbound: month === '2027-01' ? 5 : 0,
    transferIn: 0,
    transferOut: 0,
    source: '已有计划核对',
    reason: '人工确认',
    at: '2026-11-17T08:00:00.000Z',
  }));
  let result = buildMpsWorkflow(sample.draft, sample.relations, sample.shipment, sample.evaluation);
  assert.deepEqual(
    result.rows.filter((row) => row.code === '0').map((row) => row.projectedClosing),
    [70, 75, 75],
  );
  sample.draft.inventoryMovements = sample.draft.inventoryMovements.filter(
    (row) => row.month !== '2027-01',
  );
  result = buildMpsWorkflow(sample.draft, sample.relations, sample.shipment, sample.evaluation);
  assert.deepEqual(
    result.rows.filter((row) => row.code === '0').map((row) => row.projectedClosing),
    [70, null, null],
  );
});
