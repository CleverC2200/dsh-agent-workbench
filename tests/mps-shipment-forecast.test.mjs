import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyShipmentCoefficient,
  deriveShipmentCoefficient,
  deriveShipmentForecast,
  shipmentCoefficientPeriods,
} from '../static/mps/source/shipment-forecast.js';

const input = (changes = {}) => ({
  month: '2026-11',
  shipped: 100,
  prepped: 10,
  unprepped: 10,
  daily3: 0,
  average: 5,
  sourceDays: 20,
  duplicateDays: 0,
  ...changes,
});

test('发运系数将上月同日计入未过区间，跨月和月底按自然日处理', () => {
  assert.deepEqual(shipmentCoefficientPeriods('2026-01-22'), {
    elapsed: { start: '2025-12-01', end: '2025-12-21', days: 21 },
    remaining: { start: '2025-12-22', end: '2025-12-31', days: 10 },
  });
  assert.deepEqual(shipmentCoefficientPeriods('2024-03-29').remaining, {
    start: '2024-02-29',
    end: '2024-02-29',
    days: 1,
  });
  assert.match(shipmentCoefficientPeriods('2024-03-30').reason, /未过区间无天数/);
  assert.match(shipmentCoefficientPeriods('2026-09-30').reason, /月底/);
  assert.match(shipmentCoefficientPeriods('2026-09-01').reason, /无天数/);
});

test('未过日均除以上月已过日均，系数最小为1且数量保底直接取原值', () => {
  const periods = shipmentCoefficientPeriods('2026-09-22');
  const coefficient = deriveShipmentCoefficient(210, 200, periods);
  assert.equal(coefficient.factor, 2);
  for (const [elapsed, remaining, reason] of [
    [210, 50, /低于 1/],
    [0, 200, /日均不大于 0/],
    [null, 200, /缺少完整/],
  ]) {
    const result = deriveShipmentCoefficient(elapsed, remaining, periods);
    assert.equal(result.factor, 1);
    assert.match(result.reason, reason);
  }
  for (const [changes, original, adjusted, factor] of [
    [{}, 150, 180, 2],
    [{ average: 0 }, 120, 120, 1],
    [{ average: null }, null, null, 1],
  ]) {
    const result = applyShipmentCoefficient(
      deriveShipmentForecast(input(changes), 20, 30),
      coefficient,
    );
    assert.equal(result.basePrediction, original);
    assert.equal(result.prediction, adjusted);
    assert.equal(result.shipmentFactor, factor);
  }
});

test('非正近三天日均直接用正近30天日均，保留既有预测公式', () => {
  for (const daily3 of [0, -3]) {
    const result = deriveShipmentForecast(input({ daily3 }), 20, 30);
    assert.equal(result.pace, 5);
    assert.equal(result.paceSource, '近30天日均');
    assert.equal(result.shipDays, 4);
    assert.equal(result.prediction, 150);
  }
});

test('两种日均均无正数且近30天有效时取已发已备未备之和', () => {
  for (const daily3 of [0, -3]) {
    for (const average of [0, -2]) {
      const result = deriveShipmentForecast(input({ daily3, average }), 20, 30);
      assert.equal(result.prediction, 120);
      assert.equal(result.shipDays, 0);
      assert.equal(result.paceSource, '已发已备未备合计');
      assert.equal(result.forecastIssue, '');
    }
  }
});

test('发货依据待核时不将无正日均当成有效回退', () => {
  for (const changes of [
    { sourceDays: 19 },
    { duplicateDays: 1 },
    { prepped: null },
    { average: null },
  ]) {
    const result = deriveShipmentForecast(input({ average: 0, ...changes }), 20, 30);
    assert.equal(result.prediction, null);
    assert.equal(result.shipDays, null);
  }
});

test('无正日均时有效冲销数量合计为0仍取合计，不误判为无业务或缺项', () => {
  const result = deriveShipmentForecast(
    input({ shipped: -5, prepped: 5, unprepped: 0, average: 0 }),
    20,
    30,
  );
  assert.equal(result.prediction, 0);
  assert.equal(result.confirmedNoShipment, false);
  assert.equal(result.forecastIssue, '');
});

