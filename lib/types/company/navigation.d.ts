/** Plugins declare their navigation using the standard DSH main-slot label/order. */
type Entry = {
    options: {
        key?: string;
        label?: (() => string) | string;
        order?: number;
    };
};
export declare const businessMenuLabel: (pageId: string, fallback: string) => string;
export declare function registeredBusinessPanels(entries: readonly Entry[]): {
    id: string;
    title: string;
    order: number;
}[];
export declare function isGeaBusinessPanel(panel: string | null | undefined, entries: readonly Entry[]): boolean;
/**
 * 由 GEA 外壳自己接管右栏布局的面板：原生主对话、业务工作台、待办，以及内嵌原型的工作台页。
 * 这些页面共用「欢迎区在上、输入区在下」的右栏，DSH 原生欢迎区（品牌标题、工作区/Agent 预设
 * 选择器）要一并让开；漏登记一个 id，那一页就会退回原生落地页样式（鲸鱼 + 两个选择器都冒出来）。
 * `inventory-*` 的 HTML 插件页不写在这里：它们按注册上来的面板动态判定。
 */
export declare const GEA_SHELL_PANELS: readonly string[];
export type BusinessPanel = {
    id: string;
    title: string;
    order: number;
};
/**
 * 菜单状态字段里的"主对话"。宿主（host/workbench-surface.ts）与会话侧共用这一个值：
 * 默认就是它，用户点业务菜单时才换成对应菜单 id。
 */
export declare const MAIN_MENU = "main";
/** 菜单 id → 菜单名：优先用已注册页面自己的标题，其次用原型目录里的名字。 */
export declare function businessMenuTitle(id: string, panels?: readonly BusinessPanel[], override?: Readonly<Record<string, string>>): string;
/**
 * 左侧业务菜单的分组与顺序以原型（GEA_AI工作台_右侧目录.html）为准：
 * 产销协同 → 计划管理 → 库存管理 → 订单管理。
 * 原型中尚未接入的页面也保留为禁用占位，避免不同账号看到的目录结构跳动。
 */
export type BusinessMenuSection = "supply" | "plan" | "inventory" | "orders" | "prototypes";
export type BusinessMenuItem = {
    id: string;
    title: string;
    onlyWhenRegistered?: boolean;
};
export type BusinessMenuGroup = {
    key: BusinessMenuSection;
    title: string;
    icon: string;
    flat?: boolean;
    items: readonly BusinessMenuItem[];
};
export type BusinessMenuEntry = {
    id: string;
    title: string;
    disabled: boolean;
};
export type ResolvedBusinessMenuGroup = {
    key: BusinessMenuSection;
    title: string;
    icon: string;
    flat: boolean;
    entries: BusinessMenuEntry[];
};
export declare const BUSINESS_MENU_PRESET: readonly BusinessMenuGroup[];
/** 固定展示原型目录；没有接入页面的条目显示为禁用占位。 */
export declare function resolveBusinessMenu(preset: readonly BusinessMenuGroup[], available: ReadonlyMap<string, string>): ResolvedBusinessMenuGroup[];
export {};
