import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('monthly incoming uses the transaction ledger and remains independent of WMS outgoing', () => {
  const result = spawnSync('python3', ['scripts/test_fc_warehouse_movement.py'], {
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('suggestion-page month-end inventory reads the current page row and preserves missing plans', async () => {
  const { readFile } = await import('node:fs/promises');
  const { DatabaseSync } = await import('node:sqlite');
  const config = JSON.parse(await readFile('business/inventory-fc/sql.config.json', 'utf8'));
  const sql = config.queries['replenishment-suggestions.detail.atomic'].request.sql;
  const expression = sql.match(
    /CASE WHEN [rp]\.available_qty IS NULL OR pp\.current_transfer IS NULL OR pp\.current_out IS NULL THEN NULL ELSE [rp]\.available_qty \+ pp\.current_transfer - pp\.current_out END AS expected_month_end_qty/,
  )?.[0];
  assert.ok(expression);
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE page_rows(available_qty REAL); CREATE TABLE fc_period_plans(current_transfer REAL,current_out REAL)',
    );
    for (const [available, transfer, outbound, expected] of [
      [50, 10, 53, 7],
      [0, 0, 0, 0],
      [null, 10, 53, null],
      [50, null, 53, null],
      [50, 10, null, null],
    ]) {
      db.exec('DELETE FROM page_rows; DELETE FROM fc_period_plans');
      db.prepare('INSERT INTO page_rows VALUES (?)').run(available);
      db.prepare('INSERT INTO fc_period_plans VALUES (?,?)').run(transfer, outbound);
      const row = db
        .prepare('SELECT ' + expression + ' FROM page_rows AS p CROSS JOIN fc_period_plans AS pp')
        .get();
      assert.equal(row.expected_month_end_qty, expected);
    }
  } finally {
    db.close();
  }
});
