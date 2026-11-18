import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(
  new URL(
    '../business/inventory-orderworkbench/data-provider/daily-incremental.sql',
    import.meta.url,
  ),
  'utf8',
);

test('daily SQL is standalone and reads its existing checkpoint rather than embedding takeover state', () => {
  assert.ok(Buffer.byteLength(sql) < 1000000);
  assert.doesNotMatch(sql, /\$\{|:(?:gea_p\d+|as_of|inventory_end|order_end|relation_end)\b/);
  assert.match(sql, /FROM partitions\(/);
  assert.match(sql, /checkpointFormat.*sql-family-v1/);
  assert.equal(
    /SELECT '(?:cancellation|amendment|fulfillment|inventory)' family,'[^']+' source,'[^']+' (?:role|`role`),\d+ b,'/.test(
      sql,
    ),
    false,
    'No embedded takeover progress rows',
  );
});

test('daily SQL only mutates the result and its own working tables, and publishes deletion markers atomically', () => {
  for (const statement of sql.matchAll(
    /\b(?:INSERT\s+INTO|UPDATE|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|DROP\s+TABLE(?:\s+IF\s+EXISTS)?|TRUNCATE\s+TABLE)\s+([\w.]+)/gi,
  ))
    assert.match(statement[1], /^ai_db\.(?:order_kpi_result_v1|order_kpi_ds_\w+)$/);
  assert.doesNotMatch(
    sql,
    /(?:TRUNCATE\s+TABLE|DROP\s+TABLE(?:\s+IF\s+EXISTS)?)\s+ai_db\.order_kpi_result_v1\b/i,
  );
  assert.match(sql, /INSERT INTO ai_db\.order_kpi_result_v1[^;]*__DORIS_DELETE_SIGN__/);
  assert.match(sql, /80_publish_guard/);
  assert.match(sql, /82_visible_guard/);
});
