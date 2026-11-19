import { delistedReportIssues } from './delisted-report.js';
import { canonicalBaseName, latestTransferSnapshot } from './relations.js';
import {
  sourceDimensions,
  sourceProductMappings,
  createSourceProductMatcher,
  createHistoryDependentLookup,
} from './source-projections.js';
import { buildCategoryDemand } from './category-demand.js';
import { computeMpsWorkflow, previousFiscalYear } from 'dsh-agent-manage/mps-compute/workflow';
import { solveMpsPlan } from 'dsh-agent-manage/mps-compute/plan';
import { buildPlanSources, resolveWeightPairs } from './plan-inputs.js';
import { attachPlanReport } from './plan-diagnostics.js';
import { inventoryVersionOrder, selectedInventoryMonth } from './inventory-selection.js';
import { buildCapacityReport } from 'dsh-agent-manage/mps-compute/capacity-report';
import { productionCalendarDays } from './production-calendar.js';

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
const historyWarningMessages = (warnings) => [
  ...new Set(
    (warnings ?? []).map((warning) => {
      const message = text(warning) || text(warning?.message);
      const code = text(warning?.code);
      return (
        message ||
        (code === 'METRIC_VALUE_UNAVAILABLE'
          ? '部分指标未返回有效值（METRIC_VALUE_UNAVAILABLE）'
          : code) ||
        '来源返回警告，未提供说明'
      );
    }),
  ),
];
const demo = (value) => /demo|演示|原型/i.test(String(value ?? ''));
const rowKey = (row) => JSON.stringify([row.base, row.code]);
function productHistoryMappings(products, raw) {
  const sources = new Map();
  for (const row of raw ?? []) {
    if (!Object.hasOwn(row, 'replace_num')) continue;
    const code = text(row.material_code);
    sources.set(code, [...(sources.get(code) ?? []), row]);
  }
  return products.flatMap((product) => {
    if (!product.historyCode) return [product];
    const matching = (sources.get(product.code) ?? []).filter(
      (row) => text(row.replacement_material_code) === product.historyCode,
    );
    if (!matching.length)
      return [{ ...product, ...(sources.has(product.code) ? { historyFactor: null } : {}) }];
    const byBase = new Map();
    for (const row of matching) {
      const base = canonicalBaseName(row.target_base);
      if (!base || (product.base && base !== canonicalBaseName(product.base))) continue;
      byBase.set(base, [...(byBase.get(base) ?? []), row]);
    }
    const specific = [...byBase].map(([base, rows]) => {
      const factors = rows.map((row) => number(row.replace_num));
      const unique = new Set(factors);
      return {
        ...product,
        base: product.base || base,
        historyFactor:
          unique.size === 1 && factors[0] !== null && factors[0] >= 0 ? factors[0] : null,
      };
    });
    return product.base && specific.length
      ? specific
      : [{ ...product, historyFactor: null }, ...specific];
  });
}
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
  const categoryComputation = buildCategoryDemand(draft, shipmentSnapshot);
  const excludedShipments = categoryComputation.shipmentScope.excluded;
  const excludedShipmentKeys = new Set(excludedShipments.map(rowKey));
  const mappings = sourceProductMappings(draft.products, draft.productRaw);
  const sourceMatcher = createSourceProductMatcher(mappings);
  const historyDependents = createHistoryDependentLookup(mappings);
  const excludedCodes = new Set(excludedShipments.map((row) => row.code));
  const participatingCodes = new Set(
    (shipmentSnapshot?.rows ?? [])
      .filter((row) => !excludedShipmentKeys.has(rowKey(row)))
      .map((row) => row.code),
  );
  const includedShipment = (row) => {
    if (!excludedShipmentKeys.size) return true;
    const currentCode = sourceMatcher(row.code, row.base).currentCode;
    const codes = currentCode
      ? [currentCode]
      : mappings
          .filter(
            (product) => (product['老品编码'] || product.replacement_material_code) === row.code,
          )
          .map((product) => product['产品编码'] || product.material_code);
    if (!codes.length) return !excludedShipmentKeys.has(rowKey(row));
    return row.base
      ? codes.some((code) => !excludedShipmentKeys.has(rowKey({ base: row.base, code })))
      : codes.some((code) => !excludedCodes.has(code) || participatingCodes.has(code));
  };
  const reportColumn = draft.pull === 'monthly' ? '月初数量' : '纠偏数量';
  const readQuantity = (rows, column) =>
    (rows ?? []).map((row) => ({
      month: text(row['月份']),
      base: canonicalBaseName(row['基地']),
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
  const submittedReport = availableQuantity('report', reportColumn).filter(
    (row) => row.month === draft.month,
  );
  const reportBasis =
    draft.reportSource === 'business'
      ? (draft.planRates ?? [])
          .filter((row) => row['维度类型'] === '基地+产品' && row['月份'] === draft.month)
          .map((row) => ({
            month: text(row['月份']),
            base: canonicalBaseName(row['基地']),
            code: text(row['产品编码']),
            category: text(row['大类']),
            group: text(row['物料组']),
            series: text(row['系列']),
            quantity:
              reportIssues().length ||
              planKeys.get(
                JSON.stringify([text(row['月份']), text(row['基地']), text(row['产品编码'])]),
              ) !== 1
                ? null
                : number(row['当前维度计划量']),
          }))
      : submittedReport;
  const report = reportBasis.filter(includedShipment);
  const submittedKeys = new Set(submittedReport.map(rowKey));
  const poolReport = [
    ...submittedReport,
    ...reportBasis.filter((row) => !submittedKeys.has(rowKey(row))),
  ];
  const fiscal = previousFiscalYear(draft.month);
  const annualData = draft.historyAnnual?.periods?.find(
    (entry) => entry.start === fiscal.start && entry.end === fiscal.end,
  );
  const annualSourceIssues = sourceIssues(draft, 'historyAnnual');
  const annualReady = ['ready', 'partial'].includes(draft.historyAnnualRead?.status);
  const annualIssues = () => [
    ...annualSourceIssues,
    ...(annualData?.metadata?.partial ? ['上一完整财年发货读取不完整'] : []),
    ...historyWarningMessages(annualData?.metadata?.warnings),
    ...(annualData?.error
      ? [annualData.error]
      : !annualData || (!annualReady && !annualSourceIssues.length)
        ? ['尚未读取上一完整财年的发货数量']
        : []),
  ];
  const annualHistory = (annualData?.rows ?? []).map((row) => ({
    month: draft.month,
    base: canonicalBaseName(row['基地']),
    code: text(row['产品编码']),
    category: text(row['大类']),
    quantity:
      annualSourceIssues.length || annualData.error || !annualReady ? null : number(row['数量']),
  }));
  const includedAnnualHistory = annualHistory.filter(
    ({ base, code }) =>
      base &&
      code &&
      historyDependents(code, base).some(
        (currentCode) => !excludedShipmentKeys.has(rowKey({ base, code: currentCode })),
      ),
  );
  const history = months.flatMap((month) =>
    includedAnnualHistory.map((row) => ({ ...row, month })),
  );
  const relationSources =
    relations && (!relations.month || relations.month === draft.month) ? relations.sources : null;
  const capacities = (relationSources?.sku_capacity ?? []).map((row) => ({
    base: canonicalBaseName(row.belong_base),
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
  const savedCutoff = draft.shipment?.cutoff ?? draft.shipment?.business?.cutoff;
  const validShipment =
    shipmentSnapshot?.draftId === draft.id &&
    shipmentSnapshot.month === draft.month &&
    shipmentSnapshot.shipmentMonth === shipmentMonth &&
    (!savedCutoff || shipmentSnapshot.cutoff === savedCutoff) &&
    shipmentSnapshot.sourceKind !== 'demo' &&
    !demo(shipmentSnapshot.source) &&
    !['loading', 'failed', 'error', 'denied'].includes(shipmentSnapshot.status);
  const openingInventory = validShipment
    ? (shipmentSnapshot.rows ?? []).map((row) => ({
        base: canonicalBaseName(row.base),
        code: text(row.code),
        quantity: number(row.end),
        rawQuantity: number(row.rawEnd === undefined ? row.end : row.rawEnd),
      }))
    : [];
  const products = demo(draft.productSource)
    ? []
    : productHistoryMappings(
        mappings.map((row) => ({
          base: canonicalBaseName(row['基地']),
          code: text(row['产品编码']),
          name: text(row['产品名称']),
          category: text(row['大类']),
          series: text(row['系列']),
          group: text(row['物料组']),
          ...(text(row['老品编码']) ? { historyCode: text(row['老品编码']) } : {}),
        })),
        draft.productRaw,
      );
  const productMonths = new Map(
    products
      .filter((row) => row.base && row.code && !excludedShipmentKeys.has(rowKey(row)))
      .map((row) => [
        JSON.stringify([draft.month, row.base, row.code]),
        {
          month: draft.month,
          base: row.base,
          code: row.code,
        },
      ]),
  );
  const reportRead =
    draft.reportSource === 'business'
      ? draft.planRatesRead
      : (draft.reportRead?.periods?.[draft.month] ?? draft.reportRead);
  const reportMissingAsZero = new Set();
  if (
    reportRead?.status === 'ready' &&
    (!reportRead.month || reportRead.month === draft.month) &&
    reportRead.metadata?.partial !== true &&
    !reportIssues().length
  ) {
    const reported = new Set(report.map(rowKey));
    for (const product of productMonths.values()) {
      if (reported.has(rowKey(product))) continue;
      report.push({ ...product, quantity: 0 });
      reportMissingAsZero.add(rowKey(product));
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
  const windowRead = draft.historyWindowRead;
  const windowFailure =
    windowRead?.status === 'failed' &&
    !(draft.historyWindow?.periods ?? []).some((period) => period.error);
  const windowUnread = !windowRead || ['loading', 'unread'].includes(windowRead.status);
  const transferLabels = Map.groupBy(
    latestTransferSnapshot(relations?.sources?.transfers ?? []).rows,
    (row) => JSON.stringify([canonicalBaseName(row.target_base), text(row.material_code)]),
  );
  const delistedProducts = products.flatMap((product) => {
    const tags = [
      ...new Set(
        (transferLabels.get(rowKey(product)) ?? [])
          .map((row) => text(row.transfer_tag))
          .filter(Boolean),
      ),
    ];
    if (tags.length !== 1 || tags[0] !== '下市品') return [];
    const stock = (shipmentSnapshot?.rows ?? []).find((row) => rowKey(row) === rowKey(product));
    const average = validShipment ? number(stock?.average) : null;
    const issue = !validShipment
      ? `库存日报读取状态${shipmentSnapshot?.status ?? 'unread'}；${shipmentSnapshot?.error ?? '同版本库存快照尚未就绪'}`
      : !stock
        ? `${shipmentSnapshot.cutoff ?? '截止日'}库存日报无同基地SKU记录`
        : average === null || average < 0
          ? '截止日库存日报avg_30d_send为空或无效'
          : null;
    return [
      {
        ...product,
        dailyShipment: issue ? null : average,
        ...(issue ? { dailyShipmentIssue: issue } : {}),
      },
    ];
  });
  const workflowInput = {
    context,
    inventoryTargets: draft.inventoryTargets ?? [],
    inventoryTargetVersion: draft.constraints?.targetVersion ?? 'auto',
    inventoryTurnoverMonth: selectedInventoryMonth(draft),
    inventoryTargetPriority: inventoryVersionOrder(selectedInventoryMonth(draft)),
    requireSourceTurnoverDays: true,
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
    productMonths: [...productMonths.values()].filter(includedShipment),
    scopeCoverage: 'in-scope',
    categoryDemand: (draft.categoryDemand ?? categoryComputation.rows).map((row) => ({
      month: text(row.month),
      category: text(row.category),
      quantity: number(row.quantity),
      ...(Object.hasOwn(row, 'systemQuantity')
        ? { systemQuantity: number(row.systemQuantity) }
        : {}),
    })),
    report,
    poolEvidence: { report: poolReport, history: annualHistory },
    reportRatios: excludedShipments.length ? [] : reportRatios,
    history,
    historySourceIssues: annualIssues(),
    historySourceStatus: ['ready', 'partial'].includes(draft.historyAnnualRead?.status)
      ? draft.historyAnnualRead.status
      : ['failed', 'denied', 'error'].includes(draft.historyAnnualRead?.status)
        ? 'failed'
        : 'unread',
    historyAsOfMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    historyPeriods: (draft.historyWindow?.periods ?? []).map((period) => ({
      month: period.month,
      status: windowUnread
        ? 'unread'
        : windowFailure
          ? 'failed'
          : period.error
            ? 'failed'
            : period.metadata?.partial
              ? 'partial'
              : 'ready',
      issues: [
        ...(windowFailure ? [windowRead.error || '历史窗口读取失败'] : []),
        ...(period.error ? [period.error] : []),
        ...historyWarningMessages(period.metadata?.warnings),
      ],
      rows: (period.rows ?? []).map((row) => ({
        month: period.month,
        base: text(row['基地']),
        code: text(row['产品编码']),
        quantity: number(row['数量']),
      })),
    })),
    sourceIssues: {
      report: productIssues,
      history: productIssues,
    },
    openingInventory,
    delistedProducts,
    inventoryMovements: [
      ...new Map(
        (draft.inventoryMovements ?? []).map((row) => [
          JSON.stringify([row.month, row.base, row.code]),
          {
            ...row,
            productionInbound: number(row.productionInbound),
            inTransitInbound: number(row.inTransitInbound),
            transferIn: number(row.transferIn),
            transferOut: number(row.transferOut),
          },
        ]),
      ).values(),
    ].filter((row) => row.month >= draft.month && row.month <= months.at(-1)),
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
    productionDays: [
      ...new Set([...productMonths.values()].map((row) => row.base).filter(Boolean)),
    ].flatMap((base) =>
      months.map((month) => ({
        base,
        month,
        days: productionCalendarDays(base, month, draft.productionDays),
      })),
    ),
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
      workshop: text(row.workshop),
      tunnel: text(row.tunnel),
      productionLines: [
        ...new Set(
          (Array.isArray(row.productionLines) ? row.productionLines : []).map(text).filter(Boolean),
        ),
      ],
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
  result.delistedIssues = delistedReportIssues(result.rows, result.context);
  result.categoryComputation = categoryComputation;
  result.excludedShipments = excludedShipments;
  result.partial = excludedShipments.length > 0;
  result.scopeStatus = result.partial ? 'partial' : 'in-scope';
  result.summary.scopeStatus = result.scopeStatus;
  result.summary.excludedShipmentCount = excludedShipments.length;
  if (result.partial) {
    result.summary.requiredProductionTons = null;
    result.summary.missing.push('待定单品已排除，仅计算当前参与范围，完整范围总量未知');
  }
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
    shipment: shipment.filter((row) =>
      includedShipment({ base: row['基地'], code: row['产品编码'] }),
    ),
    forecast: forecast
      .filter((row) => includedShipment({ base: row['基地'], code: row['产品编码'] }))
      .map((row) => ({
        ...row,
        数量: sourceIssues(draft, 'forecast', row['月份']).length ? null : row['数量'],
      })),
  };
  result.categoryComparisons = [...new Set(result.categoryRows.map((row) => row.category))].map(
    (category) => ({
      category,
      shipment: summarize(
        shipment.filter(
          (row) =>
            row['大类'] === category &&
            includedShipment({ base: row['基地'], code: row['产品编码'] }),
        ),
        'fin',
        validShipment ? [] : ['第二步同版预估发货尚未就绪'],
      ),
      excluded: excludedShipments.filter((row) => row.category === category).length,
      forecast: Object.fromEntries(
        months.slice(0, 2).map((month) => [
          month,
          summarize(
            forecast.filter(
              (row) =>
                row['月份'] === month &&
                row['大类'] === category &&
                includedShipment({ base: row['基地'], code: row['产品编码'] }),
            ),
            '数量',
            sourceIssues(draft, 'forecast', month),
          ),
        ]),
      ),
    }),
  );
  result.categoryComparisons.forEach((row) => {
    row.shipment.excluded = row.excluded;
  });
  if (evaluation) {
    const planSources = buildPlanSources(draft, relations, evaluation.weights, [
      ...workflowInput.productMonths,
    ]);
    const planInput = {
      ...workflowInput,
      ...planSources,
      planSourceIssues: [...planSources.planSourceIssues, ...(evaluation.sourceIssues ?? [])],
    };
    result.plan = solveMpsPlan(planInput);
    result.plan.partial = result.partial;
    result.plan.scopeStatus = result.scopeStatus;
    result.plan.excludedShipments = excludedShipments;
    result.plan.summary.scopeStatus = result.scopeStatus;
    result.plan.summary.excludedShipmentCount = excludedShipments.length;
    const annualWeights = resolveWeightPairs(
      draft.unitWeights ?? [],
      evaluation.annual?.rows ?? [],
      {
        rows: [
          ...(evaluation.weights?.rows ?? []),
          ...(evaluation.annual?.extraWeights?.rows ?? []),
        ],
      },
      draft.productRaw,
    );
    result.plan.capacityReport = buildCapacityReport(
      { ...planInput, unitWeights: annualWeights.weights },
      result.plan,
      evaluation.annual
        ? { ...evaluation.annual, unitWeightGaps: annualWeights.issues }
        : undefined,
    );
    result.plan.capacityReport.scopeStatus = result.scopeStatus;
    result.plan.capacityReport.excludedShipmentCount = excludedShipments.length;
    result.plan.capacityLineDetails = planSources.resources.map((resource) => {
      const source = (relations?.sources?.tunnels ?? []).find(
        (row) =>
          row.belong_base === resource.base &&
          row.production_unit === resource.workshop &&
          row.tunnel_no === resource.tunnel,
      );
      return {
        resourceId: resource.id,
        workshop: resource.workshop ?? '',
        productionLines: resource.productionLines ?? [],
        tunnel: resource.tunnel ?? '',
        specification: source?.tunnel_tonnage ?? '',
        outsourced: /濮阳|代工/.test(resource.workshop ?? resource.name),
      };
    });
    result.plan.sources = planSources.metadata;
    attachPlanReport(result.plan, planSources, relations, {
      categoryComputation,
      shipmentSnapshot,
    });
  }
  for (const row of result.rows) {
    row.reportMissingAsZero = reportMissingAsZero.has(rowKey(row));
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
