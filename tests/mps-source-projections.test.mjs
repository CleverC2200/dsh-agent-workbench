import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  productProjections,
  sourceCheckRows,
  sourceDimensions,
} from '../static/mps/source/source-projections.js';

const row = (code, group = 'G') => ({
  基地: '',
  产品编码: code,
  产品名称: code || '品项',
  大类: '',
  系列: '',
  物料组: group,
  老品编码: '',
  老品名称: '',
});
const raw = (code, extra = {}) => ({
  material_code: code,
  product_item: 'G',
  sub_category: '细类',
  series: '系列',
  responsible_item: '汤圆',
  ...extra,
});

test('product groups reveal exact child SKUs and unique source attributes without changing calculation rows or old-product fields', () => {
  const products = [row(''), row('A'), row('B'), row('C', 'OTHER')];
  const before = structuredClone(products);
  const result = productProjections(
    products,
    [
      raw(''),
      raw('A', { replacement_material_code: 'R', replacement_product: '源替换品' }),
      raw('B'),
    ],
    [
      { 产品编码: 'A', 基地: '郑州' },
      { 产品编码: 'B', 基地: '华东' },
    ],
  );
  assert.deepEqual(result[0].children, [1, 2]);
  assert.deepEqual(result[0].labels, ['汤圆']);
  assert.equal(result[0].display['大类'], '细类');
  assert.equal(result[0].display['系列'], '系列');
  assert.equal(result[0].display['产品编码'], '');
  assert.deepEqual(result[0].candidateBases, ['华东', '郑州']);
  assert.deepEqual(result[1].replacementCodes, ['R']);
  assert.equal(result[1].display['老品编码'], '');
  assert.deepEqual(products, before);
});

test('multi-class groups keep all values and never select one arbitrary classification', () => {
  const result = productProjections(
    [row(''), row('A'), row('B')],
    [raw('A'), raw('B', { sub_category: '另细类', series: '另一系列', responsible_item: '休闲' })],
  );
  assert.equal(result[0].display['大类'], '多值（2项）');
  assert.equal(result[0].display['系列'], '多值（2项）');
  assert.deepEqual(result[0].labels, ['汤圆', '休闲']);
  assert.deepEqual(result[0].inherited, []);
});

const history = (quantity, extra = {}) => ({
  基地: '郑州',
  产品编码: 'A',
  大类: '汤圆',
  数量: quantity,
  ...extra,
});
const report = (monthly, adjusted, extra = {}) => ({
  基地: '郑州',
  产品编码: 'A',
  计划数量: monthly,
  ...extra,
});
const checks = (actual, plan) => ({
  periods: [{ month: '2026-09', history: { rows: actual }, report: { rows: plan } }],
});

test('source checks use allnum plan quantities independently of obsolete report-version quantities', () => {
  const input = checks([history(12)], [report(10, 20)]);
  const monthly = sourceCheckRows(input, [raw('A', { sub_category: '汤圆' })], 'monthly', ['汤圆'])
    .rows[0];
  const adjusted = sourceCheckRows(input, [raw('A', { sub_category: '汤圆' })], 'adjust', ['汤圆'])
    .rows[0];
  assert.equal(monthly.plan.quantity, 10);
  assert.equal(monthly.ratio, 1.2);
  assert.equal(adjusted.plan.quantity, 10);
  assert.equal(adjusted.ratio, 1.2);
});

test('zero, absent periods and incomplete values remain distinct; partial known subtotals do not produce ratios', () => {
  const zero = sourceCheckRows(
    checks([history(0)], [report(0, 0)]),
    [raw('A', { sub_category: '汤圆' })],
    'monthly',
    ['汤圆'],
  ).rows[0];
  assert.equal(zero.actual.quantity, 0);
  assert.equal(zero.plan.quantity, 0);
  assert.equal(zero.ratio, null);
  const partial = sourceCheckRows(
    checks([history(4), history('')], [report(10, 10)]),
    [raw('A', { sub_category: '汤圆' })],
    'monthly',
    ['汤圆'],
  ).rows[0];
  assert.equal(partial.actual.knownQuantity, 4);
  assert.equal(partial.actual.quantity, null);
  assert.equal(partial.ratio, null);
  const absent = sourceCheckRows(checks([], []), [raw('A', { sub_category: '汤圆' })], 'monthly', [
    '汤圆',
  ]).rows[0];
  assert.equal(absent.actual.knownQuantity, null);
  assert.equal(absent.plan.quantity, null);
});

