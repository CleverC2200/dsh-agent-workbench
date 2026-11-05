import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mpsComputePlugin } from '../scripts/mps-compute-build.mjs';
import { summarizeEvaluation, planContext } from '../static/mps/source/evaluation-view.js';

test('产销存汇总保留已知小计、真实零值与缺项，并隔离基地和月份', () => {
  const groups = summarizeEvaluation([
    { month: '2026-12', base: '甲', demand: 100, openingInventory: 0, requiredProduction: 40 },
    { month: '2026-12', base: '甲', demand: null, openingInventory: 20, requiredProduction: null },
    { month: '2027-01', base: '甲', demand: null },
    { month: '2026-12', base: '乙', demand: 0 },
  ]);
  const first = groups.find((row) => row.base === '甲' && row.month === '2026-12');
  assert.deepEqual(first.metrics.demand, { value: 100, known: 1, missing: 1 });
  assert.deepEqual(first.metrics.openingInventory, { value: 20, known: 2, missing: 0 });
  assert.deepEqual(first.metrics.requiredProductionTons, { value: null, known: 0, missing: 2 });
  assert.equal(groups.find((row) => row.base === '乙').metrics.demand.value, 0);
  assert.equal(groups.find((row) => row.month === '2027-01').metrics.demand.value, null);
});

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
  historyAnnual: {
    periods: [
      {
        start: '2025-07-01',
        end: '2026-06-30',
        rows: [
          { 基地: '甲', 产品编码: 'A', 数量: 60 },
          { 基地: '乙', 产品编码: 'B', 数量: 40 },
        ],
      },
    ],
  },
  historyAnnualRead: { status: 'ready' },
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

test('按实际期间撤销失效提报与历史，别月成功或失败不改变本月可用性', () => {
  const source = draft();
  source.reportRead = {
    periods: {
      '2026-12': { status: 'ready' },
      '2027-01': { status: 'failed', error: '一月提报拒权' },
    },
  };
  source.historyAnnual.periods[0].error = '上一财年历史拒权';
  const failed = buildMpsWorkflow(source);
  assert.equal(failed.rows[0].historyQuantity, null);
  assert.equal(failed.rows[0].reportQuantity, 30);
  assert.equal(failed.rows[0].demand, null);
  assert.match(failed.rows[0].missing.demand.join(''), /上一财年历史拒权/);
  delete source.historyAnnual.periods[0].error;
  source.historyAnnual.periods.push({
    start: '2024-07-01',
    end: '2025-06-30',
    rows: [],
    error: '前年拒权',
  });
  assert.ok(Math.abs(buildMpsWorkflow(source).rows[0].demand - 54) < 1e-12);
  source.reportRead.periods['2026-12'] = { status: 'loading' };
  assert.equal(buildMpsWorkflow(source).rows[0].reportQuantity, null);
  assert.equal(source.report[0].月初数量, 30);
});

test('产品读取中或失败撤销依赖分类的拆分，但保留独立数量与结存', () => {
  const source = draft();
  const snapshot = {
    draftId: 'v1',
    month: '2026-12',
    shipmentMonth: '2026-11',
    source: 'local-csv',
    rows: [{ base: '甲', code: 'A', end: -8 }],
  };
  for (const status of ['loading', 'failed']) {
    source.productsRead = { status, error: '产品权限已失效' };
    const row = buildMpsWorkflow(source, null, snapshot).rows[0];
    assert.equal(row.demand, null);
    assert.equal(row.share, null);
    assert.equal(row.reportShare, null);
    assert.equal(row.historyShare, null);
    assert.equal(row.reportQuantity, 30);
    assert.equal(row.historyQuantity, 60);
    assert.equal(row.openingInventory, -8);
    assert.match(row.missing.demand.join(''), status === 'loading' ? /正在读取/ : /产品权限已失效/);
  }
});

