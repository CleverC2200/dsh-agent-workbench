import type { TFunction } from 'i18next';
import React from 'react';
import type { SavedApprovalAdjustment } from './regionalApprovalDetailModel.ts';
import type { ApprovalStageId, ApprovalVersion, RegionalApprovalRow } from './regionalApprovalFixture.ts';
import { type RegionalApprovalActionExecutor, type RegionalApprovalActionStore } from './regionalApprovalActionModel.ts';
declare const RegionalApprovalActionDialog: React.FC<{
    visible: boolean;
    rows: readonly RegionalApprovalRow[];
    version: ApprovalVersion;
    approvalStage: ApprovalStageId;
    savedAdjustments: SavedApprovalAdjustment[];
    store: RegionalApprovalActionStore;
    t: TFunction;
    executor?: RegionalApprovalActionExecutor;
    onStoreChange: React.Dispatch<React.SetStateAction<RegionalApprovalActionStore>>;
    onClose: () => void;
}>;
export default RegionalApprovalActionDialog;
