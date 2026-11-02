export type DailySummarySnapshot =
  | { kind: 'unavailable' }
  | {
      kind: 'ready';
      batchId: string;
      businessDate: string;
      stockDate: string;
      targetMonth: string;
      defaultInventoryVersion?: string | null;
    };

const date = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

export function parseDailySummarySnapshot(result: unknown): DailySummarySnapshot {
  if (result === null || typeof result !== 'object' || !('rows' in result))
    throw Error('SUMMARY_SNAPSHOT_INVALID');
  if (Array.isArray(result.rows) && result.rows.length === 0) return { kind: 'unavailable' };
  if (!Array.isArray(result.rows) || result.rows.length !== 1)
    throw Error('SUMMARY_SNAPSHOT_INVALID');
  const row: unknown = result.rows[0];
  if (row === null || typeof row !== 'object' || !('batch_id' in row))
    throw Error('SUMMARY_SNAPSHOT_INVALID');
  if (row.batch_id === null) return { kind: 'unavailable' };
  const businessDate: unknown = Reflect.get(row, 'business_date');
  const stockDate: unknown = Reflect.get(row, 'stock_date');
  const targetMonth: unknown = Reflect.get(row, 'target_month');
  if (
    typeof row.batch_id !== 'string' ||
    !/^[A-Za-z0-9_:-]{1,64}$/.test(row.batch_id) ||
    !date(businessDate) ||
    !date(stockDate) ||
    !date(targetMonth) ||
    !targetMonth.endsWith('-01') ||
    stockDate > businessDate
  )
    throw Error('SUMMARY_SNAPSHOT_INVALID');
  const inventoryVersion = Reflect.get(row, 'default_inventory_version');
  if (inventoryVersion != null && typeof inventoryVersion !== 'string')
    throw Error('SUMMARY_SNAPSHOT_INVALID');
  return {
    kind: 'ready',
    batchId: row.batch_id,
    businessDate,
    stockDate,
    targetMonth,
    defaultInventoryVersion: inventoryVersion ?? null,
  };
}

const month = (value: unknown) =>
  typeof value !== 'string'
    ? null
    : /^\d{6}$/.test(value)
      ? value.slice(0, 4) + '-' + value.slice(4) + '-01'
      : /^\d{4}-\d{2}-01$/.test(value)
        ? value
        : null;

const shift = (day: string, days: number) => {
  const result = new Date(day + 'T00:00:00Z');
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};

