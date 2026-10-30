import test from 'node:test';
import assert from 'node:assert/strict';
import { productProjections, sourceCheckRows } from '../static/mps/source/source-projections.js';

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
  月初数量: monthly,
  纠偏数量: adjusted,
  ...extra,
});
const checks = (actual, plan) => ({
  periods: [{ month: '2026-09', history: { rows: actual }, report: { rows: plan } }],
});

test('source checks use BI actuals and the selected DMS full version, not annual plan or a sum of versions', () => {
  const input = checks([history(12)], [report(10, 20)]);
  const monthly = sourceCheckRows(input, [raw('A')], 'monthly', ['汤圆']).rows[0];
  const adjusted = sourceCheckRows(input, [raw('A')], 'adjust', ['汤圆']).rows[0];
  assert.equal(monthly.plan.quantity, 10);
  assert.equal(monthly.ratio, 1.2);
  assert.equal(adjusted.plan.quantity, 20);
  assert.equal(adjusted.ratio, 0.6);
});

test('zero, absent periods and incomplete values remain distinct; partial known subtotals do not produce ratios', () => {
  const zero = sourceCheckRows(checks([history(0)], [report(0, 0)]), [raw('A')], 'monthly', [
    '汤圆',
  ]).rows[0];
  assert.equal(zero.actual.quantity, 0);
  assert.equal(zero.plan.quantity, 0);
  assert.equal(zero.ratio, null);
  const partial = sourceCheckRows(
    checks([history(4), history('')], [report(10, 10)]),
    [raw('A')],
    'monthly',
    ['汤圆'],
  ).rows[0];
  assert.equal(partial.actual.knownQuantity, 4);
  assert.equal(partial.actual.quantity, null);
  assert.equal(partial.ratio, null);
  const absent = sourceCheckRows(checks([], []), [raw('A')], 'monthly', ['汤圆']).rows[0];
  assert.equal(absent.actual.knownQuantity, null);
  assert.equal(absent.plan.quantity, null);
});

test('unmatched classifications and missing base keys expose reasons without discarding other known source quantities', () => {
  const result = sourceCheckRows(
    checks([history(8)], [report(10, 10), report(2, 2, { 产品编码: 'UNKNOWN' })]),
    [raw('A')],
    'monthly',
    ['汤圆'],
  ).rows[0];
  assert.equal(result.plan.quantity, 10);
  assert.equal(result.ratio, null);
  assert(result.issues.some((reason) => reason.includes('未唯一匹配')));
  const missing = sourceCheckRows(
    checks([history(8, { 基地: '' })], [report(10, 10)]),
    [raw('A')],
    'monthly',
    ['汤圆'],
  ).rows[0];
  assert.equal(missing.actual.quantity, 8);
  assert.equal(missing.ratio, null);
  assert(missing.issues.some((reason) => reason.includes('缺基地')));
});

test('source classification names are preserved without aliasing water dumplings into the page category', () => {
  const result = sourceCheckRows(
    checks([history(8, { 大类: '水饺' })], [report(10, 10)]),
    [raw('A', { responsible_item: '水饺' })],
    'monthly',
    ['饺子'],
  );
  assert.deepEqual(result.categories, ['饺子', '水饺']);
  assert.equal(result.rows.find((row) => row.category === '饺子').actual.quantity, null);
  assert.equal(result.rows.find((row) => row.category === '水饺').actual.quantity, 8);
});

test('retired SKUs can use the unique BI classification for the same SKU in the current source window', () => {
  const result = sourceCheckRows(
    checks([history(8, { 产品编码: 'OLD', 大类: '水饺' })], [report(10, 10, { 产品编码: 'OLD' })]),
    [],
    'monthly',
    ['水饺'],
  ).rows[0];
  assert.equal(result.plan.quantity, 10);
  assert.equal(result.ratio, 0.8);
});
