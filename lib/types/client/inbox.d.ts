/** GEA 消息待办：服务端掌握状态，页面只提交当前版本和幂等键。 */
import React from "react";
import type { CopyKey } from "./locales.ts";
import type { PageNavigation } from './desktop-navigation.tsx';
type Translate = (key: CopyKey) => string;
/** 列表和详情读取彼此独立；导航后到达的旧响应直接丢弃。 */
export declare function Inbox({ t, navigation }: {
    t: Translate;
    navigation?: PageNavigation | null;
}): React.JSX.Element;
/** 待办列表/详情共用的一次读取；主页面「预警事件」抽屉也复用同一入口。 */
export declare function readNotifications<T = {
    value: unknown;
}>(query: object, signal?: AbortSignal): Promise<T>;
export {};
