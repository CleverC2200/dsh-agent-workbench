import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileDemandAmounts } from '../static/mps/source/amount-reconciliation.js';

const setup = () => ({
  month: '2026-12',
  products: ['A', 'B', 'C'].map((code) => ({ 产品编码: code, 大类: '汤圆' })),
  productPrices: {
    status: 'ready',
    rows: [
      { 产品编码: 'A', 未税到岸单价: '0.005' },
      { 产品编码: 'B', 未税到岸单价: '0.005' },
    ],
  },
  reportRead: { periods: { '2026-12': { status: 'ready' } } },
  reportAmounts: {
    '2026-12': {
      status: 'ready',
      period: '2026-12',
      rows: [
        {
          月份: '2026-12',
          基地: '郑州',
          产品编码: 'A',
          月初计划金额: '0.01',
          最终计划金额: '0.00',
        },
        { 月份: '2026-12', 基地: '郑州', 产品编码: 'B', 月初计划金额: '', 最终计划金额: '0.00' },
      ],
    },
  },
});
const demand = (code, quantity) => ({
  month: '2026-12',
  base: '郑州',
  code,
  category: '汤圆',
  demand: quantity,
});

test('金额精度逐SKU累加后取两位，并保留源金额缺项', () => {
  const result = reconcileDemandAmounts(setup(), {}, [demand('A', 1), demand('B', 1)]).rows[0];
  assert.equal(result.generatedAmount, '0.01');
  assert.equal(result.difference, '0.01');
  assert.equal(result.initial.amount, null);
  assert.equal(result.initial.knownAmount, '0.01');
  assert.match(result.coverage, /月初金额缺1条/);
});

test('缺价缺量仍保留已知小计，缺基地及池外源金额进入全国并标明覆盖', () => {
  const draft = setup();
  draft.reportAmounts['2026-12'].rows.push(
    { 月份: '2026-12', 基地: '', 产品编码: 'A', 月初计划金额: '2.00', 最终计划金额: '3.00' },
    { 月份: '2026-12', 基地: '郑州', 产品编码: '池外', 月初计划金额: '4.00', 最终计划金额: '5.00' },
  );
  const amounts = reconcileDemandAmounts(draft, {}, [
    demand('A', 0),
    demand('B', null),
    demand('C', 3),
  ]);
  const total = amounts.rows[0];
  assert.equal(total.final.amount, '8.00');
  assert.equal(total.generatedAmount, null);
  assert.equal(total.generatedKnown, '0.00');
  assert.equal(total.difference, null);
  assert.match(total.coverage, /缺价1项/);
  assert.match(total.coverage, /缺量1项/);
  assert.match(total.coverage, /源金额2条无同范围需求/);
  assert.match(total.coverage, /含缺基地源金额/);
  assert.equal(amounts.rows.find((row) => row.category === '未归类').final.amount, '5.00');
  const filtered = reconcileDemandAmounts(
    draft,
    {},
    [demand('A', 0), demand('B', null), demand('C', 3)],
    { base: '郑州', category: '汤圆' },
  );
  assert.deepEqual(filtered.excluded, { count: 2, initial: '6.00', final: '8.00' });
  assert.equal(filtered.rows[0].final.amount, '0.00');
});

test('未来月份或提报刷新失败不复用旧金额；负数与大额小数计算保留精度', () => {
  const draft = setup();
  draft.productPrices.rows = [
    { 产品编码: 'A', 未税到岸单价: '9007199254740992.01' },
    { 产品编码: 'B', 未税到岸单价: '0.004' },
  ];
  const rows = [demand('A', 3), demand('B', -2)];
  const total = reconcileDemandAmounts(draft, {}, rows).rows[0];
  assert.equal(total.generatedAmount, '27021597764222976.02');
  assert.equal(total.difference, '27021597764222976.02');
  draft.reportRead.periods['2026-12'].status = 'error';
  assert.equal(reconcileDemandAmounts(draft, {}, rows).rows[0].final.knownAmount, null);
  const future = reconcileDemandAmounts(draft, {}, rows, { month: '2027-01' });
  assert.equal(future.rows[0].generatedKnown, null);
  assert.equal(future.rows[0].final.knownAmount, null);
});

test('金额沿当前编码优先及唯一老品归属，冲突来源仅保留一次且不改源编码', () => {
  const draft = setup();
  draft.products = [
    { 产品编码: 'N1', 大类: '汤圆', 老品编码: 'X' },
    { 产品编码: 'X', 大类: '水饺' },
    { 产品编码: 'A', 大类: '汤圆', 老品编码: 'Z' },
    { 产品编码: 'N2', 大类: '点心', 老品编码: 'Y' },
    { 产品编码: 'N3', 大类: '汤圆', 老品编码: 'Y' },
  ];
  draft.productPrices.rows = [
    { 产品编码: 'X', 未税到岸单价: '10' },
    { 产品编码: 'A', 未税到岸单价: '20' },
  ];
  draft.reportAmounts['2026-12'].rows = ['X', 'Z', 'Y'].map((产品编码, index) => ({
    月份: '2026-12',
    基地: '郑州',
    产品编码,
    月初计划金额: `${index + 1}0.00`,
    最终计划金额: `${index + 1}0.00`,
  }));
  const original = structuredClone(draft.reportAmounts);
  const rows = [{ ...demand('X', 1), category: '水饺' }, demand('A', 1)];
  const amounts = reconcileDemandAmounts(draft, {}, rows);
  assert.equal(amounts.rows[0].final.amount, '60.00');
  assert.equal(amounts.rows[0].missingDemand, 1);
  assert.equal(amounts.rows.find((row) => row.category === '水饺').final.amount, '10.00');
  assert.equal(amounts.rows.find((row) => row.category === '汤圆').final.amount, '20.00');
  assert.equal(amounts.rows.find((row) => row.category === '未归类').final.amount, '30.00');
  assert.deepEqual(draft.reportAmounts, original);
});

test('按月份搜索保留同范围源金额和有效需求差额', () => {
  const draft = setup();
  draft.productPrices.rows = [{ 产品编码: 'A', 未税到岸单价: '2' }];
  draft.reportAmounts['2026-12'].rows = [
    {
      月份: '2026-12',
      基地: '郑州',
      产品编码: 'A',
      月初计划金额: '10.00',
      最终计划金额: '12.00',
    },
  ];
  const total = reconcileDemandAmounts(draft, {}, [demand('A', 10)], { search: '2026-12' }).rows[0];
  assert.equal(total.initial.amount, '10.00');
  assert.equal(total.final.amount, '12.00');
  assert.equal(total.generatedAmount, '20.00');
  assert.equal(total.difference, '8.00');
});
