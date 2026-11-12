import type {
  GeaSalesPlanDetail,
  GeaSalesPlanListItem,
  GeaSalesPlanSkuAdjustment,
} from '../../../bridge.ts';
import {
  addExactDecimals,
  multiplyExactDecimals,
  subtractExactDecimals,
} from '../regionalApprovalQueryModel.ts';
import { salesPlanEditableQuantity } from './salesPlanAccessModel.ts';
import { roundPlanQuantity, salesPlanDecimalValue } from './salesPlanQuantityModel.ts';
import { salesPlanSkusMatchVersion } from './salesPlanDetailModel.ts';
import { SubmissionSourceError } from './salesPlanPreflightModel.ts';
import type { ApprovalStageId } from '../salesPlanDomain.ts';

export type SalesPlanLocalDraft = {
  planId: string;
  versionId: string;
  status: number;
  sourceSnapshot: string;
  adjustments: GeaSalesPlanSkuAdjustment[];
  remark: string;

  role?: ApprovalStageId;
};

export type SalesPlanLocalDraftStore = Record<string, SalesPlanLocalDraft>;
const DECIMAL = /^[+-]?\d{1,15}(?:\.\d{1,3})?$/;

export const salesPlanApprovalDraftValues = (
  detail: GeaSalesPlanDetail | undefined,
  row: Pick<GeaSalesPlanListItem, 'status' | 'planTypeCode'> &
    Partial<Pick<GeaSalesPlanListItem, 'orderType'>>,
  role: ApprovalStageId | undefined,
  stored: readonly GeaSalesPlanSkuAdjustment[],
  pendingValues: Record<string, string> = {},
  roundMonthly = true,
): Record<string, string> => {
  const values = Object.fromEntries(stored.map((item) => [item.skuCode, item.adjustQty]));
  for (const [skuCode, value] of Object.entries(pendingValues)) {
    const sku = detail?.skus.find((item) => String(item.skuCode) === skuCode);
    const baseline = sku && salesPlanEditableQuantity(sku, row.status, row.planTypeCode, role);
    if (
      baseline === undefined ||
      baseline === '—' ||
      !DECIMAL.test(value.trim()) ||
      (value.trim().startsWith('-') && !/^-0+(?:\.0+)?$/.test(value.trim()))
    )
      throw new SubmissionSourceError('quantityInvalid');
    const adjustQty = subtractExactDecimals(value.trim(), baseline);
    if (!DECIMAL.test(adjustQty)) throw new SubmissionSourceError('quantityInvalid');
    values[skuCode] = adjustQty;
  }
  if (roundMonthly && (row.orderType ?? detail?.currentVersion.orderType) === 'M' && role) {
    for (const sku of detail?.skus ?? []) {
      const code = String(sku.skuCode);
      const baseline = salesPlanEditableQuantity(sku, row.status, row.planTypeCode, role);
      if (baseline === undefined) continue;
      const confirmed = addExactDecimals([baseline, values[code] ?? '0']);
      const rounded = roundPlanQuantity(confirmed);
      if (!DECIMAL.test(rounded) || rounded.startsWith('-'))
        throw new SubmissionSourceError('quantityInvalid');
      const adjustment = subtractExactDecimals(rounded, baseline);
      if (values[code] !== undefined || !/^[+-]?0+(?:\.0+)?$/.test(adjustment))
        values[code] = adjustment;
    }
  }
  return values;
};

export const salesPlanDraftSnapshot = (
  row: Pick<GeaSalesPlanListItem, 'planId' | 'versionId' | 'status'>,
  detail: GeaSalesPlanDetail,
): string | undefined => {
  const version = detail.currentVersion;
  if (
    version.planId !== row.planId ||
    version.id !== row.versionId ||
    version.status !== row.status ||
    !version.effective ||
    !salesPlanSkusMatchVersion(row.versionId, detail.skus)
  )
    return undefined;
  return JSON.stringify([
    row.planId,
    row.versionId,
    row.status,
    detail.skus
      .map((sku) => [
        String(sku.skuCode),
        salesPlanEditableQuantity(sku, row.status),
        String(sku.price),
        sku.qty,
        sku.regionConfirmedQty,
        sku.provinceConfirmedQty,
        sku.areaConfirmedQty,
        sku.categoryConfirmedQty,
      ])
      .toSorted((left, right) => String(left[0]).localeCompare(String(right[0]))),
  ]);
};

