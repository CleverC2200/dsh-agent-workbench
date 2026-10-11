/**
 * 各业务页面的欢迎文案、固定功能与推荐问题。
 * Workbench 只贡献呈现；输入、草稿和模型任务沿当前 Core 接口。
 */
export type ConversationActionIcon = 'chart' | 'alert' | 'info' | 'check' | 'versions' | 'opinion' | 'box' | 'users';
export type ConversationActionTone = 'brand' | 'info' | 'success';
export type ConversationPromptAction = {
    icon: ConversationActionIcon;
    tone: ConversationActionTone;
    /** 功能标题。 */
    label: string;
    /** 一行说明。 */
    detail: string;
    /** 点击后填入输入框的内容。 */
    prompt: string;
};
export type ConversationPromptConfig = {
    /** 会话区顶栏名称：统一用「功能模块名 + Agent」，和左侧菜单保持一致；不再挂副标。 */
    name: string;
    intro: string;
    /** 简介里加粗的边界句。 */
    boundary: string;
    actions: ConversationPromptAction[];
    prompts: string[];
};
/** 方案 A · 提报版：客户 / 代报人（KA、行销综合、业务员）的提报界面。 */
export declare const reportingConversation: ConversationPromptConfig;
/** 方案 B · 审批版：城市经理（区域计划审批）/ 省区总 / 大区总 / 品类计划审核人的审批工作台。 */
export declare const approvalConversation: ConversationPromptConfig;
/** 主生产计划（MPS）：统一 Agent 命名，保留原型定位与推荐问题。 */
export declare const mpsPlanConversation: ConversationPromptConfig;
/** 经销商补货（库存）业务页沿用原有助手文案。 */
export declare const regionalPlanConversation: ConversationPromptConfig;
/** 品类计划工作台：文案沿用原型内的「品类计划助手」（简介 / 4 项固定功能 / 4 条推荐问题）。 */
export declare const categoryPlanConversation: ConversationPromptConfig;
/** 经销商补货（库存）业务页沿用原有助手文案。 */
export declare const inventoryConversation: ConversationPromptConfig;
/** AI 工作台首页：没有打开具体业务页时的通用助手。 */
export declare const homeConversation: ConversationPromptConfig;
/** 业务待办页：GEA 消息待办与审批提醒。 */
export declare const inboxConversation: ConversationPromptConfig;
/** 需求运营管理页：需求信号研判。 */
export declare const demandOpsConversation: ConversationPromptConfig;
/** 交付运营管理页：订单履约风险。 */
export declare const deliveryOpsConversation: ConversationPromptConfig;
/** 安全库存页：基地口径的库存水位与货龄。 */
export declare const safetyStockConversation: ConversationPromptConfig;
/** 分仓库存页：分仓经营与补货。 */
export declare const branchStockConversation: ConversationPromptConfig;
/** 库存管理工作台：基地 + 分仓的今日运营。 */
export declare const inventoryWorkbenchConversation: ConversationPromptConfig;
/** 全链路库存页：基地到分仓的链路视角。 */
export declare const fullChainStockConversation: ConversationPromptConfig;
/** 产销协同页：经营计划、库存与履约的跨模块视角。 */
export declare const supplyCoordinationConversation: ConversationPromptConfig;
/** 客户库存页：客户库存健康度、周转与大日期风险。 */
export declare const customerStockConversation: ConversationPromptConfig;
/** 订单工作台：订单状态、供应风险与提报审批进度。 */
export declare const orderManagementConversation: ConversationPromptConfig;
/** 订单履约页：接收、校验与 OMS 推送进度。 */
export declare const orderFulfillmentConversation: ConversationPromptConfig;
