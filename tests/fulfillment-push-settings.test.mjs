import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePushSettings,
  pushExecutionMessage,
} from '../prototypes/inventory-orderfulfillment/push-settings.mjs';
const valid = {
  thresholdEnabled: true,
  thresholdPercent: 95,
  reminderEnabled: true,
  reminderHours: 2,
};
test('execution status distinguishes configured, running, rejected and actually completed cycles', () => {
  const state = { settings: valid, workerEnabled: true };
  assert.match(pushExecutionMessage(state), /尚未返回线程运行状态/);
  assert.match(pushExecutionMessage({ ...state, workerEnabled: false }), /未启用/);
  assert.match(pushExecutionMessage({ ...state, workerRunning: false }), /已配置但未运行/);
  assert.match(
    pushExecutionMessage({ ...state, workerRunning: true, lastCycleResult: 'NOT_RUN' }),
    /等待首次调度/,
  );
  assert.match(
    pushExecutionMessage({ ...state, workerRunning: true, lastCycleResult: 'REJECTED' }),
    /最近一次调度被拒绝/,
  );
  assert.match(
    pushExecutionMessage({ ...state, workerRunning: true, lastCycleResult: 'COMPLETED' }),
    /是否投递以订单处理记录为准/,
  );
  const off = { thresholdEnabled: false, reminderEnabled: false };
  assert.match(
    pushExecutionMessage(
      { ...state, settings: off, workerRunning: true, lastCycleResult: 'COMPLETED' },
      true,
    ),
    /设置已保存；后台调度运行中；达标推送和定时提醒均已关闭/,
  );
});
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
