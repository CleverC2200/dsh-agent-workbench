import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { addEventListener() {}, parent: { postMessage() {} } };
const { capacityAnnualRows } = await import('../static/mps/source/master-data.js');
delete globalThis.window;

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
