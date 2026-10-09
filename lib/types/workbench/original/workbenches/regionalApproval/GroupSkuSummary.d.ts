import React from 'react';
import type { TFunction } from 'i18next';
import { type GeaSalesPlanSku } from '../../bridge.ts';
import type { ApprovalStageId } from './regionalApprovalFixture.ts';
import type { RegionalApprovalLiveRow } from './regionalApprovalQueryModel.ts';
type SkuReader = {
    versionSkus: {
        invoke: (query: {
            versionId: string;
            signal?: AbortSignal;
        }) => Promise<GeaSalesPlanSku[]>;
    };
};
export declare function GroupSkuSummary({ members, approvalRole, pendingValues, client: suppliedClient, t }: {
    members: readonly RegionalApprovalLiveRow[];
    approvalRole?: ApprovalStageId;
    pendingValues?: Readonly<Record<string, Readonly<Record<string, string>>>>;
    client?: SkuReader;
    t: TFunction;
}): React.JSX.Element;
export {};
