import { buildMpsWorkflow } from './workflow-inputs.js';
import { changeAdjustment, quantityAdjustmentKey } from './local-draft.js';

const number = (value) =>
  value == null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(value);
const sum = (rows, field) =>
  rows.length && rows.every((row) => row[field] != null)
    ? rows.reduce((total, row) => total + row[field], 0)
    : null;
const known = (rows, field) => {
  const available = rows.filter((row) => row[field] != null);
  return available.length
    ? `${number(available.reduce((total, row) => total + row[field], 0))}${available.length < rows.length ? '（已知小计）' : ''}`
    : '—';
};
const comparison = (value) =>
  value?.quantity != null
    ? number(value.quantity)
    : value?.knownQuantity != null
      ? `${number(value.knownQuantity)}（已知小计）`
      : '—';
const matches = (row, entry) =>
  row.month === entry.month &&
  row.category === entry.category &&
  (entry.kind === 'categoryDemand' ||
    (row.group === entry.group &&
      (entry.kind === 'group' ||
        (row.code === entry.code && (entry.kind === 'sku' || row.base === entry.base)))));
const label = (entry) =>
  [
    entry.category,
    entry.kind !== 'categoryDemand' ? entry.group : '',
    entry.code,
    entry.base,
    entry.month,
  ]
    .filter(Boolean)
    .join(' ');