/** Select a covered snapshot before execution. Query failures never choose another source. */
export function dailySummaryQuery(
  definition: unknown,
  snapshot: DailySummarySnapshot,
  values: Record<string, unknown>,
): { queryId: string; values: Record<string, unknown> } | null {
  if (snapshot.kind === 'unavailable') return null;
  if (definition === null || typeof definition !== 'object' || !('summaryRoute' in definition))
    return null;
  const route: unknown = definition.summaryRoute;
  if (
    route === null ||
    typeof route !== 'object' ||
    !('queryId' in route) ||
    typeof route.queryId !== 'string' ||
    !('kind' in route)
  )
    throw Error('SUMMARY_ROUTE_INVALID');
  if (
    'materializedInputs' in route &&
    route.materializedInputs !== null &&
    typeof route.materializedInputs === 'object'
  ) {
    if (
      Object.entries(route.materializedInputs).some(
        ([name, expected]) =>
          name in values && JSON.stringify(values[name]) !== JSON.stringify(expected),
      )
    )
      return null;
  }
  if ('materializedPeriod' in route && route.materializedPeriod === true) {
    const period = {
      order_start: snapshot.businessDate.slice(0, 7) + '-01',
      order_end_exclusive: shift(snapshot.businessDate, 1),
      rolling_start: shift(snapshot.businessDate, -29),
      shipment_end_exclusive: shift(snapshot.businessDate, 1),
    };
    if (
      Object.entries(period).some(
        ([name, expected]) =>
          name in values &&
          String(values[name]).replaceAll('-', '') !== expected.replaceAll('-', ''),
      )
    )
      return null;
  }
  if ('materializedWindow' in route) {
    const calendarMonth = snapshot.businessDate.slice(0, 7) + '-01';
    const rolling = shift(snapshot.businessDate, -29);
    const expected =
      route.materializedWindow === 'month'
        ? { start: calendarMonth, end_exclusive: shift(snapshot.businessDate, 1) }
        : {
            shipment_start: calendarMonth < rolling ? calendarMonth : rolling,
            shipment_month_start: calendarMonth,
            rolling_start: rolling,
            shipment_end_exclusive: shift(snapshot.businessDate, 1),
          };
    if (
      Object.entries(expected).some(
        ([name, value]) =>
          name in values && String(values[name]).replaceAll('-', '') !== value.replaceAll('-', ''),
      )
    )
      return null;
  }
  const stockDate = values.stock_date ?? values.stat_date;
  if (stockDate != null && stockDate !== snapshot.stockDate) return null;
  if (
    'stock_month' in values &&
    month(values.stock_month) !== snapshot.stockDate.slice(0, 7) + '-01'
  )
    return null;
  switch (route.kind) {
    case 'base':
      if (month(values.month) !== snapshot.targetMonth) return null;
      if (!['', '月初', '纠偏', '滚动'].includes(String(values.inventory_version))) return null;
      break;
    case 'branch-period': {
      if (month(values.month) !== snapshot.businessDate.slice(0, 7) + '-01') return null;
      const next = new Date(snapshot.businessDate.slice(0, 7) + '-01T00:00:00Z');
      next.setUTCMonth(next.getUTCMonth() + 1);
      const nextMonth = next.toISOString().slice(0, 10);
      if ('next_month' in values && month(values.next_month) !== nextMonth) return null;
      if ('business_plan_months' in values) {
        const expectedMonths = [
          snapshot.businessDate.slice(0, 7).replace('-', ''),
          nextMonth.slice(0, 7).replace('-', ''),
        ];
        if (
          !Array.isArray(values.business_plan_months) ||
          JSON.stringify([...values.business_plan_months].sort()) !==
            JSON.stringify(expectedMonths.sort())
        )
          return null;
      }
      const rollingStart = shift(snapshot.businessDate, -29);
      const calendarMonth = snapshot.businessDate.slice(0, 7) + '-01';
      const expected = {
        as_of: snapshot.businessDate,
        rolling_start: rollingStart,
        shipment_month_start: calendarMonth,
        shipment_end_exclusive: shift(snapshot.businessDate, 1),
        shipment_start: calendarMonth < rollingStart ? calendarMonth : rollingStart,
      };
      if (
        Object.entries(expected).some(
          ([name, value]) =>
            name in values &&
            String(values[name]).replaceAll('-', '') !== value.replaceAll('-', ''),
        )
      )
        return null;
      break;
    }
    case 'age': {
      const expected = {
        batch_rolling_start: shift(snapshot.stockDate, -29).replaceAll('-', ''),
        batch_end_exclusive: shift(snapshot.stockDate, 1).replaceAll('-', ''),
      };
      if (
        Object.entries(expected).some(([name, value]) => name in values && values[name] !== value)
      )
        return null;
      break;
    }
    case 'stock':
      break;
    case 'dates':
      if (typeof values.as_of === 'string' && values.as_of < snapshot.stockDate) return null;
      if ('month' in values && month(values.month) !== snapshot.stockDate.slice(0, 7) + '-01')
        return null;
      break;
    case 'current':
      break;
    default:
      throw Error('SUMMARY_ROUTE_INVALID');
  }
  const defaultCycle =
    (!('cycle_days' in values) || values.cycle_days === 7) &&
    (!('preparation_days' in values) || values.preparation_days === 3) &&
    Object.entries(values).every(
      ([name, value]) => !/^fc_cycle_\d+_(?:level|object|from|to)$/.test(name) || value === '',
    ) &&
    (!('fc_cycle_warehouse' in values) || values.fc_cycle_warehouse === '');
  return {
    queryId:
      defaultCycle && 'defaultQueryId' in route && typeof route.defaultQueryId === 'string'
        ? route.defaultQueryId
        : route.queryId,
    values: { ...values, summary_batch_id: snapshot.batchId },
  };
}
