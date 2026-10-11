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
 * Workbench 为这些面板贡献业务欢迎区，Core 保留 Conversation 与输入区。
 * 库存面板从当前公开 main slot 登记动态判定。
 */
export declare const GEA_SHELL_PANELS: readonly string[];
export type BusinessPanel = {
    id: string;
    title: string;
    order: number;
};
/**
 * 工作台目录默认选择主对话；页面选择和关联的 Core Session 分别保存。
 */
export declare const MAIN_MENU = "main";
/** 菜单 id → 菜单名：优先用已注册页面自己的标题，其次用原型目录里的名字。 */
export declare function businessMenuTitle(id: string, panels?: readonly BusinessPanel[], override?: Readonly<Record<string, string>>): string;
/**
 * 业务分组和顺序由 BUSINESS_MENU_PRESET 声明。
 * 未接入的页面保留禁用占位，避免不同账号看到的目录结构跳动。
 */
export type BusinessMenuSection = 'supply' | 'plan' | 'inventory' | 'orders' | 'prototypes';
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
