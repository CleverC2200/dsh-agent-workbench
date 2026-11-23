import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';
import { workflowDraft } from './helpers/mps-workflow-fixture.mjs';

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

test('产品范围采用产品清单目标基地，替换引用不扩张基地，缺源SKU仍留在范围且重复不倍增', () => {
  const draft = workflowDraft();
  draft.products = [
    { ...draft.products[0], 基地: '', 老品编码: 'B' },
    { ...draft.products[1], 基地: '' },
    { ...draft.products[1], 基地: '' },
    { ...draft.products[0], 基地: '', 产品编码: 'C' },
  ];
  draft.productRaw = [
    { material_code: 'A', target_base: '甲', replacement_material_code: 'B', replace_num: 1 },
    { material_code: 'B', target_base: '甲' },
    { material_code: 'C', target_base: '甲' },
  ];
  draft.report = [
    { 月份: draft.month, 基地: '甲', 产品编码: 'A', 月初数量: 30 },
    { 月份: draft.month, 基地: '甲', 产品编码: 'B', 月初数量: 70 },
    { 月份: draft.month, 基地: '乙', 产品编码: 'A', 月初数量: 900 },
  ];
  draft.historyAnnual.periods[0].rows = [
    { 基地: '甲', 产品编码: 'A', 数量: 60 },
    { 基地: '甲', 产品编码: 'B', 数量: 40 },
    { 基地: '乙', 产品编码: 'B', 数量: 999 },
  ];
  const result = buildMpsWorkflow(draft);
  assert.deepEqual(
    result.rows.filter((row) => row.month === draft.month).map((row) => [row.base, row.code]),
    [
      ['甲', 'A'],
      ['甲', 'B'],
      ['甲', 'C'],
    ],
  );
  assert.equal(result.rows.find((row) => row.code === 'A').historyQuantity, 100);
  assert.equal(result.rows.find((row) => row.code === 'B').historyQuantity, 40);
  assert.equal(result.poolExceptions.history.find((row) => row.base === '乙').code, 'B');
  assert.equal(result.poolExceptions.report.find((row) => row.base === '乙').code, 'A');
});

test('本地产品清单缺基地时报告缺项，不由历史或提报扩张产品范围', () => {
  const draft = workflowDraft();
  draft.products = [{ ...draft.products[0], 基地: '' }];
  const result = buildMpsWorkflow(draft);
  assert.equal(result.rows.length, 0);
  const issue = result.poolExceptions.other.find((row) => row.source === 'product-list');
  assert.equal(issue.code, 'A');
  assert.match(issue.reason, /缺基地/);
  assert.ok(result.poolExceptions.total.some((row) => row.base === '甲' && row.code === 'A'));
});

test('业务提报池外项保留大类，与同大类历史合并时保留双来源', () => {
  const draft = workflowDraft();
  draft.reportSource = 'business';
  draft.planRatesRead = { status: 'ready' };
  draft.planRates = [
    {
      维度类型: '基地+产品',
      月份: draft.month,
      基地: '甲',
      产品编码: 'OUT',
      大类: '点心',
      系列: '系列',
      物料组: '包点',
      当前维度计划量: 8,
    },
  ];
  draft.historyAnnual.periods[0].rows.push({ 基地: '甲', 产品编码: 'OUT', 大类: '点心', 数量: 20 });
  const result = buildMpsWorkflow(draft);
  const records = result.poolExceptions.total
    .find((row) => row.code === 'OUT')
    .records.filter((row) => row.category === '点心');
  assert.deepEqual(
    records.map((row) => [row.source, row.quantity]),
    [
      ['history', 20],
      ['report', 8],
    ],
  );
});

test('源产品清单独立对账实际参与组合，列出映射遗漏、额外组合与源字段冲突', () => {
  const draft = workflowDraft();
  draft.productSource = 'business';
  draft.productsRead = { status: 'ready' };
  draft.products = [draft.products[0], { ...draft.products[0], 产品编码: 'EXTRA' }];
  draft.productRaw = [
    {
      stat_period: '2026-12',
      target_base: '甲',
      material_code: 'A',
      responsible_item: '点心',
      series: '系列',
      product_item: '包点',
    },
    {
      stat_period: '2026-12',
      target_base: '乙',
      material_code: 'B',
      responsible_item: '点心',
      series: '系列',
      product_item: '包点',
    },
    {
      stat_period: '2026-12',
      target_base: '甲',
      material_code: 'A',
      responsible_item: '冲突大类',
      series: '系列',
      product_item: '包点',
    },
    { stat_period: '2026-12', target_base: '', material_code: 'NOBASE', responsible_item: '点心' },
  ];
  const result = buildMpsWorkflow(draft);
  assert.equal(result.productScope.sourceRows, 4);
  assert.equal(result.productScope.expectedCount, 2);
  assert.equal(result.productScope.participatingCount, 2);
  assert.equal(result.productScope.missingCount, 1);
  assert.equal(result.productScope.extraCount, 1);
  assert.match(
    result.productScope.rows.find((row) => row.code === 'A').issues.join('；'),
    /大类.*冲突/,
  );
  assert.equal(result.productScope.rows.find((row) => row.code === 'B').status, '遗漏');
  assert.equal(result.productScope.rows.find((row) => row.code === 'EXTRA').status, '额外组合');
  assert.match(
    result.productScope.rows.find((row) => row.code === 'NOBASE').issues.join('；'),
    /缺基地/,
  );
  assert.equal(result.scopeCoverage, 'in-scope');
  assert.match(result.productScope.coverageIssues.join('；'), /全国/);
});

test('范围对账能定位同基地替换系数冲突，不把待核的已参与SKU视为完整', () => {
  const draft = workflowDraft();
  draft.products[0].老品编码 = 'OLD';
  draft.productRaw = [1, 2].map((replace_num) => ({
    target_base: '甲',
    material_code: 'A',
    replacement_material_code: 'OLD',
    replace_num,
  }));
  const result = buildMpsWorkflow(draft);
  assert.equal(result.rows[0].historyQuantity, null);
  const row = result.productScope.rows.find((row) => row.base === '甲' && row.code === 'A');
  assert.equal(row.participating, true);
  assert.match(row.issues.join('；'), /替换系数.*冲突/);
});
