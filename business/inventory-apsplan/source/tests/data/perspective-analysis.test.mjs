import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from './public-build.mjs';
const result = await build({
  entryPoints: [fileURLToPath(new URL('../../app/data/perspective-analysis.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { analyzePerspective, analyzeProductionMatrix, matrixCellsFromData } = await import(
  'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
);
test('four perspectives use visible values without missing-data list', () => {
  const metrics = [
    { name: '销售预算达成率', value: 90, unit: '%' },
    { name: '订单满足率', value: 90, unit: '%' },
    { name: '库存量', value: 42, unit: '万箱' },
  ];
  const overview = analyzePerspective('overview', '9月', metrics);
  assert.equal(overview.total, 2);
  assert.equal(overview.score, 0);
  assert.match(overview.copy, /销售预算达成率90%（严重/);
  assert.match(overview.copy, /订单满足率90%（预警/);
  assert.match(overview.copy, /库存量42万箱/);
  const sales = analyzePerspective('sales', '9月', metrics);
  assert.doesNotMatch(sales.copy, /订单满足率|缺失|待接入/);
  const production = analyzePerspective('production', '9月', metrics);
  assert.doesNotMatch(production.copy, /销售预算达成率|缺失|待接入/);
});
test('matrix recomputes percentages from quantities and ranks an existing combination', () => {
  const data = {
    sections: [
      {
        id: 'orders',
        status: 'ready',
        rows: [
          { base: '遂平', category: '水饺', demand: 100, shortage: 12, invalid: 0 },
          { base: '遂平', category: '水饺', demand: 900, shortage: 20, invalid: 0 },
          { base: '郑州', category: '汤圆', demand: 100, shortage: 15, invalid: 0 },
        ],
      },
    ],
  };
  const cells = matrixCellsFromData(data, '订单满足率');
  assert.equal(cells.find((x) => x.scope === '遂平 × 水饺').value, 96.8);
  const analysis = analyzeProductionMatrix('订单满足率', '9月', cells);
  assert.match(analysis.copy, /郑州 × 汤圆订单满足率85%/);
  assert.doesNotMatch(analysis.copy, /缺失|待接入/);
  assert.deepEqual(matrixCellsFromData(data, '生产计划达成率'), []);
});

test('matrix retains configured inventory totals despite unrelated plan gaps', () => {
  const data = {
    missingValuePolicy: 'zero',
    sections: [
      {
        id: 'stock',
        status: 'ready',
        rows: [
          { base: '华东', category: '汤圆', inventory: 100, available: 80, demand: 5, invalid: 2 },
          { base: '华南', category: '水饺', inventory: 0, available: 0, demand: 2, invalid: 1 },
        ],
      },
    ],
  };
  assert.deepEqual(
    matrixCellsFromData(data, '库存量').map(({ scope, value }) => ({ scope, value })),
    [
      { scope: '华东 × 汤圆', value: 0.01 },
      { scope: '华南 × 水饺', value: 0 },
    ],
  );
});

test('shippable matrix divides available quantity by summed demand and preserves zero denominators', () => {
  const data = {
    missingValuePolicy: 'zero',
    sections: [
      {
        id: 'shippable',
        status: 'ready',
        rows: [
          { base: '华东', category: '汤圆', inventory: 100, available: 30, demand: 2, invalid: 1 },
          { base: '华东', category: '汤圆', inventory: 200, available: 50, demand: 6, invalid: 1 },
          { base: '华南', category: '水饺', inventory: 100, available: 100, demand: 0, invalid: 0 },
        ],
      },
    ],
  };
  assert.deepEqual(
    matrixCellsFromData(data, '可发货天数').map(({ scope, value }) => ({ scope, value })),
    [{ scope: '华东 × 汤圆', value: 10 }],
  );
  data.sections[0].status = 'error';
  data.sections.push({
    id: 'stock',
    status: 'ready',
    rows: [
      { base: '华东', category: '汤圆', inventory: 100, available: 80, demand: 10, invalid: 0 },
    ],
  });
  assert.deepEqual(matrixCellsFromData(data, '可发货天数'), []);
});

test('empty matrix analysis stays with its selected metric', () => {
  const result = analyzeProductionMatrix('生产计划达成率', '10月', []);
  assert.match(result.title, /生产计划达成率暂无可评价组合/);
  assert.match(result.copy, /不依据公司汇总推断组合表现/);
  assert.equal(result.total, 0);
});

test('production matrix uses grouped MES quantities, with the same zero-fill rule as its headline', () => {
  const data = {
    missingValuePolicy: 'zero',
    sections: [
      {
        id: 'production',
        status: 'ready',
        rows: [
          {
            base: '华东',
            category: '汤圆',
            planned: 100,
            actual: 110,
            source_basis: 'MES_QUANTITY',
            invalid: 1,
          },
          {
            base: '华东',
            category: '汤圆',
            planned: 900,
            actual: 810,
            source_basis: 'MES_QUANTITY',
            invalid: 0,
          },
          {
            base: '华南',
            category: '水饺',
            planned: 0,
            actual: 0,
            source_basis: 'MES_QUANTITY',
            invalid: 0,
          },
        ],
      },
    ],
  };
  assert.deepEqual(
    matrixCellsFromData(data, '生产计划达成率').map(({ scope, value }) => ({ scope, value })),
    [{ scope: '华东 × 汤圆', value: 92 }],
  );
});
