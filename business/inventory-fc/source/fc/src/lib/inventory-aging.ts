import type { InventoryRow } from './domain.ts';

export type AgeFilter = '60-90' | '90+';
export const AGING_COLUMNS = [
  '产品编码',
  '产品名称',
  '产品大类',
  '物料组',
  '当前库存量',
  '平均货龄',
  '0-30天库存量/占比',
  '30-60天库存量/占比',
  '60-90天库存量/占比',
  '90天以上库存量/占比',
  '风险状态',
  '近30日日均出库量',
  '回顾周转天数',
  '处理建议',
];
export function inventoryAging(row: InventoryRow) {
  const buckets: [number, number, number, number] = [0, 0, 0, 0];
  let positiveQty = 0,
    weightedAge = 0,
    unknownAgeQty = 0;
  if (row.batchSummary) {
    positiveQty = row.batchSummary.positiveQty;
    weightedAge = row.batchSummary.weightedAge;
    unknownAgeQty = row.batchSummary.unknownAgeQty ?? 0;
    if (row.batchSummary.ageBuckets) buckets.splice(0, 4, ...row.batchSummary.ageBuckets);
    else {
      buckets[2] = row.batchSummary.bigDateQty - row.batchSummary.stagnantQty;
      buckets[3] = row.batchSummary.stagnantQty;
      unknownAgeQty = positiveQty - buckets[2] - buckets[3];
    }
  } else
    for (const batch of row.batches) {
      if (batch.quantity <= 0) continue;
      positiveQty += batch.quantity;
      if (
        !batch.productionDate ||
        batch.productionDate === '—' ||
        !Number.isFinite(batch.ageDays)
      ) {
        unknownAgeQty += batch.quantity;
        continue;
      }
      const age = Math.max(0, batch.ageDays);
      weightedAge += batch.quantity * age;
      buckets[age < 30 ? 0 : age < 60 ? 1 : age < 90 ? 2 : 3] += batch.quantity;
    }
  const { risk, suggestion } = agingAdvice(buckets, positiveQty, unknownAgeQty);
  return {
    buckets,
    positiveQty,
    unknownAgeQty,
    averageAge: positiveQty > 0 && unknownAgeQty === 0 ? weightedAge / positiveQty : null,
    risk,
    suggestion,
  };
}
/** Select whole SKU rows; never truncate batches or recalculate their quantities after filtering. */
export function filterInventory(rows: InventoryRow[], search: string, ages: AgeFilter[] = []) {
  const query = search.trim().toLowerCase();
  return rows.filter(
    (row) =>
      row.quantity !== 0 &&
      `${row.sku} ${row.productName}`.toLowerCase().includes(query) &&
      (!ages.length ||
        ages.some((age) => inventoryAging(row).buckets[age === '60-90' ? 2 : 3] > 0)),
  );
}
export function agingCells(row: InventoryRow): Array<string | number> {
  const age = inventoryAging(row);
  const decimal = (value: number | null | undefined) =>
    value == null
      ? '待核实'
      : value.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return [
    row.sku,
    row.productName,
    row.category,
    row.materialGroup,
    row.quantity.toLocaleString('zh-CN', { maximumFractionDigits: 3 }),
    decimal(age.averageAge),
    ...age.buckets.map(
      (qty) =>
        `${qty.toLocaleString('zh-CN', { maximumFractionDigits: 3 })} / ${age.positiveQty > 0 ? ((qty / age.positiveQty) * 100).toFixed(1) : '0.0'}%`,
    ),
    age.risk,
    decimal(row.actualDailyOutboundQty),
    row.actualDailyOutboundQty === 0 ? '—' : decimal(row.turnoverDays),
    age.suggestion,
  ];
}

/** Shared by batch-backed and configured-table projections of the same inventory. */
export function agingAdvice(
  buckets: readonly number[],
  positiveQty: number,
  unknownAgeQty: number,
) {
  const risk =
    buckets[3] > 0
      ? '滞库风险'
      : buckets[2] > 0
        ? '大日期'
        : unknownAgeQty > 0
          ? '货龄待核实'
          : positiveQty <= 0
            ? '无库存'
            : '正常';
  const suggestion =
    buckets[3] > 0
      ? '优先消耗90天以上批次，评估调拨或促销'
      : buckets[2] > 0
        ? '优先匹配近期订单，先进先出'
        : unknownAgeQty > 0
          ? '核实批次生产日期后安排出库'
          : positiveQty <= 0
            ? '核实库存与补货需求'
            : '按先进先出正常出库';
  return { risk, suggestion };
}
