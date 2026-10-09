/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import { type GeaSalesPlanActionReceipt, type GeaSalesPlanActionRequest, type GeaSalesPlanDetail } from '../../bridge.ts';
import type { TFunction } from 'i18next';
import React from 'react';
import { type SalesPlanActionClient, type SalesPlanActionError } from './models/salesPlanActionModel.ts';
import { type RegionalApprovalLiveRow } from './regionalApprovalQueryModel.ts';
import type { ApprovalStageId } from './regionalApprovalFixture.ts';
export type LiveActionKind = 'APPROVE' | 'REJECT' | 'SAVE';
/**
 * V1.8 #12：失败提示只给业务语言。后端原文只有在像业务话术时才透出；
 * 一旦判定为技术文案（字段名 / 错误码 / 报文），就换成按 HTTP 语义的业务文案，
 * 另附一个可口头转述的「错误编号」，技术细节只进控制台。
 */
export declare const actionErrorText: (t: TFunction, error: SalesPlanActionError) => string;
declare const RegionalApprovalLiveActionDialog: React.FC<{
    visible: boolean;
    embedded?: boolean;
    row: RegionalApprovalLiveRow;
    approvalStage: ApprovalStageId;
    initialAction?: LiveActionKind;
    autoSubmitApproval?: boolean;
    t: TFunction;
    client?: SalesPlanActionClient;
    evidence?: GeaSalesPlanDetail;
    approvalStages?: readonly ApprovalStageId[];
    /** 内联明细当前显示的本节点确认量（用户改过、可能还没落盘）；比本地草稿更新，优先采用。 */
    pendingValues?: Record<string, string>;
    onPermissionDenied: (versionId: string) => void;
    onSucceeded: (receipt: GeaSalesPlanActionReceipt, request: GeaSalesPlanActionRequest) => void | Promise<void>;
    onRefresh: () => void;
    /** 动作请求失败（含并发冲突、权限被拒）都会回调，用来收掉调用方的选中态。 */
    onAttemptFailed?: () => void;
    onFailed?: () => void;
    onClose: () => void;
    /** 对话下发的“退回理由”草稿（等价于人工在理由框里输入）。 */
    remarkPatch?: {
        at: number;
        remark: string;
    };
    /** 对话下发的“确认提交”（等价于人工点确认按钮）。 */
    submitRequest?: {
        at: number;
    };
}>;
export default RegionalApprovalLiveActionDialog;
