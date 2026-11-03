import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = { addEventListener() {}, parent: { postMessage() {} } };
const { forecastRows, forecastDimensions } = await import('../static/mps/source/source-tables.js');
delete globalThis.window;

test('forecast source codes identify SKUs and use current master group codes without expanding members', () => {
  const rows = forecastRows(
    [
      {
        stat_month: '2026/10',
        belong_base: '华东',
        material_code: '10000001',
        material_name: null,
        current_month_forecast_qty: 80,
        next_month_forecast_qty: 0,
        source_rows: 9,
      },
    ],
    '2026-10',
  );
  const members = ['10000001', '10000002'].map((code) => ({
    产品编码: code,
    物料组: '101005',
    物料组名称: '水饺组',
    大类: '饺子',
    系列: '系列甲',
  }));
  const mapped = forecastDimensions(rows, members);
  assert.equal(mapped[0]['数量'], 80);
  assert.equal(mapped[1]['数量'], 0);
  assert.equal(mapped[0]['物料组'], '101005');
  assert.equal(mapped[0]['物料组名称'], '水饺组');
  assert.equal(mapped[0]['产品编码'], '10000001');
  assert.equal(mapped[0]['大类'], '饺子');
  assert.equal(mapped[0]['源记录数'], 9);
  assert.equal(mapped[0]['缺项原因'], '');
  const ambiguous = forecastDimensions(rows, [members[0], { ...members[0], 大类: '汤圆' }]);
  assert.equal(ambiguous[0]['大类'], '');
  assert.equal(ambiguous[0]['数量'], 80);
  assert.match(ambiguous[0]['缺项原因'], /大类.*多个/);
});