test('current pool remaps BI and DMS by SKU; excluded nonzero historical SKUs do not block pool demand', () => {
  const result = sourceCheckRows(
    checks(
      [history(8, { 大类: '饺子' }), history(4, { 产品编码: 'OLD' })],
      [report(10, 10), report(2, 2, { 产品编码: 'OLD' })],
    ),
    [raw('A', { sub_category: '水饺' })],
    'monthly',
    ['饺子'],
  );
  assert.deepEqual(result.categories, ['水饺']);
  assert.equal(result.rows[0].actual.quantity, 8);
  assert.equal(result.rows[0].plan.quantity, 10);
  assert.equal(result.rows[0].ratio, 0.8);
  assert.equal(result.excluded.length, 2);
  assert.deepEqual(
    result.excluded.map((r) => r['来源']),
    ['BI', '计划量'],
  );
  assert(result.excluded.every((r) => r['原因'] === '不在当前产品池'));
});

test('nationwide pool totals retain source quantities without a base; ambiguous current classifications are listed for completion', () => {
  const result = sourceCheckRows(
    checks([history(8, { 基地: '' })], [report(20, 20, { 基地: '' })]),
    [raw('A', { sub_category: '汤圆', belong_base: '郑州' })],
    'adjust',
  );
  assert.equal(result.rows[0].actual.quantity, 8);
  assert.equal(result.rows[0].plan.quantity, 20);
  assert.equal(result.rows[0].ratio, 0.4);
  assert.equal(result.excluded.length, 0);
  const ambiguous = sourceCheckRows(
    checks([history(8)], [report(10, 10)]),
    [
      raw('A', { sub_category: '汤圆', belong_base: '郑州' }),
      raw('A', { sub_category: '水饺', belong_base: '乙' }),
    ],
    'monthly',
  );
  assert.equal(ambiguous.rows.length, 2);
  assert.equal(ambiguous.excluded.length, 2);
  assert(ambiguous.excluded.every((r) => r['原因'] === '当前产品池大类不唯一'));
  assert(ambiguous.rows.every((row) => row.actual.quantity === null && row.plan.quantity === null));
});

test('历史事实按基地物料唯一补齐系列，保留源值、零数量与无映射原因', () => {
  const facts = [
    history(0, { 系列: '', 物料组: '旧组' }),
    history(5, { 基地: '乙' }),
    history(7, { 产品编码: 'OLD' }),
    history(9, { 基地: '未知基地' }),
  ];
  const products = [
    { 产品编码: 'A', 基地: '郑州', 大类: '水饺', 系列: '甲系列', 物料组: 'G', 物料组名称: '组甲' },
    { 产品编码: 'A', 基地: '乙', 大类: '水饺', 系列: '乙系列', 物料组: 'G', 物料组名称: '组甲' },
    { 产品编码: 'A', 基地: '乙', 大类: '水饺', 系列: '另一系列', 物料组: 'G', 物料组名称: '组甲' },
  ];
  const mapped = sourceDimensions(facts, products);
  assert.equal(mapped[0]['系列'], '甲系列');
  assert.equal(mapped[0]['物料组'], 'G');
  assert.equal(mapped[0]['源大类'], '汤圆');
  assert.equal(mapped[0]['数量'], 0);
  assert.equal(mapped[1]['系列'], '');
  assert.match(mapped[1]['缺项原因'], /系列.*多个/);
  assert.match(mapped[2]['缺项原因'], /未匹配/);
  assert.equal(mapped[3]['大类'], '');
  assert.equal(mapped[3]['系列'], '');
  assert.match(mapped[3]['缺项原因'], /未匹配/);
  assert.equal(facts[0]['系列'], '');
});

