import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePushSettings } from '../prototypes/inventory-orderfulfillment/push-settings.mjs';
const valid = {
  thresholdEnabled: true,
  thresholdPercent: 95,
  reminderEnabled: true,
  reminderHours: 2,
};
test('settings preserve equality threshold and independent disabled rules', () => {
  assert.deepEqual(validatePushSettings(valid), valid);
  assert.equal(validatePushSettings({ ...valid, thresholdEnabled: false }).reminderEnabled, true);
});
test('invalid numbers, missing switches and authority overrides are rejected', () => {
  for (const value of [
    null,
    {},
    { ...valid, thresholdPercent: NaN },
    { ...valid, thresholdPercent: 100.01 },
    { ...valid, thresholdPercent: 95.001 },
    { ...valid, reminderHours: 0 },
    { ...valid, reminderHours: 1.5 },
    { ...valid, reminderHours: 169 },
    { ...valid, thresholdEnabled: 'true' },
    { ...valid, chatId: 'other' },
  ])
    assert.throws(() => validatePushSettings(value));
});
