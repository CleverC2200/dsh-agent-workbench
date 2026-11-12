import { computeMpsCategoryDemand } from 'dsh-agent-manage/mps-compute/category-demand';
import { sourceCheckRows, sourceDimensions } from './source-projections.js';

const number = (value) =>
  value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const ready = (state, month) => state?.status === 'ready' && state.month === month;
export function categoryDemandMissing(result, row) {
  if (row.systemQuantity !== null) return [];
  const basis = result.bases.find((entry) => entry.category === row.category);
  const index = result.rows.indexOf(row);
  const missing = [];
  if (index % 4 < 2) {
    if (row.shipment === null) missing.push(`${row.baseMonth} 本月有效预估发货缺失`);
    if (row.salesSubmission === null) missing.push(`${row.month} 销售提报量缺失`);
    if (basis.actual === null)
      missing.push(`${result.recent[0]}至${basis.endMonth} BI实绩缺失或不完整`);
    if (basis.recentShare === null || basis.recentShare <= 0)
      missing.push(`${result.recent[0]}至${basis.endMonth} 历史同期占比缺失或合计为0`);
    if (row.share === null) missing.push(`${row.month} 历史同期占比缺失`);
    for (const period of result.historical.filter(
      (entry) =>
        entry.category === row.category &&
        entry.month > row.baseMonth &&
        entry.month <= row.month &&
        entry.mom === null,
    ))
      missing.push(`${period.month} 历史环比缺失`);
    if (basis.plan === null)
      missing.push(`${result.recent[0]}至${basis.endMonth} 计划量缺失或不完整`);
    else if (basis.achievementRate === null || basis.achievementRate < 0)
      missing.push('近三月达成率缺失');
  } else {
    if (row.chain === null) missing.push(`${row.month} 年度分月环比缺失或分母为0`);
    if (result.rows[index - 1].momMethod === null) missing.push('上月环比测算量缺失');
  }
  return missing;
}
export function buildCategoryDemand(draft, shipmentSnapshot) {
  const checks = sourceCheckRows(
    ready(draft.sourceChecksRead, draft.month) ? draft.sourceChecks : null,
    ['loading', 'failed'].includes(draft.productsRead?.status)
      ? []
      : (draft.products ?? draft.productRaw),
  );
  const historical = ready(draft.historicalIndicatorsRead, draft.month)
    ? draft.historicalIndicators.periods.flatMap((period) => (period.error ? [] : period.rows))
    : [];
  const annual = ready(draft.historicalIndicatorsRead, draft.month)
    ? (draft.historicalIndicators.annual?.rows ?? [])
    : [];
  const nationwide = annual.some((row) => row['基地'] === '全国')
    ? annual.filter((row) => row['基地'] === '全国')
    : annual;
  const annualGroups = new Map();
  for (const row of nationwide) {
    const key = JSON.stringify([row['月份'], row['大类']]);
    const rows = annualGroups.get(key) ?? [];
    rows.push(row);
    annualGroups.set(key, rows);
  }
  const baseDate = new Date(`${draft.month}-01T00:00:00Z`);
  baseDate.setUTCMonth(baseDate.getUTCMonth() - 1);
  const baseMonth = baseDate.toISOString().slice(0, 7);
  const shipmentReady =
    shipmentSnapshot?.draftId === draft.id &&
    shipmentSnapshot.month === draft.month &&
    shipmentSnapshot.shipmentMonth === baseMonth &&
    shipmentSnapshot.cutoff ===
      (draft.shipment?.cutoff ?? draft.shipment?.business?.cutoff ?? '') &&
    ['business', 'local-file'].includes(shipmentSnapshot.sourceKind) &&
    ['ok', 'partial', 'local-file'].includes(shipmentSnapshot.status);
  const reportColumn = draft.pull === 'monthly' ? '月初数量' : '纠偏数量';
  const report = sourceDimensions(draft.report ?? [], draft.products ?? []);
  const total = (rows, value) => {
    const values = rows.map(value);
    return values.length && values.every((value) => value !== null)
      ? values.reduce((sum, value) => sum + value, 0)
      : null;
  };
  const reportReady = (month) => {
    const read = draft.reportRead?.periods?.[month] ?? draft.reportRead;
    return (
      draft.reportSource !== 'demo' &&
      (draft.reportSource !== 'business' || read?.status === 'ready') &&
      !['loading', 'failed', 'error', 'denied'].includes(read?.status)
    );
  };
  return computeMpsCategoryDemand({
    month: draft.month,
    adjustments: draft.adjustments?.categoryDemand,
    pull: draft.pull,
    categories: checks.categories,
    shipment: checks.categories.map((category) => ({
      month: baseMonth,
      category,
      quantity: shipmentReady
        ? total(
            shipmentSnapshot.rows.filter((row) => row.category === category),
            (row) => number(row.fin),
          )
        : null,
    })),
    submissions: checks.categories.flatMap((category) =>
      [0, 1].map((index) => {
        const date = new Date(`${draft.month}-01T00:00:00Z`);
        date.setUTCMonth(date.getUTCMonth() + index);
        const month = date.toISOString().slice(0, 7);
        return {
          month,
          category,
          quantity: reportReady(month)
            ? total(
                report.filter((row) => row['月份'] === month && row['大类'] === category),
                (row) => number(row[reportColumn]),
              )
            : null,
        };
      }),
    ),
    historical: historical
      .filter((row) => row['维度类型'] === '基地+大类')
      .map((row) => ({
        month: row['月份'],
        category: row['维度值'],
        base: row['基地'],
        quantity: number(row['月发货数量']),
        priorYearQuantity: number(row['上年同期发货数量']),
        priorMonthQuantity: number(row['上月发货数量']),
        annualQuantity: number(row['全国维度财年发货数量']),
        fiscalYear: row['财年'],
        valid: row['粒度状态'] !== '业务键重复，仅保留源值' && !!row['维度值'],
      })),
    checks: checks.rows.map((row) => ({
      month: row.month,
      category: row.category,
      actual: row.actual.quantity,
      plan: row.plan.quantity,
      complete: !row.issues.length,
    })),
    annual: [...annualGroups.values()].map((rows) => ({
      month: rows[0]['月份'],
      category: rows[0]['大类'],
      quantity: rows.every((row) => number(row['数量']) !== null)
        ? rows.reduce((sum, row) => sum + Number(row['数量']), 0)
        : null,
    })),
  });
}
