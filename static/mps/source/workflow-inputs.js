import { buildCategoryDemand } from './category-demand.js';
import { computeMpsWorkflow, previousFiscalYear } from 'dsh-agent-manage/mps-compute/workflow';

const number = (value) => {
  if (
    value === null ||
    value === undefined ||
    (typeof value !== 'number' &&
      !(typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())))
  )
    return null;
  const result = Number(value);
  return Number.isFinite(result) && Math.abs(result) <= Number.MAX_SAFE_INTEGER ? result : null;
};
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const demo = (value) => /demo|演示|原型/i.test(String(value ?? ''));
const rowKey = (row) => JSON.stringify([row.base, row.code]);
const sourceIssues = (draft, source, month) => {
  const current = draft[source + 'Read'];
  const read = current?.periods?.[month] ?? current;
  const status = typeof read === 'string' ? read : read?.status;
  return [
    ...(status === 'loading' ? ['当前来源正在读取，旧数据暂不参与计算'] : []),
    ...(['failed', 'denied', 'error'].includes(status)
      ? [text(read?.error) || text(draft[source + 'Error']) || '当前来源读取失败或无权限']
      : []),
    ...(demo(draft[source + 'Source']) ? ['演示来源不参与后续计算'] : []),
  ];
};

export function buildMpsWorkflow(draft, relations, shipmentSnapshot) {
  const context = { id: draft.id, name: draft.name, month: draft.month };
  const reportColumn = draft.pull === 'monthly' ? '月初数量' : '纠偏数量';
  const readQuantity = (rows, column) =>
    (rows ?? []).map((row) => ({
      month: text(row['月份']),
      base: text(row['基地']),
      code: text(row['产品编码']),
      category: text(row['大类']),
      quantity: number(row[column]),
    }));
  const availableQuantity = (source, column) =>
    readQuantity(draft[source], column).map((row) => ({
      ...row,
      quantity: sourceIssues(draft, source, row.month).length ? null : row.quantity,
    }));
  const months = Array.from({ length: 3 }, (_, offset) => {
    const date = new Date(`${draft.month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    return date.toISOString().slice(0, 7);
  });
  const reportIssues = (month) => {
    const source = draft.reportSource === 'business' ? 'planRates' : 'report';
    const issues = sourceIssues(draft, source, month);
    return source === 'planRates' && draft.planRatesRead?.status !== 'ready' && !issues.length
      ? ['销售提报占比尚未同步']
      : issues;
  };
  const planKeys = new Map();
  for (const row of draft.planRates ?? []) {
    if (row['维度类型'] !== '基地+产品') continue;
    const key = JSON.stringify([text(row['月份']), text(row['基地']), text(row['产品编码'])]);
    planKeys.set(key, (planKeys.get(key) ?? 0) + 1);
  }
  const report =
    draft.reportSource === 'business'
      ? (draft.planRates ?? [])
          .filter((row) => row['维度类型'] === '基地+产品')
          .map((row) => ({
            month: text(row['月份']),
            base: text(row['基地']),
            code: text(row['产品编码']),
            quantity:
              reportIssues(row['月份']).length ||
              planKeys.get(
                JSON.stringify([text(row['月份']), text(row['基地']), text(row['产品编码'])]),
              ) !== 1
                ? null
                : number(row['当前维度计划量']),
          }))
      : availableQuantity('report', reportColumn);
  const annualIssues = (month) => {
    const period = previousFiscalYear(month);
    const data = draft.historyAnnual?.periods?.find(
      (entry) => entry.start === period.start && entry.end === period.end,
    );
    const issues = sourceIssues(draft, 'historyAnnual');
    return [
      ...issues,
      ...(data?.error
        ? [data.error]
        : !data || (draft.historyAnnualRead?.status !== 'ready' && !issues.length)
          ? ['尚未读取上一完整财年的发货数量']
          : []),
    ];
  };
  const history = months.flatMap((month) => {
    const period = previousFiscalYear(month);
    const data = draft.historyAnnual?.periods?.find(
      (entry) => entry.start === period.start && entry.end === period.end,
    );
    const issues = annualIssues(month);
    return (data?.rows ?? []).map((row) => ({
      month,
      base: text(row['基地']),
      code: text(row['产品编码']),
      category: text(row['大类']),
      quantity: issues.length ? null : number(row['数量']),
    }));
  });
  const relationSources =
    relations && (!relations.month || relations.month === draft.month) ? relations.sources : null;
  const capacities = (relationSources?.sku_capacity ?? []).map((row) => ({
    base: text(row.belong_base),
    code: text(row.material_code),
    line: [text(row.workshop), text(row.tunnel_no)].filter(Boolean).join(' / '),
    dailyPieces: number(row.standard_daily_output_pc),
    dailyTons: number(row.standard_daily_output_ton),
    missing: [
      ...(!text(row.belong_base) ? ['缺源基地'] : []),
      ...(!text(row.material_code) ? ['缺源物料编码'] : []),
      ...(!text(row.tunnel_no) ? ['缺隧道号'] : []),
      ...(number(row.standard_daily_output_pc) === null ? ['缺标准日产件数'] : []),
      ...(number(row.standard_daily_output_ton) === null ? ['缺标准日产吨数'] : []),
    ],
  }));
  const date = new Date(`${draft.month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  const shipmentMonth = date.toISOString().slice(0, 7);
  const validShipment =
    shipmentSnapshot?.draftId === draft.id &&
    shipmentSnapshot.month === draft.month &&
    shipmentSnapshot.shipmentMonth === shipmentMonth &&
    shipmentSnapshot.sourceKind !== 'demo' &&
    !demo(shipmentSnapshot.source) &&
    !['loading', 'failed', 'error', 'denied'].includes(shipmentSnapshot.status);
  const openingInventory = validShipment
    ? (shipmentSnapshot.rows ?? []).map((row) => ({
        base: text(row.base),
        code: text(row.code),
        quantity: number(row.end),
      }))
    : [];
  const products = demo(draft.productSource)
    ? []
    : (draft.products ?? []).map((row) => ({
        base: text(row['基地']),
        code: text(row['产品编码']),
        name: text(row['产品名称']),
        category: text(row['大类']),
        series: text(row['系列']),
        group: text(row['物料组']),
      }));
  const productMonths = new Map();
  for (const source of ['report', 'history']) {
    for (const row of source === 'report' ? report : history) {
      if (!row.base || !row.code || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month)) continue;
      const month = row.month;
      productMonths.set(JSON.stringify([month, row.base, row.code]), {
        month,
        base: row.base,
        code: row.code,
      });
    }
  }
  const productIssues = sourceIssues(draft, 'products');
  const result = computeMpsWorkflow({
    context,
    products,
    productMonths: [...productMonths.values()],
    scopeCoverage: 'in-scope',
    categoryDemand: (draft.categoryDemand ?? buildCategoryDemand(draft, []).rows).map((row) => ({
      month: text(row.month),
      category: text(row.category),
      quantity: number(row.quantity),
      ...(Object.hasOwn(row, 'systemQuantity')
        ? { systemQuantity: number(row.systemQuantity) }
        : {}),
    })),
    report,
    history,
    sourceIssues: {
      report: productIssues,
      history: productIssues,
    },
    openingInventory,
    capacities,
    adjustments: {
      categoryDemand: (draft.adjustments?.categoryDemand ?? []).map(
        ({ month, category, quantity }) => ({ month, category, quantity }),
      ),
      shares: (draft.adjustments?.shares ?? []).map(({ rowId, share }) => ({ rowId, share })),
    },
    productionDays: (draft.productionDays ?? []).map((row) => ({
      base: text(row.base),
      month: text(row.month),
      days: number(row.days),
    })),
    unitWeights: (draft.unitWeights ?? []).map((row) => ({
      base: text(row.base),
      code: text(row.code),
      tonsPerPiece: number(row.tonsPerPiece),
    })),
    resources: (draft.resources ?? []).map((row) => ({
      id: text(row.id),
      base: text(row.base),
      kind: row.kind,
      name: text(row.name),
      dailyTons: number(row.dailyTons),
    })),
    resourceAssignments: (draft.resourceAssignments ?? []).map((row) => ({
      month: text(row.month),
      base: text(row.base),
      code: text(row.code),
      resourceId: text(row.resourceId),
      share: number(row.share),
    })),
    constraints: {
      safetyDays: (draft.constraints?.safetyDays ?? []).map((row) => ({
        base: text(row.base),
        days: number(row.days),
      })),
      rules: structuredClone(draft.constraints?.rules ?? {}),
    },
  });
  for (const row of result.rows) {
    for (const source of ['report', 'history']) {
      const issues = source === 'report' ? reportIssues(row.month) : annualIssues(row.month);
      for (const field of [source + 'Quantity', source + 'Share', 'share', 'demand'])
        row.missing[field] = [...new Set([...row.missing[field], ...issues])];
    }
  }
  const knownProducts = new Set(result.rows.filter((row) => row.month === draft.month).map(rowKey));
  const readIssues = months.flatMap((month) => [
    ...reportIssues(month).map((issue) => `${month} 销售提报占比：${issue}`),
    ...annualIssues(month).map((issue) => `${month} 上一财年发货：${issue}`),
  ]);
  if (readIssues.length) result.summary.requiredProductionTons = null;
  result.summary.missing.push(...readIssues);
  result.missing.push(...readIssues);
  result.missing.push(...productIssues);
  result.missing.push('占比按当前产品明细的物料编码、物料组编码计算；池外记录单列，缺行不补零');
  if (demo(draft.productSource)) result.missing.push('原型产品清单未接入后续计算');
  if (validShipment && openingInventory.some((row) => !knownProducts.has(rowKey(row))))
    result.missing.push('部分发货结存尚无本版本产品对应');
  return result;
}
