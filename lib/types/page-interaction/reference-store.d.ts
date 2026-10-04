import { type ReferenceReceipt } from "./reference.ts";
/** Immutable, session-local snapshots; the conversation only carries a small receipt. */
export declare function createReferenceStore(): {
    put(input: unknown): ReferenceReceipt;
    read(sessionId: string, id: string): {
        page: string;
        kind?: "row" | "table" | "block";
        label: string;
        text: string;
        row?: string;
        column?: string;
        scope?: string;
        targets: string[];
        capturedAt: string;
        truncated?: boolean;
        sessionId: string;
        surface: string;
        tool?: string;
        source: string;
        error?: undefined;
        message?: undefined;
    } | {
        error: string;
        message: string;
    };
    clear(sessionId: string): void;
    clearAll(): void;
    dispose(): void;
};
