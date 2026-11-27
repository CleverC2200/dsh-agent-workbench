import { shanghaiTime } from './order-metrics.mjs';

export function bucketOrderAges(rows, today) {
  const cutoff = Date.parse(today + 'T00:00:00+08:00');
  if (!Number.isFinite(cutoff)) throw Error('INVALID_OPERATIONS_DATE');
  const groups = new Map();
  for (const row of rows) {
    const count = row.orders === null || row.orders === '' ? NaN : Number(row.orders);
    if (!Number.isSafeInteger(count) || count < 0) throw Error('INVALID_OPERATIONS_COUNT');
    const created = shanghaiTime(row.created_at);
    const deadline = shanghaiTime(row.need_billing_at);
    const createdDay =
      created === null ? null : new Date(created + 8 * 3600000).toISOString().slice(0, 10);
    const days =
      createdDay === null
        ? null
        : Math.floor(
            (Date.parse(today + 'T00:00:00Z') - Date.parse(createdDay + 'T00:00:00Z')) / 86400000,
          );
    const band =
      days === null || days < 0
        ? '创建时间未知'
        : days < 3
          ? '0–2天'
          : days < 6
            ? '3–5天'
            : days < 10
              ? '6–9天'
              : '10天及以上';
    if (!groups.has(band))
      groups.set(band, { age_band: band, orders: 0, overdue_orders: 0, unknown_deadlines: 0 });
    const group = groups.get(band);
    group.orders += count;
    if (deadline === null) group.unknown_deadlines += count;
    else if (deadline < cutoff) group.overdue_orders += count;
  }
  const bands = ['0–2天', '3–5天', '6–9天', '10天及以上', '创建时间未知'];
  return [...groups.values()].sort((a, b) => bands.indexOf(a.age_band) - bands.indexOf(b.age_band));
}
