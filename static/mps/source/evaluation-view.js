import { createCapacityReport } from './capacity-report-view.js';
import {
  turnoverDaysSources,
  inventoryDependencyFields,
  inventoryDependencyColumns,
} from './inventory-target-view.js';

const valid = (value) => typeof value === 'number' && Number.isFinite(value);
const reportMissing = (row) => row.reportMissing ?? row.planMissing;
const reportStatus = (row) => {
  const missing = reportMissing(row).join('；');
  const status = missing || (row.unfulfilled > 0 ? '供应受限，未满足量已单列' : '已评估');
  const result =
    row.reportIssueKinds?.includes('下市品产生需求') && !status.includes('下市品产生需求')
      ? `${status}；下市品产生需求`
      : status;
  const supply =
    row.supplyMode === 'odm' ? `${result}；ODM按净缺口默认估算，供方能力及实际到货未验证` : result;
  return row.safetyDaysSource === 'missing-turnover-days-zero'
    ? `${supply}；源周转天数待补，临时按0天`
    : supply;
};
const fields = [
  'openingInventory',
  'demand',
  'requiredProduction',
  'projectedClosing',
  'requiredProductionTons',
];

export function workflowContextPreview(value) {
  if (typeof value === 'string') return value.length > 200 ? value.slice(0, 200) + '…' : value;
  if (Array.isArray(value)) return value.slice(0, 10).map(workflowContextPreview);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) => [
        [key, workflowContextPreview(item)],
        ...(Array.isArray(item) && item.length > 10 ? [[key + 'Total', item.length]] : []),
      ]),
    );
  return value;
}

export function summarizeEvaluation(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.month, row.base]);
    if (!groups.has(key))
      groups.set(key, { month: row.month, base: row.base, rows: [], metrics: {} });
    groups.get(key).rows.push(row);
  }
  for (const group of groups.values()) {
    for (const field of fields) {
      const values = group.rows.map((row) => row[field]).filter(valid);
      group.metrics[field] = {
        value: values.length ? values.reduce((sum, value) => sum + value, 0) : null,
        known: values.length,
        missing: group.rows.length - values.length,
      };
    }
  }
  return [...groups.values()].sort(
    (a, b) => a.month.localeCompare(b.month) || a.base.localeCompare(b.base, 'zh-CN'),
  );
}

export function planContext(plan, visible, { base, month }) {
  const ids = new Set(visible.map((row) => row.id));
  const fields = [
    'id',
    'month',
    'base',
    'code',
    'name',
    'category',
    'group',
    'demand',
    'openingInventory',
    'targetInventory',
    'requiredProduction',
    'mainPlan',
    'supplyMode',
    'odmArrival',
    'odmArrivalTons',
    'transferIn',
    'transferOut',
    'closingInventory',
    'fulfilledDemand',
    'fulfillment',
    'unfulfilled',
  ];
  const resources = plan.resourceSchedules.filter(
    (row) => (!base || row.base === base) && (!month || row.month === month),
  );
  const transfers = plan.transfers.filter(
    (row) => (!base || row.from === base || row.to === base) && (!month || row.month === month),
  );
  return {
    scopeStatus: plan.partial ? 'partial' : 'in-scope',
    excludedShipmentCount: plan.excludedShipments?.length ?? 0,
    summary: plan.summary,
    sources: plan.sources,
    rows: plan.rows
      .filter((row) => ids.has(row.id))
      .slice(0, 25)
      .map((row) => ({
        ...Object.fromEntries(fields.map((field) => [field, row[field]])),
        missing: reportMissing(row)
          .slice(0, 3)
          .map((reason) => reason.slice(0, 200)),
        missingCount: reportMissing(row).length,
        issueKinds: row.reportIssueKinds,
        supplyTags: row.supplyTags,
      })),
    resources: resources.slice(0, 25),
    resourceTotal: resources.length,
    transfers: transfers.slice(0, 25),
    transferTotal: transfers.length,
    odmSchedules: (plan.odmSchedules ?? [])
      .filter((row) => !month || row.month === month)
      .slice(0, 25),
    odmBasis: 'ODM默认计划到货量按件/月估算，不代表已验证的供方产能或实际到货',
    preview: '单品按当前页，资源与调拨最多25条；完整数据在页面和导出中查看',
  };
}

