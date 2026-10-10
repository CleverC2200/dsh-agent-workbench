import { buildWorkbenchAnalysis, type WorkbenchAnalysis } from './workbench-analysis.ts';
import { filterCurrentOrders, type OrderStatusFilter } from './current-orders.ts';
import { filterInventory, type AgeFilter } from './inventory-aging.ts';
import {
  replenishmentIsReady,
  summarizeSnapshot,
  sumKnownQuantities,
  type WarehouseSnapshot,
  type SnapshotSummary,
  type ReplenishmentRow,
} from './domain.ts';
import { summarizeCalculatedReplenishment } from './replenishment-summary.ts';
import { hasMaterialGroup } from './replenishment-columns.ts';

export const WORKBENCH_TABS = [
  'replenishment',
  'orders',
  'structure',
  'plan',
  'base',
  'operations',
] as const;
export type WorkbenchTab = (typeof WORKBENCH_TABS)[number];
export type CalculatedSummary = {
  computedCount: number;
  missingCount: number;
  partial: boolean;
  quantity: number | null;
  skuCount: number | null;
  urgentQuantity: number | null;
  urgentCount: number | null;
};
export type WarehousePageInfo = {
  tab: WorkbenchTab;
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  overview: {
    insight?: WorkbenchAnalysis;
    hasMaterialGroup?: boolean;
    currentOrderQty?: number | null;
    preparingQty?: number | null;
    counts: { inventory: number; replenishments: number; plans: number; orders: number };
    replenishmentReady: boolean;
    calculated: CalculatedSummary;
    summary: SnapshotSummary;
    urgentCount: number;
    urgentQty: number | null;
    shortageOrderCount: number;
    consumptionFirstSkus: string[];
  };
};
export type WorkbenchPageInput = {
  businessOnly?: boolean;
  orderStatus?: OrderStatusFilter;
  baseName?: string;
  ageFilters?: AgeFilter[];
  tab: WorkbenchTab;
  pageNumber: number;
  pageSize: number;
  search: string;
  urgentOnly: boolean;
  riskOnly: boolean;
  sort: { key: string; direction: 'asc' | 'desc' };
  draft: { quantities: Record<string, number>; reasons: Record<string, string> };
};
export function applyWorkbenchDraft(
  snapshot: WarehouseSnapshot,
  draft: WorkbenchPageInput['draft'],
): WarehouseSnapshot {
  const replenishments = snapshot.replenishments.map((row) => ({
    ...row,
    actualQty:
      row.recommendedQty === null ? null : (draft.quantities[row.sku] ?? row.recommendedQty),
    reason: draft.reasons[row.sku] ?? '',
  }));
  if (!snapshot.page) return { ...snapshot, replenishments };
  // The server summary covers all pages. Apply only the visible rows' change
  // relative to this response; earlier pages' drafts are already in its baseline.
  const quantityDelta = replenishments.reduce(
    (sum, row, index) =>
      sum + (row.actualQty ?? 0) - (snapshot.replenishments[index].actualQty ?? 0),
    0,
  );
  const exceptionDelta = replenishments.reduce(
    (sum, row, index) =>
      sum +
      Number(row.actualQty !== row.recommendedQty) -
      Number(
        snapshot.replenishments[index].actualQty !== snapshot.replenishments[index].recommendedQty,
      ),
    0,
  );
  const summary = snapshot.page.overview.summary;
  return {
    ...snapshot,
    replenishments,
    page: {
      ...snapshot.page,
      overview: {
        ...snapshot.page.overview,
        summary: {
          ...summary,
          actualTotal: summary.actualTotal === null ? null : summary.actualTotal + quantityDelta,
          exceptionCount: summary.exceptionCount + exceptionDelta,
        },
      },
    },
  };
}
export function hasReplenishmentBusiness(row: ReplenishmentRow) {
  return [
    row.inventoryQty,
    row.preparingQty,
    row.actualDailyOutboundQty,
    row.currentOutboundQty,
    row.currentTransferQty,
    row.nextOutboundQty,
    row.nextTransferQty,
  ].some((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
}
export function filterReplenishments(
  snapshot: WarehouseSnapshot,
  input: Pick<WorkbenchPageInput, 'search' | 'urgentOnly' | 'riskOnly' | 'sort' | 'businessOnly'>,
) {
  const query = input.search.trim().toLowerCase();
  const filter = input.urgentOnly
    ? 'urgent'
    : input.riskOnly
      ? 'recommended'
      : input.businessOnly === false
        ? 'all'
        : 'business';
  const sort =
    !query && filter === 'urgent'
      ? { key: 'shortageQty', direction: 'desc' }
      : !query && filter === 'recommended'
        ? { key: 'recommendedQty', direction: 'desc' }
        : input.sort;
  return snapshot.replenishments
    .filter((row) =>
      query
        ? `${row.sku} ${row.productName}`.toLowerCase().includes(query)
        : filter === 'urgent'
          ? (row.shortageQty ?? 0) > 0
          : filter === 'recommended'
            ? (row.recommendedQty ?? 0) > 0
            : filter === 'business'
              ? hasReplenishmentBusiness(row)
              : true,
    )
    .sort((a, b) => {
      const left = a[sort.key as keyof ReplenishmentRow],
        right = b[sort.key as keyof ReplenishmentRow];
      if (left == null) return right == null ? a.sku.localeCompare(b.sku) : 1;
      if (right == null) return -1;
      const diff =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), 'zh-CN');
      return (sort.direction === 'asc' ? diff : -diff) || a.sku.localeCompare(b.sku);
    });
}
/** A list projection of a complete server snapshot. Overview facts never depend on the current page. */
export function projectWarehousePage(
  original: WarehouseSnapshot,
  input: WorkbenchPageInput,
): WarehouseSnapshot {
  if (original.page) throw new Error('分页必须基于完整分仓快照');
  const snapshot = applyWorkbenchDraft(original, input.draft);
  const matches = (value: string) =>
    value.toLowerCase().includes(input.search.trim().toLowerCase());
  const collections = {
    replenishment: filterReplenishments(snapshot, input),
    orders: filterCurrentOrders(snapshot.orders, input.search, input.orderStatus),
    structure: filterInventory(snapshot.inventory, input.search, input.ageFilters),
    plan: snapshot.plans.filter((row) => matches(`${row.month} ${row.sku} ${row.productName}`)),
    base: snapshot.baseResources.filter(
      (row) => !input.baseName || row.baseName === input.baseName,
    ),
    operations: [
      ...snapshot.operations.map((item) => ({ kind: 'operation' as const, item })),
      ...snapshot.businessExceptions.map((item) => ({ kind: 'exception' as const, item })),
    ].filter((row) => matches(JSON.stringify(row.item))),
  };
  const totalCount = collections[input.tab].length;
  const pageNumber = Math.min(
    input.pageNumber,
    Math.max(1, Math.ceil(totalCount / input.pageSize)),
  );
  const slice = <T>(rows: T[]) =>
    rows.slice((pageNumber - 1) * input.pageSize, pageNumber * input.pageSize);
  const urgent = original.replenishments.filter((row) => row.urgent);
  const agedSkus = new Set(
    original.inventory
      .filter((row) =>
        row.batchSummary
          ? row.batchSummary.bigDateQty > 0
          : row.batches.some((batch) => batch.quantity > 0 && batch.ageDays >= 60),
      )
      .map((row) => row.sku),
  );
  const operations = input.tab === 'operations' ? slice(collections.operations) : [];
  return {
    ...snapshot,
    inventory: input.tab === 'structure' ? slice(collections.structure) : [],
    replenishments: input.tab === 'replenishment' ? slice(collections.replenishment) : [],
    orders: input.tab === 'orders' ? slice(collections.orders) : [],
    plans: input.tab === 'plan' ? slice(collections.plan) : [],
    baseResources: input.tab === 'base' ? slice(collections.base) : [],
    operations: operations.filter((row) => row.kind === 'operation').map((row) => row.item),
    businessExceptions: operations.filter((row) => row.kind === 'exception').map((row) => row.item),
    planning: snapshot.planning
      ? {
          ...snapshot.planning,
          imports:
            input.tab === 'plan'
              ? snapshot.planning.imports.filter((row) =>
                  slice(collections.plan).some((plan) => plan.sku === row.sku),
                )
              : [],
        }
      : undefined,
    page: {
      tab: input.tab,
      pageNumber,
      pageSize: input.pageSize,
      totalCount,
      overview: {
        insight: buildWorkbenchAnalysis(original),
        currentOrderQty: sumKnownQuantities(
          snapshot.orders.flatMap((order) => order.lines).map((line) => line.orderedQty),
        ),
        preparingQty: sumKnownQuantities(
          snapshot.orders.flatMap((order) => order.lines).map((line) => line.preparingQty ?? null),
        ),
        hasMaterialGroup: snapshot.replenishments.some((row) =>
          hasMaterialGroup(row.materialGroup),
        ),
        counts: {
          inventory: snapshot.inventory.length,
          replenishments: snapshot.replenishments.length,
          plans: snapshot.plans.length,
          orders: snapshot.orders.length,
        },
        replenishmentReady: replenishmentIsReady(original),
        calculated: summarizeCalculatedReplenishment(original),
        summary: summarizeSnapshot(snapshot),
        urgentCount: urgent.length,
        urgentQty: replenishmentIsReady(original)
          ? sumKnownQuantities(urgent.map((row) => row.recommendedQty))
          : null,
        shortageOrderCount: snapshot.orders.filter((row) =>
          row.lines.some((line) => line.shortageQty > 0),
        ).length,
        consumptionFirstSkus: [
          ...new Set(
            snapshot.orders
              .flatMap((row) => row.lines)
              .filter((line) => line.shortageQty > 0 && agedSkus.has(line.sku))
              .map((line) => line.sku),
          ),
        ],
      },
    },
  };
}
