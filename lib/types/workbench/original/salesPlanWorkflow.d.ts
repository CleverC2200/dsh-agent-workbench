/** 本地只投影 V1.2 节点与状态转换；服务端仍是权限和写入的唯一权威。 */
export type SalesPlanRole = 'customer' | 'region' | 'province' | 'area' | 'category';
export type SalesPlanWorkflowRow = {
    typeCode: string;
    examineLevel: number;
    nodeNum: string;
};
/** 本地投影包含用户确认移除 JD 8 / TM 9；实时 SQL 验收另行进行。 */
export declare const SALES_PLAN_WORKFLOW_ROWS: readonly SalesPlanWorkflowRow[];
export declare const SALES_PLAN_ROLES: readonly SalesPlanRole[];
export declare const SALES_PLAN_RETURN_CODES: Partial<Record<SalesPlanRole, number>>;
/** 文档内查询投影；每个打包后的工作台文档都有独立的模块实例。 */
export declare function replaceSalesPlanWorkflowRows(rows: readonly SalesPlanWorkflowRow[]): void;
export declare const salesPlanWorkflow: (typeCode: string, rows?: readonly SalesPlanWorkflowRow[]) => {
    valid: boolean;
    rolesKnown: boolean;
    chain: SalesPlanWorkflowRow[];
    actor: (status: number) => SalesPlanRole | undefined;
    pending: (role: SalesPlanRole) => number | undefined;
    pendingStatuses: (role: SalesPlanRole) => number[];
    queueStatuses: (role: SalesPlanRole) => number[];
    transition: (status: number, action: "SAVE" | "APPROVE" | "REJECT") => number | undefined;
    visibility: (status: number, role: SalesPlanRole) => "writable" | "read-only" | "denied";
    confirmationRoles: (status: number) => SalesPlanRole[];
    statusLabelCode: (status: number) => number | undefined;
    /** 原始 DMS 节点保持不透明；即使未提供角色名称也可安全使用。 */
    nextNode: (nodeNum: string) => string | undefined;
    resubmit: (status: number) => number | undefined;
};
