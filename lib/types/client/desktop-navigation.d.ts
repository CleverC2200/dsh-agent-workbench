/** 桌面消息消费界面；只接收安全投影，不接触原始链接或凭证。 */
import React from 'react';
import type { BusinessAccount } from '../company/account.ts';
import { z } from 'zod';
import type { CopyKey } from './locales.ts';
declare const navigationView: z.ZodIntersection<z.ZodUnion<readonly [z.ZodObject<{
    state: z.ZodEnum<{
        unavailable: "unavailable";
        login: "login";
        idle: "idle";
    }>;
}, z.core.$strip>, z.ZodObject<{
    state: z.ZodLiteral<"error">;
    receipt: z.ZodOptional<z.ZodString>;
    code: z.ZodString;
    stage: z.ZodOptional<z.ZodEnum<{
        open: "open";
        retry: "retry";
        poll: "poll";
        resolve: "resolve";
        finish: "finish";
        dismiss: "dismiss";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    state: z.ZodLiteral<"ready">;
    receipt: z.ZodString;
    panel: z.ZodString;
    notificationId: z.ZodOptional<z.ZodString>;
    interactionRequestId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>]>, z.ZodObject<{
    identityRevision: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>>;
export type NavigationView = z.infer<typeof navigationView>;
type NavigationObservation = {
    deadline: number;
    ended: boolean;
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
export declare function DesktopNavigation({ t, open, login, identity, observation, }: {
    t: (key: CopyKey) => string;
    open: (target: ReadyNavigation, signal: AbortSignal) => Promise<void>;
    login: () => void;
    identity: Pick<BusinessAccount, 'getSnapshot' | 'subscribe'>;
    observation?: NavigationObservation;
}): React.JSX.Element | null;
export {};
