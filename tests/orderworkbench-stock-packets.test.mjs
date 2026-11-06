import test from 'node:test';
import assert from 'node:assert/strict';
import { addWorkbenchQueries } from '../business/inventory-orderworkbench/queries.mjs';
import { addWorkbenchSummaryQueries } from '../business/inventory-orderworkbench/summary-queries.mjs';

test('stock packets have one final ordering before gateway pagination', () => {
  const config = addWorkbenchSummaryQueries(addWorkbenchQueries({ queries: {} }));
  const query = config.queries['workbench.stock.summary.packets'];
  assert.match(query.request.sql, /ORDER BY packet_index LIMIT :gea_p1001 OFFSET :gea_p1002$/);
  assert.doesNotMatch(query.request.sql, /ORDER BY packet_index\s+ORDER BY/i);
  assert.equal((query.request.sql.match(/ORDER BY packet_index/g) ?? []).length, 1);
  const count = config.queries[query.pagination.countQuery];
  assert.doesNotMatch(count.request.sql, /ORDER BY packet_index\s+ORDER BY/i);
});
