import { sourceDimensions } from './source-projections.js';
import { buildCategoryDemand } from './category-demand.js';
import { computeMpsWorkflow, previousFiscalYear } from 'dsh-agent-manage/mps-compute/workflow';
import { solveMpsPlan } from 'dsh-agent-manage/mps-compute/plan';
import { buildPlanSources } from './plan-inputs.js';

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

export function buildMpsWorkflow(draft, relations, shipmentSnapshot, evaluation) {
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
  const reportIssues = () => {
    const source = draft.reportSource === 'business' ? 'planRates' : 'report';
    const issues = sourceIssues(draft, source, draft.month);
    return source === 'planRates' && draft.planRatesRead?.status !== 'ready' && !issues.length
      ? ['销售提报占比尚未同步']
      : issues;
  };
  const planKeys = new Map();
  for (const row of draft.planRates ?? []) {
    if (row['维度类型'] !== '基地+产品' || row['月份'] !== draft.month) continue;
    const key = JSON.stringify([text(row['月份']), text(row['基地']), text(row['产品编码'])]);
    planKeys.set(key, (planKeys.get(key) ?? 0) + 1);
  }
  const report =
    draft.reportSource === 'business'
      ? (draft.planRates ?? [])
          .filter((row) => row['维度类型'] === '基地+产品' && row['月份'] === draft.month)
          .map((row) => ({
            month: text(row['月份']),
            base: text(row['基地']),
            code: text(row['产品编码']),
            quantity:
              reportIssues().length ||
              planKeys.get(
                JSON.stringify([text(row['月份']), text(row['基地']), text(row['产品编码'])]),
              ) !== 1
                ? null
                : number(row['当前维度计划量']),
          }))
      : availableQuantity('report', reportColumn).filter((row) => row.month === draft.month);
  const annualIssues = () => {
    const period = previousFiscalYear(draft.month);
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
    const period = previousFiscalYear(draft.month);
    const data = draft.historyAnnual?.periods?.find(
      (entry) => entry.start === period.start && entry.end === period.end,
    );
    const issues = annualIssues();
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
      const month = draft.month;
      productMonths.set(JSON.stringify([month, row.base, row.code]), {
        month,
        base: row.base,
        code: row.code,
      });
    }
  }
  const reportRatios = [];
  if (draft.reportSource === 'business' && !reportIssues().length) {
    for (const row of draft.planRates ?? []) {
      if (row['月份'] !== draft.month) continue;
      if (!Object.hasOwn(row, '计划占比')) continue;
      const matches = (draft.products ?? []).filter((product) =>
        row['维度类型'] === '大类+物料组'
          ? product['大类'] === row['大类'] &&
            [product['物料组'], product['物料组名称']].includes(row['物料组名称'])
          : product['产品编码'] === row['产品编码'] &&
            (row['维度类型'] !== '物料组+产品' ||
              [product['物料组'], product['物料组名称']].includes(row['物料组名称'])),
      );
      const scopes = [
        ...new Map(
          matches.map((product) => [
            JSON.stringify([product['大类'], product['物料组']]),
            { category: product['大类'], group: product['物料组'] },
          ]),
        ).values(),
      ];
      if (scopes.length !== 1) continue;
      const common = { ...scopes[0], share: number(row['计划占比']) };
      if (row['维度类型'] === '大类+物料组') reportRatios.push({ ...common, kind: 'group' });
      if (row['维度类型'] === '物料组+产品')
        reportRatios.push({ ...common, kind: 'sku', code: row['产品编码'] });
      if (row['维度类型'] === '基地+产品')
        reportRatios.push({ ...common, kind: 'base', code: row['产品编码'], base: row['基地'] });
    }
  }
  const productIssues = sourceIssues(draft, 'products');
  const workflowInput = {
    context,
    inventoryTargets: draft.inventoryTargets ?? [],
    inventoryTargetVersion: draft.constraints?.targetVersion ?? 'auto',
    inventoryTargetIssues:
      draft.inventoryTargetsRead?.status === 'ready'
        ? []
        : [
            draft.inventoryTargetsRead?.error ||
              (draft.inventoryTargetsRead?.status === 'loading'
                ? '目标库存来源正在读取'
                : '目标库存来源尚未读取'),
          ],
    products,
    productMonths: [...productMonths.values()],
    scopeCoverage: 'in-scope',
    categoryDemand: (draft.categoryDemand ?? buildCategoryDemand(draft).rows).map((row) => ({
      month: text(row.month),
      category: text(row.category),
      quantity: number(row.quantity),
      ...(Object.hasOwn(row, 'systemQuantity')
        ? { systemQuantity: number(row.systemQuantity) }
        : {}),
    })),
    report,
    reportRatios,
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
      quantities: (draft.adjustments?.quantities ?? []).map(
        ({ kind, month, category, group, code, base, quantity }) => ({
          kind,
          month,
          category,
          group,
          ...(kind !== 'group' ? { code } : {}),
          ...(kind === 'base-sku' ? { base } : {}),
          quantity,
        }),
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
      turnoverDays: (draft.constraints?.turnoverDays ?? []).map((row) => ({
        base: text(row.base),
        code: text(row.code),
        days: number(row.days),
      })),
      rules: structuredClone(draft.constraints?.rules ?? {}),
    },
  };
  const result = computeMpsWorkflow(workflowInput);
  const forecast = sourceDimensions(draft.forecast ?? [], draft.products ?? []);
  const shipment = validShipment
    ? sourceDimensions(
        (shipmentSnapshot.rows ?? []).map((row) => ({
          ...row,
          基地: row.base,
          产品编码: row.code,
        })),
        draft.products ?? [],
      )
    : [];
  const summarize = (rows, field, issues = []) => {
    const known = rows.map((row) => number(row[field])).filter((value) => value !== null);
    const total = known.reduce((sum, value) => sum + value, 0);
    return {
      quantity: !issues.length && rows.length && known.length === rows.length ? total : null,
      knownQuantity: !issues.length && known.length ? total : null,
      missingCount: issues.length ? Math.max(1, rows.length) : rows.length - known.length,
      count: rows.length,
      issues,
    };
  };
  result.comparisonSources = {
    historyPeriod: previousFiscalYear(draft.month),
    shipment,
    forecast: forecast.map((row) => ({
      ...row,
      数量: sourceIssues(draft, 'forecast', row['月份']).length ? null : row['数量'],
    })),
  };
  result.categoryComparisons = [...new Set(result.categoryRows.map((row) => row.category))].map(
    (category) => ({
      category,
      shipment: summarize(
        shipment.filter((row) => row['大类'] === category),
        'fin',
        validShipment ? [] : ['第二步同版预估发货尚未就绪'],
      ),
      forecast: Object.fromEntries(
        months.slice(0, 2).map((month) => [
          month,
          summarize(
            forecast.filter((row) => row['月份'] === month && row['大类'] === category),
            '数量',
            sourceIssues(draft, 'forecast', month),
          ),
        ]),
      ),
    }),
  );
  if (evaluation) {
    const planSources = buildPlanSources(draft, relations, evaluation.weights);
    result.plan = solveMpsPlan({
      ...workflowInput,
      ...planSources,
      planSourceIssues: [...planSources.planSourceIssues, ...(evaluation.sourceIssues ?? [])],
    });
    result.plan.sources = planSources.metadata;
  }
  for (const row of result.rows) {
    for (const source of ['report', 'history']) {
      const issues = source === 'report' ? reportIssues() : annualIssues();
      for (const field of [source + 'Quantity', source + 'Share', 'share', 'demand'])
        row.missing[field] = [...new Set([...row.missing[field], ...issues])];
    }
  }
  const knownProducts = new Set(result.rows.filter((row) => row.month === draft.month).map(rowKey));
  const readIssues = months.flatMap((month) => [
    ...reportIssues().map((issue) => `${month} 销售提报占比：${issue}`),
    ...annualIssues().map((issue) => `${month} 上一财年发货：${issue}`),
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
