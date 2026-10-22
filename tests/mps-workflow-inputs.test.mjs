import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';

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
const draft = () => ({
  id: 'v1',
  name: '本地核对',
  month: '2026-12',
  pull: 'monthly',
  productSource: 'local-file',
  products: [
    {
      基地: '',
      产品编码: 'A',
      产品名称: '产品A',
      大类: '点心',
      系列: '系列',
      物料组: '包点',
    },
    {
      基地: '',
      产品编码: 'B',
      产品名称: '产品B',
      大类: '点心',
      系列: '系列',
      物料组: '包点',
    },
  ],
  report: [
    { 月份: '2026-12', 基地: '甲', 产品编码: 'A', 月初数量: 30, 纠偏数量: 90 },
    { 月份: '2026-12', 基地: '乙', 产品编码: 'B', 月初数量: 70, 纠偏数量: 10 },
  ],
  history: [
    { 月份: '2025-12', 基地: '甲', 产品编码: 'A', 数量: 60, 不含税收入: '' },
    { 月份: '2025-12', 基地: '乙', 产品编码: 'B', 数量: 40, 不含税收入: '' },
  ],
  historyMetadata: { partial: true, warnings: ['部分收入为空'] },
  reportRead: { status: 'ready' },
  historyRead: { status: 'ready' },
  categoryDemand: [{ month: '2026-12', category: '点心', quantity: 120 }],
  constraints: {
    safetyDays: [{ base: '甲', days: 0 }],
    rules: { local: [{ description: '本地', strength: '硬' }] },
  },
});

test('公开Manage source导出驱动页面归一化，收入缺失不阻断数量，切口径重算', () => {
  const source = draft();
  const monthly = buildMpsWorkflow(source);
  assert.ok(Math.abs(monthly.rows[0].demand - 54) < 1e-12);
  assert.equal(monthly.rows[0].base, '甲');
  assert.deepEqual(monthly.constraints, source.constraints);
  source.pull = 'correction';
  const correction = buildMpsWorkflow(source);
  assert.equal(correction.rows[0].demand, 90);
  assert.equal(monthly.rows[0].reportQuantity, 30);
  source.reportRead = { status: 'failed', error: '无权限' };
  const denied = buildMpsWorkflow(source);
  assert.equal(denied.rows[0].demand, null);
  assert.match(denied.rows[0].missing.demand.join(''), /无权限/);
});

test('仅同版同月非演示结存进入期初，空白不变0，原型产品不进入后续', () => {
  const source = draft();
  const snapshot = {
    draftId: 'v1',
    month: '2026-12',
    shipmentMonth: '2026-11',
    source: 'local-csv',
    status: 'ready',
    rows: [{ base: '甲', code: 'A', end: -5 }],
  };
  assert.equal(buildMpsWorkflow(source, null, snapshot).rows[0].openingInventory, -5);
  snapshot.draftId = 'v2';
  assert.equal(buildMpsWorkflow(source, null, snapshot).rows[0].openingInventory, null);
  snapshot.draftId = 'v1';
  snapshot.source = 'demo';
  assert.equal(buildMpsWorkflow(source, null, snapshot).rows[0].openingInventory, null);
  source.report[0].月初数量 = '';
  assert.equal(buildMpsWorkflow(source).rows[0].reportQuantity, null);
  source.productSource = 'demo-edited';
  assert.deepEqual(buildMpsWorkflow(source).rows, []);
});