test('产能与有效结存不能扩充月度需求范围，缺正式归属和全国覆盖如实列出', () => {
  const source = draft();
  source.report = [];
  source.history = [];
  source.historyAnnual.periods[0].rows = [];
  const snapshot = {
    draftId: 'v1',
    month: '2026-12',
    shipmentMonth: '2026-11',
    source: 'local-csv',
    rows: [{ base: '郑州', code: 'A', end: -8 }],
  };
  const relations = { sources: { sku_capacity: [{ belong_base: '甲', material_code: 'A' }] } };
  const result = buildMpsWorkflow(source, relations, snapshot);
  assert.deepEqual(result.rows, []);
  assert.equal(result.scopeCoverage, 'in-scope');
  assert.match(result.missing.join(''), /当前产品明细.*物料编码.*物料组编码/);
  assert.match(result.missing.join(''), /全国覆盖.*实际证明/);
});

test('空月来源拒权不能随着月度候选为空而消失', () => {
  const source = draft();
  source.report = [];
  source.history = [];
  source.historyAnnual.periods[0].rows = [];
  source.reportRead = { periods: { '2026-12': { status: 'failed', error: '十二月提报拒权' } } };
  source.historyAnnual.periods[0].error = '十二月历史读取失败';
  const result = buildMpsWorkflow(source);
  assert.equal(result.rows.length, 0);
  assert.match(result.missing.join(''), /2026-12.*十二月提报拒权/);
  assert.match(result.missing.join(''), /2026-12.*十二月历史读取失败/);
  assert.equal(result.summary.requiredProductionTons, null);
  assert.match(result.summary.missing.join(''), /十二月提报拒权/);
});

test('M+2调整后的大类有效链进入需求与M+3库存，系统基线和显式空值保留', () => {
  const source = draft();
  source.month = '2026-10';
  source.products = [source.products[0]];
  source.constraints.safetyDays = [{ base: '甲', days: 5 }];
  source.report = ['2026-10', '2026-11', '2026-12'].map((month) => ({
    月份: month,
    基地: '甲',
    产品编码: 'A',
    月初数量: 100,
  }));
  source.historyAnnual.periods[0].rows = [{ 基地: '甲', 产品编码: 'A', 数量: 100 }];
  source.categoryDemand = [
    { month: '2026-10', category: '点心', quantity: 125, systemQuantity: 125 },
    { month: '2026-11', category: '点心', quantity: 200, systemQuantity: 125 },
    { month: '2026-12', category: '点心', quantity: 300, systemQuantity: 187.5 },
    { month: '2027-01', category: '点心', quantity: 600, systemQuantity: 375 },
  ];
  source.adjustments = {
    categoryDemand: [{ month: '2026-11', category: '点心', quantity: 200 }],
  };
  const result = buildMpsWorkflow(source);
  const categories = result.categoryRows.filter((row) => row.category === '点心');
  assert.deepEqual(
    categories.map((row) => row.quantity),
    [125, 200, 300, 600],
  );
  assert.deepEqual(
    categories.map((row) => row.systemQuantity),
    [125, 125, 187.5, 375],
  );
  assert.deepEqual(
    categories.map((row) => row.adjusted),
    [false, true, true, true],
  );
  assert.deepEqual(
    result.rows.map((row) => row.demand),
    [125, 200, 300],
  );
  assert.equal(result.rows[2].nextMonthDemand, 600);
  assert.equal(result.rows[2].targetInventory, 96.7741935483871);
  source.categoryDemand[0].systemQuantity = null;
  assert.equal(
    buildMpsWorkflow(source).categoryRows.find((row) => row.category === '点心').systemQuantity,
    null,
  );
});

