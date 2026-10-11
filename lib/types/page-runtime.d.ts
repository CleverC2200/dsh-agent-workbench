import type { Context } from '@deepseek-ai/cordis';
import type { PageElementEffect } from './page-bridge/catalog.ts';
/** The installed business adapter owns credentials, identity and actual authorization. */
export interface PageBusinessGrant {
    readonly signal: AbortSignal;
    /** Stable environment/tenant/user ownership from the installed authority; never a grant. */
    readonly referenceScope: string;
    readonly access: unknown;
    readSql?(input: any, signal: AbortSignal): Promise<unknown>;
    workspace?(input: any, signal: AbortSignal): Promise<unknown>;
    observe?(context: Record<string, unknown>): void;
    snapshot?(): {
        sequence: number;
        state: unknown;
    } | undefined;
    allowsEffect(effect: PageElementEffect | 'view'): boolean;
    release(): void;
}
export interface BusinessPage {
    id: string;
    kind: 'native' | 'html';
    label: string;
    resourceId: string;
    pluginId?: string;
    catalog: {
        surface: string;
        tool: string;
    };
}
export type AuthorizeBusinessPage = (sessionId: string, resourceId: string, signal: AbortSignal) => Promise<PageBusinessGrant>;
/** One page owner, queue, tool registry and reference lifetime for both real rendering modes. */
export declare class PageRuntime {
    private readonly ctx;
    private readonly declarations;
    private readonly owners;
    private readonly opening;
    private readonly bridge;
    private readonly html;
    private readonly tools;
    constructor(ctx: Context);
    registerBusinessPage(page: BusinessPage, authorize: AuthorizeBusinessPage): () => void;
    private ownerFor;
    private assert;
    private close;
    private open;
    private fetchOperation;
}
