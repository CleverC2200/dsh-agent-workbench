import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { migrationHistory } from './helpers/migration-history.mjs';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const fixed = '67e1007aa400a8a9c65c132f144dabd5168a49df';
async function engine(source) {
  const result = await build({
    stdin: {
      contents: `export {dealerOverviewFacts} from '${source.includes('business/inventory-dealer') ? 'dsh-agent-manage/inventory-compute/dealer-overview-facts' : source + '/dealer/web/src/lib/dealer-overview-facts.ts'}';export {suggestedStockQuantity} from '${source.includes('business/inventory-dealer') ? 'dsh-agent-manage/inventory-compute/dealer-recommendation' : source + '/dealer/web/src/lib/dealer-demo-live-data.ts'}';export {dealerWorkbenchSql} from '${source}/dealer/web/src/lib/dealer-workbench-sql.ts';export {makeDraft,draftProblems} from '${source}/inventory-light-plugins/src/dealer-draft.ts';export {applicablePolicies,orderTotals} from '${source.endsWith('/source') && source.includes('business/inventory-dealer') ? 'dsh-agent-manage/inventory-compute/dealer-order' : source + '/inventory-light-plugins/src/dealer-order.ts'}';`,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    define: { 'process.env': '{}' },
    plugins: [
      {
        name: 'read-only-source',
        setup(api) {
          api.onResolve({ filter: /^server-only$/ }, () => ({
            path: 'empty',
            namespace: 'empty',
          }));
          api.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({
            contents: 'export {};',
          }));
          api.onResolve({ filter: /(gea-sql-client|dealer-direct-sql-client)$/ }, () => ({
            path: resolve(source, 'inventory-light-plugins/src/data.ts'),
          }));
          api.onResolve({ filter: /dealer-sap-pricing$/ }, () => ({
            path: resolve(source, 'inventory-light-plugins/src/platform-pending.ts'),
          }));
          api.onResolve({ filter: /^@\// }, (args) =>
            api.resolve(resolve(source, 'dealer/web/src', args.path.slice(2)), {
              kind: args.kind,
              resolveDir: source,
            }),
          );
          api.onResolve({ filter: /channel\.js$/ }, () => ({
            path: 'channel',
            namespace: 'channel',
          }));
          api.onLoad({ filter: /.*/, namespace: 'channel' }, () => ({
            contents: 'export const call=()=>{throw Error("GOLDEN_TEST_MUST_NOT_READ_BUSINESS");};',
          }));
        },
      },
    ],
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    createRequire(import.meta.url),
    mod,
    mod.exports,
  );
  return mod.exports;
}
test('migration retains fixed-source metrics, SQL scope, recommendation and local-draft rules', async (t) => {
  await mkdir('.runtime', { recursive: true });
  const temporary = await mkdtemp(resolve('.runtime/dealer-golden-'));
  const original = migrationHistory('dealer', process.env.WORKBENCH_DEALER_HISTORY_ROOT);
  assert.equal(original.commit, fixed);
  t.after(() => rm(temporary, { recursive: true, force: true }));
  for (const [file, entry] of Object.entries(original.files)) {
    const target = resolve(temporary, file);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, entry.text);
  }
  const before = await engine(resolve(temporary, 'source')),
    after = await engine(resolve('business/inventory-dealer/source'));
  const plan = {
    inventory: 60,
    inTransit: 12,
    dailySales: 2,
    targetInventory: 100,
    reasonableSkuCount: 3,
    unreasonableSkuCount: 2,
    shortageSkuCount: 1,
    coveredSkuCount: 4,
    skuCount: 5,
  };
  const daily = {
    coverageComplete: true,
    stockQtyComplete: true,
    inTransitQtyComplete: true,
    sales30DailyAverageComplete: true,
    inventory: 90,
    inTransit: 30,
    sales30: 120,
    stockAmountCoverage: 1,
    stockAmount: 2500,
    customerCount: 1,
  };
  for (const [p, d] of [
    [plan, daily],
    [plan, { ...daily, coverageComplete: false }],
    [plan, { ...daily, stockQtyComplete: false, stockAmountCoverage: 0 }],
    [null, null],
  ])
    assert.deepEqual(after.dealerOverviewFacts(p, d), before.dealerOverviewFacts(p, d));
  assert.equal(after.dealerOverviewFacts(plan, daily).averageCover, 30);
  assert.equal(after.dealerOverviewFacts(null, null).inventory, null);
  for (const values of [
    [100, 60, 12],
    [100, 100, 0],
    [null, 50, 1],
    [100, -1, 2],
    [100, 50, null],
  ])
    assert.equal(after.suggestedStockQuantity(...values), before.suggestedStockQuantity(...values));
  assert.equal(after.suggestedStockQuantity(100, 60, 12), 28);
  for (const [name, args] of [
    ['latestSnapshot', [[]]],
    ['latestSnapshot', [['customer-A']]],
    ['latestInventoryDailySnapshot', [['customer-A']]],
    ['inventoryDailySummary', ['2026-09-30', ['customer-A']]],
    [
      'inventoryDailyDetails',
      ['2026-09-30', [{ customerCode: 'customer-A', materialCode: 'sku-A' }]],
    ],
  ])
    assert.deepEqual(
      after.dealerWorkbenchSql[name](...args),
      before.dealerWorkbenchSql[name](...args),
      name,
    );
  const row = {
    code: 'sku-A',
    sku: '汤圆',
    dealerCode: 'customer-A',
    suggestedStockQty: 28,
    liveReason: 'fixed input',
  };
  const now = new Date('2026-10-01T00:00:00Z');
  assert.deepEqual(
    after.makeDraft(row, 'customer-A', false, now),
    before.makeDraft(row, 'customer-A', false, now),
  );
  assert.throws(() => after.makeDraft(row, 'customer-B', false, now));
  assert.throws(() =>
    after.makeDraft({ ...row, suggestedStockQty: null }, 'customer-A', false, now),
  );
  const drafts = [
    {
      customerCode: 'customer-A',
      code: 'sku-A',
      quantity: 20,
      suggestedQuantity: 28,
      source: 'suggestion',
      reason: '人工复核',
      unitPrice: null,
    },
  ];
  assert.deepEqual(after.draftProblems(drafts), before.draftProblems(drafts));
  assert.deepEqual(after.orderTotals(drafts), before.orderTotals(drafts));
  assert.equal(after.orderTotals(drafts).amount, null);
  const policies = [
    {
      customerCode: 'customer-A',
      verifiedPickupCodes: ['pickup-A'],
      scopes: [{ productCode: 'sku-A', pickupCode: 'pickup-A' }],
    },
    {
      customerCode: 'customer-B',
      verifiedPickupCodes: ['pickup-A'],
      scopes: [{ productCode: 'sku-A', pickupCode: 'pickup-A' }],
    },
  ];
  assert.deepEqual(
    after.applicablePolicies(policies, 'customer-A', 'sku-A', 'pickup-A', now),
    before.applicablePolicies(policies, 'customer-A', 'sku-A', 'pickup-A', now),
  );
  assert.equal(after.applicablePolicies(policies, 'customer-A', 'sku-A', 'wrong', now).length, 0);
  for (const file of [
    'exceptions',
    'filter-labels',
    'fuse-rules',
    'metric-cards',
    'report-templates',
    'split-params',
    'stock-health',
  ])
    assert.equal(
      await readFile(
        resolve('../dsh-agent-manage/src/inventory-compute/dealer-config/' + file + '.json'),
        'utf8',
      ),
      await readFile(
        resolve(temporary, 'source/dealer/config/biz-rules/' + file + '.json'),
        'utf8',
      ),
      file,
    );
});
