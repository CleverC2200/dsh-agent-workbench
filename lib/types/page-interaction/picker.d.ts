import { type PageReference } from "./reference.ts";
export { quotePage } from "./quote.ts";
export type PickerOptions = {
    describe?: (element: Element, reference: PageReference) => PageReference;
};
export type SelectionKind = "row" | "table" | "block";
/** Promote tiny DOM hits to a business-sized selection. Never select the whole document. */
export declare function selectionTarget(element: Element | null, kind?: SelectionKind): Element | null;
export declare function describeElement(element: Element, page: string): PageReference;
/** Selection is hover-to-highlight, click-to-quote. No preview or confirmation panel. */
export declare function mountPicker(options?: PickerOptions): () => void;
