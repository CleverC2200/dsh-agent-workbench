import { buildCategoryDemand } from './category-demand.js';
import { changeAdjustment } from './local-draft.js';

export function createCategoryDemand(react, { table, downloadCsv, categories, useMpsPart }) {
  const h = react.createElement;
  const columns = [
    '大类',
    '月份',
    '历史平均环比',
    '环比链',
    '① 环比法',
    '同期平均占比',
    '② 占比法',
    '加权',
    '系统需求数量',
    '有效需求数量',
    '调整原因',
    '调整时间',
  ];
  return function CategoryDemand({ draft, update, active }) {
    const result = react.useMemo(() => buildCategoryDemand(draft, categories), [draft]);
    const [editing, setEditing] = react.useState(null);
    const [quantity, setQuantity] = react.useState('');
    const [reason, setReason] = react.useState('');
    const [error, setError] = react.useState('');
    react.useEffect(() => {
      setEditing(null);
      setError('');
    }, [draft.id, draft.month]);
    const rows = result.rows.map((row, index) => {
      const edit = draft.adjustments?.categoryDemand?.find(
        (entry) => entry.month === row.month && entry.category === row.category,
      );
      return {
        大类: row.category,
        月份: `${row.month}（M+${(index % 4) + 1}）`,
        历史平均环比: row.mom ?? '',
        环比链: row.chain ?? '',
        '① 环比法': row.momMethod ?? '',
        同期平均占比: row.share ?? '',
        '② 占比法': row.shareMethod ?? '',
        加权: row.weighted ?? '',
        系统需求数量: row.systemQuantity ?? '',
        有效需求数量: row.quantity ?? '',
        调整原因: edit?.reason ?? '',
        调整时间: edit?.at ?? '',
        操作: h(
          react.Fragment,
          {},
          h(
            'button',
            {
              onClick: () => {
                setEditing(row);
                setQuantity(row.quantity == null ? '' : String(row.quantity));
                setReason(edit?.reason ?? '');
                setError('');
              },
              'aria-label': `调整 ${row.category} ${row.month}`,
            },
            '调整',
          ),
          edit &&
            h(
              'button',
              {
                onClick: () =>
                  update({
                    adjustments: changeAdjustment(
                      draft.adjustments,
                      'categoryDemand',
                      { month: row.month, category: row.category },
                      true,
                    ),
                  }),
                'aria-label': `撤销 ${row.category} ${row.month}`,
              },
              '撤销',
            ),
        ),
      };
    });
    const summary = result.bases.map((basis) => ({
      大类: basis.category,
      ...Object.fromEntries(
        result.rows
          .filter((row) => row.category === basis.category)
          .map((row, index) => [`M+${index + 1}`, row.quantity ?? '']),
      ),
    }));
    const apply = () => {
      try {
        if (quantity.trim() === '') throw Error('请填写调整数量，留空不代表0。');
        const adjustments = changeAdjustment(draft.adjustments, 'categoryDemand', {
          month: editing.month,
          category: editing.category,
          quantity: Number(quantity),
          systemValue:
            result.rows.find(
              (row) => row.month === editing.month && row.category === editing.category,
            )?.systemQuantity ?? null,
          reason,
        });
        const candidate = buildCategoryDemand({ ...draft, adjustments }, categories);
        if (candidate.adjustmentIssues.length) throw Error(candidate.adjustmentIssues.join('；'));
        update({ adjustments });
        setEditing(null);
        setError('');
      } catch (failure) {
        setError(failure.message);
      }
    };
    useMpsPart(
      react,
      'category-demand',
      { ...result, adjustments: draft.adjustments ?? null },
      '大类逐月需求计算',
      active,
    );
    return h(
      react.Fragment,
      {},
      h(
        'section',
        { 'aria-label': '逐月测算', className: 'dc-card dc-results' },
        h(
          'div',
          { className: 'dc-card-head' },
          h('h3', {}, '逐月测算（到大类预估需求数量）'),
          h(
            'span',
            { className: 'dc-card-note' },
            `${result.rows.filter((row) => row.quantity !== null).length} / ${rows.length} 项可计算 · 单位：件`,
          ),
          h(
            'button',
            { onClick: () => downloadCsv(`大类逐月测算-${draft.month}.csv`, columns, rows) },
            '下载测算明细',
          ),
        ),
        result.adjustmentIssues.length > 0 &&
          h('p', { role: 'alert' }, `以下调整未生效：${result.adjustmentIssues.join('；')}`),
        table([...columns, '操作'], rows),
        editing &&
          h(
            'fieldset',
            { 'aria-label': '大类需求调整', className: 'dc-card-foot' },
            h('legend', {}, `${editing.category} · ${editing.month}`),
            h(
              'p',
              {},
              `系统需求：${editing.systemQuantity ?? '待定'}件；有效需求：${editing.quantity ?? '待定'}件。仅调整当前本地版本。`,
            ),
            h(
              'label',
              {},
              '调整需求数量',
              h('input', {
                'aria-label': '调整需求数量',
                type: 'number',
                min: 0,
                step: 'any',
                value: quantity,
                onChange: (event) => setQuantity(event.target.value),
              }),
            ),
            h(
              'label',
              {},
              '调整原因',
              h('input', {
                'aria-label': '调整原因',
                value: reason,
                maxLength: 1000,
                onChange: (event) => setReason(event.target.value),
              }),
            ),
            error && h('p', { role: 'alert' }, error),
            h('button', { className: 'dc-primary', onClick: apply }, '应用大类调整'),
            h('button', { onClick: () => setEditing(null) }, '取消'),
          ),
        h(
          'div',
          { className: 'dc-card-foot' },
          'M+1、M+2按（环比法＋占比法）÷2÷计划达成率；计划达成率＝同一窗口近三月BI实发合计÷DMS计划合计。M+3、M+4按上月有效需求×年度分月环比延展。年度分月环比＝本月年度需求÷上月年度需求。缺完整历史、零分母或依赖数据时系统值留空；人工调整须填写原因。展示取整数，计算及下载保留原精度。',
        ),
      ),
      h(
        'section',
        { 'aria-label': '大类预估需求数量', className: 'dc-card dc-results' },
        h(
          'div',
          { className: 'dc-card-head' },
          h('h3', {}, '大类预估需求数量'),
          h(
            'span',
            { className: 'dc-card-note' },
            '下游使用有效需求。M+4只到大类，本地调整不代表正式保存。',
          ),
        ),
        table(['大类', 'M+1', 'M+2', 'M+3', 'M+4'], summary),
      ),
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
                操作: entry.action === 'undo' ? '撤销' : '调整',
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