test('业务销售提报按基地物料allnum重分当前物料组，旧系列占比和月初选择不影响计算', () => {
  const source = draft();
  source.reportSource = 'business';
  source.planRatesRead = { status: 'ready', month: source.month };
  source.products[0].物料组 = '102009';
  source.products[1].物料组 = '102009';
  source.planRates = [
    { 月份: source.month, 维度类型: '基地+产品', 基地: '甲', 产品编码: 'A', 当前维度计划量: 30 },
    { 月份: source.month, 维度类型: '基地+产品', 基地: '乙', 产品编码: 'B', 当前维度计划量: 70 },
    { 月份: source.month, 维度类型: '大类+物料组', 物料组名称: '错误系列名称', 计划占比: 0.999 },
  ];
  source.history[0].数量 = 99999;
  const first = buildMpsWorkflow(source).rows[0];
  assert.equal(first.group, '102009');
  assert.equal(first.reportLayers.groupQuantity, 100);
  assert.equal(first.reportLayers.baseShare, 1);
  assert.equal(first.reportShare, 0.3);
  assert.equal(first.historyQuantity, 60);
  source.pull = 'correction';
  assert.equal(buildMpsWorkflow(source).rows[0].reportShare, 0.3);
});

test('跨7月仍用评估月所属上一完整财年，后月不切换本轮系数基期', () => {
  const source = draft();
  source.month = '2026-06';
  source.report = [{ 月份: '2026-06', 基地: '甲', 产品编码: 'A', 月初数量: 1 }];
  source.historyAnnual.periods.push({
    start: '2024-07-01',
    end: '2025-06-30',
    rows: [{ 基地: '甲', 产品编码: 'A', 数量: 9 }],
  });
  const rows = buildMpsWorkflow(source).rows;
  assert.equal(rows.find((row) => row.month === '2026-06' && row.code === 'A').historyQuantity, 9);
  assert.equal(rows.find((row) => row.month === '2026-07' && row.code === 'A').historyQuantity, 9);
  source.historyAnnual.periods.shift();
  assert.equal(
    buildMpsWorkflow(source).rows.find((row) => row.month === '2026-07' && row.code === 'A')
      .historyQuantity,
    9,
  );
  source.historyAnnual.periods = [];
  assert.equal(buildMpsWorkflow(source).rows[0].historyQuantity, null);
});

test('完整财年查询使用起止日期，不落回单月查询', async () => {
  const { makeRequest } = await import('../business/shared/configured-query-client.mjs');
  const { readFile } = await import('node:fs/promises');
  const config = JSON.parse(await readFile('static/mps/sql.config.json', 'utf8'));
  const request = makeRequest(config, 'facts.history-annual', {
    start: '2025-07-01',
    end: '2026-06-30',
    page_size: 200,
    offset: 0,
  });
  assert.deepEqual(request.cube.timeDimensions[0].dateRange, ['2025-07-01', '2026-06-30']);
});

test('销售基地物料业务键重复不重复加量，重读或失败会撤销旧占比但不撤销独立历史', () => {
  const source = draft();
  source.reportSource = 'business';
  source.planRatesRead = { status: 'ready' };
  source.planRates = [
    { 月份: source.month, 维度类型: '基地+产品', 基地: '甲', 产品编码: 'A', 当前维度计划量: 10 },
  ];
  assert.equal(buildMpsWorkflow(source).rows[0].reportShare, 1);
  source.planRates.push({ ...source.planRates[0] });
  assert.equal(buildMpsWorkflow(source).rows[0].reportShare, null);
  source.planRates.pop();
  for (const status of ['loading', 'failed', 'unread']) {
    source.planRatesRead = { status, error: '提报读取失效' };
    const row = buildMpsWorkflow(source).rows[0];
    assert.equal(row.reportShare, null);
    assert.equal(row.historyShare, 0.6);
  }
  source.historyAnnualRead = { status: 'loading' };
  assert.equal(buildMpsWorkflow(source).rows[0].historyShare, null);
});

