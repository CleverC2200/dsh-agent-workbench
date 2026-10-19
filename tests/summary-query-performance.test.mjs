import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const bundled = await build({
  entryPoints: ['business/shared/configured-facts.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { readConfiguredFacts } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
);
for (const agent of ['fc', 'qll', 'dealer'])
  test(`${agent}: overview reads one atomic aggregate without scanning detail/count`, async () => {
    const config = JSON.parse(
      await readFile(`business/inventory-${agent}/sql.config.json`, 'utf8'),
    );
    for (const id of config.overviewViewIds) {
      const view = config.sourceViews.views.find((v) => v.id === id),
        calls = [];
      const result = await readConfiguredFacts(
        config,
        id,
        { asOf: '2026-10-19' },
        {
          summaryOnly: true,
          execute: async (_, o) => {
            calls.push(o.queryId);
            const cols = config.queries[o.queryId].resultColumns;
            return {
              configVersion: 'v1',
              rows: [
                Object.fromEntries(
                  cols.map((k) => [
                    k,
                    k === 'day' ? '2026-10-18' : k === 'row_count' || k === 'total' ? 42 : 1,
                  ]),
                ),
              ],
            };
          },
        },
      );
      assert.equal(result.total, 42);
      assert.deepEqual(
        calls.filter((q) => q !== view.snapshotQuery && !q.startsWith('source.')),
        [view.summaryId],
      );
      assert.equal(result.consistency, 'single_statement_aggregate');
    }
  });
