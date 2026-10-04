import type { TFunction } from 'i18next';
import React from 'react';
import { type ApprovalDetailStore } from './regionalApprovalDetailModel.ts';
import { type ApprovalStageId, type ApprovalVersion, type RegionalApprovalRow } from './regionalApprovalFixture.ts';
declare const RegionalApprovalPlanDetail: React.FC<{
    visible: boolean;
    rows: readonly RegionalApprovalRow[];
    row: RegionalApprovalRow;
    approvalStage: ApprovalStageId;
    categoryComparison: boolean;
    version: ApprovalVersion;
    store: ApprovalDetailStore;
    t: TFunction;
    onStoreChange: (store: ApprovalDetailStore) => void;
    onClose: () => void;
    onRowChange: (rowId: string) => void;
    onVersionChange: (version: ApprovalVersion) => void;
}>;
export default RegionalApprovalPlanDetail;
