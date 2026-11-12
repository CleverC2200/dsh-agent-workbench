import type { PageElement } from '../page-bridge/catalog.ts';

export const WORKBENCH_SURFACE = 'gea-workbench' as const;
export const WORKBENCH_TOOL_NAME = 'gea_workbench_apply' as const;

export const WORKBENCH_CATALOG = {
  surface: WORKBENCH_SURFACE,
  tool: WORKBENCH_TOOL_NAME,
  reasonField: 'reason',
  description:
    '改当前 GEA 审批工作台这一屏，并且只改页面开放的部分。' +
    'invoke 执行元素声明的动作（展开/收起某行、打开详情、清筛选等）；' +
    'setValue 只写「可编辑」元素（审批阶段、筛选值、页码、确认计划量）；' +
    'select 勾选行；clear 关闭抽屉。' +
    '只读元素（金额、状态、物料描述等）只能读不能改；' +
    '只执行当前目录实际开放的动作，不可直接改后台状态。草稿不等于提交；提交/审批类元素需本轮明确要求、confirm=true 和有效业务权限，以真实回执为准。不要擅自改筛选或阶段。',
} as const;

export const workbenchCatalog = (elements: PageElement[]) =>
  elements.length === 0
    ? null
    : {
        ...WORKBENCH_CATALOG,
        elements,
      };
