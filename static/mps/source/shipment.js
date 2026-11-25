import {
  businessBases,
  compareBusinessRows,
  compareBusinessValues,
  createTablePresentation,
} from './table-presentation.js';
import {
  applyShipmentCoefficient,
  deriveShipmentCoefficient,
  deriveShipmentForecast as derive,
  shipmentCoefficientPeriods,
} from './shipment-forecast.js';
import { matchesCategories } from './category-filter.js';
import {
  createSourceProductMatcher,
  sourceDimensions,
  sourceProductMappings,
  createProductScopeMatcher,
} from './source-projections.js';
import { prototypeShipments } from './prototype-shipments.js';
import {
  readLatestShipmentDate,
  readShipmentCoefficientFacts,
  readShipmentInputs,
} from './facts.js';
import { hasMpsSource } from './master-data.js';
import { createBatchEdit } from './batch-edit.js';
import { createReportPage } from './report-page.js';
import { mpsBusinessDate } from './business-date.js';
import { canonicalBaseName } from './relations.js';
const emptyRows = [];
const calculationShipmentPriority = 4;
const bases = businessBases;
const fields = [
  'shipped',
  'prepped',
  'unprepped',
  'daily3',
  'average',
  'shipDays',
  'prediction',
  'fin',
  'open',
  'inbound',
  'remaining',
  'transferIn',
  'transferOut',
  'end',
];
const names = [
  '本月已发货',
  '已备',
  '未备',
  '近三天日均发货量',
  '近30天日均发货',
  '已备未备预估发运天数',
  '本月预测量',
  '整月预估发货',
  '月初库存',
  '本月生产入库',
  '剩余天数入库',
  '调入计划',
  '调出计划',
  '预计月末结存',
];
const inputFields = ['shipped', 'prepped', 'unprepped', 'daily3', 'open', 'inbound', 'remaining'];
const columns = [
  '月份',
  '基地',
  '产品编码',
  '产品名称',
  '大类',
  '系列',
  '物料组',
  ...inputFields.map((field) => names[fields.indexOf(field)]),
];
const keyOf = (row) => JSON.stringify([row.base, row.code]);
const display = (value, field) =>
  value == null
    ? '待定'
    : (Object.is(value, -0) ? 0 : value).toLocaleString('zh-CN', {
        maximumFractionDigits: field === 'average' ? 4 : 0,
      });
const knownSum = (rows, field) => {
  const known = rows.filter((row) => row[field] != null);
  return known.length ? finite(known.reduce((sum, row) => sum + row[field], 0)) : null;
};
const finite = (number) =>
  Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER ? number : null;
const displayFactor = (value) => value.toLocaleString('zh-CN', { maximumFractionDigits: 6 });

function shipmentQuantityByCategory(rows, matchProduct) {
  const totals = new Map();
  for (const row of rows) {
    const base = canonicalBaseName(row['基地']);
    if (!bases.includes(base)) continue;
    const { category } = matchProduct(row['产品编码'], base);
    if (!category) continue;
    const quantity = row['数量'];
    const total = totals.has(category) ? totals.get(category) : 0;
    totals.set(category, quantity === '' || total == null ? null : finite(total + quantity));
  }
  return totals;
}

