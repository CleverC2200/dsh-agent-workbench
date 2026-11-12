import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  bindPlanPolicy,
  missingPlanPolicySql,
  selectedPlanSql,
  publishedPlanPolicyQuery,
} from '../business/inventory-orderworkbench/plan-policy.mjs';
import { orderWorkbenchSourceConfig } from '../business/inventory-orderworkbench/source-config.mjs';
import { readFileSync } from 'node:fs';

test('published series nodes use series_sort and require one record for each node', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE agents_dim_mark_xilie_d(product_item,series,belong_to,series_sort);
    INSERT INTO agents_dim_mark_xilie_d VALUES ('节点','<=初版',777,14),('节点','<=纠偏',888,20),('节点','<=滚动',999,28),('水饺','<=初版',777,1)`);
    const read = () => ({ ...db.prepare(publishedPlanPolicyQuery.request.sql).get() });
    assert.deepEqual(read(), { initial_day: 14, corrected_day: 20, rolling_day: 28 });
    db.exec(
      `UPDATE agents_dim_mark_xilie_d SET series_sort=16 WHERE product_item='节点' AND series='<=初版'`,
    );
    assert.equal(read().initial_day, 16);
    db.exec(`INSERT INTO agents_dim_mark_xilie_d VALUES ('节点','<=滚动',999,28)`);
    assert.equal(read().rolling_day, null);
    db.exec(`DELETE FROM agents_dim_mark_xilie_d WHERE series='<=纠偏'`);
    assert.equal(read().corrected_day, null);
  } finally {
    db.close();
  }
});

test('production assembly binds published nodes into detail, summaries, counts and period queries', () => {
  const source = JSON.parse(
    readFileSync(new URL('../business/inventory-apsplan/sql.config.json', import.meta.url), 'utf8'),
  );
  const config = orderWorkbenchSourceConfig(source);
  assert.equal(config.planVersionPolicy.status, 'configured');
  for (const [id, q] of Object.entries(config.queries)) {
    assert(!q.request.sql.includes(missingPlanPolicySql), id);
    if (q.request.sql.includes('plan_policy.initial_day'))
      assert(q.request.sql.includes('FROM agents_dim_mark_xilie_d'), id);
  }
  assert(config.queries['workbench.stock'].request.sql.includes('FROM agents_dim_mark_xilie_d'));
  assert.match(
    config.queries['workbench.stock.summary'].request.sql,
    /ORDER BY update_time DESC,load_time DESC\) AS version_rank/,
  );
  assert.match(config.queries['workbench.stock.summary'].request.sql, /shipment\.shipped_at/);
  for (const name of ['stock', 'ages'])
    assert.doesNotMatch(
      config.queries[`workbench.${name}.periods.summary`].request.sql,
      /:gea_p[12]\b/,
    );
});

test('policy binding reads a registered query and observes data updates, not copied cutoff constants', () => {
  const sql = `SELECT ${selectedPlanSql('100', '200', '300', '400')} AS chosen FROM facts CROSS JOIN (${missingPlanPolicySql}) plan_policy`;
  const config = { queries: { stock: { request: { sql } }, periods: { request: { sql } } } };
  bindPlanPolicy(config, {
    planVersionPolicy: { queryId: 'policy' },
    queries: {
      policy: {
        resultColumns: ['initial_day', 'corrected_day', 'rolling_day'],
        request: { sql: 'SELECT initial_day,corrected_day,rolling_day FROM policy' },
      },
    },
  });
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      `CREATE TABLE facts(the_date);INSERT INTO facts VALUES ('2026-10-15');CREATE TABLE policy(initial_day,corrected_day,rolling_day);INSERT INTO policy VALUES(14,20,28)`,
    );
    for (const q of Object.values(config.queries))
      assert.equal(db.prepare(q.request.sql).get().chosen, 200);
    db.exec('UPDATE policy SET initial_day=16');
    assert.equal(db.prepare(config.queries.stock.request.sql).get().chosen, 100);
    db.exec('INSERT INTO policy VALUES(16,20,28)');
    assert.equal(db.prepare(config.queries.stock.request.sql).get().chosen, null);
  } finally {
    db.close();
  }
});

test('missing policy never falls through to next-month plans; unregistered fields and parameters are rejected', () => {
  const sql = `SELECT ${selectedPlanSql('100', '200', '300', '400')} AS chosen FROM facts CROSS JOIN (${missingPlanPolicySql}) plan_policy`;
  const config = { queries: { stock: { request: { sql } } } };
  bindPlanPolicy(config, {});
  assert.equal(config.planVersionPolicy.status, 'SOURCE_NOT_AVAILABLE');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE facts(the_date);INSERT INTO facts VALUES ('2026-10-31')`);
    assert.equal(db.prepare(sql).get().chosen, null);
  } finally {
    db.close();
  }
  assert.throws(
    () =>
      bindPlanPolicy(config, {
        planVersionPolicy: { queryId: 'bad' },
        queries: {
          bad: { resultColumns: ['other'], request: { sql: 'SELECT other FROM policy' } },
        },
      }),
    /PLAN_POLICY_QUERY_CONTRACT_INVALID/,
  );
});
