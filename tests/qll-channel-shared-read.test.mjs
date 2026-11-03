import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { overviewReply } from './fixtures/overview-reply.mjs';
const config = JSON.parse(await readFile('business/inventory-qll/sql.config.json', 'utf8'));
const built = await build({
  stdin: {
    contents:
      "export {readConfiguredFacts} from './business/shared/configured-facts'; export {categoryTreeReader} from './business/shared/qll-category-tree';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readConfiguredFacts, categoryTreeReader } = await import(
  'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
);
test('channel card and category list share one authorized snapshot-date request', async () => {
  const calls = [];
  const execute = async (_, { queryId }) => {
    calls.push(queryId);
    await new Promise(setImmediate);
    return overviewReply(config, queryId, '2026-11-01');
  };
  const cardView = config.sourceViews.views.find(
    (v) => v.summaryQuery === 'dealer.stock.summary' || v.queryId === 'dealer.stock.detail',
  );
  assert.ok(cardView);
  const [card, tree] = await Promise.all([
    readConfiguredFacts(
      config,
      cardView.id,
      { asOf: '2026-11-03' },
      { execute, summaryOnly: true },
    ),
    categoryTreeReader(config, execute)(
      'customer',
      { date: '2026-11-03', level: 'category' },
      new AbortController().signal,
    ),
  ]);
  assert.equal(card.snapshotDate, '2026-11-01');
  assert.equal(tree.snapshot, '2026-11-01');
  assert.equal(calls.filter((id) => id === 'source.dealer-stock-date').length, 1);
});
