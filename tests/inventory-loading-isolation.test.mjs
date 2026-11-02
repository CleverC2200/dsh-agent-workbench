import { sourceDetailConfig } from './fixtures/source-detail-config.mjs';
import { overviewReply, untilObserved } from './fixtures/overview-reply.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const output = await build({
  entryPoints: ['business/shared/configured-overview.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readConfiguredOverview } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
);

for (const agent of ['fc', 'qll']) {
  test(`${agent}: slow quick stock must not block independent order cards`, async () => {
    const config = sourceDetailConfig(
      JSON.parse(await readFile(`business/inventory-${agent}/sql.config.json`, 'utf8')),
    );
    const ready = agent === 'fc' ? 'branch-supply' : 'factory-overview';
    const slow = config.overviewQuickStock ?? 'source.branch-stock-date';
    const calls = [],
      progress = [];
    let release;
    const blocked = new Promise((resolve) => {
      release = resolve;
    });
    const load = readConfiguredOverview(config, '2026-10-28', '', {
      viewIds: [ready, 'branch-stock'],
      onProgress: (value) => progress.push(value),
      execute: async (_, options) => {
        calls.push(options.queryId);
        if (options.queryId === slow) {
          await blocked;
          return { configVersion: 'v1', rows: [] };
        }
        return overviewReply(config, options.queryId, '2026-10-28');
      },
    });
    await untilObserved(() => progress.some((value) => value[ready]?.summary));
    const ordersReady = progress.some((value) => value[ready]?.summary);
    release();
    await load;
    assert.ok(ordersReady, `orders waited for quick stock; initial calls: ${calls.join(', ')}`);
  });

  test(`${agent}: dependent summaries share one inventory snapshot read`, async () => {
    const config = sourceDetailConfig(
      JSON.parse(await readFile(`business/inventory-${agent}/sql.config.json`, 'utf8')),
    );
    const calls = [];
    const replenishment = agent === 'fc' ? 'replenishment' : 'branch-replenishment';
    await readConfiguredOverview(config, '2026-10-28', '', {
      viewIds: ['orders', 'branch-stock', replenishment],
      execute: async (_, options) => {
        calls.push(options.queryId);
        if (options.queryId === config.overviewQuickStock) {
          await new Promise(setImmediate);
          return {
            configVersion: 'v1',
            rows: [
              {
                location_type: '分仓',
                snapshot_date: '2026-10-28',
                row_count: 1,
                total_qty: 4,
                available_qty: 3,
                pack_unit_qty: 1,
                freeze_qty: 0,
              },
            ],
          };
        }
        return overviewReply(config, options.queryId, '2026-10-28');
      },
    });
    if (agent === 'fc') {
      assert.ok(!calls.includes('overview.quick-stock'));
      assert.equal(calls.filter((id) => id === 'source.branch-stock-date').length, 1);
      assert.ok(
        !calls.includes('health.inventory'),
        'snapshot already contains inventory quantities',
      );
      assert.ok(calls.includes('health.cards'));
    } else {
      assert.equal(calls.filter((id) => id === config.overviewQuickStock).length, 1);
      assert.ok(!calls.includes('source.branch-stock-date'), calls.join(', '));
    }
  });
}
