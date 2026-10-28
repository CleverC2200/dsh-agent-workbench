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
    const config = JSON.parse(
      await readFile(`business/inventory-${agent}/sql.config.json`, 'utf8'),
    );
    const calls = [],
      progress = [];
    let release;
    const blocked = new Promise((resolve) => {
      release = resolve;
    });
    const load = readConfiguredOverview(config, '2026-10-28', '', {
      viewIds: ['orders', 'branch-stock'],
      onProgress: (value) => progress.push(value),
      execute: async (_, options) => {
        calls.push(options.queryId);
        if (options.queryId === config.overviewQuickStock) {
          await blocked;
          return { configVersion: 'v1', rows: [] };
        }
        return {
          configVersion: 'v1',
          rows: [
            Object.fromEntries(
              config.queries[options.queryId].resultColumns.map((k) => [
                k,
                k === 'day' ? '2026-10-28' : 1,
              ]),
            ),
          ],
        };
      },
    });
    await new Promise(setImmediate);
    const ordersReady = progress.some((value) => value.orders?.summary);
    release();
    await load;
    assert.ok(ordersReady, `orders waited for quick stock; initial calls: ${calls.join(', ')}`);
  });

  test(`${agent}: dependent summaries reuse the quick-stock snapshot`, async () => {
    const config = JSON.parse(
      await readFile(`business/inventory-${agent}/sql.config.json`, 'utf8'),
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
        return {
          configVersion: 'v1',
          rows: [
            Object.fromEntries(
              config.queries[options.queryId].resultColumns.map((k) => [
                k,
                k === 'day' ? '2026-10-28' : k === 'invalid' ? 0 : 1,
              ]),
            ),
          ],
        };
      },
    });
    assert.equal(calls.filter((id) => id === config.overviewQuickStock).length, 1);
    assert.ok(!calls.includes('source.branch-stock-date'), calls.join(', '));
  });
}
