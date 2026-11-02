export type TransferOrderDetail = {
  orderNo: string;
  status: string;
  demandQty: number | null;
  allocatedQty: number | null;
  shippedQty: number | null;
  pendingQty: number | null;
  inTransitQty: number | null;
};
export type BaseStockBatch = {
  warehouseName: string;
  productionDate: string | null;
  quantity: number | null;
  availableQty: number | null;
  ageDays: number | null;
};
export type ReplenishmentDetail = {
  sku: string;
  kind: 'transfers' | 'bases' | 'batches';
  baseName?: string;
  transfers?: TransferOrderDetail[];
  batches?: BaseStockBatch[];
  expectedQty?: number | null;
  detailQty?: number | null;
  sourceDate?: string;
  summaryDate?: string;
  notice?: string;
};
