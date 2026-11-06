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

test('产品老品编码接入历史参考并建立老品所在基地的新品拆分范围', () => {
  const source = draft();
  source.products[0]['老品编码'] = 'OLD';
  source.historyAnnual.periods[0].rows.push(
    { 基地: '甲', 产品编码: 'OLD', 数量: 100 },
    { 基地: '丙', 产品编码: 'OLD', 数量: 20 },
  );
  const raw = structuredClone(source.historyAnnual);
  const result = buildMpsWorkflow(source);
  const row = result.rows.find((row) => row.base === '甲' && row.code === 'A');
  assert.equal(row.historyCode, 'OLD');
  assert.equal(row.historyQuantity, 100);
  assert.equal(
    result.rows.find((row) => row.base === '丙' && row.code === 'A').historyQuantity,
    20,
  );
  assert.deepEqual(source.historyAnnual, raw);
  const solved = buildMpsWorkflow(source, null, null, {
    weights: { rows: [{ material_code: 'A', channel_name: '经销商', ton_per_piece: 0.1 }] },
  });
  assert.ok(solved.plan.rows.find((row) => row.base === '丙' && row.code === 'A').demandTons > 0);
  assert.ok(
    !solved.plan.rows
      .find((row) => row.base === '丙' && row.code === 'A')
      .planMissing.includes('缺唯一有效件吨系数'),
  );
});

test('业务版本缺源周转天数临时按零参与，原始缺项保留且人工补充值优先', () => {
  const source = draft();
  source.productSource = 'business';
  source.productsRead = { status: 'ready' };
  source.inventoryTargetsRead = { status: 'ready' };
  let result = buildMpsWorkflow(source, null);
  assert.ok(result.rows.length > 0);
  assert.ok(
    result.rows.every(
      (row) =>
        row.safetyDays === 0 &&
        row.targetInventory === 0 &&
        row.safetyDaysSource === 'missing-turnover-days-zero',
    ),
  );
  assert.ok(
    result.rows.every(
      (row) => row.turnoverPolicy.sourceDays === null && row.turnoverPolicy.missing.length > 0,
    ),
  );
  source.constraints.turnoverDays = [{ base: '甲', code: 'A', days: 15 }];
  result = buildMpsWorkflow(source, null);
  assert.ok(
    result.rows
      .filter((row) => row.base === '甲')
      .every((row) => row.safetyDays === 15 && row.safetyDaysSource === 'manual-turnover-days'),
  );
});

