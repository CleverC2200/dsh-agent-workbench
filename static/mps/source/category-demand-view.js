import { buildCategoryDemand } from './category-demand.js';
import { changeAdjustment } from './local-draft.js';

export function createCategoryDemand(react, { table, downloadCsv, useMpsPart }) {
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
  ];
  const detailColumns = [
    '大类',
    '月份',
    '系统需求数量',
    '大类预估需求数量',
    '调整原因',
    '调整时间',
    '缺项说明',
  ];
  return function CategoryDemand({ draft, update, active, onEditingChange }) {
    const result = react.useMemo(() => buildCategoryDemand(draft), [draft]);
    const [pending, setPending] = react.useState(null);
    const [reason, setReason] = react.useState('');
    const [error, setError] = react.useState('');
    const [notice, setNotice] = react.useState('');
    const triggerRef = react.useRef(null);
    const reasonRef = react.useRef(null);
    const fieldsRef = react.useRef(new Map());
    const keyOf = (row) => JSON.stringify([row.month, row.category]);
    const closeEditor = () => {
      setPending(null);
      setReason('');
      setError('');
      requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    };
    react.useEffect(() => {
      onEditingChange?.(pending !== null);
      return () => onEditingChange?.(false);
    }, [pending !== null, onEditingChange]);
    react.useEffect(() => {
      if (pending !== null) fieldsRef.current.values().next().value?.focus({ preventScroll: true });
    }, [pending !== null]);
    const apply = () => {
      const changes = Object.entries(pending ?? {});
      if (!changes.length) {
        closeEditor();
        return;
      }
      if (!reason.trim()) {
        setError('请填写本次调整原因。');
        reasonRef.current?.focus();
        return;
      }
      try {
        for (const [key, text] of changes) {
          if (text !== '' && (!Number.isFinite(Number(text)) || Number(text) < 0)) {
            const [month, category] = JSON.parse(key);
            setError(`${category} ${month}：请输入非负有限数，留空恢复系统值。`);
            fieldsRef.current.get(key)?.focus();
            return;
          }
        }
        let adjustments = draft.adjustments;
        for (const [key, text] of changes.sort(([a], [b]) => a.localeCompare(b))) {
          const [month, category] = JSON.parse(key);
          const row = result.rows.find((entry) => keyOf(entry) === key);
          if (!row) throw Error(`${category} ${month} 已不在当前范围，请取消后重新调整。`);
          if (text === '') {
            const candidate = buildCategoryDemand({
              ...draft,
              adjustments: {
                ...adjustments,
                categoryDemand: (adjustments?.categoryDemand ?? []).filter(
                  (entry) => keyOf(entry) !== key,
                ),
              },
            });
            adjustments = changeAdjustment(
              adjustments,
              'categoryDemand',
              {
                month,
                category,
                effectiveValue:
                  candidate.rows.find((entry) => keyOf(entry) === key)?.quantity ?? null,
              },
              true,
            );
          } else {
            adjustments = changeAdjustment(adjustments, 'categoryDemand', {
              month,
              category,
              quantity: Number(text),
              systemValue: row.systemQuantity,
              reason,
            });
          }
        }
        const candidate = buildCategoryDemand({ ...draft, adjustments });
        const introduced = candidate.adjustmentIssues.filter(
          (issue) => !result.adjustmentIssues.includes(issue),
        );
        if (introduced.length) throw Error(introduced.join('；'));
        update({ adjustments });
        closeEditor();
        setNotice('已保存到本地草稿');
      } catch (failure) {
        setError(failure.message);
      }
    };
    const rows = result.rows.map((row, index) => {
      const edit = draft.adjustments?.categoryDemand?.find(
        (entry) => entry.month === row.month && entry.category === row.category,
      );
      const basis = result.bases.find((entry) => entry.category === row.category);
      const missing = [];
      if (row.systemQuantity === null) {
        if (index % 4 < 2) {
          if (basis.baseActual === null) missing.push(`${basis.endMonth} 基期BI实绩缺失`);
          if (basis.actual === null)
            missing.push(`${result.recent[0]}至${basis.endMonth} BI实绩缺失或不完整`);
          if (basis.recentShare === null || basis.recentShare <= 0)
            missing.push(`${result.recent[0]}至${basis.endMonth} 历史同期占比缺失或合计为0`);
          if (row.share === null) missing.push(`${row.month} 历史同期占比缺失`);
          for (const period of result.historical.filter(
            (entry) =>
              entry.category === row.category &&
              entry.month > basis.endMonth &&
              entry.month <= row.month &&
              entry.mom === null,
          ))
            missing.push(`${period.month} 历史环比缺失`);
          if (basis.plan === null)
            missing.push(`${result.recent[0]}至${basis.endMonth} 计划量缺失或不完整`);
          else if (basis.achievementRate === null || basis.achievementRate <= 0)
            missing.push('近三月达成率缺失或为0');
        } else {
          if (row.chain === null) missing.push(`${row.month} 年度分月环比缺失或分母为0`);
          if (result.rows[index - 1].quantity === null) missing.push('上月有效需求缺失');
        }
      }
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
        大类预估需求数量: row.quantity ?? '',
        调整原因: edit?.reason ?? '',
        调整时间: edit?.at ?? '',
        缺项说明: missing.join('；'),
        操作: h(
          'div',
          { className: 'dc-demand-quantity' },
          pending !== null
            ? h('input', {
                ref: (element) => {
                  if (element) fieldsRef.current.set(keyOf(row), element);
                  else fieldsRef.current.delete(keyOf(row));
                },
                className: 'dc-batch-quantity',
                type: 'text',
                inputMode: 'decimal',
                'aria-label': `${row.category} ${row.month} 需求数量`,
                value: Object.hasOwn(pending, keyOf(row))
                  ? pending[keyOf(row)]
                  : row.quantity == null
                    ? ''
                    : String(Math.round(row.quantity)),
                placeholder:
                  row.systemQuantity == null ? '待补' : `系统值 ${Math.round(row.systemQuantity)}`,
                title: '留空恢复系统值',
                onChange: (event) => {
                  setPending({ ...pending, [keyOf(row)]: event.target.value });
                  setError('');
                },
              })
            : h(
                'span',
                {
                  className:
                    row.quantity == null
                      ? 'dc-demand-amount dc-demand-missing'
                      : 'dc-demand-amount',
                  title: missing.join('；') || (edit ? `已调整：${edit.reason}` : undefined),
                },
                row.quantity == null ? '待补' : String(Math.round(row.quantity)),
              ),
          edit && h('small', { className: 'dc-adjusted-mark' }, '已调整'),
        ),
      };
    });
    const summary = result.bases.map((basis) => ({
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
        {
          'aria-label': '大类预估需求数量',
          className: 'dc-card dc-results dc-demand-summary',
          onKeyDown: (event) => {
            if (pending === null || event.isComposing || event.nativeEvent?.isComposing) return;
            if (event.key === 'Escape') {
              event.preventDefault();
              closeEditor();
            } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              apply();
            }
          },
        },
        h(
          'div',
          { className: 'dc-card-head dc-demand-edit-bar' },
          h('h3', {}, '大类预估需求数量'),
          h('span', { className: 'dc-card-note' }, '单位：件'),
          pending === null
            ? h(
                'button',
                {
                  ref: triggerRef,
                  className: 'dc-primary',
                  disabled: !result.rows.length,
                  onClick: () => {
                    setPending({});
                    setReason('');
                    setError('');
                    setNotice('');
                  },
                },
                '调整',
              )
            : h(
                'div',
                { className: 'dc-batch-actions', role: 'group', 'aria-label': '大类需求调整' },
                h(
                  'label',
                  null,
                  '调整原因',
                  h('input', {
                    ref: reasonRef,
                    'aria-label': '批量调整原因',
                    'aria-required': true,
                    value: reason,
                    maxLength: 1000,
                    placeholder: '本次修改的原因',
                    onChange: (event) => {
                      setReason(event.target.value);
                      setError('');
                    },
                  }),
                ),
                h('span', { className: 'dc-card-note' }, '留空恢复系统值'),
                h('button', { className: 'dc-primary', onClick: apply }, '保存调整'),
                h('button', { onClick: closeEditor }, '取消'),
              ),
          error && h('p', { role: 'alert', className: 'dc-batch-feedback' }, error),
          !error &&
            notice &&
            h('span', { role: 'status', className: 'mps-edit-notice dc-batch-feedback' }, notice),
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
        'details',
        { className: 'dc-calculation-evidence' },
        h('summary', {}, '逐月测算依据'),
        h(
          'section',
          { 'aria-label': '逐月测算', className: 'dc-card dc-results dc-category-demand' },
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
              {
                onClick: () =>
                  downloadCsv(
                    `大类逐月测算-${draft.month}.csv`,
                    [...columns, ...detailColumns.filter((column) => !columns.includes(column))],
                    rows,
                  ),
              },
              '下载测算明细',
            ),
          ),
          result.adjustmentIssues.length > 0 &&
            h('p', { role: 'alert' }, `以下调整未生效：${result.adjustmentIssues.join('；')}`),
          h(
            'div',
            { className: 'dc-category-demand-main' },
            table(
              columns,
              rows,
              Object.fromEntries(
                [
                  ['① 环比法', '基期 × 环比链'],
                  ['② 占比法', '全年预估 × 占比'],
                  ['加权', '①②各占一半'],
                ].map(([name, formula]) => [
                  name,
                  h(react.Fragment, {}, name, h('small', {}, formula)),
                ]),
              ),
            ),
          ),
        ),
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
