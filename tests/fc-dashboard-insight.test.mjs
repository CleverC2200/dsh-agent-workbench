import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
await mkdir('.scratch', { recursive: true });
const result = await build({
  entryPoints: ['business/shared/fc-dashboard-insight.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
await writeFile('.scratch/fc-insight.mjs', result.outputFiles[0].text);
const { branchDashboardEvidence } = await import('../.scratch/fc-insight.mjs');
const input = () => ({
  warehouseCode: 'A160',
  warehouseName: '南京分仓',
  asOf: '2026-10-29',
  cycleDays: 7,
  localPlanTrial: false,
  recommendedQty: 30,
  missingCalculationCount: 1,
  currentOrderShortageQty: 10,
  parts: {
    replenishment: {
      snapshotDate: '2026-10-28',
      summary: {
        row_count: 2,
        available_qty: 100,
        known_target_inventory_qty: 80,
        order_adjusted_available_qty: 60,
        known_inventory_deviation_qty: -20,
        comparable_target_inventory_qty: 80,
        comparable_sku_count: 2,
        missing_order_adjusted_count: 0,
        missing_target_count: 0,
        known_shortage_sku_count: 1,
      },
    },
    'current-shortage': { rows: [{ shortage: 10 }] },
    'branch-stock': { summary: { total_qty: 120, overaged_qty: 40, stagnant_qty: 20 } },
  },
});
test('branch insight compares target with order-adjusted stock and never substitutes a current page ranking or 90-day amount', () => {
  const p = input(),
    e = branchDashboardEvidence(p);
  assert.equal(e.totals.currentAvailableQty, 100);
  assert.equal(e.totals.inventoryDeviationQty, -20);
  assert.equal(e.totals.inventoryDeviationPercent, -25);
  assert.equal(e.totals.currentOrderShortageQty, 10);
  assert.equal(e.coverage.kind, '全范围可比');
  assert.equal(e.aging.days91PlusQty, null);
  assert.equal(e.rankings.shortage, null);
  p.parts.replenishment.rows = [{ sku: 'visible-only', recommended_qty: 999999 }];
  assert.deepEqual(branchDashboardEvidence(p), e);
});
test('partial target coverage, local trials and failed sources remain bounded rather than turning unknowns into zero', () => {
  const p = input();
  p.parts.replenishment.summary.comparable_sku_count = 1;
  p.parts.replenishment.summary.missing_target_count = 1;
  let e = branchDashboardEvidence(p);
  assert.match(e.coverage.kind, /子集/);
  assert.equal(e.totals.targetMissingSkuCount, 1);
  assert.equal(e.totals.targetInventoryQty, null);
  assert.equal(e.totals.inventoryDeviationQty, null);
  assert.equal(e.totals.inventoryDeviationPercent, null);
  assert.equal(e.comparison.orderAdjustedAvailableQty, 60);
  assert.equal(e.comparison.targetInventoryQty, 80);
  assert.equal(e.comparison.inventoryDeviationQty, -20);
  assert.equal(e.comparison.inventoryDeviationPercent, -25);
  assert.equal(e.skuIntersections.missingTargetAndCalculation, null);
  p.localPlanTrial = true;
  e = branchDashboardEvidence(p);
  assert.equal(e.totals.targetInventoryQty, null);
  assert.equal(e.totals.inventoryDeviationQty, null);
  p.parts['current-shortage'].error = 'DENIED';
  e = branchDashboardEvidence(p);
  assert.equal(e.totals.currentOrderShortageQty, null);
  assert.equal(e.totals.currentAvailableQty, 100);
  assert.equal(e.coverage.failures[0].source, 'current-shortage');
});
test('branch dashboard owns the supplied prompt without replacing Agent Skills', async () => {
  const prompt = await readFile('business/inventory-fc/insight-prompt.md', 'utf8');
  assert.match(prompt, /150–200/);
  assert.match(prompt, /91 天及以上/);
  assert.match(prompt, /建议补货量已扣调拨中/);
  assert.match(prompt, /不另起小标题、不分点、不换行排版/);
});

test('current supply evidence uses the same ASN pool as cards, never the retired execution pool', () => {
  const p = input();
  p.parts['current-shortage'] = { rows: [{ demand: 70, allocated: 20, remaining: 50 }] };
  p.parts['branch-supply-current'] = { summary: { demand: 9000, pending: 8000, in_transit: 7000 } };
  p.parts.replenishment.summary.known_in_transit = 40;
  const e = branchDashboardEvidence(p);
  assert.equal(e.baseSupply.currentDemandQty, 70);
  assert.equal(e.baseSupply.currentBaseAllocatedQty, 20);
  assert.equal(e.baseSupply.pendingQty, 50);
  assert.equal(e.baseSupply.inTransitQty, 40);
  p.parts['current-shortage'].error = 'DENIED';
  assert.equal(branchDashboardEvidence(p).baseSupply.currentDemandQty, null);
});
