import { categoryDemandMissing } from './category-demand.js';

const known = (value) => value != null && Number.isFinite(value);
const unique = (values) => [...new Set(values.filter(Boolean))];
export function buildDemandDiagnostics(result, categoryDemand) {
  const leaves = Map.groupBy([...result.rows, ...result.referenceRows], (row) =>
    JSON.stringify([row.category, row.month]),
  );
  return result.categoryRows.map((category) => {
    const key = JSON.stringify([category.category, category.month]);
    const rows = leaves.get(key) ?? [];
    const source = categoryDemand.filter(
      (row) => row.category === category.category && row.month === category.month,
    );
    const sourceQuantity = source.length === 1 ? source[0].quantity : null;
    const basis = result.categoryComputation.rows.find(
      (row) => row.category === category.category && row.month === category.month,
    );
    const coverage = result.categoryComputation.shipmentScope.coverage.find(
      (row) => row.category === category.category,
    );
    const computed = rows.filter((row) => known(row.demand));
    const missing = rows.filter((row) => !known(row.demand));
    const upstream = !known(sourceQuantity) && missing.length > 0;
    const firstMissing = missing.map((row) => ({
      base: row.base,
      code: row.code,
      group: row.group,
      month: row.month,
      stage: upstream
        ? 'category-demand-missing'
        : row.share == null
          ? 'split-basis-missing'
          : 'calculation-missing',
      reasons: upstream
        ? unique([
            ...(basis ? categoryDemandMissing(result.categoryComputation, basis) : []),
            ...category.missing,
          ])
        : unique([
            ...row.missing.share,
            ...(row.share == null ? row.missing.historyQuantity : []),
            ...row.missing.demand,
          ]),
    }));
    const status = !rows.length
      ? 'scope-empty'
      : upstream
        ? 'category-demand-missing'
        : firstMissing.some((row) => row.stage === 'split-basis-missing')
          ? 'split-basis-missing'
          : missing.length
            ? 'calculation-missing'
            : !known(category.quantity)
              ? 'aggregate-missing'
              : 'complete';
    return {
      category: category.category,
      month: category.month,
      baseMonth: basis?.baseMonth ?? result.shipmentMonth,
      inventoryReference: category.month === result.months[3],
      sourceQuantity,
      systemQuantity: category.systemQuantity,
      effectiveQuantity: category.quantity,
      knownQuantity: computed.length ? computed.reduce((sum, row) => sum + row.demand, 0) : null,
      expected: rows.length,
      computed: computed.length,
      missing: missing.length,
      includedShipments: coverage?.included ?? 0,
      excludedShipments: coverage?.excluded ?? 0,
      status,
      reason:
        unique(firstMissing.flatMap((row) => row.reasons)).join('；') ||
        (status === 'scope-empty'
          ? '本次参与范围无有效基地SKU'
          : status === 'aggregate-missing'
            ? '基地SKU需求已算出，大类汇总未带入结果'
            : ''),
      firstMissing,
    };
  });
}