export function createProcessedDemand(react, { downloadCsv }) {
  const h = react.createElement;
  return function ProcessedDemand({
    draft,
    result,
    rows,
    update,
    relations,
    shipmentSnapshot,
    table,
    card,
  }) {
    const [editing, setEditing] = react.useState(null);
    const [error, setError] = react.useState('');
    const [expanded, setExpanded] = react.useState(() => new Set());
    const editorRef = react.useRef(null);
    react.useEffect(() => {
      if (editing) {
        editorRef.current?.scrollIntoView({ block: 'center' });
        editorRef.current?.querySelector('input')?.focus({ preventScroll: true });
      }
    }, [
      editing?.kind,
      editing?.month,
      editing?.category,
      editing?.group,
      editing?.code,
      editing?.base,
    ]);
    react.useEffect(() => {
      setEditing(null);
      setError('');
      setExpanded(new Set());
    }, [draft.id, draft.month]);
    const quantities = draft.adjustments?.quantities ?? [];
    const toggle = (key) => (event) => {
      const open = event.currentTarget.open;
      setExpanded((previous) => {
        if (previous.has(key) === open) return previous;
        const next = new Set(previous);
        if (open) next.add(key);
        else next.delete(key);
        return next;
      });
    };
    const months = result.months.slice(0, 3);
    const categories = [
      ...new Set(
        rows.map((row) => row.category).concat(result.categoryRows.map((row) => row.category)),
      ),
    ];
    const categoryValue = (category, month) =>
      result.categoryRows.find((row) => row.category === category && row.month === month);
    const saved = (entry) =>
      entry.kind === 'categoryDemand'
        ? draft.adjustments?.categoryDemand?.find(
            (item) => item.month === entry.month && item.category === entry.category,
          )
        : quantities.find((item) => quantityAdjustmentKey(item) === quantityAdjustmentKey(entry));
    const effective = (computed, entry) =>
      entry.kind === 'categoryDemand'
        ? (computed.categoryRows.find(
            (row) => row.month === entry.month && row.category === entry.category,
          )?.quantity ?? null)
        : sum(
            computed.rows.filter((row) => matches(row, entry)),
            'demand',
          );
    const save = (entry, undo = false) => {
      try {
        const kind = entry.kind === 'categoryDemand' ? 'categoryDemand' : 'quantities';
        const { kind: level, value: _value, ...fields } = entry;
        delete fields.effectiveValue;
        const input = { ...fields, ...(kind === 'quantities' ? { kind: level } : {}) };
        const provisional = changeAdjustment(draft.adjustments, kind, input, undo);
        const candidate = buildMpsWorkflow(
          { ...draft, adjustments: provisional },
          relations,
          shipmentSnapshot,
        );
        const introduced = (candidate.adjustmentIssues ?? []).filter(
          (issue) => !(result.adjustmentIssues ?? []).includes(issue),
        );
        if (introduced.length) throw Error(introduced.join('；'));
        if (
          kind === 'quantities' &&
          !undo &&
          !candidate.rows.some((row) => matches(row, entry) && row.quantityAdjusted)
        )
          throw Error(
            candidate.adjustmentIssues?.join('；') ||
              '当前分层数量未生效，请先补齐权重或撤销冲突调整。',
          );
        update({
          adjustments: undo
            ? changeAdjustment(
                draft.adjustments,
                kind,
                { ...input, effectiveValue: effective(candidate, entry) },
                true,
              )
            : provisional,
        });
        setEditing(null);
        setError('');
      } catch (failure) {
        setError(failure.message);
      }
    };
    const controls = (entry, systemValue, value) => {
      const fixed = saved(entry);
      const shareConflict =
        entry.kind !== 'categoryDemand' &&
        (draft.adjustments?.shares ?? []).some((item) =>
          result.rows.some(
            (row) =>
              row.id === item.rowId && row.month === entry.month && row.category === entry.category,
          ),
        );
      return h(
        'div',
        { className: 'wf-quantity-cell' },
        h('strong', null, number(value)),
        h('small', null, `系统 ${number(systemValue)}${fixed ? ' · 已固定' : ''}`),
        entry.kind !== 'categoryDemand' && !months.slice(0, 2).includes(entry.month)
          ? null
          : h(
              'div',
              { className: 'wf-actions' },
              h(
                'button',
                {
                  'aria-label': `调整数量 ${label(entry)}`,
                  disabled:
                    shareConflict ||
                    (entry.kind !== 'categoryDemand' && (!entry.group || value == null)),
                  title: shareConflict ? '同月大类已有占比调整，请先在拆分过程撤销占比调整' : '',
                  onClick: () => {
                    setEditing({
                      ...entry,
                      systemValue,
                      value: value == null ? '' : String(value),
                      reason: fixed?.reason ?? '',
                    });
                    setError('');
                  },
                },
                '调整',
              ),
              fixed &&
                h(
                  'button',
                  { 'aria-label': `撤销数量 ${label(entry)}`, onClick: () => save(entry, true) },
                  '撤销',
                ),
              shareConflict && h('small', null, '先撤销同月大类占比调整'),
            ),
      );
    };
    const summaryColumns = [
      '大类',
      `${result.shipmentMonth} 本月预估发货`,
      ...months
        .slice(0, 2)
        .flatMap((month, index) => [
          `M+${index + 1} ${month} 有效需求`,
          `M+${index + 1} ${month} 模型预测`,
        ]),
      `M+3 ${months[2]} 需求`,
      `M+4 ${result.months[3]} 库存参考`,
    ];
    const summaryRows = categories.map((category) => {
      const compare = result.categoryComparisons?.find((row) => row.category === category);
      const demand = (month) => {
        const row = categoryValue(category, month);
        return controls(
          { kind: 'categoryDemand', category, month },
          row?.systemQuantity,
          row?.quantity,
        );
      };
      return [
        category,
        comparison(compare?.shipment),
        ...months
          .slice(0, 2)
          .flatMap((month) => [demand(month), comparison(compare?.forecast[month])]),
        demand(months[2]),
        demand(result.months[3]),
      ];
    });
    const tree = (groupRows, kind, category, group, code, base) => {
      const key = JSON.stringify([kind, category, group, code, base]);
      const groupNames = [
        ...new Set(
          (draft.products ?? [])
            .filter((row) => row['大类'] === category && row['物料组'] === group)
            .map((row) => row['物料组名称'])
            .filter(Boolean),
        ),
      ];
      const name =
        kind === 'group'
          ? [group, groupNames.length === 1 ? groupNames[0] : ''].filter(Boolean).join(' ') ||
            '物料组缺失'
          : kind === 'sku'
            ? `${code} ${groupRows[0]?.name ?? ''}`
            : base || '基地缺失';
      return h(
        'details',
        {
          className: 'wf-demand-node',
          key,
          open: expanded.has(key),
          onToggle: toggle(key),
        },
        h(
          'summary',
          null,
          `${kind === 'group' ? '物料组' : kind === 'sku' ? 'SKU' : '基地'} · ${name}`,
        ),
        expanded.has(key) &&
          table(
            `${name} 逐月需求`,
            ['层级', ...months.map((month, index) => `M+${index + 1} ${month}`)],
            [
              [
                name,
                ...months.map((month) => {
                  const selected = result.rows.filter((row) =>
                    matches(row, { kind, month, category, group, code, base }),
                  );
                  return h(
                    'div',
                    null,
                    controls(
                      {
                        kind,
                        month,
                        category,
                        group,
                        ...(kind !== 'group' ? { code } : {}),
                        ...(kind === 'base-sku' ? { base } : {}),
                      },
                      sum(selected, 'systemDemand'),
                      sum(selected, 'demand'),
                    ),
                    sum(selected, 'demand') == null && h('small', null, known(selected, 'demand')),
                  );
                }),
              ],
            ],
          ),
        expanded.has(key) &&
          (kind === 'group'
            ? [...new Set(groupRows.map((row) => row.code))].map((code) =>
                tree(
                  groupRows.filter((row) => row.code === code),
                  'sku',
                  category,
                  group,
                  code,
                ),
              )
            : kind === 'sku'
              ? [...new Set(groupRows.map((row) => row.base))].map((base) =>
                  tree(
                    groupRows.filter((row) => row.base === base),
                    'base-sku',
                    category,
                    group,
                    code,
                    base,
                  ),
                )
              : h(
                  'p',
                  { className: 'wf-note' },
                  `源系列：${[...new Set(groupRows.map((row) => row.series))].filter(Boolean).join('、') || '缺失'}；${[...new Set(groupRows.flatMap((row) => row.missing?.demand ?? []))].join('；') || '有效数量已计算'}`,
                )),
      );
    };
    const exportSummary = () => {
      const columns = [
        '评估版本',
        ...summaryColumns,
        '本月预估发货完整性',
        'M+1模型完整性',
        'M+2模型完整性',
      ];
      downloadCsv(
        `${draft.month}-大类需求总表.csv`,
        columns,
        categories.map((category) => {
          const compare = result.categoryComparisons?.find((row) => row.category === category);
          const values = [
            category,
            compare?.shipment.quantity ?? compare?.shipment.knownQuantity,
            ...months
              .slice(0, 2)
              .flatMap((month) => [
                categoryValue(category, month)?.quantity,
                compare?.forecast[month]?.quantity ?? compare?.forecast[month]?.knownQuantity,
              ]),
            categoryValue(category, months[2])?.quantity,
            categoryValue(category, result.months[3])?.quantity,
          ];
          return {
            评估版本: draft.name,
            本月预估发货完整性:
              compare?.shipment.quantity != null
                ? '完整'
                : compare?.shipment.knownQuantity != null
                  ? '已知小计'
                  : '缺项',
            'M+1模型完整性':
              compare?.forecast[months[0]]?.quantity != null ? '完整' : '缺项或已知小计',
            'M+2模型完整性':
              compare?.forecast[months[1]]?.quantity != null ? '完整' : '缺项或已知小计',
            ...Object.fromEntries(summaryColumns.map((column, index) => [column, values[index]])),
          };
        }),
      );
    };
    return h(
      react.Fragment,
      null,
      card(
        '大类需求总表',
        h(
          react.Fragment,
          null,
          table('大类需求总表', summaryColumns, summaryRows),
          h(
            'p',
            { className: 'wf-note' },
            '本月预估发货沿用第二步同版有效值。模型预测按月单列对照，不参与加权需求。已知小计不代表完整合计。',
          ),
        ),
        h('button', { onClick: exportSummary }, '下载大类需求总表'),
      ),
      card(
        '加工后的需求',
        h(
          react.Fragment,
          null,
          h(
            'p',
            { className: 'wf-note' },
            '按大类、物料组、SKU、基地展开。数量按完整对象展示和调整，筛选仅缩小查找范围。M+1、M+2支持固定数量；父级调整保留固定下级，其余按有效拆分权重重摊。数量固定与同月大类占比调整互斥，请先撤销原调整。M+3按M+2有效大类需求和年度分月环比延展，使用本月拆分来源；M+4仅供库存参考。',
          ),
          categories.map((category) =>
            h(
              'details',
              {
                key: category,
                className: 'wf-demand-node',
                open: expanded.has(category),
                onToggle: toggle(category),
              },
              h('summary', null, `大类 · ${category}`),
              ...(expanded.has(category)
                ? [
                    ...new Set(
                      rows.filter((row) => row.category === category).map((row) => row.group),
                    ),
                  ].map((group) =>
                    tree(
                      rows.filter((row) => row.category === category && row.group === group),
                      'group',
                      category,
                      group,
                    ),
                  )
                : []),
            ),
          ),
          !rows.length &&
            h('p', { className: 'wf-note' }, '当前筛选暂无基地SKU输入，展开来源诊断查看缺项。'),
        ),
      ),
      error && h('p', { role: 'alert', className: 'wf-note wf-unavailable' }, error),
      editing &&
        h(
          'fieldset',
          { ref: editorRef, className: 'wf-quantity-editor', 'aria-label': '分层需求数量调整' },
          h('legend', null, label(editing)),
          h('p', null, `系统数量 ${number(editing.systemValue)}；下级固定值保留，未固定项重摊。`),
          h(
            'label',
            null,
            '有效需求数量',
            h('input', {
              type: 'number',
              min: 0,
              step: 'any',
              'aria-label': '有效需求数量',
              value: editing.value,
              onChange: (event) => setEditing({ ...editing, value: event.target.value }),
            }),
          ),
          h(
            'label',
            null,
            '数量调整原因',
            h('input', {
              'aria-label': '数量调整原因',
              value: editing.reason,
              maxLength: 1000,
              onChange: (event) => setEditing({ ...editing, reason: event.target.value }),
            }),
          ),
          h(
            'button',
            {
              onClick: () => {
                if (editing.value.trim() === '') {
                  setError('请填写数量，留空不代表0。');
                  return;
                }
                save({ ...editing, quantity: Number(editing.value) });
              },
            },
            '应用数量调整',
          ),
          h(
            'button',
            {
              onClick: () => {
                setEditing(null);
                setError('');
              },
            },
            '取消数量调整',
          ),
        ),
      h(
        'details',
        { className: 'wf-disclosure' },
        h(
          'summary',
          null,
          `数量调整与撤销记录（${draft.adjustments?.history?.filter((item) => item.kind === 'quantities').length ?? 0}）`,
        ),
        table(
          '数量调整记录',
          ['对象', '操作', '系统值', '有效值', '原因', '时间'],
          (draft.adjustments?.history ?? [])
            .filter((item) => item.kind === 'quantities')
            .map((item) => [
              item.key,
              item.action === 'undo' ? '撤销' : '调整',
              number(item.systemValue),
              number(item.value),
              item.reason,
              item.at,
            ]),
        ),
        quantities.length > 0 &&
          table(
            '当前固定数量',
            ['对象', '固定数量', '原因', '时间', '操作'],
            quantities.map((item) => [
              label(item),
              number(item.quantity),
              item.reason,
              item.at,
              h(
                'button',
                { 'aria-label': `撤销固定数量 ${label(item)}`, onClick: () => save(item, true) },
                '撤销',
              ),
            ]),
          ),
      ),
    );
  };
}
