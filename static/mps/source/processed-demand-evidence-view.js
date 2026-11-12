const valueText = (value) => (value == null ? '待补' : String(value));

export function createProcessedDemandEvidence(react, { downloadCsv }) {
  const h = react.createElement;
  return function ProcessedDemandEvidence({ draft, result, rows, filters, table }) {
    const categories = [...new Set(rows.map((row) => row.category))];
    const available = result.rows.filter(
      (row) => categories.includes(row.category) && (!filters.month || row.month === filters.month),
    );
    const [selection, setSelection] = react.useState({});
    const scope = JSON.stringify([draft.id, draft.month, filters.category, filters.month]);
    const selectedCategory =
      selection.scope === scope && categories.includes(selection.category)
        ? selection.category
        : categories[0];
    const categoryRows = available.filter((row) => row.category === selectedCategory);
    const selected =
      categoryRows.find((row) => selection.scope === scope && row.month === selection.month) ??
      categoryRows[0];
    const select = (field, value) =>
      setSelection({ scope, category: selectedCategory, month: selected?.month, [field]: value });
    const basis = result.bases.find((row) => row.category === selectedCategory);
    const history = result.historical.find(
      (row) => row.category === selectedCategory && row.month === selected?.month,
    );
    const previous = result.rows.filter((row) => row.category === selectedCategory);
    const index = previous.indexOf(selected);
    const steps = selected
      ? [
          ['本月有效预估发货', selected.shipment, `${selected.baseMonth} 第二页同版有效预估`],
          ['近三月实际发货', basis.actual, `${result.recent.join('、')} 合计`],
          ['近三月计划数量', basis.plan, '近三月历史计划数量合计'],
          ['近三月历史占比合计', basis.recentShare, '三个统计月历史同期占比合计'],
          ['全年预估', basis.annualEstimate, '近三月实际发货 ÷ 近三月历史占比合计'],
          [
            '环比起点',
            index === 0 ? selected.shipment : previous[index - 1]?.momMethod,
            index === 0 ? '本月有效预估发货' : '前月环比测算量，独立于加权及人工调整',
          ],
          ['所用环比系数', selected.chain, index < 2 ? '三年历史平均环比' : '年度环比'],
          ['独立环比测算量', selected.momMethod, '环比起点 × 所用环比系数'],
          ['同期平均占比', selected.share, '三年该月占比平均'],
          ['占比测算量', selected.shareMethod, '全年预估 × 同期平均占比'],
          ['两法平均量', selected.methodAverage, '环比测算量与占比测算量各占一半'],
          [
            '销售提报量',
            selected.salesSubmission,
            index === 0
              ? draft.pull === 'monthly'
                ? '月初提报量'
                : '纠偏提报量'
              : '本月不采用提报加权',
          ],
          [
            '近三月达成率',
            index === 0 ? selected.achievementRate : null,
            index === 0 ? '近三月实际发货合计 ÷ 近三月计划数量合计' : '本月不采用提报加权',
          ],
          [
            '销售校正量',
            selected.salesCorrected,
            index === 0 ? '销售提报量 × 近三月达成率' : '本月不采用提报加权',
          ],
          [
            '最终两次平均',
            selected.weighted,
            index === 0 ? '两法平均量与销售校正量各占一半' : '本月不采用提报加权',
          ],
          ['系统大类需求', selected.systemQuantity, selected.method],
          [
            '有效大类需求',
            selected.quantity,
            selected.adjusted ? '已采用当前人工调整' : '采用系统值',
          ],
        ]
      : [];
    const historyRows = history?.years ?? [];
    const exportRows = () => {
      const context = {
        评估版本: draft.name,
        评估月份: draft.month,
        提报口径: draft.pull === 'monthly' ? '月初' : '纠偏',
        大类: selectedCategory,
        月份: selected.month,
      };
      const columns = [
        '评估版本',
        '评估月份',
        '提报口径',
        '大类',
        '月份',
        '步骤',
        '数值',
        '计算依据',
        '历史月份',
        '历史发货',
        '上月发货',
        '上年同期发货',
        '财年发货',
      ];
      downloadCsv(`${draft.month}-${selectedCategory}-${selected.month}-计算过程.csv`, columns, [
        ...steps.map(([步骤, 数值, 计算依据]) => ({ ...context, 步骤, 数值, 计算依据 })),
        ...historyRows.map((row) => ({
          ...context,
          步骤: '三年历史依据',
          历史月份: row.month,
          历史发货: row.quantity,
          上月发货: row.priorMonthQuantity,
          上年同期发货: row.priorYearQuantity,
          财年发货: row.annualQuantity,
        })),
      ]);
    };
    return h(
      'details',
      { className: 'wf-disclosure' },
      h('summary', null, '预览大类计算过程'),
      h(
        'section',
        { 'aria-label': '大类计算过程预览' },
        h(
          'p',
          { className: 'wf-note' },
          '大类计算使用全国口径，预览随当前大类和月份筛选。基地与SKU筛选决定可预览的大类。数值保留原始小数，未采用的方法显示不适用。',
        ),
        selected
          ? h(
              react.Fragment,
              null,
              h(
                'div',
                { className: 'wf-filters' },
                h(
                  'label',
                  null,
                  '大类',
                  h(
                    'select',
                    {
                      'aria-label': '计算大类',
                      value: selectedCategory,
                      onChange: (event) => select('category', event.target.value),
                    },
                    categories.map((category) =>
                      h('option', { key: category, value: category }, category),
                    ),
                  ),
                ),
                h(
                  'label',
                  null,
                  '月份',
                  h(
                    'select',
                    {
                      'aria-label': '计算月份',
                      value: selected.month,
                      onChange: (event) => select('month', event.target.value),
                    },
                    categoryRows.map((row) =>
                      h('option', { key: row.month, value: row.month }, row.month),
                    ),
                  ),
                ),
                h('button', { onClick: exportRows }, '下载当前计算过程'),
              ),
              table(
                '大类计算步骤',
                ['步骤', '数值', '计算依据'],
                steps.map(([name, value, reason]) => [
                  name,
                  value == null && reason.startsWith('本月不采用') ? '不适用' : valueText(value),
                  reason,
                ]),
              ),
              table(
                '三年历史计算依据',
                ['历史月份', '历史发货', '上月发货', '上年同期发货', '财年发货'],
                historyRows.map((row) => [
                  row.month,
                  ...[
                    row.quantity,
                    row.priorMonthQuantity,
                    row.priorYearQuantity,
                    row.annualQuantity,
                  ].map(valueText),
                ]),
              ),
            )
          : h('p', { className: 'wf-note' }, '当前筛选暂无可预览的大类与月份。'),
      ),
    );
  };
}
