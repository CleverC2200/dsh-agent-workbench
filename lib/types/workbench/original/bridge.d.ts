import type { SalesPlanLocalDraft } from './workbenches/regionalApproval/models/salesPlanLocalDraftModel.ts';
import type { SalesPlanApprovalRole } from './workbenches/regionalApproval/models/salesPlanAccessModel.ts';
/** 这是独立工作台与 Host 的唯一端口；不加载 AionUi 进程或 IPC，认证、授权和写入仍由 Host 负责。 */
import type * as Api from './contracts.ts';
export type * from './contracts.ts';
/** 由 Host 持有的 GEA 传输；认证、授权和写入仍由服务端负责。 */
export interface WorkbenchHost {
    salesPlan: {
        draft?: {
            invoke(params: {
                planId: string;
                versionId: string;
                approvalRole?: string;
                draft?: SalesPlanLocalDraft;
                signal?: AbortSignal;
            }): Promise<{
                draft: SalesPlanLocalDraft | null;
                sourceSnapshot?: string;
                savedAt?: string;
                stale?: boolean;
            }>;
        };
        periods: {
            invoke(query?: Api.GeaSalesPlanPeriodQuery): Promise<Api.GeaSalesPlanPage<Api.GeaSalesPlanPeriod>>;
        };
        list: {
            invoke(query?: Api.GeaSalesPlanPageQuery): Promise<Api.GeaSalesPlanPage<Api.GeaSalesPlanListItem>>;
        };
        detail: {
            invoke(query: Api.GeaSalesPlanResourceQuery): Promise<Api.GeaSalesPlanDetail>;
        };
        versions: {
            invoke(query: Api.GeaSalesPlanResourceQuery): Promise<Api.GeaSalesPlanVersion[]>;
        };
        logs: {
            invoke(query: Api.GeaSalesPlanResourceQuery): Promise<Api.GeaSalesPlanApprovalLog[]>;
        };
        versionSkus: {
            invoke(query: Api.GeaSalesPlanVersionSkuQuery): Promise<Api.GeaSalesPlanSku[]>;
        };
        compare: {
            invoke(query: Api.GeaSalesPlanCompareQuery): Promise<Api.GeaSalesPlanSkuDiff[]>;
        };
        action: {
            invoke(params: Api.GeaSalesPlanActionParams): Promise<Api.GeaSalesPlanActionReceipt>;
        };
        submit: {
            invoke(params: Api.GeaSalesPlanSubmitParams): Promise<Api.GeaSalesPlanSubmitReceipt>;
        };
        /** 重新解析当前账号角色（管理员刚改完权限时用界面刷新触发）；返回角色编码与名称。 */
        approvalRoles?: {
            invoke(input: {
                signal?: AbortSignal;
            }): Promise<{
                roles: SalesPlanApprovalRole[];
            }>;
        };
    };
    modelInference: {
        invoke(params: {
            question: string;
            signal?: AbortSignal;
        }): Promise<{
            status: 'ok' | 'noAnswer' | 'toolsRequired' | 'timeout' | 'failed';
            provider_id: string;
            model: string;
            answer?: string;
        }>;
    };
}
export declare const WorkbenchHostProvider: import("react").Provider<WorkbenchHost | null>;
export declare function useWorkbenchHost(): WorkbenchHost;
