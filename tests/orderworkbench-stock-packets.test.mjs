import test from 'node:test';
import assert from 'node:assert/strict';
import { addWorkbenchQueries } from '../business/inventory-orderworkbench/queries.mjs';
import { addWorkbenchSummaryQueries } from '../business/inventory-orderworkbench/summary-queries.mjs';

test('stock packets have one final ordering before gateway pagination', () => {
  const config = addWorkbenchSummaryQueries(addWorkbenchQueries({ queries: {} }));
  for (const id of [
    'workbench.stock.summary.packets',
    'workbench.stock.periods.summary',
    'workbench.ages.periods.summary',
    'workbench.changes.periods.summary',
  ]) {
    const query = config.queries[id];
    assert.match(
      query.request.sql,
      /ORDER BY packet_index LIMIT :gea_p1001 OFFSET :gea_p1002$/,
      id,
    );
    assert.doesNotMatch(query.request.sql, /ORDER BY packet_index\s+ORDER BY/i, id);
    assert.equal((query.request.sql.match(/ORDER BY packet_index/g) ?? []).length, 1, id);
    const count = config.queries[query.pagination.countQuery];
    assert.doesNotMatch(count.request.sql, /ORDER BY packet_index\s+ORDER BY/i, id);
  }
});
