import { matchesCategories } from './category-filter.js';
import { createCalculationHelp } from './calculation-help.js';
import { categoryDemandMissing } from './category-demand.js';
import { demandBasisLabel, festivalOptionValue } from './festival-demand.js';
import { createUpperAdjustmentConflicts } from './upper-adjustment-conflicts.js';
import { workflowContextPreview } from './evaluation-view.js';

export function createShipmentScopeNotice(react, { downloadCsv }) {
  const h = react.createElement;
  return function ShipmentScopeNotice({ scope, month, cutoff, selectedCategories = [] }) {
    const [expanded, setExpanded] = react.useState(false);
    scope = scope && {
      ...scope,
      excluded: scope.excluded.filter((row) => matchesCategories(row.category, selectedCategories)),
      issues: (scope.issues ?? []).filter((row) =>
        matchesCategories(row.category, selectedCategories),
      ),
      coverage: scope.coverage.filter((row) => matchesCategories(row.category, selectedCategories)),
    };
    if (!scope?.excluded.length) return null;
    const fields = {
      shipped: '本月已发货',
      prepped: '已备',
      unprepped: '未备',
      daily3: '近三天日均发货量',
      average: '近30天日均发货',
      open: '月初库存',
      inbound: '本月生产入库',
      remaining: '剩余天数入库',
      base: '来源基地及该基地的对应数量',
    };
    const rows = [...scope.excluded, ...(scope.issues ?? [])].map((row) => ({
      评估月份: month,
      统计基月: row.month,
      发货截止日: row.month && row.month === cutoff?.slice(0, 7) ? cutoff : '',
      基地: row.base,
      产品编码: row.code,
      产品名称: row.name,
      大类: row.category || '待确认',
      缺项: row.missing.join('；'),
      需要补齐的数据: row.missingFields.length
        ? row.missingFields.map((field) => fields[field] ?? field).join('；')
        : '按缺项说明核对发货来源、日期或产品关系',
      处理说明: '核对源数据后重新同步，或在本地调整中填写已确认值。未补齐前不参与本次大类需求和后续拆分，未补零。',
      来源: row.source || '本月预估发货的同版输入',
    }));
    const columns = Object.keys(rows[0]);
    return h(
      'section',
      { className: 'dc-card dc-scope-notice', 'aria-label': '待定单品异常' },
      h(
        'div',
        { className: 'dc-scope-notice-bar' },
        h(
          'p',
          { role: 'status' },
          `部分可计算 · ${scope.excluded.length} 条基地 SKU 待补，数量仅覆盖有效记录`,
        ),
        h(
          'button',
          {
            className: 'mps-download',
            onClick: () => downloadCsv(`待定单品异常-${month}.csv`, columns, rows),
          },
          '下载待定单品异常CSV',
        ),
      ),
      h(
        'details',
        {
          className: 'mps-report-details',
          open: expanded,
          onToggle: (event) => {
            if (event.target === event.currentTarget) setExpanded(event.currentTarget.open);
          },
        },
        h('summary', null, `查看待定单品异常（${rows.length}条）`),
        h(
          'p',
          { className: 'dc-card-note' },
          scope.coverage
            .map((row) => `${row.category}：参与${row.included}条，排除${row.excluded}条`)
            .join('；'),
        ),
        scope.issues?.length > 0 &&
          h(
            'p',
            { role: 'status', className: 'dc-card-note' },
            `另有${scope.issues.length}条来源缺基地，无法确认参与范围，相关系数保留待定，明细已列入CSV。`,
          ),
        expanded &&
          h(
            'div',
            {
              className: 'dc-table-scroll',
              tabIndex: 0,
              role: 'region',
              'aria-label': '待定单品异常滚动区域',
            },
            h(
              'table',
              { className: 'dc-table' },
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  columns.map((column) => h('th', { key: column, scope: 'col' }, column)),
                ),
              ),
              h(
                'tbody',
                null,
                rows.slice(0, 50).map((row, index) =>
                  h(
                    'tr',
                    { key: index },
                    columns.map((column) => h('td', { key: column }, row[column])),
                  ),
                ),
              ),
            ),
          ),
        rows.length > 50 &&
          h('p', { className: 'dc-card-note' }, '页面预览前50条，CSV包含全部异常。'),
      ),
    );
  };
}

