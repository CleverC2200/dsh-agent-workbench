import type { OrderDraft } from "./browser-repository.ts";

export const emptyOrderDraft = (): OrderDraft => ({ quantities: {}, reasons: {}, dirty: false });
export function sameDraftRow(a: OrderDraft, b: OrderDraft, sku: string) {
  return a.quantities[sku] === b.quantities[sku] && (a.reasons[sku] ?? "") === (b.reasons[sku] ?? "");
}
export function draftWithDirty(draft: OrderDraft, saved: OrderDraft): OrderDraft {
  const skus = new Set([...Object.keys(draft.quantities), ...Object.keys(draft.reasons), ...Object.keys(saved.quantities), ...Object.keys(saved.reasons)]);
  return { ...draft, dirty: [...skus].some(sku => !sameDraftRow(draft, saved, sku)) };
}
export function editDraftQuantity(draft: OrderDraft, saved: OrderDraft, sku: string, quantity: number, recommended: number | null) {
  const quantities = { ...draft.quantities };
  const value = Math.max(0, Math.round(Number.isFinite(quantity) ? quantity : 0));
  // An explicit zero is a durable instruction, including when today's suggestion is zero.
  if (value === recommended && value !== 0) delete quantities[sku];
  else quantities[sku] = value;
  return draftWithDirty({ ...draft, quantities }, saved);
}
export function editDraftReason(draft: OrderDraft, saved: OrderDraft, sku: string, value: string) {
  const reasons = { ...draft.reasons };
  if (value) reasons[sku] = value; else delete reasons[sku];
  return draftWithDirty({ ...draft, reasons }, saved);
}
export function draftRowStatus(draft: OrderDraft, saved: OrderDraft, sku: string) {
  const unsaved = !sameDraftRow(draft, saved, sku);
  if (draft.quantities[sku] === 0) return unsaved ? "不补 · 未保存" : "不补";
  if (unsaved) return "未保存";
  return draft.quantities[sku] !== undefined || !!draft.reasons[sku] ? "人工调整" : "系统建议";
}

export function undoDraftRow(draft: OrderDraft, saved: OrderDraft, sku: string) {
  const quantities = { ...draft.quantities }, reasons = { ...draft.reasons };
  delete quantities[sku]; delete reasons[sku];
  return draftWithDirty({ ...draft, quantities, reasons }, saved);
}
