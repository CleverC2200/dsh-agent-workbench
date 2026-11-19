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
  const expression = sql
    .split(', ')
    .find((projection) => projection.endsWith(' AS expected_month_end_qty'));
  assert.ok(expression);
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      'CREATE TABLE page_rows(available_qty REAL,month_ship_positive REAL); CREATE TABLE fc_period_plans(current_count REAL,current_transfer REAL,current_out REAL)',
    );
    for (const [available, shipped, transfer, outbound, expected] of [
      [50, 25, 0, 53, 22],
      [50, 0, 10, 53, null],
      [0, 0, 0, 0, 0],
      [50, 80, 0, 53, 50],
      [null, 1, 0, 53, null],
      [50, null, 0, 53, null],
      [50, 1, null, 53, null],
      [50, 1, 0, null, null],
    ]) {
      db.exec('DELETE FROM page_rows; DELETE FROM fc_period_plans');
      db.prepare('INSERT INTO page_rows VALUES (?,?)').run(available, shipped);
      db.prepare('INSERT INTO fc_period_plans VALUES (1,?,?)').run(transfer, outbound);
      const row = db
        .prepare('SELECT ' + expression + ' FROM page_rows AS p CROSS JOIN fc_period_plans AS pp')
        .get();
      assert.equal(row.expected_month_end_qty, expected);
    }
  } finally {
    db.close();
  }
});
