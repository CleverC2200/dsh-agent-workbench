import { currentShortageSum } from './current-shortage';
import { knownNumber } from './configured-overview';

/** Keep an explicitly labelled known subtotal without presenting it as a complete cohort. */
export function fcCurrentMetric(
  rows: Array<Record<string, unknown>> | undefined,
  field: 'demand' | 'allocated' | 'shortage',
) {
  const complete = currentShortageSum(rows, field);
  if (complete !== null) return { value: complete, partial: false };
  if (!rows?.length) return { value: null, partial: false };
  const known = rows.map((row) => knownNumber(row['known_' + field]));
  const count = rows.reduce(
    (n, row) => n + (knownNumber(row['known_' + field + '_count']) ?? 0),
    0,
  );
  return {
    value:
      count > 0 && known.every((value) => value !== null)
        ? known.reduce<number>((n, value) => n + (value ?? 0), 0)
        : null,
    partial: true,
  };
}
