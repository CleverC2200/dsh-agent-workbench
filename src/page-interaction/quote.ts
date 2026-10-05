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
export function quotePage(value: PageQuote, signal?: AbortSignal): Promise<void> {
    return window.dshPageInteraction?.quote(value, signal) ?? Promise.reject(Error('请先关联当前页面的真实对话，再转入草稿。'));
}
