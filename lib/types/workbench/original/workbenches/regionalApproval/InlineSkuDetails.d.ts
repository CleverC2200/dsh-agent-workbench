import React from 'react';
import type { TFunction } from 'i18next';
import { type GeaSalesPlanDetail } from '../../bridge.ts';
import { type RegionalApprovalLiveRow } from './regionalApprovalQueryModel.ts';
import type { ApprovalStageId } from './regionalApprovalFixture.ts';
export declare function InlineSkuDetails({ row, t, detail, canEdit, approvalRole, categoryName, onMetricsChange, onPendingValuesChange, draftPatch, onElementsChange }: {
    row: RegionalApprovalLiveRow;
    t: TFunction;
    detail?: GeaSalesPlanDetail;
    canEdit?: boolean;
    approvalRole?: ApprovalStageId;
    categoryName?: string;
    onMetricsChange?: (metrics?: {
        quantity: string;
        amount: string;
    }) => void;
    /**
     * 把「界面上现在的本节点确认量」直接交给上层：通过时不必等 500ms 防抖落盘，
     * 也不会因为草稿里的旧值把用户刚改的数字冲掉。
     */
    onPendingValuesChange?: (values: Record<string, string>) => void;
    /** 外部（对话）下发的草稿改写：把指定 SKU 的确认计划量改成同一个值。 */
    draftPatch?: {
        at: number;
        quantity: string;
        skuCodes?: string[];
    };
    /** 把这一块“可编辑字段 + 集合”报给工作台，供页面桥声明成本页元素。 */
    onElementsChange?: (fields: Array<{
        id: string;
        label: string;
        value: string;
        editable: boolean;
    }>, collection?: {
        id: string;
        label: string;
        members: string[];
    }) => void;
}): React.JSX.Element;
