import assert from 'node:assert/strict';

export function overviewReply(config, id, day = '2026-10-18', version = 'v1') {
  const row = Object.fromEntries(
    config.queries[id].resultColumns.map((key) => [
      key,
      ['day', 'snapshot_date'].includes(key)
        ? day
        : /invalid|missing|negative|duplicate/.test(key)
          ? 0
          : 1,
    ]),
  );
  let rows = [row];
  if (id === config.overviewQuickStock)
    rows = ['基地', '分仓'].map((location_type) => ({ ...row, location_type }));
  if (id === config.overviewOrderGroups?.queryId)
    rows = [...new Set(Object.values(config.overviewOrderGroups.views))].map((pickup_type) => ({
      ...row,
      pickup_type,
    }));
  return { configVersion: version, rows };
}

export async function untilObserved(predicate) {
  const deadline = Date.now() + 1500;
  while (!predicate() && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(predicate(), 'expected independent source progress before releasing blocked query');
}
