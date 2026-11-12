import { createBatchEdit } from './batch-edit.js';
import { createShipmentScopeNotice } from './category-demand-view.js';
import { createProcessedDemand } from './processed-demand-view.js';
import {
  createInventoryTargetPanel,
  inventoryDependencyColumns,
  inventoryDependencyFields,
} from './inventory-target-view.js';
import { createConstraintPanel } from './constraint-view.js';
import { buildMpsWorkflow } from './workflow-inputs.js';
import { createSourceDiagnostics } from './source-diagnostics.js';
import { call } from '../../../business/shared/channel.js';
import { readUnitWeights, unitWeightCandidate, productWeightCandidate } from './unit-weights.js';
import {
  createEvaluationOverview,
  planContext,
  workflowContextPreview,
} from './evaluation-view.js';
import { readPlanRelations } from './relations.js';
import { computeWorkflow } from './workflow-worker-client.js';
import { readCapacityAnnual } from './master-data.js';
import { capacityFiscalMonths } from 'dsh-agent-manage/mps-compute/capacity-report';
import {
  defaultProductionCalendar,
  productionCalendarDays,
  productionCalendarRule,
} from './production-calendar.js';

const titles = {
  process: '需求加工与收敛',
  constraints: '约束与配置',
  capacity: '产能评估与缺口',
  report: '产销存报告',
};
const labels = {
  reportQuantity: '提报数量',
  historyQuantity: '上一财年发货参考量',
  reportShare: '提报占比',
  historyShare: '历史占比',
  systemShare: '系统占比',
  share: '有效占比',
  nextMonthDemand: '下一月需求参考',
  requiredProduction: '所需生产量',
  projectedClosing: '参考期末库存',
  requiredProductionTons: '所需生产吨数',
  productionDays: '生产天数',
  demand: '需求数量',
  openingInventory: '期初库存',
  safetyDays: '安全天数',
  targetInventory: '目标库存',
  monthlyCapacity: '月产能',
  load: '负荷',
  mainPlan: '可执行主计划',
  gap: '缺口',
  transfer: '调拨',
};
const identityColumns = [
  ['month', '月份'],
  ['base', '基地'],
  ['category', '大类'],
  ['series', '系列'],
  ['group', '物料组'],
  ['code', '产品编码'],
  ['name', '产品名称'],
];
const processFields = [
  'reportQuantity',
  'historyQuantity',
  'reportShare',
  'historyShare',
  'systemShare',
  'share',
  'demand',
  'openingInventory',
];
const planFields = [
  'demand',
  'openingInventory',
  'safetyDays',
  'nextMonthDemand',
  'targetInventory',
  'requiredProduction',
  'projectedClosing',
  'requiredProductionTons',
  'productionDays',
  'mainPlan',
  'transfer',
];
const display = (value) => (value == null || value === '' ? '—' : String(value));
const numberText = (value, percent = false, decimals = 0) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('zh-CN', {
        minimumFractionDigits: percent ? 2 : 0,
        maximumFractionDigits: percent ? 2 : decimals,
      }).format(percent ? value * 100 : value) + (percent ? '%' : '');
const reasons = (row, fields) => [
  ...new Set(fields.flatMap((field) => row.missing?.[field] ?? [])),
];
const status = (row, fields) => reasons(row, fields).join('、') || '已计算';
const sourceText = '①大类需求；②月末结存；③两路占比；④源产能；⑤源最终目标周转天数与人工补充';