test('评估月源三层系数接入Top1剩余占比，同版三个月使用同一基期', () => {
  const source = draft();
  source.reportSource = 'business';
  source.planRatesRead = { status: 'ready', month: source.month };
  source.products.push({ ...source.products[0], 产品编码: 'C', 物料组: '另一组' });
  source.historyAnnual.periods[0].rows = [
    { 基地: '甲', 产品编码: 'A', 数量: 60 },
    { 基地: '乙', 产品编码: 'B', 数量: 20 },
    { 基地: '甲', 产品编码: 'C', 数量: 20 },
  ];
  source.planRates = [
    { 维度类型: '大类+物料组', 大类: '点心', 物料组名称: '另一组', 计划占比: 0.3 },
    { 维度类型: '物料组+产品', 产品编码: 'B', 计划占比: 0.25 },
    { 维度类型: '物料组+产品', 产品编码: 'C', 计划占比: 1 },
    { 维度类型: '基地+产品', 基地: '甲', 产品编码: 'A', 当前维度计划量: '', 计划占比: 1 },
    { 维度类型: '基地+产品', 基地: '乙', 产品编码: 'B', 当前维度计划量: 20, 计划占比: 1 },
    { 维度类型: '基地+产品', 基地: '甲', 产品编码: 'C', 当前维度计划量: 30, 计划占比: 1 },
  ].map((row) => ({ ...row, 月份: source.month }));
  source.categoryDemand.push({ month: '2027-01', category: '点心', quantity: 200 });
  const result = buildMpsWorkflow(source);
  const a = result.rows.filter((row) => row.code === 'A');
  assert.ok(a.every((row) => Math.abs(row.share - 0.5625) < 1e-12));
  assert.ok(Math.abs(a[1].demand - 112.5) < 1e-12);
  assert.equal(a[0].reportQuantity, null);
  assert.equal(a[0].coefficientFallback.length, 2);
});

test('求解装配按物理隧道去重，冲突能力与渠道系数留待补充，调拨限定来源月份', async () => {
  const { buildPlanSources } = await import('../static/mps/source/plan-inputs.js');
  const source = draft();
  source.constraints.rules.local = [];
  const tunnel = {
    belong_base: '甲',
    production_unit: '一车间',
    tunnel_no: 'T',
    standard_daily_output_ton: 5,
  };
  const relations = {
    sources: {
      tunnels: [
        tunnel,
        { ...tunnel, series: '另一系列' },
        { ...tunnel, tunnel_no: 'U', standard_daily_output_ton: 2 },
        { ...tunnel, tunnel_no: 'U', standard_daily_output_ton: 3 },
      ],
      sku_capacity: [{ belong_base: '甲', workshop: '一车间', tunnel_no: 'T', material_code: 'A' }],
      transfers: [
        {
          stat_period: '2026-12',
          material_code: 'A',
          transfer_direction: '甲→乙',
          target_base: '乙',
        },
        { material_code: 'B', transfer_direction: '全国' },
      ],
    },
  };
  const weights = {
    rows: [
      { material_code: 'A', channel_name: '商超', ton_per_piece: 0.1 },
      { material_code: 'A', channel_name: '电商', ton_per_piece: 0.2 },
      { material_code: 'B', channel_name: '商超', ton_per_piece: 0.3 },
    ],
  };
  const first = buildPlanSources(source, relations, weights);
  assert.ok(!first.unitWeights.some((row) => row.code === 'A'));
  assert.equal(
    first.unitWeights.find((row) => row.base === '乙' && row.code === 'B').tonsPerPiece,
    0.3,
  );
  assert.equal(first.resources.length, 1);
  assert.equal(first.planCandidates.length, 1);
  assert.match(first.planSourceIssues.join(''), /能力冲突/);
  assert.deepEqual(first.transferRoutes, [{ from: '甲', to: '乙', code: 'A', month: '2026-12' }]);
  assert.equal(first.metadata.pendingRoutes, 1);
  assert.equal(first.productionDays.find((row) => row.month === '2027-02').days, 15);
  source.resources = [{ id: 'manual', base: '甲', kind: 'tunnel', name: '人工隧道', dailyTons: 7 }];
  source.resourceAssignments = [
    { month: '2026-12', base: '甲', code: 'A', resourceId: 'manual', share: 1 },
  ];
  const manual = buildPlanSources(source, relations, null);
  assert.deepEqual(manual.resources, source.resources);
  assert.equal(manual.planCandidates[0].month, '2026-12');
});

