/** 桌面消息消费界面；只接收安全投影，不接触原始链接或凭证。 */
import React from 'react';
import type { CopyKey } from './locales.ts';
export type NavigationView = ({
    state: 'idle' | 'unavailable' | 'login';
} | {
    state: 'error';
    receipt?: string;
    code: string;
} | {
    state: 'ready';
    receipt: string;
    panel: string;
    notificationId?: string;
    interactionRequestId?: string;
}) & {
    identityRevision?: number;
};
export type ReadyNavigation = Extract<NavigationView, {
    state: 'ready';
}>;
export type PageNavigation = ReadyNavigation & {
    visible(): void;
    failed(error: Error): void;
};
/** 业务页面订阅当前导航；以实际渲染回执完成等待。 */
export declare function createNavigationSelection(): {
    getSnapshot: () => PageNavigation | null;
    subscribe(listener: () => void): () => void;
    set(next: PageNavigation | null): void;
};
/** 独立提示条不阻断正常业务；轮询持续观察身份变化，已处理 receipt 不重复打开。 */
export declare function DesktopNavigation({ t, open, login }: {
    t: (key: CopyKey) => string;
    open: (target: ReadyNavigation, signal: AbortSignal) => Promise<void>;
    login: () => void;
}): React.JSX.Element | null;