test('公开Manage source导出驱动页面归一化，收入缺失不阻断数量，切口径重算', () => {
  const source = draft();
  const monthly = buildMpsWorkflow(source);
  assert.ok(Math.abs(monthly.rows[0].demand - 54) < 1e-12);
  assert.equal(monthly.rows[0].base, '甲');
  assert.deepEqual(monthly.constraints, { ...source.constraints, turnoverDays: [] });
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

test('完整读取后未提报的基地SKU按零计算，读取失败与已有空值不转零', () => {
  const source = draft();
  source.reportSource = 'business';
  source.planRatesRead = { status: 'ready', metadata: { partial: false } };
  source.planRates = [
    { 月份: source.month, 维度类型: '基地+产品', 基地: '甲', 产品编码: 'A', 当前维度计划量: 30 },
  ];
  const atB = () => buildMpsWorkflow(source).rows.find((row) => row.code === 'B');
  assert.equal(atB().reportQuantity, 0);
  assert.equal(atB().reportShare, 0);
  assert.equal(atB().historyShare, 0.4);
  assert.equal(atB().demand, 24);
  assert.equal(atB().reportMissingAsZero, true);
  assert.equal(source.planRates.length, 1);
  for (const status of ['loading', 'failed', 'unread']) {
    source.planRatesRead = { status };
    assert.equal(atB().reportQuantity, null);
    assert.equal(atB().demand, null);
  }
  source.planRatesRead = { status: 'ready', metadata: { partial: true } };
  assert.equal(atB().reportQuantity, null);
  source.planRatesRead = { status: 'ready', month: '2027-01' };
  assert.equal(atB().reportQuantity, null);
  source.planRatesRead = { status: 'ready' };
  source.planRates.push({
    月份: source.month,
    维度类型: '基地+产品',
    基地: '乙',
    产品编码: 'B',
    当前维度计划量: null,
  });
  assert.equal(atB().reportQuantity, null);
  assert.equal(atB().reportMissingAsZero, false);
});

test('整类提报为零时仅用历史占比，已有空值和读取失败不能触发历史单路拆分', () => {
  const source = draft();
  source.reportSource = 'business';
  source.planRatesRead = { status: 'ready' };
  source.planRates = [];
  const result = buildMpsWorkflow(source);
  const first = result.rows.filter((row) => row.month === source.month);
  assert.deepEqual(
    first.map((row) => row.reportQuantity),
    [0, 0],
  );
  assert.deepEqual(
    first.map((row) => row.demand),
    [72, 48],
  );
  assert.ok(first.every((row) => row.splitBasis === 'history-only-zero-report'));
  source.planRates.push({
    月份: source.month,
    维度类型: '基地+产品',
    基地: '甲',
    产品编码: 'A',
    当前维度计划量: null,
  });
  assert.equal(buildMpsWorkflow(source).rows[0].demand, null);
  source.planRatesRead = { status: 'failed' };
  assert.equal(buildMpsWorkflow(source).rows[0].demand, null);
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
    { 维度类型: '物料组+产品', 产品编码: 'B', 物料组名称: '包点', 计划占比: 0.25 },
    { 维度类型: '物料组+产品', 产品编码: 'C', 物料组名称: '另一组', 计划占比: 1 },
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
  source.planRates.find((row) => row['维度类型'] === '物料组+产品' && row['产品编码'] === 'B')[
    '物料组名称'
  ] = '旧源物料组';
  assert.equal(buildMpsWorkflow(source).rows[0].demand, null);
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

test('来源诊断按批次投影产品维度，不为每条记录重建产品索引', async () => {
  const React = await import('react');
  const { renderToString } = await import('react-dom/server');
  const output = await build({
    entryPoints: ['static/mps/source/source-diagnostics.js'],
    plugins: [await mpsComputePlugin()],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
  });
  const { createSourceDiagnostics } = await import(
    'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
  );
  let categoryReads = 0;
  const months = ['2026-11', '2026-12', '2027-01'];
  const products = Array.from({ length: 100 }, (_, code) => ({
    基地: '甲',
    产品编码: String(code),
    产品名称: `产品${code}`,
    get 大类() {
      categoryReads++;
      return '汤圆';
    },
    系列: '系列',
    物料组: '组',
    物料组名称: '组名',
  }));
  const facts = products.map((product) => ({
    基地: '甲',
    产品编码: product.产品编码,
    数量: 0,
    月初数量: 0,
  }));
  const source = {
    month: months[0],
    pull: 'monthly',
    products,
    report: months.flatMap((月份) => facts.map((row) => ({ ...row, 月份 }))),
    reportRead: {
      periods: Object.fromEntries(
        months.map((month) => [month, { status: 'ready', metadata: { total: 100 } }]),
      ),
    },
    historyAnnualRead: { month: months[0], status: 'ready' },
    historyAnnual: {
      periods: [{ start: '2025-07-01', end: '2026-06-30', metadata: { total: 100 }, rows: facts }],
    },
  };
  const result = {
    months,
    rows: months.flatMap((month) =>
      facts.map((row) => ({ month, base: row.基地, code: row.产品编码 })),
    ),
  };
  let rows;
  const Diagnostics = createSourceDiagnostics(React, { downloadCsv() {}, Dialog: () => null });
  renderToString(
    React.createElement(Diagnostics, {
      draft: source,
      result,
      table(_name, _columns, values) {
        rows = values;
        return null;
      },
    }),
  );
  assert.equal(rows.length, 6);
  assert.ok(rows.every((row) => row[5] === '100/100' && row[6] === '0'));
  assert.ok(
    categoryReads <= products.length * 10,
    `产品大类被读取${categoryReads}次，应按诊断批次建索引`,
  );
});

test('调拨装配识别源表的从某基地调拨文本，并用目标基地字段确定接收方', async () => {
  const { buildPlanSources } = await import('../static/mps/source/plan-inputs.js');
  const source = draft();
  const facts = [
    {
      material_code: 'A',
      stat_period: '2026-12',
      transfer_direction: '从甲调拨',
      target_base: '乙',
    },
    {
      material_code: 'B',
      stat_period: '2026-12',
      transfer_direction: '从甲基地调拨',
      target_base: '乙基地',
    },
    { material_code: 'C', transfer_direction: '从未确认基地调拨', target_base: '乙' },
    { material_code: 'D', transfer_direction: '甲→乙', target_base: '甲' },
    { material_code: 'E', transfer_direction: '从甲调拨', target_base: '甲' },
  ];
  const result = buildPlanSources(source, {
    sources: { tunnels: [], sku_capacity: [], transfers: facts },
  });
  assert.deepEqual(result.transferRoutes, [
    { from: '甲', to: '乙', code: 'A', month: '2026-12' },
    { from: '甲', to: '乙', code: 'B', month: '2026-12' },
  ]);
  assert.equal(result.metadata.pendingRoutes, 3);
});

test('调拨装配按已确认的四川广州湖州关系匹配评估基地', async () => {
  const { buildPlanSources } = await import('../static/mps/source/plan-inputs.js');
  const source = {
    ...draft(),
    products: ['郑州', '西南', '华南', '华东'].map((base) => ({ 基地: base, 产品编码: 'A' })),
  };
  const transfers = [
    { material_code: 'A', transfer_direction: '从郑州调拨', target_base: '四川' },
    { material_code: 'B', transfer_direction: '从广州基地调拨', target_base: '湖州基地' },
    { material_code: 'C', transfer_direction: '湖州→四川', target_base: '西南' },
    { material_code: 'D', transfer_direction: '从西南调拨', target_base: '四川' },
    { material_code: 'E', transfer_direction: '郑州→四川', target_base: '广州' },
  ];
  const result = buildPlanSources(source, {
    sources: { tunnels: [], sku_capacity: [], transfers },
  });
  assert.deepEqual(result.transferRoutes, [
    { from: '郑州', to: '西南', code: 'A', month: source.month },
    { from: '华南', to: '华东', code: 'B', month: source.month },
    { from: '华东', to: '西南', code: 'C', month: source.month },
  ]);
  assert.equal(result.metadata.pendingRoutes, 2);
});

test('报告按确认口径区分下市需求、产线、调拨和件吨系数，有资源不误报缺产能', () => {
  const source = draft();
  source.constraints.rules = {};
  const codes = ['A', 'B', 'C', 'D'];
  source.products = codes.map((code) => ({
    基地: '',
    产品编码: code,
    产品名称: code,
    大类: '点心',
    物料组: '组',
  }));
  source.report = codes.map((code) => ({
    月份: source.month,
    基地: '甲',
    产品编码: code,
    月初数量: 25,
  }));
  source.historyAnnual.periods[0].rows = codes.map((code) => ({
    基地: '甲',
    产品编码: code,
    数量: 25,
  }));
  source.categoryDemand = [{ month: source.month, category: '点心', quantity: 100 }];
  source.resources = [{ id: 'R', base: '甲', kind: 'tunnel', name: '产线', dailyTons: 100 }];
  source.resourceAssignments = [{ base: '甲', code: 'A', resourceId: 'R', share: 1 }];
  source.unitWeights = ['B', 'C', 'D'].map((code) => ({ base: '甲', code, tonsPerPiece: 1 }));
  const relations = {
    month: source.month,
    sources: {
      products: [],
      tunnels: [],
      sku_capacity: [],
      transfers: [
        {
          stat_period: source.month,
          target_base: '甲',
          material_code: 'B',
          transfer_tag: '调拨品',
          transfer_direction: '',
        },
        {
          stat_period: source.month,
          target_base: '甲',
          material_code: 'C',
          transfer_tag: '自产品',
          transfer_direction: '',
        },
        {
          stat_period: source.month,
          target_base: '甲',
          material_code: 'D',
          transfer_tag: '下市品',
          transfer_direction: '',
        },
      ],
    },
  };
  const shipment = {
    draftId: source.id,
    month: source.month,
    shipmentMonth: '2026-11',
    sourceKind: 'business',
    rows: codes.map((code) => ({ base: '甲', code, end: 0 })),
  };
  const run = () => buildMpsWorkflow(source, relations, shipment, { weights: { rows: [] } }).plan;
  const plan = run();
  const categories = (code) =>
    plan.reportIssues
      .filter((row) => row.month === source.month && row.code === code)
      .map((row) => row.kind);
  assert.deepEqual(categories('A'), ['缺件吨系数']);
  assert.deepEqual(categories('B'), ['缺调拨关系']);
  assert.deepEqual(categories('C'), ['缺产线产能']);
  assert.deepEqual(categories('D'), ['下市品产生需求']);
  assert.ok(
    plan.rows
      .find((row) => row.code === 'A')
      .reportMissing.every((reason) => !reason.startsWith('缺产线产能')),
  );
  assert.equal(plan.rows.find((row) => row.code === 'D').demand, 25);
  source.report[3].月初数量 = 0;
  source.historyAnnual.periods[0].rows[3].数量 = 0;
  assert.ok(run().reportIssues.every((row) => row.code !== 'D'));
  source.resources.push({ id: 'R2', base: '乙', kind: 'tunnel', name: '供方产线', dailyTons: 100 });
  source.resourceAssignments.push({ base: '乙', code: 'B', resourceId: 'R2', share: 1 });
  source.unitWeights.push({ base: '乙', code: 'B', tonsPerPiece: 1 });
  relations.sources.transfers[0].transfer_direction = '从乙调拨';
  assert.ok(run().reportIssues.every((row) => row.month !== source.month || row.code !== 'B'));
  source.unitWeights.pop();
  assert.deepEqual(
    run()
      .reportIssues.filter((row) => row.month === source.month && row.code === 'B')
      .map((row) => row.kind),
    ['缺件吨系数'],
  );
  source.unitWeights.push({ base: '甲', code: 'A', tonsPerPiece: 1 });
  source.resources[0].dailyTons = 0;
  const zeroCapacity = run();
  assert.ok(
    zeroCapacity.reportIssues.every((row) => row.month !== source.month || row.code !== 'A'),
  );
  assert.ok(
    zeroCapacity.rows.find((row) => row.month === source.month && row.code === 'A').unfulfilled > 0,
  );
});

test('组合系列为空但物理隧道有效时保留产能，不进入缺产能报告', () => {
  const source = draft();
  source.constraints.rules = {};
  source.products = [source.products[0]];
  source.report = [source.report[0]];
  source.historyAnnual.periods[0].rows = [source.historyAnnual.periods[0].rows[0]];
  source.unitWeights = [{ base: '甲', code: 'A', tonsPerPiece: 0.01 }];
  const tunnel = {
    belong_base: '甲',
    production_unit: '瑾瑜一厂',
    tunnel_no: '2#',
    series: '系列',
    production_category: '点心',
    standard_daily_output_pc: 6000,
    standard_daily_output_ton: 28,
  };
  const relations = {
    month: source.month,
    sources: {
      products: [],
      transfers: [],
      tunnels: [tunnel],
      sku_capacity: [{ ...tunnel, material_code: 'A', workshop: '瑾瑜一厂', combined_series: '' }],
    },
  };
  const shipment = {
    draftId: source.id,
    month: source.month,
    shipmentMonth: '2026-11',
    sourceKind: 'business',
    rows: [{ base: '甲', code: 'A', end: 0 }],
  };
  const plan = buildMpsWorkflow(source, relations, shipment, { weights: { rows: [] } }).plan;
  const row = plan.rows.find((row) => row.month === source.month);
  assert.ok(Math.abs(row.mainPlan - 120) < 1e-8);
  assert.equal(row.candidateResources.length, 1);
  assert.ok(plan.reportIssues.every((issue) => issue.kind !== '缺产线产能'));
});
