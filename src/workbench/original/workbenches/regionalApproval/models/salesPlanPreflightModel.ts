import type {
  GeaSalesPlanDetail,
  GeaSalesPlanPeriod,
  GeaSalesPlanSku,
} from '../../../contracts.ts';
import { salesPlanDecimalValue } from './salesPlanQuantityModel.ts';
import type { RegionalApprovalLiveRow } from '../regionalApprovalQueryModel.ts';

export class SubmissionSourceError extends Error {
  constructor(
    readonly key:
      | 'planChanged'
      | 'versionChanged'
      | 'statusChanged'
      | 'versionInactive'
      | 'periodChanged'
      | 'planTypeChanged'
      | 'orderTypeChanged'
      | 'skuVersionChanged'
      | 'skuDuplicate'
      | 'skuEmpty'
      | 'skuAdded'
      | 'skuRemoved'
      | 'skuValueChanged'
      | 'draftStale'
      | 'accessChanged',
    readonly values: Record<string, string> = {},
  ) {
    super(key);
  }
}

export const checkSubmissionSource = (
  item: {
    planId: string;
    versionId: string;
    row: RegionalApprovalLiveRow;
    period: Pick<GeaSalesPlanPeriod, 'periodId' | 'planTypeCode'>;
  },
  detail: GeaSalesPlanDetail,
) => {
  const version = detail.currentVersion;
  if (version.planId !== item.planId)
    throw new SubmissionSourceError('planChanged', {
      expected: item.planId,
      actual: version.planId,
    });
  if (version.id !== item.versionId)
    throw new SubmissionSourceError('versionChanged', {
      expected: item.versionId,
      actual: version.id,
    });
  if (version.status !== item.row.status)
    throw new SubmissionSourceError('statusChanged', {
      expected: String(item.row.status),
      actual: String(version.status),
    });
  if (!version.effective) throw new SubmissionSourceError('versionInactive');
  if (version.periodId !== item.period.periodId)
    throw new SubmissionSourceError('periodChanged', {
      expected: String(item.period.periodId),
      actual: String(version.periodId),
    });
  if (version.planTypeCode !== item.period.planTypeCode)
    throw new SubmissionSourceError('planTypeChanged', {
      expected: item.period.planTypeCode,
      actual: version.planTypeCode,
    });
  if (item.row.orderType && version.orderType !== item.row.orderType)
    throw new SubmissionSourceError('orderTypeChanged', {
      expected: item.row.orderType,
      actual: version.orderType ?? '—',
    });
};

export const checkSubmissionSkus = (
  versionId: string,
  before: readonly GeaSalesPlanSku[],
  after: readonly GeaSalesPlanSku[],
) => {
  if (!after.length) throw new SubmissionSourceError('skuEmpty');
  const previous = new Map(before.map((sku) => [String(sku.skuCode), sku]));
  const codes = new Set<string>();
  for (const sku of after) {
    const code = String(sku.skuCode);
    if (sku.versionId !== versionId)
      throw new SubmissionSourceError('skuVersionChanged', {
        code,
        expected: versionId,
        actual: sku.versionId,
      });
    if (codes.has(code)) throw new SubmissionSourceError('skuDuplicate', { code });
    codes.add(code);
    const original = previous.get(code);
    if (!original) throw new SubmissionSourceError('skuAdded', { code });
    for (const field of [
      'price',
      'qty',
      'amt',
      'adjAddQty',
      'adjCutQty',
      'regionConfirmedQty',
      'provinceConfirmedQty',
      'areaConfirmedQty',
      'categoryConfirmedQty',
    ] as const) {
      const expected = String(original[field] ?? '—');
      const actual = String(sku[field] ?? '—');
      if (salesPlanDecimalValue(original[field]) !== salesPlanDecimalValue(sku[field]))
        throw new SubmissionSourceError('skuValueChanged', { code, field, expected, actual });
    }
  }
  for (const code of previous.keys())
    if (!codes.has(code)) throw new SubmissionSourceError('skuRemoved', { code });
};