test('求解上下文只发布当前页业务值，万行结果与共享资源不重复塞入会话', () => {
  const rows = Array.from({ length: 10956 }, (_, index) => ({
    id: String(index),
    month: '2026-11',
    base: '甲',
    code: 'A' + index,
    mainPlan: 40,
    demand: 80,
    fulfillment: 0.5,
    capacities: Array(200).fill({ source: '重复来源'.repeat(30) }),
    missing: { demand: Array(100).fill('旧版参考缺项') },
    planMissing: ['缺部分库存'],
  }));
  const resources = Array.from({ length: 300 }, (_, index) => ({
    base: '甲',
    month: '2026-11',
    resourceId: String(index),
    capacity: 50,
    scheduledTons: 50,
    load: 1,
  }));
  const context = planContext(
    {
      rows,
      resourceSchedules: resources,
      transfers: [],
      summary: { totalRows: rows.length },
      sources: { resources: 300 },
    },
    rows.slice(0, 25),
    { base: '甲', month: '' },
  );
  assert.equal(context.rows.length, 25);
  assert.equal(context.rows[0].mainPlan, 40);
  assert.equal(context.rows[0].capacities, undefined);
  assert.equal(context.resources.length, 25);
  assert.equal(context.resourceTotal, 300);
  assert.ok(JSON.stringify(context).length < 20000);
});

test('同隧道不同系列不扩产，日产件数冲突和车间未匹配不会自动取最大值或套用唯一隧道', async () => {
  const { buildPlanSources } = await import('../static/mps/source/plan-inputs.js');
  const source = draft();
  const tunnel = {
    belong_base: '甲',
    production_unit: '一车间',
    tunnel_no: 'T',
    standard_daily_output_ton: 5,
    standard_daily_output_pc: 100,
  };
  const relations = {
    sources: {
      tunnels: [tunnel],
      sku_capacity: [
        { belong_base: '甲', workshop: '错误车间', tunnel_no: 'T', material_code: 'A' },
      ],
      transfers: [],
    },
  };
  const unmatched = buildPlanSources(source, relations);
  assert.equal(unmatched.resources.length, 1);
  assert.equal(unmatched.planCandidates.length, 0);
  assert.match(unmatched.planSourceIssues.join('；'), /车间.*未匹配/);
  relations.sources.tunnels.push({ ...tunnel, series: '乙系列', standard_daily_output_pc: 200 });
  const conflict = buildPlanSources(source, relations);
  assert.equal(conflict.resources.length, 0);
  assert.match(conflict.planSourceIssues.join('；'), /日产能力冲突/);
});

test('两表同物理隧道标准日产吨数不同保留冲突，不能选择任何一表继续排产', async () => {
  const { buildPlanSources } = await import('../static/mps/source/plan-inputs.js');
  const source = draft();
  const relations = {
    sources: {
      tunnels: [
        {
          belong_base: '甲',
          production_unit: '一车间',
          tunnel_no: 'T',
          standard_daily_output_ton: 4400,
          standard_daily_output_pc: null,
        },
      ],
      sku_capacity: [
        {
          belong_base: '甲',
          workshop: '一车间',
          tunnel_no: 'T',
          material_code: 'A',
          standard_daily_output_ton: 43,
          standard_daily_output_pc: 3000,
        },
      ],
      transfers: [],
    },
  };
  const result = buildPlanSources(source, relations);
  assert.equal(result.resources.length, 0);
  assert.equal(result.planCandidates.length, 0);
  assert.match(result.planSourceIssues.join('；'), /两表.*标准日产吨数.*冲突/);
});
