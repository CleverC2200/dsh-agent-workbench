import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveShipmentForecast } from '../static/mps/source/shipment-forecast.js';

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
      assert.equal(result.shipDays, null);
      assert.equal(result.paceSource, '已发已备未备合计');
      assert.equal(result.forecastIssue, '');
    }
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
