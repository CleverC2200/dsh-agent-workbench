import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWeightPairs } from '../static/mps/source/plan-inputs.js';

globalThis.window = { addEventListener() {}, parent: { postMessage() {} } };
const { capacityAnnualRows } = await import('../static/mps/source/master-data.js');
delete globalThis.window;

test('年度额外SKU和额外基地复用唯一有效系数，人工值优先且空渠道仍待补', () => {
  const source = {
    rows: [
      { material_code: 'A', channel_name: '经销', ton_per_piece: 0.01 },
      { material_code: 'B', channel_name: '经销', ton_per_piece: 0.02 },
      { material_code: 'C', channel_name: null, ton_per_piece: null },
    ],
  };
  const pairs = [
    { base: '华东', code: 'A' },
    { base: '华东', code: 'B' },
    { base: '华南', code: 'B' },
    { base: '华东', code: 'C' },
  ];
  const result = resolveWeightPairs(
    [{ base: '华东', code: 'B', tonsPerPiece: 0.03 }],
    pairs,
    source,
  );
  assert.equal(
    result.weights.find((row) => row.base === '华东' && row.code === 'B').tonsPerPiece,
    0.03,
  );
  assert.equal(
    result.weights.find((row) => row.base === '华南' && row.code === 'B').tonsPerPiece,
    0.02,
  );
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0].reason, /缺来源渠道/);
});

test('年度源中的无SKU汇总行不拒绝整批有效明细，缺维度及冲突保留诊断', () => {
  const valid = { stat_month: 'Jul-26', belong_base: '华东', material_code: 'A', demand_qty: 10 };
  const result = capacityAnnualRows(
    [
      valid,
      { ...valid, material_code: null },
      { ...valid, material_code: 'B', belong_base: null },
      { ...valid, material_code: 'C', stat_month: '无法识别' },
    ],
    ['2026-07'],
  );
  assert.deepEqual(result.rows, [{ month: '2026-07', base: '华东', code: 'A', quantity: 10 }]);
  assert.equal(result.excludedRows, 1);
  assert.equal(result.unmapped.length, 2);
  assert.equal(
    capacityAnnualRows([valid, { ...valid, demand_qty: 20 }], ['2026-07']).rows[0].quantity,
    null,
  );
});
