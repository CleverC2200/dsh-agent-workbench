/** 文档内加载工作流；已取消或被新请求取代的读取不会安装结果。 */
import { type SalesPlanWorkflowRow } from './original/salesPlanWorkflow.ts';
export declare function createWorkflowLoader(read: (signal?: AbortSignal) => Promise<SalesPlanWorkflowRow[]>): (signal?: AbortSignal) => Promise<void>;
