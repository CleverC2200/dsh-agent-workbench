import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fulfillmentSourcePeriod,
  fulfillmentSourceDescription,
} from '../prototypes/inventory-orderfulfillment/source-period.mjs';

test('delayed source never changes today scope and discloses actual ingestion time', () => {
  const value = fulfillmentSourcePeriod(
    { latest_created: '2026-11-02 11:59:19', latest_load: '2026-11-02 12:03:39' },
    '2026-11-03',
  );
  assert.equal(value.day, '2026-11-03');
  assert.equal(value.sourceDay, '2026-11-02');
  assert.equal(value.delayed, true);
  assert.match(fulfillmentSourceDescription(value), /源最新入库尚未到今天/);
  assert.match(fulfillmentSourceDescription(value), /12:03:39/);
  assert.match(fulfillmentSourceDescription(value), /仅统计当天创建的订单，不展示历史订单/);
  assert.doesNotMatch(fulfillmentSourceDescription(value), /展示最近有数据/);
});
test('same-day and empty authorized source have distinct meanings', () => {
  assert.equal(
    fulfillmentSourcePeriod(
      { latest_created: '2026-11-03 01:00:00', latest_load: null },
      '2026-11-03',
    ).delayed,
    false,
  );
  const empty = fulfillmentSourcePeriod({ latest_created: null, latest_load: null }, '2026-11-03');
  assert.equal(empty.empty, true);
  assert.match(fulfillmentSourceDescription(empty), /当前授权源表无可见/);
});
test('today ingestion without today orders is not called a synchronization delay', () => {
  const value = fulfillmentSourcePeriod(
    { latest_created: '2026-11-02 11:00:00', latest_load: '2026-11-03 08:00:00' },
    '2026-11-03',
  );
  assert.equal(value.historical, true);
  assert.equal(value.delayed, false);
  assert.doesNotMatch(fulfillmentSourceDescription(value), /今日数据尚未到达/);
});
test('missing or invalid source fields never become an empty order period', () => {
  for (const row of [
    {},
    { latest_created: null },
    { latest_created: '2026-11-04', latest_load: null },
    { latest_created: '2026-02-30', latest_load: null },
  ])
    assert.throws(() => fulfillmentSourcePeriod(row, '2026-11-03'));
});
