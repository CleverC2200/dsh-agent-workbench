import type { GeaSalesPlanDetail } from '../../../bridge.ts';
import type { RegionalApprovalLiveRow } from '../regionalApprovalQueryModel.ts';
import type { SalesPlanDetailClient } from './useSalesPlanDetail.ts';
export declare const useSalesPlanAccess: (rows: readonly RegionalApprovalLiveRow[], client: SalesPlanDetailClient | undefined, enabled: boolean) => {
    entries: Record<string, GeaSalesPlanDetail>;
    failedVersions: Set<string>;
    refresh: () => void;
};