test('产品列表的大类覆盖保留无来源及分类冲突涉及的大类，不由数量或唯一映射缩减范围', () => {
  const result = sourceCheckRows(checks([history(0)], []), [
    raw('A', { sub_category: '饺子' }),
    raw('A', { sub_category: '汤圆' }),
    raw('B', { sub_category: '调理肉制品' }),
    raw('C', { sub_category: '饼类' }),
  ]);
  assert.deepEqual(result.categories, ['饺子', '汤圆', '调理肉制品', '饼类']);
  assert.equal(result.rows.length, 4);
  assert.equal(result.excluded.length, 1);
});

test('池外仅过滤各自真实源数量的零值和空值，池内零值及缺项继续保留', () => {
  const actual = [0, '', null, 8, -2418].map((quantity, index) =>
    history(quantity, { 产品编码: 'OUT' + index }),
  );
  const plans = [0, '', null, 25, -7].map((quantity, index) =>
    report(quantity, quantity, { 产品编码: 'OUT' + index }),
  );
  const result = sourceCheckRows(
    checks([...actual, history(0), history('')], [...plans, report(0, 0)]),
    [raw('A', { sub_category: '汤圆' })],
  );
  assert.deepEqual(
    result.excluded.map((row) => [row['来源'], row['数量'] ?? row['计划数量']]),
    [
      ['BI', 8],
      ['BI', -2418],
      ['计划量', 25],
      ['计划量', -7],
    ],
  );
  assert.equal(result.details.length, 7);
  assert.equal(result.rows[0].actual.knownQuantity, 0);
  assert.equal(result.rows[0].actual.quantity, null);
  assert.equal(result.rows[0].plan.quantity, 0);
});

test('真实空计划量附带来源缺项说明时只过滤池外记录，池内缺项及源异常继续保留', () => {
  const missing = {
    源计划数量: '',
    源记录数: 1,
    缺数量条数: 1,
    重复键条数: 0,
    缺项原因: '计划数量缺失，保留已知小计',
  };
  const result = sourceCheckRows(
    checks(
      [],
      [
        report('', '', { ...missing, 产品编码: 'OUT' }),
        report('', '', missing),
        report('', '', {
          ...missing,
          产品编码: 'DUP',
          重复键条数: 2,
          缺项原因: '计划来源六维业务键重复，未合计有效量；计划数量缺失，保留已知小计',
        }),
        report('', '', {
          ...missing,
          产品编码: 'UNKNOWN',
          缺数量条数: 0,
          缺项原因: '来源字段不完整',
        }),
      ],
    ),
    [raw('A', { sub_category: '汤圆' })],
  );
  assert.deepEqual(
    result.excluded.map((row) => row['产品编码']),
    ['DUP', 'UNKNOWN'],
  );
  assert.equal(result.rows[0].plan.quantity, null);
  assert.equal(result.rows[0].plan.missing, 1);
  assert(
    result.details.some((row) => row['产品编码'] === 'A' && row['缺项原因'] === missing.缺项原因),
  );
  const failed = checks([], [report('', '', { ...missing, 产品编码: 'OUT' })]);
  failed.periods[0].report.error = '来源读取失败';
  assert.equal(sourceCheckRows(failed, [raw('A')]).excluded.length, 1);
});

test('当前编码优先且唯一老品只归属一个当前SKU，保留来源编码与原始数量', () => {
  const products = [
    raw('A', { sub_category: '汤圆', replacement_material_code: 'OLD' }),
    raw('A', { sub_category: '汤圆', replacement_material_code: 'OLD', belong_base: '乙' }),
    { 产品编码: 'B', 大类: '水饺', 老品编码: 'A' },
  ];
  const input = checks(
    [history(8, { 产品编码: 'OLD' }), history(3)],
    [report(10, 10, { 产品编码: 'OLD' })],
  );
  const before = structuredClone(input);
  const result = sourceCheckRows(input, products);
  assert.equal(result.excluded.length, 0);
  assert.equal(result.rows.find((row) => row.category === '汤圆').actual.quantity, 11);
  assert.equal(result.rows.find((row) => row.category === '汤圆').plan.quantity, 10);
  assert.equal(result.rows.find((row) => row.category === '水饺').actual.quantity, null);
  const old = result.details.find((row) => row['产品编码'] === 'OLD');
  assert.equal(old['当前产品编码'], 'A');
  assert.equal(old['大类'], '汤圆');
  assert.deepEqual(input, before);
});

