import type { WarehouseSnapshot } from "../domain.ts";
import type { BaseStockBatch, TransferOrderDetail } from "../replenishment-detail.ts";
import { loadBaseResourceSnapshot } from "./base-resources.ts";
import type { BusinessDatabase } from "./gea-sql.ts";
import { loadWarehouseCatalog } from "./warehouse-catalog.ts";

const number = (value: unknown): number | null => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const sum = (values: (number | null)[]) => values.some(value => value === null) ? null : values.reduce<number>((total, value) => total + value!, 0);
export class DetailNotFoundError extends Error {}
export type DetailInput = { sku: string; kind: "transfers" | "bases" | "batches"; baseName?: string };

/** All details are scoped to an authorized snapshot SKU; never use browser totals or warehouse codes. */
export async function loadReplenishmentDetail(snapshot: WarehouseSnapshot, db: BusinessDatabase, input: DetailInput): Promise<WarehouseSnapshot> {
  const row = snapshot.replenishments.find(row => row.sku === input.sku);
  if (!row) throw new DetailNotFoundError("当前分仓快照中没有该补货商品");
  if (input.kind === "transfers") {
    const warehouse = (await loadWarehouseCatalog(db)).warehouses.find(row => row.id === snapshot.warehouseId);
    if (!warehouse) throw new DetailNotFoundError("分仓不存在");
    const published = await db.query(`/* branch:transfer-publication */ SELECT snapshot_time::text FROM data_service.agent_branch_detail_publication ORDER BY snapshot_time DESC LIMIT 1`);
    const sourceDate = String(published.rows[0]?.snapshot_time ?? "");
    if (!sourceDate) throw new Error("调拨订单明细尚未同步，请完成明细同步后重试");
    const result = await db.query(`/* branch:transfer-details */
      SELECT executeorderno, order_status,
        CASE WHEN COUNT(demand_qty)=COUNT(*) THEN SUM(demand_qty) END AS demand_qty,
        CASE WHEN COUNT(allocated_qty)=COUNT(*) THEN SUM(allocated_qty) END AS allocated_qty,
        CASE WHEN COUNT(shipped_qty)=COUNT(*) THEN SUM(shipped_qty) END AS shipped_qty,
        CASE WHEN COUNT(pending_qty)=COUNT(*) THEN SUM(pending_qty) END AS pending_qty,
        CASE WHEN COUNT(in_transit_qty)=COUNT(*) THEN SUM(in_transit_qty) END AS in_transit_qty
      FROM data_service.agents_scm_branch_transfer_detail
      WHERE snapshot_time=$1::timestamptz AND pickup_point=$2 AND material_code=$3
        AND (pending_qty > 0 OR in_transit_qty > 0 OR pending_qty IS NULL OR in_transit_qty IS NULL)
      GROUP BY executeorderno, order_status ORDER BY executeorderno, order_status
    `, [sourceDate, warehouse.pickupPointCode, input.sku]);
    const transfers: TransferOrderDetail[] = result.rows.map(item => ({ orderNo: String(item.executeorderno), status: String(item.order_status || "待核实"), demandQty: number(item.demand_qty), allocatedQty: number(item.allocated_qty), shippedQty: number(item.shipped_qty), pendingQty: number(item.pending_qty), inTransitQty: number(item.in_transit_qty) }));
    const expectedQty = "openTransferQty" in row ? row.openTransferQty ?? null : row.inTransitQty;
    const detailQty = sum(transfers.flatMap(item => [item.pendingQty, item.inTransitQty]));
    const notice = expectedQty === null || detailQty === null ? "调拨明细存在未核实数量，请核对源数据。" : Math.abs(detailQty - expectedQty) > 0.0001 ? "明细合计与当前快照的调拨中数量不一致，可能存在同步时间差，请刷新或核查数据。" : undefined;
    return { ...snapshot, replenishmentDetail: { ...input, transfers, expectedQty, detailQty, sourceDate, notice } };
  }
  const bases = await loadBaseResourceSnapshot(snapshot, db, input.sku);
  if (input.kind === "bases") return { ...bases, replenishmentDetail: input };
  const base = bases.baseResources.find(row => row.baseName === input.baseName);
  if (!base || !base.stockDate) throw new DetailNotFoundError("该商品在所选基地没有可核实的库存快照");
  // Match the last published batch date at or before the summary date. Never present
  // an older batch snapshot as today's stock, or select an unpublished ingestion.
  const published = await db.query(`/* branch:base-stock-publication */
    SELECT CAST(p.snapshot_time AS TEXT) AS snapshot_time,
      CAST(p.stock_snapshot_date AS TEXT) AS stock_snapshot_date
    FROM agent_branch_detail_publication AS p
    WHERE p.stock_snapshot_date <= CAST($1 AS DATE)
    ORDER BY p.stock_snapshot_date DESC, p.snapshot_time DESC LIMIT 1`, [base.stockDate]);
  const batchSnapshot = String(published.rows[0]?.snapshot_time ?? "");
  const stockDate = String(published.rows[0]?.stock_snapshot_date ?? "");
  if (!batchSnapshot || !stockDate) throw new Error("当前没有已同步的基地库存批次，请完成明细同步后重试");
  const result = await db.query(`/* branch:base-stock-batches */
    SELECT i.warehouse_name AS warehouse_name, CAST(i.prod_date AS TEXT) AS production_date,
      CASE WHEN COUNT(i.live_qty)=COUNT(*) THEN SUM(i.live_qty) END AS quantity,
      CASE WHEN COUNT(i.available_qty)=COUNT(*) THEN SUM(i.available_qty) END AS available_qty,
      CASE WHEN i.prod_date IS NULL THEN NULL ELSE GREATEST(0, CAST(i.snapshot_date AS DATE)-CAST(i.prod_date AS DATE)) END AS age_days
    FROM agents_scm_base_stock_batch AS i
    WHERE i.snapshot_date=CAST($1 AS DATE) AND i.material_code=$2 AND i.base_name=$3 AND i.snapshot_time=CAST($4 AS TIMESTAMPTZ)
    GROUP BY i.snapshot_date, i.warehouse_name, i.prod_date
    HAVING SUM(i.live_qty) <> 0 OR SUM(i.available_qty) <> 0 OR COUNT(i.available_qty)<>COUNT(*) OR COUNT(i.live_qty)<>COUNT(*)
    ORDER BY i.prod_date, i.warehouse_name
  `, [stockDate, input.sku, base.baseName, batchSnapshot]);
  const batches: BaseStockBatch[] = result.rows.map(item => ({ warehouseName: String(item.warehouse_name ?? "-"), productionDate: item.production_date == null ? null : String(item.production_date), quantity: number(item.quantity), availableQty: number(item.available_qty), ageDays: number(item.age_days) }));
  const detailQty = sum(batches.map(row => row.availableQty));
  const stale = stockDate !== base.stockDate;
  return { ...bases, replenishmentDetail: { ...input, batches, sourceDate: stockDate, summaryDate: base.stockDate, expectedQty: base.availableQty, detailQty,
    notice: stale ? `当前库存汇总日期为${base.stockDate}，批次明细仅同步至${stockDate}。以下为最近已同步的历史批次，不代表当天库存，不能与当前可用量直接核对。`
      : detailQty === null || base.availableQty === null || Math.abs(detailQty - base.availableQty) > 0.0001 ? "批次可用量与基地汇总暂不一致，请核对库存快照日期和明细完整性。" : undefined } };
}
