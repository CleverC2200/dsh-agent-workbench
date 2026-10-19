import sqlConfiguration from '../../../../../sql.config.json';
import { sqlTemplate as configuredSql } from '../../../../../../shared/sql-config.ts';
import type { WarehouseSnapshot } from '../domain.ts';
import type { BaseStockBatch, TransferOrderDetail } from '../replenishment-detail.ts';
import { loadBaseResourceSnapshot } from './base-resources.ts';
import type { BusinessDatabase } from './gea-sql.ts';
import { loadWarehouseCatalog } from './warehouse-catalog.ts';

const number = (value: unknown): number | null =>
  value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const sum = (values: (number | null)[]) =>
  values.some((value) => value === null)
    ? null
    : values.reduce<number>((total, value) => total + value!, 0);
export class DetailNotFoundError extends Error {}
export type DetailInput = {
  sku: string;
  kind: 'transfers' | 'bases' | 'batches';
  baseName?: string;
};

/** All details are scoped to an authorized snapshot SKU; never use browser totals or warehouse codes. */
export async function loadReplenishmentDetail(
  snapshot: WarehouseSnapshot,
  db: BusinessDatabase,
  input: DetailInput,
): Promise<WarehouseSnapshot> {
  const row = snapshot.replenishments.find((row) => row.sku === input.sku);
  if (!row) throw new DetailNotFoundError('当前分仓快照中没有该补货商品');
  if (input.kind === 'transfers') {
    const warehouse = (await loadWarehouseCatalog(db)).warehouses.find(
      (row) => row.id === snapshot.warehouseId,
    );
    if (!warehouse) throw new DetailNotFoundError('分仓不存在');
    const published = await db.query(
      configuredSql(sqlConfiguration, 'fc.src.lib.server.replenishment-detail.1'),
    );
    const sourceDate = String(published.rows[0]?.snapshot_time ?? '');
    if (!sourceDate) throw new Error('调拨订单明细尚未同步，请完成明细同步后重试');
    const result = await db.query(
      configuredSql(sqlConfiguration, 'fc.src.lib.server.replenishment-detail.2'),
      [sourceDate, warehouse.pickupPointCode, input.sku],
    );
    const transfers: TransferOrderDetail[] = result.rows.map((item) => ({
      orderNo: String(item.executeorderno),
      status: String(item.order_status || '待核实'),
      demandQty: number(item.demand_qty),
      allocatedQty: number(item.allocated_qty),
      shippedQty: number(item.shipped_qty),
      pendingQty: number(item.pending_qty),
      inTransitQty: number(item.in_transit_qty),
    }));
    const expectedQty = 'openTransferQty' in row ? (row.openTransferQty ?? null) : row.inTransitQty;
    const detailQty = sum(transfers.flatMap((item) => [item.pendingQty, item.inTransitQty]));
    const notice =
      expectedQty === null || detailQty === null
        ? '调拨明细存在未核实数量，请核对源数据。'
        : Math.abs(detailQty - expectedQty) > 0.0001
          ? '明细合计与当前快照的调拨中数量不一致，可能存在同步时间差，请刷新或核查数据。'
          : undefined;
    return {
      ...snapshot,
      replenishmentDetail: { ...input, transfers, expectedQty, detailQty, sourceDate, notice },
    };
  }
  const bases = await loadBaseResourceSnapshot(snapshot, db, input.sku);
  if (input.kind === 'bases') return { ...bases, replenishmentDetail: input };
  const base = bases.baseResources.find((row) => row.baseName === input.baseName);
  if (!base || !base.stockDate)
    throw new DetailNotFoundError('该商品在所选基地没有可核实的库存快照');
  // Match the last published batch date at or before the summary date. Never present
  // an older batch snapshot as today's stock, or select an unpublished ingestion.
  const published = await db.query(
    configuredSql(sqlConfiguration, 'fc.src.lib.server.replenishment-detail.3'),
    [base.stockDate],
  );
  const batchSnapshot = String(published.rows[0]?.snapshot_time ?? '');
  const stockDate = String(published.rows[0]?.stock_snapshot_date ?? '');
  if (!batchSnapshot || !stockDate)
    throw new Error('当前没有已同步的基地库存批次，请完成明细同步后重试');
  const result = await db.query(
    configuredSql(sqlConfiguration, 'fc.src.lib.server.replenishment-detail.4'),
    [stockDate, input.sku, base.baseName, batchSnapshot],
  );
  const batches: BaseStockBatch[] = result.rows.map((item) => ({
    warehouseName: String(item.warehouse_name ?? '-'),
    productionDate: item.production_date == null ? null : String(item.production_date),
    quantity: number(item.quantity),
    availableQty: number(item.available_qty),
    ageDays: number(item.age_days),
  }));
  const detailQty = sum(batches.map((row) => row.availableQty));
  const stale = stockDate !== base.stockDate;
  return {
    ...bases,
    replenishmentDetail: {
      ...input,
      batches,
      sourceDate: stockDate,
      summaryDate: base.stockDate,
      expectedQty: base.availableQty,
      detailQty,
      notice: stale
        ? `当前库存汇总日期为${base.stockDate}，批次明细仅同步至${stockDate}。以下为最近已同步的历史批次，不代表当天库存，不能与当前可用量直接核对。`
        : detailQty === null ||
            base.availableQty === null ||
            Math.abs(detailQty - base.availableQty) > 0.0001
          ? '批次可用量与基地汇总暂不一致，请核对库存快照日期和明细完整性。'
          : undefined,
    },
  };
}
