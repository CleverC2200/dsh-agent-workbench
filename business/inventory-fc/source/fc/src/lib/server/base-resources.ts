import sqlConfiguration from '../../../../../sql.config.json';
import { sqlTemplate as configuredSql } from '../../../../../../shared/sql-config.ts';
import type { BaseResource, WarehouseSnapshot } from '../domain.ts';
import type { BusinessDatabase } from './gea-sql.ts';

export function baseResourceDates(start: string) {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10),
  );
}
const numeric = (value: unknown) =>
  value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

/** Only base aggregates leave SQL. An optional exact SKU never becomes a bulk detail selector. */
export async function loadBaseResourceSnapshot(
  snapshot: WarehouseSnapshot,
  database: BusinessDatabase,
  sku = '',
  now = new Date(),
): Promise<WarehouseSnapshot> {
  if (sku && !/^[A-Za-z0-9_-]{1,64}$/.test(sku)) throw new Error('请输入单个完整SKU编码');
  const start = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const dates = baseResourceDates(start);
  const [facts, production] = await Promise.all([
    database.query(configuredSql(sqlConfiguration, 'fc.src.lib.server.base-resources.1'), [sku]),
    database.query(configuredSql(sqlConfiguration, 'fc.src.lib.server.base-resources.2'), [
      sku,
      start,
    ]),
  ]);
  const byBase = new Map<string, BaseResource>();
  const matches = new Set<string>();
  const get = (name: string) => {
    let row = byBase.get(name);
    if (!row) {
      row = {
        baseName: name,
        materialGroup: '基地汇总',
        availableQty: null,
        inTransitQty: null,
        capacityQty: null,
        productionTotal: null,
        dailyProduction: dates.map((date) => ({ date, quantity: 0 })),
        leadTimeDays: null,
        status: '关注',
      };
      byBase.set(name, row);
    }
    return row;
  };
  for (const fact of facts.rows) {
    const name = String(fact.base_name ?? '');
    if (!name) continue;
    const row = get(name);
    if (fact.metric_name === 'base_available_qty') {
      row.availableQty = numeric(fact.quantity);
      row.stockDate = String(fact.source_date ?? '');
    }
    if (fact.metric_name === 'base_in_transit_qty') {
      row.inTransitQty = numeric(fact.quantity);
      row.transitDate = String(fact.source_date ?? '');
    }
    if (Number(fact.sku_count) > 0) matches.add(name);
  }
  for (const fact of production.rows) {
    const name = String(fact.base_name ?? '');
    if (!name) continue;
    const row = get(name),
      day = row.dailyProduction!.find((day) => day.date === fact.day);
    if (day) day.quantity = numeric(fact.quantity);
    if (Number(fact.sku_count) > 0) matches.add(name);
  }
  const baseResources = [...byBase.values()]
    .filter((row) => !sku || matches.has(row.baseName))
    .sort((a, b) => a.baseName.localeCompare(b.baseName, 'zh-CN'));
  for (const row of baseResources) {
    const days = row.dailyProduction!;
    row.productionTotal = days.every((day) => day.quantity !== null)
      ? days.reduce((sum, day) => sum + day.quantity!, 0)
      : null;
    // Legacy consumers still use capacityQty; the new UI reads nullable productionTotal.
    row.capacityQty = row.productionTotal;
  }
  return {
    ...snapshot,
    baseResources,
    baseResourceQuery: { sku, dates, baseNames: [...byBase.keys()].sort() },
    businessPeriods: {
      operationsMonth: snapshot.businessPeriods?.operationsMonth ?? start.slice(0, 7),
      productionStart: start,
      productionEnd: dates[6],
    },
  };
}
