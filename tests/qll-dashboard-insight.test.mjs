import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const out = await build({
  entryPoints: ['business/shared/qll-dashboard-insight.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { chainDashboardEvidence } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('company insight uses physical stock and retains channel signal with switch off', () => {
  const parts = {
    health: {
      summary: { total_qty: 100, weighted_age_sum: 200, age_weight_qty: 100 },
      snapshotDate: '2026-10-30',
    },
    'branch-stock': {
      summary: { total_qty: 50, available_qty: 10, weighted_age_sum: 200, age_weight_qty: 50 },
      snapshotDate: '2026-10-30',
    },
    'channel-overview': { summary: { total_inventory: 20 }, snapshotDate: '2026-10-29' },
  };
  const off = chainDashboardEvidence(parts, '2026-10-30', false);
  const on = chainDashboardEvidence(parts, '2026-10-30', true);
  assert.equal(off.totals.companyInventory, 150);
  assert.equal(on.totals.companyInventory, 150);
  assert.equal(off.channel.inventory, 20);
  assert.match(off.channel.usage, /未计入主值/);
  assert.equal(off.rankings, null);
  assert.equal(off.totals.currentOrderShortage, null);
  assert.equal(
    chainDashboardEvidence({ ...parts, 'branch-stock': undefined }, '2026-10-30', false).totals
      .companyInventory,
    null,
  );
});
test('different inventory dates do not become one company total', () => {
  const evidence = chainDashboardEvidence(
    {
      health: { summary: { total_qty: 100 }, snapshotDate: '2026-10-30' },
      'branch-stock': { summary: { total_qty: 50 }, snapshotDate: '2026-10-29' },
    },
    '2026-10-30',
    false,
  );
  assert.equal(evidence.totals.companyInventory, null);
  assert.match(evidence.coverage.missing.join(' '), /快照不同日/);
});
