import { computeMpsCategoryDemand } from 'dsh-agent-manage/mps-compute/category-demand';
import { sourceCheckRows } from './source-projections.js';

const number = (value) =>
  value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const ready = (state, month) => state?.status === 'ready' && state.month === month;
export function buildCategoryDemand(draft, categories) {
  const checks = sourceCheckRows(
    ready(draft.sourceChecksRead, draft.month) ? draft.sourceChecks : null,
    ['loading', 'failed'].includes(draft.productsRead?.status)
      ? []
      : (draft.products ?? draft.productRaw),
    draft.pull,
    categories,
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
  return computeMpsCategoryDemand({
    month: draft.month,
    pull: draft.pull,
    categories: checks.categories,
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
