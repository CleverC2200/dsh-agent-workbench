/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import { type ApprovalReasonRequirement } from './regionalApprovalDetailFixture.ts';
import type { ApprovalVersion, RegionalApprovalRow } from './regionalApprovalFixture.ts';
export type ApprovalSuggestionDisposition = 'pending' | 'accepted' | 'ignored';
export type ApprovalSkuAdjustment = {
    skuId: string;
    initialQuantity: number;
    initialAmount: number;
    aiQuantity: number;
    aiAmount: number;
    editedQuantity: number;
    editedAmount: number;
    reason: string;
    reasonRequirement: ApprovalReasonRequirement;
    suggestionDisposition: ApprovalSuggestionDisposition;
    suggestionPreviousQuantity?: number;
    suggestionPreviousAmount?: number;
};
export type ApprovalPlanAdjustment = {
    organizationId: string;
    version: ApprovalVersion;
    saved: Record<string, ApprovalSkuAdjustment>;
    working: Record<string, ApprovalSkuAdjustment>;
};
export type ApprovalDetailStore = {
    plans: Record<string, ApprovalPlanAdjustment>;
    /** Explicit unsent UI text, partitioned by the actual Core Session and current plan/version/role. */
    liveInputs?: Record<string, Record<string, string>>;
};
export declare const liveInputKey: (sessionId: string, planId: string, versionId: string, role: string | undefined) => string;
export declare const EMPTY_APPROVAL_DETAIL_STORE: ApprovalDetailStore;
export declare const approvalPlanKey: (organizationId: string, version: ApprovalVersion) => string;
export declare const ensureApprovalPlan: (store: ApprovalDetailStore, row: RegionalApprovalRow, version: ApprovalVersion) => ApprovalDetailStore;
export type ApprovalDetailAction = {
    type: 'edit';
    skuId: string;
    quantity: number;
} | {
    type: 'edit-amount';
    skuId: string;
    amount: number;
} | {
    type: 'edit-plan-quantity';
    quantity: number;
} | {
    type: 'edit-plan-amount';
    amount: number;
} | {
    type: 'reason';
    skuId: string;
    reason: string;
} | {
    type: 'reason-all';
    reason: string;
} | {
    type: 'accept-suggestion';
    skuId: string;
} | {
    type: 'ignore-suggestion';
    skuId: string;
} | {
    type: 'restore-suggestion';
    skuId: string;
} | {
    type: 'accept-all-suggestions';
} | {
    type: 'save';
} | {
    type: 'discard';
};
export declare const reduceApprovalDetailStore: (store: ApprovalDetailStore, row: RegionalApprovalRow, version: ApprovalVersion, action: ApprovalDetailAction) => ApprovalDetailStore;
export declare const approvalPlan: (store: ApprovalDetailStore, row: RegionalApprovalRow, version: ApprovalVersion) => ApprovalPlanAdjustment;
export declare const isApprovalPlanDirty: (plan: ApprovalPlanAdjustment) => boolean;
export declare const approvalPlanValidationErrors: (plan: ApprovalPlanAdjustment) => string[];
export type SavedApprovalAdjustment = {
    organizationId: string;
    version: ApprovalVersion;
    skuId: string;
    initialQuantity: number;
    editedQuantity: number;
    initialAmount: number;
    editedAmount: number;
    reason: string;
    suggestionDisposition: ApprovalSuggestionDisposition;
};
export declare const savedApprovalAdjustments: (store: ApprovalDetailStore) => SavedApprovalAdjustment[];
