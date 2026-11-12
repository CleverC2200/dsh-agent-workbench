import { previousFiscalYear } from 'dsh-agent-manage/mps-compute/workflow';
import { computeMpsCategoryDemand } from 'dsh-agent-manage/mps-compute/category-demand';
import {
  createSourceProductMatcher,
  sourceCheckRows,
  sourceDimensions,
  sourceProductMappings,
} from './source-projections.js';
import { canonicalBaseName } from './relations.js';

const number = (value) =>
  value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const ready = (state, month) => state?.status === 'ready' && state.month === month;
export function categoryDemandMissing(result, row) {
  if (row.systemQuantity !== null) return [];
  const basis = result.bases.find((entry) => entry.category === row.category);
  const index = result.rows.indexOf(row);
  const missing = (result.shipmentScope.issues ?? [])
    .filter((issue) => issue.category === row.category)
    .flatMap((issue) => issue.missing);
  if (row.shipment === null) missing.push(`${row.baseMonth} 本月有效预估发货缺失`);
  if (basis.actual === null)
    missing.push(`${result.recent[0]}至${basis.endMonth} BI实绩缺失或不完整`);
  if (basis.recentShare === null || basis.recentShare <= 0)
    missing.push(`${result.recent[0]}至${basis.endMonth} 历史同期占比缺失或合计为0`);
  if (row.share === null) missing.push(`${row.month} 历史同期占比缺失`);
  for (const period of result.rows.filter(
    (entry, position) =>
      position % 4 < 2 &&
      entry.category === row.category &&
      entry.month <= row.month &&
      entry.chain === null,
  ))
    missing.push(`${period.month} 历史环比缺失`);
  if (index % 4 === 0) {
    if (row.salesSubmission === null) missing.push(`${row.month} 销售提报量缺失`);
    if (basis.plan === null)
      missing.push(`${result.recent[0]}至${basis.endMonth} 计划量缺失或不完整`);
    else if (basis.achievementRate === null || basis.achievementRate < 0)
      missing.push('近三月达成率缺失');
  }
  if (index % 4 >= 2) {
    if (row.chain === null) missing.push(`${row.month} 年度分月环比缺失或分母为0`);
    if (result.rows[index - 1].momMethod === null) missing.push('上月环比测算量缺失');
  }
  return missing;
}
export function buildCategoryDemand(draft, shipmentSnapshot) {
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
  const productMappings = sourceProductMappings(draft.products, draft.productRaw);
  const matchProduct = createSourceProductMatcher(productMappings);
  const sourceRows = shipmentReady ? (shipmentSnapshot.rows ?? []) : [];
  const excluded = sourceRows.flatMap((row) => {
    const category = row.category || matchProduct(row.code, row.base).category;
    const missing = [
      ...(!category ? ['缺可唯一对应的产品大类'] : []),
      ...(number(row.fin) === null ? ['本月有效预估发货待定'] : []),
      ...(row.forecastIssue ? [row.forecastIssue] : []),
    ];
    return missing.length
      ? [
          {
            base: row.base,
            code: row.code,
            name: row.name ?? '',
            category,
            month: baseMonth,
            missing,
            missingFields: row.missingFields ?? [],
          },
        ]
      : [];
  });
  const sourceChecks = ready(draft.sourceChecksRead, draft.month) ? draft.sourceChecks : null;
  const fiscal = previousFiscalYear(draft.month);
  const unassigned = [
    ...(sourceChecks?.periods ?? []).flatMap((period) => [
      ...period.history.rows.map((row) => ({
        row,
        field: '数量',
        source: 'BI实绩',
        month: period.month,
      })),
      ...period.report.rows.map((row) => ({
        row,
        field: '计划数量',
        source: '计划量',
        month: period.month,
      })),
    ]),
    ...(draft.historyAnnualRead?.status === 'ready'
      ? (draft.historyAnnual?.periods ?? [])
          .filter((period) => period.start === fiscal.start && period.end === fiscal.end)
          .flatMap((period) =>
            period.rows.map((row) => ({
              row,
              field: '数量',
              source: '上一财年发货',
              month: period.start + '至' + period.end,
            })),
          )
      : []),
    ...(ready(draft.planRatesRead, draft.month)
      ? (draft.planRates ?? [])
          .filter((row) => row['维度类型'] === '基地+产品' && row['月份'] === draft.month)
          .map((row) => ({
            row,
            field: '当前维度计划量',
            source: '销售提报占比',
            month: draft.month,
          }))
      : []),
  ].filter(({ row, field }) => !row['基地'] && number(row[field]) !== 0);
  for (const fact of unassigned) {
    const matched = matchProduct(fact.row['产品编码']);
    const codes = matched.currentCode
      ? [matched.currentCode]
      : productMappings
          .filter(
            (product) =>
              (product['老品编码'] || product.replacement_material_code) === fact.row['产品编码'],
          )
          .map((product) => product['产品编码'] || product.material_code);
    if (
      ['BI实绩', '计划量'].includes(fact.source) &&
      !codes.some(
        (code) =>
          excluded.some((row) => row.code === code) &&
          sourceRows.some(
            (row) =>
              row.code === code &&
              !excluded.some((entry) => entry.base === row.base && entry.code === row.code),
          ),
      )
    )
      continue;
    for (const row of sourceRows.filter((row) => codes.includes(row.code))) {
      const reason =
        fact.source +
        ' ' +
        fact.month +
        ' ' +
        fact.row['产品编码'] +
        ' 缺基地，无法分配；该SKU各基地暂不参与计算';
      const existing = excluded.find((entry) => entry.base === row.base && entry.code === row.code);
      if (existing) {
        if (!existing.missing.includes(reason)) existing.missing.push(reason);
        if (!existing.missingFields.includes('base')) existing.missingFields.push('base');
      } else
        excluded.push({
          base: row.base,
          code: row.code,
          name: row.name ?? '',
          category: row.category || matchProduct(row.code, row.base).category,
          month: baseMonth,
          missing: [reason],
          missingFields: ['base'],
          source: fact.source,
        });
    }
  }
  const excludedKeys = new Set(
    excluded.map((row) => JSON.stringify([canonicalBaseName(row.base), row.code])),
  );
  const included = (base, code) =>
    !excludedKeys.has(JSON.stringify([canonicalBaseName(base), code]));
  const excludedCodes = new Set(excluded.map((row) => row.code));
  const includedCodes = new Set(
    sourceRows.filter((row) => included(row.base, row.code)).map((row) => row.code),
  );
  const scopeIssues = [];
  const scopeRows = (rows, source, month, field) =>
    rows.flatMap((row) => {
      const matched = matchProduct(row['产品编码'], row['基地']);
      const code = matched.currentCode || row['产品编码'];
      if (row['基地']) return included(row['基地'], code) ? [row] : [];
      if (number(row[field]) === 0) return [row];
      const products = productMappings;
      const possible = matched.currentCode
        ? [matched.currentCode]
        : products
            .filter(
              (product) =>
                (product['老品编码'] || product.replacement_material_code) === row['产品编码'],
            )
            .map((product) => product['产品编码'] || product.material_code);
      const codes = possible.length ? possible : [code];
      if (!codes.some((code) => excludedCodes.has(code))) return [row];
      if (!codes.some((code) => includedCodes.has(code))) return [];
      const missing = [
        `${source} ${month} ${row['产品编码']} 缺基地，不能按本次参与范围拆分全国SKU数量`,
      ];
      const categories = matched.category
        ? [matched.category]
        : [
            ...new Set(
              products
                .filter((product) => codes.includes(product['产品编码'] || product.material_code))
                .map((product) => product['大类'] || product.sub_category)
                .filter(Boolean),
            ),
          ];
      for (const category of categories)
        scopeIssues.push({
          base: '',
          code: row['产品编码'],
          category,
          month,
          name: row['产品名称'] ?? '',
          source,
          missing,
          missingFields: ['base'],
        });
      return [
        {
          ...row,
          [field]: null,
          缺项原因: [...(row['缺项原因'] ? [row['缺项原因']] : []), ...missing].join('；'),
        },
      ];
    });
  const scopedChecks = sourceChecks
    ? {
        ...sourceChecks,
        periods: sourceChecks.periods.map((period) => ({
          ...period,
          history: {
            ...period.history,
            rows: scopeRows(period.history.rows, 'BI实绩', period.month, '数量'),
          },
          report: {
            ...period.report,
            rows: scopeRows(period.report.rows, '计划量', period.month, '计划数量'),
          },
        })),
      }
    : null;
  const checks = sourceCheckRows(
    scopedChecks,
    ['loading', 'failed'].includes(draft.productsRead?.status) ? [] : productMappings,
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
  const reportColumn = draft.pull === 'monthly' ? '月初数量' : '纠偏数量';
  const report = scopeRows(
    sourceDimensions(draft.report ?? [], draft.products ?? []),
    '销售提报',
    draft.month,
    reportColumn,
  );
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
  const result = computeMpsCategoryDemand({
    month: draft.month,
    adjustments: draft.adjustments?.categoryDemand,
    pull: draft.pull,
    categories: checks.categories,
    shipment: checks.categories.map((category) => ({
      month: baseMonth,
      category,
      quantity: shipmentReady
        ? total(
            sourceRows.filter(
              (row) =>
                (row.category || matchProduct(row.code, row.base).category) === category &&
                included(row.base, row.code),
            ),
            (row) => number(row.fin),
          )
        : null,
    })),
    submissions: checks.categories.map((category) => ({
      month: draft.month,
      category,
      quantity: reportReady(draft.month)
        ? total(
            report.filter((row) => row['月份'] === draft.month && row['大类'] === category),
            (row) => number(row[reportColumn]),
          )
        : null,
    })),
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
      actual: scopeIssues.some(
        (issue) =>
          issue.category === row.category && issue.month === row.month && issue.source === 'BI实绩',
      )
        ? null
        : row.actual.quantity,
      plan: scopeIssues.some(
        (issue) =>
          issue.category === row.category && issue.month === row.month && issue.source === '计划量',
      )
        ? null
        : row.plan.quantity,
      complete:
        !row.issues.length &&
        !scopeIssues.some(
          (issue) =>
            issue.category === row.category &&
            issue.month === row.month &&
            issue.source !== '销售提报',
        ),
    })),
    annual: [...annualGroups.values()].map((rows) => ({
      month: rows[0]['月份'],
      category: rows[0]['大类'],
      quantity: rows.every((row) => number(row['数量']) !== null)
        ? rows.reduce((sum, row) => sum + Number(row['数量']), 0)
        : null,
    })),
  });
  const coverage = checks.categories.map((category) => {
    const rows = sourceRows.filter(
      (row) => (row.category || matchProduct(row.code, row.base).category) === category,
    );
    const omitted = excluded.filter((row) => row.category === category).length;
    return { category, included: rows.length - omitted, excluded: omitted };
  });
  return {
    ...result,
    shipmentScope: { ready: shipmentReady, excluded, coverage, issues: scopeIssues },
    rows: result.rows.map((row) => ({
      ...row,
      coverage: coverage.find((entry) => entry.category === row.category)?.excluded
        ? 'partial'
        : 'complete',
    })),
  };
}