export function createEvaluationOverview(react, { downloadCsv, Dialog }) {
  const CapacityReport = createCapacityReport(react, { downloadCsv, Dialog });
  const h = react.createElement;
  const plannedFields = [
    'demand',
    'openingInventory',
    'mainPlan',
    'odmArrival',
    'transferIn',
    'transferOut',
    'targetInventory',
    'closingInventory',
    'unfulfilled',
  ];
  const labels = [
    '需求数量',
    '期初库存',
    '内部实际排产量',
    'ODM默认计划到货量',
    '调入',
    '调出',
    '目标期末库存',
    '实际期末库存',
    '未满足供应量',
  ];
  const known = (rows, field) => {
    const values = rows.map((row) => row[field]).filter(valid);
    return {
      value: values.length ? values.reduce((sum, value) => sum + value, 0) : null,
      missing: rows.length - values.length,
    };
  };
  return function EvaluationOverview({
    step,
    draft,
    currentEvaluation,
    stale,
    executing,
    preparingInputs = false,
    error,
    onExecute,
    filters,
    table,
    card,
    numberText,
  }) {
    const [trace, setTrace] = react.useState(null);
    const [skuPages, setSkuPages] = react.useState({});
    const [detailPages, setDetailPages] = react.useState({});
    const [expanded, setExpanded] = react.useState({});
    const [reportOpen, setReportOpen] = react.useState(null);
    const [detailSelection, setDetailSelection] = react.useState({});
    const [issueKind, setIssueKind] = react.useState('');
    const plan = currentEvaluation?.result.plan;
    const stamp = currentEvaluation?.at;
    react.useEffect(() => {
      setTrace(null);
      setSkuPages({});
      setReportOpen(null);
      setDetailSelection({});
      setDetailPages({});
      setIssueKind('');
    }, [stamp, filters.month, filters.base, filters.category, filters.search, filters.onlyMissing]);
    const physicalRows = react.useMemo(() => {
      if (!plan) return [];
      const rows = [...plan.rows];
      const donorPairs = new Map();
      for (const item of plan.allocations) {
        if (
          rows.some(
            (row) => row.month === item.month && row.base === item.base && row.code === item.code,
          )
        )
          continue;
        const key = JSON.stringify([item.month, item.base, item.code]);
        const donor = donorPairs.get(key) ?? {
          ...plan.rows.find((row) => row.id === item.rowId),
          id: key,
          month: item.month,
          base: item.base,
          demand: null,
          openingInventory: null,
          mainPlan: 0,
          transferIn: 0,
          transferOut: 0,
          targetInventory: null,
          closingInventory: null,
          unfulfilled: null,
          planMissing: ['仅调拨承接生产，未取得本基地需求与库存'],
        };
        donor.mainPlan += item.quantity;
        donor.transferOut += item.quantity;
        donorPairs.set(key, donor);
      }
      return [...rows, ...donorPairs.values()];
    }, [plan]);
    const matches = (row) =>
      (!filters.month || row.month === filters.month) &&
      (!filters.base || row.base === filters.base) &&
      (!filters.category || row.category === filters.category) &&
      (!filters.search ||
        [row.code, row.name, row.series, row.group].some((value) =>
          String(value ?? '').includes(filters.search),
        )) &&
      (!filters.onlyMissing ||
        row.planMissing.length ||
        row.unfulfilled > 0 ||
        row.reportIssueKinds?.length);
    const reportRows = physicalRows.filter(matches);
    const demandRows = (plan?.rows ?? []).filter(matches);
    const visibleKeys = new Set(
      demandRows.map((row) => JSON.stringify([row.month, row.base, row.code])),
    );
    const issues = (plan?.reportIssues ?? []).filter((row) =>
      visibleKeys.has(JSON.stringify([row.month, row.base, row.code])),
    );
    const issueKinds = [
      ...new Set([
        '下市品产生需求',
        '缺产线产能',
        '缺调拨关系',
        '缺件吨系数',
        ...issues.map((row) => row.kind),
      ]),
    ];
    const selectedIssues = issues.filter((row) => !issueKind || row.kind === issueKind);
    const issuesByRow = Map.groupBy(issues, (row) =>
      JSON.stringify([row.month, row.base, row.code]),
    );
    const reportGroups = [
      ...Map.groupBy(reportRows, (row) => JSON.stringify([row.month, row.base])).values(),
    ].map((rows) => ({ month: rows[0].month, base: rows[0].base, rows }));
    const metric = (rows, field) => {
      const data = known(rows, field);
      return h(
        'span',
        {
          className: 'wf-summary-value',
          title: data.missing
            ? `${data.missing}项缺失${data.value === null ? '' : '，当前为已知小计'}`
            : undefined,
        },
        numberText(data.value),
        data.missing && data.value !== null
          ? h('sup', { 'aria-label': '已知小计，含缺项' }, '*')
          : null,
      );
    };
    const paginate = (name, columns, rows, key, render = (row) => row) => {
      const page = Math.min(detailPages[key] ?? 0, Math.max(0, Math.ceil(rows.length / 25) - 1));
      return h(
        react.Fragment,
        null,
        table(name, columns, rows.slice(page * 25, (page + 1) * 25).map(render)),
        h(
          'div',
          { className: 'wf-plan-pagination' },
          h('span', null, `共${rows.length}条 · 每页25条 · 第${page + 1}页`),
          h(
            'button',
            {
              disabled: page === 0,
              onClick: () => setDetailPages({ ...detailPages, [key]: page - 1 }),
            },
            '上一页',
          ),
          h(
            'button',
            {
              disabled: (page + 1) * 25 >= rows.length,
              onClick: () => setDetailPages({ ...detailPages, [key]: page + 1 }),
            },
            '下一页',
          ),
        ),
      );
    };
    const disclosure = (name, count, body) =>
      h(
        'details',
        {
          className: 'wf-plan-disclosure',
          onToggle: (event) => setExpanded((value) => ({ ...value, [name]: event.target.open })),
        },
        h('summary', null, name, h('span', null, `${count}条`)),
        expanded[name] ? body() : null,
      );
    const active = Boolean(plan?.summary.totalRows && !stale && !executing && !error);
    const status = preparingInputs
      ? '正在准备需求、发货与库存输入'
      : executing
        ? '正在评估当前版本'
        : error
          ? error.includes('已取消')
            ? '本轮评估已取消，请重新评估'
            : '本次评估失败，上次结果仅供参考'
          : !plan
            ? '尚未评估'
            : stale
              ? '输入已变化，需重新评估'
              : plan.partial && plan.status === 'complete'
                ? '参与范围内已完成求解，待定单品仍需补齐'
                : plan.status === 'complete'
                  ? '已完成求解'
                  : plan.summary.evaluatedRows
                    ? '部分可评估，缺项已单列'
                    : plan.summary.totalRows
                      ? '计算已完成，排产缺项待人工补齐'
                      : '缺需求单品范围，尚未生成排产';
    const exportPlan = () => {
      if (!active) return;
      const rows = reportRows.map((row) => ({
        评估版本: draft.name,
        计算范围: plan.partial ? '部分可计算，待定单品已排除' : '当前参与范围',
        排除单品记录数: plan.excludedShipments?.length ?? 0,
        结果时间: stamp,
        月份: row.month,
        基地: row.base,
        大类: row.category,
        系列: row.series,
        物料组: row.group,
        产品编码: row.code,
        产品名称: row.name,
        历史参考物料编码: row.historyCode || row.code,
        历史源数量: row.historyReferenceQuantity,
        自身历史源数量: row.historyOwnQuantity,
        自身历史源记录数: row.historyOwnRows,
        替换品历史源记录数: row.historyReferenceRows,
        历史合计数量: row.historyQuantity,
        替换系数: row.historyCode ? (row.historyFactor === undefined ? 1 : row.historyFactor) : '',
        历史参考口径:
          row.historyCode && row.historyCode !== row.code
            ? '同基地自身历史＋替换品历史×替换系数；同码一次、不递归'
            : '自身历史，同码只计一次',
        ...Object.fromEntries(plannedFields.map((field, index) => [labels[index], row[field]])),
        需求已满足量: row.fulfilledDemand,
        ODM默认计划到货吨数: row.odmArrivalTons,
        ODM估算说明: row.odmBasis,
        供应满足率: row.fulfillment,
        有效目标周转天数: row.safetyDays,
        周转天数口径: turnoverDaysSources[row.safetyDaysSource],
        源目标周转天数: row.turnoverPolicy?.sourceDays,
        ...inventoryDependencyFields(row),
        状态: reportStatus(row),
        问题分类: row.reportIssueKinds?.join('；'),
        来源标签: row.supplyTags,
        标签所属月: row.supplySourceMonth,
        异常说明: (issuesByRow.get(JSON.stringify([row.month, row.base, row.code])) ?? [])
          .map((issue) => issue.reason)
          .join('；'),
        需人工补齐: [
          ...new Set(
            (issuesByRow.get(JSON.stringify([row.month, row.base, row.code])) ?? []).map(
              (issue) => issue.action,
            ),
          ),
        ].join('；'),
      }));
      downloadCsv(
        `${draft.month}-${step === 'report' ? '产销存结果' : '求解结果'}.csv`,
        [
          '评估版本',
          '计算范围',
          '排除单品记录数',
          '结果时间',
          '月份',
          '基地',
          '大类',
          '系列',
          '物料组',
          '产品编码',
          '产品名称',
          '历史参考物料编码',
          '历史源数量',
          '自身历史源数量',
          '自身历史源记录数',
          '替换品历史源记录数',
          '历史合计数量',
          '替换系数',
          '历史参考口径',
          ...labels,
          '需求已满足量',
          'ODM默认计划到货吨数',
          'ODM估算说明',
          '供应满足率',
          '有效目标周转天数',
          '周转天数口径',
          '源目标周转天数',
          ...inventoryDependencyColumns,
          '状态',
          '问题分类',
          '来源标签',
          '标签所属月',
          '异常说明',
          '需人工补齐',
        ],
        rows,
      );
    };
    const formula = (row, field) => {
      const value = (item) => (item == null ? '未提供' : String(item));
      const missing = reportMissing(row).join('；');
      const explanation =
        field === 'closingInventory'
          ? `可用量=${value(row.openingInventory)}+${value(row.mainPlan)}+${value(row.odmArrival)}+${value(row.transferIn)}-${value(row.transferOut)}；扣除本期已满足需求${value(row.fulfilledDemand)}，期末=${value(row.closingInventory)}。未满足需求单列，不自动修改下月原需求。`
          : field === 'odmArrival'
            ? `ODM默认计划到货量按件/月估算：单基地净缺口=max(0,有效需求+目标期末库存-可用期初库存)；多基地按同一供方SKU月汇总净缺口，在收货点记录一次到货，后续逐段调拨。当前收货点计划到货=${value(row.odmArrival)}件。内部排产为0；${row.odmBasis || '默认估算，供方真实能力、交期及实际到货尚未验证'}。`
            : field === 'mainPlan'
              ? row.supplyMode === 'odm'
                ? '该SKU按ODM外部供应计算，内部排产量为0，不消耗内部产线产能；默认计划到货和后续调拨单列。'
                : `待生产需求=${value(row.demand)}+${value(row.targetInventory)}-${value(row.openingInventory)}，非负需求=${value(row.requiredProduction)}；同资源SKU按共同满足率分配，并逐资源校验不超产能。本基地实际排产=${value(row.mainPlan)}件，调入=${value(row.transferIn)}件，未满足生产=${value(row.unfulfilled)}件。`
              : `同一求解结果：需求${value(row.demand)}，期初${value(row.openingInventory)}，目标期末${value(row.targetInventory)}，本基地排产${value(row.mainPlan)}，ODM默认计划到货${value(row.odmArrival)}，调入${value(row.transferIn)}，调出${value(row.transferOut)}，已满足需求${value(row.fulfilledDemand)}，实际期末${value(row.closingInventory)}。`;
      setTrace({
        title: `${row.base} ${row.name || row.code} · ${labels[plannedFields.indexOf(field)] || field}`,
        text: missing || explanation,
      });
    };
    const quantityCell = (row, field) =>
      h(
        'button',
        {
          className: 'wf-number',
          onClick: () => formula(row, field),
          'aria-label': `${row.base} ${row.code} ${row.month} ${labels[plannedFields.indexOf(field)]} 求解过程`,
        },
        numberText(row[field]),
      );
    const detail = (rows, key) => {
      const selection = detailSelection[key] ?? {};
      const categories = [...new Set(rows.map((row) => row.category || '分类待补'))];
      const category = categories.includes(selection.category) ? selection.category : categories[0];
      const categoryRows = rows.filter((row) => (row.category || '分类待补') === category);
      const groups = [...new Set(categoryRows.map((row) => row.group || '物料组待补'))];
      const group = groups.includes(selection.group) ? selection.group : groups[0];
      const selected = categoryRows.filter((row) => (row.group || '物料组待补') === group);
      const pageKey = `${key}/${category}/${group}`;
      const page = Math.min(
        skuPages[pageKey] ?? 0,
        Math.max(0, Math.ceil(selected.length / 25) - 1),
      );
      return h(
        react.Fragment,
        null,
        h(
          'div',
          { className: 'wf-plan-detail-filters' },
          h(
            'label',
            null,
            '大类',
            h(
              'select',
              {
                'aria-label': '单品明细大类',
                value: category,
                onChange: (event) =>
                  setDetailSelection({
                    ...detailSelection,
                    [key]: { category: event.target.value },
                  }),
              },
              categories.map((value) => h('option', { key: value, value }, value)),
            ),
          ),
          h(
            'label',
            null,
            '物料组',
            h(
              'select',
              {
                'aria-label': '单品明细物料组',
                value: group,
                onChange: (event) =>
                  setDetailSelection({
                    ...detailSelection,
                    [key]: { category, group: event.target.value },
                  }),
              },
              groups.map((value) => {
                const sample = categoryRows.find((row) => (row.group || '物料组待补') === value);
                return h(
                  'option',
                  { key: value, value },
                  `${value}${sample.series ? ` · ${sample.series}` : ''}`,
                );
              }),
            ),
          ),
          h('span', null, `${selected.length}个单品`),
        ),
        table(
          '求解单品明细',
          ['产品编码', '产品名称', ...labels, '状态'],
          selected
            .slice(page * 25, (page + 1) * 25)
            .map((row) => [
              row.code,
              h('span', { className: 'wf-plan-product-name', title: row.name }, row.name),
              ...plannedFields.map((field) => quantityCell(row, field)),
              reportStatus(row),
            ]),
        ),
        h(
          'div',
          { className: 'dc-card-foot' },
          `共${selected.length}个单品 · 第${page + 1}页`,
          h(
            'button',
            {
              disabled: page === 0,
              onClick: () => setSkuPages({ ...skuPages, [pageKey]: page - 1 }),
            },
            '上一页单品',
          ),
          h(
            'button',
            {
              disabled: (page + 1) * 25 >= selected.length,
              onClick: () => setSkuPages({ ...skuPages, [pageKey]: page + 1 }),
            },
            '下一页单品',
          ),
        ),
      );
    };
    const balances = () =>
      card(
        '滚动主计划与产销存',
        h(
          react.Fragment,
          null,
          h(
            'p',
            { className: 'wf-note' },
            '单位：件。带 * 的数值为已知小计，缺项在状态列标注。展开基地查看大类、物料组与单品。',
          ),
          h(
            'div',
            { className: 'dc-table-scroll wf-plan-balances' },
            h(
              'table',
              { 'aria-label': '产销存汇总' },
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  ['计划月', '基地', ...labels, '状态 / 明细'].map((name) =>
                    h('th', { key: name }, name),
                  ),
                ),
              ),
              h(
                'tbody',
                null,
                reportGroups.length
                  ? reportGroups.map((group) => {
                      const key = JSON.stringify([group.month, group.base]);
                      const missing = group.rows.filter((row) => row.planMissing.length).length;
                      const shortage = group.rows.filter((row) => row.unfulfilled > 0).length;
                      return h(
                        react.Fragment,
                        { key },
                        h(
                          'tr',
                          { className: reportOpen === key ? 'wf-plan-selected' : undefined },
                          h('td', null, group.month),
                          h('td', null, group.base),
                          ...plannedFields.map((field) =>
                            h(
                              'td',
                              { key: field, className: 'wf-plan-number' },
                              metric(group.rows, field),
                            ),
                          ),
                          h(
                            'td',
                            null,
                            h(
                              'span',
                              { className: 'wf-plan-row-status' },
                              missing
                                ? `${missing}个单品待补`
                                : shortage
                                  ? `${shortage}个单品有缺口`
                                  : '已评估',
                            ),
                            h(
                              'button',
                              {
                                className: 'dc-link',
                                'aria-expanded': reportOpen === key,
                                onClick: () => setReportOpen(reportOpen === key ? null : key),
                              },
                              `${reportOpen === key ? '收起' : '展开'} ${group.rows.length}个单品`,
                            ),
                          ),
                        ),
                        reportOpen === key
                          ? h(
                              'tr',
                              { className: 'wf-plan-detail-row' },
                              h(
                                'td',
                                { colSpan: labels.length + 3 },
                                h(
                                  'div',
                                  { className: 'wf-plan-detail-title' },
                                  `${group.month} / ${group.base} · 单品明细`,
                                ),
                                detail(group.rows, key),
                              ),
                            )
                          : null,
                      );
                    })
                  : h(
                      'tr',
                      null,
                      h(
                        'td',
                        { colSpan: labels.length + 3, className: 'wf-empty' },
                        '当前筛选没有计划明细',
                      ),
                    ),
              ),
            ),
          ),
        ),
      );

    return h(
      react.Fragment,
      null,
      card(
        step === 'capacity' ? '产能评估 · 求解过程' : '产销存报告 · 结果状态',
        h(
          'div',
          {
            className: 'wf-plan-toolbar',
            'data-state':
              !plan || stale || error || !plan.summary.evaluatedRows
                ? 'pending'
                : plan.partial
                  ? 'partial'
                  : plan.status === 'complete'
                    ? 'complete'
                    : 'partial',
          },
          h(
            'div',
            { className: 'wf-plan-status', role: 'status' },
            h('strong', null, status),
            h(
              'span',
              null,
              stamp
                ? `生成于 ${stamp} · 已评估 ${plan.summary.evaluatedRows}/${plan.summary.totalRows} 个单品月份`
                : '按当前版本的数据与约束执行评估',
            ),
          ),
          step === 'capacity'
            ? h(
                'button',
                {
                  className: 'dc-primary',
                  disabled: executing || preparingInputs,
                  onClick: onExecute,
                },
                preparingInputs
                  ? '输入准备中…'
                  : executing
                    ? '评估中…'
                    : plan
                      ? '重新评估'
                      : '执行评估',
              )
            : null,
          h(
            'button',
            { disabled: !active, onClick: exportPlan },
            step === 'capacity' ? '导出求解结果' : '导出产销存结果',
          ),
        ),
      ),
      error ? h('p', { role: 'alert' }, error) : null,
      plan && !stale && !executing && !error
        ? h(
            'p',
            { className: 'wf-note' },
            '输入齐备的单品继续排产并汇总已知结果；缺项保留在对应基地、SKU和月份，未取得的数据不计为0。请按问题清单补齐后重新评估。',
          )
        : null,
      plan?.rows.some((row) => row.safetyDaysSource === 'missing-turnover-days-zero')
        ? h(
            'p',
            { className: 'wf-note', role: 'status' },
            `本轮${plan.rows.filter((row) => row.safetyDaysSource === 'missing-turnover-days-zero').length}个单品月份缺源目标周转天数，临时按0天计算目标库存，源缺项保留在第五步待补清单，补齐后重新评估。`,
          )
        : null,
      !plan
        ? h(
            'p',
            { className: 'wf-note' },
            step === 'capacity'
              ? (draft.resources ?? []).some((row) => row.kind === 'forming')
                ? '执行评估使用隧道及显式配置的成型机、件吨系数、生产日历和合法调拨路径。已配置的设备共同限制同一产量，缺项按单品列出。'
                : '执行评估使用隧道产能、件吨系数、生产日历及合法调拨路径，按公平满足率分配；缺项按单品列出，其他有效范围继续计算。'
              : '请先在第六步执行评估。本页只展示同一份求解结果，不独立计算。',
          )
        : h(
            react.Fragment,
            null,
            step === 'capacity'
              ? h(CapacityReport, { plan, draft, stamp, filters, card, table, numberText, active })
              : null,
            card(
              '问题分类与补充清单',
              h(
                react.Fragment,
                null,
                h(
                  'p',
                  { className: 'wf-note' },
                  issueKinds
                    .map((kind) => `${kind} ${issues.filter((row) => row.kind === kind).length}项`)
                    .join('；'),
                ),
                h(
                  'button',
                  {
                    disabled: !active,
                    onClick: () =>
                      downloadCsv(
                        `${draft.month}-分类问题清单.csv`,
                        [
                          '评估版本',
                          '结果时间',
                          '需求月份',
                          '基地',
                          '产品编码',
                          '产品名称',
                          '问题分类',
                          '来源标签',
                          '标签所属月',
                          '需求数量',
                          '源表',
                          '字段',
                          '源值与证据',
                          '核对处理',
                          '处理性质',
                          '根因月份',
                          '根因链',
                          '根因源表',
                          '根因字段',
                        ],
                        selectedIssues.map((row) => ({
                          评估版本: draft.name,
                          结果时间: stamp,
                          需求月份: row.month,
                          基地: row.base,
                          产品编码: row.code,
                          产品名称: row.name,
                          问题分类: row.kind,
                          来源标签: row.tags,
                          标签所属月: row.sourceMonth,
                          需求数量: row.demand,
                          源表: row.sourceTable,
                          字段: row.sourceFields,
                          源值与证据: row.reason,
                          核对处理: row.action,
                          根因月份: row.rootMonth,
                          根因链: row.rootCause,
                          根因源表: row.rootSourceTable,
                          根因字段: row.rootSourceFields,
                          处理性质: row.blocking
                            ? '仅影响对应基地SKU月份，补齐后重算'
                            : row.kind === '拆分依据待补'
                              ? '来源缺项提示，不阻断当前零需求'
                              : row.kind === '缺件吨系数'
                                ? '来源缺项提示，不阻断当前件数计划；吨数报告待补'
                                : '下市风险提示，原需求保留',
                        })),
                      ),
                  },
                  '导出分类问题清单',
                ),
                disclosure('查看分类问题明细', issues.length, () =>
                  h(
                    react.Fragment,
                    null,
                    h(
                      'label',
                      null,
                      '问题分类',
                      h(
                        'select',
                        {
                          'aria-label': '问题分类筛选',
                          value: issueKind,
                          onChange: (event) => {
                            setIssueKind(event.target.value);
                            setDetailPages((value) => ({ ...value, classifiedIssues: 0 }));
                          },
                        },
                        h('option', { value: '' }, '全部'),
                        issueKinds.map((kind) => h('option', { key: kind, value: kind }, kind)),
                      ),
                    ),
                    paginate(
                      '分类问题明细',
                      [
                        '需求月份',
                        '问题分类',
                        '基地',
                        '产品编码',
                        '产品名称',
                        '来源标签 / 所属月',
                        '源值与证据',
                        '源表 / 字段',
                        '核对处理',
                      ],
                      selectedIssues,
                      'classifiedIssues',
                      (row) => [
                        row.month,
                        row.kind,
                        row.base,
                        row.code,
                        row.name,
                        `${row.tags || '未提供'} / ${row.sourceMonth || '未提供'}`,
                        row.reason,
                        `${row.sourceTable} / ${row.sourceFields}`,
                        row.action,
                      ],
                    ),
                  ),
                ),
              ),
            ),
            step === 'report'
              ? h(
                  react.Fragment,
                  null,
                  h(
                    'div',
                    { className: 'wf-plan-months' },
                    plan.months.map((month) => {
                      const rows = physicalRows.filter((row) => row.month === month);
                      const total = known(rows, 'mainPlan');
                      return h(
                        'section',
                        { key: month, className: 'dc-card wf-plan-month' },
                        h('h3', null, `${month} 内部排产量`),
                        h(
                          'div',
                          { className: 'wf-plan-month-value' },
                          metric(rows, 'mainPlan'),
                          h('span', null, '件'),
                        ),
                        h(
                          'p',
                          null,
                          'ODM默认计划到货 ',
                          metric(rows, 'odmArrival'),
                          ' 件，按净缺口估算，供方实际到货未验证。',
                        ),
                        h(
                          'p',
                          null,
                          total.missing
                            ? `${total.missing}个单品待补，已有数据按已知小计展示`
                            : '产能约束后的实际排产',
                        ),
                      );
                    }),
                  ),
                  balances(),
                )
              : h(
                  react.Fragment,
                  null,
                  disclosure(
                    '未覆盖缺口与公平分配',
                    demandRows.filter((row) => row.unfulfilled > 0 || row.planMissing.length)
                      .length,
                    () =>
                      h(
                        react.Fragment,
                        null,
                        paginate(
                          '求解缺口明细',
                          [
                            '月份',
                            '基地',
                            '单品',
                            '待生产需求（件）',
                            '分配供应量（件）',
                            '满足率',
                            '未满足量（件）',
                            '状态',
                          ],
                          demandRows
                            .filter((row) => row.unfulfilled > 0 || row.planMissing.length)
                            .map((row) => [
                              row.month,
                              row.base,
                              row.code,
                              numberText(row.requiredProduction),
                              row.fulfillment === null
                                ? '—'
                                : numberText((row.requiredProduction ?? 0) * row.fulfillment),
                              numberText(row.fulfillment, true),
                              numberText(row.unfulfilled),
                              reportStatus(row),
                            ]),
                          'gaps',
                        ),
                        h(
                          'p',
                          { className: 'wf-note' },
                          '缺输入与产能不足分别标注。完整结果可导出，处置由人工评估。',
                        ),
                      ),
                  ),
                ),
          ),
      trace
        ? h(Dialog, { title: trace.title, close: () => setTrace(null) }, h('p', null, trace.text))
        : null,
    );
  };
}