export function createCategoryDemand(
  react,
  { table, downloadCsv, downloadExceptions, useMpsPart },
) {
  const h = react.createElement;
  const CalculationHelp = createCalculationHelp(react);
  const ShipmentScopeNotice = createShipmentScopeNotice(react, { downloadCsv: downloadExceptions });
  const calculationFormulas = [
    ['① 环比法', '本月预估发货 × 环比'],
    ['② 占比法', '全年预估 × 占比'],
    ['两法平均量', '①、②各占一半'],
    ['销售校正量', '销售提报量 × 达成率'],
    ['加权', '仅 M+1 使用，两法平均量与销售校正量各占一半'],
  ];
  const columns = [
    '大类',
    '月份',
    '历史平均环比',
    '年度环比',
    '① 环比法',
    '同期平均占比',
    '② 占比法',
    '两法平均量',
    '销售提报量',
    '近三月达成率',
    '销售校正量',
    '加权',
  ];
  const detailColumns = [
    '大类',
    '月份',
    '系统需求数量',
    '大类预估需求数量',
    '需求数量来源',
    '调整原因',
    '调整时间',
    '评估版本',
    '提报口径',
    '统计基月',
    '本月有效预估发货',
    '计算范围',
    '参与单品记录数',
    '排除单品记录数',
    '计算口径',
    '推算口径',
    '节日对照区间',
    '近三月自然月实绩月份',
    '缺项说明',
  ];
  const UpperAdjustmentConflicts = createUpperAdjustmentConflicts(react);
  return function CategoryDemand({
    draft,
    update,
    active,
    selectedCategories = [],
    shipmentSnapshot,
    result,
    sourceRows,
    retryFestivalHistory,
    basisDisabled,
  }) {
    const basisRadioId = react.useId();
    const festivalSelectId = react.useId();
    const festival = result.festival;
    const festivalMonths = new Set(festival?.months);
    const naturalActualMonths = result.recent.filter((month) => !festivalMonths.has(month));
    const option = festival?.selected ? festivalOptionValue(festival.selected) : '';
    const waiting = ['loading', 'choose', 'failed'].includes(festival?.status);
    const chainColumn = festival ? '采用环比' : '年度环比';
    const calculationColumns = columns.map((name) => (name === '年度环比' ? chainColumn : name));
    const selectedRows = result.rows.filter((row) =>
      matchesCategories(row.category, selectedCategories),
    );
    const scopedSources = react.useMemo(
      () => sourceRows.filter((row) => matchesCategories(row['大类'], selectedCategories)),
      [sourceRows, selectedCategories],
    );
    const rows = result.rows.map((row, index) => {
      const missing = categoryDemandMissing(result, row);
      return {
        大类: row.category,
        月份: `${row.month}（M+${(index % 4) + 1}）`,
        历史平均环比: row.mom ?? '',
        [chainColumn]: row.chain ?? '',
        '① 环比法': row.momMethod ?? '',
        同期平均占比: row.share ?? '',
        '② 占比法': row.shareMethod ?? '',
        两法平均量: row.methodAverage ?? '',
        销售提报量: row.salesSubmission ?? '',
        近三月达成率: index % 4 === 0 ? (row.achievementRate ?? '') : '',
        销售校正量: row.salesCorrected ?? '',
        加权: row.weighted ?? '',
        评估版本: draft.name,
        提报口径: draft.pull === 'monthly' ? '月初' : '纠偏',
        统计基月: row.baseMonth,
        本月有效预估发货: row.shipment ?? '',
        计算范围: row.coverage === 'partial' ? '部分可计算' : '当前参与范围',
        参与单品记录数:
          result.shipmentScope.coverage.find((entry) => entry.category === row.category)
            ?.included ?? 0,
        排除单品记录数:
          result.shipmentScope.coverage.find((entry) => entry.category === row.category)
            ?.excluded ?? 0,
        计算口径: row.method,
        推算口径: demandBasisLabel(festival, row.month),
        节日对照区间: (festival?.windows ?? [])
          .filter((window) => window.month === row.month)
          .map(
            (window) => `${window.year}年 ${window.comparison}（${window.start}至${window.end}）`,
          )
          .join('；'),
        近三月自然月实绩月份: festival ? naturalActualMonths.join('、') : '',
        系统需求数量: row.systemQuantity ?? '',
        大类预估需求数量: row.quantity ?? '',
        需求数量来源: row.adjusted ? '基地SKU汇总，调整原因和时间见逐叶子明细' : '系统测算',
        调整原因: '',
        调整时间: '',
        缺项说明: missing.join('；'),
        操作: h(
          'div',
          { className: 'dc-demand-quantity' },
          h(
            'span',
            {
              className:
                row.quantity == null ? 'dc-demand-amount dc-demand-missing' : 'dc-demand-amount',
              title: missing.join('；'),
            },
            row.quantity == null ? '待补' : String(Math.round(row.quantity)),
          ),

          row.coverage === 'partial' && h('small', { className: 'dc-adjusted-mark' }, '部分可计算'),
        ),
      };
    });
    const visibleRows = rows.filter((row) => matchesCategories(row['大类'], selectedCategories));
    const summary = result.bases
      .filter((basis) => matchesCategories(basis.category, selectedCategories))
      .map((basis) => ({
        大类: basis.category,
        ...Object.fromEntries(
          result.rows
            .filter((row) => row.category === basis.category)
            .map((row, index) => {
              const detail = rows[result.rows.indexOf(row)];
              return [`M+${index + 1}`, detail['操作']];
            }),
        ),
      }));
    if (summary.length)
      summary.push({
        大类: selectedCategories.length ? '当前范围合计' : '合计',
        ...Object.fromEntries(
          [...new Set(result.rows.map((row) => row.month))].map((month, index) => {
            const entries = selectedRows.filter((row) => row.month === month);
            const known = entries.filter((row) => row.quantity !== null);
            const missing = entries.length - known.length;
            return [
              `M+${index + 1}`,
              h(
                'div',
                { className: 'dc-demand-quantity' },
                h(
                  'span',
                  {
                    className: known.length
                      ? 'dc-demand-amount'
                      : 'dc-demand-amount dc-demand-missing',
                  },
                  known.length
                    ? String(Math.round(known.reduce((sum, row) => sum + row.quantity, 0)))
                    : '待补',
                ),
                missing > 0 &&
                  h(
                    'small',
                    { className: 'dc-adjusted-mark' },
                    `${known.length ? '已知小计 · ' : ''}${missing}项待补`,
                  ),
                entries.some((row) => row.coverage === 'partial') &&
                  h('small', { className: 'dc-adjusted-mark' }, '部分可计算'),
              ),
            ];
          }),
        ),
      });
    useMpsPart(
      react,
      'category-demand',
      workflowContextPreview({
        ...result,
        preview: '上下文只预览每组最多10条及完整条数，完整原因和数据见页面和CSV',
        shipmentScope: {
          ...result.shipmentScope,
          excluded: result.shipmentScope.excluded.slice(0, 10),
          excludedTotal: result.shipmentScope.excluded.length,
          issues: (result.shipmentScope.issues ?? []).slice(0, 10),
          issueTotal: result.shipmentScope.issues?.length ?? 0,
          preview: '异常最多预览10条，完整明细在页面和CSV',
        },
        historical: result.historical.map(
          ({ category, month, yoy, mom, share, yoyValidCount, yoyComplete }) => ({
            category,
            month,
            yoy,
            mom,
            share,
            yoyValidCount,
            yoyComplete,
          }),
        ),
        adjustments: draft.adjustments ?? null,
      }),
      '大类逐月需求计算',
      active,
    );
    return h(
      react.Fragment,
      {},
      h(ShipmentScopeNotice, {
        scope: result.shipmentScope,
        month: draft.month,
        cutoff: shipmentSnapshot?.cutoff,
        selectedCategories,
      }),
      h(
        'section',
        {
          'aria-label': '大类预估需求数量',
          className: 'dc-card dc-results dc-demand-summary',
        },
        h(
          'div',
          { className: 'dc-card-head dc-demand-edit-bar mps-report-heading mps-table-heading' },
          h('h3', {}, '大类预估需求数量'),
          h('span', { className: 'dc-card-note' }, '单位：件'),
          h(
            'button',
            {
              type: 'button',
              className: 'mps-download',
              disabled: !scopedSources.length,
              onClick: () =>
                downloadCsv(
                  `${draft.month}-大类池内源明细.csv`,
                  [
                    '来源',
                    '月份',
                    '基地',
                    '产品编码',
                    '大类',
                    '数量',
                    '原始来源数量',
                    '财年',
                    '原始全国SKU财年量',
                    '基地SKU财年量',
                    '财年源月份数',
                    '财年有效月份数',
                    '池内大类财年量',
                    '财年缺失或冲突月份',
                    '财年核对异常',
                    '上年同期发货数量',
                    '上月发货数量',
                    '取数依据',
                    '缺项原因',
                  ],
                  scopedSources,
                ),
            },
            '下载大类池内源明细',
          ),
        ),
        table(
          ['大类', 'M+1', 'M+2', 'M+3', 'M+4'],
          summary,
          Object.fromEntries(
            result.rows
              .slice(0, 4)
              .map((row, index) => [
                `M+${index + 1}`,
                `M+${index + 1} · ${row.month}${index === 3 ? ' 库存参考' : ''}`,
              ]),
          ),
        ),
      ),
      h(
        'section',
        { 'aria-label': '逐月测算' },
        h(
          'details',
          { className: 'dc-card dc-results mps-report-details' },
          h('summary', null, '逐月测算依据'),
          h(
            'div',
            { className: 'dc-toolbar dc-report-filters mps-disclosure-toolbar' },
            h(
              CalculationHelp,
              { title: '逐月测算口径' },
              h(
                'p',
                null,
                `${result.rows[0]?.baseMonth ?? ''}为统计基月M。${festival ? '节日覆盖月份使用对照区间的历史环比和同期占比，窗口外沿用自然月。' : 'M+1、M+2使用历史环比，M+3、M+4使用年度环比；'}后月只承接前月环比测算量。四个月均计算两法平均量，仅M+1再与销售校正量各占一半，M+2至M+4直接使用两法平均量。M+4仅作库存参考。`,
              ),
              h(
                'dl',
                null,
                calculationFormulas.map(([name, formula]) =>
                  h('div', { key: name }, h('dt', null, name), h('dd', null, formula)),
                ),
              ),
            ),
            h(
              'span',
              { className: 'dc-card-note' },
              `${selectedRows.filter((row) => row.quantity !== null).length} / ${visibleRows.length} 项可计算 · 单位：件`,
            ),
            h(
              'fieldset',
              { className: 'dc-calculation-basis' },
              h('legend', null, '推算口径'),
              ...[
                ['calendar', '自然月'],
                ['festival', '节日推算'],
              ].map(([value, label]) =>
                h(
                  'span',
                  { key: value },
                  h('input', {
                    id: basisRadioId + value,
                    name: basisRadioId,
                    type: 'radio',
                    value,
                    checked: value === (festival ? 'festival' : 'calendar'),
                    disabled: basisDisabled,
                    onChange: () =>
                      update({
                        festivalBasis: value === 'festival' ? {} : undefined,
                        festivalHistoryRead: undefined,
                      }),
                  }),
                  h('label', { htmlFor: basisRadioId + value }, label),
                ),
              ),
            ),
            festival?.options.length > 1 &&
              h(
                'div',
                { className: 'dc-festival-picker' },
                h('label', { htmlFor: festivalSelectId }, '评估节日'),
                h(
                  'select',
                  {
                    id: festivalSelectId,
                    value: option,
                    disabled: basisDisabled,
                    onChange: (event) =>
                      update({
                        festivalBasis:
                          festival.options.find(
                            (candidate) => festivalOptionValue(candidate) === event.target.value,
                          ) ?? {},
                      }),
                  },
                  h('option', { value: '' }, '请选择节日'),
                  festival.options.map((candidate) => {
                    const id = festivalOptionValue(candidate);
                    return h(
                      'option',
                      { key: id, value: id },
                      `${candidate.name} · ${candidate.date}`,
                    );
                  }),
                ),
              ),
            h(
              'button',
              {
                className: 'mps-download',
                disabled: waiting,
                onClick: () =>
                  downloadCsv(
                    `大类逐月测算-${draft.month}.csv`,
                    [
                      ...calculationColumns,
                      ...detailColumns.filter((column) => !calculationColumns.includes(column)),
                    ],
                    visibleRows,
                  ),
              },
              '下载测算明细',
            ),
          ),
          festival &&
            h(
              'div',
              {
                className: 'dc-festival-status',
                role: festival.status === 'failed' ? 'alert' : 'status',
              },
              festival.status === 'loading'
                ? '正在读取节日发货及对照月份…'
                : festival.status === 'choose'
                  ? '请选择本评估使用的节日。整份评估使用同一套节日映射。'
                  : festival.status === 'failed'
                    ? `节日发货读取失败。 ${festival.error}`
                    : festival.status === 'outside'
                      ? '本期没有节日映射，逐月测算采用自然月。'
                      : [
                          `${festival.selected.name}（${festival.selected.date}）`,
                          festival.naturalMonths.length
                            ? `预测沿用自然月：${festival.naturalMonths.join('、')}`
                            : '',
                          naturalActualMonths.length
                            ? `近三月实绩沿用自然月：${naturalActualMonths.join('、')}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · '),
              festival.status === 'failed' &&
                h(
                  'button',
                  { type: 'button', onClick: retryFestivalHistory, disabled: basisDisabled },
                  '重试',
                ),
            ),
          result.adjustmentIssues.length > 0 &&
            h('p', { role: 'alert' }, `以下调整未生效：${result.adjustmentIssues.join('；')}`),
          h(
            'div',
            { className: 'dc-category-demand-main' },
            table(calculationColumns, visibleRows),
          ),
        ),
      ),
      h(UpperAdjustmentConflicts, { draft, update }),
      (draft.adjustments?.history ?? []).some((entry) => entry.kind === 'categoryDemand') &&
        h(
          'section',
          { 'aria-label': '大类调整记录', className: 'dc-card dc-results' },
          h('h3', {}, '大类调整记录'),
          table(
            ['对象', '操作', '系统值', '有效值', '原因', '时间'],
            draft.adjustments.history
              .filter((entry) => entry.kind === 'categoryDemand')
              .map((entry) => ({
                对象: entry.key,
                操作:
                  entry.action === 'archive' ? '归档' : entry.action === 'undo' ? '撤销' : '调整',
                系统值: entry.systemValue ?? '',
                有效值: entry.value ?? '',
                原因: entry.reason,
                时间: entry.at,
              })),
          ),
        ),
    );
  };
}
