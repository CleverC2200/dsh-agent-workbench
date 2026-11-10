import test from 'node:test';
import assert from 'node:assert/strict';
import { cancellationChangesSql } from '../business/inventory-orderworkbench/document-queries.mjs';
import { cancellationPartitionSql } from '../business/inventory-orderworkbench/cancellation-partitions.mjs';
import { mergeCancellationPartitions } from '../prototypes/inventory-orderworkbench/change-partitions.mjs';
import {
  cancellationDb,
  cancellationLine as line,
  sqliteCancellationSql,
  octoberCancellationParameters as params,
} from './helpers/cancellation-fixture.mjs';

test('execution partitions retain null/empty keys, duplicate observations, daily field recovery and exact totals', () => {
  const hourly = [
    line('even0', { need_qty_origin: 11 }),
    line('odd1', {
      need_qty_origin: 19,
      orderstatus: 90,
      canceltime: '2026-10-02',
    }),
    line('odd1', {
      need_qty_origin: 19,
      orderstatus: 90,
      canceltime: '2026-10-02',
    }),
    line('missing2', { need_qty_origin: null }),
    line('conflict3', { need_qty_origin: 3 }),
    line('conflict3', { need_qty_origin: 4 }),
    line('null-key', { executeorderno: null, need_qty_origin: 7 }),
    line('empty-key', { executeorderno: '', need_qty_origin: 5 }),
    line('truezero4', { need_qty_origin: 0 }),
  ];
  const db = cancellationDb({
    hourly,
    daily: [line('missing2', { need_qty_origin: 23 })],
  });
  try {
    const run = (sql) =>
      db
        .prepare(
          sqliteCancellationSql(sql).replaceAll(
            "RIGHT(COALESCE(executeorderno,''),1)",
            "SUBSTR(COALESCE(executeorderno,''),-1)",
          ),
        )
        .all(params)
        .map((x) => ({ ...x }));
    const full = run(cancellationChangesSql),
      split = [0, 1].map((i) => run(cancellationPartitionSql(cancellationChangesSql, i)));
    assert.deepEqual(mergeCancellationPartitions(split), full);
    assert.ok(split.every((x) => x.length));
  } finally {
    db.close();
  }
});

test('a missing/invalid partition never becomes a complete zero result', () => {
  assert.throws(() => mergeCancellationPartitions([[]]), /INCOMPLETE/);
  assert.throws(() => mergeCancellationPartitions([[], undefined]), /INCOMPLETE/);
  assert.throws(() => mergeCancellationPartitions([[{ kind: '2' }], []]), /INVALID/);
  assert.throws(() => cancellationPartitionSql('SELECT 1', 2), /INVALID/);
});

test('a pending partition keeps total numerator/denominator unknown and adds only assessable samples', () => {
  const known = {
    kind: '1',
    region: 'R',
    province: null,
    numerator: 2,
    denominator: 10,
    records: 1,
    invalid: 0,
    sample_numerator: 2,
    sample_denominator: 10,
    sample_records: 1,
    unknown_quantity: null,
  };
  const pending = {
    ...known,
    numerator: null,
    denominator: null,
    records: 2,
    invalid: 1,
    sample_numerator: 3,
    sample_denominator: 20,
    sample_records: 1,
    unknown_quantity: 7,
  };
  const [v] = mergeCancellationPartitions([[known], [pending]]);
  assert.deepEqual(
    [
      v.numerator,
      v.denominator,
      v.records,
      v.invalid,
      v.sample_numerator,
      v.sample_denominator,
      v.sample_records,
      v.unknown_quantity,
    ],
    [null, null, 3, 1, 5, 30, 2, 7],
  );
});
