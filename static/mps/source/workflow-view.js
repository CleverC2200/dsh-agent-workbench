import { buildMpsWorkflow } from './workflow-inputs.js';

const titles = {
  process: '需求加工与收敛',
  constraints: '约束与配置',
  capacity: '产能评估与缺口',
  report: '产销存报告',
};
const labels = {
  reportQuantity: '提报数量',
  historyQuantity: '历史发货数量',
  reportShare: '提报占比',
  historyShare: '历史占比',
  systemShare: '系统占比',
  share: '有效占比',
  nextMonthDemand: '下一月需求参考',
  requiredProduction: '所需生产量',
  projectedClosing: '无约束期末库存',
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
const sourceText = '①大类需求；②月末结存；③两路占比；④源产能；⑤本地配置';

export function createWorkflow(react, useMpsPart, { downloadCsv, Dialog }) {
  const h = react.createElement;
  return function Workflow({
    step,
    draft,
    update,
    relations,
    shipmentSnapshot,
    onNext,
    onShareAdjustment,
    onUndoShareAdjustment,
  }) {
    const [search, setSearch] = react.useState('');
    const [base, setBase] = react.useState('');
    const [category, setCategory] = react.useState('');
    const [month, setMonth] = react.useState('');
    const [onlyMissing, setOnlyMissing] = react.useState(false);
    const [page, setPage] = react.useState(0);
    const [formula, setFormula] = react.useState(null);
    const [editingShare, setEditingShare] = react.useState(null);
    const [shareError, setShareError] = react.useState('');
    const result = react.useMemo(
      () => buildMpsWorkflow(draft, relations, shipmentSnapshot),
      [draft, relations, shipmentSnapshot],
    );
    const fields = step === 'process' ? processFields : planFields;
    const bases = [
      ...new Set(
        [
          ...result.rows.map((row) => row.base),
          ...result.constraints.safetyDays.map((row) => row.base),
        ].filter(Boolean),
      ),
    ];
    const categories = [...new Set(result.categoryRows.map((row) => row.category))];
    const filtered = result.rows.filter(
      (row) =>
        (!base || row.base === base) &&
        (!category || row.category === category) &&
        (!month || row.month === month) &&
        (!onlyMissing || reasons(row, fields).length) &&
        (!search || identityColumns.some(([key]) => display(row[key]).includes(search))),
    );
    const categoryRows = result.categoryRows.filter(
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
      setEditingShare(null);
      setShareError('');
    }
    useMpsPart(
      react,
      step,
      {
        evaluation: result.context,
        months: result.months,
        shipmentMonth: result.shipmentMonth,
        filter: { search, base, category, month, onlyMissing },
        categoryRows,
        rows: visible,
        total: result.rows.length,
        filteredTotal: filtered.length,
        page: pageIndex + 1,
        constraints: result.constraints,
        productionDays: draft.productionDays ?? [],
        unitWeights: draft.unitWeights ?? [],
        resources: draft.resources ?? [],
        resourceAssignments: draft.resourceAssignments ?? [],
        resourceLoads: result.resourceLoads ?? [],
        summary: result.summary,
        adjustments: draft.adjustments,
        adjustmentIssues: result.adjustmentIssues ?? [],
        missing: result.missing,
        businessSave: 'not-connected',
      },
      titles[step],
    );
    const table = (name, columns, rows) =>
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
              columns.map((column) => h('th', { key: column }, column)),
            ),
          ),
          h(
            'tbody',
            null,
            rows.length
              ? rows.map((cells, index) =>
                  h(
                    'tr',
                    { key: index },
                    cells.map((cell, position) => h('td', { key: position }, cell)),
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
    const next =
      step === 'process'
        ? '主数据对应关系'
        : step === 'constraints'
          ? '产能评估与缺口'
          : '产销存报告';
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
          expression = `物料组 / 大类：${value(layer.groupQuantity)} ÷ ${value(layer.categoryQuantity)} = ${value(layer.groupShare)}；全国SKU / 物料组：${value(layer.skuQuantity)} ÷ ${value(layer.groupQuantity)} = ${value(layer.skuShare)}；基地SKU / 全国SKU：${value(layer.baseQuantity)} ÷ ${value(layer.skuQuantity)} = ${value(layer.baseShare)}；三层连乘：${value(layer.groupShare)} × ${value(layer.skuShare)} × ${value(layer.baseShare)} = ${value(layer.product)}`;
      }
      if ((field === 'reportShare' || field === 'historyShare') && row.layerMissing?.length)
        expression += `；${row.layerMissing.join('、')}`;
      if (field === 'systemShare')
        expression = row.fallback
          ? `去年同月全国物料组销量Top1托底SKU。物料组平均占比 ${value(row.groupShare)} 减去其余SKU有效占比，再按本SKU未调整基地的系统占比分配。系统值 ${value(row.systemShare)}`
          : `(${value(row.reportShare)} + ${value(row.historyShare)}) ÷ 2 = ${value(row.systemShare)}`;
      if (field === 'share')
        expression = `系统占比 ${value(row.systemShare)}；有效占比 ${value(row.share)}。${row.fallback ? '本SKU承接物料组剩余占比。' : ''}`;
      if (field === 'demand') {
        const total = result.categoryRows.find(
          (item) => item.month === row.month && item.category === row.category,
        )?.quantity;
        expression = `${value(total)} × ${value(row.share)} = ${value(row.demand)}`;
      }
      if (field === 'openingInventory')
        expression =
          row.month === result.months[0]
            ? `${result.shipmentMonth}月末结存 = ${value(row.openingInventory)}`
            : `承接上一月无约束期末库存 = ${value(row.openingInventory)}，不代表超载后的实际库存`;
      if (field === 'nextMonthDemand')
        expression =
          row.month === result.months[2]
            ? `M+4大类有效需求 × M+3有效拆分系数 = ${value(row.nextMonthDemand)}，仅供目标库存参考，不生成M+4 SKU需求`
            : `下一月有效SKU需求 = ${value(row.nextMonthDemand)}`;
      if (field === 'targetInventory') {
        const nextDate = new Date(`${row.month}-01T00:00:00Z`);
        nextDate.setUTCMonth(nextDate.getUTCMonth() + 2);
        nextDate.setUTCDate(0);
        expression = `${value(row.safetyDays)} × ${value(row.nextMonthDemand)} ÷ ${nextDate.getUTCDate()} = ${value(row.targetInventory)}`;
      }
      if (field === 'targetInventory' && row.safetyDays === 0)
        expression = '安全天数明确为0，目标库存为0，无需下一月需求';
      if (field === 'requiredProduction')
        expression = `max(0, ${value(row.demand)} + ${value(row.targetInventory)} − ${value(row.openingInventory)}) = ${value(row.requiredProduction)}，无约束参考`;
      if (field === 'projectedClosing')
        expression = `${value(row.openingInventory)} + ${value(row.requiredProduction)} − ${value(row.demand)} = ${value(row.projectedClosing)}，无约束参考`;
      if (field === 'requiredProductionTons')
        expression = `${value(row.requiredProduction)} × 明确维护的件吨系数 = ${value(row.requiredProductionTons)}`;
      if (missing.length) expression += `${expression ? '；' : ''}缺项：${missing.join('、')}`;
      setFormula({
        title: `${row.base} ${row.code} ${row.month} ${labels[field]} 计算过程`,
        expression,
        value: row[field],
        missing,
      });
    };
    const numericCell = (row, field) =>
      h(
        'button',
        {
          className: `dc-link wf-value${row[field] == null ? ' wf-unavailable' : ''}`,
          'aria-label': `${row.base} ${row.code} ${row.month} ${labels[field]} 计算过程`,
          onClick: () => explain(row, field),
        },
        numberText(
          row[field],
          field.endsWith('Share') || field === 'share' || field === 'systemShare',
          field === 'requiredProductionTons' ? 6 : 0,
        ),
      );
    const layerColumns = [
      '提报物料组/大类',
      '提报SKU/物料组',
      '提报基地SKU/全国SKU',
      '提报三层连乘',
      '历史物料组/大类',
      '历史SKU/物料组',
      '历史基地SKU/全国SKU',
      '历史三层连乘',
    ];
    const layerQuantityColumns = [
      '提报物料组数量',
      '提报大类数量',
      '提报全国SKU数量',
      '提报基地SKU数量',
      '历史物料组数量',
      '历史大类数量',
      '历史全国SKU数量',
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
      const columns = [
        ...new Set([
          '评估版本',
          '评估月份',
          '粒度',
          ...identityColumns.map(([, label]) => label),
          ...exportFields.map((key) => labels[key]),
          ...layerColumns,
          ...layerQuantityColumns,
          '分层缺项',
          '公式说明',
          'Top1托底',
          '调整原因',
          '调整时间',
          '系统大类需求',
          '大类调整状态',
          ...resourceColumns,
          '已知生产吨数小计',
          '完整生产吨数',
          '已评估行数',
          '总行数',
          '源产能候选',
          '来源',
          '未评估原因',
        ]),
      ];
      const rows = filtered.map((row) => {
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
          粒度: includeCategory ? '基地×物料组×SKU' : '无约束产销存参考',
          ...Object.fromEntries(identityColumns.map(([key, label]) => [label, row[key]])),
          ...Object.fromEntries(exportFields.map((key) => [labels[key], row[key]])),
          ...Object.fromEntries(layerColumns.map((key, index) => [key, layerValues[index]])),
          ...Object.fromEntries(
            layerQuantityColumns.map((key, index) => [key, layerQuantities[index]]),
          ),
          分层缺项: row.layerMissing?.join('；'),
          公式说明: '占比=(物料组/大类)×(全国SKU/物料组)×(基地SKU/全国SKU)；目标库存=安全天数×下一月需求/下一月自然日天数；所需生产=max(0,需求+目标库存-期初库存)；无约束期末=期初+所需生产-需求',
          Top1托底: row.fallback ? '是' : '否',
          调整原因: adjustment?.reason,
          调整时间: adjustment?.at,
          源产能候选: row.capacities
            .map(
              (item) =>
                `${display(item.line)}：${display(item.dailyPieces)}件/日，${display(item.dailyTons)}吨/日`,
            )
            .join('；'),
          来源: sourceText,
          未评估原因: status(row, exportFields),
        };
      });
      rows.unshift(
        ...categoryRows.map((row) => ({
          评估版本: draft.name,
          评估月份: draft.month,
          粒度: row.month === result.months[3] ? 'M+4大类，仅供库存参考' : '大类',
          月份: row.month,
          大类: row.category,
          需求数量: row.quantity,
          系统大类需求: row.systemQuantity,
          大类调整状态: row.adjusted ? '人工调整' : '系统值',
          来源: '①大类需求',
          未评估原因: row.missing.join('、') || '已计算',
        })),
      );
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
            粒度: '全版本汇总，无约束参考',
            已知生产吨数小计: result.summary.knownRequiredProductionTons,
            完整生产吨数: result.summary.requiredProductionTons,
            已评估行数: result.summary.evaluatedRows,
            总行数: result.summary.totalRows,
            未评估原因: result.summary.missing.join('、') || '完整',
          });
      }
      if (!rows.length)
        rows.push({
          评估版本: draft.name,
          评估月份: draft.month,
          来源: sourceText,
          未评估原因: result.missing.join('、') || '暂无输入，未评估',
        });
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
    );
    const footer = h(
      'div',
      { className: 'dc-card-foot' },
      h('span', null, `共${filtered.length}条 · 第${pageIndex + 1}页`),
      h('button', { disabled: pageIndex === 0, onClick: () => setPage(pageIndex - 1) }, '上一页'),
      h(
        'button',
        {
          disabled: (pageIndex + 1) * 25 >= filtered.length,
          onClick: () => setPage(pageIndex + 1),
        },
        '下一页',
      ),
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
    const shareControls = (row) => {
      const saved = draft.adjustments?.shares?.find((item) => item.rowId === row.id);
      const editing = editingShare?.rowId === row.id;
      return h(
        'div',
        { className: 'wf-share-controls' },
        h('span', null, row.fallback ? '去年同月全国组内Top1托底' : '按两路有效占比分配'),
        saved ? h('span', null, `已调整：${saved.reason} · ${saved.at}`) : null,
        editing
          ? h(
              'div',
              { className: 'wf-share-editor' },
              h(
                'label',
                null,
                '最终占比',
                h('input', {
                  type: 'number',
                  min: 0,
                  max: 1,
                  step: 'any',
                  'aria-label': `${row.base} ${row.code} ${row.month} 最终占比`,
                  value: editingShare.share,
                  onChange: (event) =>
                    setEditingShare({ ...editingShare, share: event.target.value }),
                }),
              ),
              h(
                'label',
                null,
                '调整原因',
                h('input', {
                  'aria-label': `${row.base} ${row.code} ${row.month} 调整原因`,
                  value: editingShare.reason,
                  onChange: (event) =>
                    setEditingShare({ ...editingShare, reason: event.target.value }),
                }),
              ),
              h(
                'button',
                {
                  onClick: () => {
                    const share = Number(editingShare.share);
                    if (
                      editingShare.share.trim() === '' ||
                      !Number.isFinite(share) ||
                      share < 0 ||
                      share > 1 ||
                      !editingShare.reason.trim()
                    ) {
                      setShareError('请填写0至1的占比和调整原因');
                      return;
                    }
                    const shares = [
                      ...(draft.adjustments?.shares ?? []).filter((item) => item.rowId !== row.id),
                      { rowId: row.id, share },
                    ];
                    const candidate = buildMpsWorkflow(
                      { ...draft, adjustments: { ...draft.adjustments, shares } },
                      relations,
                      shipmentSnapshot,
                    );
                    if (candidate.adjustmentIssues?.length) {
                      setShareError(candidate.adjustmentIssues.join('；'));
                      return;
                    }
                    const error = onShareAdjustment?.({
                      rowId: row.id,
                      share,
                      reason: editingShare.reason.trim(),
                      systemValue: row.systemShare,
                    });
                    if (typeof error === 'string' && error) {
                      setShareError(error);
                      return;
                    }
                    setEditingShare(null);
                    setShareError('');
                  },
                },
                '应用占比',
              ),
              h(
                'button',
                {
                  onClick: () => {
                    setEditingShare(null);
                    setShareError('');
                  },
                },
                '取消',
              ),
              shareError
                ? h('span', { role: 'alert', className: 'wf-unavailable' }, shareError)
                : null,
            )
          : h(
              'div',
              null,
              h(
                'button',
                {
                  disabled: !onShareAdjustment || row.systemShare == null,
                  'aria-label': `${row.base} ${row.code} ${row.month} 调整占比`,
                  onClick: () => {
                    setEditingShare({
                      rowId: row.id,
                      share: String(row.share ?? ''),
                      reason: saved?.reason ?? '',
                    });
                    setShareError('');
                  },
                },
                '调整占比',
              ),
              saved
                ? h(
                    'button',
                    {
                      disabled: !onUndoShareAdjustment,
                      'aria-label': `${row.base} ${row.code} ${row.month} 撤销占比调整`,
                      onClick: () => undoShare(row.id),
                    },
                    '撤销调整',
                  )
                : null,
            ),
      );
    };
    const rowsTable = (name, selectedFields) =>
      table(
        name,
        [
          ...identityColumns.map(([, label]) => label),
          ...selectedFields.map((field) => labels[field]),
          ...(step === 'process' ? ['托底与人工调整'] : []),
          '未评估原因',
        ],
        visible.map((row) => [
          ...identityColumns.map(([key]) => display(row[key])),
          ...selectedFields.map((field) => numericCell(row, field)),
          ...(step === 'process' ? [shareControls(row)] : []),
          h(
            'span',
            {
              className: `wf-reasons${reasons(row, selectedFields).length ? ' wf-unavailable' : ''}`,
              title: status(row, selectedFields),
            },
            status(row, selectedFields),
          ),
        ]),
      );
    const constraintRows = bases
      .filter(
        (sourceBase) => (!base || sourceBase === base) && (!search || sourceBase.includes(search)),
      )
      .map((sourceBase) => {
        const current = result.constraints.safetyDays.find((item) => item.base === sourceBase);
        return [
          sourceBase,
          h('input', {
            type: 'number',
            min: 0,
            step: 'any',
            value: current?.days ?? '',
            'aria-label': `${sourceBase} 安全天数`,
            onChange: (event) => {
              const text = event.target.value;
              if (
                text !== '' &&
                (!Number.isFinite(Number(text)) ||
                  Number(text) < 0 ||
                  Number(text) > Number.MAX_SAFE_INTEGER)
              )
                return;
              update({
                constraints: {
                  ...result.constraints,
                  safetyDays: [
                    ...result.constraints.safetyDays.filter((item) => item.base !== sourceBase),
                    { base: sourceBase, days: text === '' ? null : Number(text) },
                  ],
                },
              });
            },
          }),
          '本地隔离草稿',
          '安全天数 × 下一月需求 ÷ 下一月自然日天数',
        ];
      });
    const numberInput = (label, value, change, max = Number.MAX_SAFE_INTEGER) =>
      h('input', {
        type: 'number',
        min: 0,
        max,
        step: 'any',
        value: value ?? '',
        'aria-label': label,
        onChange: (event) => {
          const value = event.target.value;
          if (
            value !== '' &&
            (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > max)
          )
            return;
          change(value === '' ? null : Number(value));
        },
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
              productionDays.find((item) => item.base === sourceBase && item.month === sourceMonth)
                ?.days,
              (days) => setDays(sourceBase, sourceMonth, days),
              31,
            ),
            h(
              'button',
              {
                'aria-label': `${sourceBase} ${sourceMonth} 采用25天`,
                onClick: () => setDays(sourceBase, sourceMonth, 25),
              },
              '采用25天候选',
            ),
            '请按实际维护。春节月可参考15天，月份须人工确认',
          ]),
      );
    const skuPairs = [
      ...new Map(
        result.rows
          .filter(
            (row) =>
              (!base || row.base === base) &&
              (!search || `${row.base} ${row.code} ${row.name}`.includes(search)),
          )
          .map((row) => [JSON.stringify([row.base, row.code]), row]),
      ).values(),
    ];
    const weightRows = skuPairs.map((row) => [
      row.base,
      row.code,
      row.name,
      numberInput(
        `${row.base} ${row.code} 件吨系数`,
        weights.find((item) => item.base === row.base && item.code === row.code)?.tonsPerPiece,
        (tonsPerPiece) =>
          update({
            unitWeights: [
              ...weights.filter((item) => item.base !== row.base || item.code !== row.code),
              { base: row.base, code: row.code, tonsPerPiece },
            ],
          }),
      ),
      '吨/件，须用确认净重；不从日产吨/日产件推算',
    ]);
    const textEntry = (label, value, change) =>
      h('input', {
        'aria-label': label,
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
          onClick: () =>
            update({
              resourceAssignments: assignments.filter((_, position) => position !== index),
            }),
        },
        '删除',
      ),
    ]);
    const localRules = result.constraints.rules.local ?? [];
    const updateRules = (entries) =>
      update({
        constraints: {
          ...result.constraints,
          rules: { ...result.constraints.rules, local: entries },
        },
      });
    const ruleRows = localRules.flatMap((rule, index) => {
      if (
        search &&
        ![rule.description, rule.target, rule.strength, rule.until].some((value) =>
          String(value ?? '').includes(search),
        )
      )
        return [];
      const input = (key, label, type = 'text') =>
        h('input', {
          type,
          'aria-label': `约束${index + 1} ${label}`,
          value: rule[key] ?? '',
          onChange: (event) =>
            updateRules(
              localRules.map((item, position) =>
                position === index ? { ...item, [key]: event.target.value } : item,
              ),
            ),
        });
      return [
        [
          input('description', '内容'),
          input('target', '作用对象'),
          h(
            'select',
            {
              'aria-label': `约束${index + 1} 强度`,
              value: rule.strength,
              onChange: (event) =>
                updateRules(
                  localRules.map((item, position) =>
                    position === index ? { ...item, strength: event.target.value } : item,
                  ),
                ),
            },
            h('option', { value: '硬' }, '硬'),
            h('option', { value: '软' }, '软'),
          ),
          input('until', '生效至', 'date'),
          '本地草稿 · 未参与计算',
          h(
            'button',
            {
              'aria-label': `删除约束${index + 1}`,
              onClick: () => updateRules(localRules.filter((_, position) => position !== index)),
            },
            '删除',
          ),
        ],
      ];
    });
    return h(
      'section',
      { className: 'wf-page', 'aria-label': titles[step] },
      h(
        'div',
        { className: 'wf-scope' },
        h('strong', null, `${draft.name} · ${draft.month}`),
        h('span', null, `发货所属月 ${result.shipmentMonth}`),
      ),
      filterBar,
      step === 'process'
        ? h(
            react.Fragment,
            null,
            card(
              '大类需求',
              table(
                '大类需求',
                ['月份', '大类', '系统需求', '有效需求', '未评估原因'],
                categoryRows.map((row) => [
                  row.month,
                  row.category,
                  numberText(row.systemQuantity),
                  numberText(row.quantity),
                  row.missing.join('、') || '已计算',
                ]),
              ),
            ),
            h(
              'p',
              { className: 'wf-note' },
              'M+4只展示大类需求，供M+3目标库存参考，不生成第四个月SKU需求。Top1托底SKU按去年同月全国组内销量选择；其未调整基地承接组内剩余占比。',
            ),
            shareError && !editingShare
              ? h('p', { role: 'alert', className: 'wf-note wf-unavailable' }, shareError)
              : null,
            result.adjustmentIssues?.length
              ? h(
                  'p',
                  { role: 'status', className: 'wf-note wf-unavailable' },
                  `以下调整未生效：${result.adjustmentIssues.join('；')}。可从当前占比调整中撤销失效记录。`,
                )
              : null,
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
            card(
              '两路三层占比',
              table(
                '两路三层占比',
                [
                  '月份',
                  '基地',
                  '物料组',
                  '产品编码',
                  '来源',
                  '物料组/大类',
                  '全国SKU/物料组',
                  '基地SKU/全国SKU',
                  '三层连乘',
                  '说明',
                ],
                visible.flatMap((row) =>
                  ['report', 'history'].map((source) => {
                    const layer = row[source + 'Layers'];
                    return [
                      row.month,
                      row.base,
                      row.group,
                      row.code,
                      source === 'report' ? '计划提报' : '去年同月发货',
                      ...['groupShare', 'skuShare', 'baseShare', 'product'].map((field) =>
                        numberText(layer?.[field], true),
                      ),
                      h(
                        'button',
                        {
                          className: 'dc-link',
                          'aria-label': `${row.base} ${row.code} ${row.month} ${source === 'report' ? '提报' : '历史'}三层占比明细`,
                          onClick: () => explain(row, source + 'Share'),
                        },
                        row.layerMissing?.join('、') ||
                          (layer?.product == null
                            ? '分母为0或来源缺失，连乘未定义；已知直接零占比单独保留'
                            : '查看数量与连乘过程'),
                      ),
                    ];
                  }),
                ),
              ),
            ),
            card(
              '基地单品需求拆分',
              h(react.Fragment, null, rowsTable('基地单品需求拆分', processFields), footer),
              h(
                'button',
                { onClick: () => exportRows('需求拆分', processFields, true) },
                '下载需求拆分',
              ),
            ),
            card(
              '占比调整记录',
              table(
                '占比调整记录',
                ['对象', '操作', '系统值', '有效值', '原因', '时间'],
                (draft.adjustments?.history ?? [])
                  .filter((item) => item.kind === 'shares')
                  .map((item) => [
                    item.key,
                    item.action === 'undo' ? '撤销' : '调整',
                    display(item.systemValue),
                    display(item.value),
                    item.reason,
                    item.at,
                  ]),
              ),
            ),
          )
        : step === 'constraints'
          ? h(
              react.Fragment,
              null,
              card(
                '安全天数',
                table('本地安全天数', ['基地', '安全天数', '来源', '未评估原因'], constraintRows),
              ),
              card(
                '可用生产天数',
                table(
                  '可用生产天数',
                  ['基地', '月份', '生产天数', '候选值', '维护说明'],
                  productionRows,
                ),
              ),
              card(
                '件吨系数',
                table(
                  '件吨系数',
                  ['基地', '产品编码', '产品名称', '吨/件', '来源要求'],
                  weightRows,
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
                '本地约束',
                table(
                  '本地约束',
                  ['约束内容', '作用对象', '强度', '生效至', '状态', '操作'],
                  ruleRows,
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      updateRules([
                        ...localRules,
                        { description: '', target: '', strength: '硬', until: '' },
                      ]),
                  },
                  '新增本地约束',
                ),
              ),
              card(
                '正式约束来源',
                table(
                  '正式约束来源',
                  ['项目', '正式来源', '状态'],
                  [
                    ['安全天数', '—', '正式来源未就绪'],
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
                        ...localRules.map((rule) => ({
                          评估版本: draft.name,
                          评估月份: draft.month,
                          约束内容: rule.description,
                          作用对象: rule.target,
                          强度: rule.strength,
                          生效至: rule.until,
                          来源: '本地隔离草稿',
                          状态: '未参与计算',
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
              h(
                'p',
                { className: 'wf-note', role: 'status' },
                '以下是无约束参考，所需生产量不代表实际可执行。前月超载时，后月仍按无约束期末库存承接。未自动生成可执行主计划，未自动处置调拨或外协。',
              ),
              result.summary
                ? card(
                    '评估范围与汇总',
                    table(
                      '评估范围与汇总',
                      [
                        '范围',
                        '已知生产吨数小计',
                        '完整生产吨数',
                        '已评估行数',
                        '总行数',
                        '未评估范围',
                      ],
                      [
                        [
                          '当前完整版本，汇总不受明细筛选影响',
                          numberText(result.summary.knownRequiredProductionTons, false, 6),
                          numberText(result.summary.requiredProductionTons, false, 6),
                          result.summary.evaluatedRows,
                          result.summary.totalRows,
                          result.summary.missing.join('、') || '完整',
                        ],
                      ],
                    ),
                  )
                : null,
              card(
                '资源负荷与缺口',
                h(
                  react.Fragment,
                  null,
                  h(
                    'p',
                    { className: 'wf-note' },
                    '共享资源按完整负荷评估，不随大类或SKU搜索拆开。负荷 = 分配所需吨数 ÷ 日产吨数 ÷ 可用生产天数。缺隧道或成型机均不能判定全约束通过。',
                  ),
                  table(
                    '资源负荷',
                    ['月份', '基地', ...resourceColumns, '未评估原因'],
                    resourceLoads.map((row) => [
                      row.month,
                      row.base,
                      ...resourceValues(row).map((value, index) =>
                        index === 7
                          ? numberText(value, true)
                          : index >= 3 && index <= 9
                            ? numberText(value, false, 6)
                            : display(value),
                      ),
                      row.missing.join('、') || '已评估',
                    ]),
                  ),
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      exportRows(step === 'report' ? '产销存报告' : '产能评估', planFields),
                  },
                  '下载资源负荷与缺口',
                ),
              ),
              card(
                '未评估清单',
                table(
                  '未评估清单',
                  ['月份', '基地', '产品编码', '缺项'],
                  filtered
                    .filter(
                      (row) =>
                        reasons(row, [
                          'requiredProduction',
                          'requiredProductionTons',
                          'productionDays',
                          'resourceAssignments',
                        ]).length,
                    )
                    .map((row) => [
                      row.month,
                      row.base,
                      row.code,
                      status(row, [
                        'requiredProduction',
                        'requiredProductionTons',
                        'productionDays',
                        'resourceAssignments',
                      ]),
                    ]),
                ),
              ),
              card(
                step === 'report' ? '产销存明细' : '无约束生产评估明细',
                h(
                  react.Fragment,
                  null,
                  rowsTable(step === 'report' ? '产销存报告' : '产能评估明细', planFields),
                  footer,
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      exportRows(step === 'report' ? '产销存报告' : '产能评估', planFields),
                  },
                  step === 'report' ? '下载产销存报告' : '下载产能评估',
                ),
              ),
              step === 'capacity'
                ? card(
                    '源产能候选',
                    table(
                      '源产能候选',
                      [
                        '月份',
                        '基地',
                        '产品编码',
                        '产线',
                        '标准日产/件',
                        '标准日产/吨',
                        '未评估原因',
                      ],
                      visible.flatMap((row) =>
                        row.capacities.map((item) => [
                          row.month,
                          row.base,
                          row.code,
                          display(item.line),
                          numberText(item.dailyPieces),
                          numberText(item.dailyTons),
                          item.missing.join('、') ||
                            '源值，仅供核对；请在约束与配置中明确维护资源与分配',
                        ]),
                      ),
                    ),
                  )
                : card(
                    '报告来源',
                    table(
                      '报告来源',
                      ['来源', '状态'],
                      [
                        ['①需求确认', '大类需求与缺项随当前版本重算'],
                        ['②本月预估发货', `${result.shipmentMonth}月末结存，缺数留空`],
                        ['③需求加工与收敛', '两路三层占比、物料组Top1托底与有效调整'],
                        [
                          '④主数据对应关系',
                          relations?.sources ? '已接当前关系结果' : '关系尚未读取',
                        ],
                        ['⑤约束与配置', '本地隔离草稿；正式保存未就绪'],
                        ['⑥产能评估与缺口', '无约束所需生产与共享资源负荷；未生成可执行主计划'],
                      ],
                    ),
                  ),
            ),
      result.missing.length
        ? h('div', { className: 'wf-limitations', role: 'status' }, result.missing.join('；'))
        : null,
      h(
        'div',
        { className: 'wf-actions' },
        step !== 'report'
          ? h('button', { className: 'dc-primary', onClick: onNext }, `下一步：${next}`)
          : h('button', { disabled: true }, '保存正式报告'),
      ),
      formula
        ? h(
            Dialog,
            { title: formula.title, close: () => setFormula(null) },
            h('p', null, formula.expression || '当前输入源值'),
            h(
              'p',
              { className: formula.missing.length ? 'wf-unavailable' : undefined },
              `${formula.value == null ? '未评估' : `结果：${formula.value}`}`,
            ),
          )
        : null,
    );
  };
}
