/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import type { GeaSalesPlanSku } from '../../../bridge.ts';
import type { ApprovalDimension } from '../salesPlanDomain.ts';
import { type RegionalApprovalLiveRow } from '../regionalApprovalQueryModel.ts';
export type SalesPlanAdjustmentRecord = {
    recordId: string;
    plan: RegionalApprovalLiveRow;
    sku: GeaSalesPlanSku;
    qty: string;
    amount: string;
};
export type SalesPlanAdjustmentGroup = {
    id: string;
    dimensionName: string;
    skuCode: string;
    categoryName: string;
    materialDescription?: string;
    records: SalesPlanAdjustmentRecord[];
    baseQty: string;
    qty: string;
    baseAmount: string;
    amount: string;
    quantityDelta: string;
    amountDelta: string;
    price: string;
};
export type SalesPlanAdjustmentDraft = {
    versionId: string;
    skuCode: string;
    sourceQty: string;
    sourceAmount: string;
    qty: string;
    amount: string;
};
export declare const adjustmentDimensionsFrom: (dimension: ApprovalDimension) => ApprovalDimension[];
export declare const adjustmentDimensionName: (row: RegionalApprovalLiveRow, dimension: ApprovalDimension) => string;
export declare const adjustmentDimensionKey: (row: RegionalApprovalLiveRow, dimension: ApprovalDimension) => string;
export declare const adjustmentScopeRows: (rows: readonly RegionalApprovalLiveRow[], selected: RegionalApprovalLiveRow, dimension: ApprovalDimension) => RegionalApprovalLiveRow[];
export declare const createSalesPlanAdjustmentRecords: (entries: readonly {
    plan: RegionalApprovalLiveRow;
    skus: readonly GeaSalesPlanSku[];
}[]) => SalesPlanAdjustmentRecord[];
export declare const groupSalesPlanAdjustmentRecords: (records: readonly SalesPlanAdjustmentRecord[], dimension: ApprovalDimension) => SalesPlanAdjustmentGroup[];
/**
 * 固定业务规则：按每个客户原始基数份额分配，
 * 除最后一行外逐行取整，最后一行承接精确余数。
 */
export declare const distributeAggregateQuantity: (records: readonly SalesPlanAdjustmentRecord[], desiredQuantity: number) => SalesPlanAdjustmentRecord[];
export declare const updateAggregateQuantity: (records: readonly SalesPlanAdjustmentRecord[], group: SalesPlanAdjustmentGroup, desiredQuantity: number) => SalesPlanAdjustmentRecord[];
export declare const updateAggregateAmount: (records: readonly SalesPlanAdjustmentRecord[], group: SalesPlanAdjustmentGroup, desiredAmount: number) => SalesPlanAdjustmentRecord[];
export declare const updateCustomerQuantity: (records: readonly SalesPlanAdjustmentRecord[], group: SalesPlanAdjustmentGroup, desiredQuantity: number) => SalesPlanAdjustmentRecord[];
export declare const updateCustomerAmount: (records: readonly SalesPlanAdjustmentRecord[], group: SalesPlanAdjustmentGroup, desiredAmount: number) => SalesPlanAdjustmentRecord[];
export declare const adjustmentRecordDraft: (record: SalesPlanAdjustmentRecord) => SalesPlanAdjustmentDraft;
