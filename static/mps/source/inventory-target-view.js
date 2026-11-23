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
  'base-policy': '基地安全天数策略',
  rule: '库存下限规则',
  missing: '缺输入',
};
export const turnoverReportColumns = [
  '月份',
  '基地',
  '产品编码',
  '产品名称',
  '异常类别',
  '原始周转天数',
  '原始状态',
  '计算用周转天数',
  '人工补充天数',
  '目标期末库存',
  '预测期末库存',
  '来源',
  '来源月',
  '来源版本',
  '回退原因',
  '依赖需求月',
  '下月有效需求',
  '下月自然天数',
  '原因',
  '实际处理',
  '计算依据',
];
export function inventoryTurnoverReport(row) {
  const manual = row.safetyDaysSource === 'manual-turnover-days';
  const missing = row.safetyDays === null;
  const zero = row.safetyDays === 0;
  const sourceIssue = row.turnoverPolicy.missing.join('；');
  return {
    月份: row.month,
    基地: row.base,
    产品编码: row.code,
    产品名称: row.name,
    异常类别: missing
      ? '周转天数待补'
      : zero
        ? '有效零周转天数'
        : manual
          ? '周转天数人工补充'
          : row.turnoverPolicy.fallbackReason
            ? '周转天数版本回退'
            : '有效周转天数',
    原始周转天数: row.turnoverPolicy.sourceDays,
    原始状态: sourceIssue || (row.turnoverPolicy.sourceDays === 0 ? '有效零值' : '有效值'),
    计算用周转天数: row.safetyDays,
    人工补充天数: manual ? row.safetyDays : null,
    目标期末库存: row.targetInventory,
    预测期末库存: row.projectedClosing,
    来源: `${turnoverDaysSources[row.safetyDaysSource]}；来源月${row.turnoverPolicy.sourceMonths.join('、') || '待核'}；版本${row.turnoverPolicy.sourceVersion || '待核'}`,
    来源月: row.turnoverPolicy.sourceMonths.join('、'),
    来源版本: row.turnoverPolicy.sourceVersion,
    回退原因: row.turnoverPolicy.fallbackReason || '',
    依赖需求月: row.nextMonth,
    下月有效需求: row.nextMonthDemand,
    下月自然天数: row.nextMonthDays,
    原因:
      sourceIssue ||
      row.turnoverPolicy.fallbackReason ||
      (zero ? '最终周转天数有效为0' : '最终周转天数有效'),
    实际处理: missing
      ? '目标库存待补，允许人工补充周转天数'
      : `${manual ? '人工补充已生效；' : ''}${zero ? '目标库存为0，预测结存按库存收支计算' : row.targetInventory === null ? '有效天数已采用，目标库存仍待补推导依据' : '已按有效天数重新计算目标库存'}`,
    计算依据: zero
      ? '有效周转天数0天，目标库存为0；预测期末库存独立按库存收支计算'
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
      row.safetyDays === 0 ? '有效安全天数为0，无需下月需求' : `${row.nextMonth}有效需求`,
  };
}
export function createInventoryTargetPanel(react, { downloadCsv, NumberInput }) {
  const h = react.createElement;
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
    const scopedRows = result.rows.filter((row) =>
      matchesCategories(row.category, selectedCategories),
    );
    const version = draft.constraints?.targetVersion ?? 'auto';
    const sourceMonth = selectedInventoryMonth(draft);
    const businessDate = selectedInventoryBusinessDate(draft);
    const versionOrder = inventoryVersionOrder(sourceMonth, businessDate);
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
    const bases = [...new Set(scopedRows.map((row) => row.base))].sort();
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
    const read = draft.inventoryTargetsRead;
    const missing = scopedRows.filter((row) => row.safetyDays === null).length;
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
    const fields = [
      '月份',
      '基地',
      '产品编码',
      '产品名称',
      '目标版本',
      '源最终目标库存',
      '源日均计划需求',
      '源库存除日均对照天数',
      '有效安全天数',
      '天数来源',
      '推导目标库存',
      '源缺项',
      '源记录状态',
      '源缺项代码',
      '推导依赖缺项',
      '推导缺项代码',
      '基地策略安全天数',
      '下一月需求参考',
      '下月自然天数',
      '安全天数策略所属月',
      '源最终目标周转天数',
      '周转天数来源月份',
      '周转天数来源版本',
      '版本回退原因',
      '本轮参与计算',
      '周转报告类别',
      '周转原因',
      '周转处理',
      '周转计算依据',
      ...inventoryDependencyColumns,
    ];
    const values = (row) => {
      const report = inventoryTurnoverReport(row);
      return [
        row.month,
        row.base,
        row.code,
        row.name,
        row.inventoryTarget.version,
        row.inventoryTarget.finalTarget,
        row.inventoryTarget.dailyDemand,
        row.inventoryTarget.days,
        row.safetyDays,
        turnoverDaysSources[row.safetyDaysSource],
        row.targetInventory,
        row.inventoryTarget.missing.join('；'),
        {
          valid: '有效',
          missing: '缺源记录或版本',
          invalid: '源数值无效',
          conflict: '源值冲突',
          'read-failed': '读取失败',
        }[row.inventoryTarget.status] ?? '待核对',
        row.inventoryTarget.missingCodes?.join('；'),
        row.missing.targetInventory?.join('；'),
        row.targetInventoryMissing?.join('；'),
        row.baseSafetyDays,
        row.nextMonthDemand,
        row.nextMonthDays,
        draft.month,
        row.turnoverPolicy.sourceDays,
        row.turnoverPolicy.sourceMonths.join('、'),
        row.turnoverPolicy.sourceVersion,
        row.turnoverPolicy.fallbackReason,
        row.safetyDays === null ? '目标库存待补，补充后重新评估' : '天数已齐，其他依赖另行核对',
        report?.异常类别,
        report?.原因,
        report?.实际处理,
        report?.计算依据,
        ...Object.values(inventoryDependencyFields(row)),
      ];
    };
    const exportRow = (row) => {
      const cells = values(row);
      return Object.fromEntries(fields.map((field, index) => [field, cells[index]]));
    };
    const sourceColumns = [
      '月份',
      '基地',
      '产品编码',
      '目标版本',
      '源最终目标库存',
      '源日均计划需求',
      '源最终目标周转天数',
      '源记录数',
      '目标不同值数',
      '日均不同值数',
      '目标空值行',
      '日均空值行',
      '源冲突字段',
      '业务键核对',
      '安全天数使用状态',
    ];
    const evaluatedKeys = new Set(scopedRows.map((row) => JSON.stringify([row.base, row.code])));
    const sourceRows = (read?.status === 'ready' ? (draft.inventoryTargets ?? []) : [])
      .filter(
        (row) =>
          !selectedCategories.length ||
          scopedRows.some((entry) => entry.base === row.base && entry.code === row.code),
      )
      .map((row) => ({
        月份: row.month,
        基地: row.base,
        产品编码: row.code,
        目标版本: row.version,
        源最终目标库存: row.finalTarget,
        源日均计划需求: row.dailyDemand,
        源最终目标周转天数: row.finalTurnoverDays,
        源记录数: row.sourceRows,
        目标不同值数: row.finalTargetValueCount,
        日均不同值数: row.dailyDemandValueCount,
        目标空值行: row.missingTargetRows,
        日均空值行: row.missingDailyRows,
        源冲突字段: row.conflictFields?.join('；'),
        安全天数使用状态:
          row.month === sourceMonth &&
          row.version ===
            policyByProduct.get(JSON.stringify([row.base, row.code]))?.sourceVersion &&
          policyByProduct.get(JSON.stringify([row.base, row.code]))?.sourceDays !== null
            ? '已采用该基地SKU的来源月及版本'
            : '保留源记录，未用作本轮安全天数',
        业务键核对: evaluatedKeys.has(JSON.stringify([row.base, row.code]))
          ? '基地、SKU匹配；来源月与版本按周转规则选择'
          : '月份、基地或SKU不在当前评估明细，未参与计算',
      }));
    return card(
      '基地与单品目标库存',
      h(
        react.Fragment,
        null,
        h(
          'p',
          { className: 'wf-note', role: 'status' },
          busy
            ? '正在读取目标库存…'
            : missing
              ? `${missing}个单品月份缺有效天数，目标库存待补。`
              : '全部单品月份已有有效周转天数，其他推导依赖另行核对。',
        ),
        h(
          'p',
          { className: 'wf-note', role: 'status' },
          `当前范围${policyByProduct.size}个基地SKU、${scopedRows.length}个单品月份；缺有效天数${missing}项，缺下月有效需求${scopedRows.filter((row) => row.nextMonthDemand === null).length}项，目标库存待补${scopedRows.filter((row) => row.targetInventory === null).length}项。有效0天不因缺下月需求阻断目标库存。`,
        ),
        read?.status === 'failed' &&
          h('p', { role: 'alert' }, read.error || '目标库存读取失败，请重试'),
        h(
          'p',
          { className: 'wf-note' },
          `业务日期${businessDate}，安全天数来源月${sourceMonth}；逐基地SKU按${version === 'auto' ? versionOrder.join('、') : version}选择，实际采用${sourceVersions.join('、') || '暂无有效版本'}。同一基地SKU的天数供本次三个评估月共用。目标库存使用各评估月的下月有效需求；0天无需下月需求。缺源且无有效人工补充时保留待补，不按0天计算。`,
        ),
        h(
          'div',
          { className: 'wf-actions' },
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
        h('h3', { className: 'wf-target-heading' }, '周转天数与库存目标报告'),
        h(
          'p',
          { className: 'wf-note' },
          `当前筛选有${reportRows.length}项报告，预览前25项；下载保留当前月份、基地及搜索范围的完整明细。有效0天只将目标库存设为0，预测结存按库存收支计算。`,
        ),
        h(
          'button',
          {
            disabled: !reportRows.length,
            onClick: () => downloadCsv('周转天数与库存目标报告', turnoverReportColumns, reportRows),
          },
          '下载周转天数报告',
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
        h(
          'p',
          { className: 'wf-note' },
          `当前筛选有${pending.length}个基地SKU的源天数待核对或补充，具体原因见表；补充值对本次三个评估月共用，明确填0有效。`,
        ),
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
          h(
            'div',
            { className: 'wf-actions' },
            h(
              'button',
              {
                disabled: supplementIndex === 0,
                onClick: () => setSupplementPage(supplementIndex - 1),
              },
              '上一页待补天数',
            ),
            h('span', null, `第${supplementIndex + 1}页，共${pending.length}项`),
            h(
              'button',
              {
                disabled: (supplementIndex + 1) * 25 >= pending.length,
                onClick: () => setSupplementPage(supplementIndex + 1),
              },
              '下一页待补天数',
            ),
          ),
        h(
          'div',
          { className: 'wf-actions' },
          h(
            'button',
            {
              disabled: !rows.length,
              onClick: () => downloadCsv('目标库存与周转天数', fields, rows.map(exportRow)),
            },
            '下载目标库存明细',
          ),
          h(
            'button',
            {
              disabled: !scopedRows.length,
              onClick: () =>
                downloadCsv(
                  `${draft.month}-三个月完整目标库存`,
                  ['评估版本', ...fields],
                  scopedRows.map((row) => ({
                    评估版本: draft.name,
                    ...exportRow(row),
                  })),
                ),
            },
            '下载三个月完整目标库存',
          ),
        ),
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
          bases.flatMap((base) =>
            result.months.slice(0, 3).map((month) => {
              const group = scopedRows.filter((row) => row.base === base && row.month === month);
              const days = [...new Set(group.map((row) => row.safetyDays))];
              const demand = group.filter((row) => row.nextMonthDemand !== null);
              const targets = group.filter((row) => row.targetInventory !== null);
              return [
                base,
                month,
                days.length === 1 ? number(days[0]) : '按单品天数',
                number(
                  demand.length ? demand.reduce((sum, row) => sum + row.nextMonthDemand, 0) : null,
                  0,
                ),
                group[0]?.nextMonthDays ?? '—',
                number(
                  targets.length
                    ? targets.reduce((sum, row) => sum + row.targetInventory, 0)
                    : null,
                  0,
                ),
                group.length - demand.length,
                group.filter((row) => row.targetInventory === null).length,
              ];
            }),
          ),
        ),
        h('p', { className: 'wf-note' }, '已知小计，缺项未计入。'),
        h(
          'div',
          { className: 'wf-actions' },
          h(
            'button',
            {
              disabled: !sourceRows.length,
              onClick: () =>
                downloadCsv(
                  `${draft.month}-目标库存完整源记录`,
                  ['评估版本', ...sourceColumns],
                  sourceRows.map((row) => ({ 评估版本: draft.name, ...row })),
                ),
            },
            '下载完整目标源记录',
          ),
        ),
      ),
      h(
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
          { onClick: sync, disabled: busy || batch.active },
          busy ? '读取目标库存中…' : '同步目标库存',
        ),
      ),
    );
  };
}
