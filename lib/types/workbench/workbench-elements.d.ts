/**
 * 把工作台当前这一屏"渲染出来的元素"翻译成页面桥的元素清单。
 *
 * 只描述屏幕上看得见、人能操作的东西：行、控件、可编辑字段。
 * 内部状态、缓存、接口都不进清单，所以模型也调不到。
 */
import { type PageElement } from "../page-bridge/catalog.ts";
export type WorkbenchElementInput = {
    /** 当前可见的计划行。 */
    rows: Array<{
        planId: string;
        label: string;
        value: string;
        expanded: boolean;
    }>;
    selectedPlanIds: string[];
    /** 审批阶段：all 表示不限。 */
    stage: string;
    stageOptions: Array<{
        value: string;
        label: string;
    }>;
    /** 筛选控件（areaCode/provinceCode/orgCode/dealerCode/status）。 */
    filters: Array<{
        field: string;
        label: string;
        value: string;
        options: Array<{
            value: string;
            label: string;
        }>;
    }>;
    page: number;
    pages: number;
    /** 打开中的详情抽屉。 */
    detail?: {
        planId: string;
        label: string;
    };
    /** 已展开行里的可编辑字段（确认计划量）。 */
    fields: Array<{
        id: string;
        label: string;
        value: string;
        editable: boolean;
    }>;
    /** 一列一起改用的集合。 */
    collections: Array<{
        id: string;
        label: string;
        members: string[];
    }>;
    /** 工具栏动作（例如通过 / 退回），只在按钮当前可点时声明。 */
    actionElements?: Array<{
        id: string;
        label: string;
        value?: string;
        actions: string[];
        /** 通过/退回这类会落审批状态的元素，标记为 approve，必须用户明确要求才执行。 */
        effect?: "submit" | "approve";
    }>;
    /** 打开中的审批对话框：确认/取消 + 它自己的输入项（例如退回理由）。 */
    dialog?: {
        label: string;
        actions: string[];
        fields?: Array<{
            id: string;
            label: string;
            value: string;
            editable: boolean;
        }>;
    };
};
export declare function buildWorkbenchElements(input: WorkbenchElementInput): PageElement[];