test('零数量的匹配冲突、源数量不完整与读取失败继续报告，不能当作正常池外过滤', () => {
  const input = checks(
    [history(0, { 产品编码: 'SHARED' }), history(0, { 产品编码: '' })],
    [
      report('', '', {
        产品编码: 'OUT',
        源计划数量: 12,
        缺项原因: '计划来源六维业务键重复，未合计有效量',
      }),
    ],
  );
  const result = sourceCheckRows(input, [
    raw('A', { replacement_material_code: 'SHARED' }),
    raw('B', { replacement_material_code: 'SHARED' }),
  ]);
  assert.equal(result.excluded.length, 3);
  assert.match(result.excluded[0]['原因'], /老品编码对应多个当前产品/);
  assert.equal(result.excluded[2]['源计划数量'], 12);
  const failed = checks([history(0, { 产品编码: 'OUT' })], []);
  failed.periods[0].history.error = '当前账号暂无数据权限';
  const failure = sourceCheckRows(failed, [raw('A')]);
  assert.equal(failure.excluded.length, 1);
  assert(failure.rows[0].issues.some((issue) => issue.includes('BI读取失败')));
  assert(failure.details.some((row) => row['原因'].includes('读取失败')));
  assert.equal(sourceCheckRows(checks([history(0)], []), []).excluded.length, 1);
});

test(
  '留存891条池外记录过滤675条，保留BI8条及计划208条，含负数-2418',
  {
    skip: !process.env.MPS_POOL_REPLAY_INPUT && '设置MPS_POOL_REPLAY_INPUT以只读回放留存底稿',
  },
  async () => {
    const { draft } = JSON.parse(await readFile(process.env.MPS_POOL_REPLAY_INPUT, 'utf8'));
    const before = JSON.stringify(draft.sourceChecks);
    const result = sourceCheckRows(draft.sourceChecks, draft.products);
    assert.equal(result.excluded.length, 216);
    assert.equal(result.excluded.filter((row) => row['来源'] === 'BI').length, 8);
    assert.equal(result.excluded.filter((row) => row['来源'] === '计划量').length, 208);
    assert.equal(result.excluded.find((row) => row['数量'] === -2418)['来源'], 'BI');
    assert.equal(new Set(result.excluded.map((row) => row['产品编码'])).size, 72);
    assert.equal(result.details.length, 16488);
    assert.equal(17163 - result.details.length, 675);
    assert.equal(JSON.stringify(draft.sourceChecks), before);
  },
);

test('multi-base source rows keep national groups unique and expose new-product and decimal metadata without conversion', () => {
  const records = [
    raw('A', {
      stat_period: '2026-11',
      target_base: '郑州',
      transfer_tag: '新品',
      net_weight: '8.08000001',
      weight_unit: 'KG',
      measure_unit: '件',
      replace_num: '0.00000000',
    }),
    raw('A', {
      stat_period: '2026-11',
      target_base: '华东',
      transfer_tag: '自产',
      net_weight: '8.08000001',
      weight_unit: 'KG',
      measure_unit: '件',
      replace_num: '0.00000000',
    }),
    raw('B', {
      stat_period: '2026-11',
      target_base: '华东',
      transfer_tag: '非新品',
      net_weight: null,
      replace_num: null,
    }),
  ];
  const products = [row(''), row('A'), row('B')];
  const projected = productProjections(products, records);
  assert.equal(projected[0].display['大类'], '细类');
  assert.equal(projected[1].display['新品标记'], '部分基地新品');
  assert.equal(projected[2].display['新品标记'], '非新品');
  assert.deepEqual(projected[1].targetBases, ['郑州', '华东']);
  assert.equal(projected[1].sourceDetails.length, 2);
  assert.equal(projected[1].sourceDetails[0]['净重'], '8.08000001');
  assert.equal(projected[1].sourceDetails[0]['替换系数'], '0.00000000');
  assert.equal(projected[2].sourceDetails[0]['净重'], '');
  assert.equal(projected[2].sourceDetails[0]['替换系数'], '');
});