test('三数量均确认是零时近30天正日均不制造预测，缺值与无效值仍待补', () => {
  const zero = input({ shipped: 0, prepped: 0, unprepped: 0 });
  const result = deriveShipmentForecast(zero, 20, 30);
  assert.equal(result.prediction, 0);
  assert.equal(result.confirmedNoShipment, true);
  for (const missing of [
    { shipped: null },
    { prepped: null },
    { unprepped: null },
    { daily3: null },
    { average: null },
    { average: NaN },
  ]) {
    const pending = deriveShipmentForecast({ ...zero, ...missing }, 20, 30);
    assert.equal(pending.prediction, null);
    assert.match(pending.forecastIssue, /缺失|无效/);
  }
});

test('来源日期缺失、重复与范围冲突逐项说明且保留待核，不伪造具体缺失日期', () => {
  for (const [changes, reason] of [
    [{ sourceDays: 18 }, /2026-11-01.*2026-11-20.*应有20天.*实际18天.*缺2天/],
    [{ duplicateDays: 2 }, /重复2条/],
    [{ sourceDays: 21 }, /应有20天.*实际21天.*范围冲突/],
    [{ sourceDays: null }, /来源日期天数缺失或无效/],
    [{ duplicateDays: null }, /重复日期条数缺失或无效/],
  ]) {
    const result = deriveShipmentForecast(input(changes), 20, 30);
    assert.equal(result.prediction, null);
    assert.match(result.forecastIssue, reason);
    assert.match(result.forecastIssue, /待核/);
  }
});

test('原有正日均与月底以外待发订单场景保持原公式，缺失近三天不替代成零', () => {
  const ordinary = deriveShipmentForecast(input({ shipped: 220, daily3: 10 }), 22, 30);
  assert.equal(ordinary.shipDays, 2);
  assert.equal(ordinary.prediction, null);
  const complete = deriveShipmentForecast(
    input({ shipped: 220, daily3: 10, sourceDays: 22 }),
    22,
    30,
  );
  assert.equal(complete.prediction, 300);
  const delayed = deriveShipmentForecast(
    input({ shipped: 22, prepped: 100, unprepped: 0, daily3: 1, sourceDays: 22 }),
    22,
    30,
  );
  assert.equal(delayed.prediction, 122);
  assert.equal(deriveShipmentForecast(input({ daily3: null }), 20, 30).prediction, null);
});

test('月初不足三天时三数量确认是零且日期完整仍预估为零，历史缺项继续待核', () => {
  for (const passed of [1, 2]) {
    const zero = input({ shipped: 0, prepped: 0, unprepped: 0, daily3: null, sourceDays: passed });
    const result = deriveShipmentForecast(zero, passed, 30);
    assert.equal(result.prediction, 0);
    assert.equal(result.confirmedNoShipment, true);
    assert.equal(result.forecastIssue, '');
    for (const changes of [
      { sourceDays: 0 },
      { duplicateDays: 1 },
      { average: null },
      { sourceDays: undefined, duplicateDays: undefined },
      { daily3: undefined },
    ]) {
      const pending = deriveShipmentForecast({ ...zero, ...changes }, passed, 30);
      assert.equal(pending.prediction, null);
      assert.match(pending.forecastIssue, /缺|重复|待核/);
    }
  }
});

test('西南10006950只对未过天数预测日均应用发运系数，中间值不舍入', () => {
  const result = applyShipmentCoefficient(
    deriveShipmentForecast(
      input({
        shipped: 5624,
        prepped: 312,
        unprepped: 792,
        daily3: 326.6666666666667,
        average: 100,
        sourceDays: 24,
      }),
      24,
      30,
    ),
    { factor: 2.380614, reason: '' },
  );
  assert.equal(result.prediction, 8261);
  const exhausted = applyShipmentCoefficient(deriveShipmentForecast(input({ daily3: 1 }), 20, 21), {
    factor: 3,
    reason: '',
  });
  assert.equal(exhausted.prediction, 120);
});
