import type { Context } from '@deepseek-ai/cordis';
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
export type FrameBinding = {
    frame: HTMLIFrameElement;
    reference: SessionReference;
    page: string;
    surface: string;
    tool?: string;
    owner: string;
};
export type PageInteraction = {
    bindFrame(options: FrameBinding): () => void;
    mountTrigger(container: HTMLElement, sessionId: string): () => void;
};
/** Uses the public DSH reference/input faces, without replacing the composer. */
export declare function installPageInteraction(ctx: Context): PageInteraction;
export declare const inject: string[];
export declare const apply: typeof installPageInteraction;
declare module "@deepseek-ai/cordis" {
    interface Context {
        pageInteraction: PageInteraction;
    }
}
