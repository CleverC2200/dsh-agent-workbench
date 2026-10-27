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
test('blank imported monthly quantities never become zero; an explicit zero remains valid', () => {
  for (const value of ['', '   ', undefined]) {
    const result = validateFcImport([{ ...base, 本月调拨计划: value }], source);
    assert.equal(result.plans.length, 0);
    assert.ok(result.errors.some((error) => error.field === '本月调拨计划'));
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
  assert.ok(modern.errors.some((error) => error.field === '确认调拨计划量'));
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