export function createWorkflow(react, useMpsPart, { downloadCsv, downloadAmounts, Dialog }) {
  const h = react.createElement;
  const ShipmentScopeNotice = createShipmentScopeNotice(react, { downloadCsv });
  const { useBatchEdit, Actions, Field } = createBatchEdit(react);
  const NumberInput = ({ batch, label, value, commit, max }) =>
    h(Field, {
      batch,
      id: label,
      label,
      value,
      max,
      placeholder: '未填写',
      onStage: commit,
    });
  const ProcessedDemand = createProcessedDemand(react, { downloadCsv, downloadAmounts });
  const SourceDiagnostics = createSourceDiagnostics(react, { downloadCsv, Dialog });
  const InventoryTargetPanel = createInventoryTargetPanel(react, { downloadCsv, NumberInput });
  const ConstraintPanel = createConstraintPanel(react, { Dialog });
  const EvaluationOverview = createEvaluationOverview(react, { downloadCsv, Dialog });
  return function Workflow({
    evaluation,
    setEvaluation,
    step,
    draft: savedDraft,
    scopeGeneration,
    syncInventoryTargets,
    inventoryTargetsBusy,
    update: persistUpdate,
    relations,
    shipmentSnapshot,
    onUndoShareAdjustment,
    onEditingChange,
  }) {
    const [search, setSearch] = react.useState('');
    const [configuration, setConfiguration] = react.useState({});
    const batch = useBatchEdit({
      scope: `${savedDraft.id}:${savedDraft.month}:${step}:${scopeGeneration}`,
      onEditingChange,
      requireReason: step === 'process',
      onStart: () => setConfiguration({}),
      onCancel: () => setConfiguration({}),
    });
    const draft =
      step === 'constraints' && batch.active ? { ...savedDraft, ...configuration } : savedDraft;
    const update = (changes) => {
      if (step === 'constraints' && batch.active)
        setConfiguration((current) => ({ ...current, ...changes }));
      else persistUpdate(changes);
    };
    const [base, setBase] = react.useState('');
    const [category, setCategory] = react.useState('');
    const [month, setMonth] = react.useState('');
    const [onlyMissing, setOnlyMissing] = react.useState(false);
    const [page, setPage] = react.useState(0);
    const [formula, setFormula] = react.useState(null);
    const [shareError, setShareError] = react.useState('');
    const [executing, setExecuting] = react.useState(false);
    const [evaluationError, setEvaluationError] = react.useState('');
    const executionGeneration = react.useRef(0);
    const executionController = react.useRef(null);
    const executingRef = react.useRef(false);
    react.useEffect(() => {
      executionGeneration.current++;
      setExecuting(false);
      if (executingRef.current)
        setEvaluationError('输入或数据来源已更新，本轮评估已取消。请重新评估。');
      executingRef.current = false;
      return () => {
        executionGeneration.current++;
        executionController.current?.abort();
      };
    }, [savedDraft, relations, shipmentSnapshot, scopeGeneration]);
    const result = react.useMemo(
      () => buildMpsWorkflow(savedDraft, relations, shipmentSnapshot),
      [savedDraft, relations, shipmentSnapshot],
    );
    const preparingInputs =
      (savedDraft.productSource === 'business' &&
        (!shipmentSnapshot || ['unread', 'loading'].includes(shipmentSnapshot.status))) ||
      [
        savedDraft.productsRead,
        savedDraft.historyAnnualRead,
        savedDraft.sourceChecksRead,
        savedDraft.historicalIndicatorsRead,
        savedDraft.planRatesRead,
        savedDraft.inventoryTargetsRead,
        savedDraft.annualRead,
        savedDraft.forecastRead,
        savedDraft.reportRead,
        ...Object.values(savedDraft.reportRead?.periods ?? {}),
        ...Object.values(savedDraft.historyRead?.periods ?? {}),
        ...Object.values(savedDraft.deliveryRead?.periods ?? {}),
      ].some((state) => state?.status === 'loading');
    const coverage = result.scopeCoverage === 'national' ? '全国' : '范围内';
    const [weightRead, setWeightRead] = react.useState(null);
    const [weightError, setWeightError] = react.useState('');
    const [weightBusy, setWeightBusy] = react.useState(false);
    const weightController = react.useRef(null);
    const weightGeneration = react.useRef(0);
    const weightCodes = [
      ...new Set((draft.products ?? []).map((row) => row['产品编码']).filter(Boolean)),
    ].sort();
    const weightScope = JSON.stringify([draft.id, draft.month, weightCodes, scopeGeneration]);
    react.useEffect(() => {
      const invalidate = () => {
        weightGeneration.current++;
        weightController.current?.abort();
        setWeightRead(null);
        setWeightError('');
        setWeightBusy(false);
      };
      invalidate();
      const events = [
        'gea-session-changing',
        'gea-session-changed',
        'gea-identity-changed',
        'pagehide',
      ];
      events.forEach((event) => window.addEventListener(event, invalidate));
      return () => {
        events.forEach((event) => window.removeEventListener(event, invalidate));
        weightGeneration.current++;
        weightController.current?.abort();
      };
    }, [weightScope]);
    const syncWeights = async (parentSignal) => {
      const generation = ++weightGeneration.current;
      weightController.current?.abort();
      const controller = new AbortController();
      weightController.current = controller;
      const signal = parentSignal
        ? AbortSignal.any([parentSignal, controller.signal])
        : controller.signal;
      setWeightBusy(true);
      setWeightRead(null);
      setWeightError('');
      try {
        const config = JSON.parse(document.getElementById('agent-sql-config').textContent);
        const read = await readUnitWeights(
          config,
          (_request, options) =>
            call(
              'sql',
              { queryId: options.queryId, parameters: options.values },
              { signal: options.signal },
            ),
          weightCodes,
          signal,
        );
        if (generation === weightGeneration.current && !signal.aborted) {
          setWeightRead(read);
          return read;
        }
      } catch (error) {
        if (generation === weightGeneration.current) setWeightError(error.message);
      } finally {
        if (generation === weightGeneration.current) setWeightBusy(false);
      }
    };
    const currentEvaluation =
      evaluation?.draft.id === draft.id && evaluation.scopeGeneration === scopeGeneration
        ? evaluation
        : null;
    const evaluationStale = Boolean(
      currentEvaluation &&
      (currentEvaluation.draft !== savedDraft ||
        currentEvaluation.relations !== relations ||
        currentEvaluation.shipmentSnapshot !== shipmentSnapshot ||
        (weightRead && weightRead !== currentEvaluation.weights)),
    );
    const executeEvaluation = async () => {
      const ticket = ++executionGeneration.current;
      executionController.current?.abort();
      const controller = new AbortController();
      executionController.current = controller;
      setExecuting(true);
      executingRef.current = true;
      setEvaluationError('');
      try {
        const config = JSON.parse(document.getElementById('agent-sql-config').textContent);
        const [weights, sourceRead, annual] = await Promise.all([
          weightRead ? Promise.resolve(weightRead) : syncWeights(controller.signal),
          (relations?.scopeKey === JSON.stringify([draft.id, draft.month, scopeGeneration]) &&
          !relations.busy &&
          !relations.error &&
          relations.configSignature === JSON.stringify(config) &&
          typeof relations.configVersion === 'string' &&
          relations.configVersion &&
          ['products', 'sku_capacity', 'tunnels', 'transfers'].every((kind) =>
            Array.isArray(relations.sources?.[kind]),
          )
            ? Promise.resolve(relations)
            : readPlanRelations(
                config,
                (_request, options) =>
                  call(
                    'sql',
                    { queryId: options.queryId, parameters: options.values },
                    { signal: options.signal },
                  ),
                result.months.slice(0, 3),
                controller.signal,
              )
          ).then(
            (value) => ({ value }),
            (error) => ({ error: error.message }),
          ),
          draft.productSource === 'business'
            ? readCapacityAnnual(
                [...new Set([...capacityFiscalMonths(result.shipmentMonth), ...result.months])],
                controller.signal,
              ).catch((error) => ({ rows: [], error: error.message }))
            : Promise.resolve({ rows: [], error: '人工模拟未读取全年年度SKU来源' }),
        ]);
        if (ticket !== executionGeneration.current) return;
        if (
          sourceRead.value &&
          weights?.configVersion &&
          sourceRead.value.configVersion !== weights.configVersion
        )
          throw Error('关系来源与件吨系数配置版本不一致，请重新读取');
        if (draft.productSource === 'business') {
          annual.referenceMonth = result.shipmentMonth;
          const knownCodes = new Set(weights?.codes ?? weightCodes);
          const additional = [
            ...new Set(annual.rows.map((row) => row.code).filter((code) => !knownCodes.has(code))),
          ];
          if (additional.length) {
            try {
              const extra = await readUnitWeights(
                config,
                (_request, options) =>
                  call(
                    'sql',
                    { queryId: options.queryId, parameters: options.values },
                    { signal: options.signal },
                  ),
                additional,
                controller.signal,
              );
              if (weights?.configVersion && extra.configVersion !== weights.configVersion)
                throw Error('年度件吨系数与本轮读取配置版本不一致，请重新评估');
              annual.extraWeights = extra;
            } catch (error) {
              annual.weightError = error.message;
            }
          }
        }
        if (ticket !== executionGeneration.current) return;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (ticket !== executionGeneration.current) return;
        const computed = await computeWorkflow(
          draft,
          sourceRead.value ?? null,
          shipmentSnapshot,
          { weights, annual, sourceIssues: sourceRead.error ? [sourceRead.error] : [] },
          controller.signal,
        );
        if (ticket !== executionGeneration.current) return;
        setEvaluation({
          draft,
          relations,
          shipmentSnapshot,
          scopeGeneration,
          weights,
          result: computed,
          at: new Date().toLocaleString('zh-CN'),
        });
      } catch (error) {
        if (ticket === executionGeneration.current) setEvaluationError(error.message);
      } finally {
        if (ticket === executionGeneration.current) {
          setExecuting(false);
          executingRef.current = false;
        }
      }
    };
    const fields = step === 'process' ? processFields : planFields;
    const scopedRows = result.rows;
    const scopedCategories = result.categoryRows;
    const configurationPairs = [
      ...new Map(
        [
          ...result.rows,
          ...(draft.products ?? [])
            .filter((row) => row['基地'] && row['产品编码'])
            .map((row) => ({ base: row['基地'], code: row['产品编码'], name: row['产品名称'] })),
        ].map((row) => [JSON.stringify([row.base, row.code]), row]),
      ).values(),
    ];
    const bases = [
      ...new Set(
        [
          ...scopedRows.map((row) => row.base),
          ...configurationPairs.map((row) => row.base),
          ...(draft.resources ?? []).map((row) => row.base),
          ...(draft.productionDays ?? []).map((row) => row.base),
          ...result.constraints.safetyDays.map((row) => row.base),
        ].filter(Boolean),
      ),
    ];
    const categories = [...new Set(scopedCategories.map((row) => row.category))];
    const filtered = scopedRows.filter(
      (row) =>
        (!base || row.base === base) &&
        (!category || row.category === category) &&
        (!month || row.month === month) &&
        (!onlyMissing || reasons(row, fields).length) &&
        (!search || identityColumns.some(([key]) => display(row[key]).includes(search))),
    );
    const categoryRows = scopedCategories.filter(
      (row) => (!category || row.category === category) && (!month || row.month === month),
    );
    const pageIndex = Math.min(page, Math.max(0, Math.ceil(filtered.length / 25) - 1));
    const visible = filtered.slice(pageIndex * 25, (pageIndex + 1) * 25);
    const scopeKey = JSON.stringify([draft.id, draft.month, step]);
    const [shownScope, setShownScope] = react.useState(scopeKey);
    if (shownScope !== scopeKey) {
      setShownScope(scopeKey);
      setSearch('');
      setBase('');
      setCategory('');
      setMonth('');
      setOnlyMissing(false);
      setPage(0);
      setFormula(null);
      setShareError('');
    }
    const planning = ['capacity', 'report'].includes(step);
    useMpsPart(
      react,
      step,
      workflowContextPreview({
        preview: '上下文最多展示每组10条及完整条数，完整数据见页面和下载',
        evaluation: result.context,
        months: result.months,
        shipmentMonth: result.shipmentMonth,
        filter: { search, base, category, month, onlyMissing },
        categoryRows,
        categoryComparisons: result.categoryComparisons,
        rows: planning ? [] : visible,
        total: scopedRows.length,
        filteredTotal: filtered.length,
        page: pageIndex + 1,
        constraints: result.constraints,
        productionDays: draft.productionDays ?? [],
        unitWeights: planning ? undefined : (draft.unitWeights ?? []),
        resources: draft.resources ?? [],
        resourceAssignments: planning ? undefined : (draft.resourceAssignments ?? []),
        resourceLoads: planning ? undefined : (result.resourceLoads ?? []),
        summary: planning ? undefined : result.summary,
        adjustments: draft.adjustments,
        adjustmentIssues: result.adjustmentIssues ?? [],
        excludedCategoryDemand: result.excludedCategoryDemand ?? [],
        excludedShipments: result.excludedShipments ?? [],
        partial: result.partial,
        missing: planning ? undefined : result.missing,
        businessSave: 'not-connected',
        plan: currentEvaluation
          ? {
              at: currentEvaluation.at,
              stale: evaluationStale,
              ...planContext(currentEvaluation.result.plan, visible, { base, month }),
            }
          : null,
      }),
      titles[step],
    );
    const table = (name, columns, rows, renderDetail) =>
      h(
        'div',
        { className: 'dc-table-scroll wf-table-scroll' },
        h(
          'table',
          { 'aria-label': name },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              columns.map((column, index) => h('th', { key: index }, column)),
            ),
          ),
          h(
            'tbody',
            null,
            rows.length
              ? rows.map((cells, index) =>
                  h(
                    react.Fragment,
                    { key: index },
                    h(
                      'tr',
                      {},
                      cells.map((cell, position) => h('td', { key: position }, cell)),
                    ),
                    renderDetail?.(cells, index),
                  ),
                )
              : h(
                  'tr',
                  null,
                  h('td', { colSpan: columns.length, className: 'wf-empty' }, '暂无记录 · 未评估'),
                ),
          ),
        ),
      );
    const card = (name, body, actions) =>
      h(
        'section',
        { className: 'dc-card', 'aria-label': name },
        h('div', { className: 'dc-card-head' }, h('h3', null, name), actions),
        body,
      );
    const select = (label, value, values, setter) =>
      h(
        'label',
        null,
        label,
        h(
          'select',
          {
            'aria-label': label,
            value,
            onChange: (event) => {
              setter(event.target.value);
              setPage(0);
            },
          },
          h('option', { value: '' }, '全部'),
          values.map((item) => h('option', { key: item, value: item }, item)),
        ),
      );
    const explain = (row, field) => {
      const missing = row.missing?.[field] ?? [];
      let expression = missing.join('、');
      const value = (item) => (item == null ? '未定义' : String(item));
      if (field === 'reportShare' || field === 'historyShare') {
        const layer = row[field === 'reportShare' ? 'reportLayers' : 'historyLayers'];
        if (layer)
          expression = `物料组 / 大类：${value(layer.groupQuantity)} ÷ ${value(layer.categoryQuantity)} = ${value(layer.groupShare)}；${coverage}SKU / 物料组：${value(layer.skuQuantity)} ÷ ${value(layer.groupQuantity)} = ${value(layer.skuShare)}；基地SKU / ${coverage}SKU：${value(layer.baseQuantity)} ÷ ${value(layer.skuQuantity)} = ${value(layer.baseShare)}；三层连乘：${value(layer.groupShare)} × ${value(layer.skuShare)} × ${value(layer.baseShare)} = ${value(layer.product)}`;
        if (
          field === 'reportShare' &&
          layer &&
          row.reportShare !== null &&
          [layer.groupQuantity, layer.categoryQuantity, layer.skuQuantity, layer.baseQuantity].some(
            (quantity) => quantity === null,
          )
        )
          expression = `部分原始数量缺项，保留原值。按源计划占比与Top1剩余占比拆分：物料组占比 ${value(layer.groupShare)}；SKU占比 ${value(layer.skuShare)}；基地占比 ${value(layer.baseShare)}；有效提报系数 ${value(row.reportShare)}`;
      }
      if ((field === 'reportShare' || field === 'historyShare') && row.layerMissing?.length)
        expression += `；${row.layerMissing.join('、')}`;
      if (field === 'systemShare')
        expression =
          row.splitBasis === 'history-only-zero-report'
            ? `整类提报合计为0，按历史占比100%拆分：${value(row.historyShare)} × 100% = ${value(row.systemShare)}`
            : `(${value(row.reportShare)} + ${value(row.historyShare)}) ÷ 2 = ${value(row.systemShare)}`;
      if (field === 'share')
        expression = `系统占比 ${value(row.systemShare)}；有效占比 ${value(row.share)}。${row.fallback ? 'Top1承接剩余占比，人工调整与系统基线分别保留。' : ''}`;
      if (field === 'demand') {
        const total = result.categoryRows.find(
          (item) => item.month === row.month && item.category === row.category,
        )?.quantity;
        expression = `${value(total)} × ${value(row.share)} = ${value(row.demand)}`;
        for (const [name, layer] of [
          ['提报', row.reportLayers],
          ['历史', row.historyLayers],
        ]) {
          if (layer)
            expression += `；${name}三层占比：${value(layer.groupShare)} × ${value(layer.skuShare)} × ${value(layer.baseShare)} = ${value(layer.product)}`;
        }
        expression += `；系统占比 ${value(row.systemShare)}，有效占比 ${value(row.share)}`;
        if (row.splitBasis === 'history-only-zero-report')
          expression += '；整类提报合计为0，本类按历史占比100%拆分';
      }
      if (row.coefficientFallback?.length) expression += `；${row.coefficientFallback.join('；')}`;
      if (field === 'openingInventory')
        expression =
          row.month === result.months[0]
            ? `${result.shipmentMonth}月末结存 = ${value(row.openingInventory)}`
            : `承接上一月参考期末库存 = ${value(row.openingInventory)}，不代表超载后的实际库存`;
      if (field === 'nextMonthDemand')
        expression =
          row.month === result.months[2]
            ? `M+4大类有效需求 × M+3有效拆分系数 = ${value(row.nextMonthDemand)}，仅供目标库存参考，不生成M+4 SKU需求`
            : `下一月有效SKU需求 = ${value(row.nextMonthDemand)}`;
      if (field === 'targetInventory') {
        expression = `${value(row.safetyDays)} × ${value(row.nextMonthDemand)} ÷ ${row.nextMonthDays} = ${value(row.targetInventory)}；源最终目标周转天数 ${value(row.turnoverPolicy.sourceDays)}天，人工补充及已采用规则生效后使用有效天数`;
      }
      if (field === 'targetInventory' && row.safetyDays === 0)
        expression =
          row.safetyDaysSource === 'missing-turnover-days-zero'
            ? '源目标周转天数待补，本轮临时按0天计算，目标库存为0；源缺项保留，补齐后重新评估'
            : '安全天数明确为0，目标库存为0，无需下一月需求';
      if (field === 'requiredProduction')
        expression = `max(0, ${value(row.demand)} + ${value(row.targetInventory)} − ${value(row.openingInventory)}) = ${value(row.requiredProduction)}，需求推导参考`;
      if (field === 'projectedClosing')
        expression = `${value(row.openingInventory)} + ${value(row.requiredProduction)} − ${value(row.demand)} = ${value(row.projectedClosing)}，需求推导参考`;
      if (field === 'requiredProductionTons')
        expression = `${value(row.requiredProduction)} × 明确维护的件吨系数 = ${value(row.requiredProductionTons)}`;
      if (['reportShare', 'historyShare', 'systemShare', 'share', 'demand'].includes(field))
        expression += `；拆分系数来源为评估月份${draft.month}，同一套系数用于M+1至M+3`;
      if (missing.length) expression += `${expression ? '；' : ''}缺项：${missing.join('、')}`;
      setFormula({
        title: `${row.base} ${row.code} ${row.month} ${labels[field]} 计算过程`,
        expression,
        value: row[field],
        percent: ['reportShare', 'historyShare', 'systemShare', 'share', 'load'].includes(field),
        missing,
      });
    };
    const layerColumns = [
      '提报物料组/大类',
      '提报SKU/物料组',
      `提报基地SKU/${coverage}SKU`,
      '提报三层连乘',
      '历史物料组/大类',
      '历史SKU/物料组',
      `历史基地SKU/${coverage}SKU`,
      '历史三层连乘',
    ];
    const layerQuantityColumns = [
      '提报物料组数量',
      '提报大类数量',
      `提报${coverage}SKU数量`,
      '提报基地SKU数量',
      '历史物料组数量',
      '历史大类数量',
      `历史${coverage}SKU数量`,
      '历史基地SKU数量',
    ];
    const resourceColumns = [
      '资源编号',
      '资源类型',
      '资源名称',
      '日产吨数',
      '生产天数',
      '所需吨数',
      '所需资源天数',
      '资源负荷',
      '超载天数',
      '缺口吨数',
      '负荷状态',
    ];
    const resourceLoads = (result.resourceLoads ?? []).filter(
      (row) => (!base || row.base === base) && (!month || row.month === month),
    );
    const resourceStatus = {
      normal: '正常，低于90%',
      warning: '预警，90%至105%',
      overload: '超载，高于105%',
      unknown: '未评估',
    };
    const resourceValues = (row) => [
      row.resourceId,
      row.kind === 'forming' ? '成型机' : '隧道',
      row.name,
      row.dailyTons,
      row.productionDays,
      row.requiredTons,
      row.requiredDays,
      row.load,
      row.overloadDays,
      row.gapTons,
      resourceStatus[row.status] ?? '未评估',
    ];
    const exportRows = (name, exportFields, includeCategory = false) => {
      const shipmentByProduct = new Map(
        (result.comparisonSources?.shipment ?? []).map((row) => [
          JSON.stringify([row['基地'], row['产品编码']]),
          row,
        ]),
      );
      const forecastByMonth = new Map();
      for (const row of result.comparisonSources?.forecast ?? []) {
        const key = JSON.stringify([row['月份'], row['基地'], row['产品编码']]);
        forecastByMonth.set(key, forecastByMonth.has(key) ? null : row['数量']);
      }
      const columns = [
        ...new Set([
          '评估版本',
          '评估月份',
          '计算范围',
          '粒度',
          '相对月份',
          ...identityColumns.map(([, label]) => label),
          ...exportFields.map((key) => labels[key]),
          ...layerColumns,
          ...layerQuantityColumns,
          '分层缺项',
          '历史参考物料编码',
          '历史源数量',
          '替换系数',
          '历史参考口径',
          '公式说明',
          ...inventoryDependencyColumns,
          'Top1托底',
          '提报数量口径',
          '需求拆分口径',
          '拆分系数所属月',
          '系数托底说明',
          '调整原因',
          '调整时间',
          '系统大类需求',
          '系统SKU需求',
          '数量调整状态',
          '固定数量调整',
          '本月预估发货',
          '本月预估所属月',
          '本月系统预估发货',
          '本月预估发货已知小计',
          '本月预估发货完整性',
          '本月预估发货缺项数',
          '本月预估发货缺项原因',
          '模型预测数量',
          '模型已知小计',
          '全部调整记录',
          '大类调整状态',
          ...resourceColumns,
          '已知生产吨数小计',
          '完整生产吨数',
          '已评估行数',
          '总行数',
          '源产能候选',
          '来源',
          '适用渠道',
          '读取配置版本',
          '读取时间',
          '未评估原因',
        ]),
      ];
      const rows = (includeCategory ? scopedRows : filtered).map((row) => {
        const shipment = shipmentByProduct.get(JSON.stringify([row.base, row.code]));
        const forecast = forecastByMonth.get(JSON.stringify([row.month, row.base, row.code]));
        const adjustment = draft.adjustments?.shares?.find((item) => item.rowId === row.id);
        const layerValues = ['reportLayers', 'historyLayers'].flatMap((key) =>
          ['groupShare', 'skuShare', 'baseShare', 'product'].map((field) => row[key]?.[field]),
        );
        const layerQuantities = ['reportLayers', 'historyLayers'].flatMap((key) =>
          ['groupQuantity', 'categoryQuantity', 'skuQuantity', 'baseQuantity'].map(
            (field) => row[key]?.[field],
          ),
        );
        return {
          评估版本: draft.name,
          评估月份: draft.month,
          计算范围: result.partial ? '部分可计算，待定单品已单列异常' : '当前参与范围',
          相对月份: `M+${result.months.indexOf(row.month) + 1}`,
          粒度: includeCategory ? '基地×物料组×SKU' : '需求推导产销存参考',
          ...Object.fromEntries(identityColumns.map(([key, label]) => [label, row[key]])),
          ...Object.fromEntries(exportFields.map((key) => [labels[key], row[key]])),
          ...Object.fromEntries(layerColumns.map((key, index) => [key, layerValues[index]])),
          ...Object.fromEntries(
            layerQuantityColumns.map((key, index) => [key, layerQuantities[index]]),
          ),
          分层缺项: row.layerMissing?.join('；'),
          历史参考物料编码: row.historyCode || row.code,
          历史源数量: row.historyReferenceQuantity,
          替换系数: row.historyCode
            ? row.historyFactor === undefined
              ? 1
              : row.historyFactor
            : '',
          历史参考口径: row.historyCode ? '同基地老品历史量×替换系数' : '自身历史',
          公式说明: `占比=(物料组/大类)×(${coverage}SKU/物料组)×(基地SKU/${coverage}SKU)；目标库存=安全天数×下一月需求/下一月自然日天数；所需生产=max(0,需求+目标库存-期初库存)；参考期末=期初+所需生产-需求`,
          ...inventoryDependencyFields(row),
          系统SKU需求: row.systemDemand,
          本月预估所属月: result.shipmentMonth,
          本月系统预估发货: shipment?.prediction,
          本月预估发货: shipment?.fin,
          本月预估发货已知小计: shipment?.fin,
          本月预估发货完整性: shipment?.fin != null ? '完整' : '缺项',
          本月预估发货缺项数: shipment?.fin != null ? 0 : 1,
          模型预测数量: forecast,
          模型已知小计: forecast,
          数量调整状态: row.quantityAdjusted ? '数量固定及下级联动' : '系统拆分或占比调整',
          Top1托底: row.fallback ? '是' : '否',
          提报数量口径: row.reportMissingAsZero ? '完整读取后未提报按0' : '源记录数量',
          需求拆分口径:
            row.splitBasis === 'history-only-zero-report'
              ? '整类提报为0，历史占比100%'
              : '提报占比50%＋历史占比50%',
          拆分系数所属月: draft.month,
          系数托底说明: row.coefficientFallback?.join('；'),
          调整原因: adjustment?.reason,
          调整时间: adjustment?.at,
          源产能候选: row.capacities
            .map(
              (item) =>
                `${display(item.line)}：${numberText(item.dailyPieces)}件/日，${numberText(item.dailyTons)}吨/日`,
            )
            .join('；'),
          来源: sourceText,
          适用渠道: (draft.unitWeights ?? []).find(
            (item) => item.base === row.base && item.code === row.code,
          )?.channels,
          读取配置版本: (draft.unitWeights ?? []).find(
            (item) => item.base === row.base && item.code === row.code,
          )?.source?.configVersion,
          读取时间: (draft.unitWeights ?? []).find(
            (item) => item.base === row.base && item.code === row.code,
          )?.source?.readAt,
          未评估原因: status(row, exportFields),
        };
      });
      rows.unshift(
        ...(includeCategory ? scopedCategories : categoryRows).map((row) => {
          const compare = result.categoryComparisons?.find(
            (item) => item.category === row.category,
          );
          return {
            评估版本: draft.name,
            评估月份: draft.month,
            计算范围: result.partial ? '部分可计算，待定单品已排除' : '当前参与范围',
            相对月份: `M+${result.months.indexOf(row.month) + 1}`,
            粒度: row.month === result.months[3] ? 'M+4大类，仅供库存参考' : '大类',
            月份: row.month,
            大类: row.category,
            需求数量: row.quantity,
            系统大类需求: row.systemQuantity,
            大类调整状态: row.adjusted ? '人工调整' : '系统值',
            本月预估发货: compare?.shipment.quantity,
            本月预估发货已知小计: compare?.shipment.knownQuantity,
            本月预估发货完整性: compare?.shipment.excluded
              ? '当前参与范围，另有单品已排除'
              : compare?.shipment.quantity != null
                ? '完整'
                : compare?.shipment.knownQuantity != null
                  ? '已知小计'
                  : '缺项',
            本月预估发货缺项数: compare?.shipment.missingCount,
            本月预估发货缺项原因: compare?.shipment.issues.join('；'),
            模型预测数量: compare?.forecast[row.month]?.quantity,
            模型已知小计: compare?.forecast[row.month]?.knownQuantity,
            来源: '①大类需求',
            未评估原因: row.missing.join('、') || '已计算',
          };
        }),
      );
      if (
        includeCategory &&
        (draft.adjustments?.history?.length || draft.adjustments?.quantities?.length)
      )
        rows.push({
          评估版本: draft.name,
          评估月份: draft.month,
          粒度: '全部调整记录',
          全部调整记录: JSON.stringify(draft.adjustments?.history ?? []),
          固定数量调整: JSON.stringify(draft.adjustments?.quantities ?? []),
        });
      if (!includeCategory) {
        rows.push(
          ...resourceLoads.map((row) => ({
            评估版本: draft.name,
            评估月份: draft.month,
            粒度: '资源负荷与缺口',
            月份: row.month,
            基地: row.base,
            ...Object.fromEntries(
              resourceColumns.map((key, index) => [key, resourceValues(row)[index]]),
            ),
            来源: sourceText,
            未评估原因: row.missing.join('、') || '已评估',
          })),
        );
        if (result.summary)
          rows.push({
            评估版本: draft.name,
            评估月份: draft.month,
            粒度: '全版本汇总，需求推导参考',
            计算范围: result.partial ? '部分可计算，完整范围总量未知' : '当前参与范围',
            已知生产吨数小计: result.summary.knownRequiredProductionTons,
            完整生产吨数: result.summary.requiredProductionTons,
            已评估行数: result.summary.evaluatedRows,
            总行数: result.summary.totalRows,
            未评估原因: result.summary.missing.join('、') || '完整',
          });
      }
      if (includeCategory)
        rows.push(
          ...(result.excludedCategoryDemand ?? []).map((row) => ({
            评估版本: draft.name,
            评估月份: draft.month,
            粒度: '池外大类需求，未参与计算',
            月份: row.month,
            大类: row.category,
            需求数量: row.quantity,
            系统大类需求: row.systemQuantity,
            未评估原因: row.reason,
          })),
        );
      if (!rows.length)
        rows.push({
          评估版本: draft.name,
          评估月份: draft.month,
          来源: sourceText,
          未评估原因: result.missing.join('、') || '暂无输入，未评估',
        });
      if (!includeCategory)
        rows.push(
          ...inputGaps
            .filter(([, , period]) => !period || !month || period === month)
            .map(([item, reason]) => ({
              评估版本: draft.name,
              评估月份: draft.month,
              粒度: '实际输入缺项',
              来源: item,
              未评估原因: reason,
            })),
        );
      downloadCsv(`${draft.month}-${name}.csv`, columns, rows);
    };
    const filterBar = h(
      'div',
      { className: 'wf-filters' },
      select('月份筛选', month, result.months, setMonth),
      select('基地筛选', base, bases, setBase),
      select('大类筛选', category, categories, setCategory),
      h(
        'label',
        null,
        '搜索',
        h('input', {
          type: 'search',
          'aria-label': '搜索当前步骤',
          placeholder: '编码、名称、系列、物料组',
          value: search,
          onChange: (event) => {
            setSearch(event.target.value);
            setPage(0);
          },
        }),
      ),
      h(
        'label',
        { className: 'wf-check' },
        h('input', {
          type: 'checkbox',
          checked: onlyMissing,
          onChange: (event) => {
            setOnlyMissing(event.target.checked);
            setPage(0);
          },
        }),
        '仅未评估',
      ),
      h('span', { className: 'dc-card-note' }, `发货所属月 ${result.shipmentMonth}`),
    );
    const undoShare = (rowId) => {
      const shares = (draft.adjustments?.shares ?? []).filter((item) => item.rowId !== rowId);
      const candidate = buildMpsWorkflow(
        { ...draft, adjustments: { ...draft.adjustments, shares } },
        relations,
        shipmentSnapshot,
      );
      const introduced = (candidate.adjustmentIssues ?? []).filter(
        (issue) => !(result.adjustmentIssues ?? []).includes(issue),
      );
      if (introduced.length) {
        setShareError(`此次撤销会破坏组内占比对平，请先撤销关联调整。${introduced.join('；')}`);
        return;
      }
      onUndoShareAdjustment?.({
        rowId,
        effectiveValue: candidate.rows.find((row) => row.id === rowId)?.share ?? null,
      });
      setShareError('');
    };
    const shareIdentity = (rowId) => {
      try {
        const parts = JSON.parse(rowId);
        return Array.isArray(parts) &&
          parts.length === 4 &&
          parts.every((item) => typeof item === 'string')
          ? [parts[1], parts[3], parts[0]].join(' ')
          : rowId;
      } catch {
        return rowId;
      }
    };
    const constraintRows = bases
      .filter((sourceBase) => !base || sourceBase === base)
      .map((sourceBase) => {
        const matches = (draft.constraints?.safetyDays ?? result.constraints.safetyDays).filter(
          (item) => item.base === sourceBase,
        );
        const current = matches.length === 1 ? matches[0] : null;
        return [
          sourceBase,
          h(NumberInput, {
            batch,
            key: `${draft.id}-${sourceBase}-days`,
            label: `${sourceBase} 安全天数`,
            value: current?.days,
            commit: (text) =>
              update({
                constraints: {
                  ...draft.constraints,
                  rules: draft.constraints?.rules ?? { local: [] },
                  safetyDays: [
                    ...(draft.constraints?.safetyDays ?? result.constraints.safetyDays).filter(
                      (item) => item.base !== sourceBase,
                    ),
                    { base: sourceBase, days: text === '' ? null : text },
                  ],
                },
              }),
          }),
          matches.length > 1
            ? '重复策略，请维护唯一值'
            : current?.days == null
              ? '未维护'
              : '当前评估版本',
          `${draft.month}评估 · M+1至M+3共用；修改后需重新评估`,
        ];
      });
    const numberInput = (label, value, change, max = Number.MAX_SAFE_INTEGER) =>
      h(NumberInput, {
        batch,
        key: `${draft.id}-${label}`,
        label,
        value,
        max,
        commit: (text) => change(text === '' ? null : text),
      });
    const productionDays = draft.productionDays ?? [];
    const weights = draft.unitWeights ?? [];
    const resources = draft.resources ?? [];
    const assignments = draft.resourceAssignments ?? [];
    const editEntry = (key, entries, index, patch) =>
      update({
        [key]: entries.map((item, position) => (position === index ? { ...item, ...patch } : item)),
      });
    const setDays = (sourceBase, sourceMonth, days) =>
      update({
        productionDays: [
          ...productionDays.filter(
            (item) => item.base !== sourceBase || item.month !== sourceMonth,
          ),
          { base: sourceBase, month: sourceMonth, days },
        ],
      });
    const productionRows = bases
      .filter((item) => !base || item === base)
      .flatMap((sourceBase) =>
        result.months
          .slice(0, 3)
          .filter((item) => !month || item === month)
          .map((sourceMonth) => [
            sourceBase,
            sourceMonth,
            numberInput(
              `${sourceBase} ${sourceMonth} 生产天数`,
              productionDays.filter(
                (item) => item.base === sourceBase && item.month === sourceMonth,
              ).length === 1
                ? productionDays.find(
                    (item) => item.base === sourceBase && item.month === sourceMonth,
                  ).days
                : productionCalendarDays(sourceBase, sourceMonth, productionDays),
              (days) => setDays(sourceBase, sourceMonth, days),
              31,
            ),
            h(
              'button',
              {
                'aria-label': `${sourceBase} ${sourceMonth} 恢复默认生产天数`,
                disabled: !batch.active,
                onClick: () =>
                  update({
                    productionDays: productionDays.filter(
                      (item) => item.base !== sourceBase || item.month !== sourceMonth,
                    ),
                  }),
              },
              '恢复默认',
            ),
            productionDays.some((item) => item.base === sourceBase && item.month === sourceMonth)
              ? '人工覆盖，按填写的最终生产天数计算，不重复扣春节天数'
              : `默认25天，春节扣减${defaultProductionCalendar(sourceMonth).holidayDates.length}天；${defaultProductionCalendar(sourceMonth).holidayDates.join('、') || '本月无春节扣减'}`,
          ]),
      );
    const skuPairs = [
      ...new Map(
        configurationPairs
          .filter(
            (row) =>
              (!base || row.base === base) &&
              (!search || `${row.base} ${row.code} ${row.name}`.includes(search)),
          )
          .map((row) => [JSON.stringify([row.base, row.code]), row]),
      ).values(),
    ];
    const weightProductRows = new Map();
    for (const row of draft.productRaw ?? []) {
      const rows = weightProductRows.get(row.material_code) ?? [];
      rows.push(row);
      weightProductRows.set(row.material_code, rows);
    }
    const weightRows = skuPairs.map((row) => {
      const current = weights.find((item) => item.base === row.base && item.code === row.code);
      const productWeight = productWeightCandidate(
        weightProductRows.get(row.code) ?? [],
        row.base,
        row.code,
      );
      const candidate = unitWeightCandidate(
        weightRead?.rows ?? [],
        row.code,
        current?.channels ?? '',
      );
      const setWeight = (patch) =>
        update({
          unitWeights: [
            ...weights.filter((item) => item.base !== row.base || item.code !== row.code),
            {
              base: row.base,
              code: row.code,
              tonsPerPiece: current?.tonsPerPiece ?? null,
              channels: current?.channels ?? '',
              ...patch,
            },
          ],
        });
      return [
        row.base,
        row.code,
        row.name,
        numberInput(
          `${row.base} ${row.code} 件吨系数`,
          weights.find((item) => item.base === row.base && item.code === row.code)?.tonsPerPiece,
          (tonsPerPiece) => setWeight({ tonsPerPiece }),
        ),
        h('input', {
          'aria-label': `${row.base} ${row.code} 适用渠道`,
          disabled: !batch.active,
          placeholder: '填写本基地SKU实际适用渠道，多个用逗号分隔',
          value: current?.channels ?? '',
          onChange: (event) =>
            setWeight({
              channels: event.target.value,
              tonsPerPiece: current?.source ? null : (current?.tonsPerPiece ?? null),
            }),
        }),
        h(
          'span',
          null,
          productWeight
            ? `产品清单：${productWeight.rows.map((item) => `${display(item.net_weight)}${display(item.weight_unit)}/${display(item.measure_unit)}`).join('；')}；${productWeight.tonsPerPiece === null ? productWeight.missing.join('；') : `${productWeight.tonsPerPiece}吨/计量单位，未设人工值时自动使用`}`
            : weightRead
              ? candidate.rows
                  .map(
                    (item) => `${display(item.channel_name)}：${display(item.ton_per_piece)}吨/件`,
                  )
                  .join('；') || '无来源记录'
              : '尚未完整读取',
        ),
        h(
          'button',
          {
            'aria-label': `${row.base} ${row.code} 使用来源系数`,
            disabled: !batch.active || !weightRead || candidate.tonsPerPiece === null,
            onClick: () =>
              setWeight({
                tonsPerPiece: candidate.tonsPerPiece,
                channels: candidate.channels.join('、'),
                source: {
                  configVersion: weightRead.configVersion ?? '',
                  readAt: weightRead.readAt,
                },
              }),
          },
          '使用来源系数',
        ),
        h(
          'span',
          null,
          current?.source
            ? `已按适用渠道采用；读取配置 ${current.source.configVersion}；${current.source.readAt}`
            : candidate.missing.join('；') ||
                '适用渠道已填写，尚未采用来源值；可按确认净重手工维护',
        ),
      ];
    });
    const inputGaps = [
      ['B3 实际生产入库', '缺日发生或累计快照合同、正式业务类型及冲销规则；不跨日猜测累计'],
      ['B3 剩余预计入库', '缺截至时点已批准生效排程、版本及单位映射；不以历史产量或能力估算'],
      [
        'B4 渠道适用与有效版本',
        '来源可读不证明本轮全部渠道适用；读取配置版本不是主数据生效版本，实际适用范围与有效版本仍须维护人补齐',
      ],
      [
        'B6 维护来源',
        `目标周转天数取已配置来源；生产日历按确认规则：${productionCalendarRule}人工覆盖按当前评估版本保留。`,
      ],
      ...(!resources.some((row) => row.kind === 'tunnel')
        ? [['B5 隧道台账', '缺正式物理ID与基地车间映射，不把SKU兼容行作为设备']]
        : []),
      ...(!resources.some((row) => row.kind === 'forming')
        ? [['B5 成型机台账', '缺实际成型机资源数据']]
        : []),
      ...(!assignments.length
        ? [['B5 月度分配', '缺基地SKU月份对隧道和成型机各自合计1的批准分配']]
        : []),
      ...bases
        .filter((item) => result.rows.some((row) => row.base === item && row.safetyDays === null))
        .map((item) => [`B6 ${item}安全天数`, '缺真实值；0为有效值，空白不补0']),
      ...bases.flatMap((item) =>
        result.months
          .slice(0, 3)
          .filter((period) => productionCalendarDays(item, period, productionDays) === null)
          .map((period) => [
            `B6 ${item} ${period}生产日历`,
            '人工天数为空、重复、无效，或月份超出已核验春节日历范围，请维护生产天数',
            period,
          ]),
      ),
    ];
    const textEntry = (label, value, change) =>
      h('input', {
        'aria-label': label,
        disabled: !batch.active,
        value: value ?? '',
        onChange: (event) => change(event.target.value),
      });
    const resourceRows = resources.map((resource, index) => [
      textEntry(`资源${index + 1} 唯一编号`, resource.id, (id) =>
        editEntry('resources', resources, index, { id }),
      ),
      textEntry(`资源${index + 1} 基地`, resource.base, (base) =>
        editEntry('resources', resources, index, { base }),
      ),
      h(
        'select',
        {
          'aria-label': `资源${index + 1} 类型`,
          disabled: !batch.active,
          value: resource.kind,
          onChange: (event) =>
            editEntry('resources', resources, index, { kind: event.target.value }),
        },
        h('option', { value: 'tunnel' }, '隧道'),
        h('option', { value: 'forming' }, '成型机'),
      ),
      textEntry(`资源${index + 1} 名称`, resource.name, (name) =>
        editEntry('resources', resources, index, { name }),
      ),
      numberInput(`资源${index + 1} 日产吨数`, resource.dailyTons, (dailyTons) =>
        editEntry('resources', resources, index, { dailyTons }),
      ),
      h(
        'button',
        {
          'aria-label': `删除资源${index + 1}`,
          disabled: !batch.active,
          onClick: () =>
            update({ resources: resources.filter((_, position) => position !== index) }),
        },
        '删除',
      ),
    ]);
    const assignmentRows = assignments.map((assignment, index) => [
      h(
        'select',
        {
          'aria-label': `分配${index + 1} 月份`,
          disabled: !batch.active,
          value: assignment.month,
          onChange: (event) =>
            editEntry('resourceAssignments', assignments, index, { month: event.target.value }),
        },
        result.months.slice(0, 3).map((item) => h('option', { key: item, value: item }, item)),
      ),
      textEntry(`分配${index + 1} 基地`, assignment.base, (base) =>
        editEntry('resourceAssignments', assignments, index, { base }),
      ),
      textEntry(`分配${index + 1} 产品编码`, assignment.code, (code) =>
        editEntry('resourceAssignments', assignments, index, { code }),
      ),
      h(
        'select',
        {
          'aria-label': `分配${index + 1} 资源`,
          disabled: !batch.active,
          value: assignment.resourceId,
          onChange: (event) =>
            editEntry('resourceAssignments', assignments, index, {
              resourceId: event.target.value,
            }),
        },
        h('option', { value: '' }, '选择明确资源'),
        resources
          .filter((item) => item.id && (!assignment.base || item.base === assignment.base))
          .map((item) =>
            h(
              'option',
              { key: item.id, value: item.id },
              `${item.id} · ${item.name} · ${item.kind === 'forming' ? '成型机' : '隧道'}`,
            ),
          ),
      ),
      numberInput(
        `分配${index + 1} 分配比例`,
        assignment.share,
        (share) => editEntry('resourceAssignments', assignments, index, { share }),
        1,
      ),
      h(
        'button',
        {
          'aria-label': `删除分配${index + 1}`,
          disabled: !batch.active,
          onClick: () =>
            update({
              resourceAssignments: assignments.filter((_, position) => position !== index),
            }),
        },
        '删除',
      ),
    ]);
    const applyConfiguration = () => {
      const number = (value, label, max = Number.MAX_SAFE_INTEGER) => {
        if (typeof value !== 'string') return value;
        if (!value.trim()) return null;
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
          const field = batch.fields.current.get(label);
          let fold = field?.closest('details');
          while (fold) {
            fold.open = true;
            fold = fold.parentElement?.closest('details');
          }
          field?.focus();
          throw Error(`${label}：请输入0至${max}之间的数值。`);
        }
        return parsed;
      };
      const changes = { ...configuration };
      if (changes.constraints)
        changes.constraints = {
          ...changes.constraints,
          ...(changes.constraints.safetyDays
            ? {
                safetyDays: changes.constraints.safetyDays.map((row) => ({
                  ...row,
                  days: number(row.days, `${row.base} 安全天数`),
                })),
              }
            : {}),
          ...(changes.constraints.turnoverDays
            ? {
                turnoverDays: changes.constraints.turnoverDays.map((row) => ({
                  ...row,
                  days: number(row.days, `${row.base} ${row.code} 补充目标周转天数`),
                })),
              }
            : {}),
        };
      if (changes.productionDays)
        changes.productionDays = changes.productionDays.map((row) => ({
          ...row,
          days: number(row.days, `${row.base} ${row.month} 生产天数`, 31),
        }));
      if (changes.unitWeights)
        changes.unitWeights = changes.unitWeights.map((row) => ({
          ...row,
          tonsPerPiece: number(row.tonsPerPiece, `${row.base} ${row.code} 件吨系数`),
        }));
      if (changes.resources)
        changes.resources = changes.resources.map((row, index) => ({
          ...row,
          dailyTons: number(row.dailyTons, `资源${index + 1} 日产吨数`),
        }));
      if (changes.resourceAssignments)
        changes.resourceAssignments = changes.resourceAssignments.map((row, index) => ({
          ...row,
          share: number(row.share, `分配${index + 1} 分配比例`, 1),
        }));
      if (Object.keys(changes).length) persistUpdate(changes);
      setConfiguration({});
    };
    react.useLayoutEffect(() => {
      if (step !== 'constraints') return;
      batch.commit.current = applyConfiguration;
      return () => {
        if (batch.commit.current === applyConfiguration) batch.commit.current = null;
      };
    }, [step, batch.commit, applyConfiguration]);
    const localRules = draft.constraints?.rules?.local ?? result.constraints.rules.local ?? [];
    return h(
      'section',
      {
        className: 'wf-page',
        'data-planning': planning,
        'aria-label': titles[step],
        onKeyDown: batch.keyDown,
      },
      h(
        'div',
        { className: 'wf-toolbar' },
        step !== 'constraints' && filterBar,
        h(
          'div',
          { className: 'wf-toolbar-actions' },
          step === 'process' &&
            h(
              react.Fragment,
              null,
              h('span', { className: 'dc-card-note' }, '全版本下载，不随下方筛选变化'),
              h(
                'button',
                { onClick: () => exportRows('需求拆分', processFields, true) },
                '下载需求拆分',
              ),
            ),
          ['process', 'constraints'].includes(step) &&
            h(Actions, {
              batch,
              requireReason: step === 'process',
              hint: step === 'constraints' ? '' : '留空恢复系统值',
            }),
        ),
      ),
      step !== 'constraints' &&
        result.scopeCoverage !== 'national' &&
        h(
          'p',
          {
            className: 'wf-pool-note',
          },
          '产品池全国覆盖尚未取得实际证明，仅报告范围内结果',
        ),
      h(ShipmentScopeNotice, {
        scope: result.categoryComputation.shipmentScope,
        month: draft.month,
      }),
      step === 'process'
        ? h(
            react.Fragment,
            null,
            h(ProcessedDemand, {
              draft,
              result,
              rows: filtered,
              filters: { base, month, category, search, onlyMissing },
              update,
              relations,
              shipmentSnapshot,
              table,
              card,
              onExplain: explain,
              batch,
            }),
            shareError
              ? h('p', { role: 'alert', className: 'wf-note wf-unavailable' }, shareError)
              : null,
            result.adjustmentIssues?.length
              ? h(
                  'p',
                  { role: 'status', className: 'wf-note wf-unavailable' },
                  `以下调整未生效：${result.adjustmentIssues.join('；')}。可从当前占比调整中撤销失效记录。`,
                )
              : null,
            (draft.adjustments?.shares?.length ?? 0) > 0 &&
              card(
                '当前占比调整',
                table(
                  '当前占比调整',
                  ['对象', '系统值', '输入占比', '有效占比', '原因', '时间', '状态', '操作'],
                  (draft.adjustments?.shares ?? []).map((item) => {
                    const row = result.rows.find((row) => row.id === item.rowId);
                    return [
                      shareIdentity(item.rowId),
                      numberText(row?.systemShare, true),
                      numberText(item.share, true),
                      numberText(row?.share, true),
                      item.reason,
                      item.at,
                      row ? '当前范围，核对有效值与未生效原因' : '不在当前产品范围，未生效',
                      h(
                        'button',
                        {
                          disabled: !onUndoShareAdjustment,
                          'aria-label': `撤销当前占比调整 ${shareIdentity(item.rowId)}`,
                          onClick: () => undoShare(item.rowId),
                        },
                        '撤销',
                      ),
                    ];
                  }),
                ),
              ),
            h(
              'details',
              { className: 'wf-disclosure' },
              h('summary', null, '来源诊断与缺项清单'),
              h(
                react.Fragment,
                null,
                (result.excludedCategoryDemand?.length ?? 0) > 0 &&
                  card(
                    '产品池外大类需求',
                    table(
                      '产品池外大类需求',
                      ['月份', '大类', '原始数量', '系统数量', '排除原因'],
                      result.excludedCategoryDemand.map((row) => [
                        row.month,
                        row.category,
                        numberText(row.quantity),
                        numberText(row.systemQuantity),
                        row.reason,
                      ]),
                    ),
                  ),
                h(SourceDiagnostics, { draft, result, table }),
              ),
            ),
          )
        : step === 'constraints'
          ? h(
              ConstraintPanel,
              {
                key: JSON.stringify([draft.id, draft.month, scopeGeneration]),
                draft,
                result,
                update,
                disabled: !batch.active,
                bases,
                table,
                card,
                previewRules: (local) =>
                  buildMpsWorkflow(
                    {
                      ...draft,
                      constraints: {
                        ...draft.constraints,
                        rules: { ...draft.constraints?.rules, local },
                      },
                    },
                    relations,
                    shipmentSnapshot,
                  ),
              },
              h(InventoryTargetPanel, {
                batch,
                key: JSON.stringify([draft.id, draft.month, scopeGeneration]),
                draft,
                result,
                update,
                sync: syncInventoryTargets,
                busy: inventoryTargetsBusy,
                table,
                card,
                policyRows: constraintRows,
              }),
              card(
                '可用生产天数',
                table(
                  '可用生产天数',
                  ['基地', '月份', '生产天数', '默认设置', '维护说明'],
                  productionRows,
                ),
              ),
              card(
                '件吨系数',
                h(
                  react.Fragment,
                  null,
                  h(
                    'p',
                    { className: 'wf-note' },
                    '人工值优先；未设人工值时，按最新产品清单的同基地SKU净重、重量单位与计量单位自动换算吨数。产品源有缺值或冲突时待补，不改用旧值。无该基地SKU记录时使用旧渠道系数；相关渠道均有正数且相同系数才可采用，不从产能比推算。',
                  ),
                  h(
                    'button',
                    {
                      onClick: () => syncWeights(),
                      disabled:
                        weightBusy ||
                        !weightCodes.length ||
                        !document.getElementById('agent-sql-config'),
                    },
                    weightBusy ? '读取中' : '读取件吨系数',
                  ),
                  weightError && h('p', { role: 'alert' }, weightError),
                  weightRead &&
                    h(
                      'p',
                      { className: 'wf-note' },
                      `已完整读取${weightRead.codes.length}个产品编码、${weightRead.rows.length}条渠道系数来源；读取配置${weightRead.configVersion}，${weightRead.readAt}。这不是主数据生效版本或全渠道覆盖证明。`,
                    ),
                  weightRead &&
                    h(
                      'button',
                      {
                        onClick: () =>
                          downloadCsv(
                            `${draft.month}-件吨系数来源.csv`,
                            ['产品编码', '渠道', '吨/件', '读取配置版本', '读取时间', '来源说明'],
                            weightRead.codes.flatMap((code) => {
                              const records = weightRead.rows.filter(
                                (row) => row.material_code === code,
                              );
                              return (records.length ? records : [{ material_code: code }]).map(
                                (row) => ({
                                  产品编码: code,
                                  渠道: row.channel_name,
                                  '吨/件': row.ton_per_piece,
                                  读取配置版本: weightRead.configVersion,
                                  读取时间: weightRead.readAt,
                                  来源说明: records.length
                                    ? '来源原值，适用渠道须按基地SKU维护；NULL不补0'
                                    : '无来源记录',
                                }),
                              );
                            }),
                          ),
                      },
                      '下载系数来源',
                    ),
                  table(
                    '件吨系数',
                    [
                      '基地',
                      '产品编码',
                      '产品名称',
                      '吨/件',
                      '适用渠道',
                      '来源候选',
                      '采用来源值',
                      '来源与缺项',
                    ],
                    weightRows,
                  ),
                ),
              ),
              card(
                '产能资源',
                h(
                  react.Fragment,
                  null,
                  h(
                    'p',
                    { className: 'wf-note' },
                    '每台隧道或成型机只登记一个唯一资源，不按SKU重复累计。濮阳合并与8:2外协尚无完整映射，暂不折入可用能力。',
                  ),
                  table(
                    '产能资源配置',
                    ['唯一编号', '基地', '类型', '名称', '日产吨数', '操作'],
                    resourceRows,
                  ),
                ),
                h(
                  'button',
                  {
                    disabled: !batch.active,
                    onClick: () =>
                      update({
                        resources: [
                          ...resources,
                          { id: '', base: '', kind: 'tunnel', name: '', dailyTons: null },
                        ],
                      }),
                  },
                  '新增产能资源',
                ),
              ),
              card(
                '资源分配',
                h(
                  react.Fragment,
                  null,
                  h(
                    'p',
                    { className: 'wf-note' },
                    '按基地、SKU、月份为隧道和成型机分别分配；每种资源类型的比例合计须为1。未分配或候选不明确时保留未评估。',
                  ),
                  table(
                    '资源分配配置',
                    ['月份', '基地', '产品编码', '资源', '分配比例', '操作'],
                    assignmentRows,
                  ),
                ),
                h(
                  'button',
                  {
                    disabled: !batch.active,
                    onClick: () =>
                      update({
                        resourceAssignments: [
                          ...assignments,
                          {
                            month: result.months[0],
                            base: '',
                            code: '',
                            resourceId: '',
                            share: null,
                          },
                        ],
                      }),
                  },
                  '新增资源分配',
                ),
              ),
              card(
                '正式约束来源',
                table(
                  '正式约束来源',
                  ['项目', '正式来源', '状态'],
                  [
                    [
                      '基地安全天数策略',
                      '正式策略来源待确认',
                      '按基地维护，保存在当前评估版本，三个月共用',
                    ],
                    [
                      'SKU源库存与周转天数对照',
                      'ai_db.agents_scm_goods_inventory_turnover_data_m',
                      '最终目标周转天数用于计算，库存与日均数量仅作对照',
                    ],
                    ['约束规则', '—', '正式来源未就绪'],
                  ],
                ),
                h('button', { disabled: true }, '保存正式配置'),
              ),
              h(
                'button',
                {
                  onClick: () =>
                    downloadCsv(
                      `${draft.month}-本地约束.csv`,
                      [
                        '评估版本',
                        '评估月份',
                        '基地',
                        '安全天数',
                        '约束内容',
                        '作用对象',
                        '强度',
                        '生效至',
                        '来源',
                        '状态',
                        '配置类型',
                        '月份',
                        '产品编码',
                        '生产天数',
                        '件吨系数',
                        '资源编号',
                        '资源类型',
                        '资源名称',
                        '日产吨数',
                        '分配比例',
                        '适用渠道',
                        '读取配置版本',
                        '读取时间',
                      ],
                      [
                        ...result.constraints.safetyDays.map((row) => ({
                          评估版本: draft.name,
                          评估月份: draft.month,
                          基地: row.base,
                          安全天数: row.days,
                          来源: '本地隔离草稿',
                        })),
                        ...productionDays.map((row) => ({
                          评估版本: draft.name,
                          评估月份: draft.month,
                          配置类型: '生产天数',
                          基地: row.base,
                          月份: row.month,
                          生产天数: row.days,
                        })),
                        ...weights.map((row) => ({
                          评估版本: draft.name,
                          评估月份: draft.month,
                          配置类型: '件吨系数',
                          基地: row.base,
                          产品编码: row.code,
                          件吨系数: row.tonsPerPiece,
                          适用渠道: row.channels,
                          读取配置版本: row.source?.configVersion,
                          读取时间: row.source?.readAt,
                        })),
                        ...resources.map((row) => ({
                          评估版本: draft.name,
                          评估月份: draft.month,
                          配置类型: '产能资源',
                          基地: row.base,
                          资源编号: row.id,
                          资源类型: row.kind,
                          资源名称: row.name,
                          日产吨数: row.dailyTons,
                        })),
                        ...assignments.map((row) => ({
                          评估版本: draft.name,
                          评估月份: draft.month,
                          配置类型: '资源分配',
                          月份: row.month,
                          基地: row.base,
                          产品编码: row.code,
                          资源编号: row.resourceId,
                          分配比例: row.share,
                        })),
                        ...inputGaps.map(([item, reason]) => ({
                          评估版本: draft.name,
                          评估月份: draft.month,
                          配置类型: '实际输入缺项',
                          来源: item,
                          状态: reason,
                        })),
                        ...localRules.map((rule) => ({
                          评估版本: draft.name,
                          评估月份: draft.month,
                          约束内容: rule.description,
                          作用对象: rule.target,
                          强度: rule.strength,
                          生效至: rule.until,
                          来源: '本地隔离草稿',
                          状态:
                            (result.ruleEvaluations ?? [])
                              .filter((entry) => entry.ruleId === rule.id)
                              .map((entry) => `${entry.month} ${entry.status}: ${entry.reason}`)
                              .join('；') || '待完善规则参数',
                        })),
                      ],
                    ),
                },
                '下载本地配置',
              ),
            )
          : h(
              react.Fragment,
              null,
              h(EvaluationOverview, {
                step,
                draft,
                currentEvaluation,
                stale: evaluationStale,
                executing,
                preparingInputs,
                error: evaluationError,
                onExecute: executeEvaluation,
                filters: { base, month, category, search, onlyMissing },
                table,
                card,
                numberText,
              }),
              h(
                'div',
                { className: 'wf-actions' },
                h(
                  'button',
                  { onClick: () => exportRows('需求推导参考', planFields) },
                  '下载需求推导参考',
                ),
              ),
            ),
      ['process', 'constraints'].includes(step) && result.missing.length
        ? h(
            'details',
            { className: 'wf-limitations', role: 'status' },
            h('summary', null, `计算说明与缺项 · ${result.missing.length}条`),
            h(
              'ul',
              null,
              result.missing.map((reason) => h('li', { key: reason }, reason)),
            ),
          )
        : null,
      step === 'report' &&
        h('div', { className: 'wf-actions' }, h('button', { disabled: true }, '保存正式报告')),
      formula
        ? h(
            Dialog,
            { title: formula.title, close: () => setFormula(null) },
            h('p', null, formula.expression || '当前输入源值'),
            h(
              'p',
              { className: formula.missing.length ? 'wf-unavailable' : undefined },
              `${formula.value == null ? '未评估' : `结果：${numberText(formula.value, formula.percent)}`}`,
            ),
          )
        : null,
    );
  };
}
