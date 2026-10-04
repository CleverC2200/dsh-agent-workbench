/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import type { ApprovalStageId, ApprovalVersion } from './regionalApprovalFixture.ts';
export type RegionalApprovalActionKind = 'return' | 'submit';
export type RegionalApprovalReturnTarget = 'previous-stage' | 'submitting-organization' | '';
export type RegionalApprovalImpactScope = 'current-organization' | 'filtered-scope';
export type RegionalApprovalActionScope = {
    organizationId: string;
    version: ApprovalVersion;
    approvalStage: ApprovalStageId;
    savedAdjustmentCount: number;
};
export type RegionalApprovalActionCommand = {
    requestId: string;
    key: string;
    kind: RegionalApprovalActionKind;
    attempt: number;
    scope: RegionalApprovalActionScope;
    returnTarget?: Exclude<RegionalApprovalReturnTarget, ''>;
    reason?: string;
    impactScope?: RegionalApprovalImpactScope;
};
export type RegionalApprovalFixtureOutcome = {
    source: 'fixture';
    resultId: string;
    completedAt: string;
};
export type RegionalApprovalActionResult = RegionalApprovalFixtureOutcome & {
    key: string;
    kind: RegionalApprovalActionKind;
    scope: RegionalApprovalActionScope;
    returnTarget?: Exclude<RegionalApprovalReturnTarget, ''>;
    impactScope?: RegionalApprovalImpactScope;
};
export type RegionalApprovalActionOperation = {
    command: RegionalApprovalActionCommand;
    status: 'loading' | 'success' | 'failure' | 'cancelled';
    errorCode?: string;
    outcome?: RegionalApprovalFixtureOutcome;
};
export type RegionalApprovalActionStore = {
    returnDraft: {
        target: RegionalApprovalReturnTarget;
        reason: string;
        impactScope: RegionalApprovalImpactScope;
    };
    submitConfirmed: boolean;
    operation?: RegionalApprovalActionOperation;
    results: Record<string, RegionalApprovalActionResult>;
};
export declare const EMPTY_REGIONAL_APPROVAL_ACTION_STORE: RegionalApprovalActionStore;
export declare const regionalApprovalActionKey: (kind: RegionalApprovalActionKind, scope: RegionalApprovalActionScope) => string;
export declare const regionalApprovalReturnValidationErrors: (store: RegionalApprovalActionStore) => string[];
export declare const regionalApprovalSubmitValidationErrors: (store: RegionalApprovalActionStore) => string[];
export type RegionalApprovalActionStoreAction = {
    type: 'return-target';
    target: RegionalApprovalReturnTarget;
} | {
    type: 'return-reason';
    reason: string;
} | {
    type: 'return-impact';
    impactScope: RegionalApprovalImpactScope;
} | {
    type: 'submit-confirmed';
    confirmed: boolean;
} | {
    type: 'start';
    command: RegionalApprovalActionCommand;
} | {
    type: 'success';
    requestId: string;
    outcome: RegionalApprovalFixtureOutcome;
} | {
    type: 'failure';
    requestId: string;
    errorCode: string;
} | {
    type: 'cancel';
    requestId: string;
} | {
    type: 'clear-operation';
};
export declare const reduceRegionalApprovalActionStore: (store: RegionalApprovalActionStore, action: RegionalApprovalActionStoreAction) => RegionalApprovalActionStore;
export type RegionalApprovalActionExecutor = (command: RegionalApprovalActionCommand) => Promise<RegionalApprovalFixtureOutcome>;
export declare const executeRegionalApprovalFixtureAction: RegionalApprovalActionExecutor;
export declare const regionalApprovalFixtureResults: (store: RegionalApprovalActionStore) => RegionalApprovalActionResult[];