const normalizeDraftSnapshot = (snapshot: string | undefined): string | undefined => {
  if (!snapshot) return undefined;
  try {
    const parsed: unknown = JSON.parse(snapshot);
    if (!Array.isArray(parsed) || parsed.length !== 4 || !Array.isArray(parsed[3]))
      return undefined;
    const normalized = parsed[3].map((sku: unknown) => {
      if (!Array.isArray(sku) || sku.length !== 8 || typeof sku[0] !== 'string')
        throw new Error('Invalid draft snapshot');
      return [sku[0], ...sku.slice(1).map(salesPlanDecimalValue)];
    });
    return JSON.stringify([parsed[0], parsed[1], parsed[2], normalized]);
  } catch {
    return undefined;
  }
};

export const salesPlanDraftMatches = (
  draft: SalesPlanLocalDraft | undefined,
  row: Pick<GeaSalesPlanListItem, 'planId' | 'versionId' | 'status'> &
    Partial<Pick<GeaSalesPlanListItem, 'planTypeCode'>>,
  detail: GeaSalesPlanDetail,
  role?: ApprovalStageId,
): draft is SalesPlanLocalDraft => {
  if (
    !draft ||
    !normalizeDraftSnapshot(draft.sourceSnapshot) ||
    draft.planId !== row.planId ||
    draft.versionId !== row.versionId ||
    draft.status !== row.status ||
    normalizeDraftSnapshot(draft.sourceSnapshot) !==
      normalizeDraftSnapshot(salesPlanDraftSnapshot(row, detail)) ||
    !Array.isArray(draft.adjustments) ||
    typeof draft.remark !== 'string' ||
    Array.from(draft.remark).length > 1000
  )
    return false;
  const codes = new Set<string>();
  if (draft.role !== undefined && !['region', 'province', 'area', 'category'].includes(draft.role))
    return false;
  const baselineRole = role ?? draft.role;
  return draft.adjustments.every((adjustment) => {
    if (
      !adjustment ||
      typeof adjustment.skuCode !== 'string' ||
      typeof adjustment.adjustQty !== 'string' ||
      !DECIMAL.test(adjustment.adjustQty) ||
      codes.has(adjustment.skuCode)
    )
      return false;
    codes.add(adjustment.skuCode);
    const sku = detail.skus.find((item) => String(item.skuCode) === adjustment.skuCode);

    const baseline =
      sku && salesPlanEditableQuantity(sku, row.status, row.planTypeCode ?? 'Y', baselineRole);
    const qty = baseline === undefined ? '—' : addExactDecimals([baseline, adjustment.adjustQty]);
    return (
      !!sku &&
      qty !== '—' &&
      !qty.startsWith('-') &&
      multiplyExactDecimals(qty, String(sku.price)) !== undefined
    );
  });
};

export const salesPlanLocalDraftValid = (
  draft: unknown,
  planId: string,
  versionId: string,
): draft is SalesPlanLocalDraft => {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return false;
  const value = draft as Partial<SalesPlanLocalDraft>;
  if (value.planId !== planId || value.versionId !== versionId || !Number.isInteger(value.status))
    return false;
  if (typeof value.sourceSnapshot !== 'string' || value.sourceSnapshot.length > 200_000)
    return false;
  if (
    typeof value.remark !== 'string' ||
    Array.from(value.remark).length > 1000 ||
    !Array.isArray(value.adjustments)
  )
    return false;
  const codes = new Set<string>();
  return value.adjustments.every((adjustment) => {
    if (
      !adjustment ||
      typeof adjustment !== 'object' ||
      typeof adjustment.skuCode !== 'string' ||
      typeof adjustment.adjustQty !== 'string' ||
      !DECIMAL.test(adjustment.adjustQty) ||
      codes.has(adjustment.skuCode)
    )
      return false;
    codes.add(adjustment.skuCode);
    return true;
  });
};

const storageKey = (scope: string) =>
  `gea-dsh:sales-plan-local-drafts:v1:${encodeURIComponent(scope)}`;
export const readSalesPlanLocalDrafts = (scope: string | undefined): SalesPlanLocalDraftStore => {
  if (!scope) return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey(scope)) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as SalesPlanLocalDraftStore)
      : {};
  } catch {
    return {};
  }
};

export const writeSalesPlanLocalDrafts = (
  scope: string,
  drafts: SalesPlanLocalDraftStore,
): void => {
  window.localStorage.setItem(storageKey(scope), JSON.stringify(drafts));
};
