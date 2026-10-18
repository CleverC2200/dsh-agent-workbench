/**
 * GEA 审批工作台的自述：页面标识、工具名与总述。
 *
 * 具体"这一屏有什么元素"由工作台按当前状态动态上报（见 src/workbench/workbench-elements.ts），
 * 工具名、参数表与说明全部由通用桥按这份目录 + 元素清单生成（src/page-bridge/catalog.ts）。
 * 新增页面元素只需要页面多声明一个元素，这里和桥都不用改。
 */
import type { PageElement } from '../page-bridge/catalog.ts';
export declare const WORKBENCH_SURFACE: "gea-workbench";
export declare const WORKBENCH_TOOL_NAME: "gea_workbench_apply";
export declare const WORKBENCH_CATALOG: {
    readonly surface: "gea-workbench";
    readonly tool: "gea_workbench_apply";
    readonly reasonField: "reason";
    readonly description: string;
};
/**
 * 工具定义 = 固定总述 + 当前这一屏的元素清单。
 *
 * 这一屏没有可操作元素时返回 null（而不是一份空目录）：null 在桥里的含义是
 * "这个会话现在没有页面能力"，宿主会立刻注销工具。切走页面、加载中、页面报空
 * 都走这条，避免把上一屏的元素留在会话里（那会让模型对着不存在的元素下指令）。
 */
export declare const workbenchCatalog: (elements: PageElement[]) => {
    elements: PageElement[];
    surface: "gea-workbench";
    tool: "gea_workbench_apply";
    reasonField: "reason";
    description: string;
} | null;
