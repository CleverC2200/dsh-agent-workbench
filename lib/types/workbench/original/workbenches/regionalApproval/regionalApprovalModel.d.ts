/** 改编自 AionUi（Apache-2.0）：已替换为本地导入并使用显式 DSH Host 适配器，见 SOURCE.md。 */
import type { ApprovalAreaKey, ApprovalBranchKey, ApprovalCustomerKey, ApprovalDepartmentKey, ApprovalHealth, ApprovalStageId, ApprovalState, ApprovalVersion, RegionalApprovalRow } from './regionalApprovalFixture.ts';
export declare const ALL_ORGANIZATIONS: "all";
export type ApprovalOrganizationFilters = {
    area: ApprovalAreaKey | typeof ALL_ORGANIZATIONS;
    branch: ApprovalBranchKey | typeof ALL_ORGANIZATIONS;
    department: ApprovalDepartmentKey | typeof ALL_ORGANIZATIONS;
    customer: ApprovalCustomerKey | typeof ALL_ORGANIZATIONS;
    approval: ApprovalState | typeof ALL_ORGANIZATIONS;
    health: ApprovalHealth | typeof ALL_ORGANIZATIONS;
};
export type ApprovalOrganizationFilterField = keyof ApprovalOrganizationFilters;
export declare const DEFAULT_APPROVAL_FILTERS: ApprovalOrganizationFilters;
export declare const approvalFilterOptions: (rows: readonly RegionalApprovalRow[], filters: ApprovalOrganizationFilters) => Record<ApprovalOrganizationFilterField, string[]>;
export declare const normalizeApprovalFilters: (rows: readonly RegionalApprovalRow[], filters: ApprovalOrganizationFilters) => ApprovalOrganizationFilters;
export declare const updateApprovalFilter: <Field extends ApprovalOrganizationFilterField>(rows: readonly RegionalApprovalRow[], filters: ApprovalOrganizationFilters, field: Field, value: ApprovalOrganizationFilters[Field]) => ApprovalOrganizationFilters;
export declare const projectApprovalRows: (rows: readonly RegionalApprovalRow[], filters: ApprovalOrganizationFilters) => RegionalApprovalRow[];
export declare const metricsForApprovalVersion: (row: RegionalApprovalRow, version: ApprovalVersion) => {
    quantity: number;
    amount: number;
};
export type ApprovalPage<Row> = {
    rows: Row[];
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
};
export declare const paginateApprovalRows: <Row>(rows: readonly Row[], requestedPage: number, pageSize: number) => ApprovalPage<Row>;
export type ApprovalCsvLabels = {
    version: string;
    stage: string;
    organization: string;
    area: string;
    branch: string;
    department: string;
    customer: string;
    quantity: string;
    amount: string;
    versionValues: Record<ApprovalVersion, string>;
};
export declare const buildApprovalCsv: (rows: readonly RegionalApprovalRow[], version: ApprovalVersion, stage: ApprovalStageId, labels: ApprovalCsvLabels) => string;
