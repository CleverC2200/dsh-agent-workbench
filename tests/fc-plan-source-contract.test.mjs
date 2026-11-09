import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const compiled = await build({
  stdin: {
    contents:
      "export * from './business/inventory-fc/source/inventory-light-plugins/src/pages/fc-workflow.ts'; export {currentPlanningMonth} from './business/inventory-fc/source/fc/src/lib/planning.ts';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'no-network',
      setup(api) {
        api.onResolve({ filter: /shared\/configured-facts$/ }, () => ({
          path: 'facts',
          namespace: 'fixture',
        }));
        api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: 'export const readConfiguredFacts=()=>{throw Error("unexpected query")};',
        }));
      },
    },
  ],
});
const { validateFcImport, applyFcPlan, currentPlanningMonth } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const source = [
  {
    warehouse_code: 'W1',
    warehouse_name: '分仓',
    sku: 'SKU1',
    warehouse_month_transfer_plan: null,
  },
];
const base = {
  仓库编号: 'W1',
  SKU编码: 'SKU1',
  月份: currentPlanningMonth(),
  本月出货计划: 310,
  本月调拨计划: '',
};
test('explicit plan imports treat blanks as zero like the original, without converting missing source values', () => {
  for (const value of ['', '   ', undefined]) {
    const result = validateFcImport([{ ...base, 本月调拨计划: value }], source);
    assert.deepEqual(result.errors, []);
    assert.equal(result.plans[0].transferQty, 0);
  }
  const zero = validateFcImport([{ ...base, 本月调拨计划: 0 }], source);
  assert.deepEqual(zero.errors, []);
  assert.equal(zero.plans[0].transferQty, 0);
  assert.equal(zero.plans[0].outboundQty, 310);
  const modern = validateFcImport(
    [
      {
        仓库编码: 'W1',
        产品编码: 'SKU1',
        计划月份: currentPlanningMonth(),
        确认出货计划量: 310,
        确认调拨计划量: '',
      },
    ],
    source,
  );
  assert.deepEqual(modern.errors, []);
  assert.equal(modern.plans[0].transferQty, 0);
});
test('no local plan preserves the monthly transfer gap; explicit local input stays a local trial', () => {
  const date = currentPlanningMonth() + '-01';
  assert.equal(applyFcPlan(source[0], [], date, 7).warehouse_month_transfer_plan, null);
  const plans = validateFcImport([{ ...base, 本月调拨计划: 15 }], source).plans;
  const applied = applyFcPlan(source[0], plans, date, 7);
  assert.equal(applied.warehouse_month_transfer_plan, 15);
  assert.equal(applied.plan_source, '人工导入试算');
  assert.equal(source[0].warehouse_month_transfer_plan, null);
});

test('a 92-row import retains every valid row and reports all invalid rows with their Excel numbers', () => {
  const allowed = Array.from({ length: 92 }, (_, index) => ({
    warehouse_code: 'A160',
    warehouse_name: '南京分仓',
    sku: String(10000000 + index),
    available_qty: 0,
    calculation_order_remaining: 0,
    open_transfer_reported_qty: 0,
    cycle_days: 5,
  }));
  const rows = allowed.map((row, index) => ({
    仓库编号: row.warehouse_code,
    SKU编码: row.sku,
    月份: currentPlanningMonth(),
    产品名称: '导入验证商品' + index,
    本月出货计划: 90 + index,
    本月调拨计划: 100 + index,
  }));
  const imported = validateFcImport(rows, allowed);
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.plans.length, 92);
  const calculated = allowed.map((row) =>
    applyFcPlan(row, imported.plans, currentPlanningMonth() + '-05', 5),
  );
  assert.equal(calculated.length, 92);
  const [year, month] = currentPlanningMonth().split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (const [index, row] of calculated.entries()) {
    assert.equal(row.month_out_plan, 90 + index);
    assert.equal(row.warehouse_month_transfer_plan, 100 + index);
    assert.equal(row.recommended_qty, Math.ceil((90 + index) / daysInMonth) * 8);
  }
  const invalid = rows.map((row) => ({ ...row }));
  invalid[2].本月出货计划 = '不是数字';
  invalid[60].本月调拨计划 = -1;
  const result = validateFcImport(invalid, allowed);
  assert.deepEqual(
    result.errors.map((error) => error.row),
    [4, 62],
  );
  assert.equal(invalid.length, 92);
});
