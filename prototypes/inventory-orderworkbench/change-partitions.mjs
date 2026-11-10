const sums = [
  'numerator',
  'denominator',
  'records',
  'invalid',
  'sample_numerator',
  'sample_denominator',
  'sample_records',
  'unknown_quantity',
];

/** Called only after both disjoint partitions pass complete-packet validation. */
export function mergeCancellationPartitions(partitions) {
  if (partitions.length !== 2 || partitions.some((rows) => !Array.isArray(rows)))
    throw Error('CANCELLATION_PARTITIONS_INCOMPLETE');
  const groups = new Map();
  for (const rows of partitions)
    for (const row of rows) {
      if (String(row.kind) !== '1') throw Error('INVALID_CANCELLATION_PARTITION_ROW');
      for (const field of sums)
        if (
          row[field] !== null &&
          (row[field] === undefined || row[field] === '' || !Number.isFinite(Number(row[field])))
        )
          throw Error('INVALID_CANCELLATION_PARTITION_QUANTITY');
      const key = JSON.stringify([row.period_index ?? null, row.kind, row.region, row.province]);
      if (!groups.has(key)) {
        groups.set(key, { ...row });
        continue;
      }
      const combined = groups.get(key);
      for (const field of sums) {
        const a = combined[field],
          b = row[field];
        combined[field] =
          (['numerator', 'denominator'].includes(field) && (a === null || b === null)) ||
          (a === null && b === null)
            ? null
            : Number(a ?? 0) + Number(b ?? 0);
      }
    }
  return [...groups.values()];
}
