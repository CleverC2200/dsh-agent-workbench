/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import type { GeaSalesPlanListItem } from '../../bridge.ts';
import type { TFunction } from 'i18next';
import React from 'react';
import type { RegionalApprovalQueryError } from './useRegionalApprovalQuery.ts';
declare const RegionalApprovalLiveProgress: React.FC<{
    records?: readonly GeaSalesPlanListItem[];
    status: 'idle' | 'loading' | 'success' | 'error';
    error?: RegionalApprovalQueryError;
    t: TFunction;
    onRetry: () => void;
}>;
export default RegionalApprovalLiveProgress;
