import { cancellationSnapshotColumns } from './sku-cancellations.mjs';

export function cancellationPartitionSql(sql, partition) {
  if (![0, 1].includes(partition)) throw Error('INVALID_CANCELLATION_PARTITION');
  for (const table of ['agents_scm_execute_detail_hourly_d', 'agents_scm_execute_detail_d']) {
    sql = sql.replace(
      new RegExp('\\b(FROM|JOIN)\\s+' + table + '\\b(?:\\s+(d|h|line_seen)\\b)?', 'g'),
      (
        _match,
        join,
        alias,
      ) => `${join} (SELECT ${cancellationSnapshotColumns.join(',')} FROM ${table}
        WHERE (CASE WHEN RIGHT(COALESCE(executeorderno,''),1) IN ('0','2','4','6','8')
          THEN 0 ELSE 1 END)=${partition}) ${alias ?? 'scoped_snapshot'}`,
    );
  }
  return sql;
}