function allocate(weights, target) {
  if (weights.some((value) => value == null)) throw Error('存在待定权重，无法重摊，请先补齐输入。');
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(target) || finite(total) == null)
    throw Error('调整值须为安全范围内的整数件数。');
  if (!total) {
    if (target) throw Error('当前有效量合计为0，非零目标的分摊口径待确认，未修改原值。');
    return weights.map(() => 0);
  }
  const raw = weights.map((weight) => (weight / total) * target);
  const values = raw.map(Math.trunc);
  if (values.some((value) => !Number.isSafeInteger(value)))
    throw Error('重摊结果超出安全范围，未修改原值。');
  const residual = Number(BigInt(target) - values.reduce((sum, value) => sum + BigInt(value), 0n));
  if (Math.abs(residual) > weights.length) throw Error('权重精度不足以可靠重摊，未修改原值。');
  const direction = Math.sign(residual);
  const order = raw
    .map((value, index) => ({ index, remainder: value - values[index] }))
    .sort(
      (left, right) => direction * (right.remainder - left.remainder) || left.index - right.index,
    );
  for (let index = 0; index < Math.abs(residual); index++) values[order[index].index] += direction;
  if (values.some((value) => !Number.isSafeInteger(value)))
    throw Error('重摊结果超出安全范围，未修改原值。');
  return values;
}
function shipmentMonthDays(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function projectShipment(draft, cutoff, month, sourceKind, inputRows, coefficientFacts) {
  const passed = Number(cutoff.slice(8));
  const totalDays = shipmentMonthDays(month);
  const products = ['loading', 'failed'].includes(draft.productsRead?.status)
    ? emptyRows
    : (draft.products ?? emptyRows);
  const productMappings = sourceProductMappings(products, draft.productRaw);
  const inScope = createProductScopeMatcher(productMappings);
  const sourceRows = [...inputRows];
  if (sourceKind === 'business') {
    const present = new Set(sourceRows.filter((row) => row.month === month).map(keyOf));
    for (const product of productMappings) {
      const base = canonicalBaseName(product['基地']);
      const code = product['产品编码'];
      const key = keyOf({ base, code });
      if (!bases.includes(base) || !code || present.has(key)) continue;
      present.add(key);
      sourceRows.push({
        month,
        base,
        code,
        name: product['产品名称'],
        series: product['系列'],
        group: product['物料组'],
        shipped: 0,
        prepped: 0,
        unprepped: 0,
        daily3: 0,
        average: 0,
        rawAverage: null,
        open: 0,
        inbound: 0,
        remaining: passed > 1 ? 0 : null,
        transferIn: 0,
        transferOut: 0,
        transferInSource: '完整库存日报无该基地SKU记录，按0',
        transferOutSource: '完整库存日报无该基地SKU记录，按0',
        sourceDays: 0,
        duplicateDays: 0,
        shipmentMissingAsZero: true,
      });
    }
  }
  const dimensions =
    sourceKind === 'business'
      ? new Map(
          sourceDimensions(
            sourceRows.map((row) => ({ 基地: row.base, 产品编码: row.code })),
            products,
          ).map((row) => [JSON.stringify([row['基地'], row['产品编码']]), row]),
        )
      : new Map();
  const periods = cutoff ? shipmentCoefficientPeriods(cutoff) : null;
  const coefficients = new Map();
  if (sourceKind === 'business' && coefficientFacts && !coefficientFacts.reason) {
    const matchProduct = createSourceProductMatcher(
      sourceProductMappings(products, draft.productRaw),
    );
    const elapsed = shipmentQuantityByCategory(coefficientFacts.elapsed, matchProduct);
    const remaining = shipmentQuantityByCategory(coefficientFacts.remaining, matchProduct);
    for (const category of new Set([...elapsed.keys(), ...remaining.keys()]))
      coefficients.set(
        category,
        deriveShipmentCoefficient(
          elapsed.get(category) ?? null,
          remaining.get(category) ?? null,
          periods,
        ),
      );
  }
  const defaultCoefficient = {
    factor: 1,
    elapsed: null,
    remaining: null,
    reason:
      periods?.reason ||
      (sourceKind !== 'business'
        ? '当前来源未同步 BI 发运量'
        : coefficientFacts?.reason || '大类缺少完整的上月 BI 区间发运量'),
  };
  const deriveRows = (currentState) => {
    return sourceRows
      .filter(
        (row) => row.month === month && bases.includes(row.base) && inScope(row.base, row.code),
      )
      .map((row) => {
        const dimension = dimensions.get(keyOf(row));
        const category = sourceKind === 'business' ? (dimension?.['大类'] ?? '') : row.category;
        const derived = applyShipmentCoefficient(
          derive(row, passed, totalDays),
          coefficients.get(category) ??
            (category ? defaultCoefficient : { ...defaultCoefficient, reason: '当前大类未匹配' }),
        );
        const adjustment = currentState.values?.[keyOf(row)];
        const remainingEdit = currentState.remaining?.[row.base];
        const remainingValue = remainingEdit?.values[keyOf(row)];
        const remaining = remainingValue ?? row.remaining;
        const fin = adjustment ? adjustment.value : derived.prediction;
        const transferIn = sourceKind === 'business' ? (row.transferIn ?? null) : null;
        const transferOut = sourceKind === 'business' ? (row.transferOut ?? null) : null;
        const open = row.open == null ? null : Math.max(0, row.open);
        const inputs = { ...row, transferIn, transferOut };
        const rawEnd = [open, row.inbound, remaining, fin, transferIn, transferOut].every(
          (value) => value != null,
        )
          ? finite(open + row.inbound + remaining + transferIn - transferOut - fin)
          : null;
        const end = rawEnd == null ? null : Math.max(0, rawEnd);
        const inventoryIssues = [
          ...(row.open < 0
            ? [
                {
                  metric: 'openingInventory',
                  rawValue: row.open,
                  calculationValue: 0,
                  reason: '原始月初库存为负，原因待核；计算用值归0',
                },
              ]
            : []),
          ...(rawEnd < 0
            ? [
                {
                  metric: 'projectedClosing',
                  rawValue: rawEnd,
                  calculationValue: 0,
                  reason: '库存收支预测为负，原因待核；计算用值归0，原始不足保留',
                },
              ]
            : []),
        ];
        return {
          ...derived,
          rawOpen: sourceKind === 'business' && row.sourceDays === 0 ? null : row.open,
          open,
          rawEnd,
          inventoryIssues,
          ...(sourceKind === 'business'
            ? {
                category,
                group: dimension?.['物料组'] ?? '',
                groupName: dimension?.['物料组名称'] ?? '',
                dimensionIssue: dimension?.['缺项原因'] ?? '',
              }
            : {}),
          fin,
          remaining,
          inputRemaining: row.remaining,
          transferIn,
          transferOut,
          end,
          adjustment: adjustment ?? null,
          remainingSource: remainingValue == null ? null : remainingEdit.source,
          missingFields: [
            ...inputFields,
            'transferIn',
            'transferOut',
            ...(sourceKind === 'business' ? ['average'] : []),
          ].filter((field) => inputs[field] == null),
        };
      });
  };
  return { deriveRows, coefficients, defaultCoefficient, coefficientPeriods: periods };
}

async function readShipmentBusiness(cutoff, signal, priority) {
  const month = cutoff.slice(0, 7);
  const passed = Number(cutoff.slice(8));
  const totalDays = shipmentMonthDays(month);
  const [result, coefficientFacts] = await Promise.all([
    readShipmentInputs(cutoff, signal, priority),
    readShipmentCoefficientFacts(shipmentCoefficientPeriods(cutoff), signal),
  ]);
  const rows = result.rows.filter((row) => row.base && row.code && bases.includes(row.base));
  const omitted = result.rows.length - rows.length;
  const missingDimensions = rows.filter((row) => !row.name || !row.series || !row.group).length;
  const incompleteRows = rows.filter(
    (row) =>
      inputFields.some((field) => row[field] == null) ||
      row.average == null ||
      row.transferIn == null ||
      row.transferOut == null ||
      derive(row, passed, totalDays).sourceDateIssue,
  ).length;
  const duplicateRows = rows.filter((row) => row.duplicateDays > 0).length;
  return {
    month,
    cutoff,
    rows,
    sourceRecords: result.rows,
    coefficientFacts,
    metadata: {
      ...result.metadata,
      partial:
        result.metadata.partial ||
        Boolean(!rows.length || omitted || missingDimensions || incompleteRows || duplicateRows),
      recentStatus: passed < 3 ? 'insufficient-days' : 'ok',
      omittedRows: omitted,
      missingDimensions,
      incompleteRows,
      duplicateRows,
    },
  };
}

function assignShipmentForecast(values, children, amount, label) {
  const weights = children.map((child) => child.fin);
  const allocated = allocate(weights, amount);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  children.forEach((child, index) => {
    values[keyOf(child)] = {
      value: allocated[index],
      source: label,
      target: amount,
      previous: child.fin,
      weightTotal,
    };
  });
}

function applyShipmentForecastChanges(edits, changes, deriveRows) {
  const values = { ...edits.values };
  const next = { ...edits, values };
  for (const change of changes) {
    const selected = deriveRows(next).filter((row) => change.keys.includes(keyOf(row)));
    if (!selected.length) throw Error('当前对象无本月发货明细，未修改。');
    assignShipmentForecast(values, selected, change.value, change.label);
  }
  return next;
}

export function createShipment(
  react,
  useMpsPart,
  { Dialog, Upload, parseCsv, downloadCsv, monthOffset },
) {
  const h = react.createElement;
  const { useBatchEdit, Actions, Field } = createBatchEdit(react);
  const ReportPage = createReportPage(react);
  return function Shipment({
    draft,
    update,
    active,
    autoRead = false,
    autoReadCalculation = false,
    scopeGeneration,
    onSnapshot,
    calculationSnapshot,
    onEditingChange,
    selectedCategories = [],
  }) {
    const batch = useBatchEdit({
      scope: `${draft.id}:${draft.month}:${scopeGeneration.current}`,
      onEditingChange,
    });
    const today = mpsBusinessDate();
    const minCutoff = `${monthOffset(draft.month, -1)}-01`;
    const [evaluationYear, evaluationMonth] = draft.month.split('-').map(Number);
    const evaluationEnd = `${draft.month}-${new Date(Date.UTC(evaluationYear, evaluationMonth, 0)).getUTCDate()}`;
    const maxCutoff = today < evaluationEnd ? today : evaluationEnd;
    const hasCutoffRange = minCutoff <= maxCutoff;
    const state = draft.shipment ?? {};
    const calculationMonth = monthOffset(draft.month, -1);
    const calculationEnd = `${calculationMonth}-${new Date(Date.UTC(evaluationYear, evaluationMonth - 1, 0)).getUTCDate()}`;
    const cutoff = state.cutoff ?? state.business?.cutoff ?? '';
    const cutoffIssue =
      !cutoff && !hasCutoffRange ? `最早可选日期为 ${minCutoff}，该评估版本尚无可选截止日` : null;
    const month = (cutoff || (hasCutoffRange ? maxCutoff : minCutoff)).slice(0, 7);
    const passed = Number(cutoff.slice(8));
    const totalDays = shipmentMonthDays(month);
    const calculationThrough = calculationEnd < maxCutoff ? calculationEnd : maxCutoff;
    const demo =
      draft.productSource.startsWith('demo') &&
      state.rows == null &&
      !state.businessAttempted &&
      cutoff === '2026-09-22';
    const business =
      state.business?.month === month && state.business?.cutoff === cutoff ? state.business : null;
    const activeSource = state.activeSource ?? (state.rows != null ? 'local-file' : 'business');
    const sourceRows =
      activeSource === 'local-file'
        ? (state.rows ?? emptyRows)
        : (business?.rows ?? (demo ? prototypeShipments : emptyRows));
    const sourceKind =
      activeSource === 'local-file' && state.rows != null
        ? 'local-file'
        : business && activeSource === 'business'
          ? 'business'
          : demo
            ? 'demo'
            : 'unread';
    const stateRef = react.useRef(state);
    stateRef.current = state;
    const snapshotCallback = react.useRef(onSnapshot);
    snapshotCallback.current = onSnapshot;
    const controller = react.useRef(null);
    const calculationController = react.useRef(null);
    const [automaticBasis, setAutomaticBasis] = react.useState(null);
    const [syncStatus, setSyncStatus] = react.useState('unread');
    const [expanded, setExpanded] = react.useState([]);
    const [skuSearch, setSkuSearch] = react.useState('');
    const [issuesOpen, setIssuesOpen] = react.useState(false);
    const [formula, setFormula] = react.useState(null);
    const [error, setError] = react.useState('');
    const [busy, setBusy] = react.useState(false);
    const [pendingCalculationRead, setPendingCalculationRead] = react.useState(null);
    const generation = react.useRef(0);
    react.useEffect(() => {
      generation.current++;
      setFormula(null);
      setError('');
      setExpanded([]);
      setBusy(false);
      setSyncStatus('unread');
      return () => {
        generation.current++;
        controller.current?.abort();
      };
    }, [draft.id, draft.month, cutoff]);
    const coefficientFacts = business?.coefficientFacts;
    const { deriveRows, coefficients, defaultCoefficient, coefficientPeriods } = react.useMemo(
      () => projectShipment(draft, cutoff, month, sourceKind, sourceRows, coefficientFacts),
      [
        draft.products,
        draft.productsRead,
        draft.productRaw,
        cutoff,
        month,
        sourceKind,
        sourceRows,
        coefficientFacts,
      ],
    );
    const rows = react.useMemo(
      () => deriveRows(state),
      [deriveRows, state.values, state.remaining],
    );
    const categoryRows = rows.filter((row) => matchesCategories(row.category, selectedCategories));
    const coefficientCategories = [
      ...new Set(categoryRows.map((row) => row.category).filter(Boolean)),
    ];
    const searchTerm = skuSearch.trim().toLocaleLowerCase();
    const matchesSku = (row) =>
      !searchTerm ||
      [row.code, row.name].some((value) => value?.toLocaleLowerCase().includes(searchTerm));
    const visibleRows = categoryRows.filter(matchesSku);
    const sourceName = sourceKind === 'business' ? 'ai_db.agents_scm_stock_detail_d' : '本地输入';
    const issueColumns = [
      '评估版本',
      '评估月份',
      '统计基月',
      '截止日',
      '月份',
      '基地',
      '产品编码',
      '异常类别',
      '指标',
      '原始值',
      '计算用值',
      '实际处理',
      '来源',
      '原因',
    ];
    const stockIssues = (issuesOpen ? visibleRows : emptyRows)
      .flatMap((row) => {
        const missing = row.missingFields
          .filter((field) => field !== 'transferIn' && field !== 'transferOut')
          .filter(
            (field) => row.prediction != null || ['open', 'inbound', 'remaining'].includes(field),
          );
        return [
          ...(row.dimensionIssue
            ? [
                {
                  月份: month,
                  基地: row.base,
                  产品编码: row.code,
                  异常类别: '分类异常',
                  指标: '产品分类',
                  实际处理: '保留已有数量',
                  来源: '当前产品清单',
                  原因: row.dimensionIssue,
                },
              ]
            : []),
          ...(missing.length
            ? [
                {
                  月份: month,
                  基地: row.base,
                  产品编码: row.code,
                  异常类别: '输入缺项',
                  指标: missing.map((field) => names[fields.indexOf(field)]).join('、'),
                  计算用值: '待补',
                  实际处理: '缺失输入保留待定',
                  来源: sourceName,
                  原因: '未取得有效输入值',
                },
              ]
            : []),
          ...(row.transferIssue
            ? [
                {
                  月份: month,
                  基地: row.base,
                  产品编码: row.code,
                  异常类别: '调拨来源异常',
                  指标: [
                    row.transferIn == null ? '调入计划' : '',
                    row.transferOut == null ? '调出计划' : '',
                  ]
                    .filter(Boolean)
                    .join('、'),
                  原始值: row.transferDate ?? '',
                  计算用值: '待补',
                  实际处理: '保留待补，未按无计划置0',
                  来源: 'ai_db.agents_scm_stock_detail_d',
                  原因: row.transferIssue,
                },
              ]
            : []),
          ...row.inventoryIssues.map((issue) => ({
            月份: month,
            基地: row.base,
            产品编码: row.code,
            异常类别: '负库存',
            指标: issue.metric === 'openingInventory' ? '月初库存' : '预测期末库存',
            原始值: issue.rawValue,
            计算用值: issue.calculationValue,
            实际处理: '逐SKU归0后承接汇总，原始值和不足保留',
            来源:
              sourceKind === 'business'
                ? 'ai_db.agents_scm_stock_detail_d / 库存收支'
                : '本地输入 / 库存收支',
            原因: issue.reason,
          })),
          ...(row.prediction == null
            ? [
                {
                  月份: month,
                  基地: row.base,
                  产品编码: row.code,
                  异常类别: '发货输入待补',
                  指标: '本月预估发货',
                  原始值: JSON.stringify({
                    shipped: row.shipped,
                    prepped: row.prepped,
                    unprepped: row.unprepped,
                    daily3: row.daily3,
                    average: row.average,
                    sourceDays: row.sourceDays,
                    duplicateDays: row.duplicateDays,
                  }),
                  计算用值: row.fin ?? '待补',
                  实际处理:
                    row.fin == null
                      ? '保留待补，未按无发货置0'
                      : '保留人工有效修正，系统预测依据仍待补',
                  来源: sourceName,
                  原因:
                    row.forecastIssue ||
                    `缺失或无效发货依据：${row.missingFields.map((field) => names[fields.indexOf(field)]).join('、') || '原因待核'}`,
                },
              ]
            : []),
        ];
      })
      .map((issue) => ({
        评估版本: draft.name,
        评估月份: draft.month,
        统计基月: month,
        截止日: cutoff,
        ...issue,
      }));
    const aggregate = (children, who) => {
      const inputs = Object.fromEntries(
        inputFields.map((field) => [field, knownSum(children, field)]),
      );
      const forecastRows = children.filter((row) => row.prediction != null);
      const { prediction: _prediction, ...calculation } = derive(
        Object.fromEntries(
          [...inputFields, 'average'].map((field) => [field, knownSum(forecastRows, field)]),
        ),
        passed,
        totalDays,
      );
      return {
        ...calculation,
        ...inputs,
        prediction: knownSum(children, 'prediction'),
        average: knownSum(children, 'average'),
        transferIn: knownSum(children, 'transferIn'),
        transferOut: knownSum(children, 'transferOut'),
        who,
        fin: knownSum(children, 'fin'),
        end: knownSum(children, 'end'),
        calculation,
        missingCounts: Object.fromEntries(
          fields.map((field) => [field, children.filter((row) => row[field] == null).length]),
        ),
        children,
      };
    };
    const groups = bases.map((base) =>
      aggregate(
        categoryRows.filter((row) => row.base === base),
        base,
      ),
    );
    const national = aggregate(categoryRows, '全国合计');
    const updateState = (changes) => update({ shipment: { ...stateRef.current, ...changes } });
    const changeCutoff = (value, cutoffMetadata) => {
      generation.current++;
      controller.current?.abort();
      const byCutoff = { ...state.editsByCutoff };
      const saved = byCutoff[value] ?? {};
      delete byCutoff[value];
      const current = {
        ...state.sourceEdits,
        [activeSource]: { values: state.values, remaining: state.remaining },
      };
      if (
        cutoff &&
        Object.values(current).some(
          (edits) =>
            Object.keys(edits.values ?? {}).length || Object.keys(edits.remaining ?? {}).length,
        )
      )
        byCutoff[cutoff] = current;
      updateState({
        cutoff: value,
        ...(value.startsWith(calculationMonth) ? { calculationCutoff: value } : {}),
        cutoffMetadata,
        business: null,
        editsByCutoff: Object.keys(byCutoff).length ? byCutoff : undefined,
        sourceEdits: saved,
        values: saved[activeSource]?.values ?? {},
        remaining: saved[activeSource]?.remaining ?? {},
      });
      setFormula(null);
    };
    const publishCalculationRead = (status, failure = null) =>
      snapshotCallback.current?.({
        draftId: draft.id,
        month: draft.month,
        shipmentMonth: calculationMonth,
        cutoff: state.calculationCutoff ?? '',
        source: '库存日报统计基月读取',
        sourceKind: 'business',
        status,
        error: failure,
        rows: [],
      });
    const calculationCutoff = state.calculationCutoff?.startsWith(calculationMonth + '-')
      ? state.calculationCutoff
      : cutoff.startsWith(calculationMonth + '-')
        ? cutoff
        : '';
    const usableCalculationSnapshot =
      calculationSnapshot?.draftId === draft.id &&
      calculationSnapshot.month === draft.month &&
      calculationSnapshot.shipmentMonth === calculationMonth &&
      calculationSnapshot.cutoff === calculationCutoff &&
      ['business', 'local-file'].includes(calculationSnapshot.sourceKind) &&
      ['ok', 'partial', 'local-file'].includes(calculationSnapshot.status);
    const separateCalculation = month !== calculationMonth && activeSource === 'business';
    const autoReadDisplay =
      (autoRead && active) || (autoReadCalculation && month === calculationMonth);
    const canLoadCalculation =
      autoReadCalculation && separateCalculation && hasCutoffRange && hasMpsSource();
    react.useEffect(() => {
      if (
        !canLoadCalculation ||
        usableCalculationSnapshot ||
        automaticBasis?.cutoff === calculationCutoff
      )
        return;
      const stop = new AbortController();
      calculationController.current = stop;
      const scope = scopeGeneration.current;
      const current = () => !stop.signal.aborted && scope === scopeGeneration.current;
      publishCalculationRead('loading');
      const load = async () => {
        const date =
          calculationCutoff && calculationCutoff <= calculationThrough
            ? calculationCutoff
            : (
                await readLatestShipmentDate(
                  calculationThrough,
                  stop.signal,
                  calculationShipmentPriority,
                )
              ).date;
        if (!current()) return;
        if (!date) throw Error('统计基月暂无可用发货日期');
        const basis = await readShipmentBusiness(date, stop.signal, calculationShipmentPriority);
        if (!current()) return;
        setAutomaticBasis(basis);
        if (date !== stateRef.current.calculationCutoff) updateState({ calculationCutoff: date });
      };
      void load().catch((failure) => {
        if (current()) publishCalculationRead('failed', failure.message);
      });
      return () => stop.abort();
    }, [canLoadCalculation, draft.id, draft.month, calculationThrough, calculationCutoff]);
    const backgroundBasis =
      separateCalculation && automaticBasis?.cutoff === calculationCutoff ? automaticBasis : null;
    const basisProjection = react.useMemo(
      () =>
        backgroundBasis &&
        projectShipment(
          draft,
          calculationCutoff,
          calculationMonth,
          'business',
          backgroundBasis.rows,
          backgroundBasis.coefficientFacts,
        ),
      [
        draft.products,
        draft.productsRead,
        draft.productRaw,
        calculationCutoff,
        calculationMonth,
        backgroundBasis,
      ],
    );
    const basisEdits = state.editsByCutoff?.[calculationCutoff]?.business;
    react.useEffect(() => {
      if (!backgroundBasis || batch.active) return;
      const { deriveRows } = basisProjection;
      snapshotCallback.current?.({
        draftId: draft.id,
        month: draft.month,
        shipmentMonth: calculationMonth,
        cutoff: calculationCutoff,
        source: `业务来源：ai_db.agents_scm_stock_detail_d，${calculationMonth}-01 至 ${calculationCutoff}`,
        sourceKind: 'business',
        status: backgroundBasis.metadata.partial ? 'partial' : 'ok',
        error: null,
        sourceRows: backgroundBasis.rows,
        sourceRecords: backgroundBasis.sourceRecords,
        rows: deriveRows(basisEdits ?? {}),
        metadata: backgroundBasis.metadata,
        prepareForecast: (changes) => {
          const current = stateRef.current;
          const previous = current.editsByCutoff?.[calculationCutoff] ?? {};
          const edits = applyShipmentForecastChanges(previous.business ?? {}, changes, deriveRows);
          return {
            state: {
              ...current,
              editsByCutoff: {
                ...current.editsByCutoff,
                [calculationCutoff]: { ...previous, business: edits },
              },
            },
            rows: deriveRows(edits),
          };
        },
      });
    }, [
      draft.id,
      draft.month,
      calculationMonth,
      calculationCutoff,
      backgroundBasis,
      basisProjection,
      basisEdits,
      batch.active,
    ]);
    const readLatestDate = async (latest = maxCutoff, synchronize = false) => {
      if (!hasCutoffRange) return;
      if (synchronize) {
        calculationController.current?.abort();
        setAutomaticBasis(null);
      }
      controller.current?.abort();
      const stop = new AbortController();
      controller.current = stop;
      const request = ++generation.current;
      const scope = scopeGeneration.current;
      const valid = () =>
        !stop.signal.aborted && request === generation.current && scope === scopeGeneration.current;
      setBusy(true);
      setError('');
      if (synchronize) publishCalculationRead('loading');
      try {
        const result = await readLatestShipmentDate(latest, stop.signal);
        if (!valid()) return;
        if (result.date === null) {
          setSyncStatus('failed');
          setError('该统计月份暂无可用发货日期，请补齐来源或手动选择截止日');
          if (synchronize) publishCalculationRead('failed', '统计基月暂无可用发货日期');
          return;
        }
        if (result.date !== cutoff) changeCutoff(result.date, result.metadata);
        if (synchronize) setPendingCalculationRead(result.date);
      } catch (failure) {
        if (valid()) {
          setSyncStatus('failed');
          setError('读取最新发货日期失败：' + failure.message);
          if (synchronize) publishCalculationRead('failed', failure.message);
        }
      } finally {
        if (valid()) setBusy(false);
      }
    };
    react.useEffect(() => {
      if ((!active && !autoReadDisplay) || cutoff) return;
      void readLatestDate();
      return () => controller.current?.abort();
    }, [active, autoReadDisplay, draft.id, minCutoff, maxCutoff, cutoff]);
    const selectSource = (next) => {
      updateState({
        activeSource: next,
        sourceEdits: {
          ...state.sourceEdits,
          [activeSource]: { values: state.values, remaining: state.remaining },
        },
        values: state.sourceEdits?.[next]?.values ?? {},
        remaining: state.sourceEdits?.[next]?.remaining ?? {},
      });
      setFormula(null);
    };
    const source =
      sourceKind === 'demo'
        ? '演示数据 · 原型2026-09汤圆645条；四输入按原型确定性映射，剩余入库按本月生产入库÷22×8四舍五入演示推算'
        : sourceKind === 'local-file'
          ? `本地CSV：${state.file}`
          : business
            ? `业务来源：ai_db.agents_scm_stock_detail_d，${month}-01 至 ${cutoff}`
            : '数仓输入尚未同步';
    react.useEffect(() => {
      if (batch.active) return;
      snapshotCallback.current?.({
        draftId: draft.id,
        month: draft.month,
        shipmentMonth: month,
        cutoff,
        source,
        sourceKind,
        error: cutoffIssue ?? (syncStatus === 'failed' ? error : null),
        status: busy
          ? 'loading'
          : cutoffIssue || syncStatus === 'failed'
            ? 'failed'
            : sourceKind === 'business'
              ? business.metadata.partial
                ? 'partial'
                : 'ok'
              : sourceKind,
        sourceRows,
        sourceRecords: sourceKind === 'business' ? business.sourceRecords : sourceRows,
        rows,
        prepareForecast: (changes) => prepareForecast(changes),
        metadata: sourceKind === 'business' ? business.metadata : null,
      });
    }, [
      draft.id,
      draft.month,
      month,
      cutoff,
      source,
      sourceKind,
      sourceRows,
      rows,
      business,
      batch.active,
      busy,
      syncStatus,
      error,
      cutoffIssue,
    ]);
    const sync = async () => {
      if (!cutoff) return;
      controller.current?.abort();
      const stop = new AbortController();
      controller.current = stop;
      const request = ++generation.current;
      const scope = scopeGeneration.current;
      const valid = () =>
        !stop.signal.aborted && request === generation.current && scope === scopeGeneration.current;
      setBusy(true);
      setSyncStatus('loading');
      setError('');
      updateState({
        business: null,
        businessAttempted: true,
        activeSource: 'business',
        ...(activeSource === 'local-file'
          ? {
              sourceEdits: {
                ...state.sourceEdits,
                [activeSource]: { values: state.values, remaining: state.remaining },
              },
              values: state.sourceEdits?.business?.values ?? {},
              remaining: state.sourceEdits?.business?.remaining ?? {},
            }
          : {}),
      });
      try {
        const nextBusiness = await readShipmentBusiness(
          cutoff,
          stop.signal,
          month === calculationMonth ? calculationShipmentPriority : undefined,
        );
        if (!valid()) return;
        updateState({
          ...(month === calculationMonth ? { calculationCutoff: cutoff } : {}),
          business: nextBusiness,
        });
        setSyncStatus('ok');
      } catch (failure) {
        if (!valid()) return;
        setSyncStatus('failed');
        setError(
          /AGENT_ACCESS_DENIED|PERMISSION_DENIED|RESOURCE_NOT_IN_DATASET/.test(failure.message)
            ? '当前账号暂无库存日计划数据权限'
            : failure.message,
        );
      } finally {
        if (valid()) setBusy(false);
      }
    };
    react.useEffect(() => {
      if (pendingCalculationRead === cutoff && cutoff && hasMpsSource()) {
        setPendingCalculationRead(null);
        void sync();
      }
    }, [pendingCalculationRead, cutoff]);
    react.useEffect(() => {
      if (
        pendingCalculationRead ||
        !autoReadDisplay ||
        !cutoff ||
        activeSource !== 'business' ||
        business ||
        !hasMpsSource()
      )
        return;
      void sync();
    }, [autoReadDisplay, draft.id, month, cutoff, activeSource]);
    const explain = (row, field, who) => setFormula({ row, field, who });
    const calculate = (currentState) => {
      const currentRows = deriveRows(currentState);
      return {
        rows: currentRows,
        groups: bases.map((base) =>
          aggregate(
            currentRows.filter((row) => row.base === base),
            base,
          ),
        ),
        national: aggregate(currentRows, '全国合计'),
      };
    };
    const changeState = (currentState, row, kind, target, who, currentGroups) => {
      if (target === null) {
        if (kind === 'remaining') {
          const remaining = { ...currentState.remaining };
          const keys = new Set(row.children.map(keyOf));
          const values = Object.fromEntries(
            Object.entries(remaining[who]?.values ?? {}).filter(([key]) => !keys.has(key)),
          );
          if (Object.keys(values).length) remaining[who] = { ...remaining[who], values };
          else delete remaining[who];
          return { ...currentState, remaining };
        }
        const values = { ...currentState.values };
        for (const child of row.children ?? [row]) delete values[keyOf(child)];
        return { ...currentState, values };
      }
      if (!Number.isSafeInteger(target)) throw Error('请输入安全范围内的整数件数。');
      if (kind === 'remaining') {
        if (target < 0) throw Error('剩余天数入库须大于或等于0。');
        const allocated = allocate(
          row.children.map((child) => child.inputRemaining),
          target,
        );
        return {
          ...currentState,
          remaining: {
            ...currentState.remaining,
            [who]: {
              values: {
                ...currentState.remaining?.[who]?.values,
                ...Object.fromEntries(
                  row.children.map((child, index) => [keyOf(child), allocated[index]]),
                ),
              },
              source: `${who}基地覆盖${target}件，按原剩余入库权重重摊并补偿舍入残差`,
            },
          },
        };
      }
      const values = { ...currentState.values };
      const assign = (children, amount, label) =>
        assignShipmentForecast(values, children, amount, label);
      if (who === '全国合计') {
        const present = currentGroups.filter((group) => group.children.length);
        if (!present.length) throw Error('当前月份无明细，无法重摊。');
        const amounts = allocate(
          present.map((group) => group.fin),
          target,
        );
        present.forEach((group, index) =>
          assign(
            group.children,
            amounts[index],
            `全国合计覆盖${target}件→${group.who}分配${amounts[index]}件，按当前有效量两级重摊并补偿舍入残差`,
          ),
        );
      } else if (row.children)
        assign(
          row.children,
          target,
          `${who}覆盖${target}件，按明细当前有效量重摊并补偿舍入残差，替换单品覆盖`,
        );
      else values[keyOf(row)] = { value: target, source: '单品人工覆盖', previous: row.fin };
      return { ...currentState, values };
    };
    const prepareForecast = (changes) => {
      const currentState = stateRef.current;
      const initial =
        currentState.cutoff === cutoff
          ? currentState
          : {
              ...state,
              editsByCutoff: {
                ...currentState.editsByCutoff,
                [currentState.cutoff]: {
                  ...currentState.sourceEdits,
                  [currentState.activeSource ?? 'business']: {
                    values: currentState.values,
                    remaining: currentState.remaining,
                  },
                },
              },
            };
      const next = applyShipmentForecastChanges(initial, changes, deriveRows);
      return { state: next, rows: deriveRows(next) };
    };
    const applyBatch = (entries) => {
      if (!entries.length) return;
      let next = stateRef.current;
      for (const entry of [...entries].sort((a, b) => a.meta.level - b.meta.level)) {
        const current = calculate(next);
        let row =
          entry.meta.level === 0
            ? current.national
            : entry.meta.level === 1
              ? current.groups.find((row) => row.who === entry.meta.who)
              : current.rows.find(
                  (row) => row.base === entry.meta.base && row.code === entry.meta.code,
                );
        if (row?.children && entry.meta.keys)
          row = aggregate(
            row.children.filter((child) => entry.meta.keys.includes(keyOf(child))),
            row.who,
          );
        if (!row) throw Error(`${entry.label} 已不在当前范围，请取消后重新调整。`);
        try {
          next = changeState(
            next,
            row,
            entry.meta.kind,
            entry.value,
            entry.meta.who,
            current.groups.map((group) =>
              entry.meta.keys
                ? aggregate(
                    group.children.filter((child) => entry.meta.keys.includes(keyOf(child))),
                    group.who,
                  )
                : group,
            ),
          );
        } catch (failure) {
          throw Error(`${entry.label}：${failure.message}`);
        }
      }
      update({ shipment: next });
    };
    react.useLayoutEffect(() => {
      batch.commit.current = applyBatch;
      return () => {
        if (batch.commit.current === applyBatch) batch.commit.current = null;
      };
    }, [batch.commit, applyBatch]);
    const read = async (file) => {
      controller.current?.abort();
      const request = ++generation.current;
      const scope = scopeGeneration.current;
      const valid = () => request === generation.current && scope === scopeGeneration.current;
      setBusy(true);
      try {
        if (file.size > 5 * 1024 * 1024) throw Error('文件超过5 MiB上限，未读取任何行。');
        const text = await file.text();
        let records;
        try {
          records = parseCsv(text, [...columns, '近30天日均发货']);
        } catch (failure) {
          if (!failure.message.startsWith('表头必须依模板排列：')) throw failure;
          records = parseCsv(text, columns);
        }
        const seen = new Set();
        const parsed = records.map((record, index) => {
          const row = {
            month: record['月份'],
            base: record['基地'],
            code: record['产品编码'],
            name: record['产品名称'],
            category: record['大类'],
            series: record['系列'],
            group: record['物料组'],
          };
          if (
            ![...bases, '濮阳'].includes(row.base) ||
            !row.code ||
            !row.name ||
            !row.category ||
            !row.series ||
            !row.group
          )
            throw Error(`第${index + 2}行基地或产品维度不完整，未替换原输入。`);
          const key = JSON.stringify([row.month, row.base, row.code]);
          if (seen.has(key)) throw Error(`第${index + 2}行同月同基地产品重复，未替换原输入。`);
          seen.add(key);
          [...inputFields, 'average'].forEach((field) => {
            const value = record[names[fields.indexOf(field)]] ?? '';
            if (value !== '' && (!/^\d+(\.\d+)?$/.test(value) || finite(Number(value)) == null))
              throw Error(
                `第${index + 2}行${names[fields.indexOf(field)]}须为非负有限数或留空，未替换原输入。`,
              );
            row[field] = value === '' ? null : Number(value);
          });
          return row;
        });
        for (const field of [...inputFields, 'average'])
          if (finite(parsed.reduce((sum, row) => sum + (row[field] ?? 0), 0)) == null)
            throw Error('输入合计超出安全范围，未替换原输入。');
        if (!valid()) return;
        updateState({
          rows: parsed,
          file: file.name,
          activeSource: 'local-file',
          values: {},
          remaining: {},
        });
        setError('');
        setExpanded([]);
        setFormula(null);
      } catch (failure) {
        if (valid()) setError(failure.message);
      } finally {
        if (valid()) setBusy(false);
      }
    };
    const download = () => {
      const outputColumns = [
        '评估版本',
        '评估月份',
        '截止日',
        '已过天数',
        '本月天数',
        ...columns,
        '近30天日均发货',
        '应用系数前预测量',
        '实际应用发运系数',
        '发运系数说明',
        '本月预测量',
        '整月预估发货',
        '调入计划',
        '调出计划',
        '调拨计划来源',
        '预计月末结存',
        '原始月初库存',
        '原始预计月末结存',
        '库存归零处理',
        '输入来源',
        '调整来源',
        '剩余入库来源',
        '缺失输入',
        '发运速度来源',
        '发运速度',
        '预估待补原因',
        '发货来源日期异常',
        '物料组名称',
        '分类待补原因',
      ];
      downloadCsv(
        `MPS-${draft.month}-${draft.id}-发货与结存.csv`,
        outputColumns,
        visibleRows.map((row) => ({
          评估版本: draft.name,
          评估月份: draft.month,
          截止日: cutoff,
          已过天数: passed,
          本月天数: totalDays,
          月份: month,
          基地: row.base,
          产品编码: row.code,
          产品名称: row.name,
          大类: row.category,
          系列: row.series,
          物料组: row.group,
          ...Object.fromEntries(
            inputFields.map((field) => [names[fields.indexOf(field)], row[field] ?? '']),
          ),
          近30天日均发货: row.average ?? '',
          应用系数前预测量: row.basePrediction ?? '',
          实际应用发运系数: row.basePrediction == null ? '' : row.shipmentFactor,
          发运系数说明: row.coefficientReason,
          本月预测量: row.prediction ?? '',
          整月预估发货: row.fin ?? '',
          调入计划: row.transferIn ?? '',
          调出计划: row.transferOut ?? '',
          调拨计划来源: `ai_db.agents_scm_stock_detail_d；纠偏优先，初版回退；调入：${row.transferInSource ?? '来源未同步'}；调出：${row.transferOutSource ?? '来源未同步'}`,
          预计月末结存: row.end ?? '',
          原始月初库存: row.rawOpen ?? '',
          原始预计月末结存: row.rawEnd ?? '',
          库存归零处理: row.inventoryIssues.map((issue) => issue.reason).join('；'),
          输入来源: source,
          调整来源: row.adjustment ? JSON.stringify(row.adjustment) : '默认单品预测值',
          剩余入库来源:
            row.remainingSource ??
            (sourceKind === 'demo'
              ? '演示推算：生产入库÷22×8，四舍五入'
              : sourceKind === 'local-file'
                ? '本地CSV；BI排产未核齐'
                : passed <= 1
                  ? '截止日日号减1为0，入库日均和剩余入库待补'
                  : `截止日累计生产入库÷${passed - 1}×${totalDays - passed}，逐SKU四舍五入`),
          缺失输入: row.missingFields.map((field) => names[fields.indexOf(field)]).join('、'),
          发运速度来源: row.paceSource,
          发运速度: row.pace,
          预估待补原因: row.forecastIssue,
          发货来源日期异常: row.sourceDateIssue,
          物料组名称: row.groupName ?? '',
          分类待补原因: row.dimensionIssue ?? '',
        })),
      );
    };
    const contextFields = [
      'base',
      'code',
      ...inputFields,
      'average',
      'pace',
      'paceSource',
      'forecastIssue',
      'sourceDateIssue',
      'prediction',
      'fin',
      'transferIn',
      'transferOut',
      'end',
    ];
    const contextRows = [];
    let contextLength = 0;
    for (const row of rows) {
      const values = contextFields.map((field) => row[field]);
      contextLength += JSON.stringify(values).length + 1;
      if (contextLength > 70000) break;
      contextRows.push(values);
    }
    useMpsPart(
      react,
      'ship',
      {
        scope: 'local-check-only',
        draft: { id: draft.id, name: draft.name, month: draft.month },
        month,
        cutoff,
        passedDays: passed,
        totalDays,
        unit: '件',
        source,
        businessSave: 'not-connected',
        nextStage: 'shared-snapshot',
        sourceKind,
        metadata: sourceKind === 'business' ? business.metadata : null,
        rowFields: contextFields,
        rows: contextRows,
        rowCount: rows.length,
        omittedRows: rows.length - contextRows.length,
        fullDetail: '通过下载明细获取全部有效逐SKU输入、结存及覆盖来源',
        bases: groups.map(({ children: _children, ...group }) => group),
        totals: { ...national, children: undefined },
        carryToMonth: draft.month,
        retention: 'memory-only',
      },
      '本月预估发货',
      active,
    );
    const numberCell = (row, field, who) => {
      const editable =
        !row.readOnly &&
        (field === 'fin' || (field === 'remaining' && row.children && who !== '全国合计'));
      return h(
        'td',
        {
          key: field,
          className: row[field] < 0 ? 'sp-negative' : undefined,
        },
        editable
          ? h(Field, {
              batch,
              id: `${who}:${field}`,
              meta: {
                who,
                kind: field,
                level: who === '全国合计' ? 0 : row.children ? 1 : 2,
                base: row.base,
                code: row.code,
                keys: row.children?.map(keyOf),
              },
              value: row[field],
              integer: true,
              placeholder: '待定',
              min: field === 'fin' ? null : 0,
              label: `${who} ${names[fields.indexOf(field)]}`,
              format: display,
              editFormat: (value) => String(Math.round(value)),
              onExplain: () => explain(row, field, who),
            })
          : h(
              'button',
              {
                className: 'sp-number',
                'aria-label': `${who} ${names[fields.indexOf(field)]} 计算过程`,
                onClick: () => explain(row, field, who),
              },
              display(row[field], field),
            ),
      );
    };
    const renderRow = (row, who, label, className) =>
      h(
        'tr',
        { key: JSON.stringify([className, who, row.category, row.group]), className },
        h('th', { scope: 'row' }, label),
        ...fields.map((field) => numberCell(row, field, who)),
      );
    const toggleLabel = (id, who, label, count, descendants = []) =>
      h(
        react.Fragment,
        {},
        h(
          'button',
          {
            className: 'sp-toggle',
            'aria-label': `${searchTerm || expanded.includes(id) ? '收起' : '展开'} ${who}`,
            'aria-expanded': Boolean(searchTerm) || expanded.includes(id),
            disabled: Boolean(searchTerm),
            onClick: () =>
              setExpanded((current) =>
                current.includes(id)
                  ? current.filter((key) => key !== id)
                  : [...new Set([...current, id, ...descendants])],
              ),
          },
          h(
            'svg',
            {
              width: 12,
              height: 12,
              viewBox: '0 0 12 12',
              fill: 'none',
              stroke: 'currentColor',
              style: {
                transform: searchTerm || expanded.includes(id) ? 'rotate(90deg)' : undefined,
              },
              'aria-hidden': true,
            },
            h('path', { d: 'M4 2l4 4-4 4' }),
          ),
        ),
        h('span', { className: 'sp-hierarchy-name', title: label }, label),
        h('span', { className: 'sp-count' }, `${count} 个单品`),
      );
    const skuLabel = (row) =>
      h(
        react.Fragment,
        {},
        h(
          'span',
          { className: 'sp-code' },
          h(createTablePresentation(react).Code, { row, participants: row.children }),
        ),
        h(
          'span',
          {
            className: 'sp-product-name',
            title: [row.name, row.category, row.series, row.group, row.groupName]
              .filter(Boolean)
              .join(' · '),
          },
          row.name || '产品名称未提供',
        ),
      );
    const groupLabel = (value, children) => {
      const names = [...new Set(children.map((row) => row.groupName).filter(Boolean))];
      return sourceKind === 'business' && children[0].group
        ? `${value} · ${
            names.length > 1
              ? '名称冲突'
              : children.every((row) => row.groupName) && names.length === 1
                ? names[0]
                : '名称未提供'
          }`
        : value;
    };
    const renderHierarchy = (parent, scope, path, levels, showAll = false) => {
      const id = JSON.stringify([scope, ...path]);
      if (!showAll && !searchTerm && !expanded.includes(id)) return;
      const dimension = ['category', 'group'][path.length];
      if (dimension) {
        const partition = new Map();
        for (const row of parent.children.filter(matchesSku)) {
          const name = row[dimension] || (dimension === 'category' ? '大类未提供' : '物料组未提供');
          if (!partition.has(name)) partition.set(name, []);
          partition.get(name).push(row);
        }
        for (const [value, children] of [...partition].sort(([left], [right]) =>
          compareBusinessValues(dimension, left, right),
        )) {
          const name = dimension === 'group' ? groupLabel(value, children) : value;
          const nextPath = [...path, name];
          const who = [scope, ...nextPath].join(' ');
          const group = {
            ...aggregate(children, who),
            category: nextPath[0],
            group: nextPath[1],
            readOnly: true,
          };
          levels[path.length].push(
            showAll
              ? { ...group, base: scope, level: dimension === 'category' ? '大类' : '物料组' }
              : renderRow(
                  group,
                  who,
                  toggleLabel(
                    JSON.stringify([scope, ...nextPath]),
                    who,
                    name,
                    scope === '全国合计'
                      ? new Set(children.map((row) => row.code)).size
                      : children.length,
                    dimension === 'category'
                      ? [...Map.groupBy(children, (row) => row.group || '物料组未提供')].map(
                          ([value, rows]) =>
                            JSON.stringify([scope, ...nextPath, groupLabel(value, rows)]),
                        )
                      : [],
                  ),
                  `sp-level-${nextPath.length}`,
                ),
          );
          renderHierarchy(group, scope, nextPath, levels, showAll);
        }
        return;
      }
      const byCode = new Map();
      if (scope === '全国合计')
        for (const row of parent.children) {
          if (!byCode.has(row.code)) byCode.set(row.code, []);
          byCode.get(row.code).push(row);
        }
      const skus =
        scope === '全国合计'
          ? [...byCode].map(([code, children]) => ({
              ...Object.fromEntries(
                ['code', 'name', 'category', 'series', 'group', 'groupName'].map((key) => [
                  key,
                  children[0][key],
                ]),
              ),
              ...aggregate(children, `${scope} ${code}`),
              readOnly: true,
            }))
          : parent.children;
      const children = skus.filter(matchesSku).sort(compareBusinessRows);
      if (showAll) {
        levels[2].push(...children.map((row) => ({ ...row, base: scope, level: 'SKU' })));
        return;
      }
      levels[2].push(
        ...children.map((row) => renderRow(row, `${scope} ${row.code}`, skuLabel(row), 'sp-sku')),
      );
    };
    const shipmentHierarchy = (parent, scope, showAll = false) => {
      const levels = [[], [], []];
      renderHierarchy(parent, scope, [], levels, showAll);
      return levels.flat();
    };
    const downloadHierarchy = () =>
      downloadCsv(
        `MPS-${draft.month}-发货汇总及明细.csv`,
        [
          '评估月份',
          '统计月',
          '截止日',
          '基地',
          '粒度',
          '大类',
          '物料组',
          '产品编码',
          '产品名称',
          ...names,
        ],
        [national, ...groups].flatMap((group) => {
          const scope = group.who;
          return [
            { ...group, base: scope, level: '合计' },
            ...shipmentHierarchy(group, scope, true),
          ].map((row) => ({
            评估月份: draft.month,
            统计月: month,
            截止日: cutoff,
            基地: row.base,
            粒度: row.level,
            大类: row.category,
            物料组: row.group,
            产品编码: row.code,
            产品名称: row.name,
            ...Object.fromEntries(fields.map((field, index) => [names[index], row[field]])),
          }));
        }),
      );
    const formulas =
      formula &&
      (() => {
        const { row, field, who } = formula;
        const calculation = row.children && field === 'shipDays' ? row.calculation : row;
        const raw = (key) => (calculation[key] == null ? '待定' : String(calculation[key]));
        const fallback =
          calculation.paceSource === '近30天日均'
            ? `近三天日均不大于0，使用近30天日均：${raw('average')}。`
            : calculation.confirmedNoShipment
              ? '本月已发货、已备、未备均确认是0，整月预估为0。'
              : calculation.forecastIssue;
        const expressions = {
          shipDays: [
            '发运天数 = (已备 + 未备) ÷ 发运速度；近三天日均不大于0时使用正的近30天日均；两项日均确认均不大于0并采用数量合计时，发运天数为0；无待发订单时为0',
            calculation.usedQuantityFallback
              ? `近三天日均 ${raw('daily3')}、近30天日均 ${raw('average')}，采用已发已备未备合计，发运天数为0。`
              : `${raw('prepped')} + ${raw('unprepped')}；采用速度${raw('pace')}；${fallback}`,
          ],
          average: [
            '近30天日均发货 = 截止日库存日报的 avg_30d_send 原值；汇总按单品求和',
            sourceKind === 'business'
              ? `${cutoff}，ai_db.agents_scm_stock_detail_d；表内取值 ${raw('average')}`
              : '当前输入未提供近30天日均发货，保持待定。',
          ],
          prediction: row.children
            ? [
                '本月预测量 = 各基地、各SKU修正后的系统预测量之和',
                `逐基地、逐SKU修正后预测量求和 = ${display(row.prediction)} 件。`,
              ]
            : calculation.usedQuantityFallback
              ? [
                  '两项日均确认均不大于0时，本月预测量 = 本月已发货 + 已备 + 未备',
                  `${raw('shipped')} + ${raw('prepped')} + ${raw('unprepped')} = ${raw('prediction')} 件。`,
                ]
              : [
                  '原预测量 = 预测日均 × max(0,总天数 − 已过天数 − 发运天数) + 已发货 + 已备 + 未备，四舍五入为件',
                  `(${calculation.hold ?? '待定'} ÷ (${passed} + ${calculation.shipDays ?? '待定'})) × max(0, ${totalDays} − ${passed} − ${calculation.shipDays ?? '待定'}) + ${calculation.hold ?? '待定'}；预测日均${raw('forecastAverage')}，中间值不舍入。${fallback}`,
                ],
          fin: [
            '整月预估发货 = 单品有效值之和；单品默认预测值，人工覆盖按当前有效权重重摊并补偿残差',
            row.adjustment
              ? JSON.stringify(row.adjustment)
              : row.children
                ? '下级有效值求和；重摊后单品覆盖被替换，单品后改仅改变该行'
                : '默认单品预测值',
          ],
          inbound: [
            sourceKind === 'business'
              ? '本月生产入库 = 月初至截止日库存日报的 produce_in_qty 逐日合计，保留负数冲销；重复日或缺值时待定'
              : '本月生产入库 = 当前输入原值',
            `${cutoff}；表内取值 ${raw('inbound')}`,
          ],
          remaining: [
            '剩余天数入库 = 单品入库日均 × 剩余天数；基地覆盖按明细原剩余入库权重重摊并补偿残差',
            row.remainingSource ??
              (sourceKind === 'demo'
                ? '演示推算：本月生产入库 ÷ 22 × 8，逐SKU四舍五入'
                : sourceKind === 'business'
                  ? passed <= 1
                    ? '截止日日号减1为0，入库日均和剩余入库待补'
                    : `${raw('inbound')} ÷ ${passed - 1} × ${totalDays - passed}，逐SKU四舍五入`
                  : '本地CSV输入，BI排产未核齐'),
          ],
          transferIn: [
            '调入计划 = 相同统计月、基地及SKU截止日前最新库存日报快照；纠偏优先于初版，完整读取后无该组合记录取0，字段为空待定',
            `${raw('transferIn')} 件；${row.transferInSource ?? '逐SKU来源汇总；未同步来源的单品保留待定'}`,
          ],
          transferOut: [
            '调出计划 = 相同统计月、基地及SKU截止日前最新库存日报快照；纠偏优先于初版，完整读取后无该组合记录取0，字段为空待定',
            `${raw('transferOut')} 件；${row.transferOutSource ?? '逐SKU来源汇总；未同步来源的单品保留待定'}`,
          ],
          end: [
            row.children
              ? '预计月末结存 = 已有单品结存之和；缺项单品保留待定'
              : '预计月末结存 = max(0, 计算用月初库存 + 本月生产入库 + 剩余天数入库 + 调入计划 − 调出计划 − 整月预估发货)；负月初库存先归0',
            row.children
              ? `${row.children.length - row.missingCounts.end}个可计算单品结存求和 = ${raw('end')}`
              : `${raw('open')} + ${raw('inbound')} + ${raw('remaining')} + ${raw('transferIn')} − ${raw('transferOut')} − ${raw('fin')}；原始月初库存${raw('rawOpen')}；归零前结存${raw('rawEnd')}；计算用结存${raw('end')}`,
          ],
        };
        const [expression, substitution] = expressions[field] ?? [
          `${names[fields.indexOf(field)]} = ${row.children ? '下级同字段已有数据之和' : '当前月份输入原值'}`,
          `表内取值 ${raw(field)}`,
        ];
        return h(
          Dialog,
          {
            title: `计算过程 · ${who} · ${names[fields.indexOf(field)]}`,
            close: () => setFormula(null),
            footer: h('button', { onClick: () => setFormula(null) }, '关闭'),
          },
          h('div', { className: 'sp-formula' }, expression),
          row.children &&
            h(
              'p',
              {},
              field === 'shipDays'
                ? `按可计算的${row.children.filter((child) => child.prediction != null).length}/${row.children.length}个单品重算，缺失输入未补零。`
                : `已汇总${row.children.length - row.missingCounts[field]}/${row.children.length}个单品，待定单品未补零。`,
            ),
          h(
            'table',
            { className: 'sp-formula-inputs' },
            h(
              'tbody',
              {},
              ...(
                {
                  shipDays: ['prepped', 'unprepped', 'daily3', 'average'],
                  average: ['average'],
                  prediction: row.children ? [] : ['shipped', 'prepped', 'unprepped', 'shipDays'],
                  fin: ['prediction', 'fin'],
                  remaining: ['inbound', 'remaining'],
                  end: ['open', 'inbound', 'remaining', 'transferIn', 'transferOut', 'fin'],
                }[field] ?? [field]
              ).map((key) =>
                h(
                  'tr',
                  { key },
                  h('td', {}, names[fields.indexOf(key)]),
                  h('td', {}, display(calculation[key], key)),
                ),
              ),
              h('tr', {}, h('td', {}, '计算'), h('td', {}, substitution)),
            ),
          ),
          field === 'prediction' &&
            !row.children &&
            !row.usedQuantityFallback &&
            row.basePrediction != null &&
            h(
              'p',
              {},
              `原预测 ${display(row.basePrediction)} 件 × 发运系数 ${displayFactor(row.shipmentFactor)}，四舍五入为 ${display(row.prediction)} 件。${row.coefficientReason ? `${row.coefficientReason}。` : ''}`,
            ),
          h(
            'div',
            { className: 'sp-formula-result' },
            h('span', {}, '结果'),
            h(
              'b',
              {},
              `${display(row[field], field)}${field === 'shipDays' ? '天' : field === 'average' || field === 'daily3' ? '件/天' : '件'}`,
            ),
          ),
          row[field] == null && h('p', {}, '输入缺失或分母为0且存在订单，结果待定；未补零。'),
          row.children &&
            ['fin', 'remaining', 'end'].includes(field) &&
            h(
              'details',
              {},
              h('summary', {}, '下级求和与调整来源'),
              ...(who === '全国合计'
                ? groups.filter((group) => group.children.length)
                : row.children.slice(0, 12)
              ).map((child, index) =>
                h(
                  'p',
                  { key: index },
                  `${child.who ?? `${child.base} ${child.code}`}：${display(child[field])}；${field === 'remaining' ? (child.remainingSource ?? '原输入或基地重摊，完整来源见下载明细') : (child.adjustment?.source ?? (child.children ? '基地下级有效值求和' : '默认单品预测值'))}`,
                ),
              ),
              who !== '全国合计' &&
                row.children.length > 12 &&
                h(
                  'p',
                  {},
                  `另有${row.children.length - 12}条未展开，完整输入与调整来源见下载明细。`,
                ),
            ),
          row.inventoryIssues?.length > 0 &&
            h(
              'p',
              {},
              row.inventoryIssues
                .map((issue) => `${issue.reason}；原始值${issue.rawValue}，计算用值0`)
                .join('；'),
            ),
        );
      })();
    return h(
      'section',
      { hidden: !active, className: 'sp-page', 'aria-label': '发货本地核对' },
      h('p', {}, `当前展示月 ${month}；评估所需统计基月 ${calculationMonth}。`),
      h(
        'p',
        { role: 'status', 'aria-label': '计算快照状态' },
        usableCalculationSnapshot
          ? `${calculationSnapshot.cutoff} 快照已进入评估。${calculationSnapshot.rows.length} 条基地 SKU；发货待补 ${calculationSnapshot.rows.filter((row) => row.fin == null).length} 条，预计月末结存待补 ${calculationSnapshot.rows.filter((row) => row.end == null).length} 条。`
          : `${calculationMonth} 计算快照尚未取得或已失效。${calculationSnapshot?.shipmentMonth === calculationMonth ? (calculationSnapshot.error ?? '') : ''}`,
      ),
      h(
        'button',
        {
          disabled: busy || batch.active || !hasCutoffRange || !hasMpsSource(),
          onClick: () => readLatestDate(calculationThrough, true),
        },
        `读取 ${calculationMonth} 计算快照`,
      ),
      h(
        'div',
        { className: 'sp-parameters' },
        h('span', { className: 'sp-parameter-label' }, '算法参数'),
        h('span', {}, '已过天数 ', h('b', {}, cutoff ? `${passed} 天` : '待定')),
        h(
          'span',
          {},
          '本月共计天数 ',
          h('b', {}, cutoff || hasCutoffRange ? `${totalDays} 天` : '待定'),
        ),
        h('span', { className: 'sp-spacer' }),
        h(
          'label',
          {},
          '数据截止',
          h('input', {
            type: 'date',
            'aria-label': '数据截止日',
            value: cutoff,
            min: minCutoff,
            max: maxCutoff,
            disabled: !hasCutoffRange || batch.active,
            onChange: ({ target }) => {
              const value = target.value;
              if (!value || value === cutoff || !target.validity.valid) return;
              setPendingCalculationRead(null);
              changeCutoff(value);
            },
          }),
        ),
        cutoffIssue && h('span', { role: 'status' }, cutoffIssue),
        hasCutoffRange &&
          !cutoff &&
          h(
            'button',
            { disabled: busy, onClick: () => readLatestDate() },
            busy ? '读取最新日期中…' : '读取最新可用日期',
          ),
        (state.rows != null || state.businessAttempted || business) &&
          h(
            'label',
            {},
            '发货数据来源',
            h(
              'select',
              {
                'aria-label': '发货数据来源',
                value: activeSource,
                disabled: busy || batch.active,
                onChange: (event) => selectSource(event.target.value),
              },
              h('option', { value: 'business' }, '实际发货'),
              h('option', { value: 'local-file', disabled: state.rows == null }, '本地CSV'),
            ),
          ),
        h('span', {}, '单位 件'),
      ),
      h(
        'div',
        { className: 'dc-card sp-card', onKeyDown: batch.keyDown },
        h(
          'div',
          { className: 'dc-card-head sp-toolbar' },
          h('h3', {}, '本月预估发货'),
          h('input', {
            'aria-label': '搜索发货单品',
            placeholder: '搜索编码或名称',
            value: skuSearch,
            onChange: (event) => {
              setSkuSearch(event.target.value);
            },
          }),
          sourceKind === 'demo' && h('span', { className: 'dc-status' }, '演示数据'),
          h(
            'span',
            { className: 'dc-status' },
            sourceKind === 'business'
              ? '业务来源'
              : sourceKind === 'local-file'
                ? '本地文件'
                : '待同步',
          ),
          h(
            'span',
            { className: 'sp-shipped' },
            '本月已发 ',
            h('b', {}, display(national.shipped)),
            ' 件',
          ),
          h('span', { className: 'sp-spacer' }),
          h(Actions, {
            batch,
            disabled: busy || !rows.length,
            hint: '调拨计划由库存日报读取，整月预估发货和基地剩余入库可调整',
          }),
          batch.active &&
            (Object.keys(state.values ?? {}).length > 0 ||
              Object.keys(state.remaining ?? {}).length > 0) &&
            h(
              'button',
              {
                disabled:
                  !Object.keys(state.values ?? {}).length &&
                  !Object.keys(state.remaining ?? {}).length,
                onClick: () => {
                  batch.replace(
                    Object.fromEntries([
                      [
                        '全国合计:fin',
                        {
                          label: '全国合计 整月预估发货',
                          text: '',
                          meta: { who: '全国合计', kind: 'fin', level: 0 },
                        },
                      ],
                      ...groups.map((group) => [
                        `${group.who}:remaining`,
                        {
                          label: `${group.who} 剩余天数入库`,
                          text: '',
                          meta: { who: group.who, kind: 'remaining', level: 1 },
                        },
                      ]),
                    ]),
                  );
                  setError('');
                  setFormula(null);
                },
              },
              '重置',
            ),
        ),
        (busy || syncStatus !== 'failed' || activeSource !== 'business') &&
          h('p', { role: 'status' }, busy ? '正在读取或校验输入…' : source),
        h(
          'p',
          { className: 'dc-card-note' },
          `${month}调拨计划取库存日报截止日前最新适用快照，优先用纠偏计划，再用初版计划。完整读取后确认无该基地SKU记录时按0。汇总包含全部明细，下载按当前单品搜索范围提供明细。`,
        ),
        searchTerm && !visibleRows.length && h('p', { role: 'status' }, '主表中没有匹配的单品'),
        coefficientCategories.length > 0 &&
          h(
            'details',
            { className: 'sp-method' },
            h('summary', {}, '大类发运系数'),
            coefficientPeriods?.elapsed &&
              h(
                'p',
                {},
                `按 BI 发运日期统计。上月已过区间 ${coefficientPeriods.elapsed.start} 至 ${coefficientPeriods.elapsed.end}（${coefficientPeriods.elapsed.days} 天），未过区间 ${coefficientPeriods.remaining.start} 至 ${coefficientPeriods.remaining.end}（${coefficientPeriods.remaining.days} 天）。`,
              ),
            h(
              'div',
              {
                className: 'dc-table-scroll',
                tabIndex: 0,
                role: 'region',
                'aria-label': '大类发运系数滚动区域',
              },
              h(
                'table',
                { 'aria-label': '大类发运系数' },
                h(
                  'thead',
                  {},
                  h(
                    'tr',
                    {},
                    ...[
                      '大类',
                      '已过区间发货量（件）',
                      '未过区间发货量（件）',
                      '系数',
                      '取值依据',
                    ].map((label) => h('th', { key: label, scope: 'col' }, label)),
                  ),
                ),
                h(
                  'tbody',
                  {},
                  ...coefficientCategories.map((category) => {
                    const coefficient = coefficients.get(category) ?? defaultCoefficient;
                    return h(
                      'tr',
                      { key: category },
                      h('th', { scope: 'row' }, category),
                      h('td', {}, coefficient.elapsed == null ? '—' : display(coefficient.elapsed)),
                      h(
                        'td',
                        {},
                        coefficient.remaining == null ? '—' : display(coefficient.remaining),
                      ),
                      h('td', {}, displayFactor(coefficient.factor)),
                      h('td', {}, coefficient.reason || '未过区间日均 ÷ 已过区间日均'),
                    );
                  }),
                ),
              ),
            ),
          ),
        h(
          'div',
          {
            className: 'dc-table-scroll sp-scroll',
            tabIndex: 0,
            role: 'region',
            'aria-label': '本月预估发货明细滚动区域',
          },
          h(
            'table',
            { className: 'sp-table', 'aria-label': '本月预估发货明细' },
            h(
              'colgroup',
              {},
              ...[260, 72, 62, 62, 82, 82, 94, 88, 96, 68, 72, 98, 80, 80, 94].map((width, index) =>
                h('col', { key: index, style: { width } }),
              ),
            ),
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', { rowSpan: 2, scope: 'col' }, '全国 / 基地 / 大类 / 物料组 / 单品'),
                ...[
                  ['输入（数仓）', 5],
                  ['派生', 1],
                  ['本月结果', 1],
                  ['人工覆盖', 1],
                  ['当月结存', 6],
                ].map(([label, span]) =>
                  h('th', { key: label, colSpan: span, scope: 'colgroup' }, label),
                ),
              ),
              h(
                'tr',
                {},
                ...names.map((name, index) =>
                  h(
                    'th',
                    { key: name, scope: 'col' },
                    index === 7 || index === 10
                      ? h(
                          'button',
                          {
                            className: 'sp-column-formula',
                            onClick: () => explain(national, fields[index], '全国合计'),
                          },
                          name,
                        )
                      : index === 8
                        ? '月初1号库存'
                        : name,
                    index === 7 || index === 10 ? h('small', {}, '（可改）') : null,
                  ),
                ),
              ),
            ),
            h(
              'tbody',
              {},
              renderRow(
                national,
                '全国合计',
                toggleLabel(
                  JSON.stringify(['全国合计']),
                  '全国合计',
                  '全国合计',
                  new Set(rows.map((row) => row.code)).size,
                ),
                'sp-total',
              ),
              ...shipmentHierarchy(national, '全国合计'),
              ...groups.flatMap((group) => [
                renderRow(
                  group,
                  group.who,
                  toggleLabel(
                    JSON.stringify([group.who]),
                    group.who,
                    group.who,
                    group.children.length,
                  ),
                  'sp-base',
                ),
                ...shipmentHierarchy(group, group.who),
              ]),
            ),
          ),
        ),
        h(
          'details',
          {
            className: 'sp-method sp-issue-report',
            onToggle: (event) => setIssuesOpen(event.currentTarget.open),
          },
          h('summary', {}, '发货与库存异常报告'),
          issuesOpen &&
            h(
              react.Fragment,
              null,
              sourceKind === 'business' &&
                !(business.sourceRecords ?? business.rows).length &&
                h('p', {}, '该取数区间没有库存日报记录'),
              business?.metadata.omittedRows > 0 &&
                h(
                  'p',
                  {},
                  `源数据${business.metadata.omittedRows}条缺基地或产品编码，或基地不在本表范围，未并入明细`,
                ),
              business?.metadata.missingDimensions > 0 &&
                h(
                  'p',
                  {},
                  `源数据${business.metadata.missingDimensions}条产品名称、系列或品项缺失或冲突，保留数量与源状态`,
                ),
              business?.metadata.incompleteRows > 0 &&
                h(
                  'p',
                  {},
                  `源数据${business.metadata.incompleteRows}个单品存在缺值或日记录不齐，缺值保留待定`,
                ),
              business?.metadata.duplicateRows > 0 &&
                h(
                  'p',
                  {},
                  `源数据${business.metadata.duplicateRows}个单品有重复日期，相关输入未采用`,
                ),
              business?.metadata.recentStatus === 'insufficient-days' &&
                h('p', {}, '截止日前本月不足三天，近三天日均未提供'),
              h(
                'button',
                {
                  disabled: !stockIssues.length || busy,
                  onClick: () =>
                    downloadCsv(`MPS-${draft.month}-发货与库存异常.csv`, issueColumns, stockIssues),
                },
                '下载发货与库存异常',
              ),
              h(
                ReportPage,
                { stateKey: 'shipmentIssues', label: '发货与库存异常', rows: stockIssues },
                (pageRows) =>
                  h(
                    'div',
                    {
                      className: 'dc-table-scroll',
                      tabIndex: 0,
                      role: 'region',
                      'aria-label': '发货与库存异常报告滚动区域',
                    },
                    h(
                      'table',
                      { 'aria-label': '发货与库存异常报告' },
                      h(
                        'thead',
                        {},
                        h(
                          'tr',
                          {},
                          issueColumns.map((column) =>
                            h('th', { key: column, scope: 'col' }, column),
                          ),
                        ),
                      ),
                      h(
                        'tbody',
                        {},
                        pageRows.map((issue, index) =>
                          h(
                            'tr',
                            { key: index },
                            issueColumns.map((column) => h('td', { key: column }, issue[column])),
                          ),
                        ),
                      ),
                    ),
                  ),
              ),
              !stockIssues.length && h('p', {}, '当前范围无发货或库存异常'),
            ),
        ),
        !rows.length && h('p', { className: 'dc-empty' }, '暂无数据'),
        h(
          'details',
          { className: 'sp-method' },
          h('summary', {}, '本月预估发货的算法'),
          h(
            'p',
            {},
            '发运天数=(已备+未备)÷发运速度；近三天日均不大于0时使用正的截止日avg_30d_send；两项日均确认均不大于0时，本月预估取已发货+已备+未备，发运天数为0。三数量均确认是0时预估为0；来源日期缺失、重复或冲突时保留待核。预测日均=(已发货+已备+未备)÷(已过天数+发运天数)。原预测量=预测日均×max(0,总天数−已过天数−发运天数)+已发货+已备+未备，四舍五入。常规预测再乘大类发运系数并四舍五入，数量合计直接使用。本月预测量汇总取各基地、各SKU修正后的系统预测量之和。近30天日均发货直接读取截止日avg_30d_send。累计生产入库为月初至截止日produce_in_qty逐日合计，保留负数冲销；重复日或缺值时待定；入库日均=累计生产入库÷(截止日日号−1)，剩余自然天数保持原算法。',
          ),
        ),
        h(
          'div',
          { className: 'dc-card-foot' },
          !busy &&
            syncStatus === 'failed' &&
            activeSource === 'business' &&
            h('p', { role: 'status' }, '数仓输入同步失败，未采用旧业务结果'),
          error && h('p', { role: 'alert', className: 'sp-error' }, error),
          h(
            'button',
            { onClick: sync, disabled: busy || batch.active || !cutoff || !hasMpsSource() },
            '同步实际发货',
          ),
          !batch.active && h(Upload, { label: '选择发货输入CSV', text: '上传输入', read }),
          h(
            'button',
            { onClick: () => downloadCsv('发货输入-模板.csv', [...columns, '近30天日均发货'], []) },
            'CSV模板',
          ),
          h('span', { className: 'sp-spacer' }),
          h(
            'button',
            { onClick: downloadHierarchy, disabled: !cutoff || !rows.length },
            '下载汇总及明细',
          ),
          h('button', { onClick: download, disabled: !cutoff || !rows.length }, '下载明细'),
        ),
      ),
      formulas,
    );
  };
}
