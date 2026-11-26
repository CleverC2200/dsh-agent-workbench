import { createCalculationHelp } from './calculation-help.js';
import { downloadWorkbook } from './workbook.js';
import { renderTablePagination } from './report-page.js';
import { compareBusinessRows, compareBusinessValues } from './table-presentation.js';
import { matchesCategories } from './category-filter.js';
import { useStepViewField } from './step-view-state.js';
import {
  inventoryVersionOrder,
  selectedInventoryMonth,
  selectedInventoryBusinessDate,
} from './inventory-selection.js';

const number = (value, decimals = 4) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: decimals }).format(value);
export const turnoverDaysSources = {
  'target-turnover-days': '源最终目标周转天数',
  'manual-turnover-days': '人工补充目标周转天数',
  'missing-turnover-days-zero': '缺输入，默认0天',
  'base-policy': '基地安全天数策略',
  rule: '库存下限规则',
  missing: '缺输入',
};
export function inventoryTurnoverReport(row) {
  const manual = row.safetyDaysSource === 'manual-turnover-days';
  const defaulted = row.safetyDaysSource === 'missing-turnover-days-zero';
  const missing = row.safetyDays === null;
  const zero = row.safetyDays === 0;
  const sourceIssue = row.turnoverPolicy.missing.join('；');
  return {
    基地: row.base,
    产品编码: row.code,
    产品名称: row.name,
    异常类别:
      missing || defaulted
        ? '周转天数待补'
        : zero
          ? '有效零周转天数'
          : manual
            ? '周转天数人工补充'
            : row.turnoverPolicy.fallbackReason
              ? '周转天数版本回退'
              : '有效周转天数',
    原始周转天数: row.turnoverPolicy.sourceDays,
    计算用周转天数: row.safetyDays,
    目标期末库存: row.targetInventory,
    来源: `${turnoverDaysSources[row.safetyDaysSource]}；来源月${row.turnoverPolicy.sourceMonths.join('、') || '待核'}；版本${row.turnoverPolicy.sourceVersion || '待核'}`,
    原因:
      sourceIssue ||
      row.turnoverPolicy.fallbackReason ||
      (zero ? '最终周转天数有效为0' : '最终周转天数有效'),
    实际处理: defaulted
      ? '缺周转天数时默认按0天计算，可人工补充'
      : missing
        ? '目标库存待补，允许人工补充周转天数'
        : `${manual ? '人工补充已生效；' : ''}${zero ? '目标库存为0，预测结存按库存收支计算' : row.targetInventory === null ? '有效天数已采用，目标库存仍待补推导依据' : '已按有效天数重新计算目标库存'}`,
    计算依据: zero
      ? `${defaulted ? '缺周转天数按0天计算' : '有效周转天数0天'}，目标库存为0；预测期末库存独立按库存收支计算`
      : missing
        ? '缺有效周转天数，不能计算目标库存'
        : `${row.safetyDays}天×${row.nextMonth}有效需求${row.nextMonthDemand ?? '待补'}÷${row.nextMonthDays}个自然日`,
  };
}
export const inventoryDependencyColumns = [
  '评估月',
  '安全天数来源月',
  '安全天数来源版本',
  '依赖需求月',
  '下月有效需求',
  '推导状态',
  '需求依赖说明',
];
export function inventoryDependencyFields(row) {
  return {
    评估月: row.month,
    安全天数来源月: row.turnoverPolicy.sourceMonths.join('、'),
    安全天数来源版本: row.turnoverPolicy.sourceVersion,
    依赖需求月: row.nextMonth,
    下月有效需求: row.nextMonthDemand,
    推导状态: row.targetInventory === null ? '缺推导依赖' : '可计算',
    需求依赖说明:
      row.safetyDays === 0
        ? `${row.safetyDaysSource === 'missing-turnover-days-zero' ? '缺周转天数按0天计算' : '有效安全天数为0'}，无需下月需求`
        : `${row.nextMonth}有效需求`,
  };
}
export function createInventoryTargetPanel(react, { NumberInput }) {
  const h = react.createElement;
  const CalculationHelp = createCalculationHelp(react);
  return function InventoryTargetPanel({
    view,
    draft,
    batch,
    result,
    selectedCategories = [],
    update,
    sync,
    busy,
    table,
    card,
  }) {
    const [month, setMonth] = useStepViewField(
      react,
      view,
      'InventoryTargetPanel.month',
      draft.month,
    );
    const [base, setBase] = useStepViewField(react, view, 'InventoryTargetPanel.base', '');
    const [search, setSearch] = useStepViewField(react, view, 'InventoryTargetPanel.search', '');
    const [supplementPage, setSupplementPage] = useStepViewField(
      react,
      view,
      'InventoryTargetPanel.supplementPage',
      0,
    );
    const scopedRows = result.rows
      .filter((row) => matchesCategories(row.category, selectedCategories))
      .sort(compareBusinessRows);
    const version = draft.constraints?.targetVersion ?? 'auto';
    const sourceMonth = selectedInventoryMonth(draft);
    const businessDate = selectedInventoryBusinessDate(draft);
    const versionOrder = inventoryVersionOrder(sourceMonth, businessDate);
    const read = draft.inventoryTargetsRead;
    const reading = busy || read?.status === 'loading';
    const failed = read?.status === 'failed';
    const sourceActions = h(
      'div',
      { className: 'wf-card-actions' },
      h(
        'label',
        null,
        '源库存版本 ',
        h(
          'select',
          {
            'aria-label': '目标库存版本',
            disabled: !batch.active,
            value: version,
            onChange: (event) => {
              update({
                constraints: {
                  ...draft.constraints,
                  safetyDays: draft.constraints?.safetyDays ?? [],
                  rules: draft.constraints?.rules ?? { local: [] },
                  targetVersion: event.target.value,
                },
              });
            },
          },
          [
            ['auto', `自动：${versionOrder.join(' → ')}`],
            ['纠偏', '纠偏版'],
            ['月初', '月初版'],
            ['滚动', '滚动版'],
          ].map(([value, title]) => h('option', { key: value, value }, title)),
        ),
      ),
      h(
        'button',
        { onClick: sync, disabled: reading || batch.active },
        reading ? '读取目标库存中…' : '同步目标库存',
      ),
    );
    if (reading || (!read && draft.productSource === 'business')) {
      return card(
        '基地与单品目标库存',
        h(
          'div',
          { className: 'wf-target-status', role: 'status' },
          h('strong', null, reading ? '正在读取目标库存' : '尚未读取目标库存'),
        ),
        sourceActions,
      );
    }
    const policyByProduct = new Map(
      scopedRows.map((row) => [JSON.stringify([row.base, row.code]), row.turnoverPolicy]),
    );
    const sourceVersions = [
      ...new Set(
        scopedRows
          .filter((row) => row.turnoverPolicy.sourceDays !== null)
          .map((row) => row.turnoverPolicy.sourceVersion),
      ),
    ];
    const bases = [...new Set(scopedRows.map((row) => row.base))].sort((left, right) =>
      compareBusinessValues('base', left, right),
    );
    const rows = scopedRows.filter(
      (row) =>
        row.month === month &&
        (!base || row.base === base) &&
        (!search || [row.code, row.name].some((value) => value?.includes(search))),
    );
    const change = (setter) => (event) => {
      setter(event.target.value);
      setSupplementPage(0);
    };
    const reportRows = rows.map(inventoryTurnoverReport).filter(Boolean);
    const missingDays = rows.filter(
      (row) => row.safetyDays === null || row.safetyDaysSource === 'missing-turnover-days-zero',
    ).length;
    const missingTargetInputs = rows.filter(
      (row) => row.safetyDays !== null && row.targetInventory === null,
    ).length;
    const pendingStatus = [
      missingDays ? `周转天数待补 ${number(missingDays, 0)} 项` : '',
      missingTargetInputs ? `缺目标库存计算依据 ${number(missingTargetInputs, 0)} 项` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const reportStatus = failed ? '' : rows.length ? pendingStatus : '当前筛选暂无记录';
    const supplementKey = (row) => JSON.stringify([row.base, row.code]);
    const supplements = new Map(
      (draft.constraints?.turnoverDays ?? []).map((row) => [supplementKey(row), row]),
    );
    const pending = [
      ...new Map(scopedRows.map((row) => [supplementKey(row), row])).values(),
    ].filter(
      (row) =>
        row.turnoverPolicy.sourceDays === null &&
        (!base || row.base === base) &&
        (!search || [row.code, row.name].some((value) => value?.includes(search))),
    );
    const supplementIndex = Math.min(
      supplementPage,
      Math.max(0, Math.ceil(pending.length / 25) - 1),
    );
    const supplementRows = pending
      .slice(supplementIndex * 25, (supplementIndex + 1) * 25)
      .map((row) => [
        row.base,
        row.category,
        row.group,
        row.code,
        row.name,
        row.turnoverPolicy.missing.join('；'),
        h(NumberInput, {
          batch,
          key: `${draft.id}-${supplementKey(row)}`,
          label: `${row.base} ${row.code} 补充目标周转天数`,
          value: supplements.get(supplementKey(row))?.days,
          commit: (text) =>
            update({
              constraints: {
                ...draft.constraints,
                safetyDays: draft.constraints?.safetyDays ?? [],
                rules: draft.constraints?.rules ?? { local: [] },
                turnoverDays: [
                  ...(draft.constraints?.turnoverDays ?? []).filter(
                    (item) => supplementKey(item) !== supplementKey(row),
                  ),
                  { base: row.base, code: row.code, days: text === '' ? null : text },
                ],
              },
            }),
        }),
        number(row.safetyDays),
        turnoverDaysSources[row.safetyDaysSource],
      ]);
    const detailColumns = [
      '评估版本',
      '月份',
      '基地',
      '产品编码',
      '产品名称',
      '有效周转天数',
      '天数来源',
      '周转天数来源月',
      '周转天数来源版本',
      '目标期末库存',
      '核对事项',
    ];
    const summaryColumns = [
      '评估版本',
      '月份',
      '基地',
      '目标库存已知小计（件）',
      '待补目标库存SKU数',
    ];
    const sourceColumns = [
      '评估版本',
      '来源月',
      '基地',
      '产品编码',
      '来源版本',
      '源最终目标库存',
      '源日均计划需求',
      '源最终目标周转天数',
      '是否采用周转天数',
      '源冲突字段',
    ];
    const summaryRows = bases.flatMap((base) =>
      result.months.slice(0, 3).map((month) => {
        const group = scopedRows.filter((row) => row.base === base && row.month === month);
        const days = [...new Set(group.map((row) => row.safetyDays))];
        const demand = group.filter((row) => row.nextMonthDemand !== null);
        const targets = group.filter((row) => row.targetInventory !== null);
        return {
          评估版本: draft.name,
          月份: month,
          基地: base,
          有效安全天数: days.length === 1 ? number(days[0]) : '按单品天数',
          下月需求已知小计: demand.length
            ? demand.reduce((sum, row) => sum + row.nextMonthDemand, 0)
            : null,
          下月自然天数: group[0]?.nextMonthDays ?? '—',
          '目标库存已知小计（件）': targets.length
            ? targets.reduce((sum, row) => sum + row.targetInventory, 0)
            : null,
          缺下月需求单品: group.length - demand.length,
          待补目标库存SKU数: group.length - targets.length,
        };
      }),
    );
    const sourceRows = (read?.status === 'ready' ? (draft.inventoryTargets ?? []) : []).filter(
      (row) =>
        !selectedCategories.length || policyByProduct.has(JSON.stringify([row.base, row.code])),
    );
    const downloadTargets = () =>
      downloadWorkbook(
        `${draft.month}-目标库存.xlsx`,
        [
          {
            name: '当前筛选',
            columns: detailColumns,
            rows: rows.map((row) => ({
              评估版本: draft.name,
              月份: row.month,
              基地: row.base,
              产品编码: row.code,
              产品名称: row.name,
              有效周转天数: row.safetyDays,
              天数来源: turnoverDaysSources[row.safetyDaysSource],
              周转天数来源月: row.turnoverPolicy.sourceMonths.join('、'),
              周转天数来源版本: row.turnoverPolicy.sourceVersion,
              目标期末库存: row.targetInventory,
              核对事项: (row.safetyDays === null ||
              row.safetyDaysSource === 'missing-turnover-days-zero'
                ? row.turnoverPolicy.missing.join('；') || '周转天数待补'
                : row.targetInventory === null
                  ? row.missing.targetInventory?.join('；') || '目标库存待补'
                  : row.turnoverPolicy.fallbackReason
              )?.replaceAll('，请核对或人工补充', ''),
            })),
          },
          { name: '三个月库存汇总', columns: summaryColumns, rows: summaryRows },
          {
            name: '目标源记录',
            columns: sourceColumns,
            rows: sourceRows.map((row) => {
              const policy = policyByProduct.get(JSON.stringify([row.base, row.code]));
              const adopted =
                row.month === sourceMonth &&
                policy?.sourceDays != null &&
                policy.sourceVersion === row.version;
              return {
                评估版本: draft.name,
                来源月: row.month,
                基地: row.base,
                产品编码: row.code,
                来源版本: row.version,
                源最终目标库存: row.finalTarget,
                源日均计划需求: row.dailyDemand,
                源最终目标周转天数: row.finalTurnoverDays,
                是否采用周转天数: adopted ? '是' : '否',
                源冲突字段: row.conflictFields?.join('；'),
              };
            }),
          },
        ].filter(({ rows }) => rows.length),
      );
    return card(
      '基地与单品目标库存',
      h(
        react.Fragment,
        null,
        failed &&
          h(
            'div',
            { className: 'wf-target-status', role: 'alert', 'data-state': 'error' },
            h('strong', null, '目标库存读取失败'),
            read.error && h('p', null, read.error),
          ),
        h(
          'div',
          { className: 'dc-card-head mps-report-heading mps-table-heading' },
          h('h3', null, '周转天数与库存目标报告'),
          h(
            'span',
            { className: reportStatus ? 'dc-status' : undefined, role: 'status' },
            reportStatus,
          ),
        ),
        reportRows.length > 0 &&
          react.cloneElement(
            table(
              '周转天数与库存目标报告',
              [
                '基地',
                '产品编码',
                '异常类别',
                '原始天数',
                '计算用天数',
                '目标期末库存',
                '来源',
                '原因',
                '实际处理',
                '计算依据',
              ],
              reportRows
                .slice(0, 25)
                .map((row) => [
                  row.基地,
                  row.产品编码,
                  row.异常类别,
                  number(row.原始周转天数),
                  number(row.计算用周转天数),
                  number(row.目标期末库存),
                  row.来源,
                  row.原因,
                  row.实际处理,
                  row.计算依据,
                ]),
            ),
            { tabIndex: 0, role: 'region', 'aria-label': '周转天数报告滚动区域' },
          ),
        h('h3', { className: 'wf-target-heading' }, '目标周转天数待补'),
        batch.active && pending.length > 0 && h('p', { role: 'note' }, '填 0 表示零周转天数。'),
        table(
          '目标周转天数待补',
          [
            '基地',
            '大类',
            '物料组',
            '产品编码',
            '产品名称',
            '待补原因',
            '人工补充天数',
            '有效天数',
            '天数来源',
          ],
          supplementRows,
        ),
        pending.length > 25 &&
          renderTablePagination(h, {
            label: '待补天数',
            page: supplementIndex,
            total: pending.length,
            onPageChange: setSupplementPage,
            buttonLabels: ['上一页待补天数', '下一页待补天数'],
          }),
        h('h3', { className: 'wf-target-heading' }, '三个月目标库存汇总'),
        table(
          '三个月目标库存汇总',
          [
            '基地',
            '月份',
            '有效安全天数',
            '下月需求已知小计（件）',
            '下月自然天数',
            '推导目标库存已知小计（件）',
            '缺下月需求单品',
            '推导库存缺项单品',
          ],
          summaryRows.map((row) => [
            row.基地,
            row.月份,
            row.有效安全天数,
            number(row.下月需求已知小计, 0),
            row.下月自然天数,
            number(row['目标库存已知小计（件）'], 0),
            row.缺下月需求单品,
            row.待补目标库存SKU数,
          ]),
        ),
      ),
      h(
        react.Fragment,
        null,
        h(
          'div',
          { className: 'dc-toolbar dc-report-filters mps-table-controls' },
          h(
            'label',
            null,
            '月份 ',
            h(
              'select',
              { 'aria-label': '目标明细月份', value: month, onChange: change(setMonth) },
              result.months
                .slice(0, 3)
                .map((month) => h('option', { key: month, value: month }, month)),
            ),
          ),
          h(
            'label',
            null,
            '基地 ',
            h(
              'select',
              { 'aria-label': '目标明细基地', value: base, onChange: change(setBase) },
              [['', '全部基地'], ...bases.map((base) => [base, base])].map(([value, name]) =>
                h('option', { key: value, value }, name),
              ),
            ),
          ),
          h('input', {
            'aria-label': '搜索目标单品',
            placeholder: '搜索物料编码或名称',
            value: search,
            onChange: change(setSearch),
          }),
        ),
        h(
          'div',
          { className: 'mps-report-actions' },
          h(
            CalculationHelp,
            { title: '目标库存 · 口径说明' },
            h(
              'p',
              null,
              `业务日期${businessDate}，安全天数来源月${sourceMonth} · 采用版本 ${sourceVersions.join('、') || '待同步'}`,
            ),
            h('p', null, '来源无记录或天数为空时按 0 天计算，可在待补清单补充。'),
          ),
          sourceActions,
          h(
            'button',
            {
              className: 'mps-download',
              disabled: !scopedRows.length && !sourceRows.length,
              onClick: downloadTargets,
            },
            '下载目标库存',
          ),
        ),
      ),
    );
  };
}
