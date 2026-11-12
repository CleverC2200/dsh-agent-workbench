import { buildCategoryDemand, categoryDemandMissing } from './category-demand.js';
import { changeAdjustment } from './local-draft.js';

export function createShipmentScopeNotice(react, { downloadCsv }) {
  const h = react.createElement;
  return function ShipmentScopeNotice({ scope, month }) {
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
      基地: row.base,
      产品编码: row.code,
      产品名称: row.name,
      大类: row.category || '待确认',
      缺项: row.missing.join('；'),
      需要补齐的数据: row.missingFields.length
        ? row.missingFields.map((field) => fields[field] ?? field).join('；')
        : '有效发货速度或人工整月预估；分类缺失时补齐产品关系',
      处理说明: '核对源数据后重新同步，或在本地调整中填写已确认值。未补齐前不参与本次大类需求和后续拆分，未补零。',
      来源: row.source || '本月预估发货的同版输入',
    }));
    const columns = Object.keys(rows[0]);
    return h(
      'section',
      { className: 'dc-card', 'aria-label': '待定单品异常' },
      h(
        'p',
        { role: 'status', className: 'dc-card-note' },
        `部分可计算：${scope.excluded.length}条基地＋单品记录单列异常，其余有效记录继续计算。数量只代表参与范围，不代表完整大类。`,
      ),
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
      h(
        'button',
        { onClick: () => downloadCsv(`待定单品异常-${month}.csv`, columns, rows) },
        '下载待定单品异常CSV',
      ),
      h(
        'details',
        null,
        h('summary', null, `查看待定单品异常（${rows.length}条）`),
        h(
          'div',
          { className: 'dc-table-wrap' },
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
  const ShipmentScopeNotice = createShipmentScopeNotice(react, { downloadCsv: downloadExceptions });
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
    '缺项说明',
  ];
  return function CategoryDemand({ draft, shipmentSnapshot, update, active, onEditingChange }) {
    const result = react.useMemo(
      () => buildCategoryDemand(draft, shipmentSnapshot),
      [draft, shipmentSnapshot],
    );
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
            const candidate = buildCategoryDemand(
              {
                ...draft,
                adjustments: {
                  ...adjustments,
                  categoryDemand: (adjustments?.categoryDemand ?? []).filter(
                    (entry) => keyOf(entry) !== key,
                  ),
                },
              },
              shipmentSnapshot,
            );
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
        const candidate = buildCategoryDemand({ ...draft, adjustments }, shipmentSnapshot);
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
      const missing = categoryDemandMissing(result, row);
      return {
        大类: row.category,
        月份: `${row.month}（M+${(index % 4) + 1}）`,
        历史平均环比: row.mom ?? '',
        年度环比: row.chain ?? '',
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
          row.coverage === 'partial' && h('small', { className: 'dc-adjusted-mark' }, '部分可计算'),
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
      {
        ...result,
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
      },
      '大类逐月需求计算',
      active,
    );
    return h(
      react.Fragment,
      {},
      h(ShipmentScopeNotice, { scope: result.shipmentScope, month: draft.month }),
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
          h(
            'p',
            { className: 'dc-card-note' },
            `${result.rows[0]?.baseMonth ?? ''}为统计基月M。M+1、M+2使用历史环比，M+3、M+4使用年度环比；后月只承接前月环比测算量。四个月均计算两法平均量，仅M+1再与销售校正量各占一半，M+2至M+4直接使用两法平均量。M+4仅作库存参考。`,
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
                  ['① 环比法', '本月预估发货*环比'],
                  ['② 占比法', '全年预估 × 占比'],
                  ['两法平均量', '①②各占一半'],
                  ['销售校正量', '销售提报量×达成率'],
                  ['加权', '仅M+1：两法平均量与销售校正量各占一半'],
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
