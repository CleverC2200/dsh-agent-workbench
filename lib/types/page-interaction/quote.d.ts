/** Explicit page-authored text enters the current Main draft, never a prompt or business receipt. */
export type PageQuote = {
    label: string;
    text: string;
};
export type PageQuoteApi = {
    available: () => boolean;
    quote: (value: PageQuote, signal?: AbortSignal) => Promise<void>;
};
declare global {
    interface Window {
        dshPageInteraction?: PageQuoteApi;
    }
}
export declare function quotePage(value: PageQuote, signal?: AbortSignal): Promise<void>;
