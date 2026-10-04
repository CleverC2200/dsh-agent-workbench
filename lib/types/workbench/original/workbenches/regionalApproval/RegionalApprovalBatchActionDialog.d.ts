import type { TFunction } from 'i18next';
import React from 'react';
import { type SalesPlanActionClient } from './models/salesPlanActionModel.ts';
import type { SalesPlanAccess } from './models/salesPlanAccessModel.ts';
import type { RegionalApprovalLiveRow } from './regionalApprovalQueryModel.ts';
export type BatchActionKind = 'APPROVE' | 'REJECT';
export type BatchActionItem = {
    row: RegionalApprovalLiveRow;
    /** 与单笔按钮同源的能力证据；缺失时该笔不提交，只在结果里说明原因。 */
    access?: SalesPlanAccess;
    /** 与单笔按钮同源的置灰原因键，用于把「为什么这一笔没提交」说清楚。 */
    skipReason?: string;
};
export type BatchActionOutcome = {
    planId: string;
    label: string;
    /** 组织路径，便于在结果里认人是哪一笔。 */
    context?: string;
    status: 'success' | 'failed' | 'skipped';
    /** 失败或跳过时的业务语言说明。 */
    detail?: string;
};
/**
 * 批量审批：按用户勾选逐笔提交，逐笔校验并逐笔回报结果。
 * 一笔失败不回滚已成功的，也不阻止后续提交；返回时会汇总成功、失败与跳过。
 */
declare const RegionalApprovalBatchActionDialog: React.FC<{
    visible: boolean;
    kind: BatchActionKind;
    items: readonly BatchActionItem[];
    t: TFunction;
    client?: SalesPlanActionClient;
    onPermissionDenied: (versionId: string) => void;
    onCompleted: (outcomes: readonly BatchActionOutcome[]) => void | Promise<void>;
    onClose: () => void;
}>;
export default RegionalApprovalBatchActionDialog;
