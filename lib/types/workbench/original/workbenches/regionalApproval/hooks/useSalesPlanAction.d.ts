/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import { type GeaSalesPlanActionReceipt } from '../../../bridge.ts';
import { type SalesPlanActionClient, type SalesPlanActionError, type SalesPlanActionInput } from '../models/salesPlanActionModel.ts';
export type SalesPlanActionState = {
    status: 'idle';
} | {
    status: 'loading';
} | {
    status: 'success';
    receipt: GeaSalesPlanActionReceipt;
} | {
    status: 'error';
    error: SalesPlanActionError;
};
export declare const useSalesPlanAction: ({ client: suppliedClient }: {
    client?: SalesPlanActionClient;
}) => {
    state: SalesPlanActionState;
    execute: (input: SalesPlanActionInput) => Promise<GeaSalesPlanActionReceipt>;
    retry: () => Promise<GeaSalesPlanActionReceipt>;
};
