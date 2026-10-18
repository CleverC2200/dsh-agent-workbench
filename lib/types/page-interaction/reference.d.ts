export declare const PAGE_INTERACTION = "dsh-page-interaction-v1";
export declare const REFERENCE_SOURCE = "page-content";
export declare const REFERENCE_TEXT_LIMIT = 6000;
export type PageReference = {
    page: string;
    kind?: 'row' | 'table' | 'block';
    label: string;
    text: string;
    row?: string;
    column?: string;
    scope?: string;
    targets: string[];
    capturedAt: string;
    truncated?: boolean;
};
export type BoundReference = PageReference & {
    sessionId: string;
    surface: string;
    tool?: string;
};
/** Bounds incoming page evidence; never interprets it as an instruction. */
export declare function pageReference(value: unknown): PageReference | undefined;
/** Explicit authored text is lossless within the existing raw UTF-16 budget. */
export declare function pageQuoteReference(value: unknown): PageReference | undefined;
export type ReferenceReceipt = {
    id: string;
    label: string;
};
export declare function serializeReference(value: ReferenceReceipt): string;
/** Pure display projection of the current receipt form; never used to rewrite model text. */
export declare function projectReferenceText(text: string): {
    text: string;
    labels: string[];
    ranges: Array<{
        start: number;
        end: number;
    }>;
};
/** Only explicit user references opt a conversation into the reference prompt/tool. */
export declare function hasPageReferences(events: readonly {
    type: string;
    data: unknown;
}[]): boolean;
