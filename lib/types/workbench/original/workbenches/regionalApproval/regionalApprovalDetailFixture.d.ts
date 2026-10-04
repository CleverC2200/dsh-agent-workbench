import type { ApprovalVersion, RegionalApprovalRow } from './regionalApprovalFixture.ts';
export type ApprovalReasonRequirement = 'required' | 'optional';
export type RegionalApprovalSkuFixture = {
    id: string;
    productKey: 'dumpling' | 'wonton' | 'rice-ball';
    unitPrice: number;
    initialQuantity: number;
    aiQuantity: number;
    reasonRequirement: ApprovalReasonRequirement;
    evidenceKey: 'seasonal' | 'inventory' | 'policy';
};
export declare const regionalApprovalSkuFixtures: (row: RegionalApprovalRow, version: ApprovalVersion) => RegionalApprovalSkuFixture[];
