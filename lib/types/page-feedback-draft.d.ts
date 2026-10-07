import type { Context } from "@deepseek-ai/cordis";
declare module "@deepseek-ai/dsh-api-session-controller/client" {
    interface SessionReferenceSourceMap {
        pageFeedbackDraft: unknown;
    }
}
/** Append through the Core's public revision-guarded event. Core persists the semantic edit. */
export declare function insertPageFeedbackDraft(ctx: Pick<Context, "sessions" | "conversation">, sessionId: string, text: string, signal: AbortSignal): Promise<void>;
